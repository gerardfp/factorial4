// MecanoRace 24-Player Live Typing Grand Prix Client (Server Records & Synced Text)
if (window.F4Player) {
    window.F4Player.mountNavBar();
    window.F4Player.ensureName();
}

let ws = null;
let myPlayerId = null;
let currentText = '';
let characters = [];
let currentIndex = 0;
let errors = 0;
let startTime = null;
let timerInterval = null;
let gameActive = false;
let finishedLocal = false;
let currentRaceKeystrokes = [];
let bestGhost = null;
let ghostPoints = [];
let maxWpmScale = 100;
let serverRuns = [];
let lastProgressSent = 0;

const screens = {
    welcome: document.getElementById('welcome-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen'),
    leaderboard: document.getElementById('leaderboard-screen')
};

const btnStart = document.getElementById('btn-start');
const btnShowLeaderboard = document.getElementById('btn-show-leaderboard');
const btnStartNow = document.getElementById('btn-start-now');
const btnLeaveLobby = document.getElementById('btn-leave-lobby');
const btnQuit = document.getElementById('btn-quit');
const btnPlayAgain = document.getElementById('btn-play-again');
const btnSkipSave = document.getElementById('btn-skip-save');
const btnBackHome = document.getElementById('btn-back-home');

const lobbyRoomBadge = document.getElementById('lobby-room-badge');
const lobbyWaitMsg = document.getElementById('lobby-wait-msg');
const lobbyPlayersEl = document.getElementById('lobby-players');
const raceCountdownBanner = document.getElementById('race-countdown-banner');
const liveRacersBoard = document.getElementById('live-racers-board');
const textDisplay = document.getElementById('text-display');
const statPos = document.getElementById('stat-pos');
const statTime = document.getElementById('stat-time');
const statWpm = document.getElementById('stat-wpm');
const statAccuracy = document.getElementById('stat-accuracy');
const finalWpmEl = document.getElementById('final-wpm');
const finalAccuracyEl = document.getElementById('final-accuracy');
const finalTimeEl = document.getElementById('final-time');
const raceStandingsBody = document.getElementById('race-standings-body');
const leaderboardBody = document.getElementById('leaderboard-body');
const welcomeRecordLine = document.getElementById('welcome-record-line');

