// Tactical AI controller for bot fighters on the 640x368 fixed battlefield
import { WEAPONS, ARENA_MIN_X, ARENA_MAX_X, ARENA_MIN_Y, ARENA_MAX_Y, PLAYER_RADIUS } from '../shared/constants.js';
import { dist, hasLineOfSight, circleIntersectsRect } from '../shared/collision.js';

function steerAroundObstacles(bot, dirX, dirY, obstacles) {
  const len = Math.hypot(dirX, dirY);
  if (len < 0.001) return { x: 0, y: 0 };
  const nx = dirX / len;
  const ny = dirY / len;

  const probeDist = 14;
  const isBlocked = (ang) => {
    const px = bot.x + Math.cos(ang) * probeDist;
    const py = bot.y + Math.sin(ang) * probeDist;
    if (px < ARENA_MIN_X + 2 || py < ARENA_MIN_Y + 2 || px > ARENA_MAX_X - 2 || py > ARENA_MAX_Y - 2) return true;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.alive || !o.solid) continue;
      if (circleIntersectsRect(px, py, PLAYER_RADIUS + 1.5, o.x, o.y, o.w, o.h)) return true;
    }
    return false;
  };

  const baseAngle = Math.atan2(ny, nx);
  if (!isBlocked(baseAngle)) return { x: nx, y: ny };

  const offsets = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4];
  for (let i = 0; i < offsets.length; i++) {
    const testAng = baseAngle + offsets[i] * (bot.aiStrafeDir || 1);
    if (!isBlocked(testAng)) {
      return { x: Math.cos(testAng), y: Math.sin(testAng) };
    }
  }
  return { x: -nx, y: -ny };
}

