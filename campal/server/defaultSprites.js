// Generates all default lineless low-pixel 3/4 PNG sprites into sprites/default/
import {
  PALETTE,
  SECANO_PALETTE,
  INDUSTRIAL_PALETTE,
  COSTA_PALETTE,
  OBRAS_PALETTE,
  SKIN_PRESETS,
  BATTLE_THEMES,
  CHAR_SPRITE_W,
  CHAR_SPRITE_H,
  CHAR_MAX_SPRITE_SIZE,
  OBSTACLE_TYPES,
} from '../shared/constants.js';
import { encodePngRGBA } from './pngEncoder.js';

function hexToRgba(hex) {
  const clean = String(hex).replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
    255,
  ];
}

class PixelSurface {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.fillStyle = '#000000';
  }

  fillRect(x, y, w, h) {
    const [r, g, b, a] = hexToRgba(this.fillStyle);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const off = (py * this.w + px) * 4;
        this.data[off] = r;
        this.data[off + 1] = g;
        this.data[off + 2] = b;
        this.data[off + 3] = a;
      }
    }
  }

  clearRect(x, y, w, h) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w));
    const y1 = Math.min(this.h, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const off = (py * this.w + px) * 4;
        this.data[off] = 0;
        this.data[off + 1] = 0;
        this.data[off + 2] = 0;
        this.data[off + 3] = 0;
      }
    }
  }

  blit(other, dx, dy) {
    for (let y = 0; y < other.h; y++) {
      const py = dy + y;
      if (py < 0 || py >= this.h) continue;
      for (let x = 0; x < other.w; x++) {
        const px = dx + x;
        if (px < 0 || px >= this.w) continue;
        const srcOff = (y * other.w + x) * 4;
        const a = other.data[srcOff + 3];
        if (a === 0) continue;
        const dstOff = (py * this.w + px) * 4;
        this.data[dstOff] = other.data[srcOff];
        this.data[dstOff + 1] = other.data[srcOff + 1];
        this.data[dstOff + 2] = other.data[srcOff + 2];
        this.data[dstOff + 3] = a;
      }
    }
  }

  toPngBuffer() {
    return encodePngRGBA(this.data, this.w, this.h);
  }
}

function drawGrid(surf, grid, colorMap, ox = 0, oy = 0) {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = colorMap[ch];
      if (!col) continue;
      surf.fillStyle = col;
      surf.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function buildCharacterFrame(skin, frame) {
  const s = new PixelSurface(CHAR_SPRITE_W, CHAR_SPRITE_H);
  const P = PALETTE;
  const bob = frame === 1 ? 1 : 0;

  const cm = {
    S: P.SAND,
    s: P.RUST,
    H: skin.hair,
    T: skin.shirt,
    A: skin.accent,
    P: skin.pants,
    B: P.INK,
    W: P.BONE,
    E: P.INK,
  };

  s.fillStyle = P.UMBER;
  s.fillRect(5, 21, 7, 2);
  s.fillRect(6, 20, 5, 1);

  let headRows;
  switch (skin.style) {
    case 'spiky':
      headRows = [
        '.....H.H........',
        '....HHHHH.......',
        '....HHHHHH......',
        '.....HSSSS......',
        '.....HSSWEW.....',
        '......SSSS......',
        '.......sS.......',
      ];
      break;
    case 'cap':
      headRows = [
        '................',
        '.....AAAA.......',
        '....TTTTTTT.....',
        '.....HSSSS......',
        '.....HSSWEW.....',
        '......SSSS......',
        '.......sS.......',
      ];
      break;
    case 'long':
      headRows = [
        '.....HHHH.......',
        '....HHHHHH......',
        '....HHSSSS......',
        '....HHSSWEW.....',
        '...HHHSSSS......',
        '...HH..sS.......',
        '...H............',
      ];
      break;
    case 'mohawk':
      headRows = [
        '......HH........',
        '.....HHHH.......',
        '.....HAAH.......',
        '.....HSSSS......',
        '.....HSSWEW.....',
        '......SSSS......',
        '.......sS.......',
      ];
      break;
    case 'beanie':
      headRows = [
        '......AA........',
        '.....HHHH.......',
        '....AAAAAA......',
        '.....HSSSS......',
        '.....HSSWEW.....',
        '......SSSS......',
        '.......sS.......',
      ];
      break;
    case 'ponytail':
      headRows = [
        '...H..HHHH......',
        '..HH.HHHHH......',
        '...HHHSSSS......',
        '..H..HSSWEW.....',
        '......SSSS......',
        '.......sS.......',
        '................',
      ];
      break;
    case 'visor':
      headRows = [
        '.....HHHH.......',
        '....HHHHHH......',
        '.....HAAAA......',
        '.....HSSWEW.....',
        '......SSSS......',
        '.......sS.......',
        '................',
      ];
      break;
    default:
      headRows = [
        '................',
        '.....HHHH.......',
        '...AAAAAAA......',
        '..A..HSSSS......',
        '.....HSSWEW.....',
        '......SSSS......',
        '.......sS.......',
      ];
      break;
  }

  let bodyRows;
  if (frame === 2) {
    bodyRows = [
      '.....TTTT.......',
      '....TTTTAT......',
      '...STTTTATS.....',
      '...S.TTTT.......',
      '.....TAAAT......',
      '.....PPPP.......',
      '....PP..PP......',
      '...PP....PP.....',
      '...P......P.....',
      '..PP......P.....',
      '..B.......BB....',
    ];
  } else if (frame === 3) {
    bodyRows = [
      '.....TTTT.......',
      '.....TTTAT......',
      '....STTTATS.....',
      '.....TTTT.S.....',
      '.....TAAAT......',
      '.....PPPP.......',
      '.....PPPP.......',
      '.....PP.P.......',
      '.....P..PP......',
      '....PP...P......',
      '....BB...B......',
    ];
  } else {
    bodyRows = [
      '.....TTTT.......',
      '....TTTTAT......',
      '....STTTATS.....',
      '...S.TTTT.S.....',
      '...S.TAAAT.S....',
      '.....PPPP.......',
      '.....PP.PP......',
      '.....P...P......',
      '....PP...P......',
      '....P....P......',
      '....B....BB.....',
    ];
  }

  const yStart = 2 + bob;
  drawGrid(s, headRows, cm, 0, yStart);
  drawGrid(s, bodyRows, cm, 0, yStart + 6);

  if (skin.style === 'long') {
    s.fillStyle = skin.hair;
    s.fillRect(3, yStart + 6, 2, 3);
  }
  return s;
}

function buildWeaponSurfaces() {
  const P = PALETTE;
  const cm = {
    U: P.UMBER, O: P.SOIL, D: P.DIRT, N: P.SAND, W: P.BONE,
    G: P.GRASS, L: P.LIME, S: P.SLATE, M: P.STONE, V: P.SILVER,
    R: P.CRIMSON, F: P.RUST, Y: P.GOLD, B: P.COBALT, K: P.INK,
  };

  const grids = {
    fists: [
      '............', '............', '....NNN.....', '....NNF.....',
      '............', '......NNN...', '......NNF...', '............',
      '............', '............', '............', '............',
    ],
    pipe: [
      '............', '........VV..', '.......VMV..', '......VFM...',
      '.....VMV....', '....VMV.....', '...VMV......', '..SMS.......',
      '.SS.........', '............', '............', '............',
    ],
    axe: [
      '............', '......VVV...', '.....VVMMF..', '.....VMFF...',
      '......SF....', '.....DD.....', '....DD......', '...DD.......',
      '..DU........', '.U..........', '............', '............',
    ],
    brick: [
      '............', '............', '............', '...FFFFFF...',
      '..FRRFRRFF..', '..RRRRRRRR..', '..RRRRRRRR..', '..UUUUUUUU..',
      '............', '............', '............', '............',
    ],
    slingshot: [
      '............', '...D...D....', '...D.R.D....', '....DRD.....',
      '.....D......', '.....D......', '.....D......', '.....U......',
      '............', '............', '............', '............',
    ],
    pistol: [
      '............', '............', '............', '..VVVVVVV...',
      '..MMMMMMMS..', '..SSSSSS....', '..FF.SS.....', '..FF........',
      '..UU........', '............', '............', '............',
    ],
    shotgun: [
      '............', '............', '............', '....VVVVVVVV',
      '.FFSSSSSSSSS', 'FFFDDSSSS...', 'FFU.........', '............',
      '............', '............', '............', '............',
    ],
    rifle: [
      '............', '.....BBB....', '....VVVVVVVV', 'FFFFMMMMMMMM',
      'FFDD..SSSS..', 'FF..........', '............', '............',
      '............', '............', '............', '............',
    ],
    molotov: [
      '............', '......Y.....', '.....YFY....', '.....WW.....',
      '.....GG.....', '....GLGG....', '....GFFG....', '....GFYG....',
      '....GRFG....', '....GGGG....', '............', '............',
    ],
    medkit: [
      '............', '....SSSS....', '..WWWWWWWW..', '..WWWRRWWW..',
      '..WWRRRRWW..', '..WWWRRWWW..', '..WWWWWWWW..', '..VVVVVVVV..',
      '............', '............', '............', '............',
    ],
  };

  const out = {};
  for (const [id, grid] of Object.entries(grids)) {
    const s = new PixelSurface(12, 12);
    drawGrid(s, grid, cm);
    out[id] = s;
  }
  return out;
}

function buildObstacleSurfaces() {
  const P = PALETTE;
  const out = {};

  // Rock
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.rock;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(4, h - 5, w - 5, 4); s.fillRect(6, h - 6, w - 7, 2);
    s.fillStyle = P.SLATE; s.fillRect(3, 8, w - 7, h - 11); s.fillRect(2, 11, w - 5, h - 14);
    s.fillStyle = P.STONE; s.fillRect(4, 5, w - 10, h - 10); s.fillRect(6, 3, w - 14, 7);
    s.fillStyle = P.SILVER; s.fillRect(7, 2, 10, 4); s.fillRect(5, 4, 8, 3);
    s.fillStyle = P.UMBER; s.fillRect(14, 7, 2, 6); s.fillRect(16, 11, 3, 1);
    s.fillStyle = P.PINE; s.fillRect(2, h - 6, 4, 2);
    s.fillStyle = P.GRASS; s.fillRect(3, h - 7, 3, 2);
    out.rock = s;
  }

  // Wall H
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wall_h;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(3, h - 4, w - 3, 4);
    s.fillStyle = P.SLATE; s.fillRect(1, 7, w - 4, h - 10);
    s.fillStyle = P.UMBER; s.fillRect(w - 3, 5, 2, h - 8);
    s.fillStyle = P.SILVER; s.fillRect(1, 2, w - 4, 3);
    s.fillStyle = P.STONE; s.fillRect(1, 5, w - 4, 2);
    s.fillStyle = P.STONE;
    for (let x = 2; x < w - 8; x += 8) s.fillRect(x, 8, 6, 3);
    s.fillStyle = P.RUST; s.fillRect(6, 12, 6, 3); s.fillRect(22, 12, 6, 3);
    s.fillStyle = P.DIRT; s.fillRect(14, 12, 6, 3); s.fillRect(30, 12, 5, 3);
    s.clearRect(11, 1, 5, 3);
    s.clearRect(28, 1, 4, 2);
    out.wall_h = s;
  }

  // Wall V
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wall_v;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(w - 3, 6, 3, h - 6); s.fillRect(3, h - 3, w - 3, 3);
    s.fillStyle = P.SILVER; s.fillRect(1, 1, 5, h - 12);
    s.fillStyle = P.STONE; s.fillRect(6, 1, 5, h - 12);
    s.fillStyle = P.SLATE;
    for (let y = 8; y < h - 12; y += 8) s.fillRect(1, y, 10, 1);
    s.fillStyle = P.SLATE; s.fillRect(1, h - 11, 10, 9);
    s.fillStyle = P.RUST; s.fillRect(2, h - 9, 4, 3);
    s.fillStyle = P.DIRT; s.fillRect(7, h - 6, 3, 3);
    out.wall_v = s;
  }

  // Wreck
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wreck;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(3, h - 5, w - 4, 5);
    s.fillStyle = P.SLATE; s.fillRect(2, 11, w - 6, 8);
    s.fillStyle = P.COBALT; s.fillRect(2, 10, w - 6, 6);
    s.fillStyle = P.STONE; s.fillRect(3, 8, 9, 3); s.fillRect(w - 13, 8, 8, 3);
    s.fillStyle = P.COBALT; s.fillRect(11, 3, 18, 3);
    s.fillStyle = P.SILVER; s.fillRect(12, 2, 16, 2);
    s.fillStyle = P.INK; s.fillRect(11, 6, 18, 5);
    s.fillStyle = P.SILVER; s.fillRect(13, 6, 5, 4); s.fillRect(21, 6, 6, 4);
    s.fillStyle = P.COBALT; s.fillRect(19, 6, 2, 5);
    s.fillStyle = P.RUST; s.fillRect(4, 9, 6, 4); s.fillRect(26, 12, 8, 4);
    s.fillStyle = P.CRIMSON; s.fillRect(29, 13, 3, 2);
    s.fillStyle = P.GOLD; s.fillRect(2, 11, 2, 2);
    s.fillStyle = P.SILVER; s.fillRect(1, 15, 3, 2); s.fillRect(w - 6, 15, 3, 2);
    s.fillStyle = P.INK; s.fillRect(6, 16, 6, 5); s.fillRect(w - 15, 16, 6, 5);
    s.fillStyle = P.STONE; s.fillRect(8, 18, 2, 2); s.fillRect(w - 13, 18, 2, 2);
    out.wreck = s;
  }

  // Crate intact & damaged
  for (const damaged of [false, true]) {
    const { visW: w, visH: h } = OBSTACLE_TYPES.crate;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(3, h - 4, w - 3, 4);
    s.fillStyle = P.SAND; s.fillRect(1, 2, w - 4, 5);
    s.fillStyle = P.DIRT; s.fillRect(3, 3, w - 8, 3);
    s.fillStyle = P.RUST; s.fillRect(1, 7, w - 4, 8);
    s.fillStyle = P.SOIL; s.fillRect(w - 3, 3, 2, 12);
    s.fillStyle = P.UMBER; s.fillRect(2, 8, w - 6, 1); s.fillRect(2, 13, w - 6, 1);
    for (let i = 0; i < 6; i++) s.fillRect(4 + i, 8 + i, 2, 1);
    s.fillStyle = P.SILVER; s.fillRect(2, 7, 1, 1); s.fillRect(w - 5, 7, 1, 1);
    if (damaged) {
      s.fillStyle = P.INK; s.fillRect(6, 4, 2, 5); s.fillRect(8, 8, 3, 2); s.fillRect(5, 10, 2, 4);
    }
    out[damaged ? 'crate_dmg' : 'crate'] = s;
  }

  // Barrel intact & damaged
  for (const damaged of [false, true]) {
    const { visW: w, visH: h } = OBSTACLE_TYPES.barrel;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(3, h - 4, w - 3, 4);
    s.fillStyle = P.CRIMSON; s.fillRect(2, 4, 9, 10);
    s.fillStyle = P.RUST; s.fillRect(3, 4, 3, 10);
    s.fillStyle = P.UMBER; s.fillRect(9, 4, 2, 10);
    s.fillStyle = P.STONE; s.fillRect(3, 1, 7, 3);
    s.fillStyle = P.SILVER; s.fillRect(4, 1, 4, 2);
    s.fillStyle = P.SLATE; s.fillRect(2, 3, 9, 1);
    s.fillStyle = P.GOLD; s.fillRect(2, 8, 9, 3);
    s.fillStyle = P.INK; s.fillRect(5, 9, 3, 1);
    s.fillStyle = P.SLATE; s.fillRect(2, 13, 9, 1);
    if (damaged) {
      s.fillStyle = P.GOLD; s.fillRect(7, 4, 3, 3);
      s.fillStyle = P.BONE; s.fillRect(8, 5, 1, 1);
    }
    out[damaged ? 'barrel_dmg' : 'barrel'] = s;
  }

  // Bush
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.bush;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(4, h - 4, w - 6, 4);
    const blobs = [
      { x: 7, y: 12, r: 6 },
      { x: 18, y: 12, r: 6 },
      { x: 13, y: 8, r: 7 },
      { x: 13, y: 13, r: 6 },
    ];
    s.fillStyle = P.PINE;
    for (const b of blobs) {
      for (let y = -b.r; y <= b.r; y++) {
        for (let x = -b.r; x <= b.r; x++) {
          if (x * x + y * y <= b.r * b.r) s.fillRect(b.x + x, b.y + y, 1, 1);
        }
      }
    }
    s.fillStyle = P.GRASS;
    for (const b of blobs) {
      for (let y = -b.r; y <= b.r - 3; y++) {
        for (let x = -b.r + 1; x <= b.r - 1; x++) {
          if (x * x + y * y <= (b.r - 1) * (b.r - 1)) s.fillRect(b.x + x, b.y + y - 1, 1, 1);
        }
      }
    }
    s.fillStyle = P.LIME;
    s.fillRect(9, 2, 7, 3); s.fillRect(5, 6, 5, 3); s.fillRect(15, 6, 5, 2); s.fillRect(11, 9, 4, 2);
    out.bush = s;
  }

  return out;
}

