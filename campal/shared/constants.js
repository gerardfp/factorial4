// Shared game constants, expanded pixel-art palette, weapons, obstacles, and fixed-arena dimensions

export const MAX_PLAYERS = 24;
export const TICK_RATE = 30; // Server simulation ticks per second
export const SNAPSHOT_RATE = 20; // Network broadcast rate per second

export const TILE_SIZE = 16;
export const MAP_COLS = 40;
export const MAP_ROWS = 23;
export const MAP_WIDTH = TILE_SIZE * MAP_COLS;   // 640 virtual px (full battlefield visible)
export const MAP_HEIGHT = TILE_SIZE * MAP_ROWS;  // 368 virtual px (~16:9 widescreen)
export const MAP_SIZE = MAP_WIDTH; // Legacy alias for tests/reference

// Strict playable bounds inside the battlefield perimeter (keeps entire sprite + name/HP inside)
export const ARENA_MIN_X = 16;
export const ARENA_MAX_X = MAP_WIDTH - 16;
export const ARENA_MIN_Y = 34;
export const ARENA_MAX_Y = MAP_HEIGHT - 10;

// Strict character sprite bounds: 16x24 px (<= 32x32 px max), lineless low-pixel style
export const CHAR_SPRITE_W = 16;
export const CHAR_SPRITE_H = 24;
export const CHAR_SPRITE_SIZE = 24; // Max dimension <= 32
export const CHAR_MAX_SPRITE_SIZE = 32;

export const PLAYER_RADIUS = 5;
export const PLAYER_MAX_HP = 100;
export const PLAYER_SPEED = 56; // virtual px/sec across 640x368 battlefield
export const DASH_SPEED = 148;
export const DASH_DURATION = 0.14;
export const DASH_COOLDOWN = 1.6;

// Core character colors, extended with sun-baked landscape material ramps.
// Tuned with warm muted olive-earth ground so lineless low-pixel sprites pop without outlines
export const PALETTE = Object.freeze({
  INK: '#1b1a1f',        // 0: Deep charcoal (hair, eyes, dark boots, UI frame)
  UMBER: '#3b372c',      // 1: Dark earth shadow / ground cast shadow / UI bg
  SOIL: '#595537',       // 2: Muted olive-ochre descampado ground base
  DIRT: '#736c46',       // 3: Warm dry field / mid dirt highlight
  SAND: '#f0c49a',       // 4: Warm skin tone / sandy light
  BONE: '#f5f0e1',       // 5: Off-white eye shine / highlight / text
  PINE: '#2d4f3c',       // 6: Deep bush shadow / dark green tunic
  GRASS: '#4d8252',      // 7: Mid foliage / green outfit
  LIME: '#97c95c',       // 8: Sunlit bush top / heal / bright green
  SLATE: '#4a5568',      // 9: Shaded rock / concrete face / dark denim
  STONE: '#7f8c9c',      // 10: Mid rock / metal / concrete top
  SILVER: '#c5d1db',     // 11: Sunlit stone / steel glint / light pants
  CRIMSON: '#c93842',    // 12: Red danger / crimson tunic / barrel / blood
  RUST: '#e3743b',       // 13: Orange fire / rust / wood highlight / ginger hair
  GOLD: '#f2c14e',       // 14: Yellow hair / loot gleam / crown / hazard stripe
  COBALT: '#4082c9',     // 15: Vibrant blue jacket / denim / car paint
});

export const SECANO_PALETTE = Object.freeze({
  EARTH: '#b88246', EARTH_LIGHT: '#bf8b4e', EARTH_DARK: '#af7940',
  DUST: '#cb985b', DUST_LIGHT: '#d6a66a', TRACK: '#dbad73', TRACK_EDGE: '#c18c50',
  SHADOW: '#715438', STONE_SHADE: '#8d7b62', STONE_MID: '#af9c7c',
  STONE_LIGHT: '#cbb998', STONE_TOP: '#e1d0ac', MORTAR: '#77694f',
  OLIVE_DARK: '#50543b', OLIVE: '#707348', OLIVE_LIGHT: '#898954',
  OLIVE_SUN: '#a09a60', BARK: '#735536', BARK_LIGHT: '#967046',
  DRY_GRASS: '#9d8041', STRAW: '#c5a254', STRAW_LIGHT: '#dfbd6c',
  THISTLE: '#8b6279', WOOD: '#a2703e', WOOD_LIGHT: '#ce9956', WOOD_DARK: '#704c31',
  BLUE_PAINT: '#6e8d95', BLUE_LIGHT: '#9aafb0', BLUE_SHADE: '#506972',
  METAL: '#87908c', METAL_LIGHT: '#b7bbb0', RUST_DARK: '#92583d',
});

