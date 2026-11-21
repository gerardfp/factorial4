// Fixed full-battlefield (640x368) pixel-perfect 3/4 perspective renderer (NO panning!)
import {
  PALETTE,
  SECANO_PALETTE,
  INDUSTRIAL_PALETTE,
  COSTA_PALETTE,
  OBRAS_PALETTE,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAP_COLS,
  MAP_ROWS,
  TILE_SIZE,
  ARENA_MIN_X,
  ARENA_MAX_X,
  ARENA_MIN_Y,
  ARENA_MAX_Y,
  CHAR_SPRITE_W,
  CHAR_SPRITE_H,
  PLAYER_MAX_HP,
  OBSTACLE_TYPES,
  BATTLE_THEMES,
} from '../shared/constants.js';
import { clamp, dist } from '../shared/collision.js';

function hashTile(seed, tx, ty) {
  let h = (seed ^ (tx * 374761393) ^ (ty * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export class PixelRenderer {
  constructor(mainCanvas, atlas) {
    this.canvas = mainCanvas;
    this.ctx = mainCanvas.getContext('2d', { alpha: false });
    this.atlas = atlas;

    // Fixed virtual battlefield framebuffer: entire 640x368 arena is always visible
    this.buf = document.createElement('canvas');
    this.buf.width = MAP_WIDTH;
    this.buf.height = MAP_HEIGHT;
    this.bctx = this.buf.getContext('2d', { alpha: false });
    this.bctx.imageSmoothingEnabled = false;

    this.drawX = 0;
    this.drawY = 0;
    this.drawW = MAP_WIDTH;
    this.drawH = MAP_HEIGHT;
    this.scale = 1;

    this.shake = 0;
    this.time = 0;

    // Visual FX pools
    this.particles = [];
    this.slashes = [];
    this.explosions = [];

    this.mapSeed = 1;
    this.tileGrid = new Uint8Array(MAP_COLS * MAP_ROWS);
    this.rebuildGround(1);
    this.resize();
  }

  rebuildGround(seed) {
    this.mapSeed = seed || 1;
    for (let ty = 0; ty < MAP_ROWS; ty++) {
      for (let tx = 0; tx < MAP_COLS; tx++) {
        const r = hashTile(this.mapSeed, tx, ty) % 100;
        let v = 0;
        if (r < 46) v = 0;
        else if (r < 68) v = 1;
        else if (r < 77) v = 2;
        else if (r < 84) v = 3;
        else if (r < 89) v = 4;
        else if (r < 93) v = 5;
        else if (r < 96) v = 6;
        else v = 7;
        this.tileGrid[ty * MAP_COLS + tx] = v;
      }
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;

    // Fit entire 640x368 battlefield cleanly inside the viewport preserving aspect ratio
    const scaleX = w / MAP_WIDTH;
    const scaleY = h / MAP_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);
    this.drawW = Math.floor(MAP_WIDTH * this.scale);
    this.drawH = Math.floor(MAP_HEIGHT * this.scale);
    this.drawX = Math.floor((w - this.drawW) / 2);
    this.drawY = Math.floor((h - this.drawH) / 2);
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const wx = (clientX - rect.left - this.drawX) / this.scale;
    const wy = (clientY - rect.top - this.drawY) / this.scale;
    return {
      x: Math.max(0, Math.min(MAP_WIDTH, wx)),
      y: Math.max(0, Math.min(MAP_HEIGHT, wy)),
    };
  }

  addShake(amount) {
    this.shake = Math.min(4, Math.max(this.shake, amount));
  }

  spawnParticles(x, y, count, colors, speedMin, speedMax, lifeMin, lifeMax, size = 1) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life,
        maxLife: life,
        color: colors[Math.floor(Math.random() * colors.length)],
        size,
      });
    }
    if (this.particles.length > 320) {
      this.particles.splice(0, this.particles.length - 320);
    }
  }

  spawnSlash(x, y, aim, range, weaponId, customColor = null) {
    const color =
      customColor ||
      (weaponId === 'axe' ? PALETTE.RUST : weaponId === 'pipe' ? PALETTE.SILVER : PALETTE.BONE);
    this.slashes.push({ x, y, aim, range, color, life: 0.13, maxLife: 0.13 });
  }

  spawnExplosion(x, y, radius) {
    this.explosions.push({ x, y, radius, life: 0.34, maxLife: 0.34 });
    this.spawnParticles(
      x,
      y - 4,
      24,
      [PALETTE.BONE, PALETTE.GOLD, PALETTE.RUST, PALETTE.CRIMSON, PALETTE.UMBER],
      20,
      95,
      0.2,
      0.5,
      2
    );
  }

  updateFX(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-5 * dt);
      p.vy *= Math.exp(-5 * dt);
    }

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      this.slashes[i].life -= dt;
      if (this.slashes[i].life <= 0) this.slashes.splice(i, 1);
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].life -= dt;
      if (this.explosions[i].life <= 0) this.explosions.splice(i, 1);
    }
  }

  render(world, mouseScreen, dt) {
    this.updateFX(dt);

    const ctx = this.bctx;
    ctx.imageSmoothingEnabled = false;

    // 1. Entire descampado ground tiles (resolved from base + theme overrides + custom PNGs)
    const activeTheme = world.theme || 'campo';
    const themeEntry = this.atlas.serverCatalog?.themes?.[activeTheme] || null;
    const themeSpec =
      themeEntry?.config ||
      BATTLE_THEMES[activeTheme] ||
      BATTLE_THEMES.campo;
    const baseThemeId = themeEntry?.baseTheme || themeSpec.baseTheme || world.baseTheme || activeTheme;
    for (let ty = 0; ty < MAP_ROWS; ty++) {
      const py = ty * TILE_SIZE;
      for (let tx = 0; tx < MAP_COLS; tx++) {
        const px = tx * TILE_SIZE;
        const v = this.tileGrid[ty * MAP_COLS + tx];
        const tileSpr = this.atlas.getAnimatedCanvas(`tile:${v}`, this.atlas.groundTiles[v], this.time);
        ctx.drawImage(tileSpr, px, py);
      }
    }

    if (baseThemeId === 'secano') this._drawSecanoTracks(ctx);
    if (baseThemeId === 'industrial') this._drawIndustrialYard(ctx);
    if (baseThemeId === 'costa') this._drawCoastalPaths(ctx);
    if (baseThemeId === 'obras') this._drawConstructionGround(ctx, world);

    // Subtle 3/4 perimeter border matching theme
    ctx.fillStyle = themeSpec.borderColor;
    ctx.fillRect(0, 0, MAP_WIDTH, 4);
    ctx.fillRect(0, MAP_HEIGHT - 3, MAP_WIDTH, 3);
    ctx.fillRect(0, 0, 3, MAP_HEIGHT);
    ctx.fillRect(MAP_WIDTH - 3, 0, 3, MAP_HEIGHT);
    ctx.fillStyle = themeSpec.accentColor;
    ctx.fillRect(3, 4, MAP_WIDTH - 6, 1);

    // 2. Corpses (lineless skull markers; label local player's skull if eliminated)
    const skullSpr = this.atlas.getAnimatedCanvas('misc:skull', this.atlas.misc.skull, this.time);
    for (let i = 0; i < world.corpses.length; i++) {
      const cp = world.corpses[i];
      ctx.fillStyle = PALETTE.CRIMSON;
      ctx.fillRect(cp.x - 4, cp.y - 1, 8, 2);
      ctx.drawImage(skullSpr, cp.x - Math.floor(skullSpr.width / 2), cp.y - skullSpr.height + 3);
      if (cp.isMe && cp.name) {
        this._drawPixelTag(ctx, cp.x, cp.y - skullSpr.height - 1, `${cp.name} 0`, PALETTE.CRIMSON, null);
      }
    }

    // 3. Fire puddles (Molotov flames in 3/4 flattened oval perspective)
    for (let i = 0; i < world.fires.length; i++) {
      const f = world.fires[i];
      this._drawFirePuddle(ctx, f.x, f.y, f.r, f.id);
    }

    // 4. Ground Loot (weapons + medkits, no power/ammo bar underneath)
    const localPlayer = world.players.get(world.myId);

    for (const item of world.loot.values()) {
      const bob = Math.round(Math.sin(this.time * 4.5 + item.id) * 0.8);
      const sprKey = item.kind === 'medkit' ? 'medkit' : item.weaponId;
      const baseSpr = this.atlas.weapons[sprKey];
      const spr = this.atlas.getAnimatedCanvas(`weapon:${sprKey}`, baseSpr, this.time);
      if (spr) {
        ctx.drawImage(spr, item.x - Math.floor(spr.width / 2), item.y - spr.height + 4 + bob);
      }
    }

    // Find current kill leader (if >= 2 kills)
    let leaderId = null;
    let topKills = 1;
    for (const p of world.players.values()) {
      if (p.alive && p.kills > topKills) {
        topKills = p.kills;
        leaderId = p.id;
      }
    }

    // 5. Y-Sorted 3/4 Perspective Entities (sorted by ground footprint bottom Y!)
    const drawList = [];
    const viewer = localPlayer && localPlayer.alive ? localPlayer : null;

    for (const o of world.obstacles.values()) {
      if (!o.alive) continue;
      drawList.push({ ySort: o.y + o.h, kind: 'obs', obj: o });
    }

    for (const p of world.players.values()) {
      if (!p.alive) continue;
      // Bush stealth: remote fighters hidden inside bushes vanish unless close or firing
      if (p.inBush && p.id !== world.myId && !p.revealed) {
        if (viewer && dist(viewer.rx, viewer.ry, p.rx, p.ry) > 44) {
          continue;
        }
      }
      drawList.push({ ySort: p.ry, kind: 'player', obj: p });
    }

    drawList.sort((a, b) => a.ySort - b.ySort);

    for (let i = 0; i < drawList.length; i++) {
      const entry = drawList[i];
      if (entry.kind === 'obs') {
        this._drawObstacle(ctx, entry.obj, viewer, world.obstacleTypes);
      } else {
        this._drawPlayer(
          ctx,
          entry.obj,
          entry.obj.id === world.myId,
          entry.obj.id === leaderId
        );
      }
    }

    // 6. Melee slash arcs (at torso height)
    for (let i = 0; i < this.slashes.length; i++) {
      const s = this.slashes[i];
      const prog = 1 - s.life / s.maxLife;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, Math.round(2.5 * (1 - prog)));
      ctx.beginPath();
      ctx.arc(Math.round(s.x), Math.round(s.y), s.range * 0.78, s.aim - 0.85, s.aim + 0.85);
      ctx.stroke();
    }

    // 7. Projectiles (flying at torso height with tiny ground shadow!)
    for (let i = 0; i < world.projectiles.length; i++) {
      this._drawProjectile(ctx, world.projectiles[i], world.weapons);
    }

    // 8. Explosions & Particles
    for (let i = 0; i < this.explosions.length; i++) {
      const ex = this.explosions[i];
      const prog = 1 - ex.life / ex.maxLife;
      const r = Math.round(ex.radius * (0.3 + prog * 0.75));
      ctx.strokeStyle = prog < 0.35 ? PALETTE.BONE : prog < 0.65 ? PALETTE.GOLD : PALETTE.RUST;
      ctx.lineWidth = Math.max(1, Math.round(3.5 * (1 - prog)));
      ctx.beginPath();
      ctx.arc(Math.round(ex.x), Math.round(ex.y - 4), r, 0, Math.PI * 2);
      ctx.stroke();
      if (prog < 0.4) {
        ctx.fillStyle = prog < 0.2 ? PALETTE.BONE : PALETTE.GOLD;
        const s = Math.round(r * 0.55);
        ctx.fillRect(Math.round(ex.x - s / 2), Math.round(ex.y - 4 - s / 2), s, s);
      }
    }

    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    }

    // 9. Crisp lineless pixel crosshair
    if (localPlayer && localPlayer.alive && mouseScreen) {
      const wm = this.screenToWorld(mouseScreen.x, mouseScreen.y);
      const cx = Math.round(wm.x);
      const cy = Math.round(wm.y);
      ctx.fillStyle = PALETTE.BONE;
      ctx.fillRect(cx - 4, cy, 3, 1);
      ctx.fillRect(cx + 2, cy, 3, 1);
      ctx.fillRect(cx, cy - 4, 1, 3);
      ctx.fillRect(cx, cy + 2, 1, 3);
      ctx.fillStyle = PALETTE.CRIMSON;
      ctx.fillRect(cx, cy, 1, 1);
    }

    // 10. Battle Start Notice ("¡Preparados!" -> "¡A luchar!")
    if (world.bannerText) {
      this._drawCenterAnnouncement(ctx, world.bannerText);
    }

    // Blit full 640x368 battlefield centered & scaled crisply to viewport (no panning!)
    const shakeX = this.shake > 0.15 ? Math.round((Math.random() - 0.5) * this.shake * 2 * this.scale) : 0;
    const shakeY = this.shake > 0.15 ? Math.round((Math.random() - 0.5) * this.shake * 2 * this.scale) : 0;

    this.ctx.fillStyle = PALETTE.INK;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(
      this.buf,
      0,
      0,
      MAP_WIDTH,
      MAP_HEIGHT,
      this.drawX + shakeX,
      this.drawY + shakeY,
      this.drawW,
      this.drawH
    );
  }

  _drawConstructionGround(ctx, world) {
    const C = OBRAS_PALETTE;
    const bend = this.mapSeed % 13;
    // Broad compacted access lane with paired heavy-vehicle tread marks.
    for (let x = 4; x < MAP_WIDTH - 4; x++) {
      const y = Math.round(64 + x * 0.32 + Math.sin(x / 93) * (17 + bend));
      ctx.fillStyle = C.EARTH_DARK;
      ctx.fillRect(x, y - 13, 1, 27);
      ctx.fillStyle = C.DUST;
      ctx.fillRect(x, y - 11, 1, 23);
      for (const offset of [-8, 8]) {
        ctx.fillStyle = C.MUD;
        ctx.fillRect(x, y + offset - 2, 1, 4);
        if (x % 5 < 2) {
          ctx.fillStyle = C.MUD_DARK;
          ctx.fillRect(x, y + offset - 2, 1, 4);
        }
        if (hashTile(this.mapSeed, x, y) % 4 === 0) {
          ctx.fillStyle = C.EARTH_LIGHT;
          ctx.fillRect(x, y + offset, 1, 1);
        }
      }
    }

    for (const o of world.obstacles.values()) {
      if (!o.alive) continue;
      if (o.type === 'scaffold' || o.type === 'site_office') {
        const x = o.x - 5;
        const y = o.y - 4;
        const w = o.w + 10;
        const h = o.h + 9;
        ctx.fillStyle = C.CONCRETE_DARK;
        ctx.fillRect(x + 1, y + 1, w, h);
        ctx.fillStyle = C.CONCRETE;
        ctx.fillRect(x, y, w, h - 1);
        ctx.fillStyle = C.CONCRETE_SHADE;
        ctx.fillRect(x + Math.round(w / 2), y, 1, h - 1);
        ctx.fillRect(x, y + Math.round(h / 2), w, 1);
        ctx.fillStyle = C.CONCRETE_LIGHT;
        ctx.fillRect(x, y, w, 1);
        for (let i = 0; i < w; i += 3) {
          const hash = hashTile(this.mapSeed, o.id + i, o.y);
          ctx.fillStyle = hash % 2 ? C.CONCRETE_SHADE : C.CONCRETE_LIGHT;
          ctx.fillRect(x + i, y + hash % (h - 2), 1, 1);
        }
      }
      if (o.type === 'mixer' || o.type === 'pipes') {
        ctx.fillStyle = C.WET;
        ctx.fillRect(o.x - 3, o.y + o.h - 3, o.w + 7, 6);
        ctx.fillRect(o.x + 2, o.y + o.h + 3, o.w - 4, 2);
        ctx.fillStyle = C.WATER;
        ctx.fillRect(o.x + 4, o.y + o.h + 1, Math.round(o.w / 3), 1);
      }
    }
  }

  _drawCoastalPaths(ctx) {
    const C = COSTA_PALETTE;
    const bend = this.mapSeed % 17;
    for (let x = 4; x < MAP_WIDTH - 4; x++) {
      const y = Math.round(MAP_HEIGHT - 48 - x * 0.36 + Math.sin(x / 88) * (16 + bend));
      ctx.fillStyle = C.PATH_EDGE;
      ctx.fillRect(x, y - 8, 1, 17);
      ctx.fillStyle = C.PATH;
      ctx.fillRect(x, y - 7, 1, 14);
      if (hashTile(this.mapSeed, x, y) % 3 === 0) {
        ctx.fillStyle = C.PATH_LIGHT;
        ctx.fillRect(x, y - 4, 1, 2);
        ctx.fillRect(x, y + 4, 1, 1);
      }
      if (x % 8 < 3) {
        ctx.fillStyle = C.SAND;
        ctx.fillRect(x, y - 8, 1, 2);
        ctx.fillRect(x, y + 6, 1, 2);
      }
    }
  }

  _drawIndustrialYard(ctx) {
    const C = INDUSTRIAL_PALETTE;
    const aprons = [
      { x: 4, y: MAP_HEIGHT - 66, w: 226, h: 62 },
      { x: MAP_WIDTH - 232, y: 5, w: 228, h: 67 },
    ];
    for (const area of aprons) {
      ctx.fillStyle = C.ASPHALT;
      ctx.fillRect(area.x, area.y, area.w, area.h);
      for (let x = area.x; x < area.x + area.w; x += 4) {
        const edge = hashTile(this.mapSeed, x, area.y) % 5;
        ctx.fillStyle = C.GROUND;
        ctx.fillRect(x, area.y + area.h - edge, 4, edge);
      }
      for (let y = area.y + 3; y < area.y + area.h - 3; y += 4) {
        for (let x = area.x + 2; x < area.x + area.w - 2; x += 4) {
          const hash = hashTile(this.mapSeed, x, y);
          ctx.fillStyle = hash % 3 ? C.ASPHALT_LIGHT : C.OIL;
          ctx.fillRect(x + hash % 3, y, 1, 1);
        }
      }
      ctx.fillStyle = C.HAZARD;
      for (let x = area.x + 15; x < area.x + area.w - 12; x += 38) {
        ctx.fillRect(x, area.y + 10, 1, 27);
        ctx.fillRect(x, area.y + 36, 25, 1);
        ctx.fillRect(x + 24, area.y + 25, 1, 11);
        // Worn sections in the loading bay paint.
        ctx.fillStyle = C.ASPHALT;
        ctx.fillRect(x, area.y + 20, 1, 3);
        ctx.fillRect(x + 12, area.y + 36, 3, 1);
        ctx.fillStyle = C.HAZARD;
      }
      // Drainage grate in the vehicle apron.
      ctx.fillStyle = C.OIL;
      ctx.fillRect(area.x + area.w - 26, area.y + 46, 17, 8);
      ctx.fillStyle = C.STEEL;
      for (let x = area.x + area.w - 25; x < area.x + area.w - 10; x += 3) {
        ctx.fillRect(x, area.y + 47, 1, 6);
      }
    }
  }

  _drawSecanoTracks(ctx) {
    const C = SECANO_PALETTE;
    const bend = (this.mapSeed % 21) - 10;
    // Integer steps keep the winding dirt lane crisp on the virtual pixel grid.
    for (let x = 4; x < MAP_WIDTH - 4; x++) {
      const y = Math.round(MAP_HEIGHT - 35 - x * 0.45 + Math.sin(x / 83) * (18 + bend));
      ctx.fillStyle = C.DUST;
      ctx.fillRect(x, y - 8, 1, 17);
      for (const offset of [-5, 5]) {
        ctx.fillStyle = C.TRACK_EDGE;
        ctx.fillRect(x, y + offset - 2, 1, 5);
        ctx.fillStyle = C.TRACK;
        ctx.fillRect(x, y + offset - 1, 1, 2);
        if (hashTile(this.mapSeed, x, offset) % 5 === 0) {
          ctx.fillStyle = C.DUST_LIGHT;
          ctx.fillRect(x, y + offset, 1, 1);
        }
      }
    }
  }

  _drawObstacle(ctx, o, viewer, obstacleTypes = null) {
    const spec = obstacleTypes?.[o.type] || OBSTACLE_TYPES[o.type];
    let key = o.type;
    if (o.hp < o.maxHp * 0.58 && this.atlas.obstacles[`${o.type}_dmg`]) {
      key = `${o.type}_dmg`;
    }
    const baseSpr = this.atlas.obstacles[key] || this.atlas.obstacles.rock;
    const spr = this.atlas.getAnimatedCanvas(`obs:${key}`, baseSpr, this.time);
    if (!spr) return;

    // Anchor 3/4 sprite bottom to collision footprint bottom so upper volume rises in perspective
    const dx = Math.round(o.x - Math.floor((spr.width - o.w) / 2));
    const dy = Math.round(o.y + o.h - spr.height + 2);

    let translucent = false;
    if ((spec?.stealth || o.type === 'bush') && viewer && viewer.alive) {
      if (viewer.rx >= o.x - 3 && viewer.rx <= o.x + o.w + 3 && viewer.ry >= o.y - 3 && viewer.ry <= o.y + o.h + 3) {
        translucent = true;
      }
    }

    if (translucent) ctx.globalAlpha = 0.5;
    ctx.drawImage(spr, dx, dy);
    if (translucent) ctx.globalAlpha = 1;
  }

  _drawPlayer(ctx, p, isSelf, isLeader) {
    const px = Math.round(clamp(p.rx, ARENA_MIN_X, ARENA_MAX_X));
    const py = Math.round(clamp(p.ry, ARENA_MIN_Y, ARENA_MAX_Y)); // Feet position strictly inside arena

    const skinBank =
      this.atlas.playerCustomChars.get(p.id) ||
      this.atlas.characters[p.skin] ||
      this.atlas.characters[0];
    const frames = skinBank.frames;
    const fps = skinBank.fps || 8;
    let frameIdx = 0;

    if (p.moving || p.dashing) {
      if (frames.length > 2) {
        const runCount = frames.length - 2;
        frameIdx = 2 + (Math.floor(this.time * (fps * 1.25) + p.id) % runCount);
      } else {
        frameIdx = Math.floor(this.time * fps + p.id) % frames.length;
      }
    } else {
      const idleCount = Math.min(2, frames.length);
      frameIdx = Math.floor(this.time * 2.4 + p.id) % idleCount;
    }

    const spr = p.hurtFlash ? skinBank.flash : frames[frameIdx] || frames[0];
    const sw = spr.width || CHAR_SPRITE_W;
    const sh = spr.height || CHAR_SPRITE_H;
    const facingLeft = Math.cos(p.aim) < 0;

    // Subtle ground highlight under local player
    if (isSelf) {
      ctx.fillStyle = PALETTE.GOLD;
      ctx.fillRect(px - 4, py + 1, 8, 1);
      ctx.fillRect(px - 5, py, 2, 1);
      ctx.fillRect(px + 3, py, 2, 1);
    }

    if (p.dashing) {
      ctx.globalAlpha = 0.4;
      ctx.drawImage(
        skinBank.flash,
        px - Math.floor(sw / 2) - Math.round(Math.cos(p.aim) * 3),
        py - (sh - 3) - Math.round(Math.sin(p.aim) * 2)
      );
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(px, py);
    if (facingLeft) ctx.scale(-1, 1);
    ctx.drawImage(spr, -Math.floor(sw / 2), -(sh - 3));
    ctx.restore();

    // Draw held weapon at torso height (py - 9)
    const wSlot = p.activeSlot === 1 && p.w1 ? p.w1 : p.w0;
    const baseWSpr = this.atlas.weapons[wSlot || 'fists'];
    const wSpr = this.atlas.getAnimatedCanvas(`weapon:${wSlot || 'fists'}`, baseWSpr, this.time);
    if (wSpr && wSlot !== 'fists') {
      const recoil = p.attackAnim ? 2 : 0;
      const wx = px + Math.round(Math.cos(p.aim) * (5 + recoil));
      const wy = py - 9 + Math.round(Math.sin(p.aim) * (4 + recoil));
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(p.aim);
      if (facingLeft) ctx.scale(1, -1);
      ctx.drawImage(wSpr, -Math.floor(wSpr.width / 2), -Math.floor(wSpr.height / 2));
      ctx.restore();
    }

    // Crown above kill leader
    if (isLeader) {
      const crownSpr = this.atlas.getAnimatedCanvas('misc:crown', this.atlas.misc.crown, this.time);
      ctx.drawImage(crownSpr, px - Math.floor(crownSpr.width / 2), py - sh - 5);
    }

    // Show only player name and remaining life number beside the character (no bar)
    const hpVal = Math.max(0, Math.ceil(p.hp));
    this._drawPixelTag(ctx, px, py - sh + 2, `${p.name} ${hpVal}`, isSelf ? PALETTE.GOLD : PALETTE.BONE, null);
  }

  _drawProjectile(ctx, pr, weaponsMap = null) {
    const gx = Math.round(pr.x);
    const gy = Math.round(pr.y);
    const py = gy - 6; // Elevated torso height for 3/4 perspective
    const wSpec = weaponsMap?.[pr.weaponId] || null;

    // Tiny ground shadow underneath flying projectile
    ctx.fillStyle = PALETTE.UMBER;
    ctx.fillRect(gx - 1, gy, 2, 1);

    if (pr.weaponId === 'brick') {
      ctx.fillStyle = PALETTE.CRIMSON;
      ctx.fillRect(gx - 2, py - 1, 4, 2);
      ctx.fillStyle = PALETTE.RUST;
      ctx.fillRect(gx - 2, py - 1, 2, 1);
    } else if (pr.weaponId === 'molotov' || wSpec?.type === 'molotov') {
      ctx.fillStyle = wSpec?.projectileColor || PALETTE.GRASS;
      ctx.fillRect(gx - 1, py - 1, 3, 3);
      ctx.fillStyle = Math.floor(this.time * 18) % 2 === 0 ? PALETTE.GOLD : PALETTE.RUST;
      ctx.fillRect(gx - 1, py - 3, 2, 2);
    } else if (pr.weaponId === 'slingshot') {
      ctx.fillStyle = PALETTE.SILVER;
      ctx.fillRect(gx - 1, py - 1, 2, 2);
    } else if (wSpec?.type === 'thrown') {
      ctx.fillStyle = wSpec.projectileColor || PALETTE.RUST;
      ctx.fillRect(gx - 2, py - 1, 4, 3);
    } else {
      const ang = Math.atan2(pr.vy, pr.vx);
      const tx = Math.round(gx - Math.cos(ang) * 5);
      const ty = Math.round(py - Math.sin(ang) * 5);
      ctx.strokeStyle =
        wSpec?.isCustomThemeWeapon
          ? wSpec.projectileColor || PALETTE.LIME
          : pr.weaponId === 'rifle'
            ? PALETTE.BONE
            : PALETTE.GOLD;
      ctx.lineWidth = pr.weaponId === 'rifle' || wSpec?.isCustomThemeWeapon ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(gx, py);
      ctx.stroke();
      ctx.fillStyle = PALETTE.BONE;
      ctx.fillRect(gx, py, 1, 1);
    }
  }

  _drawFirePuddle(ctx, cx, cy, r, id) {
    // 3/4 flattened scorched ellipse on ground
    ctx.fillStyle = PALETTE.UMBER;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animated lineless pixel flames rising upward
    const step = 7;
    const phase = Math.floor(this.time * 10 + id);
    for (let dy = -Math.round(r * 0.65); dy <= Math.round(r * 0.65); dy += step) {
      for (let dx = -r + 3; dx <= r - 3; dx += step) {
        const nx = dx / r;
        const ny = dy / (r * 0.72);
        if (nx * nx + ny * ny > 0.85) continue;
        const h = (dx * 17 + dy * 31 + phase * 7) & 7;
        const fx = cx + dx + ((h % 3) - 1);
        const fy = cy + dy - (h % 3);
        ctx.fillStyle = PALETTE.CRIMSON;
        ctx.fillRect(fx - 1, fy - 1, 3, 3);
        ctx.fillStyle = PALETTE.RUST;
        ctx.fillRect(fx - 1, fy - 3, 2, 3);
        if (h > 3) {
          ctx.fillStyle = PALETTE.GOLD;
          ctx.fillRect(fx, fy - 4, 1, 2);
        }
      }
    }
  }

  _drawPixelTag(ctx, x, y, text, color, bg) {
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (bg) {
      const m = ctx.measureText(text);
      const w = Math.ceil(m.width) + 4;
      ctx.fillStyle = bg;
      ctx.fillRect(Math.round(x - w / 2), Math.round(y - 4), w, 8);
    }
    ctx.fillStyle = PALETTE.INK;
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  _drawCenterAnnouncement(ctx, text) {
    const cx = Math.round(MAP_WIDTH / 2);
    const cy = Math.round(MAP_HEIGHT * 0.24);
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const isFight = text.includes('luchar');
    ctx.fillStyle = PALETTE.INK;
    ctx.fillText(text, cx + 2, cy + 2);
    ctx.fillStyle = isFight ? PALETTE.CRIMSON : PALETTE.UMBER;
    ctx.fillText(text, cx + 1, cy + 1);
    ctx.fillStyle = isFight ? PALETTE.GOLD : PALETTE.BONE;
    ctx.fillText(text, cx, cy);
  }

  // Render a crisp 320x184 miniature battlefield capture for a theme carousel card
  renderThemeThumbnail(themeId, targetCanvas, previewAssets) {
    if (!targetCanvas || !previewAssets) return;
    const W = 320;
    const H = 184;
    if (targetCanvas.width !== W || targetCanvas.height !== H) {
      targetCanvas.width = W;
      targetCanvas.height = H;
    }

    const ctx = targetCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const themeEntry = previewAssets.themeEntry || this.atlas.serverCatalog?.themes?.[themeId] || null;
    const themeSpec = themeEntry?.config || BATTLE_THEMES[themeId] || BATTLE_THEMES.campo;
    const customObsDefs = themeEntry?.obstacles || {};
    const customWeaponDefs = themeEntry?.weapons || {};

    // Deterministic seed per themeId so each theme's miniature battlefield is consistent & rich
    let seed = 1337;
    for (let i = 0; i < themeId.length; i++) {
      seed = (Math.imul(seed, 31) + themeId.charCodeAt(i)) >>> 0;
    }

    // 1. Ground tiles (20x12 tiles of 16x16px)
    const cols = Math.ceil(W / TILE_SIZE);
    const rows = Math.ceil(H / TILE_SIZE);
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const r = hashTile(seed, tx, ty) % 100;
        let v = 0;
        if (r < 46) v = 0;
        else if (r < 68) v = 1;
        else if (r < 77) v = 2;
        else if (r < 84) v = 3;
        else if (r < 89) v = 4;
        else if (r < 93) v = 5;
        else if (r < 96) v = 6;
        else v = 7;
        const tileSpr = previewAssets.groundTiles[v] || previewAssets.groundTiles[0];
        if (tileSpr) ctx.drawImage(tileSpr, tx * TILE_SIZE, ty * TILE_SIZE);
      }
    }

    // 2. Signature theme ground overlays adapted for 320x184 miniature view (inherited by derived themes!)
    const baseThemeId = themeEntry?.baseTheme || themeSpec.baseTheme || themeId;
    if (baseThemeId === 'secano') {
      const C = SECANO_PALETTE;
      for (let x = 3; x < W - 3; x++) {
        const y = Math.round(H - 22 - x * 0.42 + Math.sin(x / 46) * 11);
        ctx.fillStyle = C.DUST;
        ctx.fillRect(x, y - 6, 1, 13);
        for (const offset of [-4, 4]) {
          ctx.fillStyle = C.TRACK_EDGE;
          ctx.fillRect(x, y + offset - 1, 1, 3);
          ctx.fillStyle = C.TRACK;
          ctx.fillRect(x, y + offset, 1, 1);
        }
      }
    } else if (baseThemeId === 'industrial') {
      const C = INDUSTRIAL_PALETTE;
      const aprons = [
        { x: 3, y: H - 46, w: 126, h: 43 },
        { x: W - 128, y: 4, w: 125, h: 46 },
      ];
      for (const area of aprons) {
        ctx.fillStyle = C.ASPHALT;
        ctx.fillRect(area.x, area.y, area.w, area.h);
        ctx.fillStyle = C.HAZARD;
        for (let x = area.x + 10; x < area.x + area.w - 10; x += 28) {
          ctx.fillRect(x, area.y + 7, 1, 18);
          ctx.fillRect(x, area.y + 24, 16, 1);
          ctx.fillRect(x + 15, area.y + 16, 1, 8);
        }
      }
    } else if (baseThemeId === 'costa') {
      const C = COSTA_PALETTE;
      for (let x = 3; x < W - 3; x++) {
        const y = Math.round(H - 28 - x * 0.34 + Math.sin(x / 48) * 10);
        ctx.fillStyle = C.PATH_EDGE;
        ctx.fillRect(x, y - 6, 1, 13);
        ctx.fillStyle = C.PATH;
        ctx.fillRect(x, y - 5, 1, 10);
        if (hashTile(seed, x, y) % 3 === 0) {
          ctx.fillStyle = C.PATH_LIGHT;
          ctx.fillRect(x, y - 3, 1, 2);
        }
      }
    } else if (baseThemeId === 'obras') {
      const C = OBRAS_PALETTE;
      for (let x = 3; x < W - 3; x++) {
        const y = Math.round(34 + x * 0.32 + Math.sin(x / 52) * 10);
        ctx.fillStyle = C.EARTH_DARK;
        ctx.fillRect(x, y - 9, 1, 19);
        ctx.fillStyle = C.DUST;
        ctx.fillRect(x, y - 7, 1, 15);
        for (const offset of [-5, 5]) {
          ctx.fillStyle = x % 4 < 2 ? C.MUD_DARK : C.MUD;
          ctx.fillRect(x, y + offset - 1, 1, 3);
        }
      }
    }

    // 3. Theme perimeter border
    ctx.fillStyle = themeSpec.borderColor || PALETTE.UMBER;
    ctx.fillRect(0, 0, W, 3);
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillRect(0, 0, 3, H);
    ctx.fillRect(W - 3, 0, 3, H);
    ctx.fillStyle = themeSpec.accentColor || PALETTE.DIRT;
    ctx.fillRect(3, 3, W - 6, 1);

    // 4. Ground loot samples (custom theme weapon if present + shotgun + medkit)
    const customWIds = Object.keys(customWeaponDefs);
    const lootSamples = [
      { key: customWIds[0] || 'shotgun', x: 136, y: 102 },
      { key: 'pistol', x: 204, y: 82 },
      { key: 'medkit', x: 162, y: 138 },
    ];
    for (const item of lootSamples) {
      const spr = previewAssets.weapons[item.key];
      if (spr) {
        ctx.drawImage(spr, item.x - Math.floor(spr.width / 2), item.y - spr.height + 4);
      }
    }

    // 5. Curated composition of theme's custom + base obstacles + 2 fighters (Y-sorted in 3/4 perspective)
    const customObsIds = Object.keys(customObsDefs).filter((id) => Boolean(previewAssets.obstacles[id]));
    const slots = [
      { type: customObsIds[0] || 'wreck', x: 46, y: 48 },
      { type: customObsIds[1] || 'wall_h', x: 158, y: 44 },
      { type: customObsIds[2] || 'rock', x: 248, y: 54 },
      { type: 'bush', x: 28, y: 112 },
      { type: customObsIds[3] || 'crate', x: 112, y: 86 },
      { type: 'barrel', x: 192, y: 112 },
      { type: customObsIds[0] && customObsIds.length > 4 ? customObsIds[4] : 'wall_h', x: 222, y: 126 },
      { type: 'rock', x: 56, y: 144 },
      { type: 'bush', x: 266, y: 146 },
      { type: 'crate', x: 142, y: 146 },
    ];

    const drawList = [];
    for (const slot of slots) {
      const spr = previewAssets.obstacles[slot.type];
      if (!spr) continue;
      const spec = customObsDefs[slot.type] || OBSTACLE_TYPES[slot.type] || { w: spr.width, h: Math.round(spr.height * 0.55) };
      drawList.push({
        kind: 'obs',
        ySort: slot.y + spec.h,
        x: slot.x,
        y: slot.y,
        w: spec.w,
        h: spec.h,
        spr,
      });
    }

    const fighters = [
      { spr: previewAssets.characters[0], x: 96, y: 122, flip: false },
      { spr: previewAssets.characters[1], x: 214, y: 98, flip: true },
    ];
    for (const f of fighters) {
      if (!f.spr) continue;
      drawList.push({ kind: 'char', ySort: f.y, ...f });
    }

    drawList.sort((a, b) => a.ySort - b.ySort);
    for (const item of drawList) {
      if (item.kind === 'obs') {
        const dx = Math.round(item.x - Math.floor((item.spr.width - item.w) / 2));
        const dy = Math.round(item.y + item.h - item.spr.height + 2);
        ctx.drawImage(item.spr, dx, dy);
      } else {
        ctx.save();
        ctx.translate(item.x, item.y);
        if (item.flip) ctx.scale(-1, 1);
        ctx.drawImage(item.spr, -Math.floor(item.spr.width / 2), -(item.spr.height - 3));
        ctx.restore();
      }
    }
  }
}
