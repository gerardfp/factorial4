// Server-side PNG sprite store with 3-layer override hierarchy:
//   1. sprites/default/             -> Base theme (all 37 base PNGs + manifest.json)
//   2. sprites/themes/<themeId>/    -> Preset theme PNG & config overrides (only files each theme overrides!)
//   3. sprites/custom/              -> User PNG edits & creations (global + per-theme custom/themes/<themeId>/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllDefaultSprites, buildAllThemeOverrides } from './defaultSprites.js';
import { isValidPngBuffer, readPngDimensions } from './pngEncoder.js';
import {
  BATTLE_THEMES,
  CHAR_MAX_SPRITE_SIZE,
  MAX_PLAYERS,
  WEAPON_MAX_PER_TYPE,
  normalizeCountRange,
} from '../shared/constants.js';
import { sanitizeCustomObstacle, sanitizeCustomWeapon } from '../shared/themeSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const SPRITES_DIR = path.join(ROOT_DIR, 'sprites');
export const DEFAULT_SPRITES_DIR = path.join(SPRITES_DIR, 'default');
export const THEMES_SPRITES_DIR = path.join(SPRITES_DIR, 'themes');
export const CUSTOM_SPRITES_DIR = path.join(SPRITES_DIR, 'custom');
export const CUSTOM_THEMES_DIR = path.join(CUSTOM_SPRITES_DIR, 'themes');

const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_SPRITES_DIR, 'manifest.json');
const CUSTOM_MANIFEST_PATH = path.join(CUSTOM_SPRITES_DIR, 'manifest.json');

function safeFileForKey(key) {
  const clean = String(key || '')
    .replace(/:/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 48);
  if (!clean) throw new Error('Invalid sprite key');
  return `${clean}.png`;
}

function safeThemeId(raw) {
  const clean = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
  return clean || 'campo';
}

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function ensureDefaultSprites(forceRewrite = false) {
  fs.mkdirSync(DEFAULT_SPRITES_DIR, { recursive: true });
  fs.mkdirSync(THEMES_SPRITES_DIR, { recursive: true });
  fs.mkdirSync(CUSTOM_SPRITES_DIR, { recursive: true });
  fs.mkdirSync(CUSTOM_THEMES_DIR, { recursive: true });

  // 1. Base theme PNGs -> sprites/default/
  const defaults = buildAllDefaultSprites();
  const manifest = {};

  for (const item of defaults) {
    const filePath = path.join(DEFAULT_SPRITES_DIR, item.file);
    if (forceRewrite || !fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, item.png);
    }
    manifest[item.key] = {
      key: item.key,
      file: item.file,
      url: `/sprites/default/${item.file}`,
      category: item.category,
      id: item.id,
      name: item.name,
      w: item.w,
      h: item.h,
      frames: item.frames,
      fps: item.fps,
      maxW: item.maxW,
      maxH: item.maxH,
      isDefault: true,
    };
  }
  writeJsonAtomic(DEFAULT_MANIFEST_PATH, manifest);

  // 2. Theme override PNGs & configs -> sprites/themes/<themeId>/
  const themeDefs = buildAllThemeOverrides();
  for (const [themeId, def] of Object.entries(themeDefs)) {
    const tDir = path.join(THEMES_SPRITES_DIR, themeId);
    fs.mkdirSync(tDir, { recursive: true });
    const themeJsonPath = path.join(tDir, 'theme.json');
    const savedTheme = readJsonSafe(themeJsonPath, {});
    const updateTheme = forceRewrite || (def.revision || 0) > (savedTheme.revision || 0);
    const spritesMap = {};

    for (const item of def.sprites) {
      const fp = path.join(tDir, item.file);
      if (updateTheme || !fs.existsSync(fp)) {
        fs.writeFileSync(fp, item.png);
      }
      spritesMap[item.key] = {
        key: item.key,
        file: item.file,
        url: `/sprites/themes/${themeId}/${item.file}`,
        category: item.category,
        id: item.id,
        name: item.name,
        w: item.w,
        h: item.h,
        frames: item.frames,
        fps: item.fps,
        maxW: item.maxW,
        maxH: item.maxH,
        isDefault: true,
        theme: themeId,
      };
    }

    if (updateTheme || !fs.existsSync(themeJsonPath)) {
      writeJsonAtomic(themeJsonPath, {
        id: themeId,
        revision: def.revision || 0,
        extends: 'default',
        config: def.config,
        obstacles: def.obstacles || savedTheme.obstacles || {},
        weapons: def.weapons || savedTheme.weapons || {},
        sprites: spritesMap,
      });
    }
  }

  if (!fs.existsSync(CUSTOM_MANIFEST_PATH)) {
    writeJsonAtomic(CUSTOM_MANIFEST_PATH, {});
  }

  return manifest;
}

