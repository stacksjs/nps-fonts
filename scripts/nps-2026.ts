#!/usr/bin/env bun
/**
 * NPS 2026 — 1930s-era NPS/WPA display face, variable weight.
 *
 * Outlines live in `sources/nps-2026/outlines.json` (extracted once via
 * `scripts/_extract-source.ts`). US copyright law (37 CFR § 202.1(e))
 * holds that typeface *designs* are not copyrightable; the repo ships the
 * transcribed geometry under its own family name and metadata.
 *
 * Build pipeline (all pure TypeScript via `ts-font-editor` — no Python):
 *   1. Load pristine outlines.
 *   2. Apply `PATCHES` / `ADDITIONS`.
 *   3. Derive Thin/Black masters via point-compatible contour offsetting.
 *   4. Merge the three masters into a variable TTF with `buildVariableFont`.
 *   5. Also emit a static Regular OTF/TTF/WOFF/WOFF2 for tools without VF.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import {
  buildVariableFont,
  createInstance,
  TTFReader,
  TTFWriter,
  type MasterInput,
  type TTFObject,
} from 'ts-font-editor'
import { sfntToWoff } from './lib/woff.ts'
import { detectOuterWinding, offsetContour, recomputeBounds as recomputeOffsetBounds, type OuterWinding } from './lib/offset.ts'
import type { Contour, GlyphAddition, GlyphPatch, Point } from '../sources/nps-2026/patches.ts'
import { ADDITIONS, PATCHES } from '../sources/nps-2026/patches.ts'

const wawoff2 = await import('wawoff2')

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'nps-2026')
const OUTLINES = resolve(ROOT, 'sources', 'nps-2026', 'outlines.json')

const FAMILY = 'NPS 2026'
const POSTSCRIPT = 'NPS_2026'
const COPYRIGHT = 'Copyright (c) 2026, NPS Fonts contributors. NPS 2026 outline geometry transcribed from a reference art-deco typeface; typeface designs are not copyrightable under 37 CFR § 202.1(e).'
const DESCRIPTION = 'NPS 2026 — 1930s-era NPS/WPA display face (variable weight).'
const VERSION = 'Version 1.000'

/**
 * Weight-axis masters. `offset` is the per-point normal-direction shift
 * applied to the pristine Regular outlines (Regular = 0). `wght` is both
 * the `wght` axis location and each master's OS/2 usWeightClass.
 */
// Offsets chosen empirically: the source has some narrow features (S
// curves, R leg, digit strokes) that fragment when offset magnitude
// exceeds ~45 em. Keep Thin conservative; Black can push further without
// issue because the failure mode is counter-closure, not curve collapse.
const MASTERS = [
  { name: 'Thin', wght: 100, offset: -35 },
  { name: 'Regular', wght: 400, offset: 0 },
  { name: 'Black', wght: 900, offset: 55 },
] as const

type MasterSpec = (typeof MASTERS)[number]

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
  name: Record<string, string | Array<{ nameID: number, value: string }>>
  [k: string]: unknown
}

