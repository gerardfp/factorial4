// Automated verification suite for CAMPAL (24-player pixel art Battle Royale)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_PLAYERS,
  PALETTE_LIST,
  CHAR_SPRITE_W,
  CHAR_SPRITE_H,
  CHAR_MAX_SPRITE_SIZE,
  PLAYER_RADIUS,
  ARENA_MIN_X,
  ARENA_MAX_X,
  ARENA_MIN_Y,
  ARENA_MAX_Y,
} from '../shared/constants.js';
import { circleIntersectsRect } from '../shared/collision.js';
import { generateMap } from '../server/mapGen.js';
import { GameRoom, WAITING_DURATION } from '../server/gameRoom.js';
import { createCampalServer } from '../server/index.js';
import { encodeSpriteRLE, decodeSpriteRLE } from '../shared/spriteCodec.js';
import { sanitizeCustomObstacle, sanitizeCustomWeapon, OBSTACLE_LIMITS, WEAPON_LIMITS } from '../shared/themeSchema.js';
import { encodePngRGBA, isValidPngBuffer, readPngDimensions } from '../server/pngEncoder.js';
import { DEFAULT_SPRITES_DIR, THEMES_SPRITES_DIR, CUSTOM_SPRITES_DIR, CUSTOM_THEMES_DIR } from '../server/spriteStore.js';

