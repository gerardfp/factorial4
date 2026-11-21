// Shared collision, obstacle resolution, and line-of-sight utilities

export function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

export function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function circleIntersectsRect(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

export function resolveCircleRect(entity, radius, rect) {
  const closestX = clamp(entity.x, rect.x, rect.x + rect.w);
  const closestY = clamp(entity.y, rect.y, rect.y + rect.h);
  let dx = entity.x - closestX;
  let dy = entity.y - closestY;
  const d2 = dx * dx + dy * dy;

  if (d2 >= radius * radius) return false;

  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const overlap = radius - d;
    entity.x += (dx / d) * overlap;
    entity.y += (dy / d) * overlap;
    return true;
  }

  // Center is inside rect: push out along nearest edge
  const left = entity.x - rect.x;
  const right = rect.x + rect.w - entity.x;
  const top = entity.y - rect.y;
  const bottom = rect.y + rect.h - entity.y;
  const minEdge = Math.min(left, right, top, bottom);
  if (minEdge === left) entity.x = rect.x - radius;
  else if (minEdge === right) entity.x = rect.x + rect.w + radius;
  else if (minEdge === top) entity.y = rect.y - radius;
  else entity.y = rect.y + rect.h + radius;
  return true;
}

export function rectIntersectsRect(a, b, pad = 0) {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

// Liang-Barsky segment vs AABB intersection test
export function segmentIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-8) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

export function hasLineOfSight(x1, y1, x2, y2, obstacles) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (!o.alive || !o.blocksProjectiles) continue;
    if (segmentIntersectsRect(x1, y1, x2, y2, o.x, o.y, o.w, o.h)) {
      return false;
    }
  }
  return true;
}

export function pointInBush(x, y, obstacles) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (!o.alive || !o.stealth) continue;
    if (x >= o.x + 4 && x <= o.x + o.w - 4 && y >= o.y + 4 && y <= o.y + o.h - 4) {
      return true;
    }
  }
  return false;
}
