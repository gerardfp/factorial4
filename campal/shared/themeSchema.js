// Validation & safe limits for theme-defined custom obstacles and custom weapons
import {
  PALETTE,
  OBSTACLE_TYPES,
  WEAPONS,
  LOOT_WEAPONS,
  BATTLE_THEMES,
} from './constants.js';
import { clamp } from './collision.js';

export const OBSTACLE_LIMITS = Object.freeze({
  w: [8, 72],
  h: [6, 56],
  visW: [8, 80],
  visH: [8, 80],
  hp: [15, 300],
  explosionRadius: [24, 70],
  explosionDamage: [20, 90],
  maxCount: [1, 20],
});

export const WEAPON_LIMITS = Object.freeze({
  types: ['melee', 'ranged', 'thrown', 'molotov'],
  damage: [5, 70],
  cooldown: [0.15, 2.0],
  meleeRange: [12, 36],
  rangedRange: [60, 420],
  arc: [0.6, 2.6],
  speed: [110, 520],
  spread: [0, 0.6],
  pellets: [1, 7],
  radius: [1.5, 5],
  knockback: [0, 180],
  ammo: [1, 60],
  fireRadius: [14, 36],
  fireDuration: [1.5, 7.0],
  fireDps: [8, 36],
});

export function isValidCustomId(id) {
  return typeof id === 'string' && /^[a-z0-9_]{2,20}$/.test(id);
}

function safeColor(raw, fallback) {
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.trim())) {
    return raw.trim();
  }
  return fallback;
}

export function sanitizeCustomObstacle(id, raw) {
  if (!isValidCustomId(id) || !raw || typeof raw !== 'object') return null;

  const base = OBSTACLE_TYPES[id] || null;
  const w = Math.round(clamp(Number(raw.w ?? base?.w ?? 24), OBSTACLE_LIMITS.w[0], OBSTACLE_LIMITS.w[1]));
  const h = Math.round(clamp(Number(raw.h ?? base?.h ?? 14), OBSTACLE_LIMITS.h[0], OBSTACLE_LIMITS.h[1]));
  const visW = Math.round(clamp(Number(raw.visW ?? base?.visW ?? Math.max(w, w + 2)), w, OBSTACLE_LIMITS.visW[1]));
  const visH = Math.round(clamp(Number(raw.visH ?? base?.visH ?? Math.max(h + 8, 20)), h, OBSTACLE_LIMITS.visH[1]));

  const stealth = raw.stealth !== undefined ? Boolean(raw.stealth) : Boolean(base?.stealth);
  const solid = raw.solid !== undefined ? Boolean(raw.solid) : !stealth;
  const blocksProjectiles =
    raw.blocksProjectiles !== undefined ? Boolean(raw.blocksProjectiles) : solid;
  const destructible = raw.destructible !== undefined ? Boolean(raw.destructible) : Boolean(base?.destructible);
  const explosive = destructible && (raw.explosive !== undefined ? Boolean(raw.explosive) : Boolean(base?.explosive));
  const dropsLoot = destructible && !explosive && Boolean(raw.dropsLoot ?? id === 'crate');

  const hp = destructible
    ? Math.round(clamp(Number(raw.hp ?? base?.hp ?? 60), OBSTACLE_LIMITS.hp[0], OBSTACLE_LIMITS.hp[1]))
    : 9999;

  const maxCount = Math.round(clamp(Number(raw.maxCount ?? 12), OBSTACLE_LIMITS.maxCount[0], OBSTACLE_LIMITS.maxCount[1]));
  const defaultCount = Math.round(clamp(Number(raw.defaultCount ?? 3), 0, maxCount));

  const name = String(raw.name || base?.name || id)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 22);

  const spec = {
    id,
    name: name || id,
    w,
    h,
    visW,
    visH,
    solid,
    blocksProjectiles,
    stealth,
    destructible,
    explosive,
    dropsLoot,
    hp,
    defaultCount,
    maxCount,
    isCustomThemeObj: !base,
  };

  if (explosive) {
    spec.explosionRadius = Math.round(
      clamp(
        Number(raw.explosionRadius ?? base?.explosionRadius ?? 44),
        OBSTACLE_LIMITS.explosionRadius[0],
        OBSTACLE_LIMITS.explosionRadius[1]
      )
    );
    spec.explosionDamage = Math.round(
      clamp(
        Number(raw.explosionDamage ?? base?.explosionDamage ?? 60),
        OBSTACLE_LIMITS.explosionDamage[0],
        OBSTACLE_LIMITS.explosionDamage[1]
      )
    );
  }

  if (typeof raw.sprite === 'string' && raw.sprite.trim()) {
    spec.sprite = raw.sprite.trim();
  }
  if (typeof raw.damagedSprite === 'string' && raw.damagedSprite.trim()) {
    spec.damagedSprite = raw.damagedSprite.trim();
  }

  return spec;
}

