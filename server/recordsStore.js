// Persistent server-side records & Hall of Fame store for all 6 games (24-player edition)
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export function sanitizePlayerName(raw, fallback = 'Jugador') {
  const cleaned = String(raw || '')
    .replace(/[^\p{L}\p{N}_\-\. ]/gu, '')
    .trim()
    .slice(0, 18);
  return cleaned || fallback;
}

const DEFAULT_MECANO_TEXTS = [
  'La tecnología no es nada. Lo importante es que tengas fe en la gente, que sean básicamente buenas e inteligentes, y si les das herramientas, harán cosas maravillosas con ellas.',
  'El diseño no es solo lo que se ve y lo que se siente. El diseño es cómo funciona. La innovación distingue a los líderes de los seguidores en el mundo moderno.',
  'Escribir rápido y sin errores es una habilidad esencial en la era digital. Cada pulsación en el teclado es un paso más hacia la eficiencia absoluta y el dominio de la máquina.',
  'En el vasto universo de la programación, la lógica y la creatividad convergen. Una mente aguda puede resolver problemas complejos escribiendo líneas de código que transforman ideas en realidad tangible.',
  'Las máquinas computacionales pueden procesar información a velocidades increíbles, pero todavía requieren de la intuición humana para guiar su inmenso poder hacia propósitos verdaderamente significativos y útiles.',
  'En una carrera de veinticuatro jugadores no gana quien empieza más rápido, sino quien mantiene la calma, la precisión y el ritmo constante hasta la última letra de la meta.'
];

function createEmptyStore() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    games: {
      campal: {
        // playerName -> { name, wins, matches, totalKills, bestKills, bestDamage, points, lastPlayed }
        players: {},
        bestKillsRecord: null, // { name, kills, damage, date }
      },
      cuberacer: {
        // playerName -> { name, wins, races, points, bestTime, bestLaps, lastPlayed }
        players: {},
        bestTimeRecord: null, // { name, time, laps, date }
      },
      cxvallas: {
        // playerName -> { name, wins, podiums, races, points, bestTime, lastPlayed }
        players: {},
        bestTimeRecord: null, // { name, time, date }
      },
      mecanorace: {
        // playerName -> { name, wins, races, points, bestWpm, bestAccuracy, bestTime, lastPlayed }
        players: {},
        // Top runs including keystrokes for ghost racing
        runs: [], // [{ name, wpm, accuracy, time, date, keystrokes, text }]
        texts: [...DEFAULT_MECANO_TEXTS],
      },
      racermaster: {
        // playerName -> { name, wins, races, points, bestTime, bestLap, lastPlayed }
        players: {},
        bestTimeRecord: null, // { name, time, laps, date }
      },
      trobix: {
        // playerName -> { name, wins, matches, points, bestScore, bestAccuracy, lastPlayed }
        players: {},
        mapRecords: {}, // mapId -> { name, score, hits, errors, mapTitle, date }
        bestScoreRecord: null, // { name, score, mapTitle, date }
      },
    },
  };
}

