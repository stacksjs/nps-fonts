#!/usr/bin/env bun
/**
 * NPS 2026 — 1930s-era NPS/WPA display face, variable weight.
 *
 * Outlines live in `sources/nps-2026/outlines.json` (extracted once; see
 * `scripts/_extract-source.ts`). US copyright law (37 CFR § 202.1(e)) holds
 * that typeface *designs* are not copyrightable; the repo ships the
 * transcribed geometry under its own family name and metadata.
 *
 * Build pipeline:
 *   1. Load pristine outlines.
 *   2. Apply `PATCHES` / `ADDITIONS`.
 *   3. Derive two additional masters (Thin / Black) by contour offsetting —
 *      point-compatible with the Regular master so they can interpolate.
 *   4. Write three intermediate TTFs, then shell out to fontTools varLib
 *      (Python) to merge them into a variable TTF with a `wght` axis.
 *   5. Also emit a static Regular in OTF/WOFF/WOFF2 for tools that don't
 *      handle variable fonts yet.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import opentype from 'opentype.js'
import { Font } from 'fonteditor-core'
import { sfntToWoff } from './lib/woff.ts'
import { offsetContour, recomputeBounds as recomputeOffsetBounds } from './lib/offset.ts'
import type { Contour, GlyphAddition, GlyphPatch, Point } from '../sources/nps-2026/patches.ts'
import { ADDITIONS, PATCHES } from '../sources/nps-2026/patches.ts'

const wawoff2 = await import('wawoff2')

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'nps-2026')
const OUTLINES = resolve(ROOT, 'sources', 'nps-2026', 'outlines.json')
const TMP = resolve(ROOT, '.build', 'nps-2026-masters')
const VENV_PY = resolve(ROOT, '.venv', 'bin', 'python')
const VARLIB_PY = resolve(ROOT, 'scripts', 'lib', 'varlib_build.py')

const FAMILY = 'NPS 2026'
const POSTSCRIPT = 'NPS_2026'
const COPYRIGHT = 'Copyright (c) 2026, NPS Fonts contributors. Outline geometry transcribed from a reference art-deco typeface; typeface designs are not copyrightable under 37 CFR § 202.1(e).'
const DESCRIPTION = 'NPS 2026 — 1930s-era NPS/WPA display face (variable weight).'
const VERSION = 'Version 1.000'

/**
 * Weight axis masters. `offset` is the per-point normal-direction shift in
 * em units (source master = 0). `wght` is the `wght` axis location and also
 * the OS/2 usWeightClass for that static master.
 */
const MASTERS = [
  { name: 'Thin', wght: 100, offset: -70 },
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
  name: Record<string, string>
  [k: string]: unknown
}

async function loadPatchedData(): Promise<{ data: FontData; patched: string[]; added: string[] }> {
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

function buildMasterTtf(base: FontData, master: MasterSpec): Buffer {
  // Deep clone so the offset doesn't mutate the base.
  const data: FontData = structuredClone(base)

  if (master.offset !== 0) {
    for (const g of data.glyf) {
      if (!g.contours) continue // composite glyphs leave their contours untouched
      g.contours = g.contours.map(c => offsetContour(c, master.offset))
      const bb = recomputeOffsetBounds(g.contours)
      g.xMin = bb.xMin; g.yMin = bb.yMin; g.xMax = bb.xMax; g.yMax = bb.yMax
      g.leftSideBearing = bb.xMin
    }
  }

  brandNameTable(data, master.name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyData = data as any
  if (anyData['OS/2']) {
    anyData['OS/2'].usWeightClass = master.wght
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = Font.create(data as any)
  return Buffer.from(f.write({ type: 'ttf', hinting: true }) as ArrayBuffer | Buffer)
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

// ---------------------------------------------------------------------------
// Static OTF (CFF) for tools without variable font support. Built from the
// Regular (default-axis) TTF.
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
    font.tables.os2.usWeightClass = 400
    font.tables.os2.achVendID = 'NPSF'
    font.tables.os2.fsSelection = 0xC0
  }
  return Buffer.from(font.toArrayBuffer() as ArrayBuffer)
}

// ---------------------------------------------------------------------------
// Variable font merge (Python fontTools varLib via subprocess)
// ---------------------------------------------------------------------------

function buildVariableTtf(masterPaths: Array<{ wght: number; path: string }>, outPath: string) {
  if (!existsSync(VENV_PY)) {
    throw new Error(`fontTools venv missing at ${VENV_PY}. Run:\n  /opt/homebrew/bin/python3.13 -m venv .venv && .venv/bin/pip install fonttools`)
  }
  const args = [
    VARLIB_PY,
    '400', // default axis position
    outPath,
    ...masterPaths.map(m => `${m.wght}:${m.path}`),
  ]
  const r = spawnSync(VENV_PY, args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`varLib build failed (${r.status}):\nstdout: ${r.stdout}\nstderr: ${r.stderr}`)
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function buildNps2026() {
  const { data: base, patched, added } = await loadPatchedData()

  await mkdir(TMP, { recursive: true })
  const masterPaths: Array<{ name: string; wght: number; path: string; buf: Buffer }> = []
  for (const m of MASTERS) {
    const buf = buildMasterTtf(base, m)
    const path = resolve(TMP, `NPS_2026-${m.name}.ttf`)
    await writeFile(path, buf)
    masterPaths.push({ name: m.name, wght: m.wght, path, buf })
  }

  await mkdir(resolve(FONTS, 'otf'), { recursive: true })
  await mkdir(resolve(FONTS, 'ttf'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff2'), { recursive: true })

  // Static Regular (for tools without variable support)
  const regular = masterPaths.find(m => m.name === 'Regular')!
  await writeFile(resolve(FONTS, 'ttf', 'NPS_2026-Regular.ttf'), regular.buf)
  const otf = buildOtfFromTtf(regular.buf)
  await writeFile(resolve(FONTS, 'otf', 'NPS_2026-Regular.otf'), otf)
  await writeFile(resolve(FONTS, 'woff', 'NPS_2026-Regular.woff'), sfntToWoff(regular.buf))
  const regularWoff2 = Buffer.from(await wawoff2.compress(regular.buf))
  await writeFile(resolve(FONTS, 'woff2', 'NPS_2026-Regular.woff2'), regularWoff2)

  // Variable
  const vfPath = resolve(FONTS, 'ttf', 'NPS_2026[wght].ttf')
  buildVariableTtf(masterPaths.map(m => ({ wght: m.wght, path: m.path })), vfPath)
  const vfBuf = Buffer.from(await Bun.file(vfPath).arrayBuffer())
  await writeFile(resolve(FONTS, 'woff', 'NPS_2026[wght].woff'), sfntToWoff(vfBuf))
  const vfWoff2 = Buffer.from(await wawoff2.compress(vfBuf))
  await writeFile(resolve(FONTS, 'woff2', 'NPS_2026[wght].woff2'), vfWoff2)

  // Clean up build scratch
  await rm(TMP, { recursive: true, force: true })

  return {
    glyphCount: base.glyf.length,
    patched,
    added,
    regularTtf: regular.buf,
    variableTtf: vfBuf,
    variableWoff2: vfWoff2,
    regularWoff2,
    otf,
  }
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
    + `· Regular TTF ${(r.regularTtf.length / 1024).toFixed(1)}KB `
    + `· OTF ${(r.otf.length / 1024).toFixed(1)}KB`
    + (extras ? ` · ${extras}` : ''),
  )
}

export type { Contour, GlyphAddition, GlyphPatch, Point }

await run()
