// Procedural "descampado" map generator supporting custom battle configs (theme, obstacles, weapons, medkits)
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  MAX_PLAYERS,
  OBSTACLE_TYPES,
  WEAPONS,
  LOOT_WEAPONS,
  WEAPON_MAX_PER_TYPE,
  DEFAULT_BATTLE_CONFIG,
  PLAYER_RADIUS,
  normalizeCountRange,
} from '../shared/constants.js';
import { rectIntersectsRect, circleIntersectsRect, dist, clamp } from '../shared/collision.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollRange(rand, range) {
  const lo = Math.min(range.min, range.max);
  const hi = Math.max(range.min, range.max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rand() * (hi - lo + 1));
}

function pickFromAllowedWeapons(rand, allowed) {
  const pool = allowed && allowed.length > 0 ? allowed : LOOT_WEAPONS;
  return pool[Math.floor(rand() * pool.length)];
}

export function generateMap(seed = Math.floor(Math.random() * 1e9), rawConfig = null, themeDefs = null) {
  const rand = mulberry32(seed);
  const cfg = rawConfig || DEFAULT_BATTLE_CONFIG;
  const obstacleTypes = themeDefs?.obstacleTypes || OBSTACLE_TYPES;
  const weaponSpecs = themeDefs?.weapons || WEAPONS;
  const allLootWeapons = themeDefs?.lootWeapons || LOOT_WEAPONS;

  const obsCfg = cfg.obstacles || DEFAULT_BATTLE_CONFIG.obstacles;
  const allowedWeapons =
    Array.isArray(cfg.allowedWeapons) && cfg.allowedWeapons.length > 0
      ? cfg.allowedWeapons.filter((id) => allLootWeapons.includes(id))
      : [...allLootWeapons];
  const weaponPool = allowedWeapons.length > 0 ? allowedWeapons : [...allLootWeapons];

  const hasPerWeaponCounts =
    cfg.weaponCounts &&
    typeof cfg.weaponCounts === 'object' &&
    Object.keys(cfg.weaponCounts).length > 0;

  let weaponSpawnQueue = null;
  let targetWeapons = 0;

  if (hasPerWeaponCounts) {
    weaponSpawnQueue = [];
    for (const wId of allLootWeapons) {
      if (cfg.weaponCounts[wId] === undefined) continue;
      const r = normalizeCountRange(cfg.weaponCounts[wId], 0, 0, 0, WEAPON_MAX_PER_TYPE);
      const qty = rollRange(rand, r);
      for (let k = 0; k < qty; k++) {
        weaponSpawnQueue.push(wId);
      }
    }
    // Cap total weapons to keep the 640x368 arena playable and shuffle evenly
    for (let i = weaponSpawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [weaponSpawnQueue[i], weaponSpawnQueue[j]] = [weaponSpawnQueue[j], weaponSpawnQueue[i]];
    }
    if (weaponSpawnQueue.length > 96) {
      weaponSpawnQueue.length = 96;
    }
    targetWeapons = weaponSpawnQueue.length;
  } else {
    const wRange = normalizeCountRange(
      cfg.weaponCount,
      DEFAULT_BATTLE_CONFIG.weaponCount,
      DEFAULT_BATTLE_CONFIG.weaponCount,
      0,
      90
    );
    targetWeapons = rollRange(rand, wRange);
  }

  const medkitRange = normalizeCountRange(
    cfg.medkitCount,
    DEFAULT_BATTLE_CONFIG.medkitCount,
    DEFAULT_BATTLE_CONFIG.medkitCount,
    0,
    30
  );
  const targetMedkits = rollRange(rand, medkitRange);

  const obstacles = [];
  const loot = [];
  let nextObsId = 1;
  let nextLootId = 1;

  const MARGIN_X = 28;
  const MARGIN_TOP = 40;
  const MARGIN_BOT = 24;
  const cx = MAP_WIDTH / 2;
  const cy = MAP_HEIGHT / 2;

  const canPlaceObstacle = (x, y, w, h, pad = 14) => {
    if (x < MARGIN_X || y < MARGIN_TOP || x + w > MAP_WIDTH - MARGIN_X || y + h > MAP_HEIGHT - MARGIN_BOT) {
      return false;
    }
    const candidate = { x, y, w, h };
    for (let i = 0; i < obstacles.length; i++) {
      if (rectIntersectsRect(candidate, obstacles[i], pad)) return false;
    }
    return true;
  };

  const addObstacle = (typeKey, x, y, pad = 14) => {
    const spec = obstacleTypes[typeKey];
    if (!spec) return null;
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!canPlaceObstacle(rx, ry, spec.w, spec.h, pad)) return null;
    const obs = {
      id: nextObsId++,
      type: typeKey,
      x: rx,
      y: ry,
      w: spec.w,
      h: spec.h,
      solid: spec.solid,
      blocksProjectiles: spec.blocksProjectiles,
      stealth: !!spec.stealth,
      destructible: spec.destructible,
      explosive: !!spec.explosive,
      dropsLoot: Boolean(spec.dropsLoot ?? typeKey === 'crate'),
      hp: spec.hp,
      maxHp: spec.hp,
      alive: true,
    };
    obstacles.push(obs);
    return obs;
  };

  // Requested counts per obstacle type (supports base obstacles + any theme-defined custom obstacles, scalar or {min, max}!)
  const counts = {};
  for (const [typeKey, spec] of Object.entries(obstacleTypes)) {
    const maxC = spec.maxCount || (typeKey === 'wreck' ? 12 : typeKey === 'crate' ? 22 : 20);
    const defC = spec.defaultCount ?? DEFAULT_BATTLE_CONFIG.obstacles[typeKey] ?? 0;
    const range = normalizeCountRange(obsCfg[typeKey], defC, defC, 0, maxC);
    counts[typeKey] = rollRange(rand, range);
  }

  // 1. Central ruined cover landmark (only places pieces if their type count > 0)
  if ((counts.wall_h || 0) >= 2) {
    if (addObstacle('wall_h', cx - 58, cy - 36, 15)) counts.wall_h--;
    if (addObstacle('wall_h', cx + 18, cy + 26, 15)) counts.wall_h--;
  }
  if ((counts.crate || 0) >= 1) {
    if (addObstacle('crate', cx - 8, cy - 5, 15)) counts.crate--;
  }
  if ((counts.barrel || 0) >= 2) {
    if (addObstacle('barrel', cx + 32, cy - 22, 15)) counts.barrel--;
    if (addObstacle('barrel', cx - 44, cy + 16, 15)) counts.barrel--;
  }

  // 2. Scattered 3/4 perspective cover across the 640x368 descampado
  // Place larger custom buildings/landmarks first so they always find clear space!
  const sortedTypes = Object.entries(counts).sort((a, b) => {
    const sa = obstacleTypes[a[0]];
    const sb = obstacleTypes[b[0]];
    return (sb.w * sb.h) - (sa.w * sa.h);
  });

  for (const [typeKey, count] of sortedTypes) {
    const spec = obstacleTypes[typeKey];
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 35 + 25) {
      attempts++;
      const x = MARGIN_X + rand() * Math.max(1, MAP_WIDTH - MARGIN_X * 2 - spec.w);
      const y = MARGIN_TOP + rand() * Math.max(1, MAP_HEIGHT - MARGIN_TOP - MARGIN_BOT - spec.h);
      if (dist(x + spec.w / 2, y + spec.h / 2, cx, cy) < 54) continue;
      const pad = spec.stealth ? 6 : 14;
      if (addObstacle(typeKey, x, y, pad)) {
        placed++;
      }
    }
  }

  // 3. Generate 24 fair, well-distributed spawn points in elliptical rings fitting 640x368
  const spawns = [];
  const isPointClear = (x, y, clearRadius = PLAYER_RADIUS + 6) => {
    if (x < MARGIN_X || y < MARGIN_TOP || x > MAP_WIDTH - MARGIN_X || y > MAP_HEIGHT - MARGIN_BOT) return false;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.solid) continue;
      if (circleIntersectsRect(x, y, clearRadius, o.x, o.y, o.w, o.h)) return false;
    }
    return true;
  };

  const ringConfigs = [
    { count: 16, rx: 266, ry: 138, jitter: 16 },
    { count: 8, rx: 148, ry: 78, jitter: 14 },
  ];

  for (const ring of ringConfigs) {
    const baseAngle = rand() * Math.PI * 2;
    for (let i = 0; i < ring.count; i++) {
      let sx = cx;
      let sy = cy;
      let found = false;
      for (let attempt = 0; attempt < 45; attempt++) {
        const angle = baseAngle + (i / ring.count) * Math.PI * 2 + (rand() - 0.5) * 0.22;
        const jx = (rand() - 0.5) * ring.jitter * 2;
        const jy = (rand() - 0.5) * ring.jitter * 2;
        const tx = Math.round(cx + Math.cos(angle) * ring.rx + jx);
        const ty = Math.round(cy + Math.sin(angle) * ring.ry + jy);
        if (isPointClear(tx, ty, PLAYER_RADIUS + 7)) {
          let tooClose = false;
          for (const sp of spawns) {
            if (dist(tx, ty, sp.x, sp.y) < 42) {
              tooClose = true;
              break;
            }
          }
          if (!tooClose) {
            sx = tx;
            sy = ty;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        for (let attempt = 0; attempt < 120; attempt++) {
          const tx = Math.round(MARGIN_X + rand() * (MAP_WIDTH - MARGIN_X * 2));
          const ty = Math.round(MARGIN_TOP + rand() * (MAP_HEIGHT - MARGIN_TOP - MARGIN_BOT));
          if (isPointClear(tx, ty, PLAYER_RADIUS + 5)) {
            sx = tx;
            sy = ty;
            break;
          }
        }
      }
      spawns.push({ x: sx, y: sy });
    }
  }

  for (let i = spawns.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [spawns[i], spawns[j]] = [spawns[j], spawns[i]];
  }

  // 4. Spawn ground weapons & medkits matching configured targetWeapons & targetMedkits
  const addLoot = (kind, weaponId, x, y) => {
    const spec = kind === 'weapon' ? weaponSpecs[weaponId] : null;
    loot.push({
      id: nextLootId++,
      kind,
      weaponId: weaponId || null,
      ammo: spec ? spec.ammo : 0,
      x: Math.round(x),
      y: Math.round(y),
    });
  };

  let remainingWeapons = targetWeapons;
  let queueIdx = 0;
  const nextWeaponId = () => {
    if (weaponSpawnQueue) {
      return weaponSpawnQueue[queueIdx++];
    }
    return pickFromAllowedWeapons(rand, weaponPool);
  };

  // Place weapons reasonably close to spawns first so everyone can scramble for one
  for (let i = 0; i < Math.min(MAX_PLAYERS, spawns.length) && remainingWeapons > 0; i++) {
    const sp = spawns[i];
    for (let attempt = 0; attempt < 24; attempt++) {
      const ang = rand() * Math.PI * 2;
      const d = 22 + rand() * 24;
      const lx = sp.x + Math.cos(ang) * d;
      const ly = sp.y + Math.sin(ang) * d;
      if (!isPointClear(lx, ly, 7)) continue;
      let close = false;
      for (const item of loot) {
        if (dist(lx, ly, item.x, item.y) < 18) {
          close = true;
          break;
        }
      }
      if (!close) {
        addLoot('weapon', nextWeaponId(), lx, ly);
        remainingWeapons--;
        break;
      }
    }
  }

  // Remaining weapons scattered across the field
  let attempts = 0;
  while (remainingWeapons > 0 && attempts < targetWeapons * 25 + 100) {
    attempts++;
    const lx = MARGIN_X + rand() * (MAP_WIDTH - MARGIN_X * 2);
    const ly = MARGIN_TOP + rand() * (MAP_HEIGHT - MARGIN_TOP - MARGIN_BOT);
    if (!isPointClear(lx, ly, 7)) continue;
    let close = false;
    for (const item of loot) {
      if (dist(lx, ly, item.x, item.y) < 18) {
        close = true;
        break;
      }
    }
    if (!close) {
      addLoot('weapon', nextWeaponId(), lx, ly);
      remainingWeapons--;
    }
  }

  // Medkits
  let remainingMedkits = targetMedkits;
  attempts = 0;
  while (remainingMedkits > 0 && attempts < targetMedkits * 25 + 80) {
    attempts++;
    const lx = MARGIN_X + rand() * (MAP_WIDTH - MARGIN_X * 2);
    const ly = MARGIN_TOP + rand() * (MAP_HEIGHT - MARGIN_TOP - MARGIN_BOT);
    if (!isPointClear(lx, ly, 7)) continue;
    let close = false;
    for (const item of loot) {
      if (dist(lx, ly, item.x, item.y) < 22) {
        close = true;
        break;
      }
    }
    if (!close) {
      addLoot('medkit', null, lx, ly);
      remainingMedkits--;
    }
  }

  return {
    seed,
    obstacles,
    loot,
    spawns,
    nextLootId,
  };
}

export function randomCrateDrop(rand, allowedWeapons = LOOT_WEAPONS) {
  const r = rand();
  if (r < 0.35) return { kind: 'medkit', weaponId: null };
  const pool = allowedWeapons && allowedWeapons.length > 0 ? allowedWeapons : LOOT_WEAPONS;
  const weaponId = pool[Math.floor(rand() * pool.length)];
  return { kind: 'weapon', weaponId };
}