function readCustomDirManifest(dirPath, urlPrefix) {
  const manifestPath = path.join(dirPath, 'manifest.json');
  const raw = readJsonSafe(manifestPath, {});
  const out = {};
  for (const [key, meta] of Object.entries(raw)) {
    if (!meta || !meta.file) continue;
    const base = path.basename(meta.file);
    if (!fs.existsSync(path.join(dirPath, base))) continue;
    out[key] = {
      ...meta,
      url: `${urlPrefix}/${base}?v=${meta.updatedAt || 1}`,
    };
  }
  return out;
}

function slugifyThemeName(rawName, fallback = 'tema_custom') {
  const slug = String(rawName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return slug || fallback;
}

function getOriginalThemesCatalog() {
  if (!fs.existsSync(DEFAULT_MANIFEST_PATH)) {
    ensureDefaultSprites();
  }

  const themes = {
    campo: {
      id: 'campo',
      extends: 'default',
      baseTheme: 'campo',
      isOriginal: true,
      isDerived: false,
      isCustomNew: false,
      hasOriginal: true,
      config: { ...BATTLE_THEMES.campo, baseTheme: 'campo' },
      obstacles: {},
      weapons: {},
      sprites: {}, // Base theme uses sprites/default/ directly with zero overrides
    },
  };

  if (fs.existsSync(THEMES_SPRITES_DIR)) {
    for (const entry of fs.readdirSync(THEMES_SPRITES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const themeId = entry.name;
      const tDir = path.join(THEMES_SPRITES_DIR, themeId);
      const tJson = readJsonSafe(path.join(tDir, 'theme.json'), null);
      if (!tJson) continue;

      const validSprites = {};
      for (const [key, meta] of Object.entries(tJson.sprites || {})) {
        if (!meta || !meta.file) continue;
        const base = path.basename(meta.file);
        if (!fs.existsSync(path.join(tDir, base))) continue;
        validSprites[key] = {
          ...meta,
          url: `/sprites/themes/${themeId}/${base}`,
          theme: themeId,
        };
      }

      // Parse & validate theme-defined custom obstacles
      const validObstacles = {};
      for (const [obsId, rawObs] of Object.entries(tJson.obstacles || {})) {
        const clean = sanitizeCustomObstacle(obsId, rawObs);
        if (!clean) continue;
        validObstacles[obsId] = clean;

        // Auto-register referenced obstacle PNG sprite if not already in validSprites
        const registerObsPng = (spriteFile, sprKey, label) => {
          if (!spriteFile || validSprites[sprKey]) return;
          const base = path.basename(spriteFile);
          const fp = path.join(tDir, base);
          if (!fs.existsSync(fp)) return;
          const dims = readPngDimensions(fs.readFileSync(fp));
          validSprites[sprKey] = {
            key: sprKey,
            file: base,
            url: `/sprites/themes/${themeId}/${base}`,
            category: 'obstacles',
            id: sprKey.slice(4),
            name: `Obstáculo: ${label}`,
            w: dims ? dims.width : clean.visW,
            h: dims ? dims.height : clean.visH,
            frames: 1,
            fps: 6,
            maxW: 80,
            maxH: 80,
            isDefault: true,
            theme: themeId,
          };
        };
        registerObsPng(clean.sprite || `obs_${obsId}.png`, `obs:${obsId}`, clean.name);
        if (clean.damagedSprite) {
          registerObsPng(clean.damagedSprite, `obs:${obsId}_dmg`, `${clean.name} (Dañado)`);
        }
      }

      // Parse & validate theme-defined custom weapons
      const validWeapons = {};
      for (const [wId, rawW] of Object.entries(tJson.weapons || {})) {
        const clean = sanitizeCustomWeapon(wId, rawW);
        if (!clean) continue;
        validWeapons[wId] = clean;

        const wKey = `weapon:${wId}`;
        if (!validSprites[wKey]) {
          const base = path.basename(clean.sprite || `weapon_${wId}.png`);
          const fp = path.join(tDir, base);
          if (fs.existsSync(fp)) {
            const dims = readPngDimensions(fs.readFileSync(fp));
            validSprites[wKey] = {
              key: wKey,
              file: base,
              url: `/sprites/themes/${themeId}/${base}`,
              category: 'weapons',
              id: wId,
              name: `Arma: ${clean.name}`,
              w: dims ? dims.width : 12,
              h: dims ? dims.height : 12,
              frames: 1,
              fps: 6,
              maxW: 32,
              maxH: 32,
              isDefault: true,
              theme: themeId,
            };
          }
        }
      }

      const rawCfg = tJson.config || BATTLE_THEMES[themeId] || BATTLE_THEMES.campo;
      themes[themeId] = {
        id: themeId,
        extends: tJson.extends || 'default',
        baseTheme: themeId,
        isOriginal: true,
        isDerived: false,
        isCustomNew: false,
        hasOriginal: true,
        config: { ...rawCfg, id: themeId, baseTheme: themeId },
        obstacles: validObstacles,
        weapons: validWeapons,
        sprites: validSprites,
      };
    }
  }

  return themes;
}

export function getThemesCatalog() {
  const originals = getOriginalThemesCatalog();
  const themes = {};
  for (const [id, entry] of Object.entries(originals)) {
    themes[id] = {
      ...entry,
      config: { ...entry.config },
      obstacles: { ...entry.obstacles },
      weapons: { ...entry.weapons },
      sprites: { ...entry.sprites },
    };
  }

  // Overlay derived theme configs & custom new themes from sprites/custom/themes/<id>/ (NEVER mutating originals!)
  if (fs.existsSync(CUSTOM_THEMES_DIR)) {
    for (const entry of fs.readdirSync(CUSTOM_THEMES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const themeId = entry.name;
      const cDir = path.join(CUSTOM_THEMES_DIR, themeId);
      const tJson = readJsonSafe(path.join(cDir, 'theme.json'), null);
      const cSprites = readCustomDirManifest(cDir, `/sprites/custom/themes/${themeId}`);
      const hasCustomSprites = Object.keys(cSprites).length > 0;

      if (!tJson && !hasCustomSprites) continue;

      if (themes[themeId]) {
        // Derived override of an original theme (keeps original files on disk 100% untouched!)
        const orig = themes[themeId];
        const mergedCfg = tJson?.config
          ? { ...orig.config, ...tJson.config, id: themeId, baseTheme: orig.baseTheme }
          : orig.config;
        themes[themeId] = {
          ...orig,
          isDerived: true,
          isOriginal: true,
          isCustomNew: false,
          hasOriginal: true,
          baseTheme: orig.baseTheme,
          config: mergedCfg,
        };
      } else if (tJson) {
        // Brand-new derived theme created by user (inherits sprites, obstacles, weapons & ground style from baseTheme)
        const baseId = safeThemeId(tJson.baseTheme || tJson.extends || 'campo');
        const baseEntry = originals[baseId] || originals.campo;
        const mergedCfg = {
          ...baseEntry.config,
          ...(tJson.config || {}),
          id: themeId,
          baseTheme: baseEntry.id,
        };
        const mergedObstacles = { ...baseEntry.obstacles };
        for (const [obsId, rawObs] of Object.entries(tJson.obstacles || {})) {
          const clean = sanitizeCustomObstacle(obsId, rawObs);
          if (clean) mergedObstacles[obsId] = clean;
        }
        const mergedWeapons = { ...baseEntry.weapons };
        for (const [wId, rawW] of Object.entries(tJson.weapons || {})) {
          const clean = sanitizeCustomWeapon(wId, rawW);
          if (clean) mergedWeapons[wId] = clean;
        }
        themes[themeId] = {
          id: themeId,
          extends: baseEntry.id,
          baseTheme: baseEntry.id,
          isOriginal: false,
          isDerived: true,
          isCustomNew: true,
          hasOriginal: false,
          config: mergedCfg,
          obstacles: mergedObstacles,
          weapons: mergedWeapons,
          sprites: { ...baseEntry.sprites },
        };
      }
    }
  }

  return themes;
}

function sanitizeSavedThemeConfig(rawCfg = {}, baseCfg = BATTLE_THEMES.campo, customName = '', customDesc = '') {
  const cleanName = String(customName || rawCfg.name || baseCfg.name || 'Tema')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 28);
  const cleanDesc = String(customDesc !== undefined ? customDesc : (rawCfg.description ?? baseCfg.description ?? ''))
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 90);

  const out = {
    name: cleanName || baseCfg.name || 'Tema',
    description: cleanDesc,
    borderColor: baseCfg.borderColor,
    accentColor: baseCfg.accentColor,
  };

  if (rawCfg.defaultObstacles && typeof rawCfg.defaultObstacles === 'object') {
    const cleanObs = {};
    for (const [k, v] of Object.entries(rawCfg.defaultObstacles)) {
      if (!/^[a-z0-9_]{2,24}$/.test(k)) continue;
      cleanObs[k] = normalizeCountRange(v, 0, 0, 0, 30);
    }
    out.defaultObstacles = cleanObs;
  } else if (baseCfg.defaultObstacles) {
    out.defaultObstacles = { ...baseCfg.defaultObstacles };
  }

  if (rawCfg.defaultWeaponCounts && typeof rawCfg.defaultWeaponCounts === 'object') {
    const cleanWpns = {};
    for (const [k, v] of Object.entries(rawCfg.defaultWeaponCounts)) {
      if (!/^[a-z0-9_]{2,24}$/.test(k)) continue;
      cleanWpns[k] = normalizeCountRange(v, 0, 0, 0, WEAPON_MAX_PER_TYPE);
    }
    out.defaultWeaponCounts = cleanWpns;
  }

  if (rawCfg.defaultMedkitCount !== undefined) {
    out.defaultMedkitCount = normalizeCountRange(rawCfg.defaultMedkitCount, 6, 11, 0, 30);
  }

  if (rawCfg.defaultFillBots !== undefined) {
    out.defaultFillBots = Boolean(rawCfg.defaultFillBots);
  }

  if (rawCfg.defaultMaxBots !== undefined && Number.isFinite(Number(rawCfg.defaultMaxBots))) {
    out.defaultMaxBots = Math.max(0, Math.min(MAX_PLAYERS - 1, Math.round(Number(rawCfg.defaultMaxBots))));
  }

  return out;
}

function copyThemeSpriteOverrides(srcThemeId, dstThemeId) {
  if (!srcThemeId || !dstThemeId || srcThemeId === dstThemeId) return;
  const srcDir = path.join(CUSTOM_THEMES_DIR, srcThemeId);
  if (!fs.existsSync(srcDir)) return;
  const srcManifest = readCustomDirManifest(srcDir, `/sprites/custom/themes/${srcThemeId}`);
  const keys = Object.keys(srcManifest);
  if (keys.length === 0) return;

  const dstDir = path.join(CUSTOM_THEMES_DIR, dstThemeId);
  fs.mkdirSync(dstDir, { recursive: true });
  const dstManifest = readJsonSafe(path.join(dstDir, 'manifest.json'), {});
  const now = Date.now();

  for (const key of keys) {
    const meta = srcManifest[key];
    const base = path.basename(meta.file);
    const srcFp = path.join(srcDir, base);
    if (!fs.existsSync(srcFp)) continue;
    fs.copyFileSync(srcFp, path.join(dstDir, base));
    dstManifest[key] = {
      ...meta,
      theme: dstThemeId,
      url: `/sprites/custom/themes/${dstThemeId}/${base}?v=${now}`,
      updatedAt: now,
    };
  }
  writeJsonAtomic(path.join(dstDir, 'manifest.json'), dstManifest);
}

// Save a theme configuration as either:
//  - mode === 'derive': same theme name, ALWAYS stored as a derivative in sprites/custom/themes/<id>/ (NEVER overwrites originals!)
//  - mode === 'new': brand-new derived theme with a unique ID in sprites/custom/themes/<newId>/ (NEVER overwrites originals!)
export function saveDerivedTheme(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload de tema inválido');
  }

  const originals = getOriginalThemesCatalog();
  const currentCatalog = getThemesCatalog();

  const sourceId = safeThemeId(payload.sourceTheme || payload.theme || 'campo');
  const sourceEntry = currentCatalog[sourceId] || originals.campo;
  const baseThemeId = originals[sourceEntry.baseTheme] ? sourceEntry.baseTheme : originals[sourceId] ? sourceId : 'campo';
  const baseOriginal = originals[baseThemeId] || originals.campo;

  const mode = payload.mode === 'new' ? 'new' : 'derive';
  let targetId;
  let targetName;
  let targetDesc;

  if (mode === 'new') {
    const rawNewName = String(payload.name || '').replace(/[<>]/g, '').trim().slice(0, 28);
    if (!rawNewName) {
      throw new Error('Debes indicar un nombre para el nuevo tema');
    }
    const baseSlug = slugifyThemeName(rawNewName, `${baseThemeId}_custom`);
    // Guarantee targetId NEVER collides with any original theme or existing custom theme!
    let candidate = baseSlug;
    let suffix = 2;
    while (
      originals[candidate] ||
      BATTLE_THEMES[candidate] ||
      fs.existsSync(path.join(THEMES_SPRITES_DIR, candidate)) ||
      fs.existsSync(path.join(CUSTOM_THEMES_DIR, candidate))
    ) {
      candidate = `${baseSlug.slice(0, 17)}_${suffix++}`;
    }
    targetId = candidate;
    targetName = rawNewName;
    targetDesc =
      payload.description !== undefined && String(payload.description).trim()
        ? String(payload.description).trim()
        : sourceEntry.config?.description || baseOriginal.config?.description || '';
  } else {
    // Same-name derivative: ALWAYS writes into sprites/custom/themes/<sourceId>/, NEVER into sprites/themes/ or sprites/default/!
    targetId = sourceId;
    targetName = sourceEntry.config?.name || baseOriginal.config?.name || sourceId;
    targetDesc =
      payload.description !== undefined
        ? String(payload.description)
        : sourceEntry.config?.description || baseOriginal.config?.description || '';
  }

  const targetDir = path.join(CUSTOM_THEMES_DIR, targetId);
  fs.mkdirSync(targetDir, { recursive: true });

  // Copy custom sprite overrides from source theme when creating a new derived theme
  if (mode === 'new' && payload.copySourceSprites !== false && sourceId !== targetId) {
    copyThemeSpriteOverrides(sourceId, targetId);
  }

  const existingCustomJson = readJsonSafe(path.join(targetDir, 'theme.json'), {});
  const mergedInputCfg = {
    ...(sourceEntry.config || {}),
    ...(existingCustomJson.config || {}),
    ...(payload.config && typeof payload.config === 'object' ? payload.config : {}),
  };
  const cleanConfig = sanitizeSavedThemeConfig(mergedInputCfg, baseOriginal.config, targetName, targetDesc);

  const savedJson = {
    id: targetId,
    extends: baseThemeId,
    baseTheme: baseThemeId,
    isDerived: true,
    isCustomNew: !originals[targetId],
    config: {
      ...cleanConfig,
      id: targetId,
      baseTheme: baseThemeId,
    },
    updatedAt: Date.now(),
  };

  writeJsonAtomic(path.join(targetDir, 'theme.json'), savedJson);

  const updatedCatalog = getSpritesCatalog();
  return {
    themeId: targetId,
    baseTheme: baseThemeId,
    isDerived: true,
    isCustomNew: !originals[targetId],
    theme: updatedCatalog.themes[targetId],
    catalog: updatedCatalog,
  };
}

