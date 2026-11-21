// Main client entry: Join/Create Battle menus, themed battlefields, character-only vs full Sprite Editor
import {
  PALETTE,
  SKIN_PRESETS,
  WEAPONS,
  LOOT_WEAPONS,
  DEFAULT_WEAPON_RANGES,
  WEAPON_MAX_PER_TYPE,
  BATTLE_THEMES,
  DEFAULT_BATTLE_CONFIG,
  defaultRangeFromCount,
  PLAYER_MAX_HP,
  PLAYER_SPEED,
  PLAYER_RADIUS,
  MAX_PLAYERS,
  MAP_WIDTH,
  MAP_HEIGHT,
  ARENA_MIN_X,
  ARENA_MAX_X,
  ARENA_MIN_Y,
  ARENA_MAX_Y,
} from '../shared/constants.js';
import { clamp, dist, resolveCircleRect } from '../shared/collision.js';
import { createSpriteAtlas } from './sprites.js';
import { RetroAudio } from './audio.js';
import { PixelRenderer } from './renderer.js';
import { InputManager } from './input.js';
import { SpriteEditor } from './editor.js';

const atlas = createSpriteAtlas();
const audio = new RetroAudio();

// DOM references
const canvas = document.getElementById('game-canvas');
const renderer = new PixelRenderer(canvas, atlas);

const lobbyOverlay = document.getElementById('lobby-overlay');
const joinListOverlay = document.getElementById('join-list-overlay');
const createOverlay = document.getElementById('create-overlay');
const endOverlay = document.getElementById('end-overlay');

const skinPreviewCanvas = document.getElementById('skin-preview');
const skinPreviewCtx = skinPreviewCanvas.getContext('2d');
skinPreviewCtx.imageSmoothingEnabled = false;
const skinNameEl = document.getElementById('skin-name');
const skinSelectorEl = document.getElementById('skin-selector');

const inputName = document.getElementById('input-name');
const btnOpenEditor = document.getElementById('btn-open-editor');
const btnJoinBattle = document.getElementById('btn-join-battle');
const btnCreateBattle = document.getElementById('btn-create-battle');
const lobbyStatus = document.getElementById('lobby-status');

// Join Battle List modal DOM
const openBattlesList = document.getElementById('open-battles-list');
const btnRefreshBattles = document.getElementById('btn-refresh-battles');
const btnJoinCreateDefault = document.getElementById('btn-join-create-default');
const btnJoinBack = document.getElementById('btn-join-back');

// Create Battle modal DOM
const btnCreateEditor = document.getElementById('btn-create-editor');
const createThemeList = document.getElementById('create-theme-list');
const createThemeDots = document.getElementById('create-theme-dots');
const createThemeCounter = document.getElementById('create-theme-counter');
const createThemeStatePill = document.getElementById('create-theme-state-pill');
const btnSaveTheme = document.getElementById('btn-save-theme');
const btnRestoreTheme = document.getElementById('btn-restore-theme');
const btnThemePrev = document.getElementById('btn-theme-prev');
const btnThemeNext = document.getElementById('btn-theme-next');
const createWeaponsSliders = document.getElementById('create-weapons-sliders');
const createMedkitSliderEl = document.getElementById('create-medkit-slider');
const createObstaclesSliders = document.getElementById('create-obstacles-sliders');
const cfgFillBots = document.getElementById('cfg-fill-bots');
const cfgMaxBots = document.getElementById('cfg-max-bots');
const cfgMaxBotsVal = document.getElementById('cfg-max-bots-val');
const cfgMaxBotsRow = document.getElementById('cfg-max-bots-row');
const btnCreateDefaults = document.getElementById('btn-create-defaults');
const btnCreateBack = document.getElementById('btn-create-back');
const btnCreateLaunch = document.getElementById('btn-create-launch');

// Save Theme modal DOM
const saveThemeOverlay = document.getElementById('save-theme-overlay');
const saveThemeSubtitle = document.getElementById('save-theme-subtitle');
const saveThemeModeDerive = document.getElementById('save-theme-mode-derive');
const saveThemeModeNew = document.getElementById('save-theme-mode-new');
const saveThemeDeriveLabel = document.getElementById('save-theme-derive-label');
const saveThemeNewFields = document.getElementById('save-theme-new-fields');
const saveThemeNewName = document.getElementById('save-theme-new-name');
const saveThemeNewDesc = document.getElementById('save-theme-new-desc');
const saveThemeStatus = document.getElementById('save-theme-status');
const btnSaveThemeCancel = document.getElementById('btn-save-theme-cancel');
const btnSaveThemeConfirm = document.getElementById('btn-save-theme-confirm');

// Victory / End modal DOM
const endTitle = document.getElementById('end-title');
const endWinnerLine = document.getElementById('end-winner-line');
const rankingBody = document.getElementById('ranking-body');
const btnRematch = document.getElementById('btn-rematch');
const btnBackLobby = document.getElementById('btn-back-lobby');

// Client state
let ws = null;
let myId = null;
const rawSavedSkin = localStorage.getItem('campal_skin') || '0';
let selectedSkin = /^\d+$/.test(rawSavedSkin)
  ? Math.max(0, Math.min(SKIN_PRESETS.length - 1, Number.parseInt(rawSavedSkin, 10)))
  : rawSavedSkin;

const savedPortalName = window.F4Player?.getSavedName?.() || '';
const defaultName = savedPortalName || localStorage.getItem('campal_name') || `Luchador${Math.floor(10 + Math.random() * 89)}`;
inputName.value = defaultName;
if (window.F4Player) {
  window.F4Player.mountNavBar();
  window.F4Player.ensureName().then((n) => {
    if (n) inputName.value = n.slice(0, 14);
  });
  window.addEventListener('f4:namechange', (ev) => {
    if (ev.detail?.name) inputName.value = ev.detail.name.slice(0, 14);
  });
  inputName.addEventListener('change', () => {
    const v = inputName.value.trim();
    if (v) window.F4Player.setName(v);
  });
}

let gameState = 'menu'; // 'menu' | 'waiting' | 'ready' | 'playing' | 'ended'
let spectating = false;
let selectedCreateTheme = DEFAULT_BATTLE_CONFIG.theme;

const world = {
  myId: null,
  theme: DEFAULT_BATTLE_CONFIG.theme,
  baseTheme: DEFAULT_BATTLE_CONFIG.theme,
  obstacleTypes: null,
  weapons: null,
  totalFighters: MAX_PLAYERS,
  aliveCount: MAX_PLAYERS,
  bannerText: '',
  obstacles: new Map(),
  loot: new Map(),
  players: new Map(),
  projectiles: [],
  fires: [],
  corpses: [],
};

// Input manager
const input = new InputManager(canvas, (action) => {
  if (action === 'unlock_audio') {
    audio.unlock();
  } else if (action === 'mute') {
    audio.toggleMute();
  }
});