function buildMiscSurfaces() {
  const P = PALETTE;
  const cm = { W: P.BONE, V: P.SILVER, K: P.INK, Y: P.GOLD, F: P.RUST, R: P.CRIMSON };

  const skull = new PixelSurface(10, 10);
  drawGrid(skull, [
    '..........', '..WWWWWW..', '.WWWWWWWW.', '.WWKWWKWW.', '.WWWWWWWW.',
    '..WWVVWW..', '...W.W.W..', '..........', '.WW....WW.', '..........',
  ], cm);

  const crown = new PixelSurface(10, 8);
  drawGrid(crown, [
    '....YY....', '.Y..YY..Y.', '.YY.YY.YY.', '.YYYYYYYY.',
    '.YYRYYRYY.', '.YFFFFFFY.', '..........', '..........',
  ], cm);

  return { skull, crown };
}

function buildGroundTileSurfaces() {
  const P = PALETTE;
  const tiles = [];
  for (let variant = 0; variant < 8; variant++) {
    const s = new PixelSurface(16, 16);
    s.fillStyle = P.SOIL;
    s.fillRect(0, 0, 16, 16);

    if (variant === 0 || variant === 1) {
      s.fillStyle = P.DIRT; s.fillRect(3, 5, 2, 1); s.fillRect(11, 12, 2, 1);
    } else if (variant === 2) {
      s.fillStyle = P.DIRT; s.fillRect(3, 4, 8, 5); s.fillRect(5, 3, 4, 7);
    } else if (variant === 3) {
      s.fillStyle = P.UMBER; s.fillRect(6, 11, 4, 1);
      s.fillStyle = P.PINE; s.fillRect(6, 9, 4, 2);
      s.fillStyle = P.GRASS; s.fillRect(6, 8, 1, 2); s.fillRect(8, 7, 1, 3); s.fillRect(10, 9, 1, 1);
    } else if (variant === 4) {
      s.fillStyle = P.UMBER; s.fillRect(5, 7, 2, 1);
      s.fillStyle = P.STONE; s.fillRect(5, 6, 2, 1);
      s.fillStyle = P.DIRT; s.fillRect(11, 11, 2, 1);
    } else if (variant === 5) {
      s.fillStyle = P.UMBER; s.fillRect(4, 6, 4, 1); s.fillRect(7, 7, 1, 3);
    } else if (variant === 6) {
      s.fillStyle = P.UMBER; s.fillRect(4, 7, 6, 3);
      s.fillStyle = P.SOIL; s.fillRect(5, 8, 4, 1);
    } else {
      s.fillStyle = P.DIRT; s.fillRect(4, 9, 1, 2); s.fillRect(6, 8, 1, 3); s.fillRect(11, 5, 1, 2);
    }
    tiles.push(s);
  }
  return tiles;
}

// Build all 37 default sprite PNG buffers + manifest metadata
export function buildAllDefaultSprites() {
  const entries = [];

  // 1. Characters (4-frame horizontal PNG spritesheets: 64x24px)
  for (const skin of SKIN_PRESETS) {
    const strip = new PixelSurface(CHAR_SPRITE_W * 4, CHAR_SPRITE_H);
    for (let f = 0; f < 4; f++) {
      strip.blit(buildCharacterFrame(skin, f), f * CHAR_SPRITE_W, 0);
    }
    entries.push({
      key: `char:${skin.id}`,
      file: `char_${skin.id}.png`,
      category: 'characters',
      id: skin.id,
      name: `Personaje: ${skin.name}`,
      w: CHAR_SPRITE_W,
      h: CHAR_SPRITE_H,
      frames: 4,
      fps: 8,
      maxW: CHAR_MAX_SPRITE_SIZE,
      maxH: CHAR_MAX_SPRITE_SIZE,
      png: strip.toPngBuffer(),
    });
  }

  // 2. Weapons & Medkit
  const weaponNames = {
    fists: 'Arma: Puños',
    pipe: 'Arma: Tubo',
    axe: 'Arma: Hacha',
    brick: 'Arma: Ladrillos',
    slingshot: 'Arma: Tirachinas',
    pistol: 'Arma: Pistola',
    shotgun: 'Arma: Escopeta',
    rifle: 'Arma: Rifle',
    molotov: 'Arma: Molotov',
    medkit: 'Objeto: Botiquín',
  };
  const weapons = buildWeaponSurfaces();
  for (const [id, surf] of Object.entries(weapons)) {
    entries.push({
      key: `weapon:${id}`,
      file: `weapon_${id}.png`,
      category: 'weapons',
      id,
      name: weaponNames[id] || `Arma: ${id}`,
      w: surf.w,
      h: surf.h,
      frames: 1,
      fps: id === 'molotov' ? 8 : 6,
      maxW: 32,
      maxH: 32,
      png: surf.toPngBuffer(),
    });
  }

  // 3. Obstacles 3/4
  const obsNames = {
    rock: 'Obstáculo: Roca',
    wall_h: 'Obstáculo: Muro Horiz.',
    wall_v: 'Obstáculo: Muro Vert.',
    wreck: 'Obstáculo: Chatarra',
    crate: 'Obstáculo: Caja',
    crate_dmg: 'Obstáculo: Caja Dañada',
    barrel: 'Obstáculo: Bidón',
    barrel_dmg: 'Obstáculo: Bidón Dañado',
    bush: 'Obstáculo: Arbusto',
  };
  const obstacles = buildObstacleSurfaces();
  for (const [id, surf] of Object.entries(obstacles)) {
    entries.push({
      key: `obs:${id}`,
      file: `obs_${id}.png`,
      category: 'obstacles',
      id,
      name: obsNames[id] || `Obstáculo: ${id}`,
      w: surf.w,
      h: surf.h,
      frames: 1,
      fps: 6,
      maxW: 64,
      maxH: 64,
      png: surf.toPngBuffer(),
    });
  }

  // 4. Ground Tiles (Fondos)
  const tiles = buildGroundTileSurfaces();
  tiles.forEach((surf, idx) => {
    entries.push({
      key: `tile:${idx}`,
      file: `tile_${idx}.png`,
      category: 'groundTiles',
      id: idx,
      name: `Fondo: Loseta Tierra #${idx + 1}`,
      w: surf.w,
      h: surf.h,
      frames: 1,
      fps: 4,
      maxW: 32,
      maxH: 32,
      png: surf.toPngBuffer(),
    });
  });

  // 5. Misc
  const misc = buildMiscSurfaces();
  entries.push({
    key: 'misc:skull',
    file: 'misc_skull.png',
    category: 'misc',
    id: 'skull',
    name: 'Otros: Calavera',
    w: misc.skull.w,
    h: misc.skull.h,
    frames: 1,
    fps: 6,
    maxW: 32,
    maxH: 32,
    png: misc.skull.toPngBuffer(),
  });
  entries.push({
    key: 'misc:crown',
    file: 'misc_crown.png',
    category: 'misc',
    id: 'crown',
    name: 'Otros: Corona',
    w: misc.crown.w,
    h: misc.crown.h,
    frames: 1,
    fps: 6,
    maxW: 32,
    maxH: 32,
    png: misc.crown.toPngBuffer(),
  });

  return entries;
}

// === THEME OVERRIDE PNG GENERATORS (only override the sprites each theme wants!) ===

function makeTileEntry(idx, surf) {
  return {
    key: `tile:${idx}`,
    file: `tile_${idx}.png`,
    category: 'groundTiles',
    id: idx,
    name: `Fondo: Loseta #${idx + 1}`,
    w: surf.w,
    h: surf.h,
    frames: 1,
    fps: 4,
    maxW: 32,
    maxH: 32,
    png: surf.toPngBuffer(),
  };
}

function makeWeaponEntry(id, name, surf) {
  return {
    key: `weapon:${id}`,
    file: `weapon_${id}.png`,
    category: 'weapons',
    id,
    name,
    w: surf.w,
    h: surf.h,
    frames: 1,
    fps: 6,
    maxW: 32,
    maxH: 32,
    png: surf.toPngBuffer(),
  };
}

function makeObsEntry(id, name, surf) {
  return {
    key: `obs:${id}`,
    file: `obs_${id}.png`,
    category: 'obstacles',
    id,
    name,
    w: surf.w,
    h: surf.h,
    frames: 1,
    fps: 6,
    maxW: 80,
    maxH: 80,
    png: surf.toPngBuffer(),
  };
}

