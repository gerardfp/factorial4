// Portal client logic: persistent player identity, live game catalog, and server records viewer
(function () {
  const gamesGrid = document.getElementById('games-grid');
  const gamesCountPill = document.getElementById('games-count-pill');
  const onlineCountEl = document.getElementById('online-count');
  const playerAvatarEl = document.getElementById('player-avatar');
  const playerNameEl = document.getElementById('player-display-name');
  const btnChangeName = document.getElementById('btn-change-name');
  const btnScrollRecords = document.getElementById('btn-scroll-records');

  const recordsTabs = document.getElementById('records-tabs');
  const recordsHighlight = document.getElementById('records-highlight');
  const recordsThead = document.getElementById('records-thead');
  const recordsTbody = document.getElementById('records-tbody');
  const recordsUpdatedEl = document.getElementById('records-updated');

  let currentTab = 'hall';
  let latestGames = [];
  let latestRecords = null;
  let portalWs = null;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateIdentityUI() {
    const name = window.F4Player.getSavedName();
    playerNameEl.textContent = name || 'Elegir nombre';
    playerAvatarEl.textContent = name ? name.charAt(0).toUpperCase() : '?';
    if (latestRecords) renderRecords();
  }

  function renderGames(games) {
    latestGames = games || [];
    gamesCountPill.textContent = `${latestGames.length} juegos`;

    let totalInGames = 0;
    gamesGrid.innerHTML = '';

    for (const g of latestGames) {
      const activePlayers = g.live?.activePlayers || 0;
      const openRooms = g.live?.openRooms || 0;
      totalInGames += activePlayers;

      const card = document.createElement('article');
      card.className = 'game-card';
      card.style.setProperty('--card-accent', g.accent || '#38bdf8');

      const liveLabel =
        activePlayers > 0
          ? `${activePlayers} jugando${openRooms > 0 ? ` · ${openRooms} sala${openRooms > 1 ? 's' : ''} abierta${openRooms > 1 ? 's' : ''}` : ''}`
          : 'Sala lista · ¡Sé el primero!';

      card.innerHTML = `
        <div class="game-thumb-wrap">
          <img class="game-thumb" src="${escapeHtml(g.thumbnail)}" alt="${escapeHtml(g.name)}" loading="lazy" />
          <div class="game-badges">
            <span class="badge">${escapeHtml(g.genre)}</span>
            <span class="badge badge-24">Hasta ${g.maxPlayers || 24} jugadores</span>
          </div>
          <span class="badge-live ${activePlayers > 0 ? 'active' : ''}">
            ${activePlayers > 0 ? '● ' : '○ '}${escapeHtml(liveLabel)}
          </span>
        </div>
        <div class="game-body">
          <div class="game-title-row">
            <h3>${escapeHtml(g.name)}</h3>
            <span class="game-tagline">${escapeHtml(g.tagline)}</span>
          </div>
          <p class="game-desc">${escapeHtml(g.description)}</p>
          <div class="game-record-box">
            <span>🏆</span>
            <span>Récord: <strong>${escapeHtml(g.topRecordHeadline || 'Sin récords aún')}</strong></span>
          </div>
          <div class="game-controls">Controles: ${escapeHtml(g.controls)}</div>
          <div class="game-actions">
            <a class="btn-play" href="${escapeHtml(g.url)}" data-game-launch="${escapeHtml(g.id)}">JUGAR AHORA</a>
            <button type="button" class="btn-records" data-view-records="${escapeHtml(g.id)}">Récords</button>
          </div>
        </div>
      `;

      card.querySelector('[data-game-launch]').addEventListener('click', async (e) => {
        if (!window.F4Player.getSavedName()) {
          e.preventDefault();
          await window.F4Player.ensureName();
          updateIdentityUI();
          window.location.href = g.url;
        }
      });

      card.querySelector('[data-view-records]').addEventListener('click', () => {
        selectRecordsTab(g.id);
        document.getElementById('records-section').scrollIntoView({ behavior: 'smooth' });
      });

      gamesGrid.appendChild(card);
    }

    onlineCountEl.textContent = String(Math.max(1, totalInGames + 1));
  }

  function rankMedal(idx) {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return `#${idx + 1}`;
  }

  function renderRecords() {
    if (!latestRecords) return;
    const myName = (window.F4Player.getSavedName() || '').toLowerCase();

    if (latestRecords.updatedAt) {
      const dt = new Date(latestRecords.updatedAt);
      recordsUpdatedEl.textContent = `Actualizado: ${dt.toLocaleTimeString('es-ES')}`;
    }

    recordsHighlight.classList.add('hidden');
    recordsHighlight.textContent = '';

    if (currentTab === 'hall') {
      recordsThead.innerHTML = '<tr><th>Pos</th><th>Jugador</th><th>Puntos Totales</th><th>Victorias</th><th>Partidas</th></tr>';
      const rows = latestRecords.hallOfFame || [];
      if (rows.length === 0) {
        recordsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:28px;">Aún no hay récords en el servidor. ¡Juega una partida para estrenar el Salón de la Fama!</td></tr>';
        return;
      }
      recordsTbody.innerHTML = rows
        .map(
          (r, i) => `
          <tr class="${r.name.toLowerCase() === myName ? 'is-me' : ''}">
            <td class="rank-cell">${rankMedal(i)}</td>
            <td><strong>${escapeHtml(r.name)}</strong></td>
            <td>${r.points} pts</td>
            <td>${r.wins}</td>
            <td>${r.gamesPlayed}</td>
          </tr>`
        )
        .join('');
      return;
    }

    const g = latestRecords.games?.[currentTab];
    if (!g) return;

    if (g.headline && g.headline !== 'Sin récords aún') {
      recordsHighlight.classList.remove('hidden');
      recordsHighlight.textContent = `🏆 Récord actual del servidor: ${g.headline}`;
    }

    const ranking = g.ranking || [];
    if (currentTab === 'campal') {
      recordsThead.innerHTML = '<tr><th>Pos</th><th>Jugador</th><th>Victorias</th><th>Bajas Totales</th><th>Récord Bajas</th><th>Puntos</th></tr>';
      recordsTbody.innerHTML = ranking.length
        ? ranking
            .map(
              (r, i) => `
            <tr class="${r.name.toLowerCase() === myName ? 'is-me' : ''}">
              <td class="rank-cell">${rankMedal(i)}</td>
              <td><strong>${escapeHtml(r.name)}</strong></td>
              <td>${r.wins}</td>
              <td>${r.totalKills}</td>
              <td>${r.bestKills}</td>
              <td>${r.points} pts</td>
            </tr>`
            )
            .join('')
        : emptyRow(6);
    } else if (currentTab === 'cuberacer') {
      recordsThead.innerHTML = '<tr><th>Pos</th><th>Piloto</th><th>Puntos</th><th>Victorias</th><th>Mejor Tiempo</th><th>Carreras</th></tr>';
      recordsTbody.innerHTML = ranking.length
        ? ranking
            .map(
              (r, i) => `
            <tr class="${r.name.toLowerCase() === myName ? 'is-me' : ''}">
              <td class="rank-cell">${rankMedal(i)}</td>
              <td><strong>${escapeHtml(r.name)}</strong></td>
              <td>${r.points} pts</td>
              <td>${r.wins}</td>
              <td>${r.bestTime != null ? `${r.bestTime.toFixed(2)}s` : '—'}</td>
              <td>${r.races}</td>
            </tr>`
            )
            .join('')
        : emptyRow(6);
    } else if (currentTab === 'cxvallas') {
      recordsThead.innerHTML = '<tr><th>Pos</th><th>Atleta</th><th>Mejor Tiempo</th><th>Victorias</th><th>Podios</th><th>Puntos</th></tr>';
      recordsTbody.innerHTML = ranking.length
        ? ranking
            .map(
              (r, i) => `
            <tr class="${r.name.toLowerCase() === myName ? 'is-me' : ''}">
              <td class="rank-cell">${rankMedal(i)}</td>
              <td><strong>${escapeHtml(r.name)}</strong></td>
              <td>${r.bestTime != null ? `${r.bestTime.toFixed(2)}s` : '—'}</td>
              <td>${r.wins}</td>
              <td>${r.podiums}</td>
              <td>${r.points} pts</td>
            </tr>`
            )
            .join('')
        : emptyRow(6);
    } else if (currentTab === 'mecanorace') {
      recordsThead.innerHTML = '<tr><th>Pos</th><th>Mecanógrafo</th><th>Récord PPM</th><th>Precisión</th><th>Victorias</th><th>Puntos</th></tr>';
      recordsTbody.innerHTML = ranking.length
        ? ranking
            .map(
              (r, i) => `
            <tr class="${r.name.toLowerCase() === myName ? 'is-me' : ''}">
              <td class="rank-cell">${rankMedal(i)}</td>
              <td><strong>${escapeHtml(r.name)}</strong></td>
              <td><strong>${r.bestWpm} PPM</strong></td>
              <td>${r.bestAccuracy}%</td>
              <td>${r.wins}</td>
              <td>${r.points} pts</td>
            </tr>`
            )
            .join('')
        : emptyRow(6);
    } else if (currentTab === 'racermaster') {
      recordsThead.innerHTML = '<tr><th>Pos</th><th>Piloto</th><th>Mejor Tiempo</th><th>Mejor Vuelta</th><th>Victorias</th><th>Puntos</th></tr>';
      recordsTbody.innerHTML = ranking.length
        ? ranking
            .map(
              (r, i) => `
            <tr class="${r.name.toLowerCase() === myName ? 'is-me' : ''}">
              <td class="rank-cell">${rankMedal(i)}</td>
              <td><strong>${escapeHtml(r.name)}</strong></td>
              <td>${r.bestTime != null ? `${r.bestTime.toFixed(2)}s` : '—'}</td>
              <td>${r.bestLap != null ? `${r.bestLap.toFixed(2)}s` : '—'}</td>
              <td>${r.wins}</td>
              <td>${r.points} pts</td>
            </tr>`
            )
            .join('')
        : emptyRow(6);
    } else if (currentTab === 'trobix') {
      recordsThead.innerHTML = '<tr><th>Pos</th><th>Explorador</th><th>Récord Puntos</th><th>Precisión Máx.</th><th>Victorias</th><th>Puntos Liga</th></tr>';
      recordsTbody.innerHTML = ranking.length
        ? ranking
            .map(
              (r, i) => `
            <tr class="${r.name.toLowerCase() === myName ? 'is-me' : ''}">
              <td class="rank-cell">${rankMedal(i)}</td>
              <td><strong>${escapeHtml(r.name)}</strong></td>
              <td><strong>${r.bestScore}</strong></td>
              <td>${r.bestAccuracy}%</td>
              <td>${r.wins}</td>
              <td>${r.points} pts</td>
            </tr>`
            )
            .join('')
        : emptyRow(6);
    }
  }

  function emptyRow(cols) {
    return `<tr><td colspan="${cols}" style="text-align:center;color:#94a3b8;padding:28px;">Todavía no hay marcas registradas en este juego. ¡Sé el primero en batir el récord!</td></tr>`;
  }

  function selectRecordsTab(tabId) {
    currentTab = tabId;
    recordsTabs.querySelectorAll('.tab-btn').forEach((btn) => {
      const active = btn.dataset.tab === tabId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    renderRecords();
  }

  recordsTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.dataset.tab) selectRecordsTab(btn.dataset.tab);
  });

  btnChangeName.addEventListener('click', async () => {
    await window.F4Player.ensureName({ forcePrompt: true });
    updateIdentityUI();
  });

  btnScrollRecords.addEventListener('click', () => {
    document.getElementById('records-section').scrollIntoView({ behavior: 'smooth' });
  });

  window.addEventListener('f4:namechange', updateIdentityUI);

  async function fetchInitial() {
    try {
      const [gRes, rRes] = await Promise.all([
        fetch('/api/games', { cache: 'no-store' }),
        fetch('/api/records', { cache: 'no-store' }),
      ]);
      if (gRes.ok) {
        const gData = await gRes.json();
        renderGames(gData.games);
        if (typeof gData.totalOnline === 'number') {
          onlineCountEl.textContent = String(Math.max(1, gData.totalOnline));
        }
      }
      if (rRes.ok) {
        latestRecords = await rRes.json();
        renderRecords();
      }
    } catch (err) {
      console.error('Error cargando portal:', err);
    }
  }

  function connectPortalWS() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    portalWs = new WebSocket(`${proto}//${window.location.host}/ws/portal`);
    portalWs.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'portal_update') {
          if (msg.games) renderGames(msg.games);
          if (msg.records) {
            latestRecords = msg.records;
            renderRecords();
          }
        }
      } catch {
        // ignore
      }
    };
    portalWs.onclose = () => {
      setTimeout(connectPortalWS, 3000);
    };
  }

  // Boot
  fetchInitial();
  connectPortalWS();
  updateIdentityUI();
  // Ask for player's name on first visit (never again once saved!)
  window.F4Player.ensureName().then(updateIdentityUI);
})();