// Skin selector setup (includes default skins + custom characters saved as PNGs on server)
function renderSkinSelector() {
  const entries = atlas.getAllCharacterEntries();
  if (!entries.some((e) => e.id === selectedSkin)) {
    selectedSkin = 0;
  }
  skinSelectorEl.innerHTML = '';
  for (const entry of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `skin-swatch${entry.id === selectedSkin ? ' active' : ''}`;
    btn.style.backgroundColor = entry.swatchColor;
    btn.title = entry.name;
    if (!entry.isDefault) {
      btn.textContent = '★';
      btn.style.color = PALETTE.INK;
      btn.style.fontSize = '12px';
      btn.style.fontWeight = 'bold';
    }
    btn.addEventListener('click', () => {
      audio.unlock();
      selectedSkin = entry.id;
      localStorage.setItem('campal_skin', String(selectedSkin));
      renderSkinSelector();
    });
    skinSelectorEl.appendChild(btn);
  }
  const active = entries.find((e) => e.id === selectedSkin) || entries[0];
  skinNameEl.textContent = active ? active.name : 'Bandido';
}

renderSkinSelector();

// Integrated Piskel-style Sprite & Animation Editor
const spriteEditor = new SpriteEditor(
  atlas,
  () => {
    atlas.invalidateThemePreviewCache();
    renderSkinSelector();
    renderThemeCarousel(false);
    renderCreateElementSliders(selectedCreateTheme, false);
    renderer.rebuildGround(renderer.mapSeed);
  },
  (editorInstance) => {
    openSaveThemeModal({ fromEditor: true, editorInstance });
  }
);

// Main Menu: ONLY allows editing the player's character!
btnOpenEditor?.addEventListener('click', () => {
  audio.unlock();
  spriteEditor.open(`char:${selectedSkin}`, 'characters', world.theme);
});

// Create Battle screen: Full Sprite Editor (weapons, obstacles, backgrounds/tiles, characters, misc)
btnCreateEditor?.addEventListener('click', () => {
  audio.unlock();
  spriteEditor.open('obs:rock', 'all', selectedCreateTheme);
});

// === CREATE BATTLE CONFIGURATOR (THEME CAROUSEL + DUAL-HANDLE MIN/MAX SLIDERS + BOTS 1-23) ===
const BASE_OBSTACLE_FIELDS = [
  { id: 'rock', label: 'Rocas', max: 20, spriteKey: 'rock' },
  { id: 'walls', label: 'Muros (H / V)', max: 22, spriteKey: 'wall_h' },
  { id: 'wreck', label: 'Coches / Chatarra', max: 10, spriteKey: 'wreck' },
  { id: 'crate', label: 'Cajas destructibles', max: 20, spriteKey: 'crate' },
  { id: 'barrel', label: 'Bidones explosivos', max: 16, spriteKey: 'barrel' },
  { id: 'bush', label: 'Arbustos (sigilo)', max: 18, spriteKey: 'bush' },
];

const weaponRangeControls = new Map();
const obstacleRangeControls = new Map();
let medkitRangeControl = null;

function createMiniIconCanvas(srcCanvas) {
  if (!srcCanvas) return null;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  c.className = 'dual-label-icon';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const scale = Math.min(16 / srcCanvas.width, 16 / srcCanvas.height);
  const dw = Math.max(1, Math.round(srcCanvas.width * scale));
  const dh = Math.max(1, Math.round(srcCanvas.height * scale));
  ctx.drawImage(srcCanvas, Math.floor((16 - dw) / 2), Math.floor((16 - dh) / 2), dw, dh);
  return c;
}

function createDualRangeControl({ label, iconCanvas = null, minLimit = 0, maxLimit = 20, minVal = 0, maxVal = 0, isCustom = false }) {
  const row = document.createElement('div');
  row.className = 'dual-row';

  const labelWrap = document.createElement('div');
  labelWrap.className = 'dual-label';
  if (iconCanvas) {
    labelWrap.appendChild(iconCanvas);
  }
  const labelSpan = document.createElement('span');
  labelSpan.className = `dual-label-text${isCustom ? ' is-custom' : ''}`;
  labelSpan.textContent = label;
  labelSpan.title = label;
  labelWrap.appendChild(labelSpan);

  const rangeWrap = document.createElement('div');
  rangeWrap.className = 'dual-range';

  const track = document.createElement('div');
  track.className = 'dual-range-track';

  const fill = document.createElement('div');
  fill.className = 'dual-range-fill';

  const loInit = Math.max(minLimit, Math.min(maxLimit, Math.round(minVal)));
  const hiInit = Math.max(loInit, Math.min(maxLimit, Math.round(maxVal)));

  const minInput = document.createElement('input');
  minInput.type = 'range';
  minInput.className = 'dual-min';
  minInput.min = String(minLimit);
  minInput.max = String(maxLimit);
  minInput.step = '1';
  minInput.value = String(loInit);
  minInput.setAttribute('aria-label', `${label} mínimo`);

  const maxInput = document.createElement('input');
  maxInput.type = 'range';
  maxInput.className = 'dual-max';
  maxInput.min = String(minLimit);
  maxInput.max = String(maxLimit);
  maxInput.step = '1';
  maxInput.value = String(hiInit);
  maxInput.setAttribute('aria-label', `${label} máximo`);

  const valEl = document.createElement('span');
  valEl.className = 'dual-val';

  const syncVisuals = () => {
    const lo = Number(minInput.value);
    const hi = Number(maxInput.value);
    const span = Math.max(1, maxLimit - minLimit);
    const leftPct = ((lo - minLimit) / span) * 100;
    const rightPct = ((hi - minLimit) / span) * 100;
    fill.style.left = `${leftPct}%`;
    fill.style.width = `${Math.max(0, rightPct - leftPct)}%`;

    // Prevent stacked thumbs from blocking each other at upper values
    if (lo >= maxLimit || (lo === hi && lo > (minLimit + maxLimit) / 2)) {
      minInput.style.zIndex = '5';
      maxInput.style.zIndex = '4';
    } else {
      minInput.style.zIndex = '4';
      maxInput.style.zIndex = '5';
    }

    valEl.textContent = lo === hi ? String(lo) : `${lo}–${hi}`;
    valEl.classList.toggle('is-zero', lo === 0 && hi === 0);
  };

  minInput.addEventListener('input', () => {
    if (Number(minInput.value) > Number(maxInput.value)) {
      minInput.value = maxInput.value;
    }
    syncVisuals();
  });

  maxInput.addEventListener('input', () => {
    if (Number(maxInput.value) < Number(minInput.value)) {
      maxInput.value = minInput.value;
    }
    syncVisuals();
  });

  rangeWrap.append(track, fill, minInput, maxInput);
  row.append(labelWrap, rangeWrap, valEl);
  syncVisuals();

  return {
    el: row,
    getValue() {
      const lo = Number(minInput.value);
      const hi = Number(maxInput.value);
      return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
    },
    setValue(lo, hi) {
      const a = Math.max(minLimit, Math.min(maxLimit, Math.round(lo)));
      const b = Math.max(a, Math.min(maxLimit, Math.round(hi)));
      minInput.value = String(a);
      maxInput.value = String(b);
      syncVisuals();
    },
  };
}

