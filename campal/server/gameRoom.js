// Authoritative 24-player Battle Royale Game Room (hostless matchmaking, 10s free-move warmup, 640x368 arena)
import {
  MAX_PLAYERS,
  TICK_RATE,
  SNAPSHOT_RATE,
  MAP_WIDTH,
  MAP_HEIGHT,
  ARENA_MIN_X,
  ARENA_MAX_X,
  ARENA_MIN_Y,
  ARENA_MAX_Y,
  PLAYER_RADIUS,
  PLAYER_MAX_HP,
  PLAYER_SPEED,
  DASH_SPEED,
  DASH_DURATION,
  DASH_COOLDOWN,
  WEAPONS,
  LOOT_WEAPONS,
  WEAPON_MAX_PER_TYPE,
  OBSTACLE_TYPES,
  BATTLE_THEMES,
  DEFAULT_BATTLE_CONFIG,
  BOT_NAMES,
  SKIN_PRESETS,
  normalizeCountRange,
} from '../shared/constants.js';
import {
  clamp,
  dist,
  angleDiff,
  resolveCircleRect,
  segmentIntersectsRect,
  hasLineOfSight,
  pointInBush,
} from '../shared/collision.js';
import { generateMap, mulberry32, randomCrateDrop } from './mapGen.js';
import { updateBotInput } from './botAI.js';
import { getThemesCatalog } from './spriteStore.js';
import { resolveThemeDefinitions } from '../shared/themeSchema.js';

export const WAITING_DURATION = 10.0; // 10 seconds waiting for more players (free movement, no combat/pickups)
export const READY_DURATION = 1.2;    // "¡Preparados!" phase duration
export const FIGHT_BANNER_DURATION = 1.2; // "¡A luchar!" banner duration

function sanitizeName(raw, fallback) {
  const cleaned = String(raw || '')
    .replace(/[^\p{L}\p{N}_\- ]/gu, '')
    .trim()
    .slice(0, 14);
  return cleaned || fallback;
}