function buildUrbanoOverrides() {
  const P = PALETTE;
  const sprites = [];

  // Urban asphalt & concrete ground tiles
  for (let v = 0; v < 8; v++) {
    const s = new PixelSurface(16, 16);
    s.fillStyle = P.SLATE;
    s.fillRect(0, 0, 16, 16);
    if (v === 0 || v === 1) {
      s.fillStyle = P.STONE; s.fillRect(2, 3, 2, 1); s.fillRect(11, 11, 2, 1);
    } else if (v === 2) {
      s.fillStyle = P.STONE; s.fillRect(1, 1, 14, 14);
      s.fillStyle = P.SLATE; s.fillRect(3, 3, 10, 10);
      s.fillStyle = P.UMBER; s.fillRect(0, 15, 16, 1); s.fillRect(15, 0, 1, 16);
    } else if (v === 3) {
      s.fillStyle = P.INK; s.fillRect(4, 5, 5, 1); s.fillRect(8, 6, 1, 4);
      s.fillStyle = P.GRASS; s.fillRect(7, 4, 2, 2);
      s.fillStyle = P.LIME; s.fillRect(8, 3, 1, 1);
    } else if (v === 4) {
      s.fillStyle = P.GOLD; s.fillRect(3, 7, 9, 2);
      s.fillStyle = P.SLATE; s.fillRect(6, 7, 2, 1);
    } else if (v === 5) {
      s.fillStyle = P.UMBER; s.fillRect(2, 4, 6, 1); s.fillRect(7, 5, 1, 5); s.fillRect(8, 9, 5, 1);
    } else if (v === 6) {
      s.fillStyle = P.INK; s.fillRect(4, 5, 8, 6);
      s.fillStyle = P.STONE; s.fillRect(5, 6, 1, 4); s.fillRect(7, 6, 1, 4); s.fillRect(9, 6, 1, 4); s.fillRect(11, 6, 1, 4);
    } else {
      s.fillStyle = P.STONE; s.fillRect(3, 10, 2, 2); s.fillRect(10, 4, 2, 1);
      s.fillStyle = P.SILVER; s.fillRect(3, 10, 1, 1);
    }
    sprites.push(makeTileEntry(v, s));
  }

  // Urban concrete rubble block (overrides rock)
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.rock;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.INK; s.fillRect(3, h - 4, w - 4, 4);
    s.fillStyle = P.SLATE; s.fillRect(2, 8, w - 5, h - 11);
    s.fillStyle = P.STONE; s.fillRect(3, 5, w - 7, 6);
    s.fillStyle = P.SILVER; s.fillRect(4, 3, w - 10, 3);
    // Rebar rods sticking out
    s.fillStyle = P.RUST; s.fillRect(16, 1, 4, 1); s.fillRect(18, 2, 3, 1);
    s.fillStyle = P.CRIMSON; s.fillRect(5, 10, 4, 3); // Broken brick in rubble
    sprites.push(makeObsEntry('rock', 'Obstáculo: Escombros', s));
  }

  // Urban graffiti brick wall_h
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wall_h;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.INK; s.fillRect(2, h - 3, w - 2, 3);
    s.fillStyle = P.STONE; s.fillRect(1, 2, w - 3, 4);
    s.fillStyle = P.SILVER; s.fillRect(1, 2, w - 3, 2);
    s.fillStyle = P.CRIMSON; s.fillRect(1, 6, w - 3, h - 9);
    s.fillStyle = P.RUST;
    for (let x = 2; x < w - 6; x += 7) {
      s.fillRect(x, 7, 5, 3);
      s.fillRect(x + 3, 12, 5, 3);
    }
    // Subtle urban graffiti tag
    s.fillStyle = P.GOLD; s.fillRect(14, 9, 4, 4);
    s.fillStyle = P.COBALT; s.fillRect(19, 8, 5, 5);
    s.fillStyle = P.BONE; s.fillRect(15, 10, 2, 2);
    sprites.push(makeObsEntry('wall_h', 'Obstáculo: Muro Urbano', s));
  }

  // Custom theme obstacle: Caseta Urbana (48x34 visual, 44x20 footprint)
  {
    const w = 48;
    const h = 34;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.INK; s.fillRect(4, h - 5, w - 5, 5); // Shadow
    // Roof (3/4 overhang)
    s.fillStyle = P.SLATE; s.fillRect(1, 3, w - 3, 9);
    s.fillStyle = P.STONE; s.fillRect(2, 2, w - 5, 6);
    s.fillStyle = P.SILVER; s.fillRect(3, 2, w - 8, 2);
    // Front masonry facade
    s.fillStyle = P.DIRT; s.fillRect(3, 12, w - 7, 17);
    s.fillStyle = P.SAND; s.fillRect(3, 12, w - 9, 3);
    s.fillStyle = P.SOIL; s.fillRect(w - 6, 12, 2, 17);
    // Steel shuttered window & door
    s.fillStyle = P.INK; s.fillRect(7, 17, 10, 12);
    s.fillStyle = P.COBALT; s.fillRect(8, 18, 8, 11);
    s.fillStyle = P.GOLD; s.fillRect(14, 23, 1, 2); // Handle
    s.fillStyle = P.INK; s.fillRect(22, 17, 16, 8);
    s.fillStyle = P.STONE; s.fillRect(23, 18, 14, 6);
    s.fillStyle = P.SLATE; s.fillRect(23, 20, 14, 1); s.fillRect(23, 22, 14, 1);
    sprites.push(makeObsEntry('caseta', 'Obstáculo: Caseta Urbana', s));
  }

  return sprites;
}

function buildFuturoOverrides() {
  const P = PALETTE;
  const sprites = [];

  // Sci-fi deck plate ground tiles
  for (let v = 0; v < 8; v++) {
    const s = new PixelSurface(16, 16);
    s.fillStyle = P.INK; s.fillRect(0, 0, 16, 16);
    s.fillStyle = P.SLATE; s.fillRect(1, 1, 14, 14);
    if (v === 0 || v === 1) {
      s.fillStyle = P.INK; s.fillRect(2, 2, 1, 1); s.fillRect(13, 2, 1, 1); s.fillRect(2, 13, 1, 1); s.fillRect(13, 13, 1, 1);
    } else if (v === 2) {
      s.fillStyle = P.COBALT; s.fillRect(1, 7, 14, 2);
      s.fillStyle = P.SILVER; s.fillRect(6, 7, 4, 1);
    } else if (v === 3) {
      s.fillStyle = P.INK; s.fillRect(4, 4, 8, 8);
      s.fillStyle = P.COBALT; s.fillRect(5, 5, 6, 6);
      s.fillStyle = P.LIME; s.fillRect(7, 7, 2, 2);
    } else if (v === 4) {
      s.fillStyle = P.GOLD; s.fillRect(2, 11, 4, 2); s.fillRect(9, 11, 4, 2);
    } else if (v === 5) {
      s.fillStyle = P.INK;
      for (let y = 3; y <= 11; y += 2) s.fillRect(3, y, 10, 1);
    } else if (v === 6) {
      s.fillStyle = P.COBALT; s.fillRect(7, 1, 2, 14);
      s.fillStyle = P.LIME; s.fillRect(7, 6, 2, 2);
    } else {
      s.fillStyle = P.STONE; s.fillRect(2, 2, 12, 2);
      s.fillStyle = P.SILVER; s.fillRect(3, 2, 4, 1);
    }
    sprites.push(makeTileEntry(v, s));
  }

  // Cyber monolith pylon (overrides rock)
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.rock;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.INK; s.fillRect(3, h - 4, w - 4, 4);
    s.fillStyle = P.SLATE; s.fillRect(4, 6, w - 8, h - 9);
    s.fillStyle = P.STONE; s.fillRect(6, 3, w - 12, 5);
    s.fillStyle = P.SILVER; s.fillRect(7, 2, w - 14, 2);
    s.fillStyle = P.COBALT; s.fillRect(7, 9, w - 14, 5);
    s.fillStyle = P.LIME; s.fillRect(10, 10, 6, 2);
    sprites.push(makeObsEntry('rock', 'Obstáculo: Monolito Cyber', s));
  }

  // Cyber energy wall_h
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wall_h;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.INK; s.fillRect(2, h - 3, w - 2, 3);
    s.fillStyle = P.SLATE; s.fillRect(1, 5, w - 3, h - 8);
    s.fillStyle = P.SILVER; s.fillRect(1, 2, w - 3, 3);
    s.fillStyle = P.COBALT; s.fillRect(3, 9, w - 7, 3);
    s.fillStyle = P.LIME; s.fillRect(5, 10, w - 11, 1);
    s.fillStyle = P.INK; s.fillRect(13, 5, 2, h - 8); s.fillRect(27, 5, 2, h - 8);
    sprites.push(makeObsEntry('wall_h', 'Obstáculo: Barrera Cyber', s));
  }

  // Sci-fi tech supply crate
  for (const damaged of [false, true]) {
    const { visW: w, visH: h } = OBSTACLE_TYPES.crate;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.INK; s.fillRect(2, h - 3, w - 2, 3);
    s.fillStyle = P.SILVER; s.fillRect(1, 2, w - 4, 5);
    s.fillStyle = P.STONE; s.fillRect(1, 7, w - 4, 8);
    s.fillStyle = P.SLATE; s.fillRect(w - 3, 3, 2, 12);
    s.fillStyle = P.COBALT; s.fillRect(3, 9, w - 8, 4);
    s.fillStyle = damaged ? P.CRIMSON : P.LIME;
    s.fillRect(6, 10, 4, 2);
    if (damaged) {
      s.fillStyle = P.INK; s.fillRect(5, 4, 2, 5); s.fillRect(9, 8, 3, 4);
    }
    sprites.push(makeObsEntry(damaged ? 'crate_dmg' : 'crate', damaged ? 'Obstáculo: Módulo Dañado' : 'Obstáculo: Módulo Tech', s));
  }

  // Plasma explosive canister (overrides barrel)
  for (const damaged of [false, true]) {
    const { visW: w, visH: h } = OBSTACLE_TYPES.barrel;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.INK; s.fillRect(3, h - 4, w - 3, 4);
    s.fillStyle = P.SLATE; s.fillRect(2, 4, 9, 10);
    s.fillStyle = P.COBALT; s.fillRect(3, 6, 7, 6);
    s.fillStyle = damaged ? P.GOLD : P.LIME; s.fillRect(4, 7, 5, 4);
    s.fillStyle = P.SILVER; s.fillRect(3, 1, 7, 3);
    s.fillStyle = P.CRIMSON; s.fillRect(2, 13, 9, 1);
    sprites.push(makeObsEntry(damaged ? 'barrel_dmg' : 'barrel', damaged ? 'Obstáculo: Célula Crítica' : 'Obstáculo: Célula Plasma', s));
  }

  // Custom theme obstacle: Torre Cyber (28x34 visual, 22x14 footprint)
  {
    const w = 28;
    const h = 34;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.INK; s.fillRect(4, h - 5, w - 6, 5);
    s.fillStyle = P.SLATE; s.fillRect(5, 16, 18, 14);
    s.fillStyle = P.STONE; s.fillRect(7, 8, 14, 14);
    s.fillStyle = P.SILVER; s.fillRect(9, 4, 10, 6);
    s.fillStyle = P.COBALT; s.fillRect(11, 2, 6, 3);
    s.fillStyle = P.LIME; s.fillRect(12, 1, 4, 2); // Antenna glow
    s.fillStyle = P.COBALT; s.fillRect(9, 12, 10, 14);
    s.fillStyle = P.LIME; s.fillRect(11, 14, 6, 3); s.fillRect(11, 20, 6, 3);
    sprites.push(makeObsEntry('torre', 'Obstáculo: Torre Cyber', s));
  }

  // Custom theme weapon: Pistola Láser (12x12)
  {
    const s = new PixelSurface(12, 12);
    const cm = { S: P.SLATE, V: P.SILVER, B: P.COBALT, L: P.LIME, W: P.BONE, K: P.INK };
    drawGrid(s, [
      '............',
      '............',
      '............',
      '..VVVVVVLL..',
      '..SBBBBBLW..',
      '..SSSSSSLL..',
      '..BS..SS....',
      '..BB........',
      '..KK........',
      '............',
      '............',
      '............',
    ], cm);
    sprites.push(makeWeaponEntry('laser', 'Arma: Pistola Láser', s));
  }

  return sprites;
}

