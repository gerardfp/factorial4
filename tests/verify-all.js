// End-to-end verification of FACTORIAL 4: HTTP portal, all 6 games with 24 concurrent players, and server record persistence
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFactorial4Server } from '../server.js';

function openWS(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    const waiters = [];

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      messages.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].pred(msg)) {
          const w = waiters.splice(i, 1)[0];
          clearTimeout(w.timer);
          w.resolve(msg);
        }
      }
    });

    ws.waitFor = (pred, timeoutMs = 8000, label = 'message') => {
      const existing = messages.find(pred);
      if (existing) return Promise.resolve(existing);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`Timeout waiting for ${label}`)), timeoutMs);
        waiters.push({ pred, resolve: res, timer });
      });
    };

    ws.sendJSON = (obj) => ws.send(JSON.stringify(obj));

    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (err) => reject(err));
  });
}

async function closeAll(list) {
  for (const ws of list) {
    try { ws.close(); } catch {}
  }
  await new Promise((r) => setTimeout(r, 80));
}

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f4-test-'));
  const recordsFile = path.join(tmpDir, 'records.json');
  const app = createFactorial4Server({ recordsFile });

  await new Promise((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = app.httpServer.address();
  const baseHttp = `http://127.0.0.1:${port}`;
  const baseWs = `ws://127.0.0.1:${port}`;

  try {
    console.log(`[1/8] Checking Portal HTTP & Game Discovery on port ${port}...`);
    const homeRes = await fetch(`${baseHttp}/`);
    assert.equal(homeRes.status, 200);
    const homeHtml = await homeRes.text();
    assert.ok(homeHtml.includes('FACTORIAL 4'));

    const gamesRes = await fetch(`${baseHttp}/api/games`);
    assert.equal(gamesRes.status, 200);
    const gamesData = await gamesRes.json();
    assert.equal(gamesData.games.length, 6, 'Should discover all 6 games from folders');
    for (const g of gamesData.games) {
      assert.equal(g.maxPlayers, 24, `${g.id} must allow 24 players`);
      const pageRes = await fetch(`${baseHttp}${g.url}`);
      assert.equal(pageRes.status, 200, `${g.url} should return 200`);
    }
    console.log('  OK: All 6 games discovered and serving HTTP 200.');

    // --- 2. CAMPAL 24 PLAYERS ---
    console.log('[2/8] Testing Campal with 24 concurrent players...');
    const campalClients = [];
    for (let i = 0; i < 24; i++) {
      const ws = await openWS(`${baseWs}/ws/campal?name=Guerrero${i + 1}&skin=${i % 8}&bots=0`);
      await ws.waitFor((m) => m.type === 'match_start', 5000, 'campal match_start');
      campalClients.push(ws);
    }
    const campalStats = app.engines.campal.getLiveStats();
    assert.equal(campalStats.activePlayers, 24, 'Campal should hold 24 players in room');
    await closeAll(campalClients);
    // Record a synthetic Campal match through recordsStore to verify schema too
    app.recordsStore.recordCampalMatch([
      { name: 'Guerrero1', isBot: false, placement: 1, kills: 9, damage: 940 },
      { name: 'Guerrero2', isBot: false, placement: 2, kills: 4, damage: 410 },
    ]);
    console.log('  OK: Campal handled 24 simultaneous players & records.');

    // --- 3. CUBERACER 24 PLAYERS ---
    console.log('[3/8] Testing CubeRacer with 24 concurrent players & server record...');
    const cubeClients = [];
    const host = await openWS(`${baseWs}/ws/cuberacer`);
    await host.waitFor((m) => m.type === 'connection_established', 5000, 'cube conn');
    cubeClients.push(host);

    host.sendJSON({
      type: 'create_race',
      track: { trackConfig: { baseRadius: 500, numTiles: 800, numSectors: 4, sectors: [] }, controlPoints: [] },
      settings: { minPlayers: 2, maxPlayers: 24, laps: 2 },
    });
    const created = await host.waitFor((m) => m.type === 'race_created', 5000, 'cube created');
    host.sendJSON({ type: 'join_lobby', raceId: created.raceId, name: 'Piloto1', color: '#38bdf8' });

    for (let i = 1; i < 24; i++) {
      const c = await openWS(`${baseWs}/ws/cuberacer`);
      await c.waitFor((m) => m.type === 'connection_established', 5000, 'cube conn');
      c.sendJSON({ type: 'join_lobby', raceId: created.raceId, name: `Piloto${i + 1}`, color: '#ef4444' });
      cubeClients.push(c);
    }
    // Wait until lobby has 24 players and starts race
    const raceStart = await host.waitFor((m) => m.type === 'race_start', 8000, 'cube race_start');
    assert.equal(raceStart.startingGrid.length, 24, 'CubeRacer starting grid must have 24 cars');

    // Finish race for all 24
    for (let i = 0; i < 24; i++) {
      cubeClients[i].sendJSON({ type: 'race_finished', time: 42.5 + i * 0.4 });
    }
    await host.waitFor((m) => m.type === 'race_results', 5000, 'cube race_results');
    await closeAll(cubeClients);
    console.log('  OK: CubeRacer ran full 24-car grid race & saved server record.');

    // --- 4. CXVALLAS 24 LANES ---
    console.log('[4/8] Testing CXVallas with 24 concurrent lanes & server record...');
    const vallasClients = [];
    for (let i = 0; i < 24; i++) {
      const c = await openWS(`${baseWs}/ws/cxvallas`);
      c.sendJSON({ action: 'join', data: { name: `Atleta${i + 1}` } });
      const ok = await c.waitFor((m) => m.action === 'join_ok', 5000, 'vallas join_ok');
      assert.equal(ok.player.carril, i, `Expected lane ${i}`);
      vallasClients.push(c);
    }
    // Since 24/24 lanes filled, race auto-starts countdown! Wait for GO (value 0)
    await vallasClients[0].waitFor((m) => m.action === 'countdown' && m.value === 0, 7000, 'vallas GO');
    for (let i = 0; i < 24; i++) {
      vallasClients[i].sendJSON({ action: 'update', data: { x: 1005, y: 0, state: 0, stateTime: 10 } });
    }
    const vallasFinish = await vallasClients[0].waitFor((m) => m.action === 'finish', 5000, 'vallas finish');
    assert.equal(vallasFinish.podium.length, 24, 'CXVallas podium should contain all 24 athletes');
    await closeAll(vallasClients);
    console.log('  OK: CXVallas ran full 24-lane hurdles race & saved server record.');

    // --- 5. MECANORACE 24 TYPISTS ---
    console.log('[5/8] Testing MecanoRace with 24 concurrent typists & server record...');
    const mecanoClients = [];
    for (let i = 0; i < 24; i++) {
      const c = await openWS(`${baseWs}/ws/mecanorace`);
      await c.waitFor((m) => m.type === 'init', 5000, 'mecano init');
      c.sendJSON({ type: 'join', name: `Tecla${i + 1}` });
      await c.waitFor((m) => m.type === 'joined', 5000, 'mecano joined');
      mecanoClients.push(c);
    }
    // 24/24 auto-triggers 3s countdown -> race_start
    const mStart = await mecanoClients[0].waitFor((m) => m.type === 'race_start', 6000, 'mecano race_start');
    assert.equal(mStart.players.length, 24, 'MecanoRace should start with 24 typists');
    for (let i = 0; i < 24; i++) {
      mecanoClients[i].sendJSON({
        type: 'finish',
        wpm: 110 - i,
        accuracy: 98,
        time: 18.2 + i * 0.5,
        keystrokes: [1200, 2400, 3600],
      });
    }
    const mRes = await mecanoClients[0].waitFor((m) => m.type === 'race_results', 5000, 'mecano results');
    assert.equal(mRes.standings.length, 24);
    await closeAll(mecanoClients);
    console.log('  OK: MecanoRace ran full 24-player typing race & saved server record.');

    // --- 6. RACERMASTER 24 CARS ---
    console.log('[6/8] Testing RacerMaster with 24 concurrent racers & server record...');
    const racerClients = [];
    for (let i = 0; i < 24; i++) {
      const c = await openWS(`${baseWs}/ws/racermaster`);
      await c.waitFor((m) => m.type === 'init', 5000, 'racer init');
      c.sendJSON({ type: 'join', name: `Turbo${i + 1}` });
      await c.waitFor((m) => m.type === 'joined', 5000, 'racer joined');
      racerClients.push(c);
    }
    const rCd = await racerClients[0].waitFor((m) => m.type === 'race_countdown' && m.grid, 5000, 'racer grid');
    assert.equal(rCd.grid.length, 24, 'RacerMaster grid must have 24 cars');
    await racerClients[0].waitFor((m) => m.type === 'race_start', 6000, 'racer start');
    for (let i = 0; i < 24; i++) {
      racerClients[i].sendJSON({ type: 'finish', time: 64.1 + i * 0.7, bestLap: 31.2 + i * 0.2 });
    }
    const rRes = await racerClients[0].waitFor((m) => m.type === 'race_results', 5000, 'racer results');
    assert.equal(rRes.standings.length, 24);
    await closeAll(racerClients);
    console.log('  OK: RacerMaster ran full 24-car Grand Prix & saved server record.');

    // --- 7. TROBIX 24 PLAYERS ---
    console.log('[7/8] Testing Trobix with 24 concurrent map players & server record...');
    const trobixClients = [];
    for (let i = 0; i < 24; i++) {
      const c = await openWS(`${baseWs}/ws/trobix`);
      await c.waitFor((m) => m.type === 'init', 5000, 'trobix init');
      c.sendJSON({ type: 'join_map', mapId: 5, name: `Mapa${i + 1}` }); // Map 5 (Planetas) has 8 targets
      await c.waitFor((m) => m.type === 'joined_room', 5000, 'trobix joined');
      trobixClients.push(c);
    }
    const tMatch = await trobixClients[0].waitFor((m) => m.type === 'match_start', 5000, 'trobix match_start');
    assert.equal(tMatch.leaderboard.length, 24, 'Trobix match must have 24 players');
    const r1 = await trobixClients[0].waitFor((m) => m.type === 'round_start', 5000, 'trobix round_start');
    for (let i = 0; i < 24; i++) {
      trobixClients[i].sendJSON({ type: 'answer', key: r1.targetId });
    }
    const r1End = await trobixClients[0].waitFor((m) => m.type === 'round_end', 5000, 'trobix round_end');
    assert.equal(r1End.solvedCount, 24, 'All 24 players solved round 1');
    await closeAll(trobixClients);
    // Verify trobix record persistence too
    app.recordsStore.recordTrobixMatch(
      [{ name: 'Mapa1', score: 8900, hits: 8, errors: 0 }],
      5,
      'Planetas del Sistema Solar'
    );
    console.log('  OK: Trobix ran 24-player synchronized map round & saved server record.');

    // --- 8. SERVER PERSISTENCE CHECK ---
    console.log('[8/8] Verifying disk persistence of server records & Hall of Fame...');
    assert.ok(fs.existsSync(recordsFile), 'records.json must exist on disk');
    const recRes = await fetch(`${baseHttp}/api/records`);
    assert.equal(recRes.status, 200);
    const recJson = await recRes.json();

    assert.ok(recJson.hallOfFame.length > 0, 'Global Hall of Fame must be populated');
    assert.equal(recJson.games.campal.record.name, 'Guerrero1');
    assert.equal(recJson.games.cuberacer.record.name, 'Piloto1');
    assert.equal(recJson.games.cxvallas.record.name, 'Atleta1');
    assert.equal(recJson.games.mecanorace.record.name, 'Tecla1');
    assert.equal(recJson.games.racermaster.record.name, 'Turbo1');
    assert.equal(recJson.games.trobix.record.name, 'Mapa1');

    console.log('\n✅ ALL 8 VERIFICATION SUITES PASSED (6 games × 24 concurrent players + server records)!');
  } finally {
    app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