function syncBotControls() {
  const enabled = cfgFillBots.checked;
  cfgMaxBots.disabled = !enabled;
  cfgMaxBotsRow.classList.toggle('disabled', !enabled);
  cfgMaxBotsVal.textContent = enabled ? String(cfgMaxBots.value) : '0';
}

cfgFillBots.addEventListener('change', syncBotControls);
cfgMaxBots.addEventListener('input', syncBotControls);

function getAvailableThemes() {
  const merged = {};
  for (const [id, cfg] of Object.entries(BATTLE_THEMES)) {
    merged[id] = cfg;
  }
  const serverThemes = atlas.serverCatalog?.themes || {};
  for (const [id, entry] of Object.entries(serverThemes)) {
    if (entry && entry.config) {
      merged[id] = { ...(merged[id] || {}), ...entry.config, id };
    }
  }
  return merged;
}

function getSelectedThemeEntry(themeId) {
  return atlas.serverCatalog?.themes?.[themeId] || null;
}

let carouselRenderToken = 0;

function selectCreateTheme(themeId, scrollIntoView = true) {
  const allThemes = getAvailableThemes();
  if (!allThemes[themeId]) themeId = DEFAULT_BATTLE_CONFIG.theme;
  selectedCreateTheme = themeId;
  world.theme = themeId;
  world.baseTheme = allThemes[themeId]?.baseTheme || themeId;
  atlas.applyTheme(themeId).then(() => {
    renderCreateElementSliders(themeId, false);
  });
  renderCreateElementSliders(themeId, true);
  renderThemeCarousel(scrollIntoView);
}

function getThemeFlags(themeId) {
  const entry = getSelectedThemeEntry(themeId);
  const hasCustomSprites = Boolean(
    atlas.serverCatalog?.customThemes?.[themeId] &&
    Object.keys(atlas.serverCatalog.customThemes[themeId]).length > 0
  );
  const isCustomNew = Boolean(entry?.isCustomNew);
  const isDerived = Boolean(entry?.isDerived || hasCustomSprites || isCustomNew);
  return { isDerived, isCustomNew };
}

function updateSelectedThemeHeaderControls(themeId) {
  const { isDerived, isCustomNew } = getThemeFlags(themeId);
  if (createThemeStatePill) {
    if (isCustomNew) {
      createThemeStatePill.textContent = 'NUEVO TEMA';
      createThemeStatePill.classList.remove('hidden');
      createThemeStatePill.classList.add('is-custom-new');
    } else if (isDerived) {
      createThemeStatePill.textContent = 'DERIVADO';
      createThemeStatePill.classList.remove('hidden', 'is-custom-new');
    } else {
      createThemeStatePill.classList.add('hidden');
    }
  }
  if (btnRestoreTheme) {
    if (isCustomNew) {
      btnRestoreTheme.textContent = '🗑 ELIMINAR TEMA';
      btnRestoreTheme.classList.remove('hidden');
    } else if (isDerived) {
      btnRestoreTheme.textContent = '↺ RESTAURAR ORIGINAL';
      btnRestoreTheme.classList.remove('hidden');
    } else {
      btnRestoreTheme.classList.add('hidden');
    }
  }
}

