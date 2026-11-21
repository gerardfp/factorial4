// RacerMaster — 24-player Pseudo-3D OutRun Grand Prix server engine with persistent server records
import { sanitizePlayerName } from '../recordsStore.js';

const MAX_PLAYERS = 24;
const DEFAULT_LAPS = 2;
const CAR_SPRITE_TYPES = ['PLAYER_STRAIGHT', 'CAR01', 'CAR02', 'CAR03', 'CAR04'];

export function createRacerMasterEngine(recordsStore, onStatsChange = () => {}) {
  const rooms = new Map();
  const wsToRoom = new Map();
  let nextRoomId = 1;
  let nextClientId = 1;

  function send(ws, obj) {
    if (ws && ws.readyState === 1) ws.sendJSON(obj);
  }

  class RacerRoom {
    constructor() {
      this.id = `racer_${nextRoomId++}`;
      this.state = 'waiting'; // waiting | countdown | racing | finished
      this.laps = DEFAULT_LAPS;
      this.seed = Math.floor(Math.random() * 1e9);
      this.clients = new Map(); // cid -> player state
      this.waitLeft = 10;
      this.countdownVal = 3;
      this.waitInterval = null;
      this.countdownInterval = null;
      this.broadcastInterval = null;
      this.finishTimeout = null;
      this.startedAt = 0;
      this.finishers = [];
    }

    isOpen() {
      return this.state === 'waiting' && this.clients.size < MAX_PLAYERS;
    }

    cleanup() {
      if (this.waitInterval) clearInterval(this.waitInterval);
      if (this.countdownInterval) clearInterval(this.countdownInterval);
      if (this.broadcastInterval) clearInterval(this.broadcastInterval);
      if (this.finishTimeout) clearTimeout(this.finishTimeout);
      this.waitInterval = null;
      this.countdownInterval = null;
      this.broadcastInterval = null;
      this.finishTimeout = null;
    }

    broadcast(obj) {
      const raw = JSON.stringify(obj);
      for (const p of this.clients.values()) {
        if (p.ws.readyState === 1) p.ws.send(raw);
      }
    }

    getRoster() {
      return Array.from(this.clients.values()).map((p) => ({
        id: p.id,
        name: p.name,
        gridIdx: p.gridIdx,
        spriteType: p.spriteType,
        x: p.x,
        z: p.z,
        lap: p.lap,
        totalDist: p.totalDist,
        speed: p.speed,
        finished: p.finished,
        time: p.time,
      }));
    }

    addClient(ws, name) {
      if (!this.isOpen()) return false;
      const gridIdx = this.clients.size;
      const p = {
        ws,
        id: ws.cid,
        name: sanitizePlayerName(name, `Corredor${ws.cid}`),
        gridIdx,
        spriteType: CAR_SPRITE_TYPES[gridIdx % CAR_SPRITE_TYPES.length],
        x: 0,
        z: 0,
        lap: 1,
        totalDist: 0,
        speed: 0,
        finished: false,
        time: null,
        bestLap: null,
      };
      this.clients.set(ws.cid, p);

      const rec = recordsStore.getGameSummary('racermaster');
      send(ws, {
        type: 'joined',
        roomId: this.id,
        playerId: p.id,
        gridIdx: p.gridIdx,
        seed: this.seed,
        laps: this.laps,
        maxPlayers: MAX_PLAYERS,
        waitLeft: this.waitLeft,
        records: { record: rec.record, ranking: rec.ranking.slice(0, 10) },
      });

      this.broadcast({
        type: 'lobby_update',
        players: this.getRoster(),
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
            this.startCountdown();
          }
        }, 1000);
      }

      if (this.clients.size >= MAX_PLAYERS) {
        this.startCountdown();
      }
      return true;
    }

    startCountdown() {
      if (this.state !== 'waiting' || this.clients.size === 0) return;
      if (this.waitInterval) {
        clearInterval(this.waitInterval);
        this.waitInterval = null;
      }
      this.state = 'countdown';
      this.countdownVal = 3;

      // Assign contiguous grid slots 0..N-1
      let idx = 0;
      for (const p of this.clients.values()) {
        p.gridIdx = idx++;
        p.spriteType = CAR_SPRITE_TYPES[p.gridIdx % CAR_SPRITE_TYPES.length];
      }

      this.broadcast({
        type: 'race_countdown',
        value: this.countdownVal,
        seed: this.seed,
        laps: this.laps,
        grid: this.getRoster(),
      });
      onStatsChange();

      this.countdownInterval = setInterval(() => {
        this.countdownVal--;
        if (this.countdownVal <= 0) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
          this.startRace();
        } else {
          this.broadcast({ type: 'race_countdown', value: this.countdownVal });
        }
      }, 1000);
    }

    startRace() {
      if (this.state === 'racing' || this.clients.size === 0) return;
      this.state = 'racing';
      this.startedAt = Date.now();
      this.broadcast({ type: 'race_start', startedAt: this.startedAt, laps: this.laps });

      // Broadcast compact snapshot at 20 Hz for smooth 24-car rendering
      this.broadcastInterval = setInterval(() => {
        if (this.state !== 'racing') return;
        const cars = [];
        for (const p of this.clients.values()) {
          cars.push([
            p.id,
            Number(p.x.toFixed(3)),
            Math.round(p.z),
            p.lap,
            Math.round(p.totalDist),
            p.finished ? 1 : 0,
          ]);
        }
        this.broadcast({ type: 'snapshot', cars });
      }, 50);

      // Hard race timeout: 4 minutes
      this.finishTimeout = setTimeout(() => this.endRace(), 240000);
      onStatsChange();
    }

    handleUpdate(cid, data) {
      const p = this.clients.get(cid);
      if (!p || this.state !== 'racing') return;
      p.x = Math.max(-3, Math.min(3, Number(data.x) || 0));
      p.z = Math.max(0, Number(data.z) || 0);
      p.lap = Math.max(1, Number(data.lap) || 1);
      p.totalDist = Math.max(0, Number(data.totalDist) || 0);
      p.speed = Number(data.speed) || 0;
    }

    handleFinish(cid, data) {
      const p = this.clients.get(cid);
      if (!p || this.state !== 'racing' || p.finished) return;
      p.finished = true;
      p.time = Math.max(2.0, Number(data.time) || (Date.now() - this.startedAt) / 1000);
      p.bestLap = typeof data.bestLap === 'number' && data.bestLap > 0 ? Number(data.bestLap.toFixed(2)) : null;
      this.finishers.push(p);

      this.broadcast({
        type: 'player_finished',
        playerId: p.id,
        name: p.name,
        rank: this.finishers.length,
        time: Number(p.time.toFixed(2)),
      });

      const allFinished = Array.from(this.clients.values()).every((pl) => pl.finished);
      if (allFinished) {
        this.endRace();
      } else if (this.finishers.length === 1) {
        if (this.finishTimeout) clearTimeout(this.finishTimeout);
        this.finishTimeout = setTimeout(() => this.endRace(), 25000);
        this.broadcast({ type: 'finish_countdown', seconds: 25 });
      }
    }

    endRace() {
      if (this.state === 'finished') return;
      this.state = 'finished';
      this.cleanup();

      const standings = [...this.finishers];
      const finishedIds = new Set(standings.map((p) => p.id));
      const rest = Array.from(this.clients.values())
        .filter((p) => !finishedIds.has(p.id))
        .sort((a, b) => b.totalDist - a.totalDist);
      standings.push(...rest);

      recordsStore.recordRacerMasterMatch(standings, this.laps);
      const rec = recordsStore.getGameSummary('racermaster');

      this.broadcast({
        type: 'race_results',
        standings: standings.map((p, idx) => ({
          rank: idx + 1,
          id: p.id,
          name: p.name,
          finished: p.finished,
          time: p.time ? Number(p.time.toFixed(2)) : null,
          bestLap: p.bestLap,
        })),
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
      this.broadcast({ type: 'player_left', id: cid });
      if (this.state === 'waiting') {
        this.broadcast({
          type: 'lobby_update',
          players: this.getRoster(),
          maxPlayers: MAX_PLAYERS,
          waitLeft: this.waitLeft,
        });
      } else if (this.state === 'racing') {
        const allFinished = Array.from(this.clients.values()).every((pl) => pl.finished);
        if (allFinished) this.endRace();
      }
    }
  }

  function joinRoom(ws, name) {
    leaveRoom(ws);
    let room = null;
    for (const r of rooms.values()) {
      if (r.isOpen()) {
        room = r;
        break;
      }
    }
    if (!room) {
      room = new RacerRoom();
      rooms.set(room.id, room);
    }
    room.addClient(ws, name);
    wsToRoom.set(ws.cid, room);
    onStatsChange();
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
    onStatsChange();
  }

  function handleConnection(ws) {
    ws.cid = nextClientId++;
    const rec = recordsStore.getGameSummary('racermaster');
    send(ws, {
      type: 'init',
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

      if (msg.type === 'join') {
        joinRoom(ws, msg.name);
      } else if (msg.type === 'start_now') {
        const room = wsToRoom.get(ws.cid);
        if (room && room.state === 'waiting') room.startCountdown();
      } else if (msg.type === 'update') {
        const room = wsToRoom.get(ws.cid);
        if (room) room.handleUpdate(ws.cid, msg);
      } else if (msg.type === 'finish') {
        const room = wsToRoom.get(ws.cid);
        if (room) room.handleFinish(ws.cid, msg);
      } else if (msg.type === 'leave') {
        leaveRoom(ws);
      }
    });

    ws.on('close', () => {
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
      else if (r.state === 'countdown' || r.state === 'racing') playingRooms++;
    }
    return { activePlayers, openRooms, playingRooms, maxPlayers: MAX_PLAYERS };
  }

  function close() {
    for (const r of rooms.values()) r.cleanup();
    rooms.clear();
  }

  return { handleConnection, getLiveStats, close };
}