// Restore a derived original theme back to its untouched original, OR delete a user-created custom theme
export function restoreOrDeleteCustomTheme(themeId) {
  const cleanId = safeThemeId(themeId);
  const originals = getOriginalThemesCatalog();
  const cDir = path.join(CUSTOM_THEMES_DIR, cleanId);

  if (fs.existsSync(cDir)) {
    fs.rmSync(cDir, { recursive: true, force: true });
  }

  const isOriginal = Boolean(originals[cleanId]);
  const catalog = getSpritesCatalog();
  return {
    themeId: cleanId,
    restoredToOriginal: isOriginal,
    deletedCustom: !isOriginal,
    fallbackThemeId: isOriginal ? cleanId : 'campo',
    catalog,
  };
}

export function getSpritesCatalog() {
  if (!fs.existsSync(DEFAULT_MANIFEST_PATH)) {
    ensureDefaultSprites();
  }

  const defaults = readJsonSafe(DEFAULT_MANIFEST_PATH, {});
  const themes = getThemesCatalog();
  const custom = readCustomDirManifest(CUSTOM_SPRITES_DIR, '/sprites/custom');

  const customThemes = {};
  if (fs.existsSync(CUSTOM_THEMES_DIR)) {
    for (const entry of fs.readdirSync(CUSTOM_THEMES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const themeId = entry.name;
      const tCustom = readCustomDirManifest(
        path.join(CUSTOM_THEMES_DIR, themeId),
        `/sprites/custom/themes/${themeId}`
      );
      if (Object.keys(tCustom).length > 0) {
        customThemes[themeId] = tCustom;
      }
    }
  }

  return { defaults, themes, custom, customThemes };
}

export function saveCustomSprite(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload inválido');
  }

  const key = String(payload.key || '').trim();
  if (!key || !/^[a-zA-Z0-9_:-]{2,48}$/.test(key)) {
    throw new Error('Clave de sprite inválida');
  }

  const defaults = readJsonSafe(DEFAULT_MANIFEST_PATH, {});
  const defMeta = defaults[key] || null;

  const category = defMeta ? defMeta.category : String(payload.category || 'characters');
  const allowedCategories = new Set(['characters', 'weapons', 'obstacles', 'groundTiles', 'misc']);
  if (!allowedCategories.has(category)) {
    throw new Error('Categoría de sprite inválida');
  }

  const maxW = defMeta ? defMeta.maxW : category === 'characters' ? CHAR_MAX_SPRITE_SIZE : category === 'obstacles' ? 80 : 64;
  const maxH = defMeta ? defMeta.maxH : category === 'characters' ? CHAR_MAX_SPRITE_SIZE : category === 'obstacles' ? 80 : 64;

  const w = Math.round(Number(payload.w) || 0);
  const h = Math.round(Number(payload.h) || 0);
  const frames = Math.max(1, Math.min(16, Math.round(Number(payload.frames) || 1)));
  const fps = Math.max(1, Math.min(24, Math.round(Number(payload.fps) || 8)));

  if (w < 4 || h < 4 || w > maxW || h > maxH) {
    throw new Error(`Dimensiones fuera de límite (máx ${maxW}×${maxH}px)`);
  }

  const rawDataUrl = String(payload.pngDataUrl || payload.pngBase64 || '');
  const base64Part = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
  const pngBuf = Buffer.from(base64Part, 'base64');

  if (!isValidPngBuffer(pngBuf)) {
    throw new Error('El archivo enviado no es un PNG válido');
  }

  const dims = readPngDimensions(pngBuf);
  if (!dims || dims.width < 4 || dims.height < 4 || dims.width > maxW * 16 || dims.height > maxH) {
    throw new Error('Dimensiones PNG inválidas');
  }

  // Characters always save globally in sprites/custom/; ALL theme non-character edits save in sprites/custom/themes/<theme>/ (derived, never overwriting originals!)
  const reqTheme = safeThemeId(payload.theme);
  const isThemedOverride = category !== 'characters';
  const targetDir = isThemedOverride ? path.join(CUSTOM_THEMES_DIR, reqTheme) : CUSTOM_SPRITES_DIR;
  const manifestPath = path.join(targetDir, 'manifest.json');
  const urlPrefix = isThemedOverride ? `/sprites/custom/themes/${reqTheme}` : '/sprites/custom';

  fs.mkdirSync(targetDir, { recursive: true });
  const file = safeFileForKey(key);
  fs.writeFileSync(path.join(targetDir, file), pngBuf);

  const customManifest = readJsonSafe(manifestPath, {});
  const id = defMeta ? defMeta.id : payload.id !== undefined ? payload.id : key.replace(/^[^:]+:/, '');
  const cleanName = String(payload.name || (defMeta ? defMeta.name : key))
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 32);

  const updatedAt = Date.now();
  const entry = {
    key,
    file,
    url: `${urlPrefix}/${file}?v=${updatedAt}`,
    category,
    id,
    name: cleanName || key,
    w,
    h,
    frames,
    fps,
    maxW,
    maxH,
    isDefault: Boolean(defMeta),
    theme: isThemedOverride ? reqTheme : null,
    updatedAt,
  };

  customManifest[key] = entry;
  writeJsonAtomic(manifestPath, customManifest);
  return entry;
}