async function loadPatchedData(): Promise<{ data: FontData, patched: string[], added: string[] }> {
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

  return { data, patched, added }
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
  const bb = recomputeOffsetBounds(g.contours)
  g.xMin = bb.xMin; g.yMin = bb.yMin; g.xMax = bb.xMax; g.yMax = bb.yMax
  g.leftSideBearing = bb.xMin
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

function brandNameTable(data: FontData, styleName: string) {
  data.name.copyright = COPYRIGHT
  data.name.fontFamily = FAMILY
  data.name.fontSubFamily = styleName
  data.name.uniqueSubFamily = `NPSFonts: ${FAMILY} ${styleName}: 2026`
  data.name.fullName = `${FAMILY} ${styleName}`
  data.name.postScriptName = `${POSTSCRIPT}-${styleName.replace(/\s+/g, '')}`
  data.name.tradeMark = ''
  data.name.manufacturer = 'NPS Fonts contributors'
  data.name.designer = 'NPS Fonts contributors'
  data.name.description = DESCRIPTION
  data.name.version = VERSION
  data.name.preferredFamily = FAMILY
  data.name.preferredSubFamily = styleName
}

function buildMasterTtf(base: FontData, master: MasterSpec, outerWinding: OuterWinding): { ttf: TTFObject, buf: Buffer } {
  const data: FontData = structuredClone(base)

  if (master.offset !== 0) {
    for (const g of data.glyf) {
      if (!g.contours) continue
      g.contours = g.contours.map(c => offsetContour(c, master.offset, outerWinding))
      const bb = recomputeOffsetBounds(g.contours)
      g.xMin = bb.xMin; g.yMin = bb.yMin; g.xMax = bb.xMax; g.yMax = bb.yMax
      g.leftSideBearing = bb.xMin
    }
  }

  brandNameTable(data, master.name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  if (d['OS/2']) d['OS/2'].usWeightClass = master.wght

  // Round-trip through TTFReader to get a fully-formed TTFObject (the JSON
  // lacks some derived fields the writer expects; reading back a written
  // TTF normalizes everything).
  const raw = Buffer.from(new TTFWriter().write(d as TTFObject))
  return { ttf: d as TTFObject, buf: raw }
}

// ---------------------------------------------------------------------------
// Static OTF (CFF) for tools without variable font support. Built from the
// Regular-master TTF by re-parsing through opentype.js. Q curves become
// mathematically-equivalent C curves.
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

  const byIndex = new Map<number, { name: string, unicodes: number[], adv: number, path: opentype.Path }>()
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
    font.tables.os2.usWeightClass = 400
    font.tables.os2.achVendID = 'NPSF'
    font.tables.os2.fsSelection = 0xC0
  }
  return Buffer.from(font.toArrayBuffer() as ArrayBuffer)
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function buildNps2026() {
  const { data: base, patched, added } = await loadPatchedData()

  // Sniff the font's outer-contour winding from a representative single-
  // contour glyph ('I'). Determines which perpendicular direction the
  // offset routine uses so positive `offset` consistently adds ink.
  const probe = base.glyf.find(g => g.name === 'I' && g.contours && g.contours.length === 1)
    ?? base.glyf.find(g => g.contours && g.contours.length === 1)
  const outerWinding = detectOuterWinding(probe?.contours)

  // Build each static master in memory. The master's TTFObject is what
  // buildVariableFont consumes; the byte buffer is for side outputs.
  const masterData: Array<{ spec: MasterSpec, ttf: TTFObject, buf: Buffer }> = []
  for (const m of MASTERS) {
    const { ttf, buf } = buildMasterTtf(base, m, outerWinding)
    masterData.push({ spec: m, ttf, buf })
  }

  // Merge into a variable font.
  const variable: TTFObject = buildVariableFont({
    axes: [{
      tag: 'wght',
      name: 'Weight',
      minValue: 100,
      defaultValue: 400,
      maxValue: 900,
    }],
    masters: masterData.map<MasterInput>(m => ({
      location: { wght: m.spec.wght },
      font: m.ttf,
    })),
    instances: [
      { name: 'Thin', location: { wght: 100 } },
      { name: 'ExtraLight', location: { wght: 200 } },
      { name: 'Light', location: { wght: 300 } },
      { name: 'Regular', location: { wght: 400 } },
      { name: 'Medium', location: { wght: 500 } },
      { name: 'SemiBold', location: { wght: 600 } },
      { name: 'Bold', location: { wght: 700 } },
      { name: 'ExtraBold', location: { wght: 800 } },
      { name: 'Black', location: { wght: 900 } },
    ],
  })

  // Rebrand family name on the variable font (buildVariableFont copies the
  // default master's name as-is; the subfamily should be "Regular" by
  // convention for variable fonts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variable.name.fontFamily = FAMILY
  variable.name.fontSubFamily = 'Regular'
  variable.name.fullName = FAMILY
  variable.name.postScriptName = POSTSCRIPT

  const variableTtf = Buffer.from(new TTFWriter().write(variable))

  // Static Regular (default master) for tools without VF support.
  const regular = masterData.find(m => m.spec.name === 'Regular')!
  const staticTtf = regular.buf
  const staticOtf = buildOtfFromTtf(staticTtf)

  await mkdir(resolve(FONTS, 'otf'), { recursive: true })
  await mkdir(resolve(FONTS, 'ttf'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff2'), { recursive: true })

  // Variable
  await writeFile(resolve(FONTS, 'ttf', 'NPS_2026[wght].ttf'), variableTtf)
  await writeFile(resolve(FONTS, 'woff', 'NPS_2026[wght].woff'), sfntToWoff(variableTtf))
  const variableWoff2 = Buffer.from(await wawoff2.compress(variableTtf))
  await writeFile(resolve(FONTS, 'woff2', 'NPS_2026[wght].woff2'), variableWoff2)

  // Static
  await writeFile(resolve(FONTS, 'ttf', 'NPS_2026-Regular.ttf'), staticTtf)
  await writeFile(resolve(FONTS, 'otf', 'NPS_2026-Regular.otf'), staticOtf)
  await writeFile(resolve(FONTS, 'woff', 'NPS_2026-Regular.woff'), sfntToWoff(staticTtf))
  const staticWoff2 = Buffer.from(await wawoff2.compress(staticTtf))
  await writeFile(resolve(FONTS, 'woff2', 'NPS_2026-Regular.woff2'), staticWoff2)

  return {
    glyphCount: base.glyf.length,
    patched,
    added,
    variableTtf,
    variableWoff2,
    staticTtf,
    staticOtf,
  }
}

/** Instantiate the variable font at a specific axis location as a static TTF. */
export function instantiateVariable(variableTtfBuf: Buffer, coordinates: Record<string, number>): Buffer {
  const ab = variableTtfBuf.buffer.slice(variableTtfBuf.byteOffset, variableTtfBuf.byteOffset + variableTtfBuf.byteLength)
  const vf = new TTFReader().read(ab)
  const inst = createInstance(vf, { coordinates, updateName: false })
  return Buffer.from(new TTFWriter().write(inst))
}

async function run() {
  const r = await buildNps2026()
  const extras = [
    r.patched.length ? `patched: ${r.patched.join(', ')}` : null,
    r.added.length ? `added: ${r.added.join(', ')}` : null,
  ].filter(Boolean).join(' · ')
  console.log(
    `✓ ${FAMILY}: ${r.glyphCount} glyphs · VF TTF ${(r.variableTtf.length / 1024).toFixed(1)}KB `
    + `· VF WOFF2 ${(r.variableWoff2.length / 1024).toFixed(1)}KB `
    + `· Regular TTF ${(r.staticTtf.length / 1024).toFixed(1)}KB `
    + `· OTF ${(r.staticOtf.length / 1024).toFixed(1)}KB`
    + (extras ? ` · ${extras}` : ''),
  )
}

export type { Contour, GlyphAddition, GlyphPatch, Point }

await run()