export const INDUSTRIAL_PALETTE = Object.freeze({
  GROUND: '#887b66', GRAVEL: '#9a8d76', GROUND_DARK: '#796d5d',
  ASPHALT: '#54585a', ASPHALT_LIGHT: '#626769', OIL: '#3d4142',
  STEEL_DARK: '#414e53', STEEL: '#73868b', STEEL_LIGHT: '#a6b5b3',
  TEAL_DARK: '#345e60', TEAL: '#4d8080', TEAL_LIGHT: '#79a3a0',
  OXIDE: '#9c5e40', OXIDE_LIGHT: '#c18557', HAZARD: '#d8b354', CONCRETE: '#b0a997',
});

export const COSTA_PALETTE = Object.freeze({
  SAND: '#c9ad7e', SAND_LIGHT: '#d5bb8e', SAND_SHADE: '#bea173', SAND_GLOW: '#e3cc9f',
  PATH: '#e5c998', PATH_LIGHT: '#f0dab0', PATH_EDGE: '#bfa072',
  SHADOW: '#89765b', DEEP_SHADOW: '#615b50',
  CREAM: '#f4e8cd', WHITE: '#fff6e0', STUCCO: '#d9cbb1', STUCCO_SHADE: '#b3a68f',
  TURQUOISE: '#51a6a0', TURQUOISE_LIGHT: '#83c4b6', TURQUOISE_DARK: '#33787c',
  CORAL: '#d97b68', CORAL_LIGHT: '#efa18a', CORAL_DARK: '#a5534d',
  TERRACOTTA: '#b86c4d', TILE_LIGHT: '#e39a6c', TILE_DARK: '#8f5140',
  LEAF: '#548563', LEAF_LIGHT: '#80ac72', LEAF_GLOW: '#b0c382', LEAF_DARK: '#355e53',
  PALM: '#4a9577', PALM_LIGHT: '#7bbb87', PALM_DARK: '#326c62',
  BARK: '#9b7754', BARK_LIGHT: '#c39c68',
  LAVENDER: '#aa89b4', LAVENDER_LIGHT: '#d1b2cf', FLOWER: '#eebc72', FLOWER_LIGHT: '#ffe3a0',
  GLASS: '#598994', GLASS_LIGHT: '#a0cbd0', GLASS_DARK: '#3a626f',
  METAL: '#9da9a4', METAL_LIGHT: '#d3dbcb',
});

export const OBRAS_PALETTE = Object.freeze({
  EARTH: '#a18a6d', EARTH_LIGHT: '#ad9778', EARTH_DARK: '#927b60', DUST: '#bba385',
  MUD: '#806952', MUD_DARK: '#6c5948', WET: '#978878', WATER: '#aaa69a',
  SHADOW: '#665a4b', SHADOW_DEEP: '#49453e',
  YELLOW: '#d9a334', YELLOW_LIGHT: '#edbd54', YELLOW_GLOW: '#ffda78',
  YELLOW_DARK: '#ab7625', YELLOW_SHADE: '#805625',
  ORANGE: '#d47a3e', ORANGE_LIGHT: '#f0a366', ORANGE_DARK: '#a4512e',
  STEEL: '#7c8989', STEEL_LIGHT: '#b4bfba', STEEL_GLOW: '#dce0ce',
  STEEL_DARK: '#505e61', STEEL_DEEP: '#344448',
  CONCRETE: '#b2ae9d', CONCRETE_LIGHT: '#d1cbb5', CONCRETE_SHADE: '#8e8d80', CONCRETE_DARK: '#707367',
  BRICK: '#ae694f', BRICK_LIGHT: '#d18b67', BRICK_GLOW: '#e8aa7f', BRICK_DARK: '#824a39',
  WOOD: '#ab8658', WOOD_LIGHT: '#ceb07b', WOOD_DARK: '#795b3b',
  BLUE: '#5f828c', BLUE_LIGHT: '#8eacaf', BLUE_DARK: '#3d606e',
  GLASS: '#456d7a', GLASS_LIGHT: '#89b2bb', GLASS_GLOW: '#bfd5ce',
  RUST: '#94674d', RUST_LIGHT: '#be8b63', RUBBER: '#353b3b', RUBBER_LIGHT: '#555c58',
  WHITE: '#e8dfc8', RED: '#bb5644', LEAF: '#697550', LEAF_LIGHT: '#92966a',
});

