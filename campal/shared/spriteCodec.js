// Lossless Indexed-Palette + Run-Length Encoding (CampalSprite RLE v2, with v1 decoding) for pixel-art sprites & animations

export function encodeSpriteRLE(w, h, fps, framesRgba) {
  const palette = [];
  const colorToIdx = new Map();

  const encodedFrames = framesRgba.map((rgba) => {
    const totalPixels = w * h;
    const indices = new Uint16Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      const a = rgba[i * 4 + 3];
      if (a < 16) {
        indices[i] = 0;
        continue;
      }
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      const hex =
        a === 255
          ? `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
          : `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}${a.toString(16).padStart(2, '0')}`;
      let idx = colorToIdx.get(hex);
      if (!idx) {
        palette.push(hex);
        idx = palette.length; // 1-based (0 = transparent)
        colorToIdx.set(hex, idx);
      }
      indices[i] = idx;
    }

    const runs = [];
    let cur = indices[0];
    let count = 1;
    for (let i = 1; i < totalPixels; i++) {
      if (indices[i] === cur) {
        count++;
      } else {
        runs.push(count > 1 ? `${cur.toString(36)}:${count.toString(36)}` : cur.toString(36));
        cur = indices[i];
        count = 1;
      }
    }
    runs.push(count > 1 ? `${cur.toString(36)}:${count.toString(36)}` : cur.toString(36));
    return runs.join(',');
  });

  return {
    v: 2,
    w,
    h,
    fps: fps || 8,
    p: palette,
    f: encodedFrames,
  };
}

export function decodeSpriteRLE(data) {
  if (!data || (data.v !== 1 && data.v !== 2) || !Array.isArray(data.p) || !Array.isArray(data.f)) return null;
  const w = Number(data.w) || 16;
  const h = Number(data.h) || 16;
  if (w < 1 || h < 1 || w > 128 || h > 128) return null;

  const parsedPalette = data.p.map((hex) => {
    const clean = String(hex).replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) : 255;
    return [r, g, b, a];
  });

  const framesRgba = data.f.map((rleStr) => {
    const rgba = new Uint8ClampedArray(w * h * 4);
    const tokens = String(rleStr).split(',');
    let pix = 0;
    const maxPix = w * h;

    for (let t = 0; t < tokens.length && pix < maxPix; t++) {
      const parts = data.v === 2 ? tokens[t].split(':') : tokens[t].split('x');
      const colorIdx = parseInt(parts[0], 36) || 0;
      const count = parts[1] ? parseInt(parts[1], 36) || 1 : 1;
      const col = colorIdx > 0 ? parsedPalette[colorIdx - 1] : null;

      for (let k = 0; k < count && pix < maxPix; k++) {
        if (col) {
          const off = pix * 4;
          rgba[off] = col[0];
          rgba[off + 1] = col[1];
          rgba[off + 2] = col[2];
          rgba[off + 3] = col[3];
        }
        pix++;
      }
    }
    return rgba;
  });

  return {
    w,
    h,
    fps: Number(data.fps) || 8,
    framesRgba,
  };
}