function sanitizeBattleConfig(raw = {}, fallbackName = 'BATALLA') {
  // Read live themes catalog from sprites/themes/ so new themes & their custom obstacles/weapons work dynamically
  const liveThemes = getThemesCatalog();
  const reqTheme = typeof raw.theme === 'string' ? raw.theme.trim().toLowerCase() : '';
  const themeId =
    reqTheme && (liveThemes[reqTheme] || BATTLE_THEMES[reqTheme])
      ? reqTheme
      : DEFAULT_BATTLE_CONFIG.theme;
  const themeEntry = liveThemes[themeId] || { config: BATTLE_THEMES[themeId] || BATTLE_THEMES.campo };
  const themeSpec = themeEntry.config || BATTLE_THEMES[themeId] || BATTLE_THEMES.campo;
  const themeDefs = resolveThemeDefinitions(themeEntry);
  const defaultObs = themeDefs.defaultObstacles;

  const rawName = String(raw.battleName || '')
    .replace(/[^\p{L}\p{N}_\- #]/gu, '')
    .trim()
    .slice(0, 24);

  const hasWeaponCounts =
    raw.weaponCounts && typeof raw.weaponCounts === 'object' && Object.keys(raw.weaponCounts).length > 0;

  let weaponCounts = null;
  let allowedWeapons;
  let weaponCountSummary;

  if (hasWeaponCounts) {
    weaponCounts = {};
    allowedWeapons = [];
    let minSum = 0;
    let maxSum = 0;
    for (const wId of themeDefs.lootWeapons) {
      if (raw.weaponCounts[wId] === undefined) {
        weaponCounts[wId] = { min: 0, max: 0 };
        continue;
      }
      const r = normalizeCountRange(raw.weaponCounts[wId], 0, 0, 0, WEAPON_MAX_PER_TYPE);
      weaponCounts[wId] = r;
      if (r.max > 0) allowedWeapons.push(wId);
      minSum += r.min;
      maxSum += r.max;
    }
    weaponCountSummary = Math.round((minSum + maxSum) / 2);
  } else {
    allowedWeapons =
      Array.isArray(raw.allowedWeapons) && raw.allowedWeapons.length > 0
        ? raw.allowedWeapons.filter((w) => themeDefs.lootWeapons.includes(w))
        : [...themeDefs.lootWeapons];
    if (allowedWeapons.length === 0) allowedWeapons = [...themeDefs.lootWeapons];
    weaponCountSummary = clamp(Math.round(Number(raw.weaponCount ?? DEFAULT_BATTLE_CONFIG.weaponCount)), 0, 90);
  }

  const medkitCount = normalizeCountRange(
    raw.medkitCount,
    DEFAULT_BATTLE_CONFIG.medkitCount,
    DEFAULT_BATTLE_CONFIG.medkitCount,
    0,
    30
  );

  const srcObs = raw.obstacles && typeof raw.obstacles === 'object' ? raw.obstacles : defaultObs;
  const obstacles = {};
  for (const [obsId, obsSpec] of Object.entries(themeDefs.obstacleTypes)) {
    const maxC = obsSpec.maxCount || (obsId === 'wreck' ? 12 : obsId === 'crate' ? 22 : 20);
    const defC = defaultObs[obsId] ?? obsSpec.defaultCount ?? 0;
    obstacles[obsId] = normalizeCountRange(srcObs[obsId], defC, defC, 0, maxC);
  }

  const explicitFillBots = raw.fillBots !== undefined ? Boolean(raw.fillBots) : undefined;
  const rawMaxBots = raw.maxBots !== undefined ? Number(raw.maxBots) : undefined;
  let maxBots;
  if (rawMaxBots !== undefined && Number.isFinite(rawMaxBots)) {
    maxBots = clamp(Math.round(rawMaxBots), 0, MAX_PLAYERS - 1);
  } else if (explicitFillBots === false) {
    maxBots = 0;
  } else {
    maxBots = DEFAULT_BATTLE_CONFIG.maxBots;
  }
  const fillBots = explicitFillBots !== undefined ? explicitFillBots && maxBots > 0 : maxBots > 0;

  return {
    config: {
      battleName: rawName || fallbackName,
      theme: themeId,
      baseTheme: themeEntry.baseTheme || themeSpec.baseTheme || themeId,
      themeName: themeSpec.name || themeId,
      fillBots,
      maxBots: fillBots ? Math.max(1, maxBots) : 0,
      weaponCount: weaponCountSummary,
      weaponCounts,
      medkitCount,
      allowedWeapons: allowedWeapons.length > 0 ? allowedWeapons : [...themeDefs.lootWeapons],
      obstacles,
    },
    themeDefs,
  };
}

export class GameRoom {
  constructor(roomId = 'BATALLA-1', options = {}) {
    this.roomId = roomId;
    this.createdAt = Date.now();
    this.onMatchEnd = typeof options.onMatchEnd === 'function' ? options.onMatchEnd : null;
    this.hasExplicitConfig = Boolean(options.config && Object.keys(options.config).length > 0);
    const resolved = sanitizeBattleConfig(options.config || options, roomId);
    this.config = resolved.config;
    this.themeDefs = resolved.themeDefs;
    this.obstacleTypes = resolved.themeDefs.obstacleTypes;
    this.weapons = resolved.themeDefs.weapons;
    // States: 'waiting' (10s open join + free move) -> 'ready' ("¡Preparados!") -> 'playing' ("¡A luchar!") -> 'ended'
    this.state = 'waiting';
    this.fillBots = this.config.fillBots;
    this.maxBots = this.config.maxBots;
    this.clients = new Map(); // clientId -> { id, ws, name, skin }
    this.nextClientId = 1;

    this.mapSeed = 0;
    this.rand = mulberry32(1);
    this.obstacles = [];
    this.loot = [];
    this.spawns = [];
    this.spawnIdx = 0;
    this.nextLootId = 1;
    this.players = new Map();
    this.projectiles = [];
    this.nextProjId = 1;
    this.fires = [];
    this.nextFireId = 1;
    this.corpses = [];
    this.killFeed = [];
    this.pendingEvents = [];

    this.matchTime = 0;
    this.waitTimer = WAITING_DURATION;
    this.readyTimer = 0;
    this.fightBannerTimer = 0;
    this.endTimer = 0;
    this.winnerId = null;
    this.totalFighters = 0;

    this._tickCount = 0;
    this._snapshotEvery = Math.max(1, Math.round(TICK_RATE / SNAPSHOT_RATE));
    this._interval = null;

    this._initMap(options.seed);
  }

  _initMap(seed = Math.floor(Math.random() * 1e9)) {
    const map = generateMap(seed, this.config, this.themeDefs);
    this.mapSeed = map.seed;
    this.rand = mulberry32(map.seed ^ 0x9e3779b9);
    this.obstacles = map.obstacles;
    this.loot = map.loot;
    this.spawns = map.spawns;
    this.spawnIdx = 0;
    this.nextLootId = map.nextLootId;

    this.players.clear();
    this.projectiles = [];
    this.fires = [];
    this.corpses = [];
    this.killFeed = [];
    this.pendingEvents = [];
    this.matchTime = 0;
    this.waitTimer = WAITING_DURATION;
    this.readyTimer = 0;
    this.fightBannerTimer = 0;
    this.endTimer = 0;
    this.winnerId = null;
    this.state = 'waiting';
  }

  startLoop() {
    if (this._interval) return;
    const dt = 1 / TICK_RATE;
    this._interval = setInterval(() => this.tick(dt), 1000 / TICK_RATE);
  }

  stopLoop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  getHumanCount() {
    return this.clients.size;
  }

  isOpenForJoining() {
    return this.state === 'waiting' && this.clients.size < MAX_PLAYERS;
  }

  isFull() {
    return this.clients.size >= MAX_PLAYERS;
  }

  getSummary() {
    const liveThemes = getThemesCatalog();
    const themeSpec =
      liveThemes[this.config.theme]?.config ||
      BATTLE_THEMES[this.config.theme] ||
      BATTLE_THEMES.campo;
    return {
      roomId: this.roomId,
      battleName: this.config.battleName,
      theme: this.config.theme,
      themeName: this.config.themeName || themeSpec.name,
      players: this.clients.size,
      maxPlayers: MAX_PLAYERS,
      state: this.state,
      open: this.isOpenForJoining(),
      waitTimer: Number(Math.max(0, this.waitTimer).toFixed(1)),
      weaponCount: this.config.weaponCount,
      fillBots: this.fillBots,
      maxBots: this.maxBots,
    };
  }

  addClient(ws, name, skin = 0, fillBotsPref = undefined) {
    if (!this.isOpenForJoining()) {
      ws.sendJSON({ type: 'error', message: 'La batalla ya está llena o en curso.' });
      ws.close(4000, 'Room not open');
      return null;
    }

    if (fillBotsPref !== undefined && this.clients.size === 0 && !this.hasExplicitConfig) {
      this.fillBots = Boolean(fillBotsPref);
      this.maxBots = this.fillBots ? Math.max(1, this.maxBots || MAX_PLAYERS - 1) : 0;
    }

    const id = this.nextClientId++;
    const safeSkin = Number.isInteger(skin) ? clamp(skin, 0, SKIN_PRESETS.length - 1) : id % SKIN_PRESETS.length;
    const client = {
      id,
      ws,
      name: sanitizeName(name, `Jugador${id}`),
      skin: safeSkin,
    };

    this.clients.set(id, client);

    // Spawn player immediately on the descampado so they can walk around during the 10s wait
    const sp = this.spawns[this.spawnIdx++ % this.spawns.length];
    const p = this._createPlayer(client.id, client.name, client.skin, sp.x, sp.y, false);
    this.players.set(client.id, p);
    this.totalFighters = this.players.size;

    ws.sendJSON({
      type: 'welcome',
      id,
      roomId: this.roomId,
      state: this.state,
    });

    // Send match_start to the newly joined player
    ws.sendJSON(this._buildMatchInitPayload(client.id, false));

    // Notify existing players in the room that a new fighter arrived
    this.pendingEvents.push({
      type: 'player_join',
      player: {
        id: p.id,
        name: p.name,
        skin: p.skin,
        isBot: false,
        x: Math.round(p.x),
        y: Math.round(p.y),
      },
    });

    this.startLoop();

    // If the battle reaches 24 human players during the 10s wait, start immediately!
    if (this.clients.size >= MAX_PLAYERS && this.state === 'waiting') {
      this._beginReadyPhase();
    } else {
      this._broadcastSnapshot();
    }

    return client;
  }

  removeClient(id) {
    if (!this.clients.has(id)) return;
    this.clients.delete(id);

    const p = this.players.get(id);
    if (p) {
      if (this.state === 'waiting') {
        // Remove cleanly during warmup so slot is freed
        this.players.delete(id);
        this.totalFighters = this.players.size;
        this.pendingEvents.push({ type: 'player_leave', id });
      } else if (p.alive && (this.state === 'playing' || this.state === 'ready')) {
        this._eliminatePlayer(p, null, 'desconexión');
      }
    }

    if (this.clients.size === 0) {
      this.stopLoop();
    }
  }

  handleMessage(clientId, msg) {
    const client = this.clients.get(clientId);
    if (!client || !msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'input': {
        const p = this.players.get(clientId);
        if (!p || !p.alive || p.isBot) return;
        const mx = Number(msg.mx) || 0;
        const my = Number(msg.my) || 0;
        const mLen = Math.hypot(mx, my);
        p.input.mx = mLen > 1 ? mx / mLen : mx;
        p.input.my = mLen > 1 ? my / mLen : my;
        if (Number.isFinite(msg.aim)) p.input.aim = msg.aim;

        // During 'waiting' and 'ready', ignore attacks, pickups, and dashes
        if (this.state === 'playing') {
          p.input.attack = Boolean(msg.attack);
          if (msg.pickup) p.input.pickup = true;
          if (msg.dash) p.input.dash = true;
          if (msg.slot === 0 || msg.slot === 1) p.input.slot = msg.slot;
        } else {
          p.input.attack = false;
          p.input.pickup = false;
          p.input.dash = false;
        }
        break;
      }
      case 'custom_char': {
        const p = this.players.get(clientId);
        if (!p || !msg.data || typeof msg.data !== 'object') return;
        const w = Number(msg.data.w) || 0;
        const h = Number(msg.data.h) || 0;
        if (w >= 4 && w <= 32 && h >= 4 && h <= 32 && Array.isArray(msg.data.f) && msg.data.f.length <= 12) {
          p.customChar = msg.data;
          this.pendingEvents.push({ type: 'custom_char', id: p.id, data: msg.data });
        }
        break;
      }
      case 'ping': {
        client.ws.sendJSON({ type: 'pong', t: msg.t });
        break;
      }
    }
  }

  // Compatibility helper for direct simulation tests
  startMatch(seed = Math.floor(Math.random() * 1e9)) {
    this._initMap(seed);
    this._beginReadyPhase();
    this.startLoop();
  }

  _beginReadyPhase() {
    if (this.state !== 'waiting') return;

    // Human players always have priority; add at most maxBots into remaining free slots (up to 24 total)
    const humans = this.players.size;
    let targetTotal;
    if (this.fillBots && this.maxBots > 0) {
      const effectiveMaxBots =
        humans === 0 && this.maxBots >= MAX_PLAYERS - 1 ? MAX_PLAYERS : this.maxBots;
      targetTotal = Math.min(MAX_PLAYERS, humans + effectiveMaxBots);
    } else {
      targetTotal = Math.max(humans, 2);
    }
    let botNum = 0;
    while (this.players.size < Math.min(MAX_PLAYERS, targetTotal)) {
      const botId = 1000 + botNum;
      const botName = BOT_NAMES[botNum % BOT_NAMES.length];
      const sp = this.spawns[this.spawnIdx++ % this.spawns.length];
      const skin = botNum % SKIN_PRESETS.length;
      const bot = this._createPlayer(botId, botName, skin, sp.x, sp.y, true);
      this.players.set(botId, bot);
      this.pendingEvents.push({
        type: 'player_join',
        player: {
          id: bot.id,
          name: bot.name,
          skin: bot.skin,
          isBot: true,
          x: Math.round(bot.x),
          y: Math.round(bot.y),
        },
      });
      botNum++;
    }

    this.totalFighters = this.players.size;
    this.state = 'ready';
    this.waitTimer = 0;
    this.readyTimer = READY_DURATION;
    this.pendingEvents.push({ type: 'banner', text: '¡Preparados!' });
    this._broadcastSnapshot();
  }

  _beginPlayingPhase() {
    this.state = 'playing';
    this.readyTimer = 0;
    this.fightBannerTimer = FIGHT_BANNER_DURATION;
    this.pendingEvents.push({ type: 'fight_start', text: '¡A luchar!' });
    this._broadcastSnapshot();
  }

  _createPlayer(id, name, skin, x, y, isBot) {
    const cx = clamp(x, ARENA_MIN_X, ARENA_MAX_X);
    const cy = clamp(y, ARENA_MIN_Y, ARENA_MAX_Y);
    return {
      id,
      name,
      skin,
      isBot,
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      kbx: 0,
      kby: 0,
      aim: Math.atan2(MAP_HEIGHT / 2 - cy, MAP_WIDTH / 2 - cx),
      hp: PLAYER_MAX_HP,
      alive: true,
      inBush: false,
      revealTimer: 0,
      hurtFlash: 0,
      attackCooldown: 0,
      attackAnim: 0,
      dashTimer: 0,
      dashCooldown: 0,
      dashDx: 0,
      dashDy: 0,
      weapons: [
        { id: 'fists', ammo: Infinity },
        null,
      ],
      activeSlot: 0,
      kills: 0,
      damageDealt: 0,
      placement: 0,
      survivalTime: 0,
      input: { mx: 0, my: 0, aim: 0, attack: false, pickup: false, dash: false, slot: null },
    };
  }

  _buildMatchInitPayload(forClientId, spectator) {
    return {
      type: 'match_start',
      you: forClientId,
      roomId: this.roomId,
      battleName: this.config.battleName,
      theme: this.config.theme,
      baseTheme: this.config.baseTheme,
      themeObstacles: this.obstacleTypes,
      themeWeapons: this.weapons,
      state: this.state,
      waitTimer: Number(this.waitTimer.toFixed(1)),
      spectator,
      mapSeed: this.mapSeed,
      totalFighters: this.totalFighters,
      obstacles: this.obstacles.map((o) => ({
        id: o.id,
        type: o.type,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        hp: o.hp,
        maxHp: o.maxHp,
        alive: o.alive,
      })),
      loot: this.loot.map((l) => ({
        id: l.id,
        kind: l.kind,
        weaponId: l.weaponId,
        x: l.x,
        y: l.y,
      })),
      roster: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        skin: p.skin,
        isBot: p.isBot,
        x: Math.round(p.x),
        y: Math.round(p.y),
        customChar: p.customChar || null,
      })),
    };
  }

  broadcast(obj) {
    const raw = JSON.stringify(obj);
    for (const client of this.clients.values()) {
      client.ws.send(raw);
    }
  }

  tick(dt) {
    if (this.state === 'ended') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.stopLoop();
      }
      return;
    }

    // 1. WAITING PHASE (10s for more players to join; free movement, no combat/pickups)
    if (this.state === 'waiting') {
      this.waitTimer -= dt;
      const aliveList = [];
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        this._updatePlayerMovementOnly(p, dt);
        aliveList.push(p);
      }
      this._separateAndConstrainPlayers(aliveList);

      if (this.waitTimer <= 0 || this.clients.size >= MAX_PLAYERS) {
        this._beginReadyPhase();
        return;
      }

      this._tickCount++;
      if (this._tickCount % this._snapshotEvery === 0) {
        this._broadcastSnapshot();
      }
      return;
    }

    // 2. READY PHASE ("¡Preparados!" announcement before unlocking combat)
    if (this.state === 'ready') {
      this.readyTimer -= dt;
      const aliveList = [];
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (!p.isBot) {
          this._updatePlayerMovementOnly(p, dt);
        }
        aliveList.push(p);
      }
      this._separateAndConstrainPlayers(aliveList);

      if (this.readyTimer <= 0) {
        this._beginPlayingPhase();
        return;
      }

      this._tickCount++;
      if (this._tickCount % this._snapshotEvery === 0) {
        this._broadcastSnapshot();
      }
      return;
    }

    // 3. PLAYING PHASE ("¡A luchar!" -> full combat)
    this.matchTime += dt;
    if (this.fightBannerTimer > 0) {
      this.fightBannerTimer = Math.max(0, this.fightBannerTimer - dt);
    }

    const aliveList = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.isBot) updateBotInput(p, this, dt);
      this._updatePlayer(p, dt);
      if (p.alive) aliveList.push(p);
    }

    this._separateAndConstrainPlayers(aliveList);

    this._updateProjectiles(dt);
    this._updateFires(dt);

    const survivors = [];
    for (const p of this.players.values()) {
      if (p.alive) survivors.push(p);
    }

    if (survivors.length <= 1) {
      this._finishMatch(survivors[0] || null);
      return;
    }

    this._tickCount++;
    if (this._tickCount % this._snapshotEvery === 0) {
      this._broadcastSnapshot();
    }
  }

  _separateAndConstrainPlayers(aliveList) {
    for (let i = 0; i < aliveList.length; i++) {
      const a = aliveList[i];
      for (let j = i + 1; j < aliveList.length; j++) {
        const b = aliveList[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minDist = PLAYER_RADIUS * 1.9;
        if (d2 > 0.001 && d2 < minDist * minDist) {
          const d = Math.sqrt(d2);
          const push = (minDist - d) * 0.35;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    for (let i = 0; i < aliveList.length; i++) {
      this._constrainPlayer(aliveList[i]);
    }
  }

  _updatePlayerMovementOnly(p, dt) {
    p.aim = p.input.aim;
    p.vx = p.input.mx * PLAYER_SPEED;
    p.vy = p.input.my * PLAYER_SPEED;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    this._constrainPlayer(p);
    p.inBush = pointInBush(p.x, p.y, this.obstacles);
  }

  _updatePlayer(p, dt) {
    p.survivalTime = this.matchTime;
    if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    if (p.attackAnim > 0) p.attackAnim = Math.max(0, p.attackAnim - dt);
    if (p.hurtFlash > 0) p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    if (p.revealTimer > 0) p.revealTimer = Math.max(0, p.revealTimer - dt);
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);

    if (p.input.slot !== null) {
      if (p.input.slot === 0 || (p.input.slot === 1 && p.weapons[1])) {
        p.activeSlot = p.input.slot;
      }
      p.input.slot = null;
    }

    p.aim = p.input.aim;

    if (p.input.dash) {
      p.input.dash = false;
      if (p.dashCooldown <= 0 && p.dashTimer <= 0) {
        const len = Math.hypot(p.input.mx, p.input.my);
        p.dashDx = len > 0.1 ? p.input.mx / len : Math.cos(p.aim);
        p.dashDy = len > 0.1 ? p.input.my / len : Math.sin(p.aim);
        p.dashTimer = DASH_DURATION;
        p.dashCooldown = DASH_COOLDOWN;
        this.pendingEvents.push({ type: 'dash', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
      }
    }

    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      p.vx = p.dashDx * DASH_SPEED;
      p.vy = p.dashDy * DASH_SPEED;
    } else {
      p.vx = p.input.mx * PLAYER_SPEED;
      p.vy = p.input.my * PLAYER_SPEED;
    }

    p.x += (p.vx + p.kbx) * dt;
    p.y += (p.vy + p.kby) * dt;

    const decay = Math.exp(-10 * dt);
    p.kbx *= decay;
    p.kby *= decay;
    if (Math.abs(p.kbx) < 0.8) p.kbx = 0;
    if (Math.abs(p.kby) < 0.8) p.kby = 0;

    this._constrainPlayer(p);

    p.inBush = pointInBush(p.x, p.y, this.obstacles);
    this._handlePickups(p);

    if (p.input.attack && p.attackCooldown <= 0) {
      this._performAttack(p);
    }
  }

  _constrainPlayer(p) {
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (!o.alive || !o.solid) continue;
      resolveCircleRect(p, PLAYER_RADIUS, o);
    }

    if (p.x < ARENA_MIN_X) {
      p.x = ARENA_MIN_X;
      if (p.kbx < 0) p.kbx = 0;
    } else if (p.x > ARENA_MAX_X) {
      p.x = ARENA_MAX_X;
      if (p.kbx > 0) p.kbx = 0;
    }

    if (p.y < ARENA_MIN_Y) {
      p.y = ARENA_MIN_Y;
      if (p.kby < 0) p.kby = 0;
    } else if (p.y > ARENA_MAX_Y) {
      p.y = ARENA_MAX_Y;
      if (p.kby > 0) p.kby = 0;
    }
  }

  _handlePickups(p) {
    const manual = p.input.pickup;
    p.input.pickup = false;

    let nearestIdx = -1;
    let nearestD = 18;
    for (let i = 0; i < this.loot.length; i++) {
      const item = this.loot[i];
      const d = dist(p.x, p.y, item.x, item.y);
      if (d < nearestD) {
        nearestD = d;
        nearestIdx = i;
      }
    }

    if (nearestIdx === -1) return;
    const item = this.loot[nearestIdx];

    if (item.kind === 'medkit') {
      if (p.hp < PLAYER_MAX_HP && (manual || nearestD < 12)) {
        p.hp = Math.min(PLAYER_MAX_HP, p.hp + 38);
        this.loot.splice(nearestIdx, 1);
        this.pendingEvents.push({ type: 'loot_rm', id: item.id });
        this.pendingEvents.push({ type: 'heal', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
      }
      return;
    }

    const hasEmptySlot = p.weapons[0].id === 'fists' || !p.weapons[1];
    if (!manual && !(hasEmptySlot && nearestD < 12)) return;

    let dropWeapon = null;
    if (p.weapons[0].id === 'fists') {
      p.weapons[0] = { id: item.weaponId, ammo: item.ammo };
      p.activeSlot = 0;
    } else if (!p.weapons[1]) {
      p.weapons[1] = { id: item.weaponId, ammo: item.ammo };
      if (manual) p.activeSlot = 1;
    } else if (manual) {
      dropWeapon = p.weapons[p.activeSlot];
      p.weapons[p.activeSlot] = { id: item.weaponId, ammo: item.ammo };
    } else {
      return;
    }

    this.loot.splice(nearestIdx, 1);
    this.pendingEvents.push({ type: 'loot_rm', id: item.id });
    this.pendingEvents.push({ type: 'pickup', id: p.id, weapon: item.weaponId });

    if (dropWeapon && dropWeapon.id !== 'fists' && dropWeapon.ammo > 0) {
      this._spawnLoot('weapon', dropWeapon.id, dropWeapon.ammo, p.x, p.y);
    }
  }

  _spawnLoot(kind, weaponId, ammo, x, y) {
    const item = {
      id: this.nextLootId++,
      kind,
      weaponId,
      ammo,
      x: Math.round(clamp(x, ARENA_MIN_X + 2, ARENA_MAX_X - 2)),
      y: Math.round(clamp(y, ARENA_MIN_Y + 2, ARENA_MAX_Y - 2)),
    };
    this.loot.push(item);
    this.pendingEvents.push({
      type: 'loot_add',
      item: { id: item.id, kind: item.kind, weaponId: item.weaponId, x: item.x, y: item.y },
    });
    return item;
  }

  _performAttack(p) {
    let slotObj = p.weapons[p.activeSlot];
    if (!slotObj) {
      p.activeSlot = 0;
      slotObj = p.weapons[0];
    }
    const weapon = this.weapons[slotObj.id] || WEAPONS.fists;

    p.attackCooldown = weapon.cooldown;
    p.attackAnim = Math.min(0.22, weapon.cooldown * 0.75);
    p.revealTimer = 1.25;

    if (weapon.id !== 'fists') {
      slotObj.ammo -= 1;
      if (slotObj.ammo <= 0) {
        if (p.activeSlot === 1) {
          p.weapons[1] = null;
          p.activeSlot = 0;
        } else if (p.weapons[1]) {
          p.weapons[0] = p.weapons[1];
          p.weapons[1] = null;
        } else {
          p.weapons[0] = { id: 'fists', ammo: Infinity };
        }
      }
    }

    if (weapon.type === 'melee') {
      this.pendingEvents.push({
        type: 'melee',
        id: p.id,
        weapon: weapon.id,
        x: Math.round(p.x),
        y: Math.round(p.y - 6),
        aim: Number(p.aim.toFixed(2)),
        range: weapon.range,
      });

      for (const target of this.players.values()) {
        if (!target.alive || target.id === p.id) continue;
        const d = dist(p.x, p.y, target.x, target.y);
        if (d > weapon.range + PLAYER_RADIUS) continue;
        const ang = Math.atan2(target.y - p.y, target.x - p.x);
        if (Math.abs(angleDiff(p.aim, ang)) > weapon.arc * 0.5 && d > PLAYER_RADIUS * 1.6) continue;
        if (!hasLineOfSight(p.x, p.y, target.x, target.y, this.obstacles)) continue;

        target.kbx += Math.cos(ang) * weapon.knockback;
        target.kby += Math.sin(ang) * weapon.knockback;
        this._damagePlayer(target, weapon.damage, p, weapon.name, false);
      }

      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        if (!o.alive || !o.destructible) continue;
        const ox = o.x + o.w / 2;
        const oy = o.y + o.h / 2;
        const d = dist(p.x, p.y, ox, oy);
        if (d > weapon.range + Math.max(o.w, o.h) * 0.65) continue;
        const ang = Math.atan2(oy - p.y, ox - p.x);
        if (Math.abs(angleDiff(p.aim, ang)) > weapon.arc * 0.65) continue;
        const mult = o.type === 'crate' && weapon.crateMult ? weapon.crateMult : 1;
        this._damageObstacle(o, weapon.damage * mult, p);
      }
      return;
    }

    const pellets = weapon.pellets || 1;
    const spread = weapon.spread || 0;
    const muzzleDist = PLAYER_RADIUS + 3;

    this.pendingEvents.push({
      type: 'shoot',
      id: p.id,
      weapon: weapon.id,
      x: Math.round(p.x + Math.cos(p.aim) * muzzleDist),
      y: Math.round(p.y - 6 + Math.sin(p.aim) * muzzleDist),
      aim: Number(p.aim.toFixed(2)),
    });

    for (let i = 0; i < pellets; i++) {
      const ang = p.aim + (this.rand() - 0.5) * spread;
      this.projectiles.push({
        id: this.nextProjId++,
        ownerId: p.id,
        weaponId: weapon.id,
        kind: weapon.type,
        x: p.x + Math.cos(ang) * muzzleDist,
        y: p.y + Math.sin(ang) * muzzleDist,
        vx: Math.cos(ang) * weapon.speed,
        vy: Math.sin(ang) * weapon.speed,
        traveled: 0,
        maxRange: weapon.range,
        radius: weapon.radius || 2,
        damage: weapon.damage,
        knockback: weapon.knockback || 50,
      });
    }
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const prevX = pr.x;
      const prevY = pr.y;
      const stepX = pr.vx * dt;
      const stepY = pr.vy * dt;
      pr.x += stepX;
      pr.y += stepY;
      pr.traveled += Math.hypot(stepX, stepY);

      let remove = false;
      const hitPos = { x: pr.x, y: pr.y };

      if (pr.x < 4 || pr.y < 8 || pr.x > MAP_WIDTH - 4 || pr.y > MAP_HEIGHT - 4 || pr.traveled >= pr.maxRange) {
        remove = true;
      }

      if (!remove) {
        for (let j = 0; j < this.obstacles.length; j++) {
          const o = this.obstacles[j];
          if (!o.alive || !o.blocksProjectiles) continue;
          if (segmentIntersectsRect(prevX, prevY, pr.x, pr.y, o.x, o.y, o.w, o.h)) {
            remove = true;
            if (o.destructible) {
              const owner = this.players.get(pr.ownerId) || null;
              this._damageObstacle(o, pr.damage, owner);
            } else {
              this.pendingEvents.push({ type: 'spark', x: Math.round(pr.x), y: Math.round(pr.y - 5) });
            }
            break;
          }
        }
      }

      if (!remove) {
        const hitRadius = PLAYER_RADIUS + pr.radius;
        for (const target of this.players.values()) {
          if (!target.alive || target.id === pr.ownerId) continue;
          if (
            dist(pr.x, pr.y, target.x, target.y) <= hitRadius ||
            dist((prevX + pr.x) * 0.5, (prevY + pr.y) * 0.5, target.x, target.y) <= hitRadius
          ) {
            remove = true;
            const owner = this.players.get(pr.ownerId) || null;
            const weapon = this.weapons[pr.weaponId];
            const ang = Math.atan2(pr.vy, pr.vx);
            target.kbx += Math.cos(ang) * pr.knockback;
            target.kby += Math.sin(ang) * pr.knockback;
            this._damagePlayer(target, pr.damage, owner, weapon ? weapon.name : 'Arma', false);
            break;
          }
        }
      }

      if (remove) {
        if (pr.kind === 'molotov') {
          const spec = this.weapons[pr.weaponId] || WEAPONS.molotov;
          this.fires.push({
            id: this.nextFireId++,
            ownerId: pr.ownerId,
            x: Math.round(clamp(hitPos.x, 12, MAP_WIDTH - 12)),
            y: Math.round(clamp(hitPos.y, 18, MAP_HEIGHT - 12)),
            radius: spec.fireRadius || 24,
            timer: spec.fireDuration || 4.0,
            dps: spec.fireDps || 20,
          });
          this.pendingEvents.push({ type: 'molotov_burst', x: Math.round(hitPos.x), y: Math.round(hitPos.y) });
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  _updateFires(dt) {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.timer -= dt;
      if (f.timer <= 0) {
        this.fires.splice(i, 1);
        continue;
      }

      const owner = this.players.get(f.ownerId) || null;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (dist(p.x, p.y, f.x, f.y) <= f.radius + PLAYER_RADIUS * 0.4) {
          this._damagePlayer(p, f.dps * dt, owner, 'Fuego Molotov', true);
        }
      }
    }
  }

  _damageObstacle(obs, amount, attacker) {
    if (!obs.alive || !obs.destructible) return;
    obs.hp -= amount;
    this.pendingEvents.push({ type: 'obs_hit', id: obs.id, hp: Math.max(0, Math.round(obs.hp)) });

    if (obs.hp <= 0) {
      obs.alive = false;
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      this.pendingEvents.push({ type: 'obs_break', id: obs.id, obsType: obs.type, x: Math.round(cx), y: Math.round(cy) });

      if (obs.explosive) {
        const spec = this.obstacleTypes[obs.type] || OBSTACLE_TYPES.barrel;
        this._triggerExplosion(cx, cy, spec.explosionRadius || 44, spec.explosionDamage || 62, attacker);
      } else if ((obs.dropsLoot || obs.type === 'crate') && this.rand() < 0.72) {
        const drop = randomCrateDrop(this.rand, this.config.allowedWeapons);
        const wSpec = drop.weaponId ? this.weapons[drop.weaponId] : null;
        this._spawnLoot(drop.kind, drop.weaponId, wSpec ? wSpec.ammo : 0, cx, cy);
      }
    }
  }

  _triggerExplosion(cx, cy, radius, maxDamage, attacker) {
    this.pendingEvents.push({ type: 'explosion', x: Math.round(cx), y: Math.round(cy), r: radius });

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const d = dist(cx, cy, p.x, p.y);
      if (d <= radius) {
        const falloff = 1 - (d / radius) * 0.55;
        const ang = Math.atan2(p.y - cy, p.x - cx);
        p.kbx += Math.cos(ang) * 140 * falloff;
        p.kby += Math.sin(ang) * 140 * falloff;
        this._damagePlayer(p, maxDamage * falloff, attacker, 'Bidón Explosivo', false);
      }
    }

    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (!o.alive || !o.destructible) continue;
      const ox = o.x + o.w / 2;
      const oy = o.y + o.h / 2;
      if (dist(cx, cy, ox, oy) <= radius) {
        this._damageObstacle(o, maxDamage * 0.9, attacker);
      }
    }
  }

  _damagePlayer(target, amount, attacker, causeName, isDot) {
    if (!target.alive || amount <= 0) return;
    target.hp -= amount;
    if (!isDot) {
      target.hurtFlash = 0.12;
      this.pendingEvents.push({
        type: 'hit',
        id: target.id,
        x: Math.round(target.x),
        y: Math.round(target.y - 8),
        dmg: Math.round(amount),
      });
    }
    if (attacker && attacker.id !== target.id) {
      attacker.damageDealt += amount;
    }

    if (target.hp <= 0) {
      this._eliminatePlayer(target, attacker, causeName);
    }
  }

  _eliminatePlayer(victim, killer, causeName) {
    if (!victim.alive) return;

    let aliveBefore = 0;
    for (const p of this.players.values()) {
      if (p.alive) aliveBefore++;
    }

    victim.alive = false;
    victim.hp = 0;
    victim.placement = aliveBefore;

    if (killer && killer.id !== victim.id) {
      killer.kills += 1;
    }

    for (let i = 0; i < victim.weapons.length; i++) {
      const w = victim.weapons[i];
      if (w && w.id !== 'fists' && w.ammo > 0) {
        this._spawnLoot('weapon', w.id, w.ammo, victim.x + (i === 0 ? -5 : 5), victim.y);
      }
    }

    this.corpses.push({ x: Math.round(victim.x), y: Math.round(victim.y), skin: victim.skin });
    if (this.corpses.length > 32) this.corpses.shift();

    const feedItem = {
      killerId: killer && killer.id !== victim.id ? killer.id : null,
      killerName: killer && killer.id !== victim.id ? killer.name : null,
      victimId: victim.id,
      victimName: victim.name,
      cause: causeName,
      aliveLeft: aliveBefore - 1,
    };
    this.killFeed.push(feedItem);
    if (this.killFeed.length > 6) this.killFeed.shift();

    this.pendingEvents.push({
      type: 'kill',
      ...feedItem,
      x: Math.round(victim.x),
      y: Math.round(victim.y),
    });
  }

  _finishMatch(winner) {
    this.state = 'ended';
    this.endTimer = 14;
    if (winner) {
      winner.placement = 1;
      this.winnerId = winner.id;
    }

    const ranking = Array.from(this.players.values())
      .sort((a, b) => (a.placement || 99) - (b.placement || 99))
      .map((p) => ({
        id: p.id,
        name: p.name,
        skin: p.skin,
        isBot: p.isBot,
        placement: p.placement || 1,
        kills: p.kills,
        damage: Math.round(p.damageDealt),
        time: Math.round(p.survivalTime),
      }));

    this.broadcast({
      type: 'match_end',
      winner: winner ? { id: winner.id, name: winner.name, skin: winner.skin, kills: winner.kills } : null,
      ranking,
      duration: Math.round(this.matchTime),
    });

    if (this.onMatchEnd) {
      try {
        this.onMatchEnd({ winner, ranking, duration: Math.round(this.matchTime) });
      } catch (err) {
        console.error('[Campal] onMatchEnd error:', err);
      }
    }
  }

  _broadcastSnapshot() {
    let aliveCount = 0;
    const playersArr = [];
    for (const p of this.players.values()) {
      if (p.alive) aliveCount++;
      const w0 = p.weapons[0];
      const w1 = p.weapons[1];
      playersArr.push([
        p.id,
        Math.round(p.x),
        Math.round(p.y),
        Number(p.aim.toFixed(2)),
        Math.round(p.hp),
        p.alive ? 1 : 0,
        p.activeSlot,
        w0 ? w0.id : 'fists',
        w1 ? w1.id : '',
        p.inBush ? 1 : 0,
        p.revealTimer > 0 ? 1 : 0,
        p.hurtFlash > 0 ? 1 : 0,
        p.attackAnim > 0 ? 1 : 0,
        p.dashTimer > 0 ? 1 : 0,
        p.kills,
        Math.hypot(p.vx, p.vy) > 3 ? 1 : 0,
      ]);
    }

    const projsArr = this.projectiles.map((pr) => [
      pr.id,
      Math.round(pr.x),
      Math.round(pr.y),
      Math.round(pr.vx),
      Math.round(pr.vy),
      pr.weaponId,
    ]);

    const firesArr = this.fires.map((f) => [f.id, f.x, f.y, f.radius, Number(f.timer.toFixed(1))]);

    const bannerText =
      this.state === 'ready'
        ? '¡Preparados!'
        : this.state === 'playing' && this.fightBannerTimer > 0
          ? '¡A luchar!'
          : '';

    const payload = {
      type: 'state',
      st: this.state,
      wt: this.state === 'waiting' ? Number(this.waitTimer.toFixed(1)) : 0,
      bn: bannerText,
      t: Math.round(this.matchTime),
      alive: aliveCount,
      p: playersArr,
      pr: projsArr,
      f: firesArr,
      ev: this.pendingEvents,
    };

    this.pendingEvents = [];
    this.broadcast(payload);
  }
}