export const PALETTE_LIST = [...new Set([...Object.values(PALETTE), ...Object.values(SECANO_PALETTE), ...Object.values(INDUSTRIAL_PALETTE), ...Object.values(COSTA_PALETTE), ...Object.values(OBRAS_PALETTE)])];

// 8 distinct lineless low-pixel character presets inspired by 3/4 slender pixel art
export const SKIN_PRESETS = [
  { id: 0, name: 'Bandido', shirt: PALETTE.CRIMSON, pants: PALETTE.INK, accent: PALETTE.GOLD, hair: PALETTE.INK, style: 'spiky' },
  { id: 1, name: 'Nómada', shirt: PALETTE.COBALT, pants: PALETTE.SLATE, accent: PALETTE.BONE, hair: PALETTE.GOLD, style: 'cap' },
  { id: 2, name: 'Montaraz', shirt: PALETTE.GRASS, pants: PALETTE.UMBER, accent: PALETTE.RUST, hair: PALETTE.RUST, style: 'long' },
  { id: 3, name: 'Pirómano', shirt: PALETTE.RUST, pants: PALETTE.INK, accent: PALETTE.GOLD, hair: PALETTE.CRIMSON, style: 'mohawk' },
  { id: 4, name: 'Vigía', shirt: PALETTE.SILVER, pants: PALETTE.COBALT, accent: PALETTE.CRIMSON, hair: PALETTE.COBALT, style: 'beanie' },
  { id: 5, name: 'Sombra', shirt: PALETTE.SLATE, pants: PALETTE.INK, accent: PALETTE.LIME, hair: PALETTE.INK, style: 'ponytail' },
  { id: 6, name: 'Chispa', shirt: PALETTE.GOLD, pants: PALETTE.SLATE, accent: PALETTE.RUST, hair: PALETTE.BONE, style: 'visor' },
  { id: 7, name: 'Forajido', shirt: PALETTE.PINE, pants: PALETTE.SOIL, accent: PALETTE.GOLD, hair: PALETTE.UMBER, style: 'bandana' },
];

// Weapons scaled cleanly for the 640x368 full-screen battlefield
export const WEAPONS = Object.freeze({
  fists: {
    id: 'fists',
    name: 'Puños',
    type: 'melee',
    damage: 14,
    cooldown: 0.34,
    range: 16,
    arc: 1.6,
    knockback: 58,
    ammo: Infinity,
    color: PALETTE.SAND,
  },
  pipe: {
    id: 'pipe',
    name: 'Tubo',
    type: 'melee',
    damage: 24,
    cooldown: 0.42,
    range: 21,
    arc: 1.9,
    knockback: 92,
    ammo: 28,
    color: PALETTE.SILVER,
  },
  axe: {
    id: 'axe',
    name: 'Hacha',
    type: 'melee',
    damage: 38,
    cooldown: 0.68,
    range: 23,
    arc: 2.1,
    knockback: 118,
    ammo: 18,
    crateMult: 2.0,
    color: PALETTE.RUST,
  },
  brick: {
    id: 'brick',
    name: 'Ladrillos',
    type: 'thrown',
    damage: 30,
    cooldown: 0.52,
    speed: 175,
    range: 135,
    radius: 3.5,
    knockback: 105,
    ammo: 8,
    color: PALETTE.CRIMSON,
  },
  slingshot: {
    id: 'slingshot',
    name: 'Tirachinas',
    type: 'ranged',
    damage: 13,
    cooldown: 0.24,
    speed: 225,
    range: 170,
    spread: 0.08,
    pellets: 1,
    radius: 2,
    knockback: 42,
    ammo: 30,
    color: PALETTE.DIRT,
  },
  pistol: {
    id: 'pistol',
    name: 'Pistola',
    type: 'ranged',
    damage: 22,
    cooldown: 0.36,
    speed: 285,
    range: 220,
    spread: 0.05,
    pellets: 1,
    radius: 2,
    knockback: 58,
    ammo: 16,
    color: PALETTE.STONE,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Escopeta',
    type: 'ranged',
    damage: 13,
    cooldown: 0.85,
    speed: 255,
    range: 122,
    spread: 0.35,
    pellets: 5,
    radius: 2,
    knockback: 75,
    ammo: 8,
    color: PALETTE.RUST,
  },
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    type: 'ranged',
    damage: 44,
    cooldown: 1.05,
    speed: 390,
    range: 350,
    spread: 0.015,
    pellets: 1,
    radius: 2.2,
    knockback: 105,
    ammo: 7,
    color: PALETTE.COBALT,
  },
  molotov: {
    id: 'molotov',
    name: 'Molotov',
    type: 'molotov',
    damage: 16,
    cooldown: 0.9,
    speed: 155,
    range: 135,
    radius: 3.5,
    fireRadius: 24,
    fireDuration: 4.5,
    fireDps: 22,
    knockback: 35,
    ammo: 3,
    color: PALETTE.GOLD,
  },
});

