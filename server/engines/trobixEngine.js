// Trobix — 24-player synchronized Interactive SVG Map Quiz Battle engine with persistent server records
import fs from 'node:fs';
import path from 'node:path';
import { sanitizePlayerName } from '../recordsStore.js';

const MAX_PLAYERS = 24;
const ROUNDS_PER_MATCH = 12;
const ROUND_SECONDS = 12;
const BETWEEN_ROUNDS_MS = 2200;

function loadTrobixMaps(trobixDir) {
  const maps = new Map();
  for (let i = 1; i <= 25; i++) {
    const filePath = path.join(trobixDir, `${i}.svg`);
    if (!fs.existsSync(filePath)) break;
    try {
      const txt = fs.readFileSync(filePath, 'utf8');
      const m = txt.match(/<metadata[^>]*>([\s\S]*?)<\/metadata>/);
      const raw = m
        ? m[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
        : null;
      const meta = raw ? JSON.parse(raw) : { title: { es: `Mapa ${i}`, ca: `Mapa ${i}` } };
      const names = [];
      const seen = new Set();
      for (const match of txt.matchAll(/\bname="([^"]+)"/g)) {
        const key = match[1];
        if (key && !seen.has(key)) {
          seen.add(key);
          names.push(key);
        }
      }
      maps.set(i, {
        id: i,
        file: `${i}.svg`,
        title: meta.title || { es: `Mapa ${i}`, ca: `Mapa ${i}` },
        category: meta.category || { es: 'Otros', ca: 'Altres' },
        targets: names,
      });
    } catch (err) {
      console.error(`[Trobix] Error parsing ${filePath}:`, err.message);
    }
  }
  return maps;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createTrobixEngine(trobixDir, recordsStore, onStatsChange = () => {}) {
  const maps = loadTrobixMaps(trobixDir);
  const rooms = new Map();
  const wsToRoom = new Map();
  const allClients = new Set();
  let nextRoomId = 1;
  let nextClientId = 1;

  function send(ws, obj) {
    if (ws && ws.readyState === 1) ws.sendJSON(obj);
  }

  function getOpenRoomsSummary() {
    const list = [];
    for (const r of rooms.values()) {
      if (r.isOpen()) {
        list.push({
          roomId: r.id,
          mapId: r.map.id,
          mapTitle: r.map.title,
          players: r.clients.size,
          maxPlayers: MAX_PLAYERS,
          waitLeft: r.waitLeft,
        });
      }
    }
    return list;
  }

  function broadcastOpenRooms() {
    const payload = JSON.stringify({
      type: 'open_rooms',
      rooms: getOpenRoomsSummary(),
    });
    for (const ws of allClients) {
      if (ws.readyState === 1 && !wsToRoom.has(ws.cid)) {
        ws.send(payload);
      }
    }
  }

  class TrobixRoom {
    constructor(map) {
      this.id = `trobix_${nextRoomId++}`;
      this.map = map;
      this.state = 'waiting'; // waiting | playing | reveal | ended
      this.clients = new Map(); // cid -> player
      this.waitLeft = 10;
      this.waitInterval = null;
      this.roundTimer = null;
      this.nextRoundTimeout = null;
      this.targetsQueue = [];
      this.roundIndex = -1;
      this.currentTarget = null;
      this.roundStartedAt = 0;
      this.roundSolvers = []; // ordered list of cids who solved current round
      this.roundErrors = new Map(); // cid -> errors in current round
    }

    isOpen() {
      return this.state === 'waiting' && this.clients.size < MAX_PLAYERS;
    }

    cleanup() {
      if (this.waitInterval) clearInterval(this.waitInterval);
      if (this.roundTimer) clearInterval(this.roundTimer);
      if (this.nextRoundTimeout) clearTimeout(this.nextRoundTimeout);
      this.waitInterval = null;
      this.roundTimer = null;
      this.nextRoundTimeout = null;
    }

    broadcast(obj) {
      const raw = JSON.stringify(obj);
      for (const p of this.clients.values()) {
        if (p.ws.readyState === 1) p.ws.send(raw);
      }
    }

    getLeaderboard() {
      return Array.from(this.clients.values())
        .map((p) => ({
          id: p.id,
          name: p.name,
          score: p.score,
          hits: p.hits,
          errors: p.errors,
          solvedCurrent: this.roundSolvers.includes(p.id),
        }))
        .sort((a, b) => b.score - a.score || b.hits - a.hits || a.errors - b.errors);
    }

    addClient(ws, name) {
      if (!this.isOpen()) return false;
      const p = {
        ws,
        id: ws.cid,
        name: sanitizePlayerName(name, `Explorador${ws.cid}`),
        score: 0,
        hits: 0,
        errors: 0,
      };
      this.clients.set(ws.cid, p);

      const rec = recordsStore.getGameSummary('trobix');
      send(ws, {
        type: 'joined_room',
        roomId: this.id,
        playerId: p.id,
        mapId: this.map.id,
        mapTitle: this.map.title,
        maxPlayers: MAX_PLAYERS,
        waitLeft: this.waitLeft,
        totalRounds: Math.min(ROUNDS_PER_MATCH, this.map.targets.length),
        mapRecord: rec.mapRecords?.[String(this.map.id)] || null,
      });

      this.broadcast({
        type: 'lobby_update',
        players: this.getLeaderboard(),
        maxPlayers: MAX_PLAYERS,
        waitLeft: this.waitLeft,
      });

      if (this.clients.size === 1 && !this.waitInterval) {
        this.waitLeft = 10;
        this.waitInterval = setInterval(() => {
          this.waitLeft--;
          this.broadcast({ type: 'wait_tick', value: this.waitLeft });
          if (this.waitLeft <= 0) {
            clearInterval(this.waitInterval);
            this.waitInterval = null;
            this.startMatch();
          }
        }, 1000);
      }

      if (this.clients.size >= MAX_PLAYERS) {
        this.startMatch();
      }
      return true;
    }

    startMatch() {
      if (this.state !== 'waiting' || this.clients.size === 0) return;
      if (this.waitInterval) {
        clearInterval(this.waitInterval);
        this.waitInterval = null;
      }
      const totalRounds = Math.min(ROUNDS_PER_MATCH, this.map.targets.length);
      this.targetsQueue = shuffleArray(this.map.targets).slice(0, totalRounds);
      this.roundIndex = -1;
      this.state = 'playing';

      this.broadcast({
        type: 'match_start',
        mapId: this.map.id,
        totalRounds: this.targetsQueue.length,
        roundSeconds: ROUND_SECONDS,
        leaderboard: this.getLeaderboard(),
      });
      broadcastOpenRooms();
      onStatsChange();

      this.startNextRound();
    }

    startNextRound() {
      if (this.clients.size === 0) return;
      this.roundIndex++;
      if (this.roundIndex >= this.targetsQueue.length) {
        this.endMatch();
        return;
      }

      this.state = 'playing';
      this.currentTarget = this.targetsQueue[this.roundIndex];
      this.roundStartedAt = Date.now();
      this.roundSolvers = [];
      this.roundErrors.clear();

      let timeLeft = ROUND_SECONDS;
      this.broadcast({
        type: 'round_start',
        round: this.roundIndex + 1,
        totalRounds: this.targetsQueue.length,
        targetId: this.currentTarget,
        timeLeft,
        leaderboard: this.getLeaderboard(),
      });

      if (this.roundTimer) clearInterval(this.roundTimer);
      this.roundTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
          clearInterval(this.roundTimer);
          this.roundTimer = null;
          this.finishRound();
        } else {
          this.broadcast({ type: 'round_tick', timeLeft });
        }
      }, 1000);
    }

    handleAnswer(cid, clickedKey) {
      if (this.state !== 'playing') return;
      const p = this.clients.get(cid);
      if (!p || this.roundSolvers.includes(cid)) return;

      if (clickedKey === this.currentTarget) {
        this.roundSolvers.push(cid);
        const elapsedMs = Date.now() - this.roundStartedAt;
        const speedRatio = Math.max(0, 1 - elapsedMs / (ROUND_SECONDS * 1000));
        const rankIdx = this.roundSolvers.length - 1;
        const rankBonus = rankIdx === 0 ? 250 : rankIdx === 1 ? 150 : rankIdx === 2 ? 100 : 0;
        const errCount = this.roundErrors.get(cid) || 0;
        const gained = Math.max(150, Math.round(400 + speedRatio * 600 + rankBonus - errCount * 100));

        p.score += gained;
        p.hits += 1;

        send(p.ws, {
          type: 'answer_result',
          correct: true,
          clickedKey,
          gained,
          rank: rankIdx + 1,
        });

        this.broadcast({
          type: 'player_found',
          playerId: p.id,
          name: p.name,
          gained,
          rank: rankIdx + 1,
          solvedCount: this.roundSolvers.length,
          totalPlayers: this.clients.size,
          leaderboard: this.getLeaderboard(),
        });

        if (this.roundSolvers.length >= this.clients.size) {
          if (this.roundTimer) {
            clearInterval(this.roundTimer);
            this.roundTimer = null;
          }
          this.finishRound();
        }
      } else {
        p.errors += 1;
        this.roundErrors.set(cid, (this.roundErrors.get(cid) || 0) + 1);
        send(p.ws, {
          type: 'answer_result',
          correct: false,
          clickedKey,
        });
      }
    }

    finishRound() {
      if (this.state !== 'playing') return;
      this.state = 'reveal';
      this.broadcast({
        type: 'round_end',
        targetId: this.currentTarget,
        solvedCount: this.roundSolvers.length,
        totalPlayers: this.clients.size,
        leaderboard: this.getLeaderboard(),
      });

      this.nextRoundTimeout = setTimeout(() => {
        this.startNextRound();
      }, BETWEEN_ROUNDS_MS);
    }

    endMatch() {
      if (this.state === 'ended') return;
      this.state = 'ended';
      this.cleanup();
      const standings = this.getLeaderboard();
      recordsStore.recordTrobixMatch(standings, this.map.id, this.map.title?.es || `Mapa ${this.map.id}`);
      const rec = recordsStore.getGameSummary('trobix');

      this.broadcast({
        type: 'match_end',
        standings,
        mapRecord: rec.mapRecords?.[String(this.map.id)] || null,
        records: { record: rec.record, ranking: rec.ranking.slice(0, 10) },
      });
      onStatsChange();
    }

    removeClient(cid) {
      this.clients.delete(cid);
      if (this.clients.size === 0) {
        this.cleanup();
        return;
      }
      if (this.state === 'waiting') {
        this.broadcast({
          type: 'lobby_update',
          players: this.getLeaderboard(),
          maxPlayers: MAX_PLAYERS,
          waitLeft: this.waitLeft,
        });
      } else if (this.state === 'playing') {
        if (this.roundSolvers.length >= this.clients.size) {
          if (this.roundTimer) {
            clearInterval(this.roundTimer);
            this.roundTimer = null;
          }
          this.finishRound();
        }
      }
    }
  }

  function leaveRoom(ws) {
    const room = wsToRoom.get(ws.cid);
    wsToRoom.delete(ws.cid);
    if (!room) return;
    room.removeClient(ws.cid);
    if (room.clients.size === 0) {
      room.cleanup();
      rooms.delete(room.id);
    }
    broadcastOpenRooms();
    onStatsChange();
  }

  function joinOrCreateMapRoom(ws, mapId, name, explicitRoomId = null) {
    leaveRoom(ws);
    let room = null;
    if (explicitRoomId && rooms.has(explicitRoomId)) {
      const candidate = rooms.get(explicitRoomId);
      if (candidate.isOpen()) room = candidate;
    }
    if (!room) {
      const map = maps.get(Number(mapId)) || maps.get(1);
      if (!map) return;
      for (const r of rooms.values()) {
        if (r.isOpen() && r.map.id === map.id) {
          room = r;
          break;
        }
      }
      if (!room) {
        room = new TrobixRoom(map);
        rooms.set(room.id, room);
      }
    }
    room.addClient(ws, name);
    wsToRoom.set(ws.cid, room);
    broadcastOpenRooms();
    onStatsChange();
  }

  function handleConnection(ws) {
    ws.cid = nextClientId++;
    allClients.add(ws);
    const rec = recordsStore.getGameSummary('trobix');
    send(ws, {
      type: 'init',
      openRooms: getOpenRoomsSummary(),
      mapRecords: rec.mapRecords || {},
      records: { record: rec.record, ranking: rec.ranking.slice(0, 10) },
      maxPlayers: MAX_PLAYERS,
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === 'join_map') {
        joinOrCreateMapRoom(ws, msg.mapId, msg.name, msg.roomId || null);
      } else if (msg.type === 'start_now') {
        const room = wsToRoom.get(ws.cid);
        if (room && room.state === 'waiting') room.startMatch();
      } else if (msg.type === 'answer') {
        const room = wsToRoom.get(ws.cid);
        if (room && typeof msg.key === 'string') room.handleAnswer(ws.cid, msg.key);
      } else if (msg.type === 'leave') {
        leaveRoom(ws);
        send(ws, { type: 'open_rooms', rooms: getOpenRoomsSummary() });
      }
    });

    ws.on('close', () => {
      allClients.delete(ws);
      leaveRoom(ws);
    });
  }

  function getLiveStats() {
    let activePlayers = 0;
    let openRooms = 0;
    let playingRooms = 0;
    for (const r of rooms.values()) {
      activePlayers += r.clients.size;
      if (r.isOpen()) openRooms++;
      else if (r.state === 'playing' || r.state === 'reveal') playingRooms++;
    }
    return { activePlayers, openRooms, playingRooms, maxPlayers: MAX_PLAYERS };
  }

  function close() {
    for (const r of rooms.values()) r.cleanup();
    rooms.clear();
  }

  return { handleConnection, getLiveStats, close };
}
