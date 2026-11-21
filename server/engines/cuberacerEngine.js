// CubeRacer 3D — 24-player server engine with persistent server records
import { sanitizePlayerName } from '../recordsStore.js';

const MAX_PLAYERS = 24;

export function createCubeRacerEngine(recordsStore, onStatsChange = () => {}) {
  const clients = new Map(); // playerId -> ws
  const players = new Map(); // playerId -> state
  const races = new Map(); // raceId -> race room
  let nextPlayerId = 1;

  function send(ws, obj) {
    if (ws && ws.readyState === 1) {
      ws.sendJSON(obj);
    }
  }

  function getLeaderboardPayload() {
    const summary = recordsStore.getGameSummary('cuberacer');
    return {
      pointsMap: summary.pointsMap || {},
      ranking: summary.ranking || [],
      record: summary.record || null,
    };
  }

  function broadcastToAll(obj) {
    const raw = JSON.stringify(obj);
    for (const ws of clients.values()) {
      if (ws.readyState === 1) ws.send(raw);
    }
  }

  function broadcastToRace(raceId, obj, excludeId = null) {
    const race = races.get(raceId);
    if (!race) return;
    const raw = JSON.stringify(obj);
    for (const pId of race.players) {
      if (excludeId !== null && pId === excludeId) continue;
      const ws = clients.get(pId);
      if (ws && ws.readyState === 1) ws.send(raw);
    }
  }

  function getRacePlayers(raceId) {
    const race = races.get(raceId);
    if (!race) return [];
    return race.players
      .map((pId) => {
        const p = players.get(pId);
        return p ? { id: p.id, name: p.name, color: p.color, state: p.state } : null;
      })
      .filter(Boolean);
  }

  function getOpenRacesSummary() {
    const list = [];
    for (const r of races.values()) {
      if ((r.status === 'waiting' || r.status === 'countdown') && r.players.length < r.settings.maxPlayers) {
        list.push({
          id: r.id,
          players: r.players.length,
          maxPlayers: r.settings.maxPlayers,
          minPlayers: r.settings.minPlayers,
          laps: r.settings.laps,
          status: r.status,
        });
      }
    }
    return list;
  }

  function clearRaceTimers(race) {
    if (race.lobbyTimer) {
      clearInterval(race.lobbyTimer);
      race.lobbyTimer = null;
    }
    if (race.countdownTimer) {
      clearInterval(race.countdownTimer);
      race.countdownTimer = null;
    }
    if (race.finishTimeout) {
      clearTimeout(race.finishTimeout);
      race.finishTimeout = null;
    }
  }

  function startLobbyTimer(raceId) {
    const race = races.get(raceId);
    if (!race) return;
    if (race.lobbyTimer) clearInterval(race.lobbyTimer);

    race.lobbyTimerValue = 60;
    broadcastToRace(raceId, { type: 'lobby_timer', value: race.lobbyTimerValue });

    race.lobbyTimer = setInterval(() => {
      if (!races.has(raceId)) {
        clearInterval(race.lobbyTimer);
        return;
      }
      race.lobbyTimerValue--;
      broadcastToRace(raceId, { type: 'lobby_timer', value: race.lobbyTimerValue });

      if (race.lobbyTimerValue <= 0) {
        clearInterval(race.lobbyTimer);
        race.lobbyTimer = null;
        if (race.players.length >= 1) {
          startRace(raceId);
        } else {
          deleteRace(raceId);
        }
      }
    }, 1000);
  }

  function startRaceCountdown(raceId, seconds = 10) {
    const race = races.get(raceId);
    if (!race || race.status === 'racing' || race.status === 'finished') return;

    if (race.lobbyTimer) {
      clearInterval(race.lobbyTimer);
      race.lobbyTimer = null;
    }
    if (race.countdownTimer) {
      clearInterval(race.countdownTimer);
      race.countdownTimer = null;
    }

    race.status = 'countdown';
    race.countdownValue = seconds;
    broadcastToRace(raceId, { type: 'lobby_countdown', value: race.countdownValue });

    race.countdownTimer = setInterval(() => {
      if (!races.has(raceId)) {
        clearInterval(race.countdownTimer);
        return;
      }
      race.countdownValue--;
      broadcastToRace(raceId, { type: 'lobby_countdown', value: race.countdownValue });
      if (race.countdownValue <= 0) {
        clearInterval(race.countdownTimer);
        race.countdownTimer = null;
        startRace(raceId);
      }
    }, 1000);
  }

  function cancelRaceCountdown(raceId) {
    const race = races.get(raceId);
    if (!race) return;
    if (race.countdownTimer) {
      clearInterval(race.countdownTimer);
      race.countdownTimer = null;
    }
    race.status = 'waiting';
    broadcastToRace(raceId, { type: 'lobby_countdown_cancelled' });
    startLobbyTimer(raceId);
  }

  function startRace(raceId) {
    const race = races.get(raceId);
    if (!race || race.status === 'racing') return;
    clearRaceTimers(race);

    race.status = 'racing';
    race.startedPlayersCount = race.players.length;
    race.finishers = [];
    race.startedAt = Date.now();

    const startingGrid = race.players.map((pId) => {
      const p = players.get(pId);
      if (p) {
        p.state = 'racing';
        p.lap = 1;
        p.finished = false;
      }
      return {
        id: pId,
        name: p ? p.name : `Piloto_${pId}`,
        color: p ? p.color : '#1e90ff',
      };
    });

    broadcastToRace(raceId, {
      type: 'race_start',
      startingGrid,
      settings: race.settings,
      track: race.track,
    });
    onStatsChange();
  }

  function endRace(raceId) {
    const race = races.get(raceId);
    if (!race || race.status === 'finished') return;
    clearRaceTimers(race);

    race.status = 'finished';
    const totalRacers = Math.max(race.startedPlayersCount || race.players.length, race.finishers.length);
    const raceResults = [];

    race.finishers.forEach((f, idx) => {
      const points = Math.max(1, totalRacers - idx);
      raceResults.push({
        name: f.name,
        time: f.time,
        points,
        dnf: false,
      });
    });

    for (const pId of race.players) {
      const p = players.get(pId);
      if (p && p.state !== 'menu' && !race.finishers.some((f) => f.playerId === pId)) {
        raceResults.push({
          name: p.name,
          time: null,
          points: 0,
          dnf: true,
        });
      }
    }

    recordsStore.recordCubeRacerMatch(raceResults, race.settings.laps);

    const lb = getLeaderboardPayload();
    broadcastToAll({
      type: 'leaderboard',
      leaderboard: lb.pointsMap,
      ranking: lb.ranking,
      record: lb.record,
    });

    broadcastToRace(raceId, {
      type: 'race_results',
      results: raceResults,
    });

    onStatsChange();

    setTimeout(() => {
      deleteRace(raceId);
    }, 20000).unref?.();
  }

  function deleteRace(raceId) {
    const race = races.get(raceId);
    if (!race) return;
    clearRaceTimers(race);
    for (const pId of race.players) {
      const p = players.get(pId);
      if (p && p.raceId === raceId) {
        p.raceId = null;
        p.state = 'menu';
      }
    }
    races.delete(raceId);
    onStatsChange();
  }

  function handlePlayerLeaving(playerId) {
    const p = players.get(playerId);
    if (!p || !p.raceId) return;

    const raceId = p.raceId;
    const race = races.get(raceId);
    p.raceId = null;
    p.state = 'menu';

    if (!race) return;

    race.players = race.players.filter((id) => id !== playerId);

    broadcastToRace(raceId, {
      type: 'player_left',
      id: playerId,
      name: p.name,
    });

    if (race.players.length === 0) {
      deleteRace(raceId);
      return;
    }

    if (race.creatorId === playerId) {
      race.creatorId = race.players[0];
    }

    if (race.status === 'waiting' || race.status === 'countdown') {
      broadcastToRace(raceId, {
        type: 'lobby_update',
        players: getRacePlayers(raceId),
        settings: race.settings,
        creatorId: race.creatorId,
      });

      if (race.status === 'countdown' && race.players.length < race.settings.minPlayers) {
        cancelRaceCountdown(raceId);
      }
    } else if (race.status === 'racing') {
      const activePlayers = race.players.filter((id) => {
        const pl = players.get(id);
        return pl && pl.state !== 'menu';
      });
      const finishedCount = activePlayers.filter((id) => players.get(id).state === 'finished').length;
      if (activePlayers.length === 0 || finishedCount >= activePlayers.length) {
        endRace(raceId);
      }
    }
    onStatsChange();
  }

  function handleConnection(ws) {
    const playerId = nextPlayerId++;
    ws.playerId = playerId;
    clients.set(playerId, ws);

    players.set(playerId, {
      id: playerId,
      name: `Piloto_${playerId}`,
      color: '#1e90ff',
      raceId: null,
      state: 'menu',
    });

    const lb = getLeaderboardPayload();
    send(ws, {
      type: 'connection_established',
      playerId,
      leaderboard: lb.pointsMap,
      ranking: lb.ranking,
      record: lb.record,
      openRaces: getOpenRacesSummary(),
      maxPlayers: MAX_PLAYERS,
    });

    onStatsChange();

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.type === 'find_race') {
        let foundRace = null;
        for (const r of races.values()) {
          if ((r.status === 'waiting' || r.status === 'countdown') && r.players.length < r.settings.maxPlayers) {
            foundRace = r;
            break;
          }
        }
        if (foundRace) {
          send(ws, {
            type: 'race_found',
            raceId: foundRace.id,
            track: foundRace.track,
            settings: foundRace.settings,
          });
        } else {
          send(ws, { type: 'no_race_found' });
        }
      } else if (data.type === 'create_race') {
        handlePlayerLeaving(playerId);
        const raceId = `race_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const maxP = Math.max(1, Math.min(MAX_PLAYERS, Number.parseInt(data.settings?.maxPlayers, 10) || MAX_PLAYERS));
        const minP = Math.max(1, Math.min(maxP, Number.parseInt(data.settings?.minPlayers, 10) || 2));
        const laps = Math.max(1, Math.min(10, Number.parseInt(data.settings?.laps, 10) || 3));

        const race = {
          id: raceId,
          creatorId: playerId,
          track: data.track,
          settings: { minPlayers: minP, maxPlayers: maxP, laps },
          players: [],
          status: 'waiting',
          countdownTimer: null,
          countdownValue: 10,
          lobbyTimer: null,
          lobbyTimerValue: 60,
          finishTimeout: null,
          finishers: [],
          startedPlayersCount: 0,
        };
        races.set(raceId, race);
        onStatsChange();

        send(ws, {
          type: 'race_created',
          raceId,
          track: race.track,
          settings: race.settings,
        });
      } else if (data.type === 'join_lobby') {
        const race = races.get(data.raceId);
        if (!race) {
          send(ws, { type: 'error', message: 'La carrera especificada ya no existe.' });
          return;
        }
        if (race.status !== 'waiting' && race.status !== 'countdown') {
          send(ws, { type: 'error', message: 'La carrera ya ha comenzado.' });
          return;
        }
        if (race.players.length >= race.settings.maxPlayers && !race.players.includes(playerId)) {
          send(ws, { type: 'error', message: `La sala está llena (${race.settings.maxPlayers}/${race.settings.maxPlayers}).` });
          return;
        }

        const safeName = sanitizePlayerName(data.name, `Piloto_${playerId}`);
        players.set(playerId, {
          id: playerId,
          name: safeName,
          color: typeof data.color === 'string' ? data.color.slice(0, 20) : '#1e90ff',
          carConfig: data.carConfig || {},
          raceId: race.id,
          state: 'waiting',
          x: 0,
          y: 0,
          z: 0,
          rx: 0,
          ry: 0,
          rz: 0,
          speed: 0,
          lap: 1,
          finished: false,
          finishTime: 0,
        });

        if (!race.players.includes(playerId)) {
          race.players.push(playerId);
        }

        broadcastToRace(race.id, {
          type: 'lobby_update',
          players: getRacePlayers(race.id),
          settings: race.settings,
          creatorId: race.creatorId,
        });

        if (race.players.length === 1) {
          startLobbyTimer(race.id);
        }

        if (race.players.length >= race.settings.maxPlayers) {
          startRaceCountdown(race.id, 3);
        } else if (race.players.length >= race.settings.minPlayers && race.status === 'waiting') {
          startRaceCountdown(race.id, 10);
        }
        onStatsChange();
      } else if (data.type === 'start_now') {
        const p = players.get(playerId);
        const race = p?.raceId ? races.get(p.raceId) : null;
        if (race && (race.status === 'waiting' || race.status === 'countdown') && race.players.length >= 1) {
          startRaceCountdown(race.id, 3);
        }
      } else if (data.type === 'update') {
        const p = players.get(playerId);
        if (p && p.raceId && (p.state === 'racing' || p.state === 'waiting')) {
          p.x = Number(data.x) || 0;
          p.y = Number(data.y) || 0;
          p.z = Number(data.z) || 0;
          p.rx = Number(data.rx) || 0;
          p.ry = Number(data.ry) || 0;
          p.rz = Number(data.rz) || 0;
          p.speed = Number(data.speed) || 0;
          p.lap = Number(data.lap) || 1;
          p.finished = Boolean(data.finished);
          p.finishTime = Number(data.finishTime) || 0;

          broadcastToRace(
            p.raceId,
            {
              type: 'state',
              id: playerId,
              player: {
                id: playerId,
                name: p.name,
                color: p.color,
                x: p.x,
                y: p.y,
                z: p.z,
                rx: p.rx,
                ry: p.ry,
                rz: p.rz,
                speed: p.speed,
                lap: p.lap,
                finished: p.finished,
                finishTime: p.finishTime,
              },
            },
            playerId
          );
        }
      } else if (data.type === 'lap_completed') {
        const p = players.get(playerId);
        if (p && p.raceId && p.state === 'racing') {
          p.lap = Number(data.lap) || p.lap + 1;
          broadcastToRace(
            p.raceId,
            {
              type: 'opponent_lap',
              id: playerId,
              name: p.name,
              lap: p.lap,
            },
            playerId
          );
        }
      } else if (data.type === 'race_finished') {
        const p = players.get(playerId);
        if (p && p.raceId && p.state === 'racing') {
          const race = races.get(p.raceId);
          if (race && race.status === 'racing') {
            p.state = 'finished';
            p.finished = true;
            const time = Math.max(0.5, Number(data.time) || (Date.now() - race.startedAt) / 1000);
            p.finishTime = time;

            race.finishers.push({ playerId, name: p.name, time });

            broadcastToRace(race.id, {
              type: 'player_finished',
              id: playerId,
              name: p.name,
              time,
              position: race.finishers.length,
            });

            const activePlayers = race.players.filter((id) => {
              const pl = players.get(id);
              return pl && pl.state !== 'menu';
            });
            const finishedCount = activePlayers.filter((id) => players.get(id).state === 'finished').length;

            if (finishedCount >= activePlayers.length) {
              endRace(race.id);
            } else if (!race.finishTimeout) {
              // Give remaining of up to 24 players 25s to finish once 1st place crosses
              race.finishTimeout = setTimeout(() => endRace(race.id), 25000);
            }
          }
        }
      } else if (data.type === 'leave_race') {
        handlePlayerLeaving(playerId);
      }
    });

    ws.on('close', () => {
      handlePlayerLeaving(playerId);
      clients.delete(playerId);
      players.delete(playerId);
      onStatsChange();
    });
  }

  function getLiveStats() {
    let openRooms = 0;
    let playingRooms = 0;
    for (const r of races.values()) {
      if (r.status === 'waiting' || r.status === 'countdown') openRooms++;
      else if (r.status === 'racing') playingRooms++;
    }
    return {
      activePlayers: clients.size,
      openRooms,
      playingRooms,
      maxPlayers: MAX_PLAYERS,
    };
  }

  function close() {
    for (const r of races.values()) clearRaceTimers(r);
    races.clear();
  }

  return { handleConnection, getLiveStats, close };
}