function renderThemeCarousel(scrollActive = false) {
  if (!createThemeList) return;
  const token = ++carouselRenderToken;
  const themes = Object.values(getAvailableThemes());
  if (!themes.some((t) => t.id === selectedCreateTheme) && themes.length > 0) {
    selectedCreateTheme = themes[0].id;
  }
  const activeIdx = Math.max(0, themes.findIndex((t) => t.id === selectedCreateTheme));

  if (createThemeCounter) {
    createThemeCounter.textContent = `${activeIdx + 1} / ${themes.length}`;
  }
  updateSelectedThemeHeaderControls(selectedCreateTheme);

  createThemeList.innerHTML = '';
  if (createThemeDots) createThemeDots.innerHTML = '';

  let activeSlideEl = null;

  themes.forEach((theme) => {
    const isActive = theme.id === selectedCreateTheme;
    const { isDerived, isCustomNew } = getThemeFlags(theme.id);
    const slide = document.createElement('button');
    slide.type = 'button';
    slide.className = `theme-slide${isActive ? ' active' : ''}`;
    slide.setAttribute('role', 'option');
    slide.setAttribute('aria-selected', String(isActive));

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'theme-thumb-wrap';
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'theme-thumb';
    thumbCanvas.width = 320;
    thumbCanvas.height = 184;
    thumbWrap.appendChild(thumbCanvas);

    if (isDerived || isCustomNew) {
      const dBadge = document.createElement('span');
      dBadge.className = `theme-derived-badge${isCustomNew ? ' is-custom-new' : ''}`;
      dBadge.textContent = isCustomNew ? 'NUEVO' : 'DERIVADO';
      thumbWrap.appendChild(dBadge);
    }

    if (isActive) {
      const badge = document.createElement('span');
      badge.className = 'theme-active-badge';
      badge.textContent = 'ACTIVO';
      thumbWrap.appendChild(badge);
    }

    const title = document.createElement('span');
    title.className = 'theme-card-title';
    title.textContent = theme.name || theme.id;

    const desc = document.createElement('span');
    desc.className = 'theme-card-desc';
    desc.textContent = theme.description || '';

    slide.append(thumbWrap, title, desc);
    slide.addEventListener('click', () => {
      audio.unlock();
      selectCreateTheme(theme.id, true);
    });

    createThemeList.appendChild(slide);
    if (isActive) activeSlideEl = slide;

    // Render crisp miniature battlefield capture asynchronously using that theme's real sprites
    atlas.loadThemePreviewAssets(theme.id).then((previewAssets) => {
      if (token !== carouselRenderToken) return;
      renderer.renderThemeThumbnail(theme.id, thumbCanvas, previewAssets);
    });

    if (createThemeDots) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `theme-dot${isActive ? ' active' : ''}`;
      dot.title = theme.name || theme.id;
      dot.setAttribute('aria-label', `Seleccionar tema ${theme.name || theme.id}`);
      dot.addEventListener('click', () => {
        audio.unlock();
        selectCreateTheme(theme.id, true);
      });
      createThemeDots.appendChild(dot);
    }
  });

  if (scrollActive && activeSlideEl && typeof activeSlideEl.scrollIntoView === 'function') {
    requestAnimationFrame(() => {
      activeSlideEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }
}

function stepThemeCarousel(delta) {
  const themes = Object.values(getAvailableThemes());
  if (themes.length === 0) return;
  const curIdx = Math.max(0, themes.findIndex((t) => t.id === selectedCreateTheme));
  const nextIdx = (curIdx + delta + themes.length) % themes.length;
  selectCreateTheme(themes[nextIdx].id, true);
}

btnThemePrev?.addEventListener('click', () => {
  audio.unlock();
  stepThemeCarousel(-1);
});

btnThemeNext?.addEventListener('click', () => {
  audio.unlock();
  stepThemeCarousel(1);
});

function resolveRangeForSlider(rawVal, fallbackMin, fallbackMax, absMax) {
  if (rawVal && typeof rawVal === 'object' && (rawVal.min !== undefined || rawVal.max !== undefined)) {
    const a = clamp(Math.round(Number(rawVal.min ?? rawVal.max) || 0), 0, absMax);
    const b = clamp(Math.round(Number(rawVal.max ?? rawVal.min) || 0), 0, absMax);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
    return defaultRangeFromCount(rawVal, absMax);
  }
  return { min: fallbackMin, max: fallbackMax };
}

function renderCreateElementSliders(themeId, loadThemeDefaults = true) {
  const allThemes = getAvailableThemes();
  const themeCfg = allThemes[themeId] || BATTLE_THEMES.campo;
  const themeEntry = getSelectedThemeEntry(themeId);
  const customObs = themeEntry?.obstacles || {};
  const customWeapons = themeEntry?.weapons || {};
  const defObs = themeCfg.defaultObstacles || BATTLE_THEMES.campo.defaultObstacles;
  const savedThemeWeapons = themeCfg.defaultWeaponCounts || null;

  // 1. Per-weapon dual-handle min/max sliders (loads theme's saved weapon ranges if present)
  const prevWeapons = new Map();
  if (!loadThemeDefaults || !savedThemeWeapons) {
    for (const [k, ctrl] of weaponRangeControls.entries()) {
      prevWeapons.set(k, ctrl.getValue());
    }
  }
  weaponRangeControls.clear();
  createWeaponsSliders.innerHTML = '';

  const customWeaponIds = Object.keys(customWeapons).filter((id) => customWeapons[id]?.isCustomThemeWeapon);
  const allWeaponIds = [...LOOT_WEAPONS, ...customWeaponIds];
  for (const wId of allWeaponIds) {
    const isCustom = Boolean(customWeapons[wId]?.isCustomThemeWeapon);
    const spec = customWeapons[wId] || WEAPONS[wId];
    const baseDefRange = DEFAULT_WEAPON_RANGES[wId] || { min: 2, max: 5 };
    const themeRange =
      loadThemeDefaults && savedThemeWeapons && savedThemeWeapons[wId] !== undefined
        ? resolveRangeForSlider(savedThemeWeapons[wId], baseDefRange.min, baseDefRange.max, WEAPON_MAX_PER_TYPE)
        : null;
    const saved = themeRange || prevWeapons.get(wId) || baseDefRange;
    const ctrl = createDualRangeControl({
      label: isCustom ? `★ ${spec ? spec.name : wId}` : spec ? spec.name : wId,
      iconCanvas: createMiniIconCanvas(atlas.weapons[wId]),
      minLimit: 0,
      maxLimit: WEAPON_MAX_PER_TYPE,
      minVal: saved.min,
      maxVal: saved.max,
      isCustom,
    });
    weaponRangeControls.set(wId, ctrl);
    createWeaponsSliders.appendChild(ctrl.el);
  }

  // 2. Medkits dual-handle min/max slider
  const medDef = DEFAULT_BATTLE_CONFIG.medkitRange;
  const themeMedkit =
    loadThemeDefaults && themeCfg.defaultMedkitCount !== undefined
      ? resolveRangeForSlider(themeCfg.defaultMedkitCount, medDef.min, medDef.max, 25)
      : null;
  const prevMedkit = themeMedkit || (medkitRangeControl ? medkitRangeControl.getValue() : medDef);
  createMedkitSliderEl.innerHTML = '';
  medkitRangeControl = createDualRangeControl({
    label: 'Botiquines',
    iconCanvas: createMiniIconCanvas(atlas.weapons.medkit),
    minLimit: 0,
    maxLimit: 25,
    minVal: prevMedkit.min,
    maxVal: prevMedkit.max,
  });
  createMedkitSliderEl.appendChild(medkitRangeControl.el);

  // 3. Obstacle dual-handle min/max sliders (base + theme custom obstacles; supports scalar or saved {min,max})
  const prevObs = new Map();
  if (!loadThemeDefaults) {
    for (const [k, ctrl] of obstacleRangeControls.entries()) {
      prevObs.set(k, ctrl.getValue());
    }
  }
  obstacleRangeControls.clear();
  createObstaclesSliders.innerHTML = '';

  for (const field of BASE_OBSTACLE_FIELDS) {
    let defRange;
    if (field.id === 'walls') {
      const wh = defObs.wall_h;
      const wv = defObs.wall_v;
      if (wh && typeof wh === 'object' && wv && typeof wv === 'object') {
        defRange = {
          min: clamp((Number(wh.min) || 0) + (Number(wv.min) || 0), 0, field.max),
          max: clamp((Number(wh.max) || 0) + (Number(wv.max) || 0), 0, field.max),
        };
      } else {
        defRange = defaultRangeFromCount((Number(wh) || 0) + (Number(wv) || 0), field.max);
      }
    } else {
      defRange = resolveRangeForSlider(defObs[field.id], 0, 0, field.max);
    }
    const saved = prevObs.get(field.id) || defRange;
    const ctrl = createDualRangeControl({
      label: field.label,
      iconCanvas: createMiniIconCanvas(atlas.obstacles[field.spriteKey]),
      minLimit: 0,
      maxLimit: field.max,
      minVal: saved.min,
      maxVal: saved.max,
    });
    obstacleRangeControls.set(field.id, ctrl);
    createObstaclesSliders.appendChild(ctrl.el);
  }

  for (const [obsId, spec] of Object.entries(customObs)) {
    if (!spec || !spec.isCustomThemeObj) continue;
    const maxC = spec.maxCount || 12;
    const defRange =
      defObs[obsId] !== undefined
        ? resolveRangeForSlider(defObs[obsId], 0, 0, maxC)
        : defaultRangeFromCount(spec.defaultCount ?? 3, maxC);
    const saved = prevObs.get(obsId) || defRange;
    const ctrl = createDualRangeControl({
      label: `★ ${spec.name || obsId}`,
      iconCanvas: createMiniIconCanvas(atlas.obstacles[obsId]),
      minLimit: 0,
      maxLimit: maxC,
      minVal: saved.min,
      maxVal: saved.max,
      isCustom: true,
    });
    obstacleRangeControls.set(obsId, ctrl);
    createObstaclesSliders.appendChild(ctrl.el);
  }

  // 4. Bots settings if saved on derived/custom theme
  if (loadThemeDefaults) {
    if (themeCfg.defaultFillBots !== undefined) {
      cfgFillBots.checked = Boolean(themeCfg.defaultFillBots);
    }
    if (themeCfg.defaultMaxBots !== undefined && themeCfg.defaultMaxBots > 0) {
      cfgMaxBots.value = String(clamp(Math.round(themeCfg.defaultMaxBots), 1, MAX_PLAYERS - 1));
    }
    syncBotControls();
  }
}

function resetCreateFormToDefaults() {
  selectedCreateTheme = DEFAULT_BATTLE_CONFIG.theme;
  world.theme = selectedCreateTheme;
  atlas.applyTheme(selectedCreateTheme);

  weaponRangeControls.clear();
  obstacleRangeControls.clear();
  medkitRangeControl = null;

  cfgFillBots.checked = DEFAULT_BATTLE_CONFIG.fillBots;
  cfgMaxBots.value = String(DEFAULT_BATTLE_CONFIG.maxBots);
  syncBotControls();

  renderCreateElementSliders(selectedCreateTheme, true);
  renderThemeCarousel(false);
}

resetCreateFormToDefaults();

function collectCreateBattleConfig() {
  const weaponCounts = {};
  const allowedWeapons = [];
  for (const [wId, ctrl] of weaponRangeControls.entries()) {
    const r = ctrl.getValue();
    weaponCounts[wId] = r;
    if (r.max > 0) allowedWeapons.push(wId);
  }

  const obstacles = {};
  for (const [obsId, ctrl] of obstacleRangeControls.entries()) {
    const r = ctrl.getValue();
    if (obsId === 'walls') {
      obstacles.wall_h = { min: Math.ceil(r.min / 2), max: Math.ceil(r.max / 2) };
      obstacles.wall_v = { min: Math.floor(r.min / 2), max: Math.floor(r.max / 2) };
    } else {
      obstacles[obsId] = r;
    }
  }

  const medkitCount = medkitRangeControl
    ? medkitRangeControl.getValue()
    : { ...DEFAULT_BATTLE_CONFIG.medkitRange };

  const fillBots = cfgFillBots.checked;
  const maxBots = fillBots ? clamp(Math.round(Number(cfgMaxBots.value) || 1), 1, MAX_PLAYERS - 1) : 0;

  return {
    theme: selectedCreateTheme,
    fillBots,
    maxBots,
    weaponCounts,
    allowedWeapons,
    medkitCount,
    obstacles,
  };
}

// === SAVE THEME (SAME NAME AS DERIVATIVE VS. NEW THEME — NEVER OVERWRITES ORIGINALS!) ===
let saveThemeContext = { fromEditor: false, editorInstance: null };

function syncSaveThemeModeUI() {
  const isNew = Boolean(saveThemeModeNew?.checked);
  saveThemeNewFields?.classList.toggle('hidden', !isNew);
  if (isNew) {
    saveThemeNewName?.focus();
  }
}

function openSaveThemeModal(ctx = { fromEditor: false, editorInstance: null }) {
  if (!saveThemeOverlay) return;
  saveThemeContext = ctx;
  const sourceId = ctx.fromEditor && ctx.editorInstance ? ctx.editorInstance.previewTheme : selectedCreateTheme;
  const allThemes = getAvailableThemes();
  const themeCfg = allThemes[sourceId] || BATTLE_THEMES.campo;
  const themeName = themeCfg.name || sourceId;

  if (saveThemeSubtitle) {
    saveThemeSubtitle.textContent = `BASE: ${themeName.toUpperCase()} · EL ORIGINAL NUNCA SE MODIFICA`;
  }
  if (saveThemeDeriveLabel) {
    saveThemeDeriveLabel.textContent = `Guardar con el mismo nombre ("${themeName}") como derivado`;
  }
  if (saveThemeModeDerive) saveThemeModeDerive.checked = true;
  if (saveThemeModeNew) saveThemeModeNew.checked = false;
  if (saveThemeNewName) {
    saveThemeNewName.value = '';
    saveThemeNewName.placeholder = `Ej. ${themeName} Custom`;
  }
  if (saveThemeNewDesc) {
    saveThemeNewDesc.value = themeCfg.description || '';
  }
  if (saveThemeStatus) saveThemeStatus.textContent = '';

  syncSaveThemeModeUI();
  saveThemeOverlay.classList.remove('hidden');
}

function closeSaveThemeModal() {
  saveThemeOverlay?.classList.add('hidden');
  saveThemeContext = { fromEditor: false, editorInstance: null };
}

saveThemeModeDerive?.addEventListener('change', syncSaveThemeModeUI);
saveThemeModeNew?.addEventListener('change', syncSaveThemeModeUI);
btnSaveThemeCancel?.addEventListener('click', closeSaveThemeModal);
saveThemeNewName?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSaveThemeConfirm?.click();
  else if (e.key === 'Escape') closeSaveThemeModal();
});