export function restoreSprite(key, theme = 'campo') {
  const cleanKey = String(key || '').trim();
  const cleanTheme = safeThemeId(theme);
  const isChar = cleanKey.startsWith('char:');

  // 1. Delete per-theme custom override if applicable
  if (!isChar) {
    const tDir = path.join(CUSTOM_THEMES_DIR, cleanTheme);
    const tManPath = path.join(tDir, 'manifest.json');
    const tMan = readJsonSafe(tManPath, {});
    if (tMan[cleanKey]) {
      const fp = path.join(tDir, path.basename(tMan[cleanKey].file));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      delete tMan[cleanKey];
      writeJsonAtomic(tManPath, tMan);
    }
    // Also clean legacy global override for campo if present
    if (cleanTheme === 'campo') {
      const customManifest = readJsonSafe(CUSTOM_MANIFEST_PATH, {});
      if (customManifest[cleanKey]) {
        const fp = path.join(CUSTOM_SPRITES_DIR, path.basename(customManifest[cleanKey].file));
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        delete customManifest[cleanKey];
        writeJsonAtomic(CUSTOM_MANIFEST_PATH, customManifest);
      }
    }
  } else {
    // 2. Delete global character custom override
    const customManifest = readJsonSafe(CUSTOM_MANIFEST_PATH, {});
    if (customManifest[cleanKey]) {
      const fp = path.join(CUSTOM_SPRITES_DIR, path.basename(customManifest[cleanKey].file));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      delete customManifest[cleanKey];
      writeJsonAtomic(CUSTOM_MANIFEST_PATH, customManifest);
    }
  }

  // Resolve restored fallback: theme override PNG if exists, else base default PNG
  const themes = getThemesCatalog();
  const defaults = readJsonSafe(DEFAULT_MANIFEST_PATH, {});
  const themeSprite = !isChar && themes[cleanTheme]?.sprites?.[cleanKey];
  const fallbackMeta = themeSprite || defaults[cleanKey] || null;

  return {
    restoredToDefault: Boolean(fallbackMeta),
    defaultMeta: fallbackMeta,
  };
}

