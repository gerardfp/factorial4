// Keyboard + mouse input manager for responsive movement, aiming, pickups, and dashing

export class InputManager {
  constructor(canvas, onQuickAction) {
    this.canvas = canvas;
    this.onQuickAction = onQuickAction;

    this.keys = new Set();
    this.mouseDown = false;
    this.mouseScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.inMatch = false;

    this._pendingPickup = false;
    this._pendingDash = false;
    this._pendingSlot = null;
    this._currentSlot = 0;

    this._bind();
  }

  setInMatch(active) {
    this.inMatch = Boolean(active);
    if (this.inMatch) {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      window.focus();
    }
  }

  _isTypingInInput() {
    // Never block keyboard controls during an active match
    if (this.inMatch) return false;
    const el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return type === 'text' || type === 'search' || type === 'password';
    }
    return false;
  }

  _normKey(e) {
    const code = e.code || '';
    const key = (e.key || '').toLowerCase();
    if (code === 'KeyW' || key === 'w' || code === 'ArrowUp' || key === 'arrowup') return 'UP';
    if (code === 'KeyS' || key === 's' || code === 'ArrowDown' || key === 'arrowdown') return 'DOWN';
    if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft' || key === 'arrowleft') return 'LEFT';
    if (code === 'KeyD' || key === 'd' || code === 'ArrowRight' || key === 'arrowright') return 'RIGHT';
    return code;
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (this._isTypingInInput()) return;
      const k = this._normKey(e);
      this.keys.add(k);

      if (k === 'UP' || k === 'DOWN' || k === 'LEFT' || k === 'RIGHT') {
        e.preventDefault();
      }

      const code = e.code;
      const key = (e.key || '').toLowerCase();
      if (code === 'KeyE' || code === 'KeyF' || key === 'e' || key === 'f') {
        this._pendingPickup = true;
      } else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || key === ' ') {
        e.preventDefault();
        this._pendingDash = true;
      } else if (code === 'Digit1' || key === '1') {
        this._pendingSlot = 0;
        this._currentSlot = 0;
      } else if (code === 'Digit2' || key === '2') {
        this._pendingSlot = 1;
        this._currentSlot = 1;
      } else if (code === 'KeyQ' || key === 'q') {
        this._currentSlot = this._currentSlot === 0 ? 1 : 0;
        this._pendingSlot = this._currentSlot;
      } else if (code === 'KeyM' || key === 'm') {
        this.onQuickAction?.('mute');
      }
    });

    window.addEventListener('keyup', (e) => {
      const k = this._normKey(e);
      this.keys.delete(k);
      if (e.code) this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    window.addEventListener('mousemove', (e) => {
      this.mouseScreen.x = e.clientX;
      this.mouseScreen.y = e.clientY;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.inMatch && document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this.onQuickAction?.('unlock_audio');
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener(
      'wheel',
      (e) => {
        if (this._isTypingInInput()) return;
        if (Math.abs(e.deltaY) > 4) {
          this._currentSlot = this._currentSlot === 0 ? 1 : 0;
          this._pendingSlot = this._currentSlot;
        }
      },
      { passive: true }
    );
  }

  getMoveVector() {
    let mx = 0;
    let my = 0;
    if (this.keys.has('UP')) my -= 1;
    if (this.keys.has('DOWN')) my += 1;
    if (this.keys.has('LEFT')) mx -= 1;
    if (this.keys.has('RIGHT')) mx += 1;

    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    return { mx, my };
  }

  sample(playerWorldPos, renderer) {
    const { mx, my } = this.getMoveVector();

    let aim = 0;
    if (playerWorldPos && renderer) {
      const worldMouse = renderer.screenToWorld(this.mouseScreen.x, this.mouseScreen.y);
      aim = Math.atan2(worldMouse.y - playerWorldPos.y, worldMouse.x - playerWorldPos.x);
    }

    const packet = {
      type: 'input',
      mx: Number(mx.toFixed(2)),
      my: Number(my.toFixed(2)),
      aim: Number(aim.toFixed(2)),
      attack: this.mouseDown,
      pickup: this._pendingPickup,
      dash: this._pendingDash,
      slot: this._pendingSlot,
    };

    this._pendingPickup = false;
    this._pendingDash = false;
    this._pendingSlot = null;
    return packet;
  }
}
