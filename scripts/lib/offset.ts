/**
 * Point-compatible contour offsetting used to derive extra weight masters
 * from a single source master. Every contour keeps its original point count;
 * each point is shifted along the contour's outward normal by ±d em units.
 *
 * Caveats — this is a purely geometric weight derivation. It produces usable
 * Thin/Black endpoints for a variable `wght` axis, but without hand-drawn
 * masters, terminals/joins/counters won't be shaped the way real type
 * designers do it. Quality is "font tool MVP", not "designer hand-tuned".
 */

export interface Point { x: number; y: number; onCurve: boolean }
export type Contour = Point[]

function normalize(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y)
  return l === 0 ? [0, 0] : [x / l, y / l]
}

function signedArea(contour: Contour): number {
  let a = 0
  const n = contour.length
  for (let i = 0; i < n; i++) {
    const p = contour[i]!, q = contour[(i + 1) % n]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/**
 * Offset a single contour by `d` em units along its outward normal.
 * Negative `d` shrinks; positive `d` grows. Works with TrueType quadratic
 * contours (on/off-curve points) because every point gets the same normal
 * treatment regardless of type.
 *
 * Winding convention: in TrueType's y-up space, CCW contours are outlines
 * (solid) and CW contours are holes. "Outward" for both means away from
 * the glyph's ink: outer contours grow outward, holes shrink inward — so
 * applying positive `d` uniformly thickens ink (the intuitive bolder case).
 */
export function offsetContour(contour: Contour, d: number): Contour {
  const n = contour.length
  if (n < 2 || d === 0) return contour.map(p => ({ ...p }))

  const ccw = signedArea(contour) > 0
  const outNormal = (dx: number, dy: number): [number, number] =>
    ccw ? normalize(dy, -dx) : normalize(-dy, dx)

  const MITER_LIMIT = 8 // clamp sharp corners to avoid blow-ups

  const out: Contour = []
  for (let i = 0; i < n; i++) {
    const prev = contour[(i - 1 + n) % n]!
    const curr = contour[i]!
    const next = contour[(i + 1) % n]!

    const [nInX, nInY] = outNormal(curr.x - prev.x, curr.y - prev.y)
    const [nOutX, nOutY] = outNormal(next.x - curr.x, next.y - curr.y)

    let bx = nInX + nOutX
    let by = nInY + nOutY
    const bLen = Math.hypot(bx, by)

    let dx: number, dy: number
    if (bLen < 1e-6) {
      // Collinear reverse: fall back to single edge normal
      dx = d * nInX
      dy = d * nInY
    }
    else {
      bx /= bLen; by /= bLen
      const cosHalf = bx * nInX + by * nInY
      const scale = Math.min(1 / Math.max(cosHalf, 0.125), MITER_LIMIT)
      dx = d * bx * scale
      dy = d * by * scale
    }

    out.push({
      x: Math.round(curr.x + dx),
      y: Math.round(curr.y + dy),
      onCurve: curr.onCurve,
    })
  }
  return out
}

/**
 * Offset every contour in a glyph by `d`. Composite glyphs (without their
 * own contours) are left untouched — they compose from referenced glyphs
 * which will themselves be offset.
 */
export function offsetContours(contours: Contour[] | undefined, d: number): Contour[] | undefined {
  if (!contours) return contours
  return contours.map(c => offsetContour(c, d))
}

export function recomputeBounds(contours: Contour[] | undefined): {
  xMin: number; yMin: number; xMax: number; yMax: number
} {
  if (!contours || contours.length === 0) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 }
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity
  for (const c of contours) for (const p of c) {
    if (p.x < xMin) xMin = p.x
    if (p.y < yMin) yMin = p.y
    if (p.x > xMax) xMax = p.x
    if (p.y > yMax) yMax = p.y
  }
  return { xMin: Math.round(xMin), yMin: Math.round(yMin), xMax: Math.round(xMax), yMax: Math.round(yMax) }
}