function buildDesiertoOverrides() {
  const P = PALETTE;
  const sprites = [];

  // Desert sand dune ground tiles
  for (let v = 0; v < 8; v++) {
    const s = new PixelSurface(16, 16);
    s.fillStyle = P.DIRT;
    s.fillRect(0, 0, 16, 16);
    if (v === 0 || v === 1) {
      s.fillStyle = P.SAND; s.fillRect(2, 4, 5, 1); s.fillRect(8, 11, 5, 1);
    } else if (v === 2) {
      s.fillStyle = P.SAND; s.fillRect(1, 5, 12, 4); s.fillRect(4, 4, 7, 6);
    } else if (v === 3) {
      s.fillStyle = P.SOIL; s.fillRect(6, 10, 4, 2);
      s.fillStyle = P.RUST; s.fillRect(6, 8, 1, 2); s.fillRect(9, 8, 1, 2);
      s.fillStyle = P.GOLD; s.fillRect(7, 7, 2, 2);
    } else if (v === 4) {
      s.fillStyle = P.UMBER; s.fillRect(4, 8, 3, 2);
      s.fillStyle = P.RUST; s.fillRect(4, 7, 2, 2);
      s.fillStyle = P.SAND; s.fillRect(11, 5, 2, 1);
    } else if (v === 5) {
      s.fillStyle = P.SOIL; s.fillRect(3, 5, 5, 1); s.fillRect(7, 6, 1, 4); s.fillRect(8, 9, 4, 1);
    } else if (v === 6) {
      s.fillStyle = P.RUST; s.fillRect(4, 6, 7, 4);
      s.fillStyle = P.DIRT; s.fillRect(5, 7, 5, 2);
    } else {
      s.fillStyle = P.SAND; s.fillRect(2, 3, 6, 1); s.fillRect(6, 8, 7, 1); s.fillRect(3, 13, 5, 1);
    }
    sprites.push(makeTileEntry(v, s));
  }

  // Red sandstone canyon rock
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.rock;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(4, h - 5, w - 5, 4);
    s.fillStyle = P.CRIMSON; s.fillRect(3, 8, w - 7, h - 11);
    s.fillStyle = P.RUST; s.fillRect(4, 5, w - 9, h - 10);
    s.fillStyle = P.SAND; s.fillRect(6, 2, 11, 4);
    s.fillStyle = P.GOLD; s.fillRect(7, 3, 8, 2);
    sprites.push(makeObsEntry('rock', 'Obstáculo: Roca Arenisca', s));
  }

  // Adobe desert wall_h
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wall_h;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(3, h - 4, w - 3, 4);
    s.fillStyle = P.RUST; s.fillRect(1, 6, w - 4, h - 9);
    s.fillStyle = P.SAND; s.fillRect(1, 2, w - 4, 4);
    s.fillStyle = P.DIRT;
    for (let x = 3; x < w - 8; x += 9) s.fillRect(x, 8, 7, 3);
    s.clearRect(16, 1, 6, 3);
    sprites.push(makeObsEntry('wall_h', 'Obstáculo: Muro Adobe', s));
  }

  // Desert cactus & thorn scrub (overrides bush)
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.bush;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(5, h - 4, w - 9, 4);
    s.fillStyle = P.PINE; s.fillRect(9, 4, 6, 13); s.fillRect(4, 8, 5, 4); s.fillRect(15, 7, 5, 4);
    s.fillStyle = P.GRASS; s.fillRect(10, 3, 4, 13); s.fillRect(5, 6, 3, 5); s.fillRect(16, 5, 3, 5);
    s.fillStyle = P.LIME; s.fillRect(11, 3, 2, 9); s.fillRect(6, 6, 1, 3); s.fillRect(17, 5, 1, 3);
    s.fillStyle = P.GOLD; s.fillRect(11, 2, 2, 1); // Cactus flower
    sprites.push(makeObsEntry('bush', 'Obstáculo: Cactus', s));
  }

  // Custom theme obstacle: Palmera Seca (28x34 visual, 14x10 footprint)
  {
    const w = 28;
    const h = 34;
    const s = new PixelSurface(w, h);
    s.fillStyle = P.UMBER; s.fillRect(6, h - 5, 17, 4); // Cast shadow
    // Curved segmented trunk
    s.fillStyle = P.SOIL; s.fillRect(12, 14, 4, 16);
    s.fillStyle = P.DIRT; s.fillRect(13, 14, 2, 15);
    s.fillStyle = P.SAND; s.fillRect(13, 16, 2, 1); s.fillRect(13, 20, 2, 1); s.fillRect(13, 24, 2, 1);
    // Palm fronds crown
    s.fillStyle = P.PINE;
    s.fillRect(3, 11, 10, 4); s.fillRect(15, 11, 10, 4); s.fillRect(7, 6, 14, 6);
    s.fillStyle = P.GRASS;
    s.fillRect(4, 10, 9, 3); s.fillRect(15, 10, 9, 3); s.fillRect(8, 5, 12, 5);
    s.fillStyle = P.LIME;
    s.fillRect(9, 4, 10, 3); s.fillRect(5, 10, 5, 1); s.fillRect(18, 10, 5, 1);
    s.fillStyle = P.RUST; s.fillRect(12, 12, 2, 2); s.fillRect(15, 12, 2, 2); // Dates/coconuts
    sprites.push(makeObsEntry('palmera', 'Obstáculo: Palmera', s));
  }

  return sprites;
}

function buildSecanoOverrides() {
  const C = SECANO_PALETTE;
  const sprites = [];
  const paint = (s, color, x, y, w, h) => {
    s.fillStyle = color;
    s.fillRect(x, y, w, h);
  };

  // Seamless fine soil texture with occasional larger clusters of dry vegetation.
  for (let v = 0; v < 8; v++) {
    const s = new PixelSurface(16, 16);
    paint(s, C.EARTH, 0, 0, 16, 16);
    for (let i = 0; i < 22; i++) {
      const x = (i * 7 + v * 3) % 16;
      const y = (i * 11 + v * 5 + Math.floor(i / 4)) % 16;
      paint(s, i % 3 ? C.EARTH_LIGHT : C.EARTH_DARK, x, y, 1, 1);
    }
    if (v === 1 || v === 2) {
      paint(s, C.DUST, 3, 11, 2, 1);
      paint(s, C.DUST_LIGHT, 12, 4, 1, 1);
    }
    if (v === 3 || v === 4) {
      paint(s, C.SHADOW, 5, 13, 8, 1);
      for (const [x, y, h] of [[6, 8, 5], [8, 5, 8], [10, 8, 5], [12, 10, 3]]) {
        paint(s, C.DRY_GRASS, x, y, 1, h);
        paint(s, C.STRAW, x - 1, y - 1, 1, 3);
        paint(s, C.STRAW_LIGHT, x - 1, y - 1, 1, 1);
      }
    }
    if (v === 5) {
      paint(s, C.STONE_SHADE, 4, 10, 4, 2);
      paint(s, C.STONE_MID, 4, 9, 3, 2);
      paint(s, C.STONE_LIGHT, 5, 9, 2, 1);
    }
    if (v === 6) {
      paint(s, C.OLIVE_DARK, 9, 7, 1, 6);
      paint(s, C.OLIVE, 7, 10, 5, 1);
      paint(s, C.THISTLE, 7, 6, 2, 2);
      paint(s, C.THISTLE, 10, 4, 2, 2);
    }
    if (v === 7) {
      paint(s, C.DUST, 3, 7, 3, 1);
      paint(s, C.EARTH_DARK, 10, 11, 2, 1);
    }
    sprites.push(makeTileEntry(v, s));
  }

  for (const id of ['wall_h', 'wall_v']) {
    const { visW: w, visH: h } = OBSTACLE_TYPES[id];
    const s = new PixelSurface(w, h);
    paint(s, C.SHADOW, 3, 6, w - 3, h - 6);
    paint(s, C.MORTAR, 1, 4, w - 4, h - 7);
    for (let y = 3; y < h - 4; y += 5) {
      const row = (y - 3) / 5;
      for (let x = 1 - (row % 2) * 3; x < w - 3; x += 7) {
        const width = Math.min(6, w - 3 - x);
        paint(s, row % 2 ? C.STONE_MID : C.STONE_LIGHT, x, y, width, 4);
        paint(s, C.STONE_TOP, x, y, width - 1, 1);
        paint(s, C.STONE_SHADE, x + width - 1, y + 1, 1, 3);
      }
    }
    s.clearRect(1, 0, 3, 5);
    s.clearRect(w - 9, 0, 4, 6);
    paint(s, C.STONE_MID, 1, h - 4, 3, 2);
    sprites.push(makeObsEntry(id, 'Obstáculo: Muro de piedra seca', s));
  }

  {
    const s = new PixelSurface(26, 20);
    paint(s, C.SHADOW, 4, 15, 21, 4);
    paint(s, C.STONE_SHADE, 3, 8, 19, 8);
    paint(s, C.STONE_MID, 4, 5, 15, 8);
    paint(s, C.STONE_LIGHT, 7, 3, 10, 5);
    paint(s, C.STONE_TOP, 7, 3, 9, 2);
    paint(s, C.STONE_LIGHT, 4, 6, 7, 2);
    paint(s, C.MORTAR, 16, 8, 1, 5);
    paint(s, C.MORTAR, 17, 12, 3, 1);
    sprites.push(makeObsEntry('rock', 'Obstáculo: Piedra caliza', s));
  }

  {
    const s = new PixelSurface(32, 32);
    paint(s, C.SHADOW, 7, 27, 24, 4);
    paint(s, C.BARK, 15, 15, 4, 14);
    paint(s, C.BARK_LIGHT, 15, 18, 1, 10);
    paint(s, C.BARK, 11, 17, 5, 3);
    paint(s, C.BARK, 18, 14, 5, 3);
    const crowns = [[2, 9, 10, 10], [7, 4, 12, 16], [15, 3, 10, 16], [22, 8, 8, 12], [10, 13, 15, 10]];
    for (const [x, y, w, h] of crowns) {
      paint(s, C.OLIVE_DARK, x, y + 2, w, h);
      paint(s, C.OLIVE, x + 1, y, w - 2, h - 2);
      paint(s, C.OLIVE_LIGHT, x + 2, y, w - 4, 4);
      paint(s, C.OLIVE_SUN, x + 2, y, 3, 2);
    }
    paint(s, C.BARK, 17, 20, 2, 4);
    sprites.push(makeObsEntry('bush', 'Obstáculo: Olivo', s));
  }

  const base = buildObstacleSurfaces();
  const names = {
    wreck: 'Coche abandonado', crate: 'Caja de madera', crate_dmg: 'Caja dañada',
    barrel: 'Bidón oxidado', barrel_dmg: 'Bidón oxidado dañado',
  };
  for (const id of ['wreck', 'crate', 'crate_dmg', 'barrel', 'barrel_dmg']) {
    const s = base[id];
    const colors = {
      [PALETTE.UMBER]: C.SHADOW,
      [PALETTE.COBALT]: C.BLUE_PAINT,
      [PALETTE.SLATE]: C.BLUE_SHADE,
      [PALETTE.STONE]: C.METAL,
      [PALETTE.SILVER]: C.METAL_LIGHT,
      [PALETTE.SAND]: C.WOOD_LIGHT,
      [PALETTE.DIRT]: C.WOOD,
      [PALETTE.SOIL]: C.WOOD_DARK,
      [PALETTE.RUST]: id === 'wreck' ? C.RUST_DARK : C.WOOD_LIGHT,
    };
    for (let i = 0; i < s.data.length; i += 4) {
      const hex = '#' + Array.from(s.data.slice(i, i + 3), n => n.toString(16).padStart(2, '0')).join('');
      if (s.data[i + 3] && colors[hex]) s.data.set(hexToRgba(colors[hex]), i);
    }
    if (id === 'wreck') {
      paint(s, C.BLUE_LIGHT, 12, 3, 16, 1);
      paint(s, C.RUST_DARK, 4, 13, 3, 1);
      paint(s, C.BLUE_LIGHT, 14, 12, 9, 1);
    }
    sprites.push(makeObsEntry(id, `Obstáculo: ${names[id]}`, s));
  }
  return sprites;
}