export function sanitizeCustomWeapon(id, raw) {
  if (!isValidCustomId(id) || id === 'fists' || !raw || typeof raw !== 'object') return null;

  const base = WEAPONS[id] || null;
  const reqType = String(raw.type || base?.type || 'ranged');
  const type = WEAPON_LIMITS.types.includes(reqType) ? reqType : 'ranged';

  const name = String(raw.name || base?.name || id)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 20);

  const damage = Math.round(clamp(Number(raw.damage ?? base?.damage ?? 20), WEAPON_LIMITS.damage[0], WEAPON_LIMITS.damage[1]));
  const cooldown = Number(
    clamp(Number(raw.cooldown ?? base?.cooldown ?? 0.45), WEAPON_LIMITS.cooldown[0], WEAPON_LIMITS.cooldown[1]).toFixed(2)
  );
  const knockback = Math.round(
    clamp(Number(raw.knockback ?? base?.knockback ?? 70), WEAPON_LIMITS.knockback[0], WEAPON_LIMITS.knockback[1])
  );
  const ammo = Math.round(clamp(Number(raw.ammo ?? base?.ammo ?? 14), WEAPON_LIMITS.ammo[0], WEAPON_LIMITS.ammo[1]));
  const color = safeColor(raw.color, base?.color || PALETTE.GOLD);
  const projectileColor = safeColor(raw.projectileColor, color);

  const spec = {
    id,
    name: name || id,
    type,
    damage,
    cooldown,
    knockback,
    ammo,
    color,
    projectileColor,
    isCustomThemeWeapon: !base,
  };

  if (type === 'melee') {
    spec.range = Math.round(
      clamp(Number(raw.range ?? base?.range ?? 22), WEAPON_LIMITS.meleeRange[0], WEAPON_LIMITS.meleeRange[1])
    );
    spec.arc = Number(clamp(Number(raw.arc ?? base?.arc ?? 1.8), WEAPON_LIMITS.arc[0], WEAPON_LIMITS.arc[1]).toFixed(2));
    if (raw.crateMult !== undefined) {
      spec.crateMult = Number(clamp(Number(raw.crateMult), 0.5, 3.0).toFixed(2));
    }
  } else {
    spec.range = Math.round(
      clamp(Number(raw.range ?? base?.range ?? 200), WEAPON_LIMITS.rangedRange[0], WEAPON_LIMITS.rangedRange[1])
    );
    spec.speed = Math.round(
      clamp(Number(raw.speed ?? base?.speed ?? 260), WEAPON_LIMITS.speed[0], WEAPON_LIMITS.speed[1])
    );
    spec.spread = Number(clamp(Number(raw.spread ?? base?.spread ?? 0.05), WEAPON_LIMITS.spread[0], WEAPON_LIMITS.spread[1]).toFixed(3));
    spec.pellets = Math.round(clamp(Number(raw.pellets ?? base?.pellets ?? 1), WEAPON_LIMITS.pellets[0], WEAPON_LIMITS.pellets[1]));
    spec.radius = Number(clamp(Number(raw.radius ?? base?.radius ?? 2.2), WEAPON_LIMITS.radius[0], WEAPON_LIMITS.radius[1]).toFixed(1));

    if (type === 'molotov') {
      spec.fireRadius = Math.round(
        clamp(Number(raw.fireRadius ?? base?.fireRadius ?? 24), WEAPON_LIMITS.fireRadius[0], WEAPON_LIMITS.fireRadius[1])
      );
      spec.fireDuration = Number(
        clamp(Number(raw.fireDuration ?? base?.fireDuration ?? 4.0), WEAPON_LIMITS.fireDuration[0], WEAPON_LIMITS.fireDuration[1]).toFixed(1)
      );
      spec.fireDps = Math.round(
        clamp(Number(raw.fireDps ?? base?.fireDps ?? 20), WEAPON_LIMITS.fireDps[0], WEAPON_LIMITS.fireDps[1])
      );
    }
  }

  if (typeof raw.sprite === 'string' && raw.sprite.trim()) {
    spec.sprite = raw.sprite.trim();
  }

  return spec;
}

// Merge base obstacles + weapons with a theme's custom definitions from theme.json
export function resolveThemeDefinitions(themeEntry) {
  const obstacleTypes = { ...OBSTACLE_TYPES };
  const weapons = { ...WEAPONS };
  const customObstacleIds = [];
  const customWeaponIds = [];

  const rawObs = themeEntry?.obstacles || themeEntry?.config?.obstacles || {};
  for (const [id, rawSpec] of Object.entries(rawObs)) {
    const clean = sanitizeCustomObstacle(id, rawSpec);
    if (!clean) continue;
    obstacleTypes[id] = clean;
    if (clean.isCustomThemeObj) customObstacleIds.push(id);
  }

  const rawWeapons = themeEntry?.weapons || themeEntry?.config?.weapons || {};
  for (const [id, rawSpec] of Object.entries(rawWeapons)) {
    const clean = sanitizeCustomWeapon(id, rawSpec);
    if (!clean) continue;
    weapons[id] = clean;
    if (clean.isCustomThemeWeapon) customWeaponIds.push(id);
  }

  const lootWeapons = [...LOOT_WEAPONS, ...customWeaponIds];

  // Merge default obstacle counts (base theme defaults + custom obstacle defaultCount)
  const baseDefaults = themeEntry?.config?.defaultObstacles || BATTLE_THEMES.campo.defaultObstacles;
  const defaultObstacles = { ...baseDefaults };
  for (const id of customObstacleIds) {
    if (defaultObstacles[id] === undefined) {
      defaultObstacles[id] = obstacleTypes[id].defaultCount ?? 3;
    }
  }

  return {
    obstacleTypes,
    weapons,
    lootWeapons,
    customObstacleIds,
    customWeaponIds,
    defaultObstacles,
  };
}
