// CXVallas 24 — 24-lane Olympic Hurdles multiplayer engine with persistent server records
import { sanitizePlayerName } from '../recordsStore.js';

const MAX_LANES = 24;
const TRACK_FINISH_X = 1000;
const HURDLE_POSITIONS = Array.from({ length: 10 }, (_, i) => i * 100 + 50);
const BOT_NAMES = [
  'Bolt24', 'VallaPro', 'Rayo', 'Gacela', 'SprintX', 'Olimpo', 'Turbo', 'Flecha',
  'Cometa', 'Relampago', 'Atleta9', 'Estrella', 'Ciclón', 'Halcón', 'Puma', 'Lince',
];

export function createCxvallasEngine(recordsStore, onStatsChange = () => {}) {
  const races = new Map();
  const wsToRace = new Map();
  let nextRaceId = 1;
  let nextClientId = 1;

  function send(ws, obj) {
    if (ws && ws.readyState === 1) ws.sendJSON(obj);
  }

  class HurdlesRace {
    constructor() {
      this.id = `vallas_${nextRaceId++}`;
      this.ncarriles = MAX_LANES;
      this.clients = new Map(); // wsId -> { ws, player }
      this.players = []; // human + bot athletes
      this.starting = false;
      this.started = false;
      this.finished = false;
      this.startedAt = 0;
      this.podium = [];
      this.disqualifieds = 0;
      this.waitInterval = null;
      this.waitLeft = 8;
      this.finishTimeout = null;
      this.countdownTimeouts = [];
      this.botInterval = null;
      this.bots = [];
    }

    hasFreeSlot() {
      return !this.starting && !this.started && !this.finished && this.players.length < this.ncarriles;
    }

    getNextFreeCarril() {
      const used = new Set(this.players.map((p) => p.carril));
      for (let i = 0; i < this.ncarriles; i++) {
        if (!used.has(i)) return i;
      }
      return -1;
    }

    broadcast(obj) {
      const raw = JSON.stringify(obj);
      for (const { ws } of this.clients.values()) {
        if (ws.readyState === 1) ws.send(raw);
      }
    }

    cleanupTimers() {
      if (this.waitInterval) {
        clearInterval(this.waitInterval);
        this.waitInterval = null;
      }
      if (this.finishTimeout) {
        clearTimeout(this.finishTimeout);
        this.finishTimeout = null;
      }
      if (this.botInterval) {
        clearInterval(this.botInterval);
        this.botInterval = null;
      }
      for (const t of this.countdownTimeouts) clearTimeout(t);
      this.countdownTimeouts = [];
    }

    addPlayer(ws, data) {
      const carril = this.getNextFreeCarril();
      if (carril === -1) return false;

      const player = {
        name: sanitizePlayerName(data?.name, `Atleta${carril + 1}`),
        carril,
        isBot: false,
        x: 0,
        y: 0,
        disqualified: false,
        finished: false,
        time: null,
      };
      this.players.push(player);
      this.clients.set(ws.cid, { ws, player });

      const rec = recordsStore.getGameSummary('cxvallas');
      send(ws, {
        action: 'join_ok',
        player,
        players: this.players,
        maxLanes: this.ncarriles,
        waitLeft: this.waitLeft,
        records: { record: rec.record, ranking: rec.ranking.slice(0, 10) },
      });
      this.broadcast({ action: 'new_player', player });

      if (this.clients.size === 1 && !this.waitInterval) {
        this.waitLeft = 8;
        this.broadcast({ action: 'wait', value: this.waitLeft });
        this.waitInterval = setInterval(() => {
          this.waitLeft--;
          if (this.waitLeft <= 0) {
            clearInterval(this.waitInterval);
            this.waitInterval = null;
            this.broadcast({ action: 'wait', value: 0 });
            this.start();
          } else {
            this.broadcast({ action: 'wait', value: this.waitLeft });
          }
        }, 1000);
      }

      if (this.players.length >= this.ncarriles) {
        if (this.waitInterval) {
          clearInterval(this.waitInterval);
          this.waitInterval = null;
        }
        this.broadcast({ action: 'wait', value: 0 });
        this.start();
      }
      return true;
    }

    spawnPacersIfNeeded() {
      // Ensure at least 4 runners on the 24-lane track so solo/small groups still have an exciting race!
      const minRunners = Math.min(6, this.ncarriles);
      let botIdx = 0;
      while (this.players.length < minRunners) {
        const carril = this.getNextFreeCarril();
        if (carril === -1) break;
        const bot = {
          name: `${BOT_NAMES[botIdx % BOT_NAMES.length]} [BOT]`,
          carril,
          isBot: true,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          state: 2,
          stateTime: 0,
          disqualified: false,
          finished: false,
          time: null,
          baseSpeed: 1.35 + Math.random() * 0.55,
          jumpSkill: 0.72 + Math.random() * 0.25,
          clearedHurdles: new Set(),
        };
        botIdx++;
        this.players.push(bot);
        this.bots.push(bot);
        this.broadcast({ action: 'new_player', player: { name: bot.name, carril: bot.carril, isBot: true } });
      }
    }

    startNow() {
      if (this.starting || this.started || this.finished) return;
      if (this.waitInterval) {
        clearInterval(this.waitInterval);
        this.waitInterval = null;
      }
      this.broadcast({ action: 'wait', value: 0 });
      this.start();
    }

    start() {
      if (this.starting || this.finished) return;
      this.starting = true;
      this.spawnPacersIfNeeded();
      onStatsChange();

      for (let i = 0; i < 3; i++) {
        this.countdownTimeouts.push(
          setTimeout(() => {
            if (this.finished) return;
            this.broadcast({ action: 'countdown', value: 3 - i });
          }, 800 + 1000 * i)
        );
      }

      this.countdownTimeouts.push(
        setTimeout(() => {
          if (this.finished || this.clients.size === 0) return;
          this.started = true;
          this.startedAt = Date.now();
          this.broadcast({ action: 'countdown', value: 0 });
          if (this.bots.length > 0) this.startBotLoop();

          // Hard max race duration 45s so a race never hangs forever
          this.countdownTimeouts.push(
            setTimeout(() => {
              if (!this.finished) this.finish();
            }, 45000)
          );
        }, 3800 + Math.random() * 900)
      );
    }

    startBotLoop() {
      this.botInterval = setInterval(() => {
        if (this.finished || !this.started) {
          clearInterval(this.botInterval);
          this.botInterval = null;
          return;
        }
        for (const bot of this.bots) {
          if (bot.finished || bot.disqualified) continue;
          bot.stateTime += 33;
          // Jump before hurdle
          const upcoming = HURDLE_POSITIONS.find((hx) => hx - bot.x > 0 && hx - bot.x < 14 && !bot.clearedHurdles.has(hx));
          if (upcoming && bot.y === 0 && Math.random() < bot.jumpSkill) {
            bot.vy = 2.61;
          }
          bot.vx = Math.max(0.4, bot.baseSpeed + (Math.random() - 0.5) * 0.35);
          bot.x += bot.vx * 1.45;
          if (bot.y > 0 || bot.vy > 0) {
            bot.y += bot.vy;
            bot.vy -= 0.32;
            if (bot.y <= 0) {
              bot.y = 0;
              bot.vy = 0;
            }
          }
          for (let i = 0; i < HURDLE_POSITIONS.length; i++) {
            const hx = HURDLE_POSITIONS[i];
            if (!bot.clearedHurdles.has(hx) && Math.abs(bot.x - hx) < 3) {
              bot.clearedHurdles.add(hx);
              if (bot.y < 10) {
                bot.x -= 4;
                this.broadcast({ action: 'fall', i, carril: bot.carril });
              }
            }
          }
          bot.state = bot.y > 0 ? 1 : 0;
          this.broadcast({
            action: 'update',
            carril: bot.carril,
            data: { x: bot.x, y: bot.y, state: bot.state, stateTime: bot.stateTime },
          });

          if (bot.x >= TRACK_FINISH_X) {
            bot.finished = true;
            bot.time = (Date.now() - this.startedAt) / 1000;
            this.podium.push(bot);
            this._checkRaceFinish();
          }
        }
      }, 45);
    }

    _checkRaceFinish() {
      const humanCount = this.players.filter((p) => !p.isBot && !p.disqualified).length;
      const humanFinished = this.players.filter((p) => !p.isBot && p.finished).length;
      if (humanCount === 0 || humanFinished >= humanCount) {
        this.finish();
      } else if (!this.finishTimeout && this.podium.length >= 1) {
        this.finishTimeout = setTimeout(() => this.finish(), 10000);
      }
    }

    finish() {
      if (this.finished) return;
      this.finished = true;
      this.cleanupTimers();

      const standings = [...this.podium];
      // Append unfinished/disqualified at the end ordered by distance
      const inPodium = new Set(standings.map((p) => p.carril));
      const rest = this.players
        .filter((p) => !inPodium.has(p.carril))
        .sort((a, b) => (b.x || 0) - (a.x || 0));
      standings.push(...rest);

      recordsStore.recordCxvallasMatch(standings);
      const rec = recordsStore.getGameSummary('cxvallas');

      this.broadcast({
        action: 'finish',
        podium: standings.map((p, idx) => ({
          rank: idx + 1,
          name: p.name,
          carril: p.carril,
          isBot: p.isBot,
          finished: p.finished,
          disqualified: p.disqualified,
          time: p.time ? Number(p.time.toFixed(2)) : null,
        })),
        records: { record: rec.record, ranking: rec.ranking.slice(0, 10) },
      });
      onStatsChange();
    }

    update(ws, data) {
      const entry = this.clients.get(ws.cid);
      if (!entry || this.finished) return;
      const player = entry.player;

      if (!this.started && data.x > 0 && !player.disqualified) {
        player.disqualified = true;
        this.disqualifieds++;
        this.broadcast({ action: 'disqualify', carril: player.carril });
        const aliveHumans = this.players.filter((p) => !p.isBot && !p.disqualified).length;
        if (this.starting && aliveHumans <= 0) {
          this.finish();
        }
        return;
      }

      player.x = Number(data.x) || 0;
      player.y = Number(data.y) || 0;

      if (this.started && player.x >= TRACK_FINISH_X && !player.finished && !player.disqualified) {
        player.finished = true;
        player.time = Math.max(1.0, (Date.now() - this.startedAt) / 1000);
        this.podium.push(player);
        this.broadcast({
          action: 'player_finished',
          carril: player.carril,
          name: player.name,
          time: Number(player.time.toFixed(2)),
          rank: this.podium.length,
        });
        this._checkRaceFinish();
      }

      this.broadcast({ action: 'update', carril: player.carril, data });
    }

    fall(ws, data) {
      const entry = this.clients.get(ws.cid);
      if (!entry || this.finished) return;
      this.broadcast({ action: 'fall', i: data.i, carril: entry.player.carril });
    }

    removePlayer(ws) {
      const entry = this.clients.get(ws.cid);
      this.clients.delete(ws.cid);
      if (!entry) return;
      const player = entry.player;

      if (!this.starting && !this.started && !this.finished) {
        this.players = this.players.filter((p) => p.carril !== player.carril);
        this.broadcast({ action: 'remove_player', carril: player.carril });
        if (this.clients.size === 0) {
          this.cleanupTimers();
        }
      } else if (!this.finished && !player.disqualified && !player.finished) {
        player.disqualified = true;
        this.disqualifieds++;
        this.broadcast({ action: 'disqualify', carril: player.carril });
        if (this.started) this._checkRaceFinish();
      }

      if (this.clients.size === 0) {
        this.cleanupTimers();
      }
    }
  }

  function joinPlayer(ws, data) {
    if (wsToRace.has(ws.cid)) {
      leavePlayer(ws);
    }
    let race = null;
    for (const r of races.values()) {
      if (r.hasFreeSlot()) {
        race = r;
        break;
      }
    }
    if (!race) {
      race = new HurdlesRace();
      races.set(race.id, race);
    }
    race.addPlayer(ws, data);
    wsToRace.set(ws.cid, race);
    onStatsChange();
  }

  function leavePlayer(ws) {
    const race = wsToRace.get(ws.cid);
    wsToRace.delete(ws.cid);
    if (!race) return;
    race.removePlayer(ws);
    if (race.clients.size === 0) {
      race.cleanupTimers();
      races.delete(race.id);
    }
    onStatsChange();
  }

  function handleConnection(ws) {
    ws.cid = nextClientId++;
    const rec = recordsStore.getGameSummary('cxvallas');
    send(ws, { action: 'records', records: { record: rec.record, ranking: rec.ranking.slice(0, 10) } });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.action === 'join') {
        joinPlayer(ws, msg.data || {});
      } else if (msg.action === 'start_now') {
        const race = wsToRace.get(ws.cid);
        if (race) race.startNow();
      } else if (msg.action === 'update') {
        const race = wsToRace.get(ws.cid);
        if (race && msg.data) race.update(ws, msg.data);
      } else if (msg.action === 'fall') {
        const race = wsToRace.get(ws.cid);
        if (race && msg.data) race.fall(ws, msg.data);
      } else if (msg.action === 'leave') {
        leavePlayer(ws);
      }
    });

    ws.on('close', () => {
      leavePlayer(ws);
    });
  }

  function getLiveStats() {
    let activePlayers = 0;
    let openRooms = 0;
    let playingRooms = 0;
    for (const r of races.values()) {
      activePlayers += r.clients.size;
      if (r.hasFreeSlot()) openRooms++;
      else if (!r.finished) playingRooms++;
    }
    return { activePlayers, openRooms, playingRooms, maxPlayers: MAX_LANES };
  }

  function close() {
    for (const r of races.values()) r.cleanupTimers();
    races.clear();
  }

  return { handleConnection, getLiveStats, close };
}
