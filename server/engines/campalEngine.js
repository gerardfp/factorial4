// Campal 24-player Battle Royale server engine mounted into Factorial4
import { GameRoom } from '../../campal/server/gameRoom.js';
import { MAX_PLAYERS } from '../../campal/shared/constants.js';
import {
  ensureDefaultSprites,
  getSpritesCatalog,
  saveCustomSprite,
  restoreSprite,
  restoreAllSprites,
  saveDerivedTheme,
  restoreOrDeleteCustomTheme,
} from '../../campal/server/spriteStore.js';

function sanitizeRoomCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 14);
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function createCampalEngine(recordsStore, onStatsChange = () => {}) {
  ensureDefaultSprites();
  const rooms = new Map();
  let nextBattleNum = 1;

  function onMatchEnd({ ranking }) {
    recordsStore.recordCampalMatch(ranking);
    onStatsChange();
  }

  function cleanupFinishedRooms() {
    const now = Date.now();
    let changed = false;
    for (const [code, room] of rooms.entries()) {
      const graceExpired = now - room.createdAt > 6000;
      if (room.getHumanCount() === 0 && (graceExpired || room.state === 'ended')) {
        room.stopLoop();
        rooms.delete(code);
        changed = true;
      }
    }
    if (changed) onStatsChange();
  }

  function createBattleRoom(config = {}) {
    const code = `BATALLA-${nextBattleNum++}`;
    const room = new GameRoom(code, { config, onMatchEnd });
    rooms.set(code, room);
    onStatsChange();
    return room;
  }

  function findOrCreateOpenBattle(requestedCode, fillBotsPref) {
    cleanupFinishedRooms();
    const explicitCode = sanitizeRoomCode(requestedCode);

    if (explicitCode && explicitCode !== 'AUTO' && explicitCode !== 'PUBLICA') {
      let room = rooms.get(explicitCode);
      if (!room) {
        room = new GameRoom(explicitCode, { fillBots: fillBotsPref, onMatchEnd });
        rooms.set(explicitCode, room);
      }
      return room;
    }

    for (const room of rooms.values()) {
      if (room.isOpenForJoining()) {
        return room;
      }
    }

    return createBattleRoom({ fillBots: fillBotsPref });
  }

  function handleHttp(req, res, pathname) {
    if (pathname === '/api/rooms' && req.method === 'GET') {
      cleanupFinishedRooms();
      const list = Array.from(rooms.values()).map((r) => r.getSummary());
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ rooms: list }));
      return true;
    }

    if (pathname === '/api/battles' && req.method === 'POST') {
      readJsonBody(req)
        .then((config) => {
          cleanupFinishedRooms();
          const room = createBattleRoom(config);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, roomId: room.roomId, room: room.getSummary() }));
        })
        .catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message || 'Configuración inválida' }));
        });
      return true;
    }

    if (pathname === '/api/sprites' && req.method === 'GET') {
      const catalog = getSpritesCatalog();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(catalog));
      return true;
    }

    if (pathname === '/api/sprites/save' && req.method === 'POST') {
      readJsonBody(req)
        .then((payload) => {
          const entry = saveCustomSprite(payload);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, sprite: entry }));
        })
        .catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message || 'Error guardando PNG' }));
        });
      return true;
    }

    if (pathname === '/api/sprites/restore' && req.method === 'POST') {
      readJsonBody(req)
        .then((payload) => {
          const result = restoreSprite(payload.key, payload.theme);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, ...result }));
        })
        .catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message || 'Error restaurando sprite' }));
        });
      return true;
    }

    if (pathname === '/api/sprites/restore-all' && req.method === 'POST') {
      readJsonBody(req)
        .then((payload) => {
          const catalog = restoreAllSprites(payload?.theme || null);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, ...catalog }));
        })
        .catch(() => {
          const catalog = restoreAllSprites(null);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, ...catalog }));
        });
      return true;
    }

    if (pathname === '/api/themes/save' && req.method === 'POST') {
      readJsonBody(req)
        .then((payload) => {
          const result = saveDerivedTheme(payload);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, ...result }));
        })
        .catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message || 'Error guardando tema' }));
        });
      return true;
    }

    if (pathname === '/api/themes/restore' && req.method === 'POST') {
      readJsonBody(req)
        .then((payload) => {
          const result = restoreOrDeleteCustomTheme(payload?.themeId || payload?.theme || 'campo');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, ...result }));
        })
        .catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message || 'Error restaurando tema' }));
        });
      return true;
    }

    return false;
  }

  function handleConnection(ws, _req, urlObj) {
    const requestedRoom = urlObj.searchParams.get('room') || '';
    const name = urlObj.searchParams.get('name') || '';
    const skin = Number.parseInt(urlObj.searchParams.get('skin') || '0', 10);
    const botsParam = urlObj.searchParams.get('bots');
    const fillBotsPref = botsParam === null ? true : botsParam !== '0' && botsParam !== 'false';

    const room = findOrCreateOpenBattle(requestedRoom, fillBotsPref);
    const client = room.addClient(ws, name, Number.isNaN(skin) ? 0 : skin, fillBotsPref);
    if (!client) return;
    onStatsChange();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        room.handleMessage(client.id, msg);
      } catch {
        // ignore malformed packets
      }
    });

    ws.on('close', () => {
      room.removeClient(client.id);
      cleanupFinishedRooms();
      onStatsChange();
    });
  }

  function getLiveStats() {
    cleanupFinishedRooms();
    let activePlayers = 0;
    let openRooms = 0;
    let playingRooms = 0;
    for (const room of rooms.values()) {
      const humans = room.getHumanCount();
      activePlayers += humans;
      if (room.isOpenForJoining()) openRooms++;
      else if (room.state === 'playing' || room.state === 'ready') playingRooms++;
    }
    return { activePlayers, openRooms, playingRooms, maxPlayers: MAX_PLAYERS };
  }

  function close() {
    for (const room of rooms.values()) {
      room.stopLoop();
    }
    rooms.clear();
  }

  return { handleConnection, handleHttp, getLiveStats, close };
}
