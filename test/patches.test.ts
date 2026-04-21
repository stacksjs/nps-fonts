import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Contour, GlyphPatch } from '../sources/nps-2026/patches'

/**
 * These tests exercise the patch-application machinery in isolation by
 * replicating the logic from scripts/nps-2026.ts. They verify each
 * supported operation (`translate`, `scale`, `advanceWidth`,
 * `leftSideBearing`, `setContours`, `mapContours`) mutates a glyph as
 * documented, and that patch composition matches the documented order.
 */

interface FontGlyph {
  name: string
  unicode?: number[]
  advanceWidth: number
  leftSideBearing: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  contours?: Contour[]
}

// Mirror of scripts/nps-2026.ts applyPatch — kept in sync intentionally.
function recomputeBounds(g: FontGlyph) {
  if (!g.contours || g.contours.length === 0) {
    g.xMin = g.yMin = g.xMax = g.yMax = 0
    g.leftSideBearing = 0
    return
  }
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity
  for (const c of g.contours) for (const p of c) {
    if (p.x < xMin) xMin = p.x
    if (p.y < yMin) yMin = p.y
    if (p.x > xMax) xMax = p.x
    if (p.y > yMax) yMax = p.y
  }
  g.xMin = Math.round(xMin); g.yMin = Math.round(yMin)
  g.xMax = Math.round(xMax); g.yMax = Math.round(yMax)
  g.leftSideBearing = g.xMin
}

function applyPatch(g: FontGlyph, patch: GlyphPatch) {
  if (patch.setContours) {
    g.contours = patch.setContours.map(c => c.map(p => ({ ...p })))
    recomputeBounds(g)
  }
  if (patch.mapContours && g.contours) {
    g.contours = patch.mapContours(g.contours)
    recomputeBounds(g)
  }
  if (patch.translate && g.contours) {
    const { dx, dy } = patch.translate
    g.contours = g.contours.map(c => c.map(p => ({ x: p.x + dx, y: p.y + dy, onCurve: p.onCurve })))
    recomputeBounds(g)
  }
  if (patch.scale && g.contours) {
    const { sx, sy, origin } = patch.scale
    const ox = origin?.x ?? 0, oy = origin?.y ?? 0
    g.contours = g.contours.map(c => c.map(p => ({
      x: ox + (p.x - ox) * sx,
      y: oy + (p.y - oy) * sy,
      onCurve: p.onCurve,
    })))
    recomputeBounds(g)
  }
  if (patch.advanceWidth !== undefined) g.advanceWidth = patch.advanceWidth
  if (patch.leftSideBearing !== undefined) g.leftSideBearing = patch.leftSideBearing
}

function makeSquare(): FontGlyph {
  return {
    name: 'X',
    advanceWidth: 1000,
    leftSideBearing: 0,
    xMin: 0, yMin: 0, xMax: 100, yMax: 100,
    contours: [[
      { x: 0, y: 0, onCurve: true },
      { x: 100, y: 0, onCurve: true },
      { x: 100, y: 100, onCurve: true },
      { x: 0, y: 100, onCurve: true },
    ]],
  }
}

