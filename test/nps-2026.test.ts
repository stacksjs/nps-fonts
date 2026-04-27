import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isVariableFont, listAxes, listNamedInstances, parse, TTFReader } from 'ts-fonts'

/**
 * These tests operate on the committed build output under `fonts/nps-2026/`.
 * They assume `bun run scripts/nps-2026.ts` has been executed; the test
 * harness skips gracefully if the output isn't present (e.g. on a clean
 * checkout before the first build).
 */

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'nps-2026')
const VF = resolve(FONTS, 'ttf', 'NPS_2026[wght].ttf')
const STATIC = resolve(FONTS, 'ttf', 'NPS_2026-Regular.ttf')

if (!existsSync(VF)) {
  describe.skip('nps-2026 build (skipped — no build artifacts)', () => {
    it('should be run after `bun run scripts/nps-2026.ts`', () => {})
  })
}
else {
  describe('variable font shape', () => {
    it('carries a wght axis spanning 100..400..900', () => {
      const buf = Bun.file(VF).arrayBuffer()
      return buf.then((ab) => {
        const ttf = new TTFReader().read(ab)
        expect(isVariableFont(ttf)).toBe(true)
        const axes = listAxes(ttf)
        expect(axes).toHaveLength(1)
        expect(axes[0].tag).toBe('wght')
        expect(axes[0].minValue).toBe(100)
        expect(axes[0].defaultValue).toBe(400)
        expect(axes[0].maxValue).toBe(900)
      })
    })

    it('exposes nine named CSS-weight instances', async () => {
      const ab = await Bun.file(VF).arrayBuffer()
      const ttf = new TTFReader().read(ab)
      const instances = listNamedInstances(ttf)
      const names = instances.map(i => i.name).sort()
      expect(names).toEqual([
        'Black', 'Bold', 'ExtraBold', 'ExtraLight', 'Light', 'Medium', 'Regular', 'SemiBold', 'Thin',
      ])
    })

    it('has per-glyph variations in gvar matching the glyph count', async () => {
      const ab = await Bun.file(VF).arrayBuffer()
      const ttf = new TTFReader().read(ab)
      expect(ttf.gvar).toBeDefined()
      expect(ttf.gvar!.glyphVariations.length).toBe(ttf.glyf.length)
    })

    it('brands with the family "NPS 2026"', async () => {
      const ab = await Bun.file(VF).arrayBuffer()
      const ttf = new TTFReader().read(ab)
      expect(ttf.name.fontFamily).toBe('NPS 2026')
      expect(ttf.name.postScriptName).toMatch(/^NPS_2026/)
    })
  })

  describe('static Regular alongside variable', () => {
    it('exists and parses as a non-variable TTF', async () => {
      const ab = await Bun.file(STATIC).arrayBuffer()
      const ttf = new TTFReader().read(ab)
      expect(isVariableFont(ttf)).toBe(false)
      expect(ttf.name.fontFamily).toBe('NPS 2026')
    })

    it('renders ASCII letters through ts-fonts at reasonable advance widths', async () => {
      const ab = await Bun.file(STATIC).arrayBuffer()
      const font = parse(ab)
      const M = font.charToGlyph('M')
      expect(M).toBeDefined()
      expect(M.advanceWidth).toBeGreaterThan(0)
      const path = M.getPath(0, 0, font.unitsPerEm ?? 1000)
      const bb = path.getBoundingBox()
      expect(bb.x2 - bb.x1).toBeGreaterThan(0)
      expect(bb.y2 - bb.y1).toBeGreaterThan(0)
    })
  })
}