btnSaveTheme?.addEventListener('click', () => {
  audio.unlock();
  openSaveThemeModal({ fromEditor: false, editorInstance: null });
});

btnSaveThemeConfirm?.addEventListener('click', async () => {
  const mode = saveThemeModeNew?.checked ? 'new' : 'derive';
  const newName = saveThemeNewName?.value.trim() || '';
  const newDesc = saveThemeNewDesc?.value.trim() || '';

  if (mode === 'new' && !newName) {
    if (saveThemeStatus) saveThemeStatus.textContent = 'Escribe un nombre para el nuevo tema.';
    saveThemeNewName?.focus();
    return;
  }

  btnSaveThemeConfirm.disabled = true;
  if (saveThemeStatus) saveThemeStatus.textContent = 'Guardando tema derivado...';

  try {
    const sourceTheme =
      saveThemeContext.fromEditor && saveThemeContext.editorInstance
        ? saveThemeContext.editorInstance.previewTheme
        : selectedCreateTheme;
    const cfg = collectCreateBattleConfig();
    const res = await fetch('/api/themes/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        sourceTheme,
        name: mode === 'new' ? newName : undefined,
        description: mode === 'new' ? newDesc : undefined,
        copySourceSprites: true,
        config: {
          defaultObstacles: cfg.obstacles,
          defaultWeaponCounts: cfg.weaponCounts,
          defaultMedkitCount: cfg.medkitCount,
          defaultFillBots: cfg.fillBots,
          defaultMaxBots: cfg.maxBots,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      if (saveThemeStatus) saveThemeStatus.textContent = data.error || 'No se pudo guardar el tema.';
      return;
    }

    const targetThemeId = data.themeId;

    // If saving from inside Sprite Editor, write the active sprite PNG directly into the chosen theme
    if (saveThemeContext.fromEditor && saveThemeContext.editorInstance) {
      await saveThemeContext.editorInstance._saveCurrentSpriteToServer(targetThemeId);
      saveThemeContext.editorInstance._populateAssetSelect();
    }

    // Refresh full catalog from server so derived/new theme + PNGs appear immediately
    const catRes = await fetch('/api/sprites', { cache: 'no-store' });
    const freshCatalog = catRes.ok ? await catRes.json() : data.catalog;
    atlas.invalidateThemePreviewCache();
    selectedCreateTheme = targetThemeId;
    world.theme = targetThemeId;
    await atlas.loadFromServerCatalog(freshCatalog, targetThemeId);
    renderThemeCarousel(true);
    renderCreateElementSliders(targetThemeId, false);
    renderer.rebuildGround(renderer.mapSeed);
    closeSaveThemeModal();
  } catch {
    if (saveThemeStatus) saveThemeStatus.textContent = 'Error de conexión al guardar el tema.';
  } finally {
    btnSaveThemeConfirm.disabled = false;
  }
});

btnRestoreTheme?.addEventListener('click', async () => {
  audio.unlock();
  const { isCustomNew } = getThemeFlags(selectedCreateTheme);
  const allThemes = getAvailableThemes();
  const label = allThemes[selectedCreateTheme]?.name || selectedCreateTheme;
  const msg = isCustomNew
    ? `¿Eliminar el tema personalizado "${label}"?`
    : `¿Restaurar "${label}" a su versión original intacta? Se eliminarán los cambios derivados.`;
  if (!window.confirm(msg)) return;

  btnRestoreTheme.disabled = true;
  try {
    const res = await fetch('/api/themes/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId: selectedCreateTheme }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      atlas.invalidateThemePreviewCache();
      const nextTheme = data.fallbackThemeId || 'campo';
      selectedCreateTheme = nextTheme;
      world.theme = nextTheme;
      await atlas.loadFromServerCatalog(data.catalog, nextTheme);
      renderThemeCarousel(true);
      renderCreateElementSliders(nextTheme, true);
      renderer.rebuildGround(renderer.mapSeed);
    }
  } finally {
    btnRestoreTheme.disabled = false;
  }
});

// === NETWORKING & MATCHMAKING ===
function sendJSON(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function connectToRoom(roomId = '') {
  audio.unlock();
  const rawName = inputName.value.trim().slice(0, 14) || defaultName;
  localStorage.setItem('campal_name', rawName);
  window.F4Player?.setName?.(rawName);

  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }

  lobbyStatus.textContent = roomId ? `Entrando a ${roomId}...` : 'Creando batalla con valores por defecto...';

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const name = encodeURIComponent(rawName);
  const numericSkin = typeof selectedSkin === 'number' ? selectedSkin : 0;
  const roomQuery = roomId ? `&room=${encodeURIComponent(roomId)}` : '&bots=1';
  const wsPath = window.location.pathname.startsWith('/games/campal') ? '/ws/campal' : '/';
  const url = `${proto}//${window.location.host}${wsPath}?name=${name}&skin=${numericSkin}${roomQuery}`;

  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    const customCharData = atlas.customStore[`char:${selectedSkin}`];
    if (customCharData) {
      sendJSON({ type: 'custom_char', data: customCharData });
    }
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleServerMessage(msg);
  });

  ws.addEventListener('close', () => {
    if (gameState !== 'menu' && gameState !== 'ended') {
      lobbyStatus.textContent = 'Conexión cerrada. Puedes unirte o crear otra batalla.';
      returnToMenu();
    }
  });
}