describe('applyPatch', () => {
  it('translate moves every point and updates bbox', () => {
    const g = makeSquare()
    applyPatch(g, { translate: { dx: 50, dy: -20 } })
    expect(g.contours![0].map(p => [p.x, p.y])).toEqual([
      [50, -20], [150, -20], [150, 80], [50, 80],
    ])
    expect(g.xMin).toBe(50)
    expect(g.xMax).toBe(150)
    expect(g.yMin).toBe(-20)
    expect(g.yMax).toBe(80)
  })

  it('scale from origin 0,0 multiplies coordinates', () => {
    const g = makeSquare()
    applyPatch(g, { scale: { sx: 2, sy: 0.5 } })
    expect(g.contours![0].map(p => [p.x, p.y])).toEqual([
      [0, 0], [200, 0], [200, 50], [0, 50],
    ])
  })

  it('scale around arbitrary origin preserves the origin point', () => {
    const g = makeSquare()
    applyPatch(g, { scale: { sx: 2, sy: 2, origin: { x: 50, y: 50 } } })
    // Point (50,50) is the origin; scale by 2 keeps it at (50,50).
    // (0,0) becomes (50 + (0-50)*2, 50 + (0-50)*2) = (-50, -50)
    // (100,100) becomes (150, 150)
    expect(g.contours![0][0]).toEqual({ x: -50, y: -50, onCurve: true })
    expect(g.contours![0][2]).toEqual({ x: 150, y: 150, onCurve: true })
  })

  it('advanceWidth sets the field without touching contours', () => {
    const g = makeSquare()
    const originalContours = JSON.parse(JSON.stringify(g.contours))
    applyPatch(g, { advanceWidth: 1500 })
    expect(g.advanceWidth).toBe(1500)
    expect(g.contours).toEqual(originalContours)
  })

  it('leftSideBearing sets the field without touching contours', () => {
    const g = makeSquare()
    applyPatch(g, { leftSideBearing: 42 })
    expect(g.leftSideBearing).toBe(42)
  })

  it('setContours replaces outlines and recomputes bbox', () => {
    const g = makeSquare()
    applyPatch(g, {
      setContours: [[
        { x: 10, y: 20, onCurve: true },
        { x: 200, y: 300, onCurve: true },
      ]],
    })
    expect(g.contours!).toHaveLength(1)
    expect(g.contours![0]).toHaveLength(2)
    expect(g.xMin).toBe(10)
    expect(g.xMax).toBe(200)
    expect(g.yMin).toBe(20)
    expect(g.yMax).toBe(300)
  })

  it('mapContours receives the contour array and the returned value replaces it', () => {
    const g = makeSquare()
    const originalFirst = g.contours![0][0]
    let calls = 0
    applyPatch(g, {
      mapContours: (contours) => {
        calls++
        expect(contours[0][0]).toEqual(originalFirst)
        return contours.map(c => c.map(p => ({ ...p, x: p.x + 7 })))
      },
    })
    expect(calls).toBe(1)
    expect(g.contours![0][0].x).toBe(7)
  })

  it('composes operations in a predictable order: setContours → mapContours → translate → scale', () => {
    const g = makeSquare()
    applyPatch(g, {
      setContours: [[
        { x: 0, y: 0, onCurve: true },
        { x: 10, y: 0, onCurve: true },
      ]],
      mapContours: cs => cs.map(c => c.map(p => ({ ...p, x: p.x + 1 }))),
      translate: { dx: 100, dy: 0 },
      scale: { sx: 2, sy: 1 },
    })
    // After each step for point (0,0):
    //   setContours → (0, 0)
    //   mapContours → (1, 0)
    //   translate  → (101, 0)
    //   scale x=2   → (202, 0)
    expect(g.contours![0][0]).toEqual({ x: 202, y: 0, onCurve: true })
  })

  it('no-op patch leaves the glyph unchanged', () => {
    const g = makeSquare()
    const before = JSON.stringify(g)
    applyPatch(g, {})
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('outlines.json source-of-truth shape', () => {
  it('has the fields nps-2026.ts reads', () => {
    const p = resolve(import.meta.dir, '..', 'sources', 'nps-2026', 'outlines.json')
    const data = JSON.parse(readFileSync(p, 'utf8'))
    expect(data.glyf).toBeInstanceOf(Array)
    expect(data.glyf.length).toBeGreaterThan(0)
    expect(data.name).toBeDefined()
    expect(data.name.fontFamily).toBeDefined()
    expect(data.head).toBeDefined()
    expect(data.head.unitsPerEm).toBe(1000)
    expect(data['OS/2']).toBeDefined()
  })
})