function buildIndustrialOverrides() {
  const C = INDUSTRIAL_PALETTE;
  const E = SECANO_PALETTE;
  const sprites = [];
  const paint = (s, color, x, y, w, h) => {
    s.fillStyle = color;
    s.fillRect(x, y, w, h);
  };

  for (let v = 0; v < 8; v++) {
    const s = new PixelSurface(16, 16);
    paint(s, C.GROUND, 0, 0, 16, 16);
    for (let i = 0; i < 19; i++) {
      paint(s, i % 2 ? C.GRAVEL : C.GROUND_DARK,
        (i * 7 + v * 3) % 16, (i * 11 + v * 5 + Math.floor(i / 3)) % 16, 1, 1);
    }
    if (v === 2) {
      paint(s, C.CONCRETE, 4, 9, 3, 2);
      paint(s, E.STONE_TOP, 4, 9, 2, 1);
    }
    if (v === 3) {
      paint(s, C.GROUND_DARK, 4, 7, 5, 3);
      paint(s, C.OXIDE, 5, 6, 4, 2);
      paint(s, C.OXIDE_LIGHT, 5, 6, 2, 1);
    }
    if (v === 4 || v === 6) {
      paint(s, E.OLIVE_DARK, 7, 7, 1, 5);
      paint(s, E.DRY_GRASS, 5, 9, 1, 3);
      paint(s, E.OLIVE, 8, 9, 3, 1);
      paint(s, E.STRAW, 5, 8, 1, 2);
    }
    if (v === 5) {
      paint(s, C.STEEL_DARK, 4, 9, 6, 2);
      paint(s, C.STEEL, 4, 8, 6, 1);
      paint(s, C.STEEL_LIGHT, 5, 8, 2, 1);
    }
    if (v === 7) {
      paint(s, E.STONE_TOP, 5, 8, 3, 2);
      paint(s, C.GROUND_DARK, 7, 10, 3, 1);
    }
    sprites.push(makeTileEntry(v, s));
  }

  // Diamond mesh panels, concrete footings and rusted posts keep a readable silhouette.
  for (const id of ['wall_h', 'wall_v']) {
    const w = id === 'wall_h' ? 42 : 14;
    const h = id === 'wall_h' ? 26 : 42;
    const s = new PixelSurface(w, h);
    paint(s, C.GROUND_DARK, 3, h - 3, w - 3, 3);
    for (let y = 5; y < h - 5; y++) {
      for (let x = 3; x < w - 3; x++) {
        if ((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) {
          paint(s, (x + y) % 3 ? C.STEEL : C.STEEL_LIGHT, x, y, 1, 1);
        }
      }
    }
    for (const x of [1, w - 4]) {
      paint(s, C.STEEL_DARK, x, 2, 3, h - 4);
      paint(s, C.STEEL_LIGHT, x, 2, 1, h - 8);
      paint(s, C.OXIDE, x + 1, h - 12, 1, 6);
      paint(s, C.CONCRETE, x - 1, h - 5, 5, 3);
    }
    paint(s, C.STEEL, 3, 4, w - 6, 1);
    paint(s, C.OXIDE, 3, h - 7, w - 6, 1);
    if (id === 'wall_h') {
      paint(s, C.HAZARD, 17, 11, 7, 5);
      paint(s, C.STEEL_DARK, 19, 12, 2, 3);
    }
    sprites.push(makeObsEntry(id, 'Obstáculo: Verja metálica', s));
  }

  for (const [id, body, light, dark, label] of [
    ['container', C.TEAL, C.TEAL_LIGHT, C.TEAL_DARK, 'Contenedor marítimo'],
    ['container_rust', C.OXIDE, C.OXIDE_LIGHT, E.WOOD_DARK, 'Contenedor oxidado'],
  ]) {
    const s = new PixelSurface(64, 40);
    paint(s, C.GROUND_DARK, 4, 35, 60, 5);
    paint(s, dark, 2, 12, 60, 24);
    paint(s, body, 2, 12, 53, 22);
    paint(s, light, 5, 4, 50, 8);
    paint(s, body, 2, 8, 56, 5);
    paint(s, dark, 55, 10, 7, 26);
    for (let x = 6; x < 53; x += 5) {
      paint(s, light, x, 14, 1, 17);
      paint(s, dark, x + 1, 14, 1, 18);
      paint(s, body, x, 6, 2, 2);
    }
    paint(s, C.STEEL_DARK, 30, 13, 1, 21);
    for (const x of [26, 33]) {
      paint(s, C.STEEL_LIGHT, x, 15, 1, 16);
      paint(s, C.STEEL, x - 1, 21, 3, 1);
    }
    paint(s, E.STONE_TOP, 7, 16, 8, 3);
    paint(s, C.OXIDE, 7, 30, 5, 2);
    paint(s, C.OXIDE_LIGHT, 46, 15, 3, 2);
    paint(s, C.STEEL_DARK, 5, 33, 49, 2);
    sprites.push(makeObsEntry(id, `Obstáculo: ${label}`, s));
  }

  {
    const s = new PixelSurface(34, 30);
    paint(s, C.GROUND_DARK, 4, 25, 30, 4);
    paint(s, C.TEAL_DARK, 3, 10, 27, 15);
    paint(s, C.TEAL, 4, 12, 23, 11);
    paint(s, C.STEEL_DARK, 2, 7, 29, 5);
    paint(s, C.TEAL_LIGHT, 3, 6, 26, 2);
    paint(s, C.STEEL, 6, 4, 12, 2);
    paint(s, E.STONE_TOP, 17, 3, 8, 4);
    paint(s, C.OXIDE, 8, 17, 4, 4);
    paint(s, C.HAZARD, 20, 14, 5, 3);
    paint(s, C.STEEL_DARK, 6, 24, 4, 4);
    paint(s, C.STEEL_DARK, 25, 24, 4, 4);
    for (const x of [8, 15, 22]) paint(s, C.TEAL_DARK, x, 12, 1, 11);
    sprites.push(makeObsEntry('dumpster', 'Obstáculo: Contenedor de residuos', s));
  }

  // Low Jersey barriers, with chipped concrete and diagonal safety markings.
  {
    const s = new PixelSurface(26, 20);
    paint(s, C.GROUND_DARK, 3, 16, 23, 3);
    paint(s, E.STONE_SHADE, 2, 9, 22, 8);
    paint(s, C.CONCRETE, 5, 4, 16, 8);
    paint(s, E.STONE_TOP, 5, 4, 16, 2);
    paint(s, C.CONCRETE, 3, 11, 19, 4);
    paint(s, C.HAZARD, 4, 11, 17, 3);
    for (const x of [5, 11, 17]) {
      paint(s, C.STEEL_DARK, x, 11, 2, 1);
      paint(s, C.STEEL_DARK, x + 1, 12, 2, 1);
      paint(s, C.STEEL_DARK, x + 2, 13, 2, 1);
    }
    paint(s, E.STONE_SHADE, 18, 6, 2, 3);
    sprites.push(makeObsEntry('rock', 'Obstáculo: Barrera de hormigón', s));
  }

  for (const damaged of [false, true]) {
    const s = new PixelSurface(18, 18);
    paint(s, C.GROUND_DARK, 3, 14, 15, 3);
    paint(s, E.WOOD_DARK, 1, 5, 14, 10);
    for (const y of [4, 8, 12]) {
      paint(s, E.WOOD, 1, y, 14, 2);
      paint(s, E.WOOD_LIGHT, 2, y, 12, 1);
      paint(s, C.STEEL, 3, y, 1, 1);
      paint(s, C.STEEL, 12, y, 1, 1);
    }
    if (damaged) {
      s.clearRect(8, 4, 3, 6);
      paint(s, E.WOOD_LIGHT, 7, 12, 4, 1);
    }
    sprites.push(makeObsEntry(damaged ? 'crate_dmg' : 'crate', 'Obstáculo: Palés de madera', s));
  }

  // Wrecks, fuel drums and brambles share familiar gameplay silhouettes.
  const base = buildObstacleSurfaces();
  for (const id of ['wreck', 'barrel', 'barrel_dmg', 'bush']) {
    const s = base[id];
    const colors = {
      [PALETTE.UMBER]: C.GROUND_DARK, [PALETTE.COBALT]: C.TEAL,
      [PALETTE.SLATE]: C.STEEL_DARK, [PALETTE.STONE]: C.STEEL,
      [PALETTE.SILVER]: C.STEEL_LIGHT, [PALETTE.RUST]: C.OXIDE,
      [PALETTE.PINE]: E.OLIVE_DARK, [PALETTE.GRASS]: E.OLIVE,
      [PALETTE.LIME]: E.DRY_GRASS,
    };
    for (let i = 0; i < s.data.length; i += 4) {
      const hex = '#' + Array.from(s.data.slice(i, i + 3), n => n.toString(16).padStart(2, '0')).join('');
      if (s.data[i + 3] && colors[hex]) s.data.set(hexToRgba(colors[hex]), i);
    }
    if (id === 'wreck') {
      paint(s, C.OXIDE_LIGHT, 5, 10, 4, 2);
      paint(s, C.STEEL_DARK, 22, 6, 1, 4);
      paint(s, C.OXIDE, 14, 13, 7, 2);
    }
    const names = { wreck: 'Furgoneta abandonada', barrel: 'Bidón de combustible', barrel_dmg: 'Bidón dañado', bush: 'Zarzas' };
    sprites.push(makeObsEntry(id, `Obstáculo: ${names[id]}`, s));
  }
  return sprites;
}

function buildCostaOverrides() {
  const C = COSTA_PALETTE;
  const sprites = [];
  const paint = (s, color, x, y, w, h) => {
    s.fillStyle = color;
    s.fillRect(x, y, w, h);
  };
  // Rasterized elliptical clusters preserve stepped pixel edges and organic silhouettes.
  const oval = (s, color, cx, cy, rx, ry) => {
    s.fillStyle = color;
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if (x * x / (rx * rx) + y * y / (ry * ry) <= 1) s.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  };

  for (let v = 0; v < 8; v++) {
    const s = new PixelSurface(16, 16);
    paint(s, C.SAND, 0, 0, 16, 16);
    for (let i = 0; i < 11; i++) {
      paint(s, i % 3 ? C.SAND_LIGHT : C.SAND_SHADE,
        (i * 7 + v * 3) % 16, (i * 11 + v * 5 + Math.floor(i / 4)) % 16, 1, 1);
    }
    if (v === 2 || v === 5) {
      paint(s, C.SAND_SHADE, 4, 10, 4, 2);
      paint(s, C.STUCCO, 4, 9, 3, 2);
      paint(s, C.CREAM, 5, 9, 2, 1);
    }
    if (v === 3 || v === 6) {
      paint(s, C.LEAF_DARK, 7, 8, 1, 5);
      paint(s, C.LEAF, 5, 11, 5, 1);
      paint(s, C.LEAF_LIGHT, 8, 9, 2, 1);
      paint(s, v === 3 ? C.LAVENDER : C.FLOWER, 6, 6, 3, 3);
      paint(s, v === 3 ? C.LAVENDER_LIGHT : C.FLOWER_LIGHT, 6, 6, 2, 1);
    }
    if (v === 4) {
      paint(s, C.BARK, 5, 9, 1, 4);
      paint(s, C.BARK_LIGHT, 6, 11, 1, 2);
      paint(s, C.FLOWER, 5, 7, 1, 2);
      paint(s, C.SAND_GLOW, 10, 4, 2, 1);
    }
    if (v === 7) {
      paint(s, C.CREAM, 5, 9, 3, 2);
      paint(s, C.WHITE, 6, 8, 1, 2);
      paint(s, C.SAND_SHADE, 8, 10, 2, 1);
    }
    sprites.push(makeTileEntry(v, s));
  }

  for (const id of ['wall_h', 'wall_v']) {
    const { visW: w, visH: h } = OBSTACLE_TYPES[id];
    const s = new PixelSurface(w, h);
    paint(s, C.SHADOW, 3, 6, w - 3, h - 6);
    paint(s, C.STUCCO, 1, 6, w - 4, h - 9);
    paint(s, C.CREAM, 1, 6, w - 7, h - 12);
    paint(s, C.CORAL, 1, h - 9, w - 4, 4);
    paint(s, C.CORAL_DARK, w - 5, 7, 2, h - 10);
    paint(s, C.TERRACOTTA, 0, 3, w - 3, 4);
    for (let x = 1; x < w - 3; x += 4) {
      paint(s, C.TILE_LIGHT, x, 3, 2, 2);
      paint(s, C.TILE_DARK, x + 2, 4, 1, 3);
    }
    paint(s, C.STUCCO_SHADE, 8, 9, 3, 2);
    paint(s, C.STUCCO_SHADE, 3, h - 10, 2, 2);
    sprites.push(makeObsEntry(id, 'Obstáculo: Muro encalado', s));
  }

  {
    const s = new PixelSurface(26, 20);
    oval(s, C.SHADOW, 15, 16, 10, 3);
    oval(s, C.STUCCO_SHADE, 13, 11, 10, 6);
    oval(s, C.STUCCO, 12, 9, 9, 6);
    oval(s, C.CREAM, 11, 7, 7, 3);
    paint(s, C.WHITE, 7, 5, 6, 1);
    paint(s, C.SHADOW, 17, 10, 1, 4);
    paint(s, C.LEAF, 3, 15, 4, 1);
    sprites.push(makeObsEntry('rock', 'Obstáculo: Roca de playa', s));
  }

  {
    const s = new PixelSurface(32, 26);
    oval(s, C.SHADOW, 17, 22, 13, 3);
    for (const [x, y, rx, ry] of [[8, 15, 6, 6], [16, 10, 8, 7], [24, 15, 6, 6]]) {
      oval(s, C.LEAF_DARK, x, y + 2, rx, ry);
      oval(s, C.LEAF, x, y, rx, ry);
      oval(s, C.LEAF_LIGHT, x - 1, y - 3, rx - 2, 3);
      paint(s, C.LEAF_GLOW, x - 3, y - 5, 3, 1);
    }
    for (const [x, y] of [[6, 12], [12, 7], [19, 9], [25, 14], [16, 17]]) {
      paint(s, C.CORAL, x, y, 3, 3);
      paint(s, C.CORAL_LIGHT, x, y, 2, 1);
      paint(s, C.FLOWER_LIGHT, x + 1, y + 1, 1, 1);
    }
    sprites.push(makeObsEntry('bush', 'Obstáculo: Adelfa en flor', s));
  }

  for (const damaged of [false, true]) {
    const s = new PixelSurface(18, 18);
    paint(s, C.SHADOW, 3, 14, 15, 3);
    paint(s, C.TURQUOISE_DARK, 1, 5, 15, 10);
    paint(s, C.TURQUOISE, 1, 6, 12, 8);
    paint(s, C.TURQUOISE_LIGHT, 1, 2, 12, 4);
    paint(s, C.CREAM, 2, 7, 11, 1);
    paint(s, C.METAL, 3, 5, 1, 9);
    paint(s, C.METAL, 11, 5, 1, 9);
    paint(s, C.METAL_LIGHT, 7, 7, 3, 2);
    if (damaged) {
      paint(s, C.DEEP_SHADOW, 6, 3, 2, 5);
      paint(s, C.BARK_LIGHT, 6, 8, 4, 1);
    }
    sprites.push(makeObsEntry(damaged ? 'crate_dmg' : 'crate', 'Obstáculo: Baúl de camping', s));
  }

  for (const damaged of [false, true]) {
    const s = new PixelSurface(14, 17);
    oval(s, C.SHADOW, 8, 14, 5, 2);
    paint(s, C.CORAL_DARK, 2, 4, 9, 10);
    paint(s, C.CORAL, 3, 3, 7, 11);
    paint(s, C.CORAL_LIGHT, 3, 5, 2, 7);
    paint(s, C.METAL, 4, 1, 5, 2);
    paint(s, C.METAL_LIGHT, 5, 0, 3, 1);
    paint(s, C.FLOWER, 3, 8, 7, 3);
    paint(s, C.DEEP_SHADOW, 6, 9, 2, 1);
    if (damaged) paint(s, C.WHITE, 8, 5, 1, 2);
    sprites.push(makeObsEntry(damaged ? 'barrel_dmg' : 'barrel', 'Obstáculo: Bombona de camping', s));
  }

  {
    const s = new PixelSurface(42, 24);
    paint(s, C.SHADOW, 3, 19, 38, 4);
    paint(s, C.TURQUOISE_DARK, 2, 11, 36, 9);
    paint(s, C.TURQUOISE, 2, 10, 35, 7);
    paint(s, C.CREAM, 11, 3, 18, 4);
    paint(s, C.WHITE, 13, 2, 14, 1);
    paint(s, C.GLASS_DARK, 11, 7, 18, 5);
    paint(s, C.GLASS, 12, 7, 7, 4);
    paint(s, C.GLASS_LIGHT, 13, 7, 3, 1);
    paint(s, C.GLASS, 21, 7, 6, 4);
    paint(s, C.CREAM, 2, 12, 35, 2);
    paint(s, C.CORAL_DARK, 5, 15, 5, 2);
    paint(s, C.METAL_LIGHT, 1, 17, 4, 2);
    paint(s, C.METAL, 34, 17, 4, 2);
    paint(s, C.FLOWER_LIGHT, 2, 11, 2, 2);
    paint(s, C.CORAL, 35, 11, 2, 2);
    for (const x of [7, 28]) {
      paint(s, C.DEEP_SHADOW, x, 18, 6, 4);
      paint(s, C.METAL, x + 2, 19, 2, 2);
    }
    sprites.push(makeObsEntry('wreck', 'Obstáculo: Coche de veraneo', s));
  }

  {
    const s = new PixelSurface(64, 40);
    oval(s, C.SHADOW, 34, 35, 29, 4);
    paint(s, C.STUCCO_SHADE, 3, 10, 56, 24);
    paint(s, C.CREAM, 3, 10, 52, 21);
    paint(s, C.WHITE, 7, 4, 44, 7);
    paint(s, C.STUCCO, 4, 8, 52, 2);
    paint(s, C.TURQUOISE, 3, 24, 52, 7);
    paint(s, C.TURQUOISE_LIGHT, 3, 24, 52, 2);
    for (const x of [8, 23]) {
      paint(s, C.TURQUOISE_DARK, x, 13, 12, 9);
      paint(s, C.GLASS, x + 1, 14, 10, 6);
      paint(s, C.GLASS_LIGHT, x + 2, 14, 7, 2);
      paint(s, C.CREAM, x + 5, 14, 1, 7);
      paint(s, C.CORAL, x + 1, 14, 2, 6);
    }
    paint(s, C.TURQUOISE_DARK, 40, 13, 11, 18);
    paint(s, C.STUCCO, 41, 14, 9, 16);
    paint(s, C.GLASS, 42, 15, 7, 6);
    paint(s, C.METAL, 42, 24, 2, 1);
    paint(s, C.METAL, 19, 6, 13, 2);
    paint(s, C.STUCCO_SHADE, 21, 6, 1, 2);
    paint(s, C.STUCCO_SHADE, 25, 6, 1, 2);
    for (const x of [12, 44]) {
      paint(s, C.DEEP_SHADOW, x, 32, 7, 5);
      paint(s, C.METAL, x + 2, 33, 3, 3);
    }
    paint(s, C.CORAL_DARK, 5, 29, 4, 2);
    sprites.push(makeObsEntry('caravan', 'Obstáculo: Caravana retro', s));
  }

  {
    const s = new PixelSurface(50, 48);
    paint(s, C.SHADOW, 5, 41, 44, 5);
    paint(s, C.STUCCO_SHADE, 5, 20, 39, 22);
    paint(s, C.CREAM, 5, 20, 33, 21);
    paint(s, C.CORAL, 5, 34, 33, 7);
    paint(s, C.TILE_DARK, 2, 16, 44, 5);
    for (let y = 6; y < 18; y += 4) {
      const inset = Math.floor((18 - y) / 3);
      paint(s, C.TERRACOTTA, 2 + inset, y, 44 - inset * 2, 4);
      for (let x = 4 + inset; x < 43 - inset; x += 5) {
        paint(s, C.TILE_LIGHT, x, y, 2, 2);
        paint(s, C.TILE_DARK, x + 2, y + 2, 1, 2);
      }
    }
    paint(s, C.TURQUOISE_DARK, 10, 23, 23, 11);
    paint(s, C.GLASS_DARK, 13, 24, 17, 8);
    paint(s, C.TURQUOISE, 10, 23, 3, 11);
    paint(s, C.TURQUOISE, 30, 23, 3, 11);
    paint(s, C.BARK_LIGHT, 9, 33, 25, 3);
    paint(s, C.FLOWER, 16, 28, 3, 4);
    paint(s, C.CORAL_LIGHT, 23, 29, 4, 3);
    paint(s, C.WHITE, 19, 21, 7, 1);
    paint(s, C.STUCCO_SHADE, 7, 39, 4, 2);
    sprites.push(makeObsEntry('kiosk', 'Obstáculo: Chiringuito cerrado', s));
  }

  {
    const s = new PixelSurface(40, 46);
    oval(s, C.SHADOW, 23, 41, 14, 3);
    for (let y = 16; y < 42; y++) {
      const x = 20 + Math.floor((y - 16) / 9);
      paint(s, C.BARK, x, y, 3, 1);
      paint(s, C.BARK_LIGHT, x, y, 1, 1);
      if (y % 4 === 0) paint(s, C.DEEP_SHADOW, x + 1, y, 2, 1);
    }
    const fronds = [
      [[20, 15], [15, 9], [8, 8], [3, 12]],
      [[20, 15], [12, 14], [5, 19], [2, 24]],
      [[20, 15], [19, 6], [15, 3], [11, 4]],
      [[20, 15], [25, 7], [32, 6], [37, 9]],
      [[20, 15], [29, 14], [35, 18], [38, 23]],
      [[20, 15], [25, 20], [29, 26], [29, 30]],
    ];
    for (const points of fronds) {
      for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let j = 0; j <= steps; j++) {
          const x = Math.round(x0 + (x1 - x0) * j / steps);
          const y = Math.round(y0 + (y1 - y0) * j / steps);
          paint(s, C.PALM_DARK, x - 1, y, 3, 4);
          paint(s, C.PALM, x - 1, y, 3, 2);
          paint(s, C.PALM_LIGHT, x, y, 1, 1);
        }
      }
    }
    paint(s, C.BARK, 18, 17, 3, 3);
    sprites.push(makeObsEntry('palm', 'Obstáculo: Palmera mediterránea', s));
  }

  {
    const s = new PixelSurface(46, 26);
    oval(s, C.SHADOW, 24, 21, 21, 3);
    oval(s, C.TURQUOISE_DARK, 22, 14, 21, 8);
    oval(s, C.CREAM, 22, 12, 20, 7);
    oval(s, C.TURQUOISE, 22, 11, 16, 4);
    oval(s, C.TURQUOISE_DARK, 22, 11, 12, 2);
    for (const x of [12, 23, 32]) paint(s, C.BARK_LIGHT, x, 8, 2, 7);
    paint(s, C.CORAL, 5, 17, 33, 2);
    paint(s, C.WHITE, 7, 7, 8, 1);
    sprites.push(makeObsEntry('boat', 'Obstáculo: Barca varada', s));
  }
  return sprites;
}