function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showScreen(screenName) {
    Object.values(screens).forEach((s) => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    screens[screenName].classList.remove('hidden');
    setTimeout(() => screens[screenName].classList.add('active'), 10);
}

function getCharWeight(char) {
    if (!char) return 0;
    let weight = 1;
    const isUpper = char !== char.toLowerCase() && /[A-ZÁÉÍÓÚÜÏÑ]/.test(char);
    if (isUpper) weight += 1;
    if (/[áéíóúÁÉÍÓÚ]/.test(char)) weight += 1;
    if (/[üïÜÏ]/.test(char)) weight += 2;
    return weight;
}

function getWeightForTextRange(text, startIndex, endIndex) {
    let totalWeight = 0;
    for (let i = startIndex; i < endIndex; i++) totalWeight += getCharWeight(text[i]);
    return totalWeight;
}

function sendWS(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws/mecanorace`);

    ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        handleServerMessage(msg);
    };

    ws.onclose = () => {
        setTimeout(connectWS, 2000);
    };
}
connectWS();

function updateWelcomeRecord(rec) {
    if (rec && rec.wpm) {
        welcomeRecordLine.textContent = `🏆 Récord del servidor: ${rec.name} — ${rec.wpm} PPM (${rec.accuracy}%)`;
    } else {
        welcomeRecordLine.textContent = '¡Sé el primero en establecer el récord del servidor!';
    }
}

function renderLobby(players, maxPlayers, waitLeft) {
    lobbyRoomBadge.textContent = `SALA ABIERTA · ${players.length} / ${maxPlayers || 24}`;
    if (typeof waitLeft === 'number') {
        lobbyWaitMsg.textContent = `Esperando más jugadores... La carrera empieza en ${Math.max(0, waitLeft)}s`;
    }
    lobbyPlayersEl.innerHTML = players.map((p, idx) => `
        <div class="lobby-chip ${p.id === myPlayerId ? 'me' : ''}">
            #${idx + 1} ${escapeHtml(p.name)}${p.id === myPlayerId ? ' (Tú)' : ''}
        </div>
    `).join('');
}

function renderLiveRacers(players) {
    if (!Array.isArray(players)) return;
    const myRank = players.findIndex((p) => p.id === myPlayerId) + 1;
    if (myRank > 0) statPos.innerText = `${myRank}º / ${players.length}`;

    liveRacersBoard.innerHTML = players.map((p, idx) => `
        <div class="racer-row ${p.id === myPlayerId ? 'me' : ''}">
            <div class="racer-head">
                <span class="racer-name">${idx + 1}. ${escapeHtml(p.name)}</span>
                <span style="color:${p.finished ? '#22c55e' : 'var(--primary)'};">
                    ${p.finished ? `✔ ${p.wpm}` : `${p.wpm} PPM`}
                </span>
            </div>
            <div class="racer-bar-bg">
                <div class="racer-bar-fill" style="width:${Math.min(100, Math.round(p.progress || 0))}%"></div>
            </div>
        </div>
    `).join('');
}

function prepareRaceArena(text, ghost, players) {
    currentText = text;
    currentIndex = 0;
    errors = 0;
    startTime = null;
    gameActive = false;
    finishedLocal = false;
    currentRaceKeystrokes = [];
    bestGhost = ghost || null;
    clearInterval(timerInterval);

    statTime.innerText = '0.0s';
    statWpm.innerText = '0';
    statAccuracy.innerText = '100%';
    document.getElementById('stat-ghost-wpm').innerText = bestGhost ? `${bestGhost.wpm}` : '-';
    document.getElementById('player-progress-bar').style.width = '0%';
    document.getElementById('ghost-progress-bar').style.width = '0%';

    ghostPoints = [{ progress: 0, wpm: 0 }];
    maxWpmScale = 60;
    if (bestGhost && Array.isArray(bestGhost.keystrokes) && bestGhost.keystrokes.length > 0) {
        const ghostText = bestGhost.text || '';
        for (let i = 0; i < bestGhost.keystrokes.length; i++) {
            const timeMs = bestGhost.keystrokes[i];
            if (timeMs > 1000) {
                const ghostWeightedKeys = ghostText ? getWeightForTextRange(ghostText, 0, i + 1) : (i + 1);
                const wpm = Math.round((ghostWeightedKeys / 5) / (timeMs / 60000));
                const progress = (i + 1) / bestGhost.keystrokes.length;
                ghostPoints.push({ progress, wpm });
                if (wpm > maxWpmScale) maxWpmScale = wpm;
            }
        }
    }
    maxWpmScale = Math.ceil(maxWpmScale * 1.1);

    const canvas = document.getElementById('wpm-chart');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    textDisplay.innerHTML = '';
    characters = currentText.split('').map((char, index) => {
        const span = document.createElement('span');
        span.innerText = char;
        span.classList.add('char');
        if (index === 0) span.classList.add('active');
        textDisplay.appendChild(span);
        return span;
    });

    renderLiveRacers(players || []);
    showScreen('game');
}

function handleServerMessage(msg) {
    if (msg.type === 'init') {
        serverRuns = msg.runs || [];
        bestGhost = msg.bestGhost || null;
        updateWelcomeRecord(msg.record);
    } else if (msg.type === 'joined') {
        myPlayerId = msg.playerId;
        serverRuns = msg.runs || serverRuns;
        bestGhost = msg.bestGhost || bestGhost;
        updateWelcomeRecord(msg.record);
        showScreen('lobby');
    } else if (msg.type === 'lobby_update') {
        renderLobby(msg.players || [], msg.maxPlayers, msg.waitLeft);
    } else if (msg.type === 'wait_tick') {
        lobbyWaitMsg.textContent = `Esperando más jugadores... La carrera empieza en ${Math.max(0, msg.value)}s`;
    } else if (msg.type === 'race_countdown') {
        if (msg.text) {
            prepareRaceArena(msg.text, msg.bestGhost, msg.players);
        }
        raceCountdownBanner.textContent = `PREPARADOS... ${msg.value}`;
    } else if (msg.type === 'race_start') {
        raceCountdownBanner.textContent = '¡ESCRIBE YA!';
        setTimeout(() => {
            if (raceCountdownBanner.textContent === '¡ESCRIBE YA!') raceCountdownBanner.textContent = '';
        }, 1200);
        gameActive = true;
        startTime = new Date();
        clearInterval(timerInterval);
        timerInterval = setInterval(updateStats, 100);
        window.addEventListener('keydown', handleTyping);
        renderLiveRacers(msg.players || []);
    } else if (msg.type === 'race_state' || msg.type === 'player_finished') {
        renderLiveRacers(msg.players || []);
    } else if (msg.type === 'finish_countdown') {
        if (!finishedLocal) {
            raceCountdownBanner.textContent = `⏱ ¡Quedan ${msg.seconds}s!`;
        }
    } else if (msg.type === 'race_results') {
        gameActive = false;
        clearInterval(timerInterval);
        window.removeEventListener('keydown', handleTyping);
        serverRuns = msg.runs || serverRuns;
        updateWelcomeRecord(msg.record);
        renderRaceStandings(msg.standings || []);
        showScreen('result');
    }
}

function handleTyping(e) {
    if (!gameActive || finishedLocal) return;
    if (e.key === 'Backspace') {
        e.preventDefault();
        return;
    }
    if (e.key.length !== 1) return;
    if (e.key === ' ') e.preventDefault();

    const currentSpan = characters[currentIndex];
    const expectedChar = currentText[currentIndex];

    if (e.key === expectedChar) {
        currentSpan.classList.remove('incorrect');
        currentSpan.classList.add('correct');
        const nowMs = new Date() - startTime;
        currentRaceKeystrokes.push(nowMs);

        currentSpan.classList.remove('active');
        currentIndex++;

        if (currentIndex >= characters.length) {
            finishLocalTyping();
        } else {
            characters[currentIndex].classList.add('active');
        }
    } else {
        currentSpan.classList.add('incorrect');
        errors++;
    }
}

function computeStats() {
    const elapsedSec = startTime ? Math.max(0.1, (new Date() - startTime) / 1000) : 0.1;
    const mins = elapsedSec / 60;
    const weighted = getWeightForTextRange(currentText, 0, currentIndex);
    const wpm = Math.round((weighted / 5) / mins);
    let accuracy = 100;
    if (currentIndex > 0) {
        accuracy = Math.max(0, Math.round(((currentIndex - errors) / currentIndex) * 100));
    }
    const progress = characters.length > 0 ? (currentIndex / characters.length) * 100 : 0;
    return { elapsedSec, wpm, accuracy, progress };
}

function updateStats() {
    if (!startTime || finishedLocal) return;
    const { elapsedSec, wpm, accuracy, progress } = computeStats();

    statWpm.innerText = wpm;
    statTime.innerText = elapsedSec.toFixed(1) + 's';
    statAccuracy.innerText = accuracy + '%';
    document.getElementById('player-progress-bar').style.width = `${Math.min(progress, 100)}%`;

    if (bestGhost && bestGhost.keystrokes?.length) {
        const timeElapsedMs = elapsedSec * 1000;
        const ghostText = bestGhost.text || '';
        const ghostTotalWeight = ghostText ? getWeightForTextRange(ghostText, 0, ghostText.length) : bestGhost.keystrokes.length;
        const playerTotalWeight = getWeightForTextRange(currentText, 0, currentText.length) || 1;
        const adjustedTimeMs = timeElapsedMs * (ghostTotalWeight / playerTotalWeight);

        let ghostKeyCountAtTime = 0;
        for (let i = 0; i < bestGhost.keystrokes.length; i++) {
            if (bestGhost.keystrokes[i] <= adjustedTimeMs) ghostKeyCountAtTime++;
            else break;
        }
        const ghostBarPct = (ghostKeyCountAtTime / bestGhost.keystrokes.length) * 100;
        document.getElementById('ghost-progress-bar').style.width = `${Math.min(ghostBarPct, 100)}%`;
    }

    drawNeonChart();

    const now = performance.now();
    if (now - lastProgressSent >= 120) {
        lastProgressSent = now;
        sendWS({ type: 'progress', progress, wpm, accuracy });
    }
}

function drawNeonChart() {
    const canvas = document.getElementById('wpm-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    function drawLine(points, color, glowColor) {
        if (points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(points[0].progress * width, height - (points[0].wpm / maxWpmScale) * height);
        for (let i = 1; i < points.length; i++) {
            const x = points[i].progress * width;
            const y = Math.max(0, Math.min(height, height - (points[i].wpm / maxWpmScale) * height));
            ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowColor;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    if (ghostPoints.length > 0) drawLine(ghostPoints, '#ff00ff', 'rgba(255, 0, 255, 0.8)');

    const playerPoints = [{ progress: 0, wpm: 0 }];
    for (let i = 0; i < currentRaceKeystrokes.length; i++) {
        const timeMs = currentRaceKeystrokes[i];
        if (timeMs > 1000) {
            const wpm = Math.round(((i + 1) / 5) / (timeMs / 60000));
            const progress = (i + 1) / characters.length;
            playerPoints.push({ progress, wpm });
            if (wpm > maxWpmScale) maxWpmScale = Math.ceil(wpm * 1.1);
        }
    }
    if (playerPoints.length > 1) drawLine(playerPoints, '#00ffcc', 'rgba(0, 255, 204, 0.8)');
}

function finishLocalTyping() {
    finishedLocal = true;
    gameActive = false;
    clearInterval(timerInterval);
    window.removeEventListener('keydown', handleTyping);

    const { elapsedSec, wpm, accuracy } = computeStats();
    document.getElementById('player-progress-bar').style.width = '100%';
    finalWpmEl.innerHTML = `${wpm} <small>PPM</small>`;
    finalAccuracyEl.innerText = `${accuracy}%`;
    finalTimeEl.innerText = `${elapsedSec.toFixed(1)}s`;
    raceCountdownBanner.textContent = '🏁 ¡META! Esperando cierre de clasificación...';

    sendWS({
        type: 'finish',
        wpm,
        accuracy,
        time: Number(elapsedSec.toFixed(2)),
        keystrokes: currentRaceKeystrokes
    });
}

function renderRaceStandings(standings) {
    raceStandingsBody.innerHTML = standings.map((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        return `
            <tr style="${p.id === myPlayerId ? 'background:rgba(0,255,204,0.12);' : ''}">
                <td>${medal}</td>
                <td>${escapeHtml(p.name)}${p.id === myPlayerId ? ' (Tú)' : ''}</td>
                <td>${p.wpm} PPM</td>
                <td>${p.accuracy}%</td>
                <td>${p.finished && p.time ? `${p.time.toFixed(1)}s` : `${Math.round(p.progress || 0)}%`}</td>
            </tr>
        `;
    }).join('');
}

async function renderLeaderboard() {
    try {
        const res = await fetch('/api/records/mecanorace', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            serverRuns = data.runs || [];
            updateWelcomeRecord(data.record);
        }
    } catch {}

    leaderboardBody.innerHTML = '';
    if (serverRuns.length === 0) {
        leaderboardBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Aún no hay récords en el servidor. ¡Sé el primero!</td></tr>';
        return;
    }

    serverRuns.slice(0, 20).forEach((score, index) => {
        const rankDisplay = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-size: 1.2rem;">${rankDisplay}</td>
            <td>${escapeHtml(score.name)}</td>
            <td>${score.wpm} PPM</td>
            <td>${score.accuracy}%</td>
            <td>${score.time ? `${Number(score.time).toFixed(1)}s` : '—'}</td>
        `;
        leaderboardBody.appendChild(tr);
    });
}

async function joinMultiplayerRace() {
    const name = window.F4Player ? await window.F4Player.ensureName() : 'Piloto';
    sendWS({ type: 'join', name });
}

btnStart.addEventListener('click', joinMultiplayerRace);
btnPlayAgain.addEventListener('click', joinMultiplayerRace);
btnStartNow.addEventListener('click', () => sendWS({ type: 'start_now' }));
btnLeaveLobby.addEventListener('click', () => {
    sendWS({ type: 'leave' });
    showScreen('welcome');
});
btnQuit.addEventListener('click', () => {
    gameActive = false;
    clearInterval(timerInterval);
    window.removeEventListener('keydown', handleTyping);
    sendWS({ type: 'leave' });
    showScreen('welcome');
});
btnShowLeaderboard.addEventListener('click', () => {
    renderLeaderboard();
    showScreen('leaderboard');
});
btnSkipSave.addEventListener('click', () => {
    renderLeaderboard();
    showScreen('leaderboard');
});
btnBackHome.addEventListener('click', () => showScreen('welcome'));

showScreen('welcome');