async function fetchOpenBattles() {
  try {
    const res = await fetch('/api/rooms', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.rooms || []).filter((r) => r.open);
  } catch {
    return [];
  }
}

function renderOpenBattlesModal(openRooms) {
  openBattlesList.innerHTML = '';
  if (openRooms.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'status-note';
    empty.textContent = 'No quedan batallas abiertas ahora mismo. Puedes crear una con valores por defecto.';
    openBattlesList.appendChild(empty);
    return;
  }

  for (const room of openRooms) {
    const row = document.createElement('div');
    row.className = 'battle-row';

    const info = document.createElement('div');
    info.className = 'battle-row-info';

    const title = document.createElement('span');
    title.className = 'battle-row-title';
    title.textContent = `${room.battleName || room.roomId}`;

    const meta = document.createElement('span');
    meta.className = 'battle-row-meta';
    meta.textContent = `${room.themeName || 'Descampado'} · ${room.players}/${room.maxPlayers} jugadores · Empieza en ${Math.ceil(room.waitTimer)}s`;

    info.append(title, meta);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pixel-btn btn-mini btn-primary';
    btn.textContent = 'ENTRAR';
    btn.addEventListener('click', () => {
      joinListOverlay.classList.add('hidden');
      connectToRoom(room.roomId);
    });

    row.append(info, btn);
    openBattlesList.appendChild(row);
  }
}

// "Unirse a una batalla" exact rule:
// - 0 open battles -> create default battle & join immediately
// - 1 open battle  -> join it directly
// - 2+ open battles -> show list to choose which battle to join
async function handleJoinBattleClick() {
  audio.unlock();
  lobbyStatus.textContent = 'Buscando batallas disponibles...';
  const openRooms = await fetchOpenBattles();

  if (openRooms.length === 0) {
    connectToRoom('');
  } else if (openRooms.length === 1) {
    connectToRoom(openRooms[0].roomId);
  } else {
    lobbyOverlay.classList.add('hidden');
    endOverlay.classList.add('hidden');
    createOverlay.classList.add('hidden');
    renderOpenBattlesModal(openRooms);
    joinListOverlay.classList.remove('hidden');
  }
}

async function handleCreateAndLaunchBattle() {
  audio.unlock();
  btnCreateLaunch.disabled = true;
  try {
    const config = collectCreateBattleConfig();
    const res = await fetch('/api/battles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (res.ok && data.ok && data.roomId) {
      createOverlay.classList.add('hidden');
      connectToRoom(data.roomId);
    } else {
      lobbyStatus.textContent = data.error || 'No se pudo crear la batalla.';
    }
  } catch {
    lobbyStatus.textContent = 'Error de conexión al crear la batalla.';
  } finally {
    btnCreateLaunch.disabled = false;
  }
}

function returnToMenu() {
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  gameState = 'menu';
  spectating = false;
  world.bannerText = '';
  input.setInMatch(false);
  document.body.classList.add('in-menu');
  lobbyOverlay.classList.remove('hidden');
  joinListOverlay.classList.add('hidden');
  createOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
}

function spatialVol(x, y) {
  const me = world.players.get(myId);
  const rx = me && me.alive ? me.rx : MAP_WIDTH / 2;
  const ry = me && me.alive ? me.ry : MAP_HEIGHT / 2;
  const d = dist(rx, ry, x, y);
  return Math.max(0.18, 1 - d / 520);
}

