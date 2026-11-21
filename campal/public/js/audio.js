// Procedural 8-bit retro Web Audio SFX synthesizer (zero external audio assets)

export class RetroAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._noiseBuf = null;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this._buildNoiseBuffer();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _buildNoiseBuffer() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sampleRate * 0.6, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // Bitcrushed 8-bit style white noise
      data[i] = i % 3 === 0 ? Math.random() * 2 - 1 : data[i - 1] || 0;
    }
    this._noiseBuf = buf;
  }

  _tone(type, freqStart, freqEnd, duration, vol = 0.14, delay = 0) {
    if (this.muted || !this.ctx || vol <= 0.005) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freqStart), t);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + duration);
    }
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  _noise(duration, vol = 0.15, filterFreq = 1200, delay = 0) {
    if (this.muted || !this.ctx || !this._noiseBuf || vol <= 0.005) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
    src.stop(t + duration + 0.01);
  }

  playWeapon(weaponId, vol = 1, weaponSpec = null) {
    const v = Math.min(1, Math.max(0, vol));
    if (v <= 0.02) return;
    switch (weaponId) {
      case 'fists':
        this._tone('triangle', 170, 65, 0.07, 0.14 * v);
        break;
      case 'pipe':
        this._tone('square', 360, 140, 0.09, 0.12 * v);
        this._noise(0.05, 0.08 * v, 1800);
        break;
      case 'axe':
        this._tone('sawtooth', 220, 75, 0.13, 0.15 * v);
        this._noise(0.08, 0.1 * v, 1100);
        break;
      case 'brick':
        this._tone('triangle', 260, 110, 0.09, 0.12 * v);
        break;
      case 'slingshot':
        this._tone('triangle', 540, 260, 0.07, 0.11 * v);
        break;
      case 'pistol':
        this._noise(0.09, 0.18 * v, 2400);
        this._tone('square', 380, 90, 0.07, 0.1 * v);
        break;
      case 'shotgun':
        this._noise(0.2, 0.28 * v, 1200);
        this._tone('sawtooth', 160, 42, 0.18, 0.18 * v);
        break;
      case 'rifle':
        this._noise(0.16, 0.24 * v, 3200);
        this._tone('square', 620, 110, 0.12, 0.14 * v);
        break;
      case 'molotov':
        this._tone('triangle', 320, 180, 0.1, 0.1 * v);
        break;
      default: {
        // Fallback SFX for custom theme-defined weapons
        const t = weaponSpec?.type || 'ranged';
        if (t === 'melee') {
          this._tone('square', 310, 110, 0.1, 0.13 * v);
          this._noise(0.06, 0.09 * v, 1500);
        } else if (t === 'thrown' || t === 'molotov') {
          this._tone('triangle', 300, 140, 0.09, 0.12 * v);
        } else {
          this._tone('sawtooth', 760, 220, 0.09, 0.13 * v);
          this._noise(0.06, 0.1 * v, 2600);
        }
        break;
      }
    }
  }

  playHit(vol = 1) {
    this._tone('square', 190, 70, 0.08, 0.14 * vol);
    this._noise(0.05, 0.1 * vol, 900);
  }

  playExplosion(vol = 1) {
    this._noise(0.45, 0.34 * vol, 720);
    this._tone('sawtooth', 110, 28, 0.38, 0.24 * vol);
  }

  playMolotovBurst(vol = 1) {
    this._noise(0.18, 0.18 * vol, 3600);
    this._noise(0.28, 0.14 * vol, 900, 0.06);
  }

  playCrateBreak(vol = 1) {
    this._noise(0.12, 0.16 * vol, 1400);
    this._tone('square', 150, 55, 0.1, 0.11 * vol);
  }

  playPickup() {
    this._tone('square', 440, 440, 0.06, 0.1);
    this._tone('square', 660, 660, 0.08, 0.1, 0.06);
  }

  playHeal() {
    this._tone('triangle', 392, 392, 0.07, 0.12);
    this._tone('triangle', 523, 523, 0.07, 0.12, 0.07);
    this._tone('triangle', 659, 659, 0.11, 0.12, 0.14);
  }

  playDash(vol = 1) {
    this._noise(0.08, 0.12 * vol, 1500);
    this._tone('triangle', 220, 380, 0.07, 0.08 * vol);
  }

  playKill() {
    this._tone('square', 330, 330, 0.07, 0.11);
    this._tone('square', 220, 140, 0.14, 0.11, 0.07);
  }

  playVictory() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, idx) => {
      this._tone('square', n, n, 0.14, 0.12, idx * 0.11);
    });
  }

  playCountdown(go = false) {
    if (go) {
      this._tone('square', 880, 880, 0.18, 0.14);
    } else {
      this._tone('square', 440, 440, 0.09, 0.1);
    }
  }
}
