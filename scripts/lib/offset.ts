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
 * Which winding a font uses for its outer contours. TrueType fonts vary:
 *   - 'ccw': counter-clockwise in y-up (most fonts produced by
 *     modern tools like Glyphs, RoboFont).
 *   - 'cw':  clockwise in y-up (common in fonts exported from y-down
 *     tooling like FontLab classic or older TrueType pipelines — the
 *     NPS 1935 reference is in this camp).
 *
 * Holes always have the opposite winding from outer.
 */
export type OuterWinding = 'ccw' | 'cw'

/**
 * Offset every point of a contour by `d` em units along the direction
 * that makes positive `d` add ink (outer contours grow outward, hole
 * contours shrink toward their centers). The direction is picked from
 * the font's outer-contour winding convention — all contours in one
 * font share a single perpendicular rotation:
 *
 *   outer=ccw → use `(dy, -dx)` (right-rotation in y-up)
 *   outer=cw  → use `(-dy, dx)` (left-rotation in y-up)
 *
 * That single-direction rule automatically thickens outers (they grow
 * outward from their own interior) and thins holes (they shrink into
 * their own interior — which is empty — so the surrounding ink fills in).
 */
export function offsetContour(contour: Contour, d: number, outerWinding: OuterWinding = 'ccw'): Contour {
  const n = contour.length
  if (n < 2 || d === 0) return contour.map(p => ({ ...p }))

  const outNormal = (dx: number, dy: number): [number, number] =>
    outerWinding === 'ccw' ? normalize(dy, -dx) : normalize(-dy, dx)

  // Miter-amplification cap at sharp corners. A value of 8 (SVG default)
  // lets narrow spike/V corners overshoot by 8× the nominal offset, which
  // fragments glyphs with tight curves (S, 2, R leg). 2 matches CSS's
  // default miter-limit and is empirically safe for display-face curves.
  const MITER_LIMIT = 2

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
export function offsetContours(
  contours: Contour[] | undefined,
  d: number,
  outerWinding: OuterWinding = 'ccw',
): Contour[] | undefined {
  if (!contours) return contours
  return contours.map(c => offsetContour(c, d, outerWinding))
}

/**
 * Infer the font-wide outer-contour winding from a representative glyph
 * (one that's a simple single-contour shape like 'I' or a digit).
 * Positive signed area in y-up = CCW; negative = CW.
 */
export function detectOuterWinding(contours: Contour[] | undefined): OuterWinding {
  if (!contours || contours.length === 0) return 'ccw'
  // Use the contour with the largest absolute signed area — that's the
  // outer contour in a nested outer/hole setup.
  let biggest = contours[0]!
  let biggestAbs = Math.abs(signedArea(biggest))
  for (let i = 1; i < contours.length; i++) {
    const a = Math.abs(signedArea(contours[i]!))
    if (a > biggestAbs) { biggest = contours[i]!; biggestAbs = a }
  }
  return signedArea(biggest) > 0 ? 'ccw' : 'cw'
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
