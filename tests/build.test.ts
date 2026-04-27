/**
 * Build smoke tests for the parametric families.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { parse, readGsubFeatures, readLayoutHeader, TTFReader } from 'ts-fonts'
import { ALL_FAMILIES, FAMILY_DISPLAY } from '../scripts/lib/common.ts'

const FONTS_DIR = resolve(import.meta.dir, '..', 'fonts')

describe('built artifacts exist', () => {
  for (const id of ALL_FAMILIES) {
    const meta = FAMILY_DISPLAY[id]
    const base = `${meta.file}-Regular`
    test(`${id}/otf/${base}.otf`, () => {
      expect(existsSync(resolve(FONTS_DIR, id, 'otf', `${base}.otf`))).toBe(true)
    })
    test(`${id}/ttf/${base}.ttf`, () => {
      expect(existsSync(resolve(FONTS_DIR, id, 'ttf', `${base}.ttf`))).toBe(true)
    })
    test(`${id}/woff/${base}.woff`, () => {
      expect(existsSync(resolve(FONTS_DIR, id, 'woff', `${base}.woff`))).toBe(true)
    })
    test(`${id}/woff2/${base}.woff2`, () => {
      expect(existsSync(resolve(FONTS_DIR, id, 'woff2', `${base}.woff2`))).toBe(true)
    })
  }
})

describe('fonts re-parse cleanly', () => {
  for (const id of ALL_FAMILIES) {
    const meta = FAMILY_DISPLAY[id]
    const base = `${meta.file}-Regular`
    test(`${id}`, async () => {
      const buf = await Bun.file(resolve(FONTS_DIR, id, 'otf', `${base}.otf`)).arrayBuffer()
      const font = parse(buf)
      expect(font.unitsPerEm).toBeGreaterThan(0)
      expect(font.numGlyphs).toBeGreaterThan(20)
    })
  }
})

describe('family name matches manifest', () => {
  for (const id of ALL_FAMILIES) {
    const meta = FAMILY_DISPLAY[id]
    const base = `${meta.file}-Regular`
    test(`${id}`, async () => {
      const buf = await Bun.file(resolve(FONTS_DIR, id, 'otf', `${base}.otf`)).arrayBuffer()
      const font = parse(buf)
      expect(font.familyName).toBe(meta.display)
    })
  }
})

describe('copyright includes NPS Fonts credit', () => {
  for (const id of ALL_FAMILIES) {
    const meta = FAMILY_DISPLAY[id]
    const base = `${meta.file}-Regular`
    test(`${id}`, async () => {
      const buf = await Bun.file(resolve(FONTS_DIR, id, 'otf', `${base}.otf`)).arrayBuffer()
      const font = parse(buf)
      const cr = (font.data.name.copyright as string) ?? ''
      expect(cr.length).toBeGreaterThan(20)
      expect(cr).toContain('NPS Fonts')
      expect(cr).toContain(meta.display)
    })
  }
})

describe('NPS Symbols: pictographs at expected codepoints', () => {
  const expected = [
    [0xE000, 'arrowhead'],
    [0xE001, 'mountain'],
    [0xE002, 'tent'],
    [0xE003, 'campfire'],
    [0xE005, 'compass'],
    [0xE006, 'sun'],
  ] as const
  test('all PUA + ASCII shortcuts present', async () => {
    const buf = await Bun.file(resolve(FONTS_DIR, 'nps-symbols', 'otf', 'NPSSymbols-Regular.otf')).arrayBuffer()
    const font = parse(buf)
    expect(font.familyName).toBe('NPS Symbols')
    for (const [cp, name] of expected) {
      const g = font.charToGlyph(String.fromCodePoint(cp))
      expect(g.name).toBe(name)
    }
    expect(font.charToGlyph('M').name).toBe('mountain')
    expect(font.charToGlyph('A').name).toBe('arrowhead')
    expect(font.charToGlyph('T').name).toBe('tent')
  })
})

describe('Campmate Script: GSUB liga is present', () => {
  test('GSUB table with liga feature exists', async () => {
    const buf = await Bun.file(resolve(FONTS_DIR, 'campmate-script', 'otf', 'CampmateScript-Regular.otf')).arrayBuffer()
    const ttf = new TTFReader().read(buf)
    expect(ttf.rawTables?.GSUB).toBeDefined()
    // Parse GSUB → ligature lookups via the layout-common machinery.
    const gsubBytes = ttf.rawTables!.GSUB!
    const gsubAb = new ArrayBuffer(gsubBytes.byteLength)
    new Uint8Array(gsubAb).set(gsubBytes)
    const view = new DataView(gsubAb)
    const header = readLayoutHeader(view, 0)
    const features = readGsubFeatures(view, header, ['liga'])
    expect(features.ligatures.length).toBeGreaterThanOrEqual(5)
    for (const l of features.ligatures) {
      expect(l.by).toBeGreaterThan(0)
      expect(l.first).toBeGreaterThan(0)
      for (const s of l.components) expect(s).toBeGreaterThan(0)
    }
  })
})