export function updateBotInput(bot, room, dt) {
  bot.aiTimer = (bot.aiTimer || 0) - dt;
  if (bot.aiTimer <= 0) {
    bot.aiTimer = 0.25 + Math.random() * 0.35;
    bot.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
    bot.aiWanderAngle = Math.random() * Math.PI * 2;
  }

  const input = {
    mx: 0,
    my: 0,
    aim: bot.aim,
    attack: false,
    pickup: false,
    dash: false,
    slot: null,
  };

  const weaponsMap = room.weapons || WEAPONS;
  const activeSlot = bot.weapons[bot.activeSlot];
  const activeWeapon = weaponsMap[activeSlot ? activeSlot.id : 'fists'] || WEAPONS.fists;
  const hasRealWeapon = activeWeapon.id !== 'fists';

  if (!hasRealWeapon) {
    for (let i = 0; i < bot.weapons.length; i++) {
      if (bot.weapons[i] && bot.weapons[i].id !== 'fists' && bot.weapons[i].ammo > 0) {
        input.slot = i;
        break;
      }
    }
  }

  // 1. Escape fire puddles immediately
  for (let i = 0; i < room.fires.length; i++) {
    const f = room.fires[i];
    const d = dist(bot.x, bot.y, f.x, f.y);
    if (d < f.radius + 10) {
      const ang = Math.atan2(bot.y - f.y, bot.x - f.x);
      const steered = steerAroundObstacles(bot, Math.cos(ang), Math.sin(ang), room.obstacles);
      input.mx = steered.x;
      input.my = steered.y;
      input.dash = bot.dashCooldown <= 0;
      bot.input = input;
      return;
    }
  }

  // 2. Scan for nearest visible rival AND nearest overall rival (to hunt when none in direct LOS)
  let nearestVisible = null;
  let nearestVisibleDist = Infinity;
  let nearestAny = null;
  let nearestAnyDist = Infinity;

  for (const other of room.players.values()) {
    if (!other.alive || other.id === bot.id) continue;
    const d = dist(bot.x, bot.y, other.x, other.y);
    const hidden = other.inBush && d > 42 && other.revealTimer <= 0;
    if (hidden) continue;

    if (d < nearestAnyDist) {
      nearestAny = other;
      nearestAnyDist = d;
    }
    if (d < 340 && d < nearestVisibleDist && hasLineOfSight(bot.x, bot.y, other.x, other.y, room.obstacles)) {
      nearestVisible = other;
      nearestVisibleDist = d;
    }
  }

  // 3. Scan for nearby loot
  let bestLoot = null;
  let bestLootScore = Infinity;

  for (let i = 0; i < room.loot.length; i++) {
    const item = room.loot[i];
    const d = dist(bot.x, bot.y, item.x, item.y);
    if (d > 220) continue;
    if (item.kind === 'medkit' && bot.hp < 72) {
      const score = d * (bot.hp < 45 ? 0.45 : 0.85);
      if (score < bestLootScore) {
        bestLootScore = score;
        bestLoot = item;
      }
    } else if (item.kind === 'weapon' && !hasRealWeapon) {
      if (d < bestLootScore) {
        bestLootScore = d;
        bestLoot = item;
      }
    }
  }

  let moveX = 0;
  let moveY = 0;

  if (bestLoot && (!nearestVisible || (!hasRealWeapon && nearestVisibleDist > 42) || bot.hp < 40)) {
    moveX = bestLoot.x - bot.x;
    moveY = bestLoot.y - bot.y;
    if (dist(bot.x, bot.y, bestLoot.x, bestLoot.y) < 18) {
      input.pickup = true;
    }
  } else if (nearestVisible) {
    const angToEnemy = Math.atan2(nearestVisible.y - bot.y, nearestVisible.x - bot.x);
    let idealDist = 80;
    if (activeWeapon.type === 'melee') idealDist = 14;
    else if (activeWeapon.id === 'shotgun') idealDist = 52;
    else if (activeWeapon.id === 'rifle') idealDist = 145;
    else if (activeWeapon.id === 'molotov' || activeWeapon.id === 'brick') idealDist = 88;

    if (bot.hp < 28 && hasRealWeapon && activeWeapon.type !== 'melee') {
      moveX = -Math.cos(angToEnemy) + Math.cos(angToEnemy + Math.PI / 2) * (bot.aiStrafeDir || 1) * 0.6;
      moveY = -Math.sin(angToEnemy) + Math.sin(angToEnemy + Math.PI / 2) * (bot.aiStrafeDir || 1) * 0.6;
    } else if (nearestVisibleDist > idealDist + 14) {
      moveX = Math.cos(angToEnemy) + Math.cos(angToEnemy + Math.PI / 2) * (bot.aiStrafeDir || 1) * 0.35;
      moveY = Math.sin(angToEnemy) + Math.sin(angToEnemy + Math.PI / 2) * (bot.aiStrafeDir || 1) * 0.35;
    } else if (nearestVisibleDist < idealDist - 14) {
      moveX = -Math.cos(angToEnemy) * 0.7 + Math.cos(angToEnemy + Math.PI / 2) * (bot.aiStrafeDir || 1) * 0.7;
      moveY = -Math.sin(angToEnemy) * 0.7 + Math.sin(angToEnemy + Math.PI / 2) * (bot.aiStrafeDir || 1) * 0.7;
    } else {
      moveX = Math.cos(angToEnemy + Math.PI / 2) * (bot.aiStrafeDir || 1);
      moveY = Math.sin(angToEnemy + Math.PI / 2) * (bot.aiStrafeDir || 1);
    }

    if (bot.dashCooldown <= 0 && (bot.hurtFlash > 0 || (activeWeapon.type === 'melee' && nearestVisibleDist < 55 && nearestVisibleDist > 24))) {
      if (Math.random() < 0.08) input.dash = true;
    }
  } else if (nearestAny) {
    // Advance around cover toward nearest rival across the descampado
    const ang = Math.atan2(nearestAny.y - bot.y, nearestAny.x - bot.x);
    moveX = Math.cos(ang) + Math.cos(ang + Math.PI / 2) * (bot.aiStrafeDir || 1) * 0.25;
    moveY = Math.sin(ang) + Math.sin(ang + Math.PI / 2) * (bot.aiStrafeDir || 1) * 0.25;
  } else {
    // Patrol around the field searching bushes
    const ang = bot.aiWanderAngle || 0;
    moveX = Math.cos(ang);
    moveY = Math.sin(ang);
  }

  if (!hasRealWeapon) {
    for (let i = 0; i < room.loot.length; i++) {
      if (room.loot[i].kind === 'weapon' && dist(bot.x, bot.y, room.loot[i].x, room.loot[i].y) < 18) {
        input.pickup = true;
        break;
      }
    }
  }

  if (nearestVisible) {
    const inaccuracy = (Math.random() - 0.5) * 0.16;
    input.aim = Math.atan2(nearestVisible.y - bot.y, nearestVisible.x - bot.x) + inaccuracy;
    const attackRange = activeWeapon.type === 'melee' ? activeWeapon.range + 6 : Math.min(activeWeapon.range, 240);
    if (nearestVisibleDist <= attackRange) {
      input.attack = true;
    }
  } else if (Math.hypot(moveX, moveY) > 0.01) {
    input.aim = Math.atan2(moveY, moveX);
  }

  const steered = steerAroundObstacles(bot, moveX, moveY, room.obstacles);
  input.mx = steered.x;
  input.my = steered.y;
  bot.input = input;
}