export class RecordsStore extends EventEmitter {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.data = createEmptyStore();
    this._load();
  }

  _load() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const base = createEmptyStore();
        this.data = {
          ...base,
          ...parsed,
          games: {
            campal: { ...base.games.campal, ...(parsed.games?.campal || {}) },
            cuberacer: { ...base.games.cuberacer, ...(parsed.games?.cuberacer || {}) },
            cxvallas: { ...base.games.cxvallas, ...(parsed.games?.cxvallas || {}) },
            mecanorace: { ...base.games.mecanorace, ...(parsed.games?.mecanorace || {}) },
            racermaster: { ...base.games.racermaster, ...(parsed.games?.racermaster || {}) },
            trobix: { ...base.games.trobix, ...(parsed.games?.trobix || {}) },
          },
        };
        if (!Array.isArray(this.data.games.mecanorace.texts) || this.data.games.mecanorace.texts.length === 0) {
          this.data.games.mecanorace.texts = [...DEFAULT_MECANO_TEXTS];
        }
      } else {
        this._save();
      }
    } catch (err) {
      console.error('[RecordsStore] Failed to load records, initializing fresh:', err.message);
      this.data = createEmptyStore();
      this._save();
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      this.data.updatedAt = new Date().toISOString();
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[RecordsStore] Failed to save records:', err.message);
    }
    this.emit('updated');
  }

  _key(name) {
    return sanitizePlayerName(name).toLowerCase();
  }

  // --- CAMPAL ---
  recordCampalMatch(ranking) {
    if (!Array.isArray(ranking) || ranking.length === 0) return;
    const game = this.data.games.campal;
    const now = new Date().toISOString();
    const total = ranking.length;
    let changed = false;

    for (const entry of ranking) {
      if (entry.isBot) continue;
      const name = sanitizePlayerName(entry.name);
      const k = this._key(name);
      const pts = Math.max(1, total - ((entry.placement || total) - 1));
      const cur = game.players[k] || {
        name,
        wins: 0,
        matches: 0,
        totalKills: 0,
        bestKills: 0,
        bestDamage: 0,
        points: 0,
        lastPlayed: now,
      };
      cur.name = name;
      cur.matches += 1;
      if (entry.placement === 1) cur.wins += 1;
      cur.totalKills += Number(entry.kills) || 0;
      if ((Number(entry.kills) || 0) > cur.bestKills) cur.bestKills = Number(entry.kills) || 0;
      if ((Number(entry.damage) || 0) > cur.bestDamage) cur.bestDamage = Number(entry.damage) || 0;
      cur.points += pts;
      cur.lastPlayed = now;
      game.players[k] = cur;
      changed = true;

      const kills = Number(entry.kills) || 0;
      const damage = Number(entry.damage) || 0;
      if (
        !game.bestKillsRecord ||
        kills > game.bestKillsRecord.kills ||
        (kills === game.bestKillsRecord.kills && damage > (game.bestKillsRecord.damage || 0))
      ) {
        game.bestKillsRecord = { name, kills, damage, date: now };
      }
    }

    if (changed) this._save();
  }

  // --- CUBERACER ---
  recordCubeRacerMatch(results, laps = 3) {
    if (!Array.isArray(results) || results.length === 0) return;
    const game = this.data.games.cuberacer;
    const now = new Date().toISOString();
    let changed = false;

    results.forEach((r, idx) => {
      if (r.isBot) return;
      const name = sanitizePlayerName(r.name);
      const k = this._key(name);
      const cur = game.players[k] || {
        name,
        wins: 0,
        races: 0,
        points: 0,
        bestTime: null,
        bestLaps: laps,
        lastPlayed: now,
      };
      cur.name = name;
      cur.races += 1;
      if (!r.dnf && idx === 0) cur.wins += 1;
      cur.points += Number(r.points) || 0;
      if (!r.dnf && typeof r.time === 'number' && r.time > 0) {
        if (cur.bestTime === null || r.time < cur.bestTime) {
          cur.bestTime = Number(r.time.toFixed(2));
          cur.bestLaps = laps;
        }
        if (!game.bestTimeRecord || r.time < game.bestTimeRecord.time) {
          game.bestTimeRecord = { name, time: Number(r.time.toFixed(2)), laps, date: now };
        }
      }
      cur.lastPlayed = now;
      game.players[k] = cur;
      changed = true;
    });

    if (changed) this._save();
  }

  // --- CXVALLAS ---
  recordCxvallasMatch(standings) {
    if (!Array.isArray(standings) || standings.length === 0) return;
    const game = this.data.games.cxvallas;
    const now = new Date().toISOString();
    const total = standings.length;
    let changed = false;

    standings.forEach((r, idx) => {
      if (r.isBot) return;
      const name = sanitizePlayerName(r.name);
      const k = this._key(name);
      const finished = Boolean(r.finished && typeof r.time === 'number' && r.time > 0);
      const pts = finished ? Math.max(1, total - idx) : 0;
      const cur = game.players[k] || {
        name,
        wins: 0,
        podiums: 0,
        races: 0,
        points: 0,
        bestTime: null,
        lastPlayed: now,
      };
      cur.name = name;
      cur.races += 1;
      if (finished) {
        if (idx === 0) cur.wins += 1;
        if (idx < 3) cur.podiums += 1;
        cur.points += pts;
        const t = Number(r.time.toFixed(2));
        if (cur.bestTime === null || t < cur.bestTime) cur.bestTime = t;
        if (!game.bestTimeRecord || t < game.bestTimeRecord.time) {
          game.bestTimeRecord = { name, time: t, date: now };
        }
      }
      cur.lastPlayed = now;
      game.players[k] = cur;
      changed = true;
    });

    if (changed) this._save();
  }

  // --- MECANORACE ---
  recordMecanoRun(run, placement = 1, totalRacers = 1) {
    const game = this.data.games.mecanorace;
    const now = new Date().toISOString();
    const name = sanitizePlayerName(run.name);
    const k = this._key(name);
    const wpm = Math.max(0, Math.round(Number(run.wpm) || 0));
    const accuracy = Math.max(0, Math.min(100, Math.round(Number(run.accuracy) || 0)));
    const time = Number((Number(run.time) || 0).toFixed(2));
    const pts = Math.max(1, totalRacers - (placement - 1));

    const cur = game.players[k] || {
      name,
      wins: 0,
      races: 0,
      points: 0,
      bestWpm: 0,
      bestAccuracy: 0,
      bestTime: null,
      lastPlayed: now,
    };
    cur.name = name;
    cur.races += 1;
    if (placement === 1) cur.wins += 1;
    cur.points += pts;
    if (wpm > cur.bestWpm || (wpm === cur.bestWpm && accuracy > cur.bestAccuracy)) {
      cur.bestWpm = wpm;
      cur.bestAccuracy = accuracy;
      cur.bestTime = time;
    }
    cur.lastPlayed = now;
    game.players[k] = cur;

    game.runs.push({
      name,
      wpm,
      accuracy,
      time,
      date: now,
      keystrokes: Array.isArray(run.keystrokes) ? run.keystrokes.slice(0, 2000) : [],
      text: typeof run.text === 'string' ? run.text.slice(0, 1000) : '',
    });
    game.runs.sort((a, b) => (b.wpm !== a.wpm ? b.wpm - a.wpm : b.accuracy - a.accuracy));
    game.runs = game.runs.slice(0, 100);

    this._save();
  }

  getMecanoTexts() {
    return this.data.games.mecanorace.texts;
  }

  setMecanoTexts(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return;
    this.data.games.mecanorace.texts = texts.map((t) => String(t).trim()).filter(Boolean).slice(0, 50);
    if (this.data.games.mecanorace.texts.length === 0) {
      this.data.games.mecanorace.texts = [...DEFAULT_MECANO_TEXTS];
    }
    this._save();
  }

  resetMecanoTexts() {
    this.data.games.mecanorace.texts = [...DEFAULT_MECANO_TEXTS];
    this._save();
  }

  deleteMecanoRun(index) {
    const runs = this.data.games.mecanorace.runs;
    if (index >= 0 && index < runs.length) {
      runs.splice(index, 1);
      this._save();
    }
  }

  clearMecanoRuns() {
    this.data.games.mecanorace.runs = [];
    this._save();
  }

  // --- RACERMASTER ---
  recordRacerMasterMatch(standings, laps = 2) {
    if (!Array.isArray(standings) || standings.length === 0) return;
    const game = this.data.games.racermaster;
    const now = new Date().toISOString();
    const total = standings.length;
    let changed = false;

    standings.forEach((r, idx) => {
      if (r.isBot) return;
      const name = sanitizePlayerName(r.name);
      const k = this._key(name);
      const finished = Boolean(r.finished && typeof r.time === 'number' && r.time > 0);
      const pts = finished ? Math.max(1, total - idx) : 0;
      const cur = game.players[k] || {
        name,
        wins: 0,
        races: 0,
        points: 0,
        bestTime: null,
        bestLap: null,
        lastPlayed: now,
      };
      cur.name = name;
      cur.races += 1;
      if (finished) {
        if (idx === 0) cur.wins += 1;
        cur.points += pts;
        const t = Number(r.time.toFixed(2));
        if (cur.bestTime === null || t < cur.bestTime) cur.bestTime = t;
        if (typeof r.bestLap === 'number' && r.bestLap > 0) {
          const lapT = Number(r.bestLap.toFixed(2));
          if (cur.bestLap === null || lapT < cur.bestLap) cur.bestLap = lapT;
        }
        if (!game.bestTimeRecord || t < game.bestTimeRecord.time) {
          game.bestTimeRecord = { name, time: t, laps, date: now };
        }
      }
      cur.lastPlayed = now;
      game.players[k] = cur;
      changed = true;
    });

    if (changed) this._save();
  }

  // --- TROBIX ---
  recordTrobixMatch(standings, mapId, mapTitle) {
    if (!Array.isArray(standings) || standings.length === 0) return;
    const game = this.data.games.trobix;
    const now = new Date().toISOString();
    const total = standings.length;
    let changed = false;

    standings.forEach((r, idx) => {
      if (r.isBot) return;
      const name = sanitizePlayerName(r.name);
      const k = this._key(name);
      const score = Math.max(0, Math.round(Number(r.score) || 0));
      const hits = Number(r.hits) || 0;
      const errors = Number(r.errors) || 0;
      const acc = hits + errors > 0 ? Math.round((hits / (hits + errors)) * 100) : 0;
      const pts = Math.max(1, total - idx);

      const cur = game.players[k] || {
        name,
        wins: 0,
        matches: 0,
        points: 0,
        bestScore: 0,
        bestAccuracy: 0,
        lastPlayed: now,
      };
      cur.name = name;
      cur.matches += 1;
      if (idx === 0 && score > 0) cur.wins += 1;
      cur.points += pts;
      if (score > cur.bestScore) cur.bestScore = score;
      if (acc > cur.bestAccuracy) cur.bestAccuracy = acc;
      cur.lastPlayed = now;
      game.players[k] = cur;
      changed = true;

      if (!game.bestScoreRecord || score > game.bestScoreRecord.score) {
        game.bestScoreRecord = { name, score, hits, errors, mapId, mapTitle, date: now };
      }
      if (mapId) {
        const prev = game.mapRecords[String(mapId)];
        if (!prev || score > prev.score) {
          game.mapRecords[String(mapId)] = { name, score, hits, errors, mapTitle, date: now };
        }
      }
    });

    if (changed) this._save();
  }

  // --- QUERIES ---
  getGameSummary(gameId) {
    const g = this.data.games[gameId];
    if (!g) return null;

    if (gameId === 'campal') {
      const ranking = Object.values(g.players).sort((a, b) => b.wins - a.wins || b.points - a.points || b.totalKills - a.totalKills);
      const top = ranking[0];
      return {
        gameId,
        headline: top ? `${top.name} · ${top.wins} victorias (${top.bestKills} bajas máx.)` : 'Sin récords aún',
        record: g.bestKillsRecord,
        ranking: ranking.slice(0, 50),
      };
    }

    if (gameId === 'cuberacer') {
      const ranking = Object.values(g.players).sort((a, b) => b.points - a.points || (a.bestTime ?? 99999) - (b.bestTime ?? 99999));
      const rec = g.bestTimeRecord;
      return {
        gameId,
        headline: rec ? `${rec.name} · ${rec.time.toFixed(2)}s (${rec.laps}v)` : ranking[0] ? `${ranking[0].name} · ${ranking[0].points} pts` : 'Sin récords aún',
        record: rec,
        ranking: ranking.slice(0, 50),
        pointsMap: Object.fromEntries(ranking.map((p) => [p.name, p.points])),
      };
    }

    if (gameId === 'cxvallas') {
      const ranking = Object.values(g.players).sort((a, b) => (a.bestTime ?? 99999) - (b.bestTime ?? 99999) || b.points - a.points);
      const rec = g.bestTimeRecord;
      return {
        gameId,
        headline: rec ? `${rec.name} · ${rec.time.toFixed(2)}s` : 'Sin récords aún',
        record: rec,
        ranking: ranking.slice(0, 50),
      };
    }

    if (gameId === 'mecanorace') {
      const ranking = Object.values(g.players).sort((a, b) => b.bestWpm - a.bestWpm || b.bestAccuracy - a.bestAccuracy || b.points - a.points);
      const topRun = g.runs[0] || null;
      return {
        gameId,
        headline: topRun ? `${topRun.name} · ${topRun.wpm} PPM (${topRun.accuracy}%)` : 'Sin récords aún',
        record: topRun ? { name: topRun.name, wpm: topRun.wpm, accuracy: topRun.accuracy, time: topRun.time, date: topRun.date } : null,
        bestGhost: topRun && topRun.keystrokes?.length ? topRun : null,
        runs: g.runs.slice(0, 30).map(({ name, wpm, accuracy, time, date }) => ({ name, wpm, accuracy, time, date })),
        ranking: ranking.slice(0, 50),
      };
    }

    if (gameId === 'racermaster') {
      const ranking = Object.values(g.players).sort((a, b) => (a.bestTime ?? 99999) - (b.bestTime ?? 99999) || b.points - a.points);
      const rec = g.bestTimeRecord;
      return {
        gameId,
        headline: rec ? `${rec.name} · ${rec.time.toFixed(2)}s` : 'Sin récords aún',
        record: rec,
        ranking: ranking.slice(0, 50),
      };
    }

    if (gameId === 'trobix') {
      const ranking = Object.values(g.players).sort((a, b) => b.bestScore - a.bestScore || b.points - a.points);
      const rec = g.bestScoreRecord;
      return {
        gameId,
        headline: rec ? `${rec.name} · ${rec.score} pts (${rec.mapTitle || 'Mapa'})` : 'Sin récords aún',
        record: rec,
        mapRecords: g.mapRecords,
        ranking: ranking.slice(0, 50),
      };
    }

    return null;
  }

  getGlobalHallOfFame() {
    const totals = new Map();
    for (const [gameId, g] of Object.entries(this.data.games)) {
      for (const [k, p] of Object.entries(g.players || {})) {
        const cur = totals.get(k) || {
          name: p.name,
          points: 0,
          wins: 0,
          gamesPlayed: 0,
          byGame: {},
        };
        cur.name = p.name;
        cur.points += Number(p.points) || 0;
        cur.wins += Number(p.wins) || 0;
        cur.gamesPlayed += Number(p.matches || p.races || 0);
        cur.byGame[gameId] = Number(p.points) || 0;
        totals.set(k, cur);
      }
    }
    return Array.from(totals.values())
      .sort((a, b) => b.points - a.points || b.wins - a.wins)
      .slice(0, 50);
  }

  getAllSummary() {
    return {
      updatedAt: this.data.updatedAt,
      hallOfFame: this.getGlobalHallOfFame(),
      games: {
        campal: this.getGameSummary('campal'),
        cuberacer: this.getGameSummary('cuberacer'),
        cxvallas: this.getGameSummary('cxvallas'),
        mecanorace: this.getGameSummary('mecanorace'),
        racermaster: this.getGameSummary('racermaster'),
        trobix: this.getGameSummary('trobix'),
      },
    };
  }
}