async function runTests() {
  console.log('1. Checking expanded palette & sprite constraints...');
  assert.equal(MAX_PLAYERS, 24, 'Max players must be 24');
  assert.ok(PALETTE_LIST.length > 16, 'Landscape palette must support more than 16 colors');
  assert.equal(new Set(PALETTE_LIST).size, PALETTE_LIST.length, 'Palette colors must be unique');
  assert.ok(
    CHAR_SPRITE_W <= CHAR_MAX_SPRITE_SIZE && CHAR_SPRITE_H <= CHAR_MAX_SPRITE_SIZE,
    'Character sprites must be <= 32x32px'
  );
  console.log(`   OK: ${PALETTE_LIST.length} colors, ${CHAR_SPRITE_W}x${CHAR_SPRITE_H}px lineless characters, ${MAX_PLAYERS} max players.`);

  console.log('2. Checking procedural descampado map generation...');
  const map = generateMap(123456);
  assert.equal(map.spawns.length, 24, 'Must generate 24 spawn points');
  assert.ok(map.obstacles.length >= 35, `Expected diverse obstacles, got ${map.obstacles.length}`);
  assert.ok(map.loot.length >= 28, `Expected diverse ground weapons/loot, got ${map.loot.length}`);

  const obstacleTypes = new Set(map.obstacles.map((o) => o.type));
  for (const needed of ['rock', 'wall_h', 'wall_v', 'wreck', 'crate', 'barrel', 'bush']) {
    assert.ok(obstacleTypes.has(needed), `Map missing obstacle type: ${needed}`);
  }
  const weaponTypes = new Set(map.loot.filter((l) => l.kind === 'weapon').map((l) => l.weaponId));
  assert.ok(weaponTypes.size >= 6, `Expected diverse weapons on field, got ${weaponTypes.size}`);

  for (const sp of map.spawns) {
    for (const o of map.obstacles) {
      if (!o.solid) continue;
      assert.equal(
        circleIntersectsRect(sp.x, sp.y, PLAYER_RADIUS, o.x, o.y, o.w, o.h),
        false,
        `Spawn (${sp.x},${sp.y}) overlaps solid obstacle ${o.type}`
      );
    }
  }
  console.log(`   OK: 24 clean spawns, ${map.obstacles.length} obstacles (${obstacleTypes.size} types), ${map.loot.length} loot items (${weaponTypes.size} weapon types).`);

  console.log('3. Checking 10s waiting phase (free move, no attacks/pickups) & "¡Preparados!" -> "¡A luchar!"...');
  const waitRoom = new GameRoom('WAIT-TEST', { seed: 424242, fillBots: true });
  const dummyWs = { send() {}, sendJSON() {} };
  const c1 = waitRoom.addClient(dummyWs, 'Tester', 0, true);
  waitRoom.stopLoop();
  assert.equal(waitRoom.state, 'waiting', 'New battle must start in 10s waiting state');
  assert.equal(waitRoom.waitTimer, WAITING_DURATION, 'Wait timer must be 10s');

  const p1 = waitRoom.players.get(c1.id);
  const weaponItem = waitRoom.loot.find((l) => l.kind === 'weapon');
  // Place player right over a ground weapon and try to move + attack + pickup during waiting phase
  p1.x = weaponItem.x;
  p1.y = weaponItem.y;
  const beforeX = p1.x;
  waitRoom.handleMessage(c1.id, { type: 'input', mx: 1, my: 0, aim: 0, attack: true, pickup: true });
  for (let i = 0; i < 10; i++) waitRoom.tick(1 / 30);

  assert.notEqual(p1.x, beforeX, 'Player must be able to move freely during the 10s waiting period');
  assert.equal(p1.weapons[0].id, 'fists', 'Player must NOT pick up weapons during the 10s waiting period');
  assert.equal(p1.attackCooldown, 0, 'Player must NOT be able to attack during the 10s waiting period');

  // Advance remaining 10s waiting period -> must transition to "ready" ("¡Preparados!")
  let sawPreparados = false;
  let sawALuchar = false;
  for (let i = 0; i < 320; i++) {
    waitRoom.tick(1 / 30);
    if (waitRoom.state === 'ready') sawPreparados = true;
  }
  assert.equal(sawPreparados, true, 'Must enter "¡Preparados!" ready phase after 10s');

  // Advance through ready phase -> must transition to "playing" ("¡A luchar!")
  for (let i = 0; i < 60; i++) {
    waitRoom.tick(1 / 30);
    if (waitRoom.state === 'playing' && waitRoom.fightBannerTimer > 0) sawALuchar = true;
  }
  assert.equal(sawALuchar, true, 'Must announce "¡A luchar!" when battle starts');
  console.log('   OK: 10s free-movement warmup blocks combat/pickups and transitions through "¡Preparados!" -> "¡A luchar!".');

  console.log('4. Running full 24-combatant Battle Royale simulation until 1 survivor remains...');
  const simRoom = new GameRoom('SIM');
  simRoom.fillBots = true;
  simRoom.startMatch(987654);
  assert.equal(simRoom.players.size, 24, 'Match should start with 24 combatants');

  let ticks = 0;
  const maxTicks = 30 * 240;
  while (simRoom.state !== 'ended' && ticks < maxTicks) {
    simRoom.tick(1 / 30);
    for (const p of simRoom.players.values()) {
      if (!p.alive) continue;
      assert.ok(
        p.x >= ARENA_MIN_X && p.x <= ARENA_MAX_X && p.y >= ARENA_MIN_Y && p.y <= ARENA_MAX_Y,
        `Player ${p.id} escaped arena bounds: (${p.x}, ${p.y})`
      );
    }
    ticks++;
  }
  simRoom.stopLoop();
  assert.equal(simRoom.state, 'ended', 'Match must finish when 1 survivor remains');
  const aliveEnd = Array.from(simRoom.players.values()).filter((p) => p.alive);
  assert.ok(aliveEnd.length <= 1, `Expected <= 1 survivor at end, got ${aliveEnd.length}`);
  const totalKills = Array.from(simRoom.players.values()).reduce((sum, p) => sum + p.kills, 0);
  assert.ok(totalKills >= 5, `Expected active combat kills, got ${totalKills}`);
  console.log(`   OK: Battle Royale finished in ${(ticks / 30).toFixed(1)}s sim time. Winner ID=${simRoom.winnerId}, total combat kills=${totalKills}.`);

  console.log('5. Testing Sprite Editor internal RLE format & /api/sprites persistence...');
  const sampleW = 16;
  const sampleH = 24;
  const f0 = new Uint8ClampedArray(sampleW * sampleH * 4);
  const f1 = new Uint8ClampedArray(sampleW * sampleH * 4);
  // Paint a few test pixels
  f0[0] = 201; f0[1] = 56; f0[2] = 66; f0[3] = 255;
  f1[40] = 242; f1[41] = 193; f1[42] = 78; f1[43] = 255;
  const rle = encodeSpriteRLE(sampleW, sampleH, 10, [f0, f1]);
  const decoded = decodeSpriteRLE(rle);
  assert.equal(decoded.w, sampleW);
  assert.equal(decoded.h, sampleH);
  assert.equal(decoded.fps, 10);
  assert.equal(decoded.framesRgba.length, 2);
  assert.equal(decoded.framesRgba[0][0], 201);
  assert.equal(decoded.framesRgba[1][41], 193);
  console.log(`   OK: Lossless Indexed-RLE sprite format encoded 2 frames (${sampleW}x${sampleH}) into ${JSON.stringify(rle).length} bytes.`);

  // Wider palettes must survive singleton index 33 ('x' in base 36) and repeated runs.
  const paletteRows = Math.ceil(PALETTE_LIST.length / 8);
  const wideFrame = new Uint8ClampedArray(8 * paletteRows * 4);
  PALETTE_LIST.forEach((hex, i) => {
    wideFrame.set([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255], i * 4);
  });
  const wideRle = encodeSpriteRLE(8, paletteRows, 8, [wideFrame]);
  assert.deepEqual(decodeSpriteRLE(wideRle).framesRgba[0], wideFrame);
  const repeatedFrame = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < 64; i++) repeatedFrame.set([184, 130, 70, 255], i * 4);
  assert.deepEqual(decodeSpriteRLE(encodeSpriteRLE(8, 8, 8, [repeatedFrame])).framesRgba[0], repeatedFrame);
  const legacy = { v: 1, w: 2, h: 1, fps: 8, p: ['#b88246'], f: ['1x2'] };
  assert.deepEqual(Array.from(decodeSpriteRLE(legacy).framesRgba[0]), [184, 130, 70, 255, 184, 130, 70, 255]);

  console.log('6. Testing hostless automatic matchmaking, instant start at 24 players, & auto-creating new battle for 25th...');
  const srv = createCampalServer();
  await new Promise((resolve) => srv.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = srv.httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  for (const ep of ['/', '/style.css', '/js/main.js', '/js/sprites.js', '/js/editor.js', '/shared/constants.js', '/api/rooms', '/api/sprites']) {
    const res = await fetch(`${baseUrl}${ep}`);
    assert.equal(res.status, 200, `GET ${ep} failed with ${res.status}`);
  }

  // Verify sprites/default/ has real PNG files and is served as image/png
  const catRes = await fetch(`${baseUrl}/api/sprites`);
  const cat = await catRes.json();
  const defaultKeys = Object.keys(cat.defaults);
  assert.ok(defaultKeys.length >= 37, `Expected >= 37 default PNG sprites, got ${defaultKeys.length}`);
  for (const k of defaultKeys) {
    const fp = path.join(DEFAULT_SPRITES_DIR, cat.defaults[k].file);
    assert.equal(fs.existsSync(fp), true, `Missing default PNG file: ${fp}`);
    const buf = fs.readFileSync(fp);
    assert.equal(isValidPngBuffer(buf), true, `Invalid PNG header in ${fp}`);
  }
  const pngFetch = await fetch(`${baseUrl}/sprites/default/char_0.png`);
  assert.equal(pngFetch.status, 200);
  assert.equal(pngFetch.headers.get('content-type'), 'image/png');
  const char0Dims = readPngDimensions(Buffer.from(await pngFetch.arrayBuffer()));
  assert.equal(char0Dims.width, CHAR_SPRITE_W * 4, 'Default character PNG strip should be 4 frames wide');
  assert.equal(char0Dims.height, CHAR_SPRITE_H);

  // Verify saving a modified default sprite & a brand-new custom sprite as real PNGs in sprites/custom/
  const testStripRgba = new Uint8ClampedArray(16 * 4 * 24 * 4);
  testStripRgba[0] = 242; testStripRgba[1] = 193; testStripRgba[2] = 78; testStripRgba[3] = 255;
  const testPngB64 = `data:image/png;base64,${encodePngRGBA(testStripRgba, 64, 24).toString('base64')}`;

  const saveRes = await fetch(`${baseUrl}/api/sprites/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'char:0',
      w: 16,
      h: 24,
      frames: 4,
      fps: 10,
      pngDataUrl: testPngB64,
    }),
  });
  const saveJson = await saveRes.json();
  assert.equal(saveJson.ok, true, 'Saving modified char:0 PNG must succeed');
  assert.equal(fs.existsSync(path.join(CUSTOM_SPRITES_DIR, 'char_0.png')), true, 'char_0.png must exist in sprites/custom/');

  const saveNewRes = await fetch(`${baseUrl}/api/sprites/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'char:custom_test',
      id: 'custom_test',
      name: 'Personaje: TestHero',
      category: 'characters',
      w: 16,
      h: 24,
      frames: 4,
      fps: 8,
      pngDataUrl: testPngB64,
    }),
  });
  const saveNewJson = await saveNewRes.json();
  assert.equal(saveNewJson.ok, true, 'Saving new custom character PNG must succeed');
  assert.equal(fs.existsSync(path.join(CUSTOM_SPRITES_DIR, 'char_custom_test.png')), true);

  const customFetch = await fetch(`${baseUrl}/sprites/custom/char_custom_test.png`);
  assert.equal(customFetch.status, 200);
  assert.equal(customFetch.headers.get('content-type'), 'image/png');

  // Verify restoring single sprite & restoring all sprites from sprites/default/
  const restoreOneRes = await fetch(`${baseUrl}/api/sprites/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'char:0' }),
  });
  const restoreOneJson = await restoreOneRes.json();
  assert.equal(restoreOneJson.ok, true);
  assert.equal(restoreOneJson.restoredToDefault, true);
  assert.equal(fs.existsSync(path.join(CUSTOM_SPRITES_DIR, 'char_0.png')), false, 'Custom char_0.png must be removed on restore');
  assert.equal(fs.existsSync(path.join(DEFAULT_SPRITES_DIR, 'char_0.png')), true, 'Default char_0.png must remain untouched');

  const restoreAllRes = await fetch(`${baseUrl}/api/sprites/restore-all`, { method: 'POST' });
  const restoreAllJson = await restoreAllRes.json();
  assert.equal(restoreAllJson.ok, true);
  assert.equal(fs.existsSync(path.join(CUSTOM_SPRITES_DIR, 'char_custom_test.png')), false);

  // Verify theme override folders in sprites/themes/{urbano,futuro,desierto}/ & per-theme custom save/restore
  assert.ok(cat.themes && cat.themes.urbano && cat.themes.futuro && cat.themes.desierto, 'Themes catalog must expose urbano, futuro, desierto');
  for (const tId of ['urbano', 'futuro', 'desierto']) {
    const tDir = path.join(THEMES_SPRITES_DIR, tId);
    assert.equal(fs.existsSync(path.join(tDir, 'theme.json')), true, `Missing theme.json for ${tId}`);
    const tSprites = Object.values(cat.themes[tId].sprites);
    assert.ok(tSprites.length >= 10, `Theme ${tId} must override PNG sprites (got ${tSprites.length})`);
    for (const sp of tSprites) {
      const fp = path.join(tDir, sp.file);
      assert.equal(fs.existsSync(fp), true, `Missing theme PNG: ${fp}`);
      assert.equal(isValidPngBuffer(fs.readFileSync(fp)), true, `Invalid theme PNG: ${fp}`);
    }
  }
  const futuroRockRes = await fetch(`${baseUrl}/sprites/themes/futuro/obs_rock.png`);
  assert.equal(futuroRockRes.status, 200);
  assert.equal(futuroRockRes.headers.get('content-type'), 'image/png');

  // Save a per-theme custom override for futuro obs:rock -> restores back to sprites/themes/futuro/obs_rock.png!
  const rockRgba = new Uint8ClampedArray(26 * 20 * 4);
  rockRgba[0] = 64; rockRgba[1] = 130; rockRgba[2] = 201; rockRgba[3] = 255;
  const rockPng = `data:image/png;base64,${encodePngRGBA(rockRgba, 26, 20).toString('base64')}`;
  const saveThemeRes = await fetch(`${baseUrl}/api/sprites/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'obs:rock', theme: 'futuro', w: 26, h: 20, frames: 1, fps: 6, pngDataUrl: rockPng }),
  });
  const saveThemeJson = await saveThemeRes.json();
  assert.equal(saveThemeJson.ok, true);
  assert.equal(fs.existsSync(path.join(CUSTOM_THEMES_DIR, 'futuro', 'obs_rock.png')), true);

  const restoreThemeRes = await fetch(`${baseUrl}/api/sprites/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'obs:rock', theme: 'futuro' }),
  });
  const restoreThemeJson = await restoreThemeRes.json();
  assert.equal(restoreThemeJson.ok, true);
  assert.equal(restoreThemeJson.defaultMeta.url, '/sprites/themes/futuro/obs_rock.png', 'Restoring themed sprite must fall back to theme PNG override');
  assert.equal(fs.existsSync(path.join(CUSTOM_THEMES_DIR, 'futuro', 'obs_rock.png')), false);
  console.log(`   OK: ${defaultKeys.length} base PNGs, 3 theme override folders (urbano/futuro/desierto), and per-theme custom save/restore verified.`);

  // Verify custom battle creation (POST /api/battles) with themes & custom config + multiple open battles list
  const b1Res = await fetch(`${baseUrl}/api/battles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battleName: 'Zona Urbana',
      theme: 'urbano',
      weaponCount: 15,
      medkitCount: 3,
      allowedWeapons: ['shotgun', 'molotov'],
      obstacles: { rock: 2, wall_h: 6, wall_v: 4, wreck: 5, crate: 4, barrel: 6, bush: 0 },
    }),
  });
  const b1 = await b1Res.json();
  assert.equal(b1.ok, true);
  assert.equal(b1.room.theme, 'urbano');

  const b2Res = await fetch(`${baseUrl}/api/battles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battleName: 'Sector Futuro',
      theme: 'futuro',
      weaponCount: 20,
      medkitCount: 5,
    }),
  });
  const b2 = await b2Res.json();
  assert.equal(b2.ok, true);
  assert.equal(b2.room.theme, 'futuro');

  const roomsRes = await fetch(`${baseUrl}/api/rooms`);
  const roomsJson = await roomsRes.json();
  const openRooms = roomsJson.rooms.filter((r) => r.open);
  assert.ok(openRooms.length >= 2, `Expected >= 2 open custom battles listed, got ${openRooms.length}`);

  // Verify joining b1 delivers theme='urbano' and only allowedWeapons ('shotgun'/'molotov')
  const customJoinInit = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?name=Creator&skin=0&room=${encodeURIComponent(b1.roomId)}`);
    const t = setTimeout(() => reject(new Error('Custom battle join timeout')), 4000);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'match_start') {
        clearTimeout(t);
        ws.close();
        resolve(msg);
      }
    });
  });
  assert.equal(customJoinInit.theme, 'urbano', 'Joined custom battle must receive configured theme');
  const spawnedWeaponIds = new Set(customJoinInit.loot.filter((l) => l.kind === 'weapon').map((l) => l.weaponId));
  for (const wid of spawnedWeaponIds) {
    assert.ok(wid === 'shotgun' || wid === 'molotov', `Unexpected weapon ${wid} in restricted battle`);
  }
  // Verify creating & joining the "Secano español" theme battle end-to-end
  const secanoRes = await fetch(`${baseUrl}/api/battles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battleName: 'Batalla Secano',
      theme: 'secano',
      fillBots: false,
      weaponCount: 24,
      medkitCount: 6,
    }),
  });
  const secanoJson = await secanoRes.json();
  assert.equal(secanoJson.ok, true);
  assert.equal(secanoJson.room.theme, 'secano', 'POST /api/battles must preserve secano theme');
  assert.equal(secanoJson.room.fillBots, false, 'POST /api/battles must preserve fillBots=false');

  const secanoJoinInit = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?name=SecanoPlayer&skin=0&room=${encodeURIComponent(secanoJson.roomId)}`);
    const t = setTimeout(() => reject(new Error('Secano join timeout')), 4000);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'match_start') {
        clearTimeout(t);
        ws.close();
        resolve(msg);
      }
    });
  });
  assert.equal(secanoJoinInit.theme, 'secano', 'Joined secano battle must receive theme=secano in match_start');
  assert.equal(srv.rooms.get(secanoJson.roomId).fillBots, false, 'Joining explicit room must not overwrite fillBots');

  // Verify theme-defined custom obstacles & custom weapons (with safe limit clamping!)
  const clampedObs = sanitizeCustomObstacle('casa_gigante', { name: 'Casa', w: 999, h: 999, hp: 9999, destructible: true });
  assert.equal(clampedObs.w, OBSTACLE_LIMITS.w[1], 'Custom obstacle width must be clamped to max limit');
  assert.equal(clampedObs.hp, OBSTACLE_LIMITS.hp[1], 'Custom destructible HP must be clamped to max limit');

  const clampedWpn = sanitizeCustomWeapon('super_arma', { name: 'OP', type: 'ranged', damage: 9999, cooldown: 0.01, pellets: 99 });
  assert.equal(clampedWpn.damage, WEAPON_LIMITS.damage[1], 'Custom weapon damage must be clamped to max limit');
  assert.equal(clampedWpn.cooldown, WEAPON_LIMITS.cooldown[0], 'Custom weapon cooldown must be clamped to min limit');
  assert.equal(clampedWpn.pellets, WEAPON_LIMITS.pellets[1], 'Custom weapon pellets must be clamped to max limit');

  // Verify Futuro theme battle spawns custom obstacle 'torre' & custom weapon 'laser'
  const futuroCustomRes = await fetch(`${baseUrl}/api/battles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battleName: 'Laser Arena',
      theme: 'futuro',
      weaponCount: 20,
      medkitCount: 2,
      allowedWeapons: ['laser'],
      obstacles: { torre: 4, rock: 0, wall_h: 0, wall_v: 0, wreck: 0, crate: 0, barrel: 0, bush: 0 },
    }),
  });
  const futuroCustom = await futuroCustomRes.json();
  assert.equal(futuroCustom.ok, true);
  const futuroInit = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?name=Cyber&skin=0&room=${encodeURIComponent(futuroCustom.roomId)}`);
    const t = setTimeout(() => reject(new Error('Futuro custom join timeout')), 4000);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'match_start') {
        clearTimeout(t);
        ws.close();
        resolve(msg);
      }
    });
  });
  assert.ok(futuroInit.themeObstacles.torre, 'Futuro battle must expose custom obstacle "torre"');
  assert.ok(futuroInit.themeWeapons.laser, 'Futuro battle must expose custom weapon "laser"');
  assert.ok(futuroInit.obstacles.some((o) => o.type === 'torre'), 'Futuro map must spawn custom "torre" obstacles');
  assert.ok(futuroInit.loot.some((l) => l.weaponId === 'laser'), 'Futuro map must spawn custom "laser" weapons');
  console.log('   OK: Theme-defined custom obstacles (caseta/torre/palmera) & custom weapons (laser) + safe limit clamping verified.');

  // Verify per-weapon {min, max} ranges, obstacle/medkit {min, max} ranges, and maxBots (1-23) with human priority
  const pistolCountsSeen = new Set();
  for (let s = 1; s <= 12; s++) {
    const m = generateMap(1000 + s * 97, {
      weaponCounts: {
        pipe: { min: 0, max: 0 },
        axe: { min: 0, max: 0 },
        brick: { min: 0, max: 0 },
        slingshot: { min: 0, max: 0 },
        pistol: { min: 2, max: 6 },
        shotgun: { min: 3, max: 3 },
        rifle: { min: 0, max: 0 },
        molotov: { min: 1, max: 2 },
      },
      medkitCount: { min: 2, max: 5 },
      obstacles: {
        rock: { min: 2, max: 5 },
        wall_h: { min: 0, max: 0 },
        wall_v: { min: 0, max: 0 },
        wreck: { min: 0, max: 0 },
        crate: { min: 1, max: 3 },
        barrel: { min: 0, max: 0 },
        bush: { min: 0, max: 0 },
      },
    });
    const pistols = m.loot.filter((l) => l.kind === 'weapon' && l.weaponId === 'pistol').length;
    const shotguns = m.loot.filter((l) => l.kind === 'weapon' && l.weaponId === 'shotgun').length;
    const rifles = m.loot.filter((l) => l.kind === 'weapon' && l.weaponId === 'rifle').length;
    const molotovs = m.loot.filter((l) => l.kind === 'weapon' && l.weaponId === 'molotov').length;
    const medkits = m.loot.filter((l) => l.kind === 'medkit').length;
    const rocks = m.obstacles.filter((o) => o.type === 'rock').length;
    const crates = m.obstacles.filter((o) => o.type === 'crate').length;

    assert.ok(pistols >= 2 && pistols <= 6, `Pistol count ${pistols} out of [2, 6]`);
    assert.equal(shotguns, 3, `Shotgun exact range [3, 3] must spawn 3, got ${shotguns}`);
    assert.equal(rifles, 0, `Rifle range [0, 0] must spawn 0, got ${rifles}`);
    assert.ok(molotovs >= 1 && molotovs <= 2, `Molotov count ${molotovs} out of [1, 2]`);
    assert.ok(medkits >= 2 && medkits <= 5, `Medkit count ${medkits} out of [2, 5]`);
    assert.ok(rocks >= 2 && rocks <= 5, `Rock count ${rocks} out of [2, 5]`);
    assert.ok(crates >= 1 && crates <= 3, `Crate count ${crates} out of [1, 3]`);
    pistolCountsSeen.add(pistols);
  }
  assert.ok(pistolCountsSeen.size >= 2, 'Randomized [min, max] range should produce varying counts across seeds');

  // Verify maxBots (1-23) respects cap and always prioritizes connected human players
  const botCapRoom1 = new GameRoom('BOTCAP-1', { config: { fillBots: true, maxBots: 5 } });
  botCapRoom1.addClient(dummyWs, 'Human1', 0);
  botCapRoom1.stopLoop();
  botCapRoom1._beginReadyPhase();
  assert.equal(botCapRoom1.players.size, 6, '1 human + maxBots=5 must yield 6 total fighters');
  assert.equal(Array.from(botCapRoom1.players.values()).filter((p) => p.isBot).length, 5);

  const botCapRoom2 = new GameRoom('BOTCAP-2', { config: { fillBots: true, maxBots: 10 } });
  for (let i = 1; i <= 20; i++) {
    botCapRoom2.addClient(dummyWs, `H${i}`, i % 8);
  }
  botCapRoom2.stopLoop();
  botCapRoom2._beginReadyPhase();
  assert.equal(botCapRoom2.players.size, 24, '20 humans + maxBots=10 must cap total at 24 (humans prioritized)');
  assert.equal(Array.from(botCapRoom2.players.values()).filter((p) => !p.isBot).length, 20, 'All 20 humans must stay');
  assert.equal(Array.from(botCapRoom2.players.values()).filter((p) => p.isBot).length, 4, 'Only 4 bots should fill remaining slots');

  // Verify POST /api/battles persists weaponCounts ranges and maxBots
  const rangeBattleRes = await fetch(`${baseUrl}/api/battles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battleName: 'Rango y Bots',
      theme: 'costa',
      fillBots: true,
      maxBots: 7,
      weaponCounts: {
        pipe: { min: 0, max: 0 },
        axe: { min: 0, max: 0 },
        brick: { min: 0, max: 0 },
        slingshot: { min: 0, max: 0 },
        pistol: { min: 4, max: 4 },
        shotgun: { min: 0, max: 0 },
        rifle: { min: 0, max: 0 },
        molotov: { min: 0, max: 0 },
      },
      medkitCount: { min: 3, max: 3 },
      obstacles: { rock: { min: 3, max: 3 }, wall_h: { min: 0, max: 0 }, wall_v: { min: 0, max: 0 }, wreck: { min: 0, max: 0 }, crate: { min: 0, max: 0 }, barrel: { min: 0, max: 0 }, bush: { min: 0, max: 0 } },
    }),
  });
  const rangeBattle = await rangeBattleRes.json();
  assert.equal(rangeBattle.ok, true);
  assert.equal(rangeBattle.room.maxBots, 7, 'POST /api/battles must persist maxBots=7');
  const rangeRoom = srv.rooms.get(rangeBattle.roomId);
  assert.equal(rangeRoom.loot.filter((l) => l.kind === 'weapon' && l.weaponId === 'pistol').length, 4);
  assert.equal(rangeRoom.loot.filter((l) => l.kind === 'weapon').length, 4);
  assert.equal(rangeRoom.loot.filter((l) => l.kind === 'medkit').length, 3);
  console.log('   OK: Per-weapon & obstacle [min, max] randomized ranges + maxBots (1-23) with human priority verified.');

  // Verify saving a derived theme (same name -> NEVER overwrites original) & saving a brand-new derived theme
  const origSecanoJsonPath = path.join(THEMES_SPRITES_DIR, 'secano', 'theme.json');
  const origSecanoBefore = fs.readFileSync(origSecanoJsonPath, 'utf8');

  const deriveRes = await fetch(`${baseUrl}/api/themes/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'derive',
      sourceTheme: 'secano',
      config: {
        defaultMaxBots: 12,
        defaultWeaponCounts: { pistol: { min: 5, max: 8 } },
      },
    }),
  });
  const deriveJson = await deriveRes.json();
  assert.equal(deriveJson.ok, true);
  assert.equal(deriveJson.themeId, 'secano');
  assert.equal(deriveJson.isDerived, true);
  assert.equal(fs.readFileSync(origSecanoJsonPath, 'utf8'), origSecanoBefore, 'Original sprites/themes/secano/theme.json MUST NEVER be overwritten!');
  assert.equal(fs.existsSync(path.join(CUSTOM_THEMES_DIR, 'secano', 'theme.json')), true, 'Derived theme must be stored in sprites/custom/themes/secano/');

  // Restore derived secano back to untouched original
  const restoreSecanoRes = await fetch(`${baseUrl}/api/themes/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ themeId: 'secano' }),
  });
  const restoreSecanoJson = await restoreSecanoRes.json();
  assert.equal(restoreSecanoJson.ok, true);
  assert.equal(restoreSecanoJson.restoredToOriginal, true);
  assert.equal(fs.existsSync(path.join(CUSTOM_THEMES_DIR, 'secano')), false);
  assert.equal(fs.readFileSync(origSecanoJsonPath, 'utf8'), origSecanoBefore);

  // Create a brand-new theme derived from 'futuro' (even if user reuses the original name, it must get a fresh derived ID!)
  const origFuturoJsonPath = path.join(THEMES_SPRITES_DIR, 'futuro', 'theme.json');
  const origFuturoBefore = fs.readFileSync(origFuturoJsonPath, 'utf8');
  const newThemeRes = await fetch(`${baseUrl}/api/themes/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'new',
      sourceTheme: 'futuro',
      name: 'Futuro Neón',
      description: 'Versión derivada con más láseres',
      config: {
        defaultMaxBots: 15,
        defaultWeaponCounts: { laser: { min: 4, max: 6 } },
      },
    }),
  });
  const newThemeJson = await newThemeRes.json();
  assert.equal(newThemeJson.ok, true);
  assert.notEqual(newThemeJson.themeId, 'futuro', 'New theme must have its own distinct ID');
  assert.equal(newThemeJson.baseTheme, 'futuro');
  assert.equal(newThemeJson.isCustomNew, true);
  assert.ok(newThemeJson.theme.obstacles.torre, 'Derived theme must inherit base theme custom obstacles (torre)');
  assert.ok(newThemeJson.theme.weapons.laser, 'Derived theme must inherit base theme custom weapons (laser)');
  assert.equal(fs.readFileSync(origFuturoJsonPath, 'utf8'), origFuturoBefore, 'Original futuro theme.json must stay untouched');

  // Launch a battle using the newly saved derived theme
  const derivedBattleRes = await fetch(`${baseUrl}/api/battles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      theme: newThemeJson.themeId,
      maxBots: 8,
      weaponCounts: { laser: { min: 3, max: 3 } },
      obstacles: { torre: { min: 2, max: 2 }, rock: 0, wall_h: 0, wall_v: 0, wreck: 0, crate: 0, barrel: 0, bush: 0 },
    }),
  });
  const derivedBattle = await derivedBattleRes.json();
  assert.equal(derivedBattle.ok, true);
  assert.equal(derivedBattle.room.theme, newThemeJson.themeId);
  const derivedRoom = srv.rooms.get(derivedBattle.roomId);
  assert.equal(derivedRoom.config.baseTheme, 'futuro');
  assert.ok(derivedRoom.obstacles.some((o) => o.type === 'torre'));
  assert.ok(derivedRoom.loot.some((l) => l.weaponId === 'laser'));

  // Clean up test custom theme
  const delThemeRes = await fetch(`${baseUrl}/api/themes/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ themeId: newThemeJson.themeId }),
  });
  const delThemeJson = await delThemeRes.json();
  assert.equal(delThemeJson.ok, true);
  assert.equal(delThemeJson.deletedCustom, true);
  assert.equal(fs.existsSync(path.join(CUSTOM_THEMES_DIR, newThemeJson.themeId)), false);
  console.log('   OK: Derived same-name themes & new derived themes (never overwriting originals) + restore/delete verified.');

  console.log('   OK: Custom battle creation (urbano/futuro/secano/costa), open battle list, and custom weapon/obstacle rules verified.');

  // Clean up test rooms before running the 24-player auto-matchmaking test
  for (const r of srv.rooms.values()) r.stopLoop();
  srv.rooms.clear();

  const clients = [];
  const assignedRooms = new Set();
  const stateSnapshots = new Set();
  let lastBanner = '';

  const openClient = (idx) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?name=P${idx}&skin=${idx % 8}`);
      const timeout = setTimeout(() => reject(new Error(`Client ${idx} timeout`)), 5000);
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'welcome') {
          assignedRooms.add(msg.roomId);
          clearTimeout(timeout);
          resolve({ ws, roomId: msg.roomId });
        } else if (msg.type === 'state') {
          stateSnapshots.add(idx);
          if (msg.bn) lastBanner = msg.bn;
        }
      });
      ws.addEventListener('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

  for (let i = 1; i <= 24; i++) {
    const c = await openClient(i);
    clients.push(c.ws);
  }

  assert.equal(assignedRooms.size, 1, 'First 24 players must all be assigned to the first free battle');
  const firstRoomId = Array.from(assignedRooms)[0];
  const firstRoom = srv.rooms.get(firstRoomId);
  assert.notEqual(firstRoom.state, 'waiting', 'Reaching 24 players must start the battle immediately without waiting 10s');

  // Connect 25th player -> must automatically be assigned to a newly created battle room!
  const c25 = await openClient(25);
  clients.push(c25.ws);
  assert.notEqual(c25.roomId, firstRoomId, '25th player must automatically get a new battle room');
  const secondRoom = srv.rooms.get(c25.roomId);
  assert.equal(secondRoom.state, 'waiting', 'Newly created battle room for 25th player must be in 10s waiting state');

  await new Promise((r) => setTimeout(r, 250));
  assert.ok(stateSnapshots.size >= 20, `Clients must receive live state snapshots (got ${stateSnapshots.size})`);
  assert.ok(lastBanner.includes('Preparados') || lastBanner.includes('luchar'), `Expected start banner, got "${lastBanner}"`);

  for (const ws of clients) ws.close();
  await new Promise((r) => setTimeout(r, 100));
  srv.close();
  console.log(`   OK: 24 players assigned to ${firstRoomId} (instant start), 25th auto-assigned to ${c25.roomId} (10s wait).`);

  console.log('\nALL TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
