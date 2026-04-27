#!/usr/bin/env bun
/**
 * NPS 2026 — 1930s-era NPS/WPA display face, variable weight.
 *
 * Outlines live in `sources/nps-2026/outlines.json`.
 *
 * Build pipeline (all pure TypeScript via `ts-fonts` — no Python):
 *   1. Load outlines.
 *   2. Apply `PATCHES` / `ADDITIONS`.
 *   3. Derive Thin/Black masters via point-compatible contour offsetting.
 *   4. Merge the three masters into a variable TTF with `buildVariableFont`.
 *   5. Also emit a static Regular OTF/TTF/WOFF/WOFF2 for tools without VF.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildVariableFont,
  createInstance,
  encodeWOFF2Native,
  OTFWriter,
  TTFReader,
  TTFWriter,
  type MasterInput,
  type TTFObject,
} from 'ts-fonts'
import { sfntToWoff } from './lib/woff.ts'
import { detectOuterWinding, offsetContour, recomputeBounds as recomputeOffsetBounds, type OuterWinding } from './lib/offset.ts'
import { PIPELINES } from './lib/transforms.ts'
import type { Contour, GlyphAddition, GlyphPatch, Point } from '../sources/nps-2026/patches.ts'
import { ADDITIONS, PATCHES } from '../sources/nps-2026/patches.ts'

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'nps-2026')
const OUTLINES = resolve(ROOT, 'sources', 'nps-2026', 'outlines.json')

const FAMILY = 'NPS 2026'
const POSTSCRIPT = 'NPS_2026'
const COPYRIGHT = 'Copyright (c) 2026, NPS Fonts contributors. NPS 2026 — released under the SIL Open Font License 1.1.'
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
// Static OTF (CFF) for tools without variable font support. Subsets the
// Regular master to common Latin codepoints and emits a Type 2 / CFF .otf
// via ts-fonts' OTFWriter. Quadratic TT outlines are converted to cubic
// charstrings inside the writer.
// ---------------------------------------------------------------------------

function buildOtfFromTtf(ttfBuf: Buffer): Buffer {
  const ab = ttfBuf.buffer.slice(ttfBuf.byteOffset, ttfBuf.byteOffset + ttfBuf.byteLength) as ArrayBuffer
  const src = new TTFReader().read(ab)

  // Codepoints we want covered in the OTF (Latin-1 + common typographic punctuation).
  const candidate: number[] = []
  for (let cp = 0x0020; cp <= 0x007E; cp++) candidate.push(cp)
  for (let cp = 0x00A0; cp <= 0x00FF; cp++) candidate.push(cp)
  for (const cp of [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026]) candidate.push(cp)

  // Walk the TTFObject's cmap to gather the unique glyph indices required.
  const wantedGids = new Set<number>([0]) // .notdef
  const cmap = (src.cmap ?? {}) as Record<number, number>
  for (const cp of candidate) {
    const gid = cmap[cp]
    if (typeof gid === 'number' && gid !== 0) wantedGids.add(gid)
  }

  // Build a parallel glyph list, preserving original indices so the cmap
  // remapping below stays consistent. Glyphs not in `wantedGids` are kept
  // as empty (advance-only) entries — small footprint, no contour bytes.
  const newGlyphs: typeof src.glyf = []
  const newCmap: Record<number, number> = {}
  for (let oldIdx = 0; oldIdx < src.glyf.length; oldIdx++) {
    const g = src.glyf[oldIdx]!
    if (wantedGids.has(oldIdx)) {
      newGlyphs.push(g)
    }
    else {
      newGlyphs.push({
        ...g,
        contours: [],
        unicode: undefined as never,
      })
    }
  }
  for (const cp of Object.keys(cmap)) {
    const cpNum = Number(cp)
    const gid = cmap[cpNum]!
    if (wantedGids.has(gid)) newCmap[cpNum] = gid
  }

  const subsetted: TTFObject = {
    ...src,
    glyf: newGlyphs,
    cmap: newCmap as never,
    // Reset the name table so OTFWriter sources branding from our values.
    name: {
      ...src.name,
      fontFamily: FAMILY,
      fontSubFamily: 'Regular',
      fullName: FAMILY,
      postScriptName: `${POSTSCRIPT}-Regular`,
      version: VERSION,
      copyright: COPYRIGHT,
      description: DESCRIPTION,
      manufacturer: 'NPS Fonts contributors',
      designer: 'NPS Fonts contributors',
    },
  }
  return Buffer.from(new OTFWriter({ fontName: `${POSTSCRIPT}-Regular` }).write(subsetted))
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function buildNps2026() {
  const { data: base, patched, added } = await loadPatchedData()

  // Apply NPS 2026's transform pipeline AFTER patches/additions so every
  // glyph (including patched/added) carries the same differentiation
  // signature, and BEFORE master generation so the transform propagates
  // identically through the wght-axis offset masters.
  PIPELINES['nps-2026']!(base as unknown as Parameters<typeof PIPELINES['nps-2026']>[0])

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
  const variableTtfAb = variableTtf.buffer.slice(variableTtf.byteOffset, variableTtf.byteOffset + variableTtf.byteLength) as ArrayBuffer
  const staticTtfAb = staticTtf.buffer.slice(staticTtf.byteOffset, staticTtf.byteOffset + staticTtf.byteLength) as ArrayBuffer

  await writeFile(resolve(FONTS, 'ttf', 'NPS_2026[wght].ttf'), variableTtf)
  await writeFile(resolve(FONTS, 'woff', 'NPS_2026[wght].woff'), sfntToWoff(variableTtf))
  const variableWoff2 = Buffer.from(await encodeWOFF2Native(variableTtfAb))
  await writeFile(resolve(FONTS, 'woff2', 'NPS_2026[wght].woff2'), variableWoff2)

  // Static
  await writeFile(resolve(FONTS, 'ttf', 'NPS_2026-Regular.ttf'), staticTtf)
  await writeFile(resolve(FONTS, 'otf', 'NPS_2026-Regular.otf'), staticOtf)
  await writeFile(resolve(FONTS, 'woff', 'NPS_2026-Regular.woff'), sfntToWoff(staticTtf))
  const staticWoff2 = Buffer.from(await encodeWOFF2Native(staticTtfAb))
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
  const ab = new ArrayBuffer(variableTtfBuf.byteLength)
  new Uint8Array(ab).set(variableTtfBuf)
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