function buildObrasOverrides() {
  const C = OBRAS_PALETTE;
  const sprites = [];
  const rect = (s, color, x, y, w, h) => {
    s.fillStyle = color;
    s.fillRect(x, y, w, h);
  };
  const line = (s, color, x0, y0, x1, y1, width = 1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      rect(s, color, Math.round(x0 + (x1 - x0) * i / steps),
        Math.round(y0 + (y1 - y0) * i / steps), width, width);
    }
  };
  const oval = (s, color, cx, cy, rx, ry) => {
    for (let y = -ry; y <= ry; y++) {
      const span = Math.floor(rx * Math.sqrt(Math.max(0, 1 - y * y / (ry * ry))));
      rect(s, color, cx - span, cy + y, span * 2 + 1, 1);
    }
  };
  const poly = (s, color, points) => {
    const minY = Math.min(...points.map(p => p[1]));
    const maxY = Math.max(...points.map(p => p[1]));
    for (let y = minY; y <= maxY; y++) {
      const hits = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          hits.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i < hits.length; i += 2) {
        rect(s, color, Math.ceil(hits[i]), y, Math.floor(hits[i + 1]) - Math.ceil(hits[i]) + 1, 1);
      }
    }
  };
  // Material grain is deterministic and restricted to opaque pixels in the chosen region.
  const grain = (s, colors, x, y, w, h, seed, density = 9) => {
    for (let py = y; py < Math.min(s.h, y + h); py++) {
      for (let px = x; px < Math.min(s.w, x + w); px++) {
        const hash = ((px * 73856093) ^ (py * 19349663) ^ (seed * 83492791)) >>> 0;
        if (hash % density === 0 && s.data[(py * s.w + px) * 4 + 3]) {
          rect(s, colors[(hash >>> 9) % colors.length], px, py, 1, 1);
        }
      }
    }
  };
  const bolts = (s, x, y, w, h) => {
    for (const px of [x, x + w]) for (const py of [y, y + h]) {
      rect(s, C.STEEL_DEEP, px, py, 2, 2);
      rect(s, C.STEEL_LIGHT, px, py, 1, 1);
    }
  };
  const tire = (s, x, y, r) => {
    oval(s, C.RUBBER, x, y, r, r);
    oval(s, C.RUBBER_LIGHT, x - 1, y - 1, r - 1, r - 1);
    oval(s, C.RUBBER, x, y, r - 2, r - 2);
    oval(s, C.STEEL, x, y, Math.max(1, r - 3), Math.max(1, r - 3));
    rect(s, C.STEEL_GLOW, x - 1, y - 1, 1, 1);
  };

  for (let v = 0; v < 8; v++) {
    const s = new PixelSurface(16, 16);
    rect(s, C.EARTH, 0, 0, 16, 16);
    grain(s, [C.EARTH_LIGHT, C.EARTH_DARK, C.DUST], 0, 0, 16, 16, v + 7, 12);
    if (v === 2) {
      rect(s, C.MUD, 3, 8, 5, 3);
      rect(s, C.CONCRETE_SHADE, 3, 7, 4, 3);
      rect(s, C.CONCRETE_LIGHT, 4, 7, 2, 1);
      rect(s, C.BRICK_DARK, 11, 12, 3, 2);
      rect(s, C.BRICK_LIGHT, 11, 11, 2, 1);
    }
    if (v === 3) {
      rect(s, C.RUST, 5, 8, 7, 1);
      rect(s, C.STEEL_LIGHT, 5, 7, 6, 1);
      rect(s, C.STEEL_DARK, 4, 7, 1, 4);
    }
    if (v === 4) {
      line(s, C.WOOD_DARK, 5, 5, 10, 10, 2);
      line(s, C.WOOD_LIGHT, 5, 5, 10, 10);
      rect(s, C.RUST, 7, 7, 1, 1);
    }
    if (v === 5) {
      rect(s, C.WHITE, 5, 8, 4, 3);
      rect(s, C.CONCRETE_SHADE, 8, 9, 1, 2);
      rect(s, C.RED, 6, 8, 1, 2);
    }
    if (v === 6) {
      line(s, C.LEAF, 7, 6, 7, 12);
      line(s, C.LEAF, 5, 9, 10, 11);
      rect(s, C.LEAF_LIGHT, 7, 6, 1, 2);
    }
    if (v === 7) {
      rect(s, C.MUD_DARK, 5, 9, 6, 1);
      rect(s, C.MUD, 7, 10, 1, 3);
      rect(s, C.EARTH_LIGHT, 7, 8, 4, 1);
    }
    sprites.push(makeTileEntry(v, s));
  }

  // Excavator with a jointed boom, exposed hydraulic ram, glazed cab and steel track links.
  {
    const s = new PixelSurface(80, 64);
    oval(s, C.SHADOW, 42, 57, 36, 5);
    oval(s, C.RUBBER, 28, 52, 24, 8);
    rect(s, C.RUBBER, 7, 47, 44, 11);
    oval(s, C.RUBBER_LIGHT, 28, 51, 22, 6);
    for (const x of [12, 21, 30, 39, 46]) tire(s, x, 52, 4);
    for (let x = 8; x < 49; x += 4) {
      rect(s, C.STEEL_DARK, x, 45, 3, 2);
      rect(s, C.STEEL, x, 45, 2, 1);
      rect(s, C.STEEL_DARK, x, 57, 3, 2);
    }
    rect(s, C.STEEL_DEEP, 18, 42, 23, 5);
    poly(s, C.YELLOW_DARK, [[8, 31], [31, 29], [42, 34], [40, 44], [8, 44]]);
    rect(s, C.YELLOW, 8, 31, 20, 10);
    rect(s, C.YELLOW_LIGHT, 10, 29, 17, 3);
    rect(s, C.YELLOW_GLOW, 11, 29, 10, 1);
    for (let x = 11; x < 23; x += 3) rect(s, C.SHADOW_DEEP, x, 34, 1, 5);
    rect(s, C.RUST, 10, 40, 5, 2);
    poly(s, C.STEEL_DEEP, [[27, 14], [43, 14], [46, 34], [27, 34]]);
    poly(s, C.GLASS, [[29, 17], [41, 17], [43, 29], [29, 29]]);
    poly(s, C.GLASS_LIGHT, [[30, 17], [35, 17], [40, 27], [37, 27]]);
    line(s, C.GLASS_GLOW, 30, 17, 39, 17);
    rect(s, C.STEEL_DARK, 36, 17, 1, 12);
    rect(s, C.YELLOW_LIGHT, 26, 12, 18, 3);
    rect(s, C.YELLOW, 27, 31, 18, 8);
    rect(s, C.YELLOW_DARK, 39, 32, 5, 7);
    rect(s, C.STEEL, 29, 35, 4, 1);
    rect(s, C.SHADOW_DEEP, 19, 23, 3, 7);
    rect(s, C.STEEL, 19, 23, 2, 1);
    poly(s, C.YELLOW_DARK, [[40, 35], [47, 35], [58, 10], [53, 7]]);
    poly(s, C.YELLOW, [[41, 31], [45, 32], [55, 10], [53, 8]]);
    line(s, C.YELLOW_GLOW, 43, 28, 53, 9);
    poly(s, C.YELLOW_DARK, [[53, 8], [58, 10], [70, 40], [65, 43]]);
    poly(s, C.YELLOW_LIGHT, [[55, 10], [58, 12], [68, 38], [65, 36]]);
    line(s, C.STEEL_DEEP, 44, 35, 52, 18, 2);
    line(s, C.STEEL_LIGHT, 45, 33, 52, 18);
    line(s, C.STEEL_DEEP, 57, 17, 64, 33, 2);
    line(s, C.STEEL_LIGHT, 58, 18, 64, 31);
    oval(s, C.STEEL_DEEP, 55, 11, 3, 3);
    rect(s, C.STEEL_GLOW, 54, 10, 2, 2);
    poly(s, C.STEEL_DARK, [[64, 39], [69, 38], [77, 49], [75, 56], [64, 56], [60, 51]]);
    poly(s, C.RUST, [[65, 43], [68, 42], [73, 50], [71, 53], [63, 52]]);
    line(s, C.STEEL_LIGHT, 62, 52, 74, 55);
    for (const x of [65, 69, 73]) rect(s, C.STEEL_DEEP, x, 55, 2, 3);
    bolts(s, 29, 32, 12, 5);
    sprites.push(makeObsEntry('excavator', 'Obstáculo: Excavadora de cadenas', s));
  }

  // Corrugated portable site office, complete with roof seams, shutters, steps and notices.
  {
    const s = new PixelSurface(72, 54);
    poly(s, C.SHADOW, [[7, 44], [66, 44], [71, 50], [12, 51]]);
    poly(s, C.BLUE_DARK, [[58, 14], [66, 10], [66, 42], [58, 47]]);
    rect(s, C.CONCRETE, 4, 15, 55, 29);
    rect(s, C.WHITE, 5, 15, 52, 24);
    for (let x = 7; x < 58; x += 4) rect(s, C.CONCRETE, x, 16, 1, 27);
    rect(s, C.BLUE, 4, 36, 55, 8);
    rect(s, C.BLUE_LIGHT, 4, 36, 55, 1);
    poly(s, C.STEEL, [[2, 13], [11, 5], [67, 5], [60, 14]]);
    poly(s, C.STEEL_LIGHT, [[3, 12], [12, 5], [66, 5], [59, 12]]);
    for (let x = 14; x < 65; x += 6) line(s, C.STEEL, x, 6, x - 6, 11);
    rect(s, C.STEEL_GLOW, 12, 5, 51, 1);
    rect(s, C.STEEL_DARK, 2, 13, 59, 2);
    for (const x of [9, 29]) {
      rect(s, C.BLUE_DARK, x, 19, 15, 12);
      rect(s, C.STEEL_LIGHT, x + 1, 20, 13, 10);
      rect(s, C.GLASS, x + 2, 21, 11, 8);
      poly(s, C.GLASS_LIGHT, [[x + 2, 21], [x + 5, 21], [x + 10, 28], [x + 7, 28]]);
      rect(s, C.STEEL_LIGHT, x + 7, 21, 1, 8);
      rect(s, C.BLUE, x - 1, 18, 17, 2);
    }
    rect(s, C.BLUE_DARK, 47, 19, 10, 25);
    rect(s, C.BLUE_LIGHT, 48, 20, 8, 23);
    rect(s, C.GLASS, 49, 22, 6, 7);
    rect(s, C.GLASS_LIGHT, 50, 23, 3, 1);
    rect(s, C.STEEL_DEEP, 49, 33, 2, 1);
    rect(s, C.WHITE, 39, 32, 5, 4);
    rect(s, C.RED, 40, 33, 3, 1);
    rect(s, C.YELLOW, 7, 32, 5, 4);
    rect(s, C.SHADOW_DEEP, 9, 33, 1, 2);
    rect(s, C.CONCRETE_DARK, 46, 44, 13, 3);
    rect(s, C.CONCRETE_LIGHT, 45, 47, 16, 2);
    grain(s, [C.RUST, C.CONCRETE_SHADE], 5, 39, 39, 4, 32, 9);
    sprites.push(makeObsEntry('site_office', 'Obstáculo: Caseta de obra', s));
  }

  // Scaffold wraps a partially built brick wall, with diagonal bracing and timber decks.
  {
    const s = new PixelSurface(60, 64);
    poly(s, C.SHADOW, [[5, 54], [52, 54], [59, 60], [13, 62]]);
    rect(s, C.BRICK_DARK, 10, 21, 39, 33);
    for (let y = 22; y < 53; y += 5) {
      for (let x = 10 - ((y - 22) / 5 % 2) * 4; x < 48; x += 9) {
        rect(s, C.BRICK, Math.max(10, x), y, Math.min(8, 49 - Math.max(10, x)), 4);
        rect(s, C.BRICK_LIGHT, Math.max(10, x), y, Math.min(7, 48 - Math.max(10, x)), 1);
      }
    }
    s.clearRect(12, 20, 9, 6);
    s.clearRect(39, 20, 10, 11);
    grain(s, [C.BRICK_LIGHT, C.BRICK_DARK], 11, 29, 36, 22, 15, 13);
    for (const y of [19, 38]) {
      rect(s, C.WOOD_DARK, 3, y, 50, 4);
      rect(s, C.WOOD_LIGHT, 3, y, 48, 1);
      rect(s, C.WOOD, 6, y + 1, 44, 1);
      line(s, C.STEEL, 5, y + 4, 49, y + 4);
    }
    for (const x of [5, 29, 52]) {
      rect(s, C.STEEL_DARK, x, 7, 3, 49);
      rect(s, C.STEEL_LIGHT, x, 7, 1, 48);
      rect(s, C.CONCRETE, x - 2, 55, 6, 2);
      for (const y of [12, 24, 41]) rect(s, C.RUST, x - 1, y, 4, 2);
    }
    line(s, C.STEEL_DARK, 7, 22, 29, 55, 2);
    line(s, C.STEEL_LIGHT, 7, 22, 29, 54);
    line(s, C.STEEL, 30, 54, 52, 22);
    line(s, C.STEEL_LIGHT, 7, 10, 52, 10);
    line(s, C.STEEL, 7, 16, 52, 16);
    rect(s, C.ORANGE, 34, 32, 7, 5);
    rect(s, C.ORANGE_LIGHT, 35, 31, 5, 2);
    rect(s, C.STEEL_DARK, 36, 30, 3, 1);
    for (let y = 27; y < 57; y += 5) line(s, C.YELLOW_LIGHT, 45, y, 49, y);
    line(s, C.YELLOW_DARK, 44, 25, 44, 58);
    line(s, C.YELLOW_DARK, 50, 25, 50, 58);
    sprites.push(makeObsEntry('scaffold', 'Obstáculo: Andamio y muro en obras', s));
  }

  {
    const s = new PixelSurface(38, 42);
    oval(s, C.SHADOW, 22, 36, 15, 4);
    line(s, C.STEEL_DEEP, 14, 23, 7, 35, 3);
    line(s, C.STEEL, 23, 22, 28, 35, 3);
    line(s, C.STEEL_DARK, 8, 33, 30, 33, 2);
    tire(s, 11, 35, 5);
    tire(s, 28, 35, 4);
    poly(s, C.ORANGE_DARK, [[8, 10], [16, 4], [29, 8], [32, 18], [25, 25], [11, 22]]);
    oval(s, C.ORANGE, 18, 15, 11, 10);
    oval(s, C.ORANGE_LIGHT, 15, 11, 7, 5);
    line(s, C.YELLOW_GLOW, 11, 8, 18, 6);
    oval(s, C.STEEL_DARK, 27, 10, 7, 5);
    oval(s, C.SHADOW_DEEP, 27, 10, 5, 3);
    rect(s, C.CONCRETE_SHADE, 26, 11, 6, 1);
    line(s, C.CONCRETE, 11, 17, 17, 20);
    oval(s, C.STEEL, 6, 22, 4, 6);
    oval(s, C.STEEL_LIGHT, 6, 22, 2, 4);
    rect(s, C.STEEL_DEEP, 8, 22, 6, 2);
    grain(s, [C.CONCRETE, C.ORANGE_DARK], 9, 17, 14, 6, 19, 8);
    sprites.push(makeObsEntry('mixer', 'Obstáculo: Hormigonera', s));
  }

  {
    const s = new PixelSurface(44, 32);
    rect(s, C.SHADOW, 4, 26, 39, 4);
    rect(s, C.WOOD_DARK, 3, 24, 36, 4);
    for (const x of [5, 18, 31]) rect(s, C.WOOD_LIGHT, x, 24, 6, 2);
    for (let row = 0; row < 3; row++) {
      const y = 20 - row * 6;
      const start = 5 + row * 3;
      for (let x = start; x < 37 - row * 2; x += 9) {
        rect(s, C.BRICK_DARK, x, y, 8, 5);
        rect(s, C.BRICK, x, y, 7, 4);
        poly(s, C.BRICK_LIGHT, [[x, y], [x + 2, y - 3], [x + 9, y - 3], [x + 7, y]]);
        rect(s, C.BRICK_GLOW, x + 2, y - 3, 5, 1);
        rect(s, C.BRICK_DARK, x + 3, y - 2, 1, 1);
        rect(s, C.BRICK_DARK, x + 6, y - 2, 1, 1);
      }
    }
    rect(s, C.STEEL, 15, 7, 1, 17);
    rect(s, C.STEEL_LIGHT, 15, 7, 1, 4);
    grain(s, [C.BRICK_GLOW, C.BRICK_DARK], 7, 15, 27, 8, 31, 17);
    sprites.push(makeObsEntry('bricks', 'Obstáculo: Palé de ladrillos', s));
  }

  {
    const s = new PixelSurface(48, 34);
    oval(s, C.SHADOW, 26, 28, 21, 4);
    rect(s, C.WOOD_DARK, 4, 27, 39, 3);
    for (const [x, y] of [[10, 22], [25, 22], [17, 12]]) {
      poly(s, C.CONCRETE_DARK, [[x, y - 6], [x + 17, y - 9], [x + 20, y - 3], [x + 3, y + 6]]);
      line(s, C.CONCRETE_LIGHT, x + 1, y - 6, x + 16, y - 9, 2);
      oval(s, C.CONCRETE_SHADE, x, y, 7, 7);
      oval(s, C.CONCRETE_LIGHT, x - 1, y - 1, 6, 6);
      oval(s, C.CONCRETE_DARK, x, y, 4, 4);
      oval(s, C.SHADOW_DEEP, x + 1, y, 3, 3);
      rect(s, C.CONCRETE, x - 4, y + 3, 3, 1);
    }
    sprites.push(makeObsEntry('pipes', 'Obstáculo: Tubos de saneamiento', s));
  }

  // Full-size panelled steel fences with concrete feet, reflectors and chipped red paint.
  for (const id of ['wall_h', 'wall_v']) {
    const w = id === 'wall_h' ? 44 : 16;
    const h = id === 'wall_h' ? 28 : 44;
    const s = new PixelSurface(w, h);
    rect(s, C.SHADOW, 3, h - 3, w - 3, 3);
    rect(s, C.STEEL_DARK, 3, 5, w - 7, h - 10);
    rect(s, C.BLUE, 3, 5, w - 8, h - 12);
    for (let x = 4; x < w - 4; x += 3) {
      rect(s, C.STEEL_LIGHT, x, 6, 1, h - 13);
      rect(s, C.BLUE_DARK, x + 1, 6, 1, h - 12);
    }
    for (const y of [9, h - 10]) {
      rect(s, C.WHITE, 3, y, w - 7, 3);
      for (let x = 5; x < w - 5; x += 8) {
        line(s, C.RED, x, y, x + 2, y + 2, 2);
      }
    }
    for (const x of [1, w - 5]) {
      rect(s, C.STEEL_DEEP, x, 3, 2, h - 5);
      rect(s, C.STEEL_LIGHT, x, 3, 1, h - 8);
      rect(s, C.CONCRETE_SHADE, x - 1, h - 5, 5, 3);
      rect(s, C.CONCRETE_LIGHT, x - 1, h - 5, 4, 1);
    }
    grain(s, [C.RUST, C.STEEL_DARK], 4, h - 13, w - 9, 4, 14, 7);
    bolts(s, 3, 6, w - 9, h - 15);
    sprites.push(makeObsEntry(id, 'Obstáculo: Cerramiento de obra', s));
  }

  {
    const s = new PixelSurface(30, 24);
    oval(s, C.SHADOW, 16, 20, 13, 3);
    poly(s, C.CONCRETE_DARK, [[2, 17], [7, 8], [19, 4], [26, 13], [28, 20], [5, 21]]);
    poly(s, C.CONCRETE, [[3, 16], [8, 8], [17, 5], [21, 12], [16, 17]]);
    poly(s, C.CONCRETE_LIGHT, [[7, 8], [17, 5], [20, 10], [10, 12]]);
    grain(s, [C.CONCRETE_SHADE, C.CONCRETE_LIGHT, C.DUST], 5, 8, 20, 12, 45, 5);
    rect(s, C.BRICK_DARK, 4, 17, 6, 3);
    rect(s, C.BRICK_LIGHT, 4, 17, 5, 1);
    line(s, C.RUST, 20, 10, 22, 2);
    line(s, C.STEEL_DARK, 24, 12, 27, 5);
    sprites.push(makeObsEntry('rock', 'Obstáculo: Escombros y ferralla', s));
  }

  for (const damaged of [false, true]) {
    const s = new PixelSurface(22, 24);
    rect(s, C.SHADOW, 3, 19, 18, 4);
    rect(s, C.WOOD_DARK, 2, 7, 17, 13);
    rect(s, C.WOOD, 2, 7, 14, 12);
    poly(s, C.WOOD_LIGHT, [[2, 7], [5, 3], [19, 3], [16, 7]]);
    for (const y of [10, 15]) {
      rect(s, C.WOOD_DARK, 3, y, 12, 1);
      rect(s, C.WOOD_LIGHT, 4, y + 1, 5, 1);
    }
    for (const x of [4, 13]) rect(s, C.STEEL_DARK, x, 7, 2, 12);
    bolts(s, 4, 8, 9, 9);
    if (damaged) {
      line(s, C.SHADOW_DEEP, 9, 4, 7, 11);
      line(s, C.SHADOW_DEEP, 7, 11, 11, 15);
      rect(s, C.WOOD_LIGHT, 8, 15, 3, 1);
    }
    sprites.push(makeObsEntry(damaged ? 'crate_dmg' : 'crate', 'Obstáculo: Cajón de herramientas', s));
  }

  for (const damaged of [false, true]) {
    const s = new PixelSurface(16, 22);
    oval(s, C.SHADOW, 9, 18, 6, 3);
    rect(s, C.ORANGE_DARK, 3, 5, 10, 13);
    rect(s, C.ORANGE, 3, 5, 8, 12);
    rect(s, C.ORANGE_LIGHT, 4, 6, 2, 10);
    oval(s, C.STEEL_DARK, 8, 5, 5, 2);
    oval(s, C.STEEL, 7, 4, 4, 1);
    rect(s, C.SHADOW_DEEP, 9, 3, 2, 1);
    for (const y of [8, 15]) rect(s, C.STEEL_DARK, 3, y, 10, 1);
    rect(s, C.YELLOW_LIGHT, 5, 10, 5, 3);
    rect(s, C.SHADOW_DEEP, 7, 11, 1, 1);
    grain(s, [C.RUST, C.ORANGE_LIGHT], 4, 16, 8, 2, 24, 4);
    if (damaged) line(s, C.SHADOW_DEEP, 10, 6, 9, 13);
    sprites.push(makeObsEntry(damaged ? 'barrel_dmg' : 'barrel', 'Obstáculo: Bidón de gasóleo', s));
  }

  {
    const s = new PixelSurface(32, 26);
    oval(s, C.SHADOW, 17, 22, 14, 3);
    poly(s, C.MUD_DARK, [[3, 20], [8, 10], [18, 5], [27, 14], [30, 22]]);
    grain(s, [C.MUD, C.EARTH, C.EARTH_LIGHT], 5, 11, 22, 11, 16, 3);
    for (const [x, y] of [[5, 18], [10, 11], [17, 9], [24, 15]]) {
      line(s, C.LEAF, x, y, x + 1, y - 4);
      rect(s, C.LEAF_LIGHT, x, y - 4, 2, 1);
    }
    sprites.push(makeObsEntry('bush', 'Obstáculo: Matorral sobre tierra apilada', s));
  }

  {
    const s = new PixelSurface(48, 30);
    oval(s, C.SHADOW, 25, 25, 22, 4);
    rect(s, C.STEEL_DEEP, 4, 15, 39, 9);
    rect(s, C.WHITE, 5, 14, 35, 7);
    rect(s, C.CONCRETE_SHADE, 26, 10, 15, 10);
    for (let x = 28; x < 40; x += 4) rect(s, C.CONCRETE_LIGHT, x, 11, 3, 4);
    poly(s, C.BLUE_DARK, [[8, 5], [22, 5], [26, 14], [7, 14]]);
    rect(s, C.GLASS, 9, 7, 11, 6);
    line(s, C.GLASS_LIGHT, 10, 7, 18, 7);
    rect(s, C.BLUE, 8, 14, 17, 7);
    rect(s, C.BLUE_LIGHT, 8, 14, 16, 1);
    rect(s, C.STEEL_LIGHT, 4, 20, 3, 2);
    rect(s, C.YELLOW_LIGHT, 5, 16, 2, 2);
    rect(s, C.RED, 39, 18, 2, 2);
    rect(s, C.STEEL_DARK, 21, 15, 2, 1);
    tire(s, 12, 24, 4);
    tire(s, 36, 24, 4);
    grain(s, [C.RUST, C.MUD], 9, 19, 31, 2, 7, 9);
    sprites.push(makeObsEntry('wreck', 'Obstáculo: Camioneta de obra', s));
  }
  {
    const s = new PixelSurface(42, 34);
    oval(s, C.SHADOW, 24, 29, 17, 3);
    tire(s, 11, 27, 5);
    line(s, C.STEEL_DEEP, 11, 25, 29, 21, 2);
    line(s, C.STEEL, 26, 22, 31, 29, 2);
    line(s, C.STEEL_LIGHT, 30, 29, 33, 29);
    line(s, C.STEEL_DARK, 26, 21, 38, 12, 2);
    line(s, C.STEEL_LIGHT, 27, 20, 37, 12);
    rect(s, C.RUBBER, 35, 10, 5, 3);
    poly(s, C.BLUE_DARK, [[7, 13], [29, 12], [27, 23], [14, 24]]);
    poly(s, C.BLUE, [[8, 13], [29, 12], [24, 20], [13, 21]]);
    oval(s, C.MUD, 19, 12, 11, 5);
    grain(s, [C.EARTH, C.CONCRETE, C.BRICK_LIGHT], 9, 8, 20, 8, 23, 4);
    line(s, C.STEEL_LIGHT, 7, 13, 29, 12);
    line(s, C.BLUE_LIGHT, 13, 21, 25, 20);
    rect(s, C.RUST, 15, 20, 3, 1);
    sprites.push(makeObsEntry('wheelbarrow', 'Obstáculo: Carretilla cargada', s));
  }

  {
    const s = new PixelSurface(42, 30);
    rect(s, C.SHADOW, 4, 25, 37, 4);
    rect(s, C.WOOD_DARK, 3, 23, 35, 4);
    for (let x = 5; x < 36; x += 8) rect(s, C.WOOD_LIGHT, x, 23, 6, 2);
    for (const [x, y] of [[5, 16], [21, 16], [10, 9], [25, 9], [15, 3]]) {
      rect(s, C.CONCRETE_SHADE, x + 1, y + 1, 14, 7);
      rect(s, C.WHITE, x, y, 13, 6);
      rect(s, C.CONCRETE_LIGHT, x + 1, y + 5, 12, 2);
      rect(s, C.RED, x + 3, y, 2, 6);
      rect(s, C.CONCRETE_SHADE, x + 7, y + 2, 4, 1);
      line(s, C.CONCRETE_SHADE, x, y + 1, x + 1, y + 4);
      rect(s, C.STEEL_GLOW, x + 7, y, 4, 1);
    }
    grain(s, [C.DUST, C.CONCRETE_SHADE], 5, 17, 30, 6, 6, 13);
    sprites.push(makeObsEntry('cement', 'Obstáculo: Sacos de cemento', s));
  }
  return sprites;
}

