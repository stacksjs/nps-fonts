import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInstance, TTFReader, type TTFObject, type Glyph } from 'ts-font-editor'

/**
 * Interpolation sanity — guards against regressions in ts-font-editor's
 * gvar applier. We compute three instances: at the Thin master location
 * (wght=100), at Regular (wght=400), and at an intermediate position
 * (wght=550). The intermediate result must fall between the flanking two
 * *linearly* — that's the contract of a properly-normalized gvar axis.
 *
 * Specifically, with the axis normalized so Regular is 0 and Black is +1,
 * wght=550 normalizes to (550-400)/(900-400) = 0.3. Every point's
 * position at wght=550 should equal regular + 0.3 * (black - regular)
 * within sub-pixel rounding tolerance.
 *
 * If ts-font-editor's `createInstance` ever breaks at non-default axis
 * positions (bad scalar formula, wrong gvar apply order, IUP bug,
 * phantom-point mishandling) this test fails loudly.
 */

const ROOT = resolve(import.meta.dir, '..')
const VF_PATH = resolve(ROOT, 'fonts', 'nps-2026', 'ttf', 'NPS_2026[wght].ttf')

if (!existsSync(VF_PATH)) {
  describe.skip('interpolation sanity (no VF — run nps-2026.ts first)', () => {
    it('build first', () => {})
  })
}
else {
  describe('NPS 2026 wght-axis interpolation', () => {
    const vf: TTFObject = (() => {
      const buf = Bun.file(VF_PATH)
      // Using Bun.file().arrayBufferSync isn't exposed; rely on readFileSync via Node
      // eslint-disable-next-line ts/no-require-imports
      const fs = require('node:fs')
      const b = fs.readFileSync(VF_PATH) as Buffer
      const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
      return new TTFReader().read(ab)
      void buf
    })()

    const regular = createInstance(vf, { coordinates: { wght: 400 }, updateName: false })
    const black = createInstance(vf, { coordinates: { wght: 900 }, updateName: false })
    const midHeavy = createInstance(vf, { coordinates: { wght: 550 }, updateName: false })

    // Same on the thin half.
    const thin = createInstance(vf, { coordinates: { wght: 100 }, updateName: false })
    const midThin = createInstance(vf, { coordinates: { wght: 250 }, updateName: false })

    /**
     * Compare wght=550 glyph to the linear-interpolated expectation between
     * Regular and Black. The tolerance allows ±1 em unit per coordinate
     * because gvar deltas are stored as 16-bit integers — rounding
     * introduces up to 1-unit drift at interior axis positions.
     */
    function interpolates(a: Glyph, b: Glyph, t: number, out: Glyph, label: string): void {
      expect(a.contours?.length).toBe(out.contours?.length)
      for (let ci = 0; ci < (a.contours?.length ?? 0); ci++) {
        const aContour = a.contours![ci]!
        const bContour = b.contours![ci]!
        const outContour = out.contours![ci]!
        expect(outContour.length).toBe(aContour.length)
        for (let pi = 0; pi < aContour.length; pi++) {
          const expectedX = aContour[pi]!.x + t * (bContour[pi]!.x - aContour[pi]!.x)
          const expectedY = aContour[pi]!.y + t * (bContour[pi]!.y - aContour[pi]!.y)
          const actualX = outContour[pi]!.x
          const actualY = outContour[pi]!.y
          const dx = Math.abs(actualX - expectedX)
          const dy = Math.abs(actualY - expectedY)
          if (dx > 1.5 || dy > 1.5) {
            throw new Error(
              `${label} point ${ci}:${pi} diverges from linear interpolation: `
              + `expected (${expectedX.toFixed(2)},${expectedY.toFixed(2)}), `
              + `got (${actualX},${actualY})`,
            )
          }
        }
      }
    }

    it('O glyph interpolates linearly between Regular and Black at wght=550', () => {
      const t = (550 - 400) / (900 - 400) // 0.3
      const idx = vf.glyf.findIndex(g => g.name === 'O')
      expect(idx).toBeGreaterThanOrEqual(0)
      interpolates(regular.glyf[idx]!, black.glyf[idx]!, t, midHeavy.glyf[idx]!, 'O')
    })

    it('I glyph interpolates linearly between Regular and Black at wght=550', () => {
      const t = (550 - 400) / (900 - 400)
      const idx = vf.glyf.findIndex(g => g.name === 'I')
      expect(idx).toBeGreaterThanOrEqual(0)
      interpolates(regular.glyf[idx]!, black.glyf[idx]!, t, midHeavy.glyf[idx]!, 'I')
    })

    it('M glyph interpolates linearly on the thin side (wght=250 between Thin and Regular)', () => {
      // Normalized: wght=250 falls at (250-100)/(400-100) = 0.5 between thin and regular
      const t = (250 - 100) / (400 - 100)
      const idx = vf.glyf.findIndex(g => g.name === 'M')
      expect(idx).toBeGreaterThanOrEqual(0)
      interpolates(thin.glyf[idx]!, regular.glyf[idx]!, t, midThin.glyf[idx]!, 'M')
    })

    it('advance widths interpolate linearly at wght=550', () => {
      const t = (550 - 400) / (900 - 400)
      for (const name of ['A', 'I', 'O', 'M', 'S']) {
        const idx = vf.glyf.findIndex(g => g.name === name)
        if (idx < 0) continue
        const aw = regular.glyf[idx]!.advanceWidth ?? 0
        const bw = black.glyf[idx]!.advanceWidth ?? 0
        const expected = aw + t * (bw - aw)
        const actual = midHeavy.glyf[idx]!.advanceWidth ?? 0
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1.5)
      }
    })

    it('Regular instantiation matches the default axis position exactly', () => {
      // wght=400 is the default; every glyph should be byte-identical to
      // the pristine master (all gvar tuples scale to 0).
      for (const name of ['A', 'I', 'O', 'M', 'S', 'B']) {
        const idx = vf.glyf.findIndex(g => g.name === name)
        if (idx < 0) continue
        const pristine = vf.glyf[idx]!
        const inst = regular.glyf[idx]!
        expect(inst.advanceWidth).toBe(pristine.advanceWidth)
        expect(inst.contours?.length).toBe(pristine.contours?.length)
        for (let ci = 0; ci < (pristine.contours?.length ?? 0); ci++) {
          const pc = pristine.contours![ci]!
          const ic = inst.contours![ci]!
          for (let pi = 0; pi < pc.length; pi++) {
            expect(ic[pi]!.x).toBe(pc[pi]!.x)
            expect(ic[pi]!.y).toBe(pc[pi]!.y)
          }
        }
      }
    })
  })
}