export function restoreAllSprites(theme = null) {
  if (theme) {
    const tId = safeThemeId(theme);
    const tDir = path.join(CUSTOM_THEMES_DIR, tId);
    if (fs.existsSync(tDir)) {
      for (const f of fs.readdirSync(tDir)) {
        if (f.endsWith('.png')) fs.unlinkSync(path.join(tDir, f));
      }
      writeJsonAtomic(path.join(tDir, 'manifest.json'), {});
    }
    return getSpritesCatalog();
  }

  // Clear all global custom PNGs
  if (fs.existsSync(CUSTOM_SPRITES_DIR)) {
    for (const f of fs.readdirSync(CUSTOM_SPRITES_DIR)) {
      if (f.endsWith('.png')) fs.unlinkSync(path.join(CUSTOM_SPRITES_DIR, f));
    }
  }
  writeJsonAtomic(CUSTOM_MANIFEST_PATH, {});

  // Clear all per-theme custom PNGs
  if (fs.existsSync(CUSTOM_THEMES_DIR)) {
    for (const entry of fs.readdirSync(CUSTOM_THEMES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const tDir = path.join(CUSTOM_THEMES_DIR, entry.name);
      for (const f of fs.readdirSync(tDir)) {
        if (f.endsWith('.png')) fs.unlinkSync(path.join(tDir, f));
      }
      writeJsonAtomic(path.join(tDir, 'manifest.json'), {});
    }
  }

  return getSpritesCatalog();
}