function createClientPlayer(r) {
  const sx = clamp(r.x ?? MAP_WIDTH / 2, ARENA_MIN_X, ARENA_MAX_X);
  const sy = clamp(r.y ?? MAP_HEIGHT / 2, ARENA_MIN_Y, ARENA_MAX_Y);
  return {
    id: r.id,
    name: r.name,
    skin: r.skin,
    isBot: Boolean(r.isBot),
    x: sx,
    y: sy,
    rx: sx,
    ry: sy,
    aim: 0,
    hp: PLAYER_MAX_HP,
    alive: true,
    activeSlot: 0,
    w0: 'fists',
    w1: '',
    inBush: false,
    revealed: false,
    hurtFlash: false,
    attackAnim: false,
    dashing: false,
    kills: 0,
    moving: false,
    hasSynced: Boolean(r.x !== undefined),
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'welcome': {
      myId = msg.id;
      world.myId = myId;
      break;
    }

    case 'error': {
      lobbyStatus.textContent = msg.message || 'Error al entrar a la batalla.';
      returnToMenu();
      break;
    }

    case 'match_start': {
      audio.unlock();
      gameState = msg.state || 'waiting';
      input.setInMatch(true);
      myId = msg.you;
      world.myId = myId;
      world.theme = msg.theme || 'campo';
      world.baseTheme = msg.baseTheme || world.theme;
      world.obstacleTypes = msg.themeObstacles || null;
      world.weapons = msg.themeWeapons || null;
      if (!atlas.serverCatalog?.themes?.[world.theme]) {
        fetch('/api/sprites', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((cat) => {
            if (cat) atlas.loadFromServerCatalog(cat, world.theme);
          })
          .catch(() => atlas.applyTheme(world.theme));
      } else {
        atlas.applyTheme(world.theme);
      }
      world.totalFighters = msg.totalFighters;
      world.aliveCount = msg.totalFighters;
      world.bannerText = '';
      world.corpses = [];
      world.projectiles = [];
      world.fires = [];
      spectating = Boolean(msg.spectator);

      renderer.rebuildGround(msg.mapSeed);

      world.obstacles.clear();
      for (const o of msg.obstacles) {
        world.obstacles.set(o.id, o);
      }

      world.loot.clear();
      for (const item of msg.loot) {
        world.loot.set(item.id, item);
      }

      world.players.clear();
      atlas.playerCustomChars.clear();
      for (const r of msg.roster) {
        world.players.set(r.id, createClientPlayer(r));
        if (r.customChar) {
          atlas.setPlayerCustomChar(r.id, r.customChar);
        }
      }

      document.body.classList.remove('in-menu');
      lobbyOverlay.classList.add('hidden');
      joinListOverlay.classList.add('hidden');
      createOverlay.classList.add('hidden');
      endOverlay.classList.add('hidden');
      break;
    }

    case 'state': {
      gameState = msg.st;
      world.aliveCount = msg.alive;
      world.bannerText = msg.bn || '';

      if (msg.ev && msg.ev.length > 0) {
        for (let i = 0; i < msg.ev.length; i++) {
          handleEvent(msg.ev[i]);
        }
      }

      for (let i = 0; i < msg.p.length; i++) {
        const row = msg.p[i];
        const p = world.players.get(row[0]);
        if (!p) continue;
        p.x = clamp(row[1], ARENA_MIN_X, ARENA_MAX_X);
        p.y = clamp(row[2], ARENA_MIN_Y, ARENA_MAX_Y);
        if (!p.hasSynced) {
          p.rx = p.x;
          p.ry = p.y;
          p.hasSynced = true;
        }
        p.aim = row[3];
        p.hp = row[4];
        p.alive = row[5] === 1;
        p.activeSlot = row[6];
        p.w0 = row[7];
        p.w1 = row[8];
        p.inBush = row[9] === 1;
        p.revealed = row[10] === 1;
        p.hurtFlash = row[11] === 1;
        p.attackAnim = row[12] === 1;
        p.dashing = row[13] === 1;
        p.kills = row[14];
        p.moving = row[15] === 1;
      }

      world.projectiles = msg.pr.map((r) => ({
        id: r[0],
        x: r[1],
        y: r[2],
        vx: r[3],
        vy: r[4],
        weaponId: r[5],
      }));

      world.fires = msg.f.map((r) => ({
        id: r[0],
        x: r[1],
        y: r[2],
        r: r[3],
        t: r[4],
      }));
      break;
    }

    case 'match_end': {
      gameState = 'ended';
      world.bannerText = '';
      input.setInMatch(false);
      document.body.classList.add('in-menu');
      endOverlay.classList.remove('hidden');

      const iWon = msg.winner && msg.winner.id === myId;
      endTitle.textContent = iWon ? '¡VICTORIA CAMPAL!' : 'FIN DE LA BATALLA';
      if (iWon) audio.playVictory();

      endWinnerLine.textContent = msg.winner
        ? `ÚLTIMO EN PIE: ${msg.winner.name} (${msg.winner.kills} bajas) · Duración ${msg.duration}s`
        : 'Empate total en el descampado';

      rankingBody.innerHTML = '';
      for (const r of msg.ranking) {
        const tr = document.createElement('tr');
        if (r.id === myId) tr.className = 'is-you';
        const cols = [`#${r.placement}`, r.name, String(r.kills), String(r.damage), `${r.time}s`];
        for (const txt of cols) {
          const td = document.createElement('td');
          td.textContent = txt;
          tr.appendChild(td);
        }
        rankingBody.appendChild(tr);
      }
      break;
    }
  }
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'player_join':
      if (ev.player && !world.players.has(ev.player.id)) {
        world.players.set(ev.player.id, createClientPlayer(ev.player));
        if (ev.player.customChar) {
          atlas.setPlayerCustomChar(ev.player.id, ev.player.customChar);
        }
        world.totalFighters = world.players.size;
      }
      break;

    case 'custom_char':
      if (ev.id && ev.data) {
        atlas.setPlayerCustomChar(ev.id, ev.data);
      }
      break;

    case 'player_leave':
      world.players.delete(ev.id);
      world.totalFighters = world.players.size;
      break;

    case 'banner':
      audio.playCountdown(false);
      if (ev.text) world.bannerText = ev.text;
      break;

    case 'fight_start':
      audio.playCountdown(true);
      if (ev.text) world.bannerText = ev.text;
      break;

    case 'loot_rm':
      world.loot.delete(ev.id);
      break;

    case 'loot_add':
      if (ev.item) world.loot.set(ev.item.id, ev.item);
      break;

    case 'obs_hit': {
      const o = world.obstacles.get(ev.id);
      if (o) o.hp = ev.hp;
      break;
    }

    case 'obs_break': {
      const o = world.obstacles.get(ev.id);
      if (o) o.alive = false;
      const v = spatialVol(ev.x, ev.y);
      if (ev.obsType === 'crate') {
        audio.playCrateBreak(v);
        renderer.spawnParticles(ev.x, ev.y - 4, 12, [PALETTE.DIRT, PALETTE.SAND, PALETTE.RUST], 18, 65, 0.2, 0.42, 2);
      }
      break;
    }

    case 'explosion': {
      const v = spatialVol(ev.x, ev.y);
      audio.playExplosion(v);
      renderer.spawnExplosion(ev.x, ev.y, ev.r);
      if (v > 0.2) renderer.addShake(3.2 * v);
      break;
    }

    case 'molotov_burst': {
      const v = spatialVol(ev.x, ev.y);
      audio.playMolotovBurst(v);
      renderer.spawnParticles(ev.x, ev.y - 4, 14, [PALETTE.GOLD, PALETTE.RUST, PALETTE.CRIMSON, PALETTE.GRASS], 18, 65, 0.2, 0.45, 1);
      if (v > 0.25) renderer.addShake(1.6 * v);
      break;
    }

    case 'melee': {
      const v = spatialVol(ev.x, ev.y);
      const wSpec = world.weapons?.[ev.weapon] || null;
      audio.playWeapon(ev.weapon, v, wSpec);
      renderer.spawnSlash(ev.x, ev.y, ev.aim, ev.range, ev.weapon, wSpec?.isCustomThemeWeapon ? wSpec.color : null);
      break;
    }

    case 'shoot': {
      const v = spatialVol(ev.x, ev.y);
      const wSpec = world.weapons?.[ev.weapon] || null;
      audio.playWeapon(ev.weapon, v, wSpec);
      renderer.spawnParticles(ev.x, ev.y, 4, [wSpec?.projectileColor || PALETTE.GOLD, PALETTE.BONE, PALETTE.RUST], 18, 55, 0.06, 0.14, 1);
      if (ev.id === myId) {
        renderer.addShake(ev.weapon === 'shotgun' ? 2.2 : ev.weapon === 'rifle' ? 1.8 : 0.8);
      }
      break;
    }

    case 'spark':
      renderer.spawnParticles(ev.x, ev.y, 5, [PALETTE.SILVER, PALETTE.GOLD, PALETTE.BONE], 14, 48, 0.08, 0.16, 1);
      break;

    case 'hit': {
      const v = spatialVol(ev.x, ev.y);
      audio.playHit(v);
      renderer.spawnParticles(ev.x, ev.y, 6, [PALETTE.CRIMSON, PALETTE.RUST, PALETTE.BONE], 20, 68, 0.12, 0.28, 1);
      if (ev.id === myId) renderer.addShake(1.8);
      break;
    }

    case 'heal':
      if (ev.id === myId) audio.playHeal();
      renderer.spawnParticles(ev.x, ev.y - 6, 8, [PALETTE.LIME, PALETTE.BONE], 12, 42, 0.22, 0.45, 1);
      break;

    case 'pickup':
      if (ev.id === myId) audio.playPickup();
      break;

    case 'dash':
      audio.playDash(spatialVol(ev.x, ev.y));
      renderer.spawnParticles(ev.x, ev.y, 5, [PALETTE.SAND, PALETTE.DIRT], 10, 35, 0.14, 0.28, 1);
      break;

    case 'kill': {
      world.corpses.push({ x: ev.x, y: ev.y, name: ev.victimName, isMe: ev.victimId === myId });
      renderer.spawnParticles(ev.x, ev.y - 5, 14, [PALETTE.CRIMSON, PALETTE.BONE, PALETTE.UMBER], 16, 75, 0.22, 0.5, 2);
      if (ev.killerId === myId || ev.victimId === myId) {
        audio.playKill();
      }
      if (ev.victimId === myId) {
        spectating = true;
      }
      break;
    }
  }
}