export const LOOT_WEAPONS = ['pipe', 'axe', 'brick', 'slingshot', 'pistol', 'shotgun', 'rifle', 'molotov'];

export const WEAPON_MAX_PER_TYPE = 15;

export const DEFAULT_WEAPON_RANGES = Object.freeze({
  pipe: Object.freeze({ min: 4, max: 7 }),
  axe: Object.freeze({ min: 3, max: 6 }),
  brick: Object.freeze({ min: 4, max: 7 }),
  slingshot: Object.freeze({ min: 4, max: 7 }),
  pistol: Object.freeze({ min: 4, max: 7 }),
  shotgun: Object.freeze({ min: 3, max: 5 }),
  rifle: Object.freeze({ min: 2, max: 4 }),
  molotov: Object.freeze({ min: 2, max: 4 }),
});

export function normalizeCountRange(raw, fallbackMin, fallbackMax, absMin = 0, absMax = 30) {
  const clampInt = (v, fb) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fb;
    return Math.max(absMin, Math.min(absMax, Math.round(n)));
  };
  const fbMin = Math.max(absMin, Math.min(absMax, Math.round(fallbackMin)));
  const fbMax = Math.max(fbMin, Math.min(absMax, Math.round(fallbackMax)));

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const v = clampInt(raw, fbMin);
    return { min: v, max: v };
  }
  if (Array.isArray(raw) && raw.length >= 2) {
    const a = clampInt(raw[0], fbMin);
    const b = clampInt(raw[1], fbMax);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  if (raw && typeof raw === 'object' && (raw.min !== undefined || raw.max !== undefined)) {
    const a = clampInt(raw.min ?? raw.max, fbMin);
    const b = clampInt(raw.max ?? raw.min, fbMax);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  return { min: fbMin, max: fbMax };
}

export function defaultRangeFromCount(count, absMax = 20) {
  const c = Math.max(0, Math.min(absMax, Math.round(Number(count) || 0)));
  if (c === 0) return { min: 0, max: 0 };
  const spread = c <= 2 ? 1 : 2;
  return {
    min: Math.max(0, c - spread),
    max: Math.min(absMax, c + spread),
  };
}

// Preset battlefield themes
export const BATTLE_THEMES = Object.freeze({
  campo: {
    id: 'campo',
    name: 'Descampado Campo',
    description: 'Tierra seca, matorrales, rocas y chatarra',
    borderColor: PALETTE.UMBER,
    accentColor: PALETTE.DIRT,
    defaultObstacles: { rock: 10, wall_h: 5, wall_v: 4, wreck: 4, crate: 10, barrel: 6, bush: 11 },
  },
  secano: {
    id: 'secano',
    name: 'Secano español',
    description: 'Tierra ocre, olivos bajos, piedra seca y coches envejecidos',
    borderColor: PALETTE.UMBER,
    accentColor: SECANO_PALETTE.DUST,
    defaultObstacles: { rock: 7, wall_h: 7, wall_v: 3, wreck: 4, crate: 8, barrel: 5, bush: 10 },
  },
  obras: {
    id: 'obras',
    name: 'Descampado en obras',
    description: 'Excavadoras, andamios, casetas de obra y materiales de construcción',
    borderColor: OBRAS_PALETTE.SHADOW_DEEP,
    accentColor: OBRAS_PALETTE.YELLOW,
    defaultObstacles: { rock: 4, wall_h: 3, wall_v: 2, wreck: 1, crate: 4, barrel: 4, bush: 3 },
  },
  costa: {
    id: 'costa',
    name: 'Camping de la costa',
    description: 'Arena dorada, caravanas retro, palmeras y flores mediterráneas',
    borderColor: COSTA_PALETTE.DEEP_SHADOW,
    accentColor: COSTA_PALETTE.TURQUOISE,
    defaultObstacles: { rock: 5, wall_h: 4, wall_v: 2, wreck: 2, crate: 6, barrel: 4, bush: 8 },
  },
  industrial: {
    id: 'industrial',
    name: 'Descampado industrial',
    description: 'Grava, verjas oxidadas, contenedores y residuos de un polígono',
    borderColor: INDUSTRIAL_PALETTE.STEEL_DARK,
    accentColor: INDUSTRIAL_PALETTE.HAZARD,
    defaultObstacles: { rock: 5, wall_h: 4, wall_v: 3, wreck: 3, crate: 6, barrel: 5, bush: 5 },
  },
  urbano: {
    id: 'urbano',
    name: 'Descampado Urbano',
    description: 'Asfalto agrietado, muros de ladrillo, coches y bidones',
    borderColor: PALETTE.INK,
    accentColor: PALETTE.STONE,
    defaultObstacles: { rock: 4, wall_h: 9, wall_v: 8, wreck: 7, crate: 10, barrel: 10, bush: 3 },
  },
  futuro: {
    id: 'futuro',
    name: 'Descampado del Futuro',
    description: 'Placas metálicas, energía neón y cobertura industrial',
    borderColor: PALETTE.INK,
    accentColor: PALETTE.COBALT,
    defaultObstacles: { rock: 5, wall_h: 8, wall_v: 7, wreck: 6, crate: 12, barrel: 9, bush: 4 },
  },
  desierto: {
    id: 'desierto',
    name: 'Descampado Desierto',
    description: 'Arena árida, peñascos y barriles oxidados',
    borderColor: PALETTE.UMBER,
    accentColor: PALETTE.RUST,
    defaultObstacles: { rock: 13, wall_h: 4, wall_v: 3, wreck: 5, crate: 10, barrel: 9, bush: 5 },
  },
});

export const DEFAULT_BATTLE_CONFIG = Object.freeze({
  battleName: '',
  theme: 'campo',
  fillBots: true,
  maxBots: MAX_PLAYERS - 1,
  weaponCount: 40,
  medkitCount: 9,
  medkitRange: Object.freeze({ min: 6, max: 11 }),
  allowedWeapons: [...LOOT_WEAPONS],
  weaponCounts: DEFAULT_WEAPON_RANGES,
  obstacles: { ...BATTLE_THEMES.campo.defaultObstacles },
});

// 3/4 perspective obstacles: (w, h) = ground collision footprint; (visW, visH) = perspective sprite dimensions
export const OBSTACLE_TYPES = Object.freeze({
  rock: {
    id: 'rock',
    name: 'Roca',
    w: 24,
    h: 12,
    visW: 26,
    visH: 20,
    solid: true,
    blocksProjectiles: true,
    destructible: false,
    hp: 9999,
  },
  wall_h: {
    id: 'wall_h',
    name: 'Muro',
    w: 40,
    h: 10,
    visW: 42,
    visH: 22,
    solid: true,
    blocksProjectiles: true,
    destructible: false,
    hp: 9999,
  },
  wall_v: {
    id: 'wall_v',
    name: 'Muro',
    w: 12,
    h: 32,
    visW: 14,
    visH: 42,
    solid: true,
    blocksProjectiles: true,
    destructible: false,
    hp: 9999,
  },
  wreck: {
    id: 'wreck',
    name: 'Chatarra',
    w: 38,
    h: 14,
    visW: 42,
    visH: 24,
    solid: true,
    blocksProjectiles: true,
    destructible: false,
    hp: 9999,
  },
  crate: {
    id: 'crate',
    name: 'Caja',
    w: 16,
    h: 11,
    visW: 18,
    visH: 18,
    solid: true,
    blocksProjectiles: true,
    destructible: true,
    hp: 65,
  },
  barrel: {
    id: 'barrel',
    name: 'Bidón',
    w: 12,
    h: 9,
    visW: 14,
    visH: 17,
    solid: true,
    blocksProjectiles: true,
    destructible: true,
    explosive: true,
    explosionRadius: 44,
    explosionDamage: 62,
    hp: 36,
  },
  bush: {
    id: 'bush',
    name: 'Arbusto',
    w: 24,
    h: 14,
    visW: 26,
    visH: 20,
    solid: false,
    blocksProjectiles: false,
    stealth: true,
    destructible: false,
    hp: 9999,
  },
});

export const BOT_NAMES = [
  'Kiko', 'Lola', 'Rambo', 'Paco', 'Trix', 'Zeta', 'Moro', 'Nube',
  'Roco', 'Vega', 'Chispa', 'Toro', 'Gato', 'Bala', 'Sombra', 'Púa',
  'Lobo', 'Rana', 'Tiza', 'Maza', 'Rayo', 'Cobra', 'Pino', 'Duna',
];
