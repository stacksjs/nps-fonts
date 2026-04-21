import { describe, expect, it } from 'bun:test'
import { detectOuterWinding, offsetContour, recomputeBounds, type Contour } from '../scripts/lib/offset'

/**
 * The signed area test: for CCW-wound contours (positive signed area in
 * y-up), applying a positive offset should grow the contour (larger area).
 * For CW contours (holes), positive offset shrinks them.
 */
function signedArea(contour: Contour): number {
  let a = 0
  const n = contour.length
  for (let i = 0; i < n; i++) {
    const p = contour[i]!, q = contour[(i + 1) % n]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

describe('offsetContour', () => {
  it('returns a copy when offset is zero', () => {
    const square: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 0, y: 100, onCurve: true },
    ]
    const result = offsetContour(square, 0)
    expect(result).toHaveLength(square.length)
    for (let i = 0; i < square.length; i++) {
      expect(result[i].x).toBe(square[i].x)
      expect(result[i].y).toBe(square[i].y)
    }
    // Not the same array (copy)
    expect(result).not.toBe(square)
  })

  it('preserves point count regardless of offset', () => {
    const triangle: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 0, onCurve: true },
      { x: 50, y: 100, onCurve: true },
    ]
    expect(offsetContour(triangle, 10)).toHaveLength(3)
    expect(offsetContour(triangle, -10)).toHaveLength(3)
    expect(offsetContour(triangle, 50)).toHaveLength(3)
  })

  it('grows a CCW-wound square outward on positive offset', () => {
    // CCW (positive signed area in y-up): counter-clockwise traversal
    const square: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 0, y: 100, onCurve: true },
    ]
    expect(signedArea(square)).toBeGreaterThan(0)
    const grown = offsetContour(square, 10)
    expect(signedArea(grown)).toBeGreaterThan(signedArea(square))
  })

  it('shrinks a CCW-wound square on negative offset', () => {
    const square: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 0, y: 100, onCurve: true },
    ]
    const shrunk = offsetContour(square, -10)
    expect(signedArea(shrunk)).toBeLessThan(signedArea(square))
  })

  it('grows symmetrically — bounding box expands by ~offset on each side', () => {
    const square: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 0, y: 100, onCurve: true },
    ]
    const grown = offsetContour(square, 10)
    const xs = grown.map(p => p.x)
    const ys = grown.map(p => p.y)
    // Offset 10 moves each corner along its bisector = diagonal at 45°; in
    // axis-aligned terms each edge moves outward by 10 units — corners
    // extend by 10 / cos(45°) ≈ 14.14 along each axis.
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(100)
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(Math.max(...ys)).toBeGreaterThan(100)
    // And symmetric within ±1 unit of rounding.
    expect(Math.abs(Math.min(...xs) + Math.max(...xs) - 100)).toBeLessThanOrEqual(1)
    expect(Math.abs(Math.min(...ys) + Math.max(...ys) - 100)).toBeLessThanOrEqual(1)
  })

  it('in a CCW-outer font, a CW-wound hole shrinks on positive offset', () => {
    // Standard convention: outer=CCW, hole=CW. Positive offset = bolder glyph,
    // so hole interior gets smaller.
    const hole: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 0, y: 100, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 100, y: 0, onCurve: true },
    ]
    expect(signedArea(hole)).toBeLessThan(0)
    const shrunk = offsetContour(hole, 10, 'ccw')
    expect(Math.abs(signedArea(shrunk))).toBeLessThan(Math.abs(signedArea(hole)))
  })

  it('in a CW-outer font, a CW outer grows on positive offset', () => {
    const cwOuter: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 0, y: 100, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 100, y: 0, onCurve: true },
    ]
    expect(signedArea(cwOuter)).toBeLessThan(0)
    const grown = offsetContour(cwOuter, 10, 'cw')
    expect(Math.abs(signedArea(grown))).toBeGreaterThan(Math.abs(signedArea(cwOuter)))
  })

  it('in a CW-outer font, a CCW-wound hole shrinks on positive offset', () => {
    const hole: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 0, y: 100, onCurve: true },
    ]
    expect(signedArea(hole)).toBeGreaterThan(0)
    const shrunk = offsetContour(hole, 10, 'cw')
    expect(Math.abs(signedArea(shrunk))).toBeLessThan(Math.abs(signedArea(hole)))
  })

  it('preserves on/off-curve flags', () => {
    const mixed: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 50, y: 0, onCurve: false },
      { x: 100, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 0, y: 100, onCurve: true },
    ]
    const out = offsetContour(mixed, 5)
    for (let i = 0; i < mixed.length; i++)
      expect(out[i].onCurve).toBe(mixed[i].onCurve)
  })

  it('handles offset=0 on empty contour', () => {
    expect(offsetContour([], 0)).toHaveLength(0)
  })
})

describe('detectOuterWinding', () => {
  it('returns ccw for CCW-wound sole contour', () => {
    expect(detectOuterWinding([[
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 0, y: 100, onCurve: true },
    ]])).toBe('ccw')
  })

  it('returns cw for CW-wound sole contour', () => {
    expect(detectOuterWinding([[
      { x: 0, y: 0, onCurve: true },
      { x: 0, y: 100, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 100, y: 0, onCurve: true },
    ]])).toBe('cw')
  })

  it('picks the contour with the largest absolute signed area (the outer)', () => {
    // Large CW outer + small CCW hole inside it.
    const outer: Contour = [
      { x: 0, y: 0, onCurve: true },
      { x: 0, y: 1000, onCurve: true },
      { x: 1000, y: 1000, onCurve: true },
      { x: 1000, y: 0, onCurve: true },
    ]
    const hole: Contour = [
      { x: 100, y: 100, onCurve: true },
      { x: 200, y: 100, onCurve: true },
      { x: 200, y: 200, onCurve: true },
      { x: 100, y: 200, onCurve: true },
    ]
    expect(detectOuterWinding([outer, hole])).toBe('cw')
  })

  it('returns ccw for undefined or empty input', () => {
    expect(detectOuterWinding(undefined)).toBe('ccw')
    expect(detectOuterWinding([])).toBe('ccw')
  })
})

describe('recomputeBounds', () => {
  it('returns zeros for undefined contours', () => {
    expect(recomputeBounds(undefined)).toEqual({ xMin: 0, yMin: 0, xMax: 0, yMax: 0 })
  })

  it('returns zeros for empty contour list', () => {
    expect(recomputeBounds([])).toEqual({ xMin: 0, yMin: 0, xMax: 0, yMax: 0 })
  })

  it('computes bbox across multiple contours', () => {
    const contours: Contour[] = [
      [
        { x: 10, y: 20, onCurve: true },
        { x: 90, y: 80, onCurve: true },
      ],
      [
        { x: -5, y: 100, onCurve: true },
        { x: 200, y: -50, onCurve: true },
      ],
    ]
    expect(recomputeBounds(contours)).toEqual({ xMin: -5, yMin: -50, xMax: 200, yMax: 100 })
  })

  it('rounds the bounding box to integers', () => {
    const contours: Contour[] = [
      [
        { x: 0.7, y: 0.3, onCurve: true },
        { x: 99.4, y: 100.6, onCurve: true },
      ],
    ]
    const bb = recomputeBounds(contours)
    expect(Number.isInteger(bb.xMin)).toBe(true)
    expect(Number.isInteger(bb.yMin)).toBe(true)
    expect(Number.isInteger(bb.xMax)).toBe(true)
    expect(Number.isInteger(bb.yMax)).toBe(true)
  })
})