// === UI EVENT LISTENERS ===
btnJoinBattle.addEventListener('click', handleJoinBattleClick);

btnCreateBattle.addEventListener('click', () => {
  audio.unlock();
  lobbyOverlay.classList.add('hidden');
  joinListOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
  createOverlay.classList.remove('hidden');
  world.theme = selectedCreateTheme;
  atlas.applyTheme(selectedCreateTheme).then(() => {
    renderCreateElementSliders(selectedCreateTheme, false);
  });
  renderThemeCarousel(true);
});

createThemeList?.addEventListener(
  'wheel',
  (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      createThemeList.scrollLeft += e.deltaY;
    }
  },
  { passive: false }
);

inputName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleJoinBattleClick();
});

btnRefreshBattles.addEventListener('click', async () => {
  const openRooms = await fetchOpenBattles();
  renderOpenBattlesModal(openRooms);
});

btnJoinCreateDefault.addEventListener('click', () => {
  joinListOverlay.classList.add('hidden');
  connectToRoom('');
});

btnJoinBack.addEventListener('click', () => {
  joinListOverlay.classList.add('hidden');
  lobbyOverlay.classList.remove('hidden');
});

btnCreateDefaults.addEventListener('click', () => {
  resetCreateFormToDefaults();
});

btnCreateBack.addEventListener('click', () => {
  createOverlay.classList.add('hidden');
  lobbyOverlay.classList.remove('hidden');
});

btnCreateLaunch.addEventListener('click', handleCreateAndLaunchBattle);

btnRematch.addEventListener('click', handleJoinBattleClick);
btnBackLobby.addEventListener('click', returnToMenu);

window.addEventListener('resize', () => renderer.resize());

// Send player inputs to server at 30Hz while in battle (including 10s free-movement waiting phase)
setInterval(() => {
  if (gameState !== 'waiting' && gameState !== 'ready' && gameState !== 'playing') return;
  const me = world.players.get(myId);
  if (!me || !me.alive || spectating) return;
  const pkt = input.sample({ x: me.rx, y: me.ry - 7 }, renderer);
  sendJSON(pkt);
}, 1000 / 30);

// 60fps animation & interpolation loop
let lastFrame = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (gameState === 'menu') {
    const bank = atlas.characters[selectedSkin] || atlas.characters[0];
    if (bank && bank.frames.length > 0) {
      const fps = bank.fps || 4;
      const frame = Math.floor((now / 1000) * fps) % bank.frames.length;
      const spr = bank.frames[frame];
      if (skinPreviewCanvas.width !== spr.width || skinPreviewCanvas.height !== spr.height) {
        skinPreviewCanvas.width = spr.width;
        skinPreviewCanvas.height = spr.height;
        skinPreviewCtx.imageSmoothingEnabled = false;
      }
      skinPreviewCtx.clearRect(0, 0, spr.width, spr.height);
      skinPreviewCtx.drawImage(spr, 0, 0);
    }
    spriteEditor.updatePreview(dt);
  }

  const lerp = 1 - Math.exp(-16 * dt);
  const canPredictLocal = !spectating && (gameState === 'waiting' || gameState === 'ready' || gameState === 'playing');
  for (const p of world.players.values()) {
    if (!p.alive) continue;
    if (p.id === myId && canPredictLocal) {
      const mv = input.getMoveVector();
      if (mv.mx !== 0 || mv.my !== 0) {
        const tmp = {
          x: p.rx + mv.mx * PLAYER_SPEED * dt,
          y: p.ry + mv.my * PLAYER_SPEED * dt,
        };
        for (const o of world.obstacles.values()) {
          const spec = world.obstacleTypes?.[o.type];
          const isSolid = spec ? spec.solid : o.type !== 'bush';
          if (!o.alive || !isSolid) continue;
          resolveCircleRect(tmp, PLAYER_RADIUS, o);
        }
        p.rx = tmp.x;
        p.ry = tmp.y;
        p.moving = true;
      }
      const errDist = Math.hypot(p.x - p.rx, p.y - p.ry);
      const recon = errDist > 28 ? 0.65 : 1 - Math.exp(-10 * dt);
      p.rx = clamp(p.rx + (p.x - p.rx) * recon, ARENA_MIN_X, ARENA_MAX_X);
      p.ry = clamp(p.ry + (p.y - p.ry) * recon, ARENA_MIN_Y, ARENA_MAX_Y);
    } else {
      p.rx = clamp(p.rx + (p.x - p.rx) * lerp, ARENA_MIN_X, ARENA_MAX_X);
      p.ry = clamp(p.ry + (p.y - p.ry) * lerp, ARENA_MIN_Y, ARENA_MAX_Y);
    }
  }
  for (let i = 0; i < world.projectiles.length; i++) {
    const pr = world.projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
  }

  renderer.render(
    world,
    gameState === 'waiting' || gameState === 'ready' || gameState === 'playing' ? input.mouseScreen : null,
    dt
  );

  requestAnimationFrame(loop);
}

document.body.classList.add('in-menu');
requestAnimationFrame(loop);
