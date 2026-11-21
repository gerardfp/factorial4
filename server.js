// FACTORIAL 4 (4! = 24) — Unified 24-Player Casual Multiplayer Games Portal & Server
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WSRouter } from './server/ws.js';
import { RecordsStore } from './server/recordsStore.js';
import { discoverGames } from './server/gameRegistry.js';
import { createCampalEngine } from './server/engines/campalEngine.js';
import { createCubeRacerEngine } from './server/engines/cuberacerEngine.js';
import { createCxvallasEngine } from './server/engines/cxvallasEngine.js';
import { createMecanoRaceEngine } from './server/engines/mecanoraceEngine.js';
import { createRacerMasterEngine } from './server/engines/racermasterEngine.js';
import { createTrobixEngine } from './server/engines/trobixEngine.js';
import { SPRITES_DIR as CAMPAL_SPRITES_DIR } from './campal/server/spriteStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(obj));
}

function serveStaticFile(res, baseDir, relPath) {
  const safeRel = relPath.replace(/^\/+/, '') || 'index.html';
  let targetPath = path.resolve(baseDir, safeRel);
  if (!targetPath.startsWith(path.resolve(baseDir))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(targetPath, (statErr, stat) => {
    if (!statErr && stat.isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
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
}

export function createFactorial4Server(options = {}) {
  const recordsFile = options.recordsFile || path.join(ROOT_DIR, 'data', 'records.json');
  const recordsStore = new RecordsStore(recordsFile);
  const discoveredGames = discoverGames(ROOT_DIR);
  const portalClients = new Set();

  let broadcastScheduled = false;
  function schedulePortalBroadcast() {
    if (broadcastScheduled) return;
    broadcastScheduled = true;
    setTimeout(() => {
      broadcastScheduled = false;
      const payload = JSON.stringify({
        type: 'portal_update',
        games: buildGamesPayload(),
        records: recordsStore.getAllSummary(),
      });
      for (const ws of portalClients) {
        if (ws.readyState === 1) ws.send(payload);
      }
    }, 150);
  }

  const engines = {
    campal: createCampalEngine(recordsStore, schedulePortalBroadcast),
    cuberacer: createCubeRacerEngine(recordsStore, schedulePortalBroadcast),
    cxvallas: createCxvallasEngine(recordsStore, schedulePortalBroadcast),
    mecanorace: createMecanoRaceEngine(recordsStore, schedulePortalBroadcast),
    racermaster: createRacerMasterEngine(recordsStore, schedulePortalBroadcast),
    trobix: createTrobixEngine(path.join(ROOT_DIR, 'trobix'), recordsStore, schedulePortalBroadcast),
  };

  recordsStore.on('updated', schedulePortalBroadcast);

  function buildGamesPayload() {
    return discoveredGames.map((game) => {
      const engine = engines[game.id];
      const live = engine ? engine.getLiveStats() : { activePlayers: 0, openRooms: 0, playingRooms: 0, maxPlayers: 24 };
      const summary = recordsStore.getGameSummary(game.id);
      return {
        ...game,
        live,
        topRecordHeadline: summary?.headline || 'Sin récords aún',
      };
    });
  }

  const httpServer = http.createServer((req, res) => {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(urlObj.pathname);

    // Unified Portal APIs
    if (pathname === '/api/games' && req.method === 'GET') {
      return sendJson(res, 200, {
        games: buildGamesPayload(),
        totalOnline: portalClients.size + Object.values(engines).reduce((acc, e) => acc + (e.getLiveStats().activePlayers || 0), 0),
      });
    }

    if (pathname === '/api/records' && req.method === 'GET') {
      return sendJson(res, 200, recordsStore.getAllSummary());
    }

    if (pathname.startsWith('/api/records/') && req.method === 'GET') {
      const gameId = pathname.slice('/api/records/'.length).replace(/\/+$/, '');
      const summary = recordsStore.getGameSummary(gameId);
      if (!summary) return sendJson(res, 404, { error: 'Juego no encontrado' });
      return sendJson(res, 200, summary);
    }

    // MecanoRace APIs
    if (pathname.startsWith('/api/mecanorace/')) {
      if (engines.mecanorace.handleHttp(req, res, pathname)) return;
    }

    // Campal APIs (both /games/campal/api/... and legacy /api/sprites, /api/themes, /api/rooms, /api/battles)
    if (pathname.startsWith('/games/campal/api/')) {
      const subApi = pathname.slice('/games/campal'.length);
      if (engines.campal.handleHttp(req, res, subApi)) return;
    }
    if (
      pathname.startsWith('/api/sprites') ||
      pathname.startsWith('/api/themes') ||
      pathname === '/api/rooms' ||
      pathname === '/api/battles'
    ) {
      if (engines.campal.handleHttp(req, res, pathname)) return;
    }

    // Campal sprites root alias (spriteStore emits /sprites/...)
    if (pathname.startsWith('/sprites/')) {
      return serveStaticFile(res, CAMPAL_SPRITES_DIR, pathname.slice('/sprites/'.length));
    }

    // Redirect bare /games/<id> to /games/<id>/ so relative paths work
    const bareGameMatch = pathname.match(/^\/games\/([a-z0-9_-]+)$/);
    if (bareGameMatch && engines[bareGameMatch[1]]) {
      res.writeHead(302, { Location: `${pathname}/` });
      res.end();
      return;
    }

    // Campal static files
    if (pathname.startsWith('/games/campal/')) {
      const rel = pathname.slice('/games/campal/'.length);
      if (rel === 'preview-thumb.png') {
        const previewPath = path.join(ROOT_DIR, 'campal', 'pix24-low-pixel-preview.png');
        const fallbackLogo = path.join(ROOT_DIR, 'campal', 'pix24-logo.png');
        return serveStaticFile(res, path.join(ROOT_DIR, 'campal'), fs.existsSync(previewPath) ? 'pix24-low-pixel-preview.png' : 'pix24-logo.png');
      }
      if (rel.startsWith('shared/')) {
        return serveStaticFile(res, path.join(ROOT_DIR, 'campal', 'shared'), rel.slice('shared/'.length));
      }
      if (rel.startsWith('sprites/')) {
        return serveStaticFile(res, CAMPAL_SPRITES_DIR, rel.slice('sprites/'.length));
      }
      return serveStaticFile(res, path.join(ROOT_DIR, 'campal', 'public'), rel || 'index.html');
    }

    // Other 5 games static files
    const gameMatch = pathname.match(/^\/games\/(cuberacer|cxvallas|mecanorace|racermaster|trobix)\/(.*)$/);
    if (gameMatch) {
      const [, gameId, rel] = gameMatch;
      // Block serving server.js / package.json / node_modules directly
      if (
        rel.startsWith('node_modules') ||
        rel === 'server.js' ||
        rel === 'package.json' ||
        rel === 'package-lock.json' ||
        rel === 'leaderboard.json'
      ) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      return serveStaticFile(res, path.join(ROOT_DIR, gameId), rel || 'index.html');
    }

    // Portal static files (/ -> public/index.html, /shared/player.js -> public/shared/player.js, etc.)
    const portalRel = pathname === '/' ? 'index.html' : pathname.slice(1);
    return serveStaticFile(res, PUBLIC_DIR, portalRel);
  });

  const wsRouter = new WSRouter(httpServer);

  wsRouter.route('/ws/portal', (ws) => {
    portalClients.add(ws);
    ws.sendJSON({
      type: 'portal_update',
      games: buildGamesPayload(),
      records: recordsStore.getAllSummary(),
    });
    ws.on('close', () => {
      portalClients.delete(ws);
    });
  });

  wsRouter.route('/ws/campal', (ws, req, urlObj) => engines.campal.handleConnection(ws, req, urlObj));
  wsRouter.route('/ws/cuberacer', (ws, req, urlObj) => engines.cuberacer.handleConnection(ws, req, urlObj));
  wsRouter.route('/ws/cxvallas', (ws, req, urlObj) => engines.cxvallas.handleConnection(ws, req, urlObj));
  wsRouter.route('/ws/mecanorace', (ws, req, urlObj) => engines.mecanorace.handleConnection(ws, req, urlObj));
  wsRouter.route('/ws/racermaster', (ws, req, urlObj) => engines.racermaster.handleConnection(ws, req, urlObj));
  wsRouter.route('/ws/trobix', (ws, req, urlObj) => engines.trobix.handleConnection(ws, req, urlObj));

  return {
    httpServer,
    wsRouter,
    recordsStore,
    engines,
    close() {
      for (const engine of Object.values(engines)) {
        engine.close?.();
      }
      wsRouter.close();
      httpServer.closeAllConnections?.();
      httpServer.close();
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const PORT = Number.parseInt(process.env.PORT || '3000', 10);
  const HOST = process.env.HOST || '0.0.0.0';
  const app = createFactorial4Server();
  app.httpServer.listen(PORT, HOST, () => {
    console.log(`\n  FACTORIAL 4 (4! = 24) — Portal de Juegos Casuales Multiplayer`);
    console.log(`  6 juegos activos · Hasta 24 jugadores por partida · Récords en servidor`);
    console.log(`  Abre: http://localhost:${PORT}\n`);
  });
}
