// Piskel-inspired Pixel Art Sprite & Animation Editor for CAMPAL
// Supports characters (<=32x32px, multi-frame animations), weapons, 3/4 obstacles, and ground tiles.
// Allows PNG import (single frame or horizontal spritesheet strip), PNG export, and internal RLE persistence.

import { PALETTE, PALETTE_LIST, CHAR_SPRITE_W, CHAR_SPRITE_H, CHAR_MAX_SPRITE_SIZE } from '../shared/constants.js';
import { canvasToRgba, rgbaToCanvas, canvasesToPngDataUrl } from './sprites.js';

function hexToRgba(hex) {
  const clean = String(hex || '#000000').replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

function rgbaToHex(r, g, b) {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function colorsEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

const PALETTE_RGBA = PALETTE_LIST.map(hexToRgba);

export class SpriteEditor {
  constructor(atlas, onAtlasUpdated, onRequestThemeSave = null) {
    this.atlas = atlas;
    this.onAtlasUpdated = onAtlasUpdated;
    this.onRequestThemeSave = onRequestThemeSave;

    this.isOpen = false;
    this.mode = 'all'; // 'characters' (from Main Menu) | 'all' (from Create Battle)
    this.previewTheme = 'campo';
    this.currentAssetKey = 'char:0';
    this.w = 16;
    this.h = 24;
    this.fps = 8;
    this.frames = []; // Array of Uint8ClampedArray(w * h * 4)
    this.currentFrameIdx = 0;

    // Drawing state
    this.tool = 'pen'; // 'pen' | 'mirror' | 'eraser' | 'bucket' | 'replace' | 'line' | 'rect' | 'ellipse' | 'move' | 'picker'
    this.brushSize = 1;
    this.shapeFilled = false;
    this.primaryColor = PALETTE.CRIMSON;
    this.primaryRgba = hexToRgba(PALETTE.CRIMSON);

    this.showGrid = true;
    this.showOnion = true;
    this.bgSoil = false; // false = checkerboard, true = descampado soil color
    this.previewFlip = false;

    this.isDrawing = false;
    this.dragStart = null;
    this.hoverPixel = null;
    this.strokeSnapshot = null; // Uint8ClampedArray copy at start of stroke

    // Undo / Redo stacks
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;

    this.previewAnimTime = 0;

    this._initDOM();
    this._loadServerSprites();
  }

  async _loadServerSprites() {
    try {
      const res = await fetch('/api/sprites', { cache: 'no-store' });
      if (res.ok) {
        const catalog = await res.json();
        await this.atlas.loadFromServerCatalog(catalog);
        this._populateAssetSelect();
        this.onAtlasUpdated?.();
      }
    } catch {
      // Fallback to built-in procedural defaults if server unavailable
    }
  }

  async _saveCurrentSpriteToServer(overrideTheme = null) {
    if (!this.frames || this.frames.length === 0) return false;
    const meta = this.atlas.getAssetMeta(this.currentAssetKey);
    if (!meta) return false;

    const targetTheme = overrideTheme || this.previewTheme;
    const canvases = this.frames.map((rgba) => rgbaToCanvas(rgba, this.w, this.h));
    const pngDataUrl = canvasesToPngDataUrl(canvases);

    try {
      const res = await fetch('/api/sprites/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: meta.key,
          id: meta.id,
          name: meta.name,
          category: meta.category,
          theme: targetTheme,
          w: this.w,
          h: this.h,
          frames: canvases.length,
          fps: this.fps,
          pngDataUrl,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (overrideTheme) this.previewTheme = overrideTheme;
        this.dirty = false;
        // Refresh cached catalog so switching themes preserves the saved PNG
        await this._refreshCatalogOnly();
        const folderHint = data.sprite.theme ? `sprites/custom/themes/${data.sprite.theme}` : 'sprites/custom';
        this._setStatus(`Guardado en servidor (derivado): ${folderHint}/${data.sprite.file}`);
        return true;
      }
      this._setStatus(data.error || 'Error guardando PNG en el servidor.');
      return false;
    } catch {
      this._setStatus('No se pudo conectar al servidor para guardar el PNG.');
      return false;
    }
  }

  async _refreshCatalogOnly() {
    try {
      const res = await fetch('/api/sprites', { cache: 'no-store' });
      if (res.ok) {
        this.atlas.serverCatalog = await res.json();
      }
    } catch {
      // Ignore
    }
  }

  async _restoreCurrentFromServerDefault() {
    try {
      const res = await fetch('/api/sprites/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: this.currentAssetKey, theme: this.previewTheme }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await this._refreshCatalogOnly();
        if (data.restoredToDefault && data.defaultMeta) {
          await this.atlas.loadEntryFromServerPng(data.defaultMeta, false);
          this._populateAssetSelect();
          this.loadAsset(this.currentAssetKey);
          this.onAtlasUpdated?.();
          this._setStatus(`Restaurado desde ${data.defaultMeta.url}`);
        } else {
          this.atlas.removeCustomAssetMeta(this.currentAssetKey);
          this._populateAssetSelect();
          this.loadAsset('char:0');
          this.onAtlasUpdated?.();
          this._setStatus('Sprite personalizado eliminado del servidor.');
        }
      }
    } catch {
      this._setStatus('Error al restaurar el sprite original.');
    }
  }

  async _restoreAllFromServerDefaults() {
    try {
      const res = await fetch('/api/sprites/restore-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: this.previewTheme || 'campo' }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await this.atlas.loadFromServerCatalog(data, this.previewTheme);
        this._populateAssetSelect();
        const targetKey = this.atlas.getAssetMeta(this.currentAssetKey) ? this.currentAssetKey : 'char:0';
        this.loadAsset(targetKey);
        this.onAtlasUpdated?.();
        this._setStatus('Sprites restaurados a los PNG originales del tema.');
      }
    } catch {
      this._setStatus('Error al restaurar todos los sprites.');
    }
  }

  async createNewCustomCharacter() {
    const raw = window.prompt('Nombre para el nuevo personaje (máx 14 letras):', 'MiHeroe');
    if (raw === null) return;
    const label = raw.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_ -]/g, '').trim().slice(0, 14) || `Custom${Date.now() % 1000}`;
    const slug =
      label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 18) || `hero_${Date.now() % 10000}`;

    let customId = `custom_${slug}`;
    let key = `char:${customId}`;
    let suffix = 2;
    while (this.atlas.getAssetMeta(key)) {
      customId = `custom_${slug}_${suffix++}`;
      key = `char:${customId}`;
    }

    // Start from a clean 4-frame copy of the current character (or blank 16x24 if editing non-character)
    const baseFrames = this.currentAssetKey.startsWith('char:')
      ? this.frames.map((f) => new Uint8ClampedArray(f))
      : Array.from({ length: 4 }, () => new Uint8ClampedArray(CHAR_SPRITE_W * CHAR_SPRITE_H * 4));
    const w = this.currentAssetKey.startsWith('char:') ? this.w : CHAR_SPRITE_W;
    const h = this.currentAssetKey.startsWith('char:') ? this.h : CHAR_SPRITE_H;

    this.atlas.upsertAssetMeta({
      key,
      category: 'characters',
      id: customId,
      name: `Personaje: ${label}`,
      w,
      h,
      maxW: CHAR_MAX_SPRITE_SIZE,
      maxH: CHAR_MAX_SPRITE_SIZE,
      defaultFps: 8,
      isDefault: false,
    });

    const canvases = baseFrames.map((rgba) => rgbaToCanvas(rgba, w, h));
    this.atlas.setAssetCanvases(key, canvases, 8, true);

    this._populateAssetSelect();
    this.loadAsset(key);
    await this._saveCurrentSpriteToServer();
    this.onAtlasUpdated?.();
  }

  _populateAssetSelect() {
    if (!this.assetSelect) return;
    const allGroups = {
      characters: 'Personajes (Animados · máx 32×32px)',
      weapons: 'Armas y Vidas',
      obstacles: 'Obstáculos 3/4',
      groundTiles: 'Fondos / Losetas del Descampado',
      misc: 'Otros',
    };
    const groups =
      this.mode === 'characters'
        ? { characters: allGroups.characters }
        : allGroups;

    this.assetSelect.innerHTML = '';
    for (const [catKey, label] of Object.entries(groups)) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = label;
      for (const a of this.atlas.assets.filter((x) => x.category === catKey)) {
        const opt = document.createElement('option');
        opt.value = a.key;
        opt.textContent = `${a.name} (${a.w}×${a.h})${a.isDefault ? '' : ' ★'}`;
        optGroup.appendChild(opt);
      }
      this.assetSelect.appendChild(optGroup);
    }

    const brandEl = document.querySelector('.ed-brand');
    if (brandEl) {
      if (this.mode === 'characters') {
        brandEl.textContent = 'EDITOR DE PERSONAJE';
      } else {
        const tName = this.atlas.serverCatalog?.themes?.[this.previewTheme]?.config?.name || this.previewTheme;
        brandEl.textContent = `SPRITE STUDIO · ${tName}`;
      }
    }
    const resetAllBtn = document.getElementById('ed-btn-reset-all');
    if (resetAllBtn) {
      resetAllBtn.classList.toggle('hidden', this.mode === 'characters');
    }

    const currentValid =
      this.atlas.getAssetMeta(this.currentAssetKey) &&
      (this.mode !== 'characters' || this.currentAssetKey.startsWith('char:'));
    if (currentValid) {
      this.assetSelect.value = this.currentAssetKey;
    }
  }

  _initDOM() {
    this.modal = document.getElementById('editor-overlay');
    if (!this.modal) return;

    this.assetSelect = document.getElementById('ed-asset-select');
    this.inputW = document.getElementById('ed-width');
    this.inputH = document.getElementById('ed-height');
    this.btnResize = document.getElementById('ed-btn-resize');

    this.workCanvas = document.getElementById('ed-work-canvas');
    this.workCtx = this.workCanvas.getContext('2d');
    this.workCtx.imageSmoothingEnabled = false;

    this.previewCanvas = document.getElementById('ed-preview-canvas');
    this.previewCtx = this.previewCanvas.getContext('2d');
    this.previewCtx.imageSmoothingEnabled = false;

    this.framesListEl = document.getElementById('ed-frames-list');
    this.paletteEl = document.getElementById('ed-palette');
    this.colorInput = document.getElementById('ed-color-picker');
    this.colorHexEl = document.getElementById('ed-color-hex');
    this.coordsEl = document.getElementById('ed-coords');
    this.statusEl = document.getElementById('ed-status');
    this.fpsSlider = document.getElementById('ed-fps');
    this.fpsValEl = document.getElementById('ed-fps-val');
    this.pngInput = document.getElementById('ed-png-input');

    // Populate asset selector grouped by category
    this._populateAssetSelect();

    this.assetSelect.addEventListener('change', async () => {
      if (this.dirty) {
        this._commitCurrentToAtlas();
        await this._saveCurrentSpriteToServer();
      }
      this.loadAsset(this.assetSelect.value);
    });

    document.getElementById('ed-btn-new-char')?.addEventListener('click', () => {
      this.createNewCustomCharacter();
    });

    // Populate the landscape and character palette swatches
    this._renderPaletteSwatches();

    this.colorInput.addEventListener('input', () => {
      this.setPrimaryColor(this.colorInput.value);
    });

    // Tool buttons
    document.querySelectorAll('[data-ed-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setTool(btn.getAttribute('data-ed-tool'));
      });
    });

    // Brush size buttons
    document.querySelectorAll('[data-ed-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.brushSize = Number(btn.getAttribute('data-ed-size')) || 1;
        document.querySelectorAll('[data-ed-size]').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
      });
    });

    // Shape fill toggle
    const btnFillShape = document.getElementById('ed-btn-shape-fill');
    btnFillShape?.addEventListener('click', () => {
      this.shapeFilled = !this.shapeFilled;
      btnFillShape.classList.toggle('active', this.shapeFilled);
      btnFillShape.textContent = this.shapeFilled ? 'Relleno: SÍ' : 'Relleno: NO';
    });

    // View toggles
    const btnGrid = document.getElementById('ed-btn-grid');
    btnGrid?.addEventListener('click', () => {
      this.showGrid = !this.showGrid;
      btnGrid.classList.toggle('active', this.showGrid);
      this.renderWorkCanvas();
    });

    const btnOnion = document.getElementById('ed-btn-onion');
    btnOnion?.addEventListener('click', () => {
      this.showOnion = !this.showOnion;
      btnOnion.classList.toggle('active', this.showOnion);
      this.renderWorkCanvas();
    });

    const btnBg = document.getElementById('ed-btn-bg');
    btnBg?.addEventListener('click', () => {
      this.bgSoil = !this.bgSoil;
      btnBg.classList.toggle('active', this.bgSoil);
      btnBg.textContent = this.bgSoil ? 'Fondo: Tierra' : 'Fondo: Damero';
      this.renderWorkCanvas();
    });

    const btnFlipPrev = document.getElementById('ed-btn-preview-flip');
    btnFlipPrev?.addEventListener('click', () => {
      this.previewFlip = !this.previewFlip;
      btnFlipPrev.classList.toggle('active', this.previewFlip);
    });

    // Transform buttons
    document.getElementById('ed-btn-fliph')?.addEventListener('click', () => this.flipH());
    document.getElementById('ed-btn-flipv')?.addEventListener('click', () => this.flipV());
    document.getElementById('ed-btn-rot')?.addEventListener('click', () => this.rotate90());
    document.getElementById('ed-btn-clear')?.addEventListener('click', () => this.clearFrame());
    document.getElementById('ed-btn-quantize')?.addEventListener('click', () => this.quantizeCurrentToPalette());
    document.getElementById('ed-btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('ed-btn-redo')?.addEventListener('click', () => this.redo());

    // Frame management
    document.getElementById('ed-btn-add-frame')?.addEventListener('click', () => this.addFrame());
    document.getElementById('ed-btn-dup-frame')?.addEventListener('click', () => this.duplicateFrame());

    // Resize
    this.btnResize?.addEventListener('click', () => {
      const nw = Number(this.inputW.value) || this.w;
      const nh = Number(this.inputH.value) || this.h;
      this.resizeSprite(nw, nh);
    });

    // FPS slider
    this.fpsSlider?.addEventListener('input', () => {
      this.fps = Number(this.fpsSlider.value) || 8;
      this.fpsValEl.textContent = `${this.fps} FPS`;
      this.dirty = true;
      this._commitCurrentToAtlas();
    });

    // PNG import / export
    document.getElementById('ed-btn-import-png')?.addEventListener('click', () => {
      this.pngInput.value = '';
      this.pngInput.click();
    });

    this.pngInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.importPngFile(file);
    });

    // Drag and drop PNG onto editor
    this.modal.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    this.modal.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type === 'image/png') {
        this.importPngFile(file);
      }
    });

    document.getElementById('ed-btn-export-png')?.addEventListener('click', () => this.exportFramePng());
    document.getElementById('ed-btn-export-sheet')?.addEventListener('click', () => this.exportSpritesheetPng());

    // Reset & Save/Close
    document.getElementById('ed-btn-reset-asset')?.addEventListener('click', () => {
      this._restoreCurrentFromServerDefault();
    });

    document.getElementById('ed-btn-reset-all')?.addEventListener('click', () => {
      this._restoreAllFromServerDefaults();
    });

    document.getElementById('ed-btn-save')?.addEventListener('click', async () => {
      this._commitCurrentToAtlas();
      const isThemeAsset = this.mode === 'all' && !this.currentAssetKey.startsWith('char:');
      if (isThemeAsset && this.onRequestThemeSave) {
        this.onRequestThemeSave(this);
        return;
      }
      await this._saveCurrentSpriteToServer();
      this.onAtlasUpdated?.();
    });

    document.getElementById('ed-btn-close')?.addEventListener('click', () => {
      this.close();
    });

    // Work canvas mouse interaction
    this._bindCanvasEvents();

    // Keyboard shortcuts inside editor
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (document.activeElement?.tagName === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }

      const k = e.key.toLowerCase();
      if (k === 'p') this.setTool('pen');
      else if (k === 'v') this.setTool('mirror');
      else if (k === 'e') this.setTool('eraser');
      else if (k === 'b') this.setTool('bucket');
      else if (k === 'a') this.setTool('replace');
      else if (k === 'l') this.setTool('line');
      else if (k === 'r') this.setTool('rect');
      else if (k === 'c') this.setTool('ellipse');
      else if (k === 'm') this.setTool('move');
      else if (k === 'o') this.setTool('picker');
      else if (k === 'g') {
        this.showGrid = !this.showGrid;
        document.getElementById('ed-btn-grid')?.classList.toggle('active', this.showGrid);
        this.renderWorkCanvas();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  _setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  _renderPaletteSwatches() {
    if (!this.paletteEl) return;
    this.paletteEl.innerHTML = '';
    for (const hex of PALETTE_LIST) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = `ed-swatch${hex.toLowerCase() === this.primaryColor.toLowerCase() ? ' active' : ''}`;
      sw.style.backgroundColor = hex;
      sw.title = hex;
      sw.addEventListener('click', () => this.setPrimaryColor(hex));
      this.paletteEl.appendChild(sw);
    }
  }

  setPrimaryColor(hex) {
    this.primaryColor = hex;
    this.primaryRgba = hexToRgba(hex);
    if (this.colorInput) this.colorInput.value = hex.slice(0, 7);
    if (this.colorHexEl) this.colorHexEl.textContent = hex.toUpperCase();
    this._renderPaletteSwatches();
  }

  setTool(toolName) {
    this.tool = toolName;
    document.querySelectorAll('[data-ed-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-ed-tool') === toolName);
    });
  }

  async open(initialAssetKey = null, mode = 'all', previewTheme = 'campo') {
    if (!this.modal) return;
    this.mode = mode === 'characters' ? 'characters' : 'all';
    this.previewTheme = previewTheme || 'campo';
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    await this.atlas.applyTheme(this.previewTheme);
    if (initialAssetKey) this.currentAssetKey = initialAssetKey;
    if (this.mode === 'characters' && !this.currentAssetKey.startsWith('char:')) {
      this.currentAssetKey = 'char:0';
    }
    this._populateAssetSelect();
    this.assetSelect.value = this.currentAssetKey;
    this.loadAsset(this.currentAssetKey);
  }

  async close() {
    if (!this.isOpen) return;
    if (this.dirty) {
      this._commitCurrentToAtlas();
      await this._saveCurrentSpriteToServer();
      this.onAtlasUpdated?.();
    }
    this.isOpen = false;
    this.modal.classList.add('hidden');
  }

  loadAsset(assetKey) {
    const meta = this.atlas.getAssetMeta(assetKey) || this.atlas.assets[0];
    this.currentAssetKey = meta.key;
    this.assetSelect.value = meta.key;

    const { frames: canvases, fps } = this.atlas.getAssetCanvases(meta.key);
    this.fps = fps || meta.defaultFps || 8;
    if (this.fpsSlider) this.fpsSlider.value = String(this.fps);
    if (this.fpsValEl) this.fpsValEl.textContent = `${this.fps} FPS`;

    if (canvases.length > 0) {
      this.w = canvases[0].width;
      this.h = canvases[0].height;
      this.frames = canvases.map(canvasToRgba);
    } else {
      this.w = meta.w;
      this.h = meta.h;
      this.frames = [new Uint8ClampedArray(this.w * this.h * 4)];
    }

    this.inputW.value = String(this.w);
    this.inputH.value = String(this.h);
    this.inputW.max = String(meta.maxW);
    this.inputH.max = String(meta.maxH);

    this.currentFrameIdx = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;

    this._renderFramesList();
    this.renderWorkCanvas();
    this._setStatus(`Editando ${meta.name} (${this.w}×${this.h}px, máx ${meta.maxW}×${meta.maxH}px)`);
  }

  _commitCurrentToAtlas() {
    if (!this.frames || this.frames.length === 0) return;
    const canvases = this.frames.map((rgba) => rgbaToCanvas(rgba, this.w, this.h));
    this.atlas.setAssetCanvases(this.currentAssetKey, canvases, this.fps, true);
  }

  _pushUndo() {
    this.dirty = true;
    const snapshot = {
      w: this.w,
      h: this.h,
      frameIdx: this.currentFrameIdx,
      frames: this.frames.map((f) => new Uint8ClampedArray(f)),
    };
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push({
      w: this.w,
      h: this.h,
      frameIdx: this.currentFrameIdx,
      frames: this.frames.map((f) => new Uint8ClampedArray(f)),
    });
    const prev = this.undoStack.pop();
    this.w = prev.w;
    this.h = prev.h;
    this.inputW.value = String(this.w);
    this.inputH.value = String(this.h);
    this.frames = prev.frames;
    this.currentFrameIdx = Math.min(prev.frameIdx, this.frames.length - 1);
    this._commitCurrentToAtlas();
    this._renderFramesList();
    this.renderWorkCanvas();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push({
      w: this.w,
      h: this.h,
      frameIdx: this.currentFrameIdx,
      frames: this.frames.map((f) => new Uint8ClampedArray(f)),
    });
    const next = this.redoStack.pop();
    this.w = next.w;
    this.h = next.h;
    this.inputW.value = String(this.w);
    this.inputH.value = String(this.h);
    this.frames = next.frames;
    this.currentFrameIdx = Math.min(next.frameIdx, this.frames.length - 1);
    this._commitCurrentToAtlas();
    this._renderFramesList();
    this.renderWorkCanvas();
  }

  // Frame management
  addFrame() {
    this._pushUndo();
    const blank = new Uint8ClampedArray(this.w * this.h * 4);
    this.frames.splice(this.currentFrameIdx + 1, 0, blank);
    this.currentFrameIdx++;
    this._commitCurrentToAtlas();
    this._renderFramesList();
    this.renderWorkCanvas();
  }

  duplicateFrame() {
    this._pushUndo();
    const copy = new Uint8ClampedArray(this.frames[this.currentFrameIdx]);
    this.frames.splice(this.currentFrameIdx + 1, 0, copy);
    this.currentFrameIdx++;
    this._commitCurrentToAtlas();
    this._renderFramesList();
    this.renderWorkCanvas();
  }

  deleteFrame(idx) {
    if (this.frames.length <= 1) return;
    this._pushUndo();
    this.frames.splice(idx, 1);
    if (this.currentFrameIdx >= this.frames.length) {
      this.currentFrameIdx = this.frames.length - 1;
    }
    this._commitCurrentToAtlas();
    this._renderFramesList();
    this.renderWorkCanvas();
  }

  moveFrame(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= this.frames.length) return;
    this._pushUndo();
    const tmp = this.frames[idx];
    this.frames[idx] = this.frames[target];
    this.frames[target] = tmp;
    this.currentFrameIdx = target;
    this._commitCurrentToAtlas();
    this._renderFramesList();
    this.renderWorkCanvas();
  }

  resizeSprite(newW, newH) {
    const meta = this.atlas.getAssetMeta(this.currentAssetKey);
    const maxW = meta ? meta.maxW : 64;
    const maxH = meta ? meta.maxH : 64;
    const nw = Math.max(4, Math.min(maxW, Math.round(newW)));
    const nh = Math.max(4, Math.min(maxH, Math.round(newH)));
    this.inputW.value = String(nw);
    this.inputH.value = String(nh);
    if (nw === this.w && nh === this.h) return;

    this._pushUndo();
    const ox = Math.floor((nw - this.w) / 2);
    const oy = nh - this.h; // Anchor bottom edge for 3/4 perspective characters & objects

    this.frames = this.frames.map((oldRgba) => {
      const next = new Uint8ClampedArray(nw * nh * 4);
      for (let y = 0; y < this.h; y++) {
        const ny = y + oy;
        if (ny < 0 || ny >= nh) continue;
        for (let x = 0; x < this.w; x++) {
          const nx = x + ox;
          if (nx < 0 || nx >= nw) continue;
          const srcOff = (y * this.w + x) * 4;
          const dstOff = (ny * nw + nx) * 4;
          next[dstOff] = oldRgba[srcOff];
          next[dstOff + 1] = oldRgba[srcOff + 1];
          next[dstOff + 2] = oldRgba[srcOff + 2];
          next[dstOff + 3] = oldRgba[srcOff + 3];
        }
      }
      return next;
    });

    this.w = nw;
    this.h = nh;
    this._commitCurrentToAtlas();
    this._renderFramesList();
    this.renderWorkCanvas();
    this._setStatus(`Redimensionado a ${nw}×${nh}px.`);
  }

  _renderFramesList() {
    if (!this.framesListEl) return;
    this.framesListEl.innerHTML = '';
    const isChar = this.currentAssetKey.startsWith('char:');
    const charLabels = ['Idle 1', 'Idle 2', 'Correr 1', 'Correr 2'];

    this.frames.forEach((rgba, idx) => {
      const card = document.createElement('div');
      card.className = `ed-frame-card${idx === this.currentFrameIdx ? ' active' : ''}`;

      const thumb = rgbaToCanvas(rgba, this.w, this.h);
      thumb.className = 'ed-frame-thumb';
      card.appendChild(thumb);

      const info = document.createElement('div');
      info.className = 'ed-frame-info';
      const lbl = document.createElement('span');
      lbl.className = 'ed-frame-title';
      lbl.textContent = isChar && idx < 4 ? `#${idx + 1} ${charLabels[idx]}` : `Fotograma #${idx + 1}`;
      info.appendChild(lbl);

      const btns = document.createElement('div');
      btns.className = 'ed-frame-btns';

      const bUp = document.createElement('button');
      bUp.type = 'button';
      bUp.textContent = '▲';
      bUp.title = 'Subir';
      bUp.disabled = idx === 0;
      bUp.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveFrame(idx, -1);
      });

      const bDn = document.createElement('button');
      bDn.type = 'button';
      bDn.textContent = '▼';
      bDn.title = 'Bajar';
      bDn.disabled = idx === this.frames.length - 1;
      bDn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveFrame(idx, 1);
      });

      const bDel = document.createElement('button');
      bDel.type = 'button';
      bDel.textContent = '✕';
      bDel.title = 'Eliminar';
      bDel.disabled = this.frames.length <= 1;
      bDel.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteFrame(idx);
      });

      btns.append(bUp, bDn, bDel);
      info.appendChild(btns);
      card.appendChild(info);

      card.addEventListener('click', () => {
        this.currentFrameIdx = idx;
        this._renderFramesList();
        this.renderWorkCanvas();
      });

      this.framesListEl.appendChild(card);
    });
  }

  _updateCurrentFrameThumb() {
    const cards = this.framesListEl?.querySelectorAll('.ed-frame-card');
    const card = cards?.[this.currentFrameIdx];
    if (!card) return;
    const oldThumb = card.querySelector('.ed-frame-thumb');
    const newThumb = rgbaToCanvas(this.frames[this.currentFrameIdx], this.w, this.h);
    newThumb.className = 'ed-frame-thumb';
    if (oldThumb) card.replaceChild(newThumb, oldThumb);
  }

  // Pixel manipulation helpers
  _getPixel(rgba, x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const off = (y * this.w + x) * 4;
    return [rgba[off], rgba[off + 1], rgba[off + 2], rgba[off + 3]];
  }

  _setPixel(rgba, x, y, col) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const off = (y * this.w + x) * 4;
    rgba[off] = col[0];
    rgba[off + 1] = col[1];
    rgba[off + 2] = col[2];
    rgba[off + 3] = col[3];
  }

  _plotBrush(rgba, cx, cy, col, size, mirror = false) {
    const r = Math.floor(size / 2);
    for (let dy = -r; dy < size - r; dy++) {
      for (let dx = -r; dx < size - r; dx++) {
        const px = cx + dx;
        const py = cy + dy;
        this._setPixel(rgba, px, py, col);
        if (mirror) {
          this._setPixel(rgba, this.w - 1 - px, py, col);
        }
      }
    }
  }

  _drawLine(rgba, x0, y0, x1, y1, col, size = 1, mirror = false) {
    let cx = x0;
    let cy = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this._plotBrush(rgba, cx, cy, col, size, mirror);
      if (cx === x1 && cy === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  _drawRect(rgba, x0, y0, x1, y1, col, filled) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (filled || x === minX || x === maxX || y === minY || y === maxY) {
          this._setPixel(rgba, x, y, col);
        }
      }
    }
  }

  _drawEllipse(rgba, x0, y0, x1, y1, col, filled) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = Math.max(0.5, (maxX - minX) / 2);
    const ry = Math.max(0.5, (maxY - minY) / 2);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const nx = (x - cx) / (rx + 0.35);
        const ny = (y - cy) / (ry + 0.35);
        const d = nx * nx + ny * ny;
        if (filled) {
          if (d <= 1.0) this._setPixel(rgba, x, y, col);
        } else {
          const nxIn = (x - cx) / Math.max(0.2, rx - 0.65);
          const nyIn = (y - cy) / Math.max(0.2, ry - 0.65);
          if (d <= 1.0 && nxIn * nxIn + nyIn * nyIn >= 1.0) {
            this._setPixel(rgba, x, y, col);
          }
        }
      }
    }
  }

  _floodFill(rgba, startX, startY, fillCol) {
    const target = this._getPixel(rgba, startX, startY);
    if (colorsEqual(target, fillCol)) return;

    const visited = new Uint8Array(this.w * this.h);
    const stack = [[startX, startY]];
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const idx = y * this.w + x;
      if (visited[idx]) continue;
      const cur = this._getPixel(rgba, x, y);
      if (!colorsEqual(cur, target)) continue;

      visited[idx] = 1;
      this._setPixel(rgba, x, y, fillCol);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  _replaceColor(rgba, startX, startY, fillCol) {
    const target = this._getPixel(rgba, startX, startY);
    if (colorsEqual(target, fillCol)) return;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (colorsEqual(this._getPixel(rgba, x, y), target)) {
          this._setPixel(rgba, x, y, fillCol);
        }
      }
    }
  }

  _shiftBuffer(srcRgba, dx, dy) {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let y = 0; y < this.h; y++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.h) continue;
      for (let x = 0; x < this.w; x++) {
        const nx = x + dx;
        if (nx < 0 || nx >= this.w) continue;
        this._setPixel(out, nx, ny, this._getPixel(srcRgba, x, y));
      }
    }
    return out;
  }

  flipH() {
    this._pushUndo();
    const src = this.frames[this.currentFrameIdx];
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        this._setPixel(out, this.w - 1 - x, y, this._getPixel(src, x, y));
      }
    }
    this.frames[this.currentFrameIdx] = out;
    this._commitCurrentToAtlas();
    this._updateCurrentFrameThumb();
    this.renderWorkCanvas();
  }

  flipV() {
    this._pushUndo();
    const src = this.frames[this.currentFrameIdx];
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        this._setPixel(out, x, this.h - 1 - y, this._getPixel(src, x, y));
      }
    }
    this.frames[this.currentFrameIdx] = out;
    this._commitCurrentToAtlas();
    this._updateCurrentFrameThumb();
    this.renderWorkCanvas();
  }

  rotate90() {
    this._pushUndo();
    const src = this.frames[this.currentFrameIdx];
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    const cx = (this.w - 1) / 2;
    const cy = (this.h - 1) / 2;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const sx = Math.round(cx + (y - cy));
        const sy = Math.round(cy - (x - cx));
        if (sx >= 0 && sy >= 0 && sx < this.w && sy < this.h) {
          this._setPixel(out, x, y, this._getPixel(src, sx, sy));
        }
      }
    }
    this.frames[this.currentFrameIdx] = out;
    this._commitCurrentToAtlas();
    this._updateCurrentFrameThumb();
    this.renderWorkCanvas();
  }

  clearFrame() {
    this._pushUndo();
    this.frames[this.currentFrameIdx] = new Uint8ClampedArray(this.w * this.h * 4);
    this._commitCurrentToAtlas();
    this._updateCurrentFrameThumb();
    this.renderWorkCanvas();
  }

  quantizeCurrentToPalette() {
    this._pushUndo();
    for (let f = 0; f < this.frames.length; f++) {
      const rgba = this.frames[f];
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 40) {
          rgba[i + 3] = 0;
          continue;
        }
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        let best = PALETTE_RGBA[0];
        let bestDist = Infinity;
        for (const p of PALETTE_RGBA) {
          const dr = r - p[0];
          const dg = g - p[1];
          const db = b - p[2];
          const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
        rgba[i] = best[0];
        rgba[i + 1] = best[1];
        rgba[i + 2] = best[2];
        rgba[i + 3] = 255;
      }
    }
    this._commitCurrentToAtlas();
    this._renderFramesList();
    this.renderWorkCanvas();
    this._setStatus('Colores ajustados a la paleta ampliada del juego.');
  }

  // Mouse -> Pixel coordinate conversion on workCanvas
  _eventToPixel(e) {
    const rect = this.workCanvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(this.w - 1, Math.floor(nx * this.w))),
      y: Math.max(0, Math.min(this.h - 1, Math.floor(ny * this.h))),
    };
  }

  _bindCanvasEvents() {
    this.workCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.workCanvas.addEventListener('mousedown', (e) => {
      const pt = this._eventToPixel(e);
      const frame = this.frames[this.currentFrameIdx];

      // Alt+Click or Middle-Click picks color
      if (e.altKey || e.button === 1 || this.tool === 'picker') {
        const c = this._getPixel(frame, pt.x, pt.y);
        if (c[3] > 0) {
          this.setPrimaryColor(rgbaToHex(c[0], c[1], c[2]));
        }
        return;
      }

      this._pushUndo();
      this.isDrawing = true;
      this.dragStart = pt;
      this.lastPt = pt;
      this.strokeSnapshot = new Uint8ClampedArray(frame);

      // Right-click always erases
      const activeTool = e.button === 2 ? 'eraser' : this.tool;
      this._activeStrokeTool = activeTool;
      const drawCol = activeTool === 'eraser' ? [0, 0, 0, 0] : this.primaryRgba;

      if (activeTool === 'pen' || activeTool === 'mirror' || activeTool === 'eraser') {
        this._plotBrush(frame, pt.x, pt.y, drawCol, this.brushSize, activeTool === 'mirror');
      } else if (activeTool === 'bucket') {
        this._floodFill(frame, pt.x, pt.y, drawCol);
        this.isDrawing = false;
      } else if (activeTool === 'replace') {
        this._replaceColor(frame, pt.x, pt.y, drawCol);
        this.isDrawing = false;
      }

      this._updateCurrentFrameThumb();
      this.renderWorkCanvas();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isOpen) return;
      const rect = this.workCanvas.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (inside) {
        this.hoverPixel = this._eventToPixel(e);
        if (this.coordsEl) {
          this.coordsEl.textContent = `X:${this.hoverPixel.x} Y:${this.hoverPixel.y} · ${this.w}×${this.h}px`;
        }
      } else {
        this.hoverPixel = null;
      }

      if (!this.isDrawing) {
        if (inside) this.renderWorkCanvas();
        return;
      }

      const pt = this._eventToPixel(e);
      const frame = this.frames[this.currentFrameIdx];
      const activeTool = this._activeStrokeTool;
      const drawCol = activeTool === 'eraser' ? [0, 0, 0, 0] : this.primaryRgba;

      if (activeTool === 'pen' || activeTool === 'mirror' || activeTool === 'eraser') {
        this._drawLine(
          frame,
          this.lastPt.x,
          this.lastPt.y,
          pt.x,
          pt.y,
          drawCol,
          this.brushSize,
          activeTool === 'mirror'
        );
        this.lastPt = pt;
      } else if (activeTool === 'line') {
        frame.set(this.strokeSnapshot);
        this._drawLine(frame, this.dragStart.x, this.dragStart.y, pt.x, pt.y, drawCol, this.brushSize, false);
      } else if (activeTool === 'rect') {
        frame.set(this.strokeSnapshot);
        this._drawRect(frame, this.dragStart.x, this.dragStart.y, pt.x, pt.y, drawCol, this.shapeFilled);
      } else if (activeTool === 'ellipse') {
        frame.set(this.strokeSnapshot);
        this._drawEllipse(frame, this.dragStart.x, this.dragStart.y, pt.x, pt.y, drawCol, this.shapeFilled);
      } else if (activeTool === 'move') {
        const dx = pt.x - this.dragStart.x;
        const dy = pt.y - this.dragStart.y;
        const shifted = this._shiftBuffer(this.strokeSnapshot, dx, dy);
        frame.set(shifted);
      }

      this.renderWorkCanvas();
    });

    window.addEventListener('mouseup', () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.strokeSnapshot = null;
      this._commitCurrentToAtlas();
      this._updateCurrentFrameThumb();
      this.onAtlasUpdated?.();
      this.renderWorkCanvas();
    });
  }

  renderWorkCanvas() {
    if (!this.isOpen || !this.workCanvas) return;
    const zoom = Math.max(6, Math.floor(Math.min(384 / this.w, 384 / this.h)));
    const cw = this.w * zoom;
    const ch = this.h * zoom;

    if (this.workCanvas.width !== cw || this.workCanvas.height !== ch) {
      this.workCanvas.width = cw;
      this.workCanvas.height = ch;
    }

    const ctx = this.workCtx;
    ctx.imageSmoothingEnabled = false;

    // 1. Background (checkerboard or descampado olive-earth)
    if (this.bgSoil) {
      ctx.fillStyle = PALETTE.SOIL;
      ctx.fillRect(0, 0, cw, ch);
    } else {
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#2b2930' : '#211f26';
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
      }
    }

    // 2. Onion skin (previous frame at 28% opacity)
    if (this.showOnion && this.frames.length > 1) {
      const prevIdx = (this.currentFrameIdx - 1 + this.frames.length) % this.frames.length;
      if (prevIdx !== this.currentFrameIdx) {
        const prevCanvas = rgbaToCanvas(this.frames[prevIdx], this.w, this.h);
        ctx.globalAlpha = 0.28;
        ctx.drawImage(prevCanvas, 0, 0, this.w, this.h, 0, 0, cw, ch);
        ctx.globalAlpha = 1;
      }
    }

    // 3. Current frame pixels
    const currCanvas = rgbaToCanvas(this.frames[this.currentFrameIdx], this.w, this.h);
    ctx.drawImage(currCanvas, 0, 0, this.w, this.h, 0, 0, cw, ch);

    // 4. Symmetry axis indicator when mirror tool is active
    if (this.tool === 'mirror') {
      ctx.fillStyle = 'rgba(242, 193, 78, 0.55)';
      ctx.fillRect(Math.floor(cw / 2) - 1, 0, 2, ch);
    }

    // 5. Hover cursor outline
    if (this.hoverPixel) {
      const r = Math.floor(this.brushSize / 2);
      const bx = (this.hoverPixel.x - r) * zoom;
      const by = (this.hoverPixel.y - r) * zoom;
      const bw = this.brushSize * zoom;
      ctx.strokeStyle = PALETTE.GOLD;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bw - 1);
    }

    // 6. Crisp 1px pixel grid
    if (this.showGrid && zoom >= 8) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < this.w; x++) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, ch);
      }
      for (let y = 1; y < this.h; y++) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(cw, y * zoom + 0.5);
      }
      ctx.stroke();
    }
  }

  updatePreview(dt) {
    if (!this.isOpen || !this.previewCanvas || this.frames.length === 0) return;
    this.previewAnimTime += dt;
    const frameIdx = Math.floor(this.previewAnimTime * this.fps) % this.frames.length;

    const pctx = this.previewCtx;
    const pw = this.previewCanvas.width;
    const ph = this.previewCanvas.height;
    pctx.imageSmoothingEnabled = false;

    // Draw active theme ground tile background in preview
    const tile = this.atlas.getAnimatedCanvas('tile:0', this.atlas.groundTiles[0], this.previewAnimTime);
    for (let y = 0; y < ph; y += 32) {
      for (let x = 0; x < pw; x += 32) {
        pctx.drawImage(tile, 0, 0, tile.width, tile.height, x, y, 32, 32);
      }
    }

    const frameCanvas = rgbaToCanvas(this.frames[frameIdx], this.w, this.h);
    const scale = Math.max(2, Math.floor(Math.min((pw - 16) / this.w, (ph - 16) / this.h)));
    const dw = this.w * scale;
    const dh = this.h * scale;
    const dx = Math.floor((pw - dw) / 2);
    const dy = Math.floor((ph - dh) / 2);

    pctx.save();
    if (this.previewFlip) {
      pctx.translate(pw, 0);
      pctx.scale(-1, 1);
    }
    pctx.drawImage(frameCanvas, 0, 0, this.w, this.h, dx, dy, dw, dh);
    pctx.restore();
  }

  // PNG Import (supports both single-frame PNG and horizontal sprite-sheet strip PNG!)
  importPngFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        this._pushUndo();
        const meta = this.atlas.getAssetMeta(this.currentAssetKey);
        const maxW = meta ? meta.maxW : 64;
        const maxH = meta ? meta.maxH : 64;

        // Detect horizontal multi-frame spritesheet strip:
        // E.g. width is an exact multiple (>= 2) of current frame width & height matches current height,
        // or width is an exact multiple of img.height (square frames strip)
        let sliceCount = 1;
        let targetW = this.w;
        let targetH = this.h;

        if (img.height <= maxH && img.width > this.w && img.width % this.w === 0 && img.height === this.h) {
          sliceCount = img.width / this.w;
          targetW = this.w;
          targetH = this.h;
        } else if (img.height <= maxH && img.width > img.height && img.width % img.height === 0 && img.height <= maxW) {
          sliceCount = img.width / img.height;
          targetW = img.height;
          targetH = img.height;
        } else {
          // Single frame PNG: clamp dimensions to allowed max (e.g. 32x32 for characters)
          const ratio = Math.min(1, maxW / img.width, maxH / img.height);
          targetW = Math.max(4, Math.min(maxW, Math.round(img.width * ratio)));
          targetH = Math.max(4, Math.min(maxH, Math.round(img.height * ratio)));
        }

        if (sliceCount > 1) {
          const newFrames = [];
          const sliceW = img.width / sliceCount;
          for (let i = 0; i < sliceCount; i++) {
            const c = document.createElement('canvas');
            c.width = targetW;
            c.height = targetH;
            const cctx = c.getContext('2d');
            cctx.imageSmoothingEnabled = false;
            cctx.drawImage(img, i * sliceW, 0, sliceW, img.height, 0, 0, targetW, targetH);
            newFrames.push(canvasToRgba(c));
          }
          this.w = targetW;
          this.h = targetH;
          this.frames = newFrames;
          this.currentFrameIdx = 0;
          this._setStatus(`Spritesheet PNG importado: ${sliceCount} fotogramas de ${targetW}×${targetH}px.`);
        } else {
          // If dimensions changed and there's only 1 frame (or user imported a different size), resize canvas
          if (targetW !== this.w || targetH !== this.h) {
            this.resizeSprite(targetW, targetH);
          }
          const c = document.createElement('canvas');
          c.width = this.w;
          c.height = this.h;
          const cctx = c.getContext('2d');
          cctx.imageSmoothingEnabled = false;
          cctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, this.w, this.h);
          this.frames[this.currentFrameIdx] = canvasToRgba(c);
          this._setStatus(`PNG cargado en el fotograma #${this.currentFrameIdx + 1} (${this.w}×${this.h}px).`);
        }

        this.inputW.value = String(this.w);
        this.inputH.value = String(this.h);
        this._commitCurrentToAtlas();
        await this._saveCurrentSpriteToServer();
        this.onAtlasUpdated?.();
        this._renderFramesList();
        this.renderWorkCanvas();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  exportFramePng() {
    const c = rgbaToCanvas(this.frames[this.currentFrameIdx], this.w, this.h);
    const link = document.createElement('a');
    const cleanKey = this.currentAssetKey.replace(':', '_');
    link.download = `${cleanKey}_f${this.currentFrameIdx + 1}.png`;
    link.href = c.toDataURL('image/png');
    link.click();
  }

  exportSpritesheetPng() {
    const sheet = document.createElement('canvas');
    sheet.width = this.w * this.frames.length;
    sheet.height = this.h;
    const sctx = sheet.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    this.frames.forEach((rgba, idx) => {
      const fc = rgbaToCanvas(rgba, this.w, this.h);
      sctx.drawImage(fc, idx * this.w, 0);
    });
    const link = document.createElement('a');
    const cleanKey = this.currentAssetKey.replace(':', '_');
    link.download = `${cleanKey}_spritesheet_${this.frames.length}f.png`;
    link.href = sheet.toDataURL('image/png');
    link.click();
  }
}
