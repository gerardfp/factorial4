// HTTP static server + automatic hostless 24-player Battle Royale room matchmaking
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WSServer } from './ws.js';
import { GameRoom } from './gameRoom.js';
import { MAX_PLAYERS } from '../shared/constants.js';
import {
  SPRITES_DIR,
  ensureDefaultSprites,
  getSpritesCatalog,
  saveCustomSprite,
  restoreSprite,
  restoreAllSprites,
  saveDerivedTheme,
  restoreOrDeleteCustomTheme,
} from './spriteStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SHARED_DIR = path.join(ROOT_DIR, 'shared');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sanitizeRoomCode(raw) {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 14);
  return cleaned || '';
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

export function createCampalServer() {
  ensureDefaultSprites();
  const rooms = new Map();
  let nextBattleNum = 1;

  function cleanupFinishedRooms() {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      const graceExpired = now - room.createdAt > 6000;
      if (room.getHumanCount() === 0 && (graceExpired || room.state === 'ended')) {
        room.stopLoop();
        rooms.delete(code);
      }
    }
  }

  function createBattleRoom(config = {}) {
    const code = `BATALLA-${nextBattleNum++}`;
    const room = new GameRoom(code, { config });
    rooms.set(code, room);
    return room;
  }

  // Assign requested open battle, or first available open battle, or create a default one automatically
  function findOrCreateOpenBattle(requestedCode, fillBotsPref) {
    cleanupFinishedRooms();
    const explicitCode = sanitizeRoomCode(requestedCode);

    if (explicitCode && explicitCode !== 'AUTO' && explicitCode !== 'PUBLICA') {
      let room = rooms.get(explicitCode);
      if (!room) {
        room = new GameRoom(explicitCode, { fillBots: fillBotsPref });
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

  const httpServer = http.createServer((req, res) => {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(urlObj.pathname);

    if (pathname === '/api/rooms' && req.method === 'GET') {
      cleanupFinishedRooms();
      const list = Array.from(rooms.values()).map((r) => r.getSummary());
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ rooms: list }));
      return;
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
      return;
    }

    if (pathname === '/api/sprites' && req.method === 'GET') {
      const catalog = getSpritesCatalog();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(catalog));
      return;
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
      return;
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
      return;
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
      return;
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
      return;
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
      return;
    }

    let targetPath;
    if (pathname.startsWith('/sprites/')) {
      const rel = pathname.slice('/sprites/'.length);
      targetPath = path.resolve(SPRITES_DIR, rel);
      if (!targetPath.startsWith(SPRITES_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
    } else if (pathname.startsWith('/shared/')) {
      const rel = pathname.slice('/shared/'.length);
      targetPath = path.resolve(SHARED_DIR, rel);
      if (!targetPath.startsWith(SHARED_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
    } else {
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      targetPath = path.resolve(PUBLIC_DIR, rel);
      if (!targetPath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
    }

    fs.readFile(targetPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(targetPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });

  const wss = new WSServer(httpServer);

  wss.on('connection', (ws, req) => {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const requestedRoom = urlObj.searchParams.get('room') || '';
    const name = urlObj.searchParams.get('name') || '';
    const skin = Number.parseInt(urlObj.searchParams.get('skin') || '0', 10);
    const botsParam = urlObj.searchParams.get('bots');
    const fillBotsPref = botsParam === null ? true : botsParam !== '0' && botsParam !== 'false';

    const room = findOrCreateOpenBattle(requestedRoom, fillBotsPref);
    const client = room.addClient(ws, name, Number.isNaN(skin) ? 0 : skin, fillBotsPref);
    if (!client) return;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        room.handleMessage(client.id, msg);
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      room.removeClient(client.id);
      cleanupFinishedRooms();
    });
  });

  return {
    httpServer,
    wss,
    rooms,
    close() {
      for (const room of rooms.values()) {
        room.stopLoop();
      }
      wss.close();
      httpServer.closeAllConnections?.();
      httpServer.close();
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const PORT = Number.parseInt(process.env.PORT || '3000', 10);
  const HOST = process.env.HOST || '0.0.0.0';
  const server = createCampalServer();
  server.httpServer.listen(PORT, HOST, () => {
    console.log(`\n  CAMPAL - Batalla Campal Pixel Art (hasta ${MAX_PLAYERS} jugadores)`);
    console.log(`  Servidor listo en: http://localhost:${PORT}\n`);
  });
}
