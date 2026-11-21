// Lineless low-pixel 3/4 perspective sprite generator (characters 16x24px <= 32x32px)
import {
  PALETTE,
  SKIN_PRESETS,
  CHAR_SPRITE_W,
  CHAR_SPRITE_H,
  CHAR_MAX_SPRITE_SIZE,
  OBSTACLE_TYPES,
} from '../shared/constants.js';
import { encodeSpriteRLE, decodeSpriteRLE } from '../shared/spriteCodec.js';
export { encodeSpriteRLE, decodeSpriteRLE };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function drawGrid(ctx, grid, colorMap, ox = 0, oy = 0) {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = colorMap[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// Slender lineless low-pixel 3/4 character (16x24px, NO black outlines, feet at y=21)
function buildCharacterSprite(skin, frame, flashWhite = false) {
  if (CHAR_SPRITE_W > CHAR_MAX_SPRITE_SIZE || CHAR_SPRITE_H > CHAR_MAX_SPRITE_SIZE) {
    throw new Error(`Character sprite exceeds ${CHAR_MAX_SPRITE_SIZE}px limit`);
  }

  const { c, ctx } = makeCanvas(CHAR_SPRITE_W, CHAR_SPRITE_H);
  const P = PALETTE;

  // Frame 0: idle, Frame 1: idle breathe, Frame 2: run stride A, Frame 3: run stride B
  const bob = frame === 1 ? 1 : 0;

  const cm = flashWhite
    ? {
        S: P.BONE,
        s: P.BONE,
        H: P.BONE,
        T: P.BONE,
        A: P.BONE,
        P: P.BONE,
        B: P.BONE,
        W: P.BONE,
        E: P.BONE,
      }
    : {
        S: P.SAND,       // Warm skin
        s: P.RUST,       // Subtle warm skin/neck shade
        H: skin.hair,    // Hair primary
        T: skin.shirt,   // Shirt / jacket
        A: skin.accent,  // Belt / scarf / hat trim / stripe
        P: skin.pants,   // Pants / leggings
        B: P.INK,        // Boots / shoes
        W: P.BONE,       // Bright white eyes
        E: P.INK,        // Pupils / dark detail
      };

  // Subtle lineless cast shadow under feet
  if (!flashWhite) {
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(5, 21, 7, 2);
    ctx.fillRect(6, 20, 5, 1);
  }

  // Head & hair rows (rows 0..6 inside 16px wide grid)
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
    default: // bandana
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

  // Slender torso + swinging arms + expressive slender legs (rows 7..20)
  let bodyRows;
  if (frame === 2) {
    // Run stride wide
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
    // Run stride passing
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
    // Idle 3/4 stance (matches reference silhouette!)
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

  // Merge head and body cleanly
  const yStart = 2 + bob;
  drawGrid(ctx, headRows, cm, 0, yStart);
  drawGrid(ctx, bodyRows, cm, 0, yStart + 6);

  // Subtle trailing hair for long style on shoulders
  if (skin.style === 'long' && !flashWhite) {
    ctx.fillStyle = skin.hair;
    ctx.fillRect(3, yStart + 6, 2, 3);
  }

  return c;
}

// Compact lineless low-pixel weapon & item sprites (12x12px, NO black outlines)
function buildWeaponSprites() {
  const P = PALETTE;
  const cm = {
    U: P.UMBER,
    O: P.SOIL,
    D: P.DIRT,
    N: P.SAND,
    W: P.BONE,
    G: P.GRASS,
    L: P.LIME,
    S: P.SLATE,
    M: P.STONE,
    V: P.SILVER,
    R: P.CRIMSON,
    F: P.RUST,
    Y: P.GOLD,
    B: P.COBALT,
    K: P.INK,
  };

  const grids = {
    fists: [
      '............',
      '............',
      '....NNN.....',
      '....NNF.....',
      '............',
      '......NNN...',
      '......NNF...',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    pipe: [
      '............',
      '........VV..',
      '.......VMV..',
      '......VFM...',
      '.....VMV....',
      '....VMV.....',
      '...VMV......',
      '..SMS.......',
      '.SS.........',
      '............',
      '............',
      '............',
    ],
    axe: [
      '............',
      '......VVV...',
      '.....VVMMF..',
      '.....VMFF...',
      '......SF....',
      '.....DD.....',
      '....DD......',
      '...DD.......',
      '..DU........',
      '.U..........',
      '............',
      '............',
    ],
    brick: [
      '............',
      '............',
      '............',
      '...FFFFFF...',
      '..FRRFRRFF..',
      '..RRRRRRRR..',
      '..RRRRRRRR..',
      '..UUUUUUUU..',
      '............',
      '............',
      '............',
      '............',
    ],
    slingshot: [
      '............',
      '...D...D....',
      '...D.R.D....',
      '....DRD.....',
      '.....D......',
      '.....D......',
      '.....D......',
      '.....U......',
      '............',
      '............',
      '............',
      '............',
    ],
    pistol: [
      '............',
      '............',
      '............',
      '..VVVVVVV...',
      '..MMMMMMMS..',
      '..SSSSSS....',
      '..FF.SS.....',
      '..FF........',
      '..UU........',
      '............',
      '............',
      '............',
    ],
    shotgun: [
      '............',
      '............',
      '............',
      '....VVVVVVVV',
      '.FFSSSSSSSSS',
      'FFFDDSSSS...',
      'FFU.........',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    rifle: [
      '............',
      '.....BBB....',
      '....VVVVVVVV',
      'FFFFMMMMMMMM',
      'FFDD..SSSS..',
      'FF..........',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
    molotov: [
      '............',
      '......Y.....',
      '.....YFY....',
      '.....WW.....',
      '.....GG.....',
      '....GLGG....',
      '....GFFG....',
      '....GFYG....',
      '....GRFG....',
      '....GGGG....',
      '............',
      '............',
    ],
    medkit: [
      '............',
      '....SSSS....',
      '..WWWWWWWW..',
      '..WWWRRWWW..',
      '..WWRRRRWW..',
      '..WWWRRWWW..',
      '..WWWWWWWW..',
      '..VVVVVVVV..',
      '............',
      '............',
      '............',
      '............',
    ],
  };

  const out = {};
  for (const [id, grid] of Object.entries(grids)) {
    const { c, ctx } = makeCanvas(12, 12);
    drawGrid(ctx, grid, cm, 0, 0);
    out[id] = c;
  }
  return out;
}

// 3/4 Perspective Lineless Obstacles (top surface + vertical front face + cast shadow, ZERO outlines!)
function buildObstacleSprites() {
  const P = PALETTE;
  const sprites = {};

  // 1. 3/4 Sculpted Boulder (26x20)
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.rock;
    const { c, ctx } = makeCanvas(w, h);
    // Cast ground shadow to bottom-right
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(4, h - 5, w - 5, 4);
    ctx.fillRect(6, h - 6, w - 7, 2);
    // Shaded vertical front-right rock face
    ctx.fillStyle = P.SLATE;
    ctx.fillRect(3, 8, w - 7, h - 11);
    ctx.fillRect(2, 11, w - 5, h - 14);
    // Mid-tone angled front-left face
    ctx.fillStyle = P.STONE;
    ctx.fillRect(4, 5, w - 10, h - 10);
    ctx.fillRect(6, 3, w - 14, 7);
    // Sunlit top plane
    ctx.fillStyle = P.SILVER;
    ctx.fillRect(7, 2, 10, 4);
    ctx.fillRect(5, 4, 8, 3);
    // Rock crease & tiny scrub grass at base
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(14, 7, 2, 6);
    ctx.fillRect(16, 11, 3, 1);
    ctx.fillStyle = P.PINE;
    ctx.fillRect(2, h - 6, 4, 2);
    ctx.fillStyle = P.GRASS;
    ctx.fillRect(3, h - 7, 3, 2);
    sprites.rock = c;
  }

  // 2. 3/4 Horizontal Ruined Wall (42x22) — sunlit top ledge + vertical brick wall front!
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wall_h;
    const { c, ctx } = makeCanvas(w, h);
    // Ground cast shadow
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(3, h - 4, w - 3, 4);
    // Vertical front face (height ~12px in perspective)
    ctx.fillStyle = P.SLATE;
    ctx.fillRect(1, 7, w - 4, h - 10);
    // Right depth edge
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(w - 3, 5, 2, h - 8);
    // Sunlit top ledge (top surface in 3/4 view)
    ctx.fillStyle = P.SILVER;
    ctx.fillRect(1, 2, w - 4, 3);
    ctx.fillStyle = P.STONE;
    ctx.fillRect(1, 5, w - 4, 2);
    // Weathered bricks on front face
    ctx.fillStyle = P.STONE;
    for (let x = 2; x < w - 8; x += 8) {
      ctx.fillRect(x, 8, 6, 3);
    }
    ctx.fillStyle = P.RUST;
    ctx.fillRect(6, 12, 6, 3);
    ctx.fillRect(22, 12, 6, 3);
    ctx.fillStyle = P.DIRT;
    ctx.fillRect(14, 12, 6, 3);
    ctx.fillRect(30, 12, 5, 3);
    // Chipped ruined gaps in the top
    ctx.clearRect(11, 1, 5, 3);
    ctx.clearRect(28, 1, 4, 2);
    sprites.wall_h = c;
  }

  // 3. 3/4 Vertical Ruined Wall (14x42)
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wall_v;
    const { c, ctx } = makeCanvas(w, h);
    // Cast shadow to the right and bottom
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(w - 3, 6, 3, h - 6);
    ctx.fillRect(3, h - 3, w - 3, 3);
    // Top ridge running vertically
    ctx.fillStyle = P.SILVER;
    ctx.fillRect(1, 1, 5, h - 12);
    ctx.fillStyle = P.STONE;
    ctx.fillRect(6, 1, 5, h - 12);
    // Subtle mortar seams along top
    ctx.fillStyle = P.SLATE;
    for (let y = 8; y < h - 12; y += 8) {
      ctx.fillRect(1, y, 10, 1);
    }
    // Front vertical end-face at bottom of wall (true 3/4 perspective!)
    ctx.fillStyle = P.SLATE;
    ctx.fillRect(1, h - 11, 10, 9);
    ctx.fillStyle = P.RUST;
    ctx.fillRect(2, h - 9, 4, 3);
    ctx.fillStyle = P.DIRT;
    ctx.fillRect(7, h - 6, 3, 3);
    sprites.wall_v = c;
  }

  // 4. 3/4 Perspective Wrecked Abandoned Car (42x24)
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.wreck;
    const { c, ctx } = makeCanvas(w, h);
    // Ground cast shadow
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(3, h - 5, w - 4, 5);
    // Side chassis (lower vertical body)
    ctx.fillStyle = P.SLATE;
    ctx.fillRect(2, 11, w - 6, 8);
    ctx.fillStyle = P.COBALT;
    ctx.fillRect(2, 10, w - 6, 6);
    // Hood & trunk top plane
    ctx.fillStyle = P.STONE;
    ctx.fillRect(3, 8, 9, 3);
    ctx.fillRect(w - 13, 8, 8, 3);
    // Cabin roof + 3/4 angled windows
    ctx.fillStyle = P.COBALT;
    ctx.fillRect(11, 3, 18, 3);
    ctx.fillStyle = P.SILVER;
    ctx.fillRect(12, 2, 16, 2); // Roof highlight
    // Windshield & side windows
    ctx.fillStyle = P.INK;
    ctx.fillRect(11, 6, 18, 5);
    ctx.fillStyle = P.SILVER;
    ctx.fillRect(13, 6, 5, 4);
    ctx.fillRect(21, 6, 6, 4);
    ctx.fillStyle = P.COBALT;
    ctx.fillRect(19, 6, 2, 5); // Door pillar
    // Rust blotches on side & hood
    ctx.fillStyle = P.RUST;
    ctx.fillRect(4, 9, 6, 4);
    ctx.fillRect(26, 12, 8, 4);
    ctx.fillStyle = P.CRIMSON;
    ctx.fillRect(29, 13, 3, 2);
    // Bumper & headlight
    ctx.fillStyle = P.GOLD;
    ctx.fillRect(2, 11, 2, 2);
    ctx.fillStyle = P.SILVER;
    ctx.fillRect(1, 15, 3, 2);
    ctx.fillRect(w - 6, 15, 3, 2);
    // Wheels sitting on the ground
    ctx.fillStyle = P.INK;
    ctx.fillRect(6, 16, 6, 5);
    ctx.fillRect(w - 15, 16, 6, 5);
    ctx.fillStyle = P.STONE;
    ctx.fillRect(8, 18, 2, 2);
    ctx.fillRect(w - 13, 18, 2, 2);
    sprites.wreck = c;
  }

  // 5. 3/4 Perspective Wooden Crate (18x18) — bright top + shaded vertical front + cross planks!
  for (const damaged of [false, true]) {
    const { visW: w, visH: h } = OBSTACLE_TYPES.crate;
    const { c, ctx } = makeCanvas(w, h);
    // Ground shadow
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(3, h - 4, w - 3, 4);
    // Sunlit top plane
    ctx.fillStyle = P.SAND;
    ctx.fillRect(1, 2, w - 4, 5);
    ctx.fillStyle = P.DIRT;
    ctx.fillRect(3, 3, w - 8, 3);
    // Front vertical face
    ctx.fillStyle = P.RUST;
    ctx.fillRect(1, 7, w - 4, 8);
    // Shaded right side plane (3/4 thickness)
    ctx.fillStyle = P.SOIL;
    ctx.fillRect(w - 3, 3, 2, 12);
    // Front plank framing & diagonal brace
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(2, 8, w - 6, 1);
    ctx.fillRect(2, 13, w - 6, 1);
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(4 + i, 8 + i, 2, 1);
    }
    // Corner nails
    ctx.fillStyle = P.SILVER;
    ctx.fillRect(2, 7, 1, 1);
    ctx.fillRect(w - 5, 7, 1, 1);
    if (damaged) {
      ctx.fillStyle = P.INK;
      ctx.fillRect(6, 4, 2, 5);
      ctx.fillRect(8, 8, 3, 2);
      ctx.fillRect(5, 10, 2, 4);
    }
    sprites[damaged ? 'crate_dmg' : 'crate'] = c;
  }

  // 6. 3/4 Standing Explosive Oil Barrel (14x17)
  for (const damaged of [false, true]) {
    const { visW: w, visH: h } = OBSTACLE_TYPES.barrel;
    const { c, ctx } = makeCanvas(w, h);
    // Cast shadow
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(3, h - 4, w - 3, 4);
    // Cylinder front body
    ctx.fillStyle = P.CRIMSON;
    ctx.fillRect(2, 4, 9, 10);
    // Lit left highlight & dark right cylinder curve
    ctx.fillStyle = P.RUST;
    ctx.fillRect(3, 4, 3, 10);
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(9, 4, 2, 10);
    // Oval metallic top lid
    ctx.fillStyle = P.STONE;
    ctx.fillRect(3, 1, 7, 3);
    ctx.fillStyle = P.SILVER;
    ctx.fillRect(4, 1, 4, 2);
    ctx.fillStyle = P.SLATE;
    ctx.fillRect(2, 3, 9, 1);
    // Hazard gold belt around middle
    ctx.fillStyle = P.GOLD;
    ctx.fillRect(2, 8, 9, 3);
    ctx.fillStyle = P.INK;
    ctx.fillRect(5, 9, 3, 1);
    // Bottom rim
    ctx.fillStyle = P.SLATE;
    ctx.fillRect(2, 13, 9, 1);
    if (damaged) {
      ctx.fillStyle = P.GOLD;
      ctx.fillRect(7, 4, 3, 3);
      ctx.fillStyle = P.BONE;
      ctx.fillRect(8, 5, 1, 1);
    }
    sprites[damaged ? 'barrel_dmg' : 'barrel'] = c;
  }

  // 7. 3/4 Volumetric Scrub Bush (26x20) — lineless layered foliage mound
  {
    const { visW: w, visH: h } = OBSTACLE_TYPES.bush;
    const { c, ctx } = makeCanvas(w, h);
    // Cast ground shadow
    ctx.fillStyle = P.UMBER;
    ctx.fillRect(4, h - 4, w - 6, 4);
    const blobs = [
      { x: 7, y: 12, r: 6 },
      { x: 18, y: 12, r: 6 },
      { x: 13, y: 8, r: 7 },
      { x: 13, y: 13, r: 6 },
    ];
    // Deep pine underside
    ctx.fillStyle = P.PINE;
    for (const b of blobs) {
      for (let y = -b.r; y <= b.r; y++) {
        for (let x = -b.r; x <= b.r; x++) {
          if (x * x + y * y <= b.r * b.r) ctx.fillRect(b.x + x, b.y + y, 1, 1);
        }
      }
    }
    // Mid foliage
    ctx.fillStyle = P.GRASS;
    for (const b of blobs) {
      for (let y = -b.r; y <= b.r - 3; y++) {
        for (let x = -b.r + 1; x <= b.r - 1; x++) {
          if (x * x + y * y <= (b.r - 1) * (b.r - 1)) ctx.fillRect(b.x + x, b.y + y - 1, 1, 1);
        }
      }
    }
    // Sunlit top leaf puffs
    ctx.fillStyle = P.LIME;
    ctx.fillRect(9, 2, 7, 3);
    ctx.fillRect(5, 6, 5, 3);
    ctx.fillRect(15, 6, 5, 2);
    ctx.fillRect(11, 9, 4, 2);
    sprites.bush = c;
  }

  return sprites;
}

function buildMiscSprites() {
  const P = PALETTE;
  const cm = { W: P.BONE, V: P.SILVER, K: P.INK, Y: P.GOLD, F: P.RUST, R: P.CRIMSON };

  // Lineless small skull (10x10)
  const skullGrid = [
    '..........',
    '..WWWWWW..',
    '.WWWWWWWW.',
    '.WWKWWKWW.',
    '.WWWWWWWW.',
    '..WWVVWW..',
    '...W.W.W..',
    '..........',
    '.WW....WW.',
    '..........',
  ];
  const skull = makeCanvas(10, 10);
  drawGrid(skull.ctx, skullGrid, cm);

  // Lineless small golden crown (10x8)
  const crownGrid = [
    '....YY....',
    '.Y..YY..Y.',
    '.YY.YY.YY.',
    '.YYYYYYYY.',
    '.YYRYYRYY.',
    '.YFFFFFFY.',
    '..........',
    '..........',
  ];
  const crown = makeCanvas(10, 8);
  drawGrid(crown.ctx, crownGrid, cm);

  return { skull: skull.c, crown: crown.c };
}

// Muted olive-ochre descampado 16x16 ground tiles (calm backdrop so lineless characters pop!)
function buildGroundTiles() {
  const P = PALETTE;
  const tiles = [];

  for (let variant = 0; variant < 8; variant++) {
    const { c, ctx } = makeCanvas(16, 16);
    ctx.fillStyle = P.SOIL;
    ctx.fillRect(0, 0, 16, 16);

    if (variant === 0 || variant === 1) {
      // Subtle warm earth speck
      ctx.fillStyle = P.DIRT;
      ctx.fillRect(3, 5, 2, 1);
      ctx.fillRect(11, 12, 2, 1);
    } else if (variant === 2) {
      // Sunlit dry dirt patch
      ctx.fillStyle = P.DIRT;
      ctx.fillRect(3, 4, 8, 5);
      ctx.fillRect(5, 3, 4, 7);
    } else if (variant === 3) {
      // Tiny grass tuft in perspective
      ctx.fillStyle = P.UMBER;
      ctx.fillRect(6, 11, 4, 1);
      ctx.fillStyle = P.PINE;
      ctx.fillRect(6, 9, 4, 2);
      ctx.fillStyle = P.GRASS;
      ctx.fillRect(6, 8, 1, 2);
      ctx.fillRect(8, 7, 1, 3);
      ctx.fillRect(10, 9, 1, 1);
    } else if (variant === 4) {
      // Tiny pebbles
      ctx.fillStyle = P.UMBER;
      ctx.fillRect(5, 7, 2, 1);
      ctx.fillStyle = P.STONE;
      ctx.fillRect(5, 6, 2, 1);
      ctx.fillStyle = P.DIRT;
      ctx.fillRect(11, 11, 2, 1);
    } else if (variant === 5) {
      // Subtle dry earth crack
      ctx.fillStyle = P.UMBER;
      ctx.fillRect(4, 6, 4, 1);
      ctx.fillRect(7, 7, 1, 3);
    } else if (variant === 6) {
      // Soft dark earth patch
      ctx.fillStyle = P.UMBER;
      ctx.fillRect(4, 7, 6, 3);
      ctx.fillStyle = P.SOIL;
      ctx.fillRect(5, 8, 4, 1);
    } else {
      // Sparse dry grass blades
      ctx.fillStyle = P.DIRT;
      ctx.fillRect(4, 9, 1, 2);
      ctx.fillRect(6, 8, 1, 3);
      ctx.fillRect(11, 5, 1, 2);
    }

    tiles.push(c);
  }
  return tiles;
}

export const EDITABLE_ASSETS = [
  // Characters (4 animation frames: Idle 1, Idle 2, Run 1, Run 2; max 32x32px)
  ...SKIN_PRESETS.map((s) => ({
    key: `char:${s.id}`,
    category: 'characters',
    id: s.id,
    name: `Personaje: ${s.name}`,
    w: CHAR_SPRITE_W,
    h: CHAR_SPRITE_H,
    maxW: CHAR_MAX_SPRITE_SIZE,
    maxH: CHAR_MAX_SPRITE_SIZE,
    animated: true,
    defaultFps: 8,
  })),
  // Weapons & Medkit
  { key: 'weapon:fists', category: 'weapons', id: 'fists', name: 'Arma: Puños', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'weapon:pipe', category: 'weapons', id: 'pipe', name: 'Arma: Tubo', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'weapon:axe', category: 'weapons', id: 'axe', name: 'Arma: Hacha', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'weapon:brick', category: 'weapons', id: 'brick', name: 'Arma: Ladrillos', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'weapon:slingshot', category: 'weapons', id: 'slingshot', name: 'Arma: Tirachinas', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'weapon:pistol', category: 'weapons', id: 'pistol', name: 'Arma: Pistola', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'weapon:shotgun', category: 'weapons', id: 'shotgun', name: 'Arma: Escopeta', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'weapon:rifle', category: 'weapons', id: 'rifle', name: 'Arma: Rifle', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'weapon:molotov', category: 'weapons', id: 'molotov', name: 'Arma: Molotov', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 8 },
  { key: 'weapon:medkit', category: 'weapons', id: 'medkit', name: 'Objeto: Botiquín', w: 12, h: 12, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  // 3/4 Perspective Obstacles
  { key: 'obs:rock', category: 'obstacles', id: 'rock', name: 'Obstáculo: Roca', w: OBSTACLE_TYPES.rock.visW, h: OBSTACLE_TYPES.rock.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  { key: 'obs:wall_h', category: 'obstacles', id: 'wall_h', name: 'Obstáculo: Muro Horiz.', w: OBSTACLE_TYPES.wall_h.visW, h: OBSTACLE_TYPES.wall_h.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  { key: 'obs:wall_v', category: 'obstacles', id: 'wall_v', name: 'Obstáculo: Muro Vert.', w: OBSTACLE_TYPES.wall_v.visW, h: OBSTACLE_TYPES.wall_v.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  { key: 'obs:wreck', category: 'obstacles', id: 'wreck', name: 'Obstáculo: Chatarra', w: OBSTACLE_TYPES.wreck.visW, h: OBSTACLE_TYPES.wreck.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  { key: 'obs:crate', category: 'obstacles', id: 'crate', name: 'Obstáculo: Caja', w: OBSTACLE_TYPES.crate.visW, h: OBSTACLE_TYPES.crate.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  { key: 'obs:crate_dmg', category: 'obstacles', id: 'crate_dmg', name: 'Obstáculo: Caja Dañada', w: OBSTACLE_TYPES.crate.visW, h: OBSTACLE_TYPES.crate.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  { key: 'obs:barrel', category: 'obstacles', id: 'barrel', name: 'Obstáculo: Bidón', w: OBSTACLE_TYPES.barrel.visW, h: OBSTACLE_TYPES.barrel.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  { key: 'obs:barrel_dmg', category: 'obstacles', id: 'barrel_dmg', name: 'Obstáculo: Bidón Dañado', w: OBSTACLE_TYPES.barrel.visW, h: OBSTACLE_TYPES.barrel.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  { key: 'obs:bush', category: 'obstacles', id: 'bush', name: 'Obstáculo: Arbusto', w: OBSTACLE_TYPES.bush.visW, h: OBSTACLE_TYPES.bush.visH, maxW: 64, maxH: 64, animated: false, defaultFps: 6 },
  // Ground Tiles (Fondos)
  ...Array.from({ length: 8 }, (_, i) => ({
    key: `tile:${i}`,
    category: 'groundTiles',
    id: i,
    name: `Fondo: Loseta Tierra #${i + 1}`,
    w: 16,
    h: 16,
    maxW: 32,
    maxH: 32,
    animated: false,
    defaultFps: 4,
  })),
  // Misc
  { key: 'misc:skull', category: 'misc', id: 'skull', name: 'Otros: Calavera', w: 10, h: 10, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
  { key: 'misc:crown', category: 'misc', id: 'crown', name: 'Otros: Corona', w: 10, h: 8, maxW: 32, maxH: 32, animated: false, defaultFps: 6 },
];

export function cloneCanvas(src) {
  const { c, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return c;
}

export function canvasToRgba(canvas) {
  const ctx = canvas.getContext('2d');
  return new Uint8ClampedArray(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

export function rgbaToCanvas(rgba, w, h) {
  const { c, ctx } = makeCanvas(w, h);
  const imgData = new ImageData(new Uint8ClampedArray(rgba), w, h);
  ctx.putImageData(imgData, 0, 0);
  return c;
}

export function canvasesToPngDataUrl(canvases) {
  if (!canvases || canvases.length === 0) return '';
  const w = canvases[0].width;
  const h = canvases[0].height;
  const { c, ctx } = makeCanvas(w * canvases.length, h);
  for (let i = 0; i < canvases.length; i++) {
    ctx.drawImage(canvases[i], i * w, 0);
  }
  return c.toDataURL('image/png');
}

export function loadPngStripToCanvases(url, frameW, frameH, frameCount = 1) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const count = Math.max(1, Number(frameCount) || Math.max(1, Math.round(img.width / frameW)));
      const fw = Number(frameW) || Math.floor(img.width / count);
      const fh = Number(frameH) || img.height;
      const canvases = [];
      for (let i = 0; i < count; i++) {
        const { c, ctx } = makeCanvas(fw, fh);
        ctx.drawImage(img, i * fw, 0, fw, fh, 0, 0, fw, fh);
        canvases.push(c);
      }
      resolve(canvases);
    };
    img.onerror = () => reject(new Error(`Failed to load PNG: ${url}`));
    img.src = url;
  });
}

export function buildWhiteFlashCanvas(srcCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const rgba = canvasToRgba(srcCanvas);
  // Parse PALETTE.BONE (#f5f0e1)
  const br = parseInt(PALETTE.BONE.slice(1, 3), 16);
  const bg = parseInt(PALETTE.BONE.slice(3, 5), 16);
  const bb = parseInt(PALETTE.BONE.slice(5, 7), 16);

  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] >= 16) {
      rgba[i] = br;
      rgba[i + 1] = bg;
      rgba[i + 2] = bb;
      rgba[i + 3] = 255;
    } else {
      rgba[i + 3] = 0;
    }
  }
  return rgbaToCanvas(rgba, w, h);
}

export function createSpriteAtlas() {
  const buildDefaultCharacters = () => {
    const chars = {};
    for (const skin of SKIN_PRESETS) {
      chars[skin.id] = {
        fps: 8,
        frames: [
          buildCharacterSprite(skin, 0, false),
          buildCharacterSprite(skin, 1, false),
          buildCharacterSprite(skin, 2, false),
          buildCharacterSprite(skin, 3, false),
        ],
        flash: buildCharacterSprite(skin, 0, true),
      };
    }
    return chars;
  };

  const atlas = {
    characters: buildDefaultCharacters(),
    weapons: buildWeaponSprites(),
    obstacles: buildObstacleSprites(),
    misc: buildMiscSprites(),
    groundTiles: buildGroundTiles(),
    activeTheme: 'campo',
    serverCatalog: null,
    // Dynamic asset list (defaults + newly created custom sprites saved on server)
    assets: EDITABLE_ASSETS.map((a) => ({ ...a, isDefault: true })),
    // Optional multi-frame animations for non-character assets (weapons, obstacles, tiles, misc)
    animations: new Map(), // assetKey -> { frames: [canvas...], fps }
    // Custom character sprites sent by multiplayer peers
    playerCustomChars: new Map(), // playerId -> { frames: [canvas...], flash: canvas, fps }
    // Custom store dictionary (assetKey -> RLE object for live multiplayer sync)
    customStore: {},
    // Cached per-theme sprite bundles for rendering miniature battlefield previews in the carousel
    themePreviewCache: new Map(),

    invalidateThemePreviewCache(themeId = null) {
      if (themeId) {
        this.themePreviewCache.delete(themeId);
      } else {
        this.themePreviewCache.clear();
      }
    },

    async loadThemePreviewAssets(themeId = 'campo') {
      const id = themeId || 'campo';
      if (this.themePreviewCache.has(id)) {
        return this.themePreviewCache.get(id);
      }

      const promise = (async () => {
        const catalog = this.serverCatalog;
        const groundTiles = buildGroundTiles();
        const obstacles = buildObstacleSprites();
        const weapons = buildWeaponSprites();
        const characters = [
          this.characters[0]?.frames?.[0] || null,
          this.characters[1]?.frames?.[0] || null,
        ];

        if (!catalog) {
          return { groundTiles, obstacles, weapons, characters, themeEntry: null };
        }

        const defaults = catalog.defaults || {};
        const themeEntry = catalog.themes?.[id] || null;
        const themeSprites = themeEntry?.sprites || {};
        const globalCustom = catalog.custom || {};
        const themeCustom = catalog.customThemes?.[id] || {};

        const wantedKeys = new Set([
          'tile:0', 'tile:1', 'tile:2', 'tile:3', 'tile:4', 'tile:5', 'tile:6', 'tile:7',
          'obs:rock', 'obs:wall_h', 'obs:wall_v', 'obs:wreck', 'obs:crate', 'obs:barrel', 'obs:bush',
          'weapon:pistol', 'weapon:shotgun', 'weapon:rifle', 'weapon:medkit',
        ]);

        for (const k of Object.keys(themeSprites)) {
          if (k.startsWith('obs:') || k.startsWith('weapon:') || k.startsWith('tile:')) {
            if (!k.endsWith('_dmg')) wantedKeys.add(k);
          }
        }
        for (const obsId of Object.keys(themeEntry?.obstacles || {})) {
          wantedKeys.add(`obs:${obsId}`);
        }
        for (const wId of Object.keys(themeEntry?.weapons || {})) {
          wantedKeys.add(`weapon:${wId}`);
        }

        const jobs = [];
        for (const key of wantedKeys) {
          let meta = null;
          if (themeCustom[key]) {
            meta = themeCustom[key];
          } else if (globalCustom[key] && id === 'campo') {
            meta = globalCustom[key];
          } else if (themeSprites[key]) {
            meta = themeSprites[key];
          } else if (defaults[key]) {
            meta = defaults[key];
          }
          if (!meta || !meta.url) continue;

          jobs.push(
            loadPngStripToCanvases(meta.url, meta.w, meta.h, meta.frames || 1)
              .then((canvases) => {
                if (!canvases || canvases.length === 0) return;
                const frame0 = canvases[0];
                if (key.startsWith('tile:')) {
                  const idx = Number(key.slice(5));
                  if (Number.isInteger(idx) && idx >= 0 && idx < 8) {
                    groundTiles[idx] = frame0;
                  }
                } else if (key.startsWith('obs:')) {
                  obstacles[key.slice(4)] = frame0;
                } else if (key.startsWith('weapon:')) {
                  weapons[key.slice(7)] = frame0;
                }
              })
              .catch(() => {})
          );
        }

        await Promise.all(jobs);
        return { groundTiles, obstacles, weapons, characters, themeEntry };
      })();

      this.themePreviewCache.set(id, promise);
      return promise;
    },

    getAssetMeta(assetKey) {
      return this.assets.find((a) => a.key === assetKey) || null;
    },

    upsertAssetMeta(meta) {
      const idx = this.assets.findIndex((a) => a.key === meta.key);
      if (idx >= 0) {
        this.assets[idx] = { ...this.assets[idx], ...meta };
      } else {
        this.assets.push({ ...meta });
      }
    },

    removeCustomAssetMeta(assetKey) {
      const idx = this.assets.findIndex((a) => a.key === assetKey && !a.isDefault);
      if (idx >= 0) {
        const removed = this.assets[idx];
        this.assets.splice(idx, 1);
        if (removed.category === 'characters') {
          delete this.characters[removed.id];
        }
        delete this.customStore[assetKey];
        this.animations.delete(assetKey);
      }
    },

    getAllCharacterEntries() {
      return this.assets
        .filter((a) => a.category === 'characters')
        .map((a) => {
          const preset = SKIN_PRESETS.find((s) => s.id === a.id);
          return {
            id: a.id,
            key: a.key,
            name: preset ? preset.name : String(a.name || a.id).replace(/^Personaje:\s*/i, ''),
            swatchColor: preset ? preset.shirt : PALETTE.GOLD,
            isDefault: Boolean(a.isDefault),
          };
        });
    },

    getAssetCanvases(assetKey) {
      const meta = this.getAssetMeta(assetKey);
      if (!meta) return { frames: [], fps: 8 };
      if (meta.category === 'characters') {
        const bank = this.characters[meta.id];
        if (!bank) return { frames: [], fps: 8 };
        return {
          frames: bank.frames.map(cloneCanvas),
          fps: bank.fps || 8,
        };
      }
      if (this.animations.has(assetKey)) {
        const anim = this.animations.get(assetKey);
        return {
          frames: anim.frames.map(cloneCanvas),
          fps: anim.fps || meta.defaultFps || 6,
        };
      }
      const single =
        meta.category === 'groundTiles'
          ? this.groundTiles[meta.id]
          : this[meta.category]?.[meta.id];
      return {
        frames: single ? [cloneCanvas(single)] : [],
        fps: meta.defaultFps || 6,
      };
    },

    setAssetCanvases(assetKey, canvases, fps = 8, recordInStore = true) {
      const meta = this.getAssetMeta(assetKey);
      if (!meta || !canvases || canvases.length === 0) return;
      const cloned = canvases.map(cloneCanvas);

      if (meta.category === 'characters') {
        const frames =
          cloned.length >= 4
            ? cloned
            : [
                cloned[0],
                cloned[1] || cloned[0],
                cloned[2] || cloned[0],
                cloned[3] || cloned[1] || cloned[0],
              ].map(cloneCanvas);
        this.characters[meta.id] = {
          fps,
          frames,
          flash: buildWhiteFlashCanvas(frames[0]),
        };
      } else {
        if (meta.category === 'groundTiles') {
          this.groundTiles[meta.id] = cloned[0];
        } else if (this[meta.category]) {
          this[meta.category][meta.id] = cloned[0];
        }
        if (cloned.length > 1) {
          this.animations.set(assetKey, { frames: cloned, fps });
        } else {
          this.animations.delete(assetKey);
        }
      }

      meta.w = cloned[0].width;
      meta.h = cloned[0].height;

      if (recordInStore) {
        const w = cloned[0].width;
        const h = cloned[0].height;
        const framesRgba = cloned.map(canvasToRgba);
        this.customStore[assetKey] = encodeSpriteRLE(w, h, fps, framesRgba);
      }
    },

    async loadEntryFromServerPng(meta, markCustom = false) {
      if (!meta || !meta.url) return false;
      this.upsertAssetMeta({
        key: meta.key,
        category: meta.category,
        id: meta.id,
        name: meta.name,
        w: meta.w,
        h: meta.h,
        maxW: meta.maxW || (meta.category === 'characters' ? CHAR_MAX_SPRITE_SIZE : 64),
        maxH: meta.maxH || (meta.category === 'characters' ? CHAR_MAX_SPRITE_SIZE : 64),
        defaultFps: meta.fps || 8,
        isDefault: Boolean(meta.isDefault),
      });
      const canvases = await loadPngStripToCanvases(meta.url, meta.w, meta.h, meta.frames || 1);
      this.setAssetCanvases(meta.key, canvases, meta.fps || 8, markCustom);
      if (!markCustom) {
        delete this.customStore[meta.key];
      }
      return true;
    },

    async loadFromServerCatalog(catalog, themeId = null) {
      if (!catalog || typeof catalog !== 'object') return;
      this.serverCatalog = catalog;
      const targetTheme = themeId || this.activeTheme || 'campo';
      await this.applyTheme(targetTheme);
    },

    // Resolves 4-layer sprite override hierarchy for a battle theme:
    //   1. sprites/default/             (base theme)
    //   2. sprites/themes/<themeId>/    (theme overrides)
    //   3. sprites/custom/              (global user custom PNGs, e.g. characters & base edits)
    //   4. sprites/custom/themes/<id>/  (per-theme user custom PNGs)
    async applyTheme(themeId = 'campo') {
      this.activeTheme = themeId || 'campo';
      const catalog = this.serverCatalog;
      if (!catalog) return;

      const seq = (this._themeLoadSeq = (this._themeLoadSeq || 0) + 1);

      const defaults = catalog.defaults || {};
      const themeSprites = catalog.themes?.[this.activeTheme]?.sprites || {};
      const globalCustom = catalog.custom || {};
      const themeCustom = catalog.customThemes?.[this.activeTheme] || {};

      this.assets = EDITABLE_ASSETS.map((a) => ({ ...a, isDefault: true }));
      this.customStore = {};
      this.animations.clear();

      const allKeys = new Set([
        ...Object.keys(defaults),
        ...Object.keys(themeSprites),
        ...Object.keys(globalCustom),
        ...Object.keys(themeCustom),
      ]);

      const jobs = [];
      for (const key of allKeys) {
        const isChar = key.startsWith('char:');
        let meta = null;
        let isCustom = false;

        if (!isChar && themeCustom[key]) {
          meta = themeCustom[key];
          isCustom = true;
        } else if (globalCustom[key] && (isChar || this.activeTheme === 'campo')) {
          meta = globalCustom[key];
          isCustom = true;
        } else if (!isChar && themeSprites[key]) {
          meta = themeSprites[key];
          isCustom = false;
        } else if (defaults[key]) {
          meta = defaults[key];
          isCustom = false;
        }

        if (meta) {
          jobs.push(
            loadPngStripToCanvases(meta.url, meta.w, meta.h, meta.frames || 1)
              .then((canvases) => {
                if (seq !== this._themeLoadSeq) return false;
                this.upsertAssetMeta({
                  key: meta.key,
                  category: meta.category,
                  id: meta.id,
                  name: meta.name,
                  w: meta.w,
                  h: meta.h,
                  maxW: meta.maxW || (meta.category === 'characters' ? CHAR_MAX_SPRITE_SIZE : 64),
                  maxH: meta.maxH || (meta.category === 'characters' ? CHAR_MAX_SPRITE_SIZE : 64),
                  defaultFps: meta.fps || 8,
                  isDefault: Boolean(meta.isDefault),
                });
                this.setAssetCanvases(meta.key, canvases, meta.fps || 8, isCustom);
                if (!isCustom) delete this.customStore[meta.key];
                return true;
              })
              .catch(() => false)
          );
        }
      }
      await Promise.all(jobs);
    },

    getAnimatedCanvas(assetKey, fallbackCanvas, time) {
      const anim = this.animations.get(assetKey);
      if (!anim || anim.frames.length <= 1) return fallbackCanvas;
      const idx = Math.floor(time * (anim.fps || 6)) % anim.frames.length;
      return anim.frames[idx] || fallbackCanvas;
    },

    resetAsset(assetKey) {
      const meta = EDITABLE_ASSETS.find((a) => a.key === assetKey);
      if (!meta) return;
      delete this.customStore[assetKey];
      this.animations.delete(assetKey);

      if (meta.category === 'characters') {
        const defaults = buildDefaultCharacters();
        this.characters[meta.id] = defaults[meta.id];
      } else if (meta.category === 'weapons') {
        const defaults = buildWeaponSprites();
        this.weapons[meta.id] = defaults[meta.id];
      } else if (meta.category === 'obstacles') {
        const defaults = buildObstacleSprites();
        this.obstacles[meta.id] = defaults[meta.id];
      } else if (meta.category === 'groundTiles') {
        const defaults = buildGroundTiles();
        this.groundTiles[meta.id] = defaults[meta.id];
      } else if (meta.category === 'misc') {
        const defaults = buildMiscSprites();
        this.misc[meta.id] = defaults[meta.id];
      }
    },

    resetAll() {
      this.customStore = {};
      this.animations.clear();
      this.characters = buildDefaultCharacters();
      this.weapons = buildWeaponSprites();
      this.obstacles = buildObstacleSprites();
      this.misc = buildMiscSprites();
      this.groundTiles = buildGroundTiles();
    },

    importCustomStore(store) {
      if (!store || typeof store !== 'object') return;
      for (const [assetKey, rleData] of Object.entries(store)) {
        const meta = EDITABLE_ASSETS.find((a) => a.key === assetKey);
        if (!meta) continue;
        const decoded = decodeSpriteRLE(rleData);
        if (!decoded || decoded.framesRgba.length === 0) continue;
        // Enforce max dimensions (e.g. characters <= 32x32px)
        if (decoded.w > meta.maxW || decoded.h > meta.maxH) continue;
        const canvases = decoded.framesRgba.map((rgba) => rgbaToCanvas(rgba, decoded.w, decoded.h));
        this.setAssetCanvases(assetKey, canvases, decoded.fps, false);
        this.customStore[assetKey] = rleData;
      }
    },

    setPlayerCustomChar(playerId, rleData) {
      if (!rleData) {
        this.playerCustomChars.delete(playerId);
        return;
      }
      const decoded = decodeSpriteRLE(rleData);
      if (!decoded || decoded.w > CHAR_MAX_SPRITE_SIZE || decoded.h > CHAR_MAX_SPRITE_SIZE || decoded.framesRgba.length === 0) {
        return;
      }
      const rawCanvases = decoded.framesRgba.map((rgba) => rgbaToCanvas(rgba, decoded.w, decoded.h));
      const frames =
        rawCanvases.length >= 4
          ? rawCanvases
          : [
              rawCanvases[0],
              rawCanvases[1] || rawCanvases[0],
              rawCanvases[2] || rawCanvases[0],
              rawCanvases[3] || rawCanvases[1] || rawCanvases[0],
            ];
      this.playerCustomChars.set(playerId, {
        fps: decoded.fps || 8,
        frames,
        flash: buildWhiteFlashCanvas(frames[0]),
      });
    },
  };

  return atlas;
}