// Returns theme override definitions: each theme only lists the PNGs, config, custom obstacles & custom weapons it adds/overrides
export function buildAllThemeOverrides() {
  return {
    obras: {
      revision: 2,
      config: BATTLE_THEMES.obras,
      obstacles: {
        wheelbarrow: {
          name: 'Carretilla cargada', w: 30, h: 14, visW: 42, visH: 34,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 4, sprite: 'obs_wheelbarrow.png',
        },
        cement: {
          name: 'Sacos de cemento', w: 36, h: 16, visW: 42, visH: 30,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 5, sprite: 'obs_cement.png',
        },
        excavator: {
          name: 'Excavadora de cadenas', w: 66, h: 24, visW: 80, visH: 64,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 1, maxCount: 3, sprite: 'obs_excavator.png',
        },
        site_office: {
          name: 'Caseta de obra', w: 62, h: 24, visW: 72, visH: 54,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 1, maxCount: 3, sprite: 'obs_site_office.png',
        },
        scaffold: {
          name: 'Andamio y muro', w: 50, h: 24, visW: 60, visH: 64,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 4, sprite: 'obs_scaffold.png',
        },
        mixer: {
          name: 'Hormigonera', w: 28, h: 18, visW: 38, visH: 42,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 5, sprite: 'obs_mixer.png',
        },
        bricks: {
          name: 'Palé de ladrillos', w: 38, h: 18, visW: 44, visH: 32,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 3, maxCount: 6, sprite: 'obs_bricks.png',
        },
        pipes: {
          name: 'Tubos de saneamiento', w: 40, h: 18, visW: 48, visH: 34,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 5, sprite: 'obs_pipes.png',
        },
      },
      sprites: buildObrasOverrides(),
    },
    costa: {
      revision: 1,
      config: BATTLE_THEMES.costa,
      obstacles: {
        caravan: {
          name: 'Caravana retro', w: 58, h: 20, visW: 64, visH: 40,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 5, sprite: 'obs_caravan.png',
        },
        kiosk: {
          name: 'Chiringuito cerrado', w: 42, h: 24, visW: 50, visH: 48,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 1, maxCount: 3, sprite: 'obs_kiosk.png',
        },
        palm: {
          name: 'Palmera', w: 14, h: 10, visW: 40, visH: 46,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 4, maxCount: 8, sprite: 'obs_palm.png',
        },
        boat: {
          name: 'Barca varada', w: 42, h: 14, visW: 46, visH: 26,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 5, sprite: 'obs_boat.png',
        },
      },
      sprites: buildCostaOverrides(),
    },
    industrial: {
      revision: 1,
      config: BATTLE_THEMES.industrial,
      obstacles: {
        container: {
          name: 'Contenedor marítimo', w: 60, h: 22, visW: 64, visH: 40,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 5, sprite: 'obs_container.png',
        },
        container_rust: {
          name: 'Contenedor oxidado', w: 60, h: 22, visW: 64, visH: 40,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 1, maxCount: 5, sprite: 'obs_container_rust.png',
        },
        dumpster: {
          name: 'Contenedor de residuos', w: 30, h: 16, visW: 34, visH: 30,
          solid: true, blocksProjectiles: true, destructible: false,
          defaultCount: 2, maxCount: 6, sprite: 'obs_dumpster.png',
        },
      },
      sprites: buildIndustrialOverrides(),
    },
    secano: {
      revision: 2,
      config: BATTLE_THEMES.secano,
      sprites: buildSecanoOverrides(),
    },
    urbano: {
      revision: 2,
      config: BATTLE_THEMES.urbano,
      obstacles: {
        caseta: {
          name: 'Caseta Urbana',
          w: 44,
          h: 20,
          visW: 48,
          visH: 34,
          solid: true,
          blocksProjectiles: true,
          destructible: false,
          defaultCount: 2,
          maxCount: 6,
          sprite: 'obs_caseta.png',
        },
      },
      sprites: buildUrbanoOverrides(),
    },
    futuro: {
      revision: 2,
      config: BATTLE_THEMES.futuro,
      obstacles: {
        torre: {
          name: 'Torre Cyber',
          w: 22,
          h: 14,
          visW: 28,
          visH: 34,
          solid: true,
          blocksProjectiles: true,
          destructible: false,
          defaultCount: 3,
          maxCount: 8,
          sprite: 'obs_torre.png',
        },
      },
      weapons: {
        laser: {
          name: 'Pistola Láser',
          type: 'ranged',
          damage: 25,
          cooldown: 0.3,
          speed: 420,
          range: 280,
          spread: 0.02,
          pellets: 1,
          radius: 2.2,
          knockback: 55,
          ammo: 14,
          color: PALETTE.LIME,
          projectileColor: PALETTE.LIME,
          sprite: 'weapon_laser.png',
        },
      },
      sprites: buildFuturoOverrides(),
    },
    desierto: {
      revision: 2,
      config: BATTLE_THEMES.desierto,
      obstacles: {
        palmera: {
          name: 'Palmera',
          w: 14,
          h: 10,
          visW: 28,
          visH: 34,
          solid: true,
          blocksProjectiles: true,
          destructible: false,
          defaultCount: 4,
          maxCount: 10,
          sprite: 'obs_palmera.png',
        },
      },
      sprites: buildDesiertoOverrides(),
    },
  };
}
