#!/usr/bin/env bun
/**
 * Summitgrade 1935 — 1930s-era NPS/WPA display face.
 *
 * The glyph outlines originate from a reference art-deco typeface whose
 * geometry was extracted once into `sources/summitgrade-1935/outlines.json`
 * (see `scripts/_extract-source.ts`). US copyright law (37 CFR § 202.1(e))
 * holds that typeface *designs* are not copyrightable; font *software* is.
 * The repo ships the transcribed geometry under a distinct family name with
 * its own metadata.
 *
 * Build steps:
 *   1. Load pristine outlines + font tables from outlines.json.
 *   2. Apply `PATCHES` (per-glyph tweaks) and `ADDITIONS` (new glyphs).
 *   3. Patch name/copyright tables to Summitgrade 1935 branding.
 *   4. Emit TTF (TrueType-native, preserves hinting), OTF (CFF), WOFF, WOFF2.
 *
 * No external build-time dependency on the reference TTF.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { Font } from 'fonteditor-core'
import { sfntToWoff } from './lib/woff.ts'
import type { Contour, GlyphAddition, GlyphPatch, Point } from '../sources/summitgrade-1935/patches.ts'
import { ADDITIONS, PATCHES } from '../sources/summitgrade-1935/patches.ts'

const wawoff2 = await import('wawoff2')

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'summitgrade-1935')
const OUTLINES = resolve(ROOT, 'sources', 'summitgrade-1935', 'outlines.json')

const FAMILY = 'Summitgrade 1935'
const POSTSCRIPT = 'Summitgrade1935-Regular'
const COPYRIGHT = 'Copyright (c) 2026, NPS Fonts contributors. Outline geometry transcribed from a reference art-deco typeface; typeface designs are not copyrightable under 37 CFR § 202.1(e).'
const DESCRIPTION = 'Summitgrade 1935 — 1930s-era NPS/WPA display face.'
const VERSION = 'Version 1.000'

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
  compound?: boolean
  glyfs?: unknown[]
}
interface FontData {
  glyf: FontGlyph[]
  name: Record<string, string>
  [k: string]: unknown
}

export async function buildSummitgrade(): Promise<{
  ttf: Buffer
  otf: Buffer
  glyphCount: number
  patched: string[]
  added: string[]
}> {
  const data: FontData = JSON.parse(await readFile(OUTLINES, 'utf8'))

  const patched: string[] = []
  for (const [name, patch] of Object.entries(PATCHES)) {
    const g = data.glyf.find(x => x.name === name)
    if (!g) {
      console.warn(`  ! patch target not found: ${name}`)
      continue
    }
    applyPatch(g, patch)
    patched.push(name)
  }

  const added: string[] = []
  for (const add of ADDITIONS) {
    data.glyf.push(additionToGlyph(add))
    added.push(add.name)
  }

  // Re-brand identity tables.
  data.name.copyright = COPYRIGHT
  data.name.fontFamily = FAMILY
  data.name.fontSubFamily = 'Regular'
  data.name.uniqueSubFamily = `NPSFonts: ${FAMILY}: 2026`
  data.name.fullName = FAMILY
  data.name.postScriptName = POSTSCRIPT
  data.name.tradeMark = ''
  data.name.manufacturer = 'NPS Fonts contributors'
  data.name.designer = 'NPS Fonts contributors'
  data.name.description = DESCRIPTION
  data.name.version = VERSION
  data.name.preferredFamily = FAMILY
  data.name.preferredSubFamily = 'Regular'

  // fonteditor-core accepts the data object directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = Font.create(data as any)
  const ttf = Buffer.from(f.write({ type: 'ttf', hinting: true }) as ArrayBuffer | Buffer)
  const otf = buildOtfFromTtf(ttf)

  return { ttf, otf, glyphCount: data.glyf.length, patched, added }
}

function applyPatch(g: FontGlyph, patch: GlyphPatch) {
  if (patch.setContours) {
    g.contours = cloneContours(patch.setContours)
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

function cloneContours(cs: Contour[]): Contour[] {
  return cs.map(c => c.map(p => ({ x: p.x, y: p.y, onCurve: p.onCurve })))
}

function recomputeBounds(g: FontGlyph) {
  if (!g.contours || g.contours.length === 0) {
    g.xMin = g.yMin = g.xMax = g.yMax = 0
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

function additionToGlyph(a: GlyphAddition): FontGlyph {
  const g: FontGlyph = {
    name: a.name,
    unicode: a.unicode,
    advanceWidth: a.advanceWidth,
    leftSideBearing: a.leftSideBearing ?? 0,
    xMin: 0, yMin: 0, xMax: 0, yMax: 0,
    contours: cloneContours(a.contours),
  }
  recomputeBounds(g)
  if (a.leftSideBearing !== undefined) g.leftSideBearing = a.leftSideBearing
  return g
}

// ---------------------------------------------------------------------------
// OTF (CFF) output, derived by re-parsing the built TTF with opentype.js.
// Q curves get expressed as mathematically-equivalent C curves during CFF
// serialization.
// ---------------------------------------------------------------------------

function buildOtfFromTtf(ttfBuf: Buffer): Buffer {
  const ab = ttfBuf.buffer.slice(ttfBuf.byteOffset, ttfBuf.byteOffset + ttfBuf.byteLength)
  const src = opentype.parse(ab)

  interface PathCommand {
    type: 'M' | 'L' | 'C' | 'Q' | 'Z'
    x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number
  }

  const clonePath = (p: opentype.Path): opentype.Path => {
    const out = new opentype.Path()
    for (const c of p.commands as unknown as PathCommand[]) {
      switch (c.type) {
        case 'M': out.moveTo(c.x!, c.y!); break
        case 'L': out.lineTo(c.x!, c.y!); break
        case 'Q': out.quadraticCurveTo(c.x1!, c.y1!, c.x!, c.y!); break
        case 'C': out.curveTo(c.x1!, c.y1!, c.x2!, c.y2!, c.x!, c.y!); break
        case 'Z': out.close(); break
      }
    }
    return out
  }

  const notdef = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: src.glyphs.get(0).advanceWidth ?? 600,
    path: new opentype.Path(),
  })
  const glyphs: opentype.Glyph[] = [notdef]
  const seen = new Set<number>([0])
  const candidate: number[] = []
  for (let cp = 0x0020; cp <= 0x007E; cp++) candidate.push(cp)
  for (let cp = 0x00A0; cp <= 0x00FF; cp++) candidate.push(cp)
  for (const cp of [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026]) candidate.push(cp)

  const byIndex = new Map<number, { name: string; unicodes: number[]; adv: number; path: opentype.Path }>()
  for (const cp of candidate) {
    const g = src.charToGlyph(String.fromCodePoint(cp))
    if (!g || g.index === 0) continue
    if (seen.has(g.index)) {
      const e = byIndex.get(g.index)
      if (e && !e.unicodes.includes(cp)) e.unicodes.push(cp)
      continue
    }
    seen.add(g.index)
    byIndex.set(g.index, {
      name: g.name ?? `glyph${g.index}`,
      unicodes: [cp],
      adv: g.advanceWidth ?? 0,
      path: clonePath(g.path),
    })
  }

  for (const t of byIndex.values()) {
    const g = new opentype.Glyph({
      name: t.name,
      unicode: t.unicodes[0]!,
      advanceWidth: t.adv,
      path: t.path,
    })
    if (t.unicodes.length > 1) {
      ;(g as opentype.Glyph & { unicodes: number[] }).unicodes = [...t.unicodes]
    }
    glyphs.push(g)
  }

  const font = new opentype.Font({
    familyName: FAMILY,
    styleName: 'Regular',
    unitsPerEm: src.unitsPerEm,
    ascender: src.ascender,
    descender: src.descender,
    designer: 'NPS Fonts contributors',
    designerURL: 'https://github.com/stacksjs/nps-fonts',
    manufacturer: 'NPS Fonts contributors',
    license: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
    licenseURL: 'https://openfontlicense.org',
    version: VERSION,
    description: DESCRIPTION,
    copyright: COPYRIGHT,
    trademark: '',
    glyphs,
  })
  if (font.tables.os2) {
    font.tables.os2.usWeightClass = 800
    font.tables.os2.achVendID = 'NPSF'
    font.tables.os2.fsSelection = 0xC0
  }
  return Buffer.from(font.toArrayBuffer() as ArrayBuffer)
}

async function run() {
  const { ttf, otf, glyphCount, patched, added } = await buildSummitgrade()
  await mkdir(resolve(FONTS, 'otf'), { recursive: true })
  await mkdir(resolve(FONTS, 'ttf'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff2'), { recursive: true })

  await writeFile(resolve(FONTS, 'ttf', 'Summitgrade1935-Regular.ttf'), ttf)
  await writeFile(resolve(FONTS, 'otf', 'Summitgrade1935-Regular.otf'), otf)
  await writeFile(resolve(FONTS, 'woff', 'Summitgrade1935-Regular.woff'), sfntToWoff(ttf))
  const woff2Buf = Buffer.from(await wawoff2.compress(ttf))
  await writeFile(resolve(FONTS, 'woff2', 'Summitgrade1935-Regular.woff2'), woff2Buf)

  const extras = [
    patched.length ? `patched: ${patched.join(', ')}` : null,
    added.length ? `added: ${added.join(', ')}` : null,
  ].filter(Boolean).join(' · ')
  console.log(`✓ ${FAMILY}: ${glyphCount} glyphs · TTF ${(ttf.length / 1024).toFixed(1)}KB · OTF ${(otf.length / 1024).toFixed(1)}KB · WOFF2 ${(woff2Buf.length / 1024).toFixed(1)}KB${extras ? ` · ${extras}` : ''}`)
}

export type { Contour, GlyphAddition, GlyphPatch, Point }

await run()
