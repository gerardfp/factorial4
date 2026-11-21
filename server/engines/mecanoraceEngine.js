// MecanoRace — 24-player live typing Grand Prix engine with server texts, ghost & persistent records
import { sanitizePlayerName } from '../recordsStore.js';

const MAX_PLAYERS = 24;

function readJsonBody(req, maxBytes = 256 * 1024) {
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

export function createMecanoRaceEngine(recordsStore, onStatsChange = () => {}) {
  const rooms = new Map();
  const wsToRoom = new Map();
  let nextRoomId = 1;
  let nextClientId = 1;

  function send(ws, obj) {
    if (ws && ws.readyState === 1) ws.sendJSON(obj);
  }

  class TypingRoom {
    constructor() {
      this.id = `mecano_${nextRoomId++}`;
      this.state = 'waiting'; // waiting | countdown | racing | finished
      this.clients = new Map(); // cid -> { ws, id, name, progress, wpm, accuracy, finished, time, finishOrder }
      this.waitLeft = 10;
      this.countdownVal = 3;
      this.waitInterval = null;
      this.countdownInterval = null;
      this.finishTimeout = null;
      this.text = '';
      this.startedAt = 0;
      this.finishOrder = 0;
      this.recordedIds = new Set();
    }

    isOpen() {
      return this.state === 'waiting' && this.clients.size < MAX_PLAYERS;
    }

    broadcast(obj) {
      const raw = JSON.stringify(obj);
      for (const p of this.clients.values()) {
        if (p.ws.readyState === 1) p.ws.send(raw);
      }
    }

    cleanup() {
      if (this.waitInterval) clearInterval(this.waitInterval);
      if (this.countdownInterval) clearInterval(this.countdownInterval);
      if (this.finishTimeout) clearTimeout(this.finishTimeout);
      this.waitInterval = null;
      this.countdownInterval = null;
      this.finishTimeout = null;
    }

    getRoster() {
      return Array.from(this.clients.values())
        .map((p) => ({
          id: p.id,
          name: p.name,
          progress: p.progress,
          wpm: p.wpm,
          accuracy: p.accuracy,
          finished: p.finished,
          time: p.time,
          finishOrder: p.finishOrder,
        }))
        .sort((a, b) => {
          if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
          if (a.finished) return -1;
          if (b.finished) return 1;
          return b.progress - a.progress || b.wpm - a.wpm;
        });
    }

    addClient(ws, name) {
      if (!this.isOpen()) return false;
      const p = {
        ws,
        id: ws.cid,
        name: sanitizePlayerName(name, `Piloto${ws.cid}`),
        progress: 0,
        wpm: 0,
        accuracy: 100,
        finished: false,
        time: null,
        finishOrder: 999,
      };
      this.clients.set(ws.cid, p);

      const summary = recordsStore.getGameSummary('mecanorace');
      send(ws, {
        type: 'joined',
        roomId: this.id,
        playerId: p.id,
        maxPlayers: MAX_PLAYERS,
        waitLeft: this.waitLeft,
        bestGhost: summary.bestGhost,
        runs: summary.runs,
        record: summary.record,
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
      const texts = recordsStore.getMecanoTexts();
      this.text = texts[Math.floor(Math.random() * texts.length)];
      this.countdownVal = 3;

      const summary = recordsStore.getGameSummary('mecanorace');
      this.broadcast({
        type: 'race_countdown',
        value: this.countdownVal,
        text: this.text,
        bestGhost: summary.bestGhost,
        players: this.getRoster(),
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
      this.broadcast({
        type: 'race_start',
        text: this.text,
        startedAt: this.startedAt,
        players: this.getRoster(),
      });
      // Safety cap: 3 minutes max race
      this.finishTimeout = setTimeout(() => this.finishRace(), 180000);
      onStatsChange();
    }

    handleProgress(cid, data) {
      const p = this.clients.get(cid);
      if (!p || this.state !== 'racing' || p.finished) return;
      p.progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
      p.wpm = Math.max(0, Math.min(400, Math.round(Number(data.wpm) || 0)));
      p.accuracy = Math.max(0, Math.min(100, Math.round(Number(data.accuracy) || 0)));
      this.broadcast({ type: 'race_state', players: this.getRoster() });
    }

    handleFinish(cid, data) {
      const p = this.clients.get(cid);
      if (!p || this.state !== 'racing' || p.finished) return;
      p.finished = true;
      p.progress = 100;
      p.finishOrder = ++this.finishOrder;
      const elapsedSec = Math.max(0.5, Number(data.time) || (Date.now() - this.startedAt) / 1000);
      p.time = Number(elapsedSec.toFixed(2));
      p.wpm = Math.max(0, Math.min(400, Math.round(Number(data.wpm) || 0)));
      p.accuracy = Math.max(0, Math.min(100, Math.round(Number(data.accuracy) || 0)));

      if (!this.recordedIds.has(cid)) {
        this.recordedIds.add(cid);
        recordsStore.recordMecanoRun(
          {
            name: p.name,
            wpm: p.wpm,
            accuracy: p.accuracy,
            time: p.time,
            keystrokes: Array.isArray(data.keystrokes) ? data.keystrokes : [],
            text: this.text,
          },
          p.finishOrder,
          this.clients.size
        );
      }

      this.broadcast({
        type: 'player_finished',
        playerId: p.id,
        name: p.name,
        rank: p.finishOrder,
        wpm: p.wpm,
        accuracy: p.accuracy,
        time: p.time,
        players: this.getRoster(),
      });

      const allDone = Array.from(this.clients.values()).every((pl) => pl.finished);
      if (allDone) {
        this.finishRace();
      } else {
        // Give remaining racers 30s once first player finishes
        if (this.finishOrder === 1) {
          if (this.finishTimeout) clearTimeout(this.finishTimeout);
          this.finishTimeout = setTimeout(() => this.finishRace(), 30000);
          this.broadcast({ type: 'finish_countdown', seconds: 30 });
        }
      }
    }

    finishRace() {
      if (this.state === 'finished') return;
      this.state = 'finished';
      this.cleanup();
      const summary = recordsStore.getGameSummary('mecanorace');
      this.broadcast({
        type: 'race_results',
        standings: this.getRoster(),
        runs: summary.runs,
        record: summary.record,
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
          players: this.getRoster(),
          maxPlayers: MAX_PLAYERS,
          waitLeft: this.waitLeft,
        });
      } else if (this.state === 'racing') {
        this.broadcast({ type: 'race_state', players: this.getRoster() });
        const allDone = Array.from(this.clients.values()).every((pl) => pl.finished);
        if (allDone) this.finishRace();
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
      room = new TypingRoom();
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
    const summary = recordsStore.getGameSummary('mecanorace');
    send(ws, {
      type: 'init',
      runs: summary.runs,
      record: summary.record,
      bestGhost: summary.bestGhost,
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
      } else if (msg.type === 'progress') {
        const room = wsToRoom.get(ws.cid);
        if (room) room.handleProgress(ws.cid, msg);
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

  function handleHttp(req, res, pathname) {
    if (pathname === '/api/mecanorace/texts' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ texts: recordsStore.getMecanoTexts() }));
      return true;
    }
    if (pathname === '/api/mecanorace/texts' && req.method === 'POST') {
      readJsonBody(req)
        .then((body) => {
          if (body.reset) {
            recordsStore.resetMecanoTexts();
          } else if (Array.isArray(body.texts)) {
            recordsStore.setMecanoTexts(body.texts);
          } else if (typeof body.add === 'string' && body.add.trim()) {
            recordsStore.setMecanoTexts([...recordsStore.getMecanoTexts(), body.add.trim()]);
          } else if (typeof body.deleteIndex === 'number') {
            const list = [...recordsStore.getMecanoTexts()];
            if (list.length > 1 && body.deleteIndex >= 0 && body.deleteIndex < list.length) {
              list.splice(body.deleteIndex, 1);
              recordsStore.setMecanoTexts(list);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, texts: recordsStore.getMecanoTexts() }));
        })
        .catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
      return true;
    }
    if (pathname === '/api/mecanorace/runs/delete' && req.method === 'POST') {
      readJsonBody(req)
        .then((body) => {
          if (body.clearAll) recordsStore.clearMecanoRuns();
          else if (typeof body.index === 'number') recordsStore.deleteMecanoRun(body.index);
          const summary = recordsStore.getGameSummary('mecanorace');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, runs: summary.runs }));
        })
        .catch((err) => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        });
      return true;
    }
    return false;
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

  return { handleConnection, handleHttp, getLiveStats, close };
}
