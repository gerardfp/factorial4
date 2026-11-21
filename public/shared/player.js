// Shared persistent player identity (no accounts/login, saved in localStorage) + Portal Nav
(function () {
  const STORAGE_KEY = 'f4_player_name';

  function sanitizeName(raw) {
    return String(raw || '')
      .replace(/[^\p{L}\p{N}_\-\. ]/gu, '')
      .trim()
      .slice(0, 18);
  }

  function getSavedName() {
    try {
      const direct = sanitizeName(localStorage.getItem(STORAGE_KEY));
      if (direct) return direct;
      // Migrate from any existing game's saved name if present
      const legacy =
        sanitizeName(localStorage.getItem('campal_name')) ||
        sanitizeName(localStorage.getItem('cxvallas_player_name'));
      if (legacy) {
        setName(legacy);
        return legacy;
      }
    } catch {
      // ignore storage errors
    }
    return '';
  }

  function setName(raw) {
    const clean = sanitizeName(raw);
    if (!clean) return '';
    try {
      localStorage.setItem(STORAGE_KEY, clean);
      localStorage.setItem('campal_name', clean);
      localStorage.setItem('cxvallas_player_name', clean);
    } catch {
      // ignore storage errors
    }
    document.querySelectorAll('.f4-player-name-text').forEach((el) => {
      el.textContent = clean;
    });
    window.dispatchEvent(new CustomEvent('f4:namechange', { detail: { name: clean } }));
    return clean;
  }

  function ensureName(options = {}) {
    const existing = getSavedName();
    if (existing && !options.forcePrompt) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve) => {
      let dlg = document.getElementById('f4-identity-dialog');
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'f4-identity-dialog';
        dlg.className = 'f4-name-dialog';
        dlg.innerHTML = `
          <form class="f4-name-dialog-inner" method="dialog">
            <h2>¿Cómo te llamas?</h2>
            <p>Introduce tu nombre una sola vez. Quedará guardado para todas tus partidas y récords en el servidor (sin registro ni contraseña).</p>
            <input type="text" id="f4-identity-input" maxlength="18" placeholder="Ej. Alex, Dani, Luna..." autocomplete="nickname" required />
            <button type="submit">Guardar y jugar</button>
          </form>
        `;
        document.body.appendChild(dlg);
      }

      const form = dlg.querySelector('form');
      const input = dlg.querySelector('#f4-identity-input');
      input.value = existing || '';

      const onSubmit = (e) => {
        e.preventDefault();
        const saved = setName(input.value);
        if (!saved) {
          input.focus();
          return;
        }
        form.removeEventListener('submit', onSubmit);
        dlg.close();
        resolve(saved);
      };

      // Prevent closing with Escape if no name exists yet
      const onCancel = (e) => {
        if (!getSavedName()) {
          e.preventDefault();
        } else {
          dlg.removeEventListener('cancel', onCancel);
          resolve(getSavedName());
        }
      };

      form.addEventListener('submit', onSubmit);
      dlg.addEventListener('cancel', onCancel);

      if (!dlg.open) {
        dlg.showModal();
      }
      setTimeout(() => {
        input.focus();
        input.select();
      }, 40);
    });
  }

  function mountNavBar(options = {}) {
    if (document.getElementById('f4-game-nav')) return;
    const nav = document.createElement('div');
    nav.id = 'f4-game-nav';
    nav.className = 'f4-game-nav';
    if (options.position === 'top-right') {
      nav.style.left = 'auto';
      nav.style.right = '10px';
    } else if (options.position === 'bottom-left') {
      nav.style.top = 'auto';
      nav.style.bottom = '10px';
    }

    const currentName = getSavedName() || 'Jugador';
    nav.innerHTML = `
      <a class="f4-back-link" href="/" title="Volver al catálogo de juegos">← Juegos</a>
      <span class="f4-sep"></span>
      <span class="f4-player-tag" title="Tu nombre guardado (clic para cambiar)" style="cursor:pointer;">
        <span class="f4-player-dot"></span>
        <span class="f4-player-name-text"></span>
      </span>
    `;
    nav.querySelector('.f4-player-name-text').textContent = currentName;
    nav.querySelector('.f4-player-tag').addEventListener('click', () => {
      ensureName({ forcePrompt: true });
    });
    document.body.appendChild(nav);
  }

  window.F4Player = {
    getName: () => getSavedName() || `Jugador${Math.floor(100 + Math.random() * 899)}`,
    getSavedName,
    setName,
    ensureName,
    mountNavBar,
  };
})();
