/**
 * Shared infrastructure for families built from `_extract-source.ts`
 * snapshots (sources/<family>/outlines*.json). Handles loading,
 * float→int rounding, name-table branding, and the OTF/TTF/WOFF/WOFF2
 * write side — all via `ts-fonts` (no opentype.js, no wawoff2 dep).
 *
 * Each family script:
 *   1. Loads one or more outlines.json files via `loadOutlines`.
 *   2. Optionally merges (e.g. uppercase from Wide + lowercase from Regular).
 *   3. Calls `brandNameTable` with the family display name + style.
 *   4. Calls `writeFamilyOutputs` to emit OTF/TTF/WOFF/WOFF2 to disk.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { encodeWOFF2Native, OTFWriter, TTFReader, TTFWriter, type TTFObject } from 'ts-fonts'
import { sfntToWoff } from './woff.ts'

const ROOT = resolve(import.meta.dir, '..', '..')

export interface FontGlyph {
  name: string
  unicode?: number[]
  advanceWidth: number
  leftSideBearing: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  contours?: Array<Array<{ x: number, y: number, onCurve: boolean }>>
  compound?: boolean
  glyfs?: unknown[]
}

export interface FontData {
  glyf: FontGlyph[]
  cmap?: Record<string, number>
  name: Record<string, string | Array<{ nameID: number, value: string }>>
  head?: Record<string, number>
  hhea?: Record<string, number>
  'OS/2'?: Record<string, number | string>
  post?: Record<string, unknown>
  maxp?: Record<string, number>
  [k: string]: unknown
}

/** Load an extracted-source JSON, rounding all coordinates to integers. */
export async function loadOutlines(relPath: string): Promise<FontData> {
  const data: FontData = JSON.parse(await readFile(resolve(ROOT, relPath), 'utf8'))
  roundCoords(data)
  return data
}

/** Round all glyph coordinates and bbox/metric values to integers (TT requirement). */
export function roundCoords(data: FontData): void {
  for (const g of data.glyf) {
    if (g.contours) {
      for (const c of g.contours) for (const p of c) {
        p.x = Math.round(p.x)
        p.y = Math.round(p.y)
      }
    }
    g.xMin = Math.round(g.xMin)
    g.yMin = Math.round(g.yMin)
    g.xMax = Math.round(g.xMax)
    g.yMax = Math.round(g.yMax)
    g.advanceWidth = Math.round(g.advanceWidth)
    g.leftSideBearing = Math.round(g.leftSideBearing)
  }
}

/**
 * Merge uppercase glyphs from a "Wide" master into a "Regular" base.
 * The base is mutated in place.
 *
 * Use case: a starter master ships lowercase-style glyphs mapped to BOTH
 * 0x41-5A and 0x61-7A; a paired Wide master ships uppercase-style glyphs
 * also mapped to both case ranges. Merging gives a font where 0x61-7A
 * renders the lowercase shapes and 0x41-5A renders the uppercase shapes —
 * what users expect from a conventional font.
 *
 * The donor's uppercase glyph (e.g. 'A') is appended to the base with a
 * unique name and assigned only the uppercase codepoint range. The base's
 * existing letter glyph (which previously owned both ranges) keeps only
 * the lowercase codepoint range.
 *
 * Latin-1 uppercase ranges (0xC0-DE except 0xD7=multiply) move to the
 * donor; 0xE0-FF stays with the base; 0xDF (eszett) stays lowercase.
 */
export function mergeUppercaseFrom(base: FontData, donor: FontData): void {
  const UPPER = new Set<number>()
  for (let cp = 0x41; cp <= 0x5A; cp++) UPPER.add(cp)
  // Latin-1 uppercase accented (0xC0–0xDE except 0xD7=multiply)
  for (let cp = 0xC0; cp <= 0xDE; cp++) if (cp !== 0xD7) UPPER.add(cp)
  // Eth/Thorn (0xD0/0xDE) included; eszett 0xDF stays lowercase

  // Build map: codepoint → donor glyph
  const donorByCp = new Map<number, FontGlyph>()
  for (const g of donor.glyf) {
    if (!g.unicode) continue
    for (const cp of g.unicode) if (UPPER.has(cp)) donorByCp.set(cp, g)
  }

  // For each unique donor glyph that owns at least one uppercase cp,
  // copy it into base (renamed if necessary), then re-point the relevant
  // codepoints from base's existing glyph to the new copy.
  const copied = new Map<FontGlyph, FontGlyph>()
  for (const [cp, donorG] of donorByCp) {
    let copy = copied.get(donorG)
    if (!copy) {
      copy = {
        name: donorG.name,
        unicode: [],
        advanceWidth: donorG.advanceWidth,
        leftSideBearing: donorG.leftSideBearing,
        xMin: donorG.xMin,
        yMin: donorG.yMin,
        xMax: donorG.xMax,
        yMax: donorG.yMax,
        contours: donorG.contours
          ? donorG.contours.map(c => c.map(p => ({ ...p })))
          : undefined,
      }
      // Rename if base already has this glyph name — keep upper distinct.
      if (base.glyf.some(g => g.name === copy!.name)) copy.name = `${copy.name}.upper`
      base.glyf.push(copy)
      copied.set(donorG, copy)
    }
    // Strip cp from any base glyph that currently owns it, then add to copy
    for (const g of base.glyf) {
      if (g === copy) continue
      if (g.unicode) g.unicode = g.unicode.filter(u => u !== cp)
    }
    if (!copy.unicode!.includes(cp)) copy.unicode!.push(cp)
  }

  // Rebuild cmap from per-glyph unicodes (TTFWriter regenerates from this).
  const cmap: Record<string, number> = {}
  for (let i = 0; i < base.glyf.length; i++) {
    const g = base.glyf[i]!
    if (!g.unicode) continue
    for (const cp of g.unicode) cmap[String(cp)] = i
  }
  base.cmap = cmap
  if (base.maxp) base.maxp.numGlyphs = base.glyf.length
}

export interface BrandingInput {
  family: string
  postscript: string
  styleName: string
  copyright: string
  description: string
  version: string
  weightClass?: number
  widthClass?: number
  designerName?: string
  manufacturer?: string
}

export function brandNameTable(data: FontData, b: BrandingInput): void {
  const subFam = b.styleName
  data.name.copyright = b.copyright
  data.name.fontFamily = b.family
  data.name.fontSubFamily = subFam
  data.name.uniqueSubFamily = `NPSFonts: ${b.family} ${subFam}: 2026`
  data.name.fullName = subFam === 'Regular' ? b.family : `${b.family} ${subFam}`
  data.name.postScriptName = `${b.postscript}-${subFam.replace(/\s+/g, '')}`
  data.name.tradeMark = ''
  data.name.manufacturer = b.manufacturer ?? 'NPS Fonts contributors'
  data.name.designer = b.designerName ?? 'NPS Fonts contributors'
  data.name.description = b.description
  data.name.version = b.version
  data.name.preferredFamily = b.family
  data.name.preferredSubFamily = subFam
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const os2 = (data['OS/2'] ?? {}) as any
  if (b.weightClass !== undefined) os2.usWeightClass = b.weightClass
  if (b.widthClass !== undefined) os2.usWidthClass = b.widthClass
  os2.achVendID = 'NPSF'
  os2.fsSelection = subFam === 'Regular' ? 0xC0 : 0x80
  data['OS/2'] = os2
}

/**
 * Emit a CFF .otf from a TTFObject. The contour data already lives on
 * the TTFObject, so we just rebrand the name table (already done by
 * `brandNameTable` upstream), run the optional `configure` hook (used
 * to author GSUB liga rules), and let `OTFWriter` produce the CFF bytes.
 */
export function buildOtfFromTtfObject(
  data: TTFObject,
  configure?: (data: TTFObject) => void,
): Buffer {
  configure?.(data)
  return Buffer.from(new OTFWriter().write(data))
}

/** Backwards-compatible alias that takes a TTF buffer (re-parses it first). */
export function buildOtfFromTtfBuf(
  ttfBuf: Buffer,
  configure?: (data: TTFObject) => void,
): Buffer {
  const ab = ttfBuf.buffer.slice(ttfBuf.byteOffset, ttfBuf.byteOffset + ttfBuf.byteLength) as ArrayBuffer
  const data = new TTFReader().read(ab) as unknown as TTFObject
  return buildOtfFromTtfObject(data, configure)
}

/** Sanity: ensure required side-bearing-ish fields exist on a TTFObject before write. */
function fillRequiredFields(data: FontData): void {
  // hhea numOfLongHorMetrics defaults to glyph count if absent.
  if (data.hhea && data.maxp) {
    if (data.hhea.numOfLongHorMetrics === undefined) {
      data.hhea.numOfLongHorMetrics = data.maxp.numGlyphs ?? data.glyf.length
    }
    data.maxp.numGlyphs = data.glyf.length
  }
}

export interface WriteOutputs {
  /** fonts/<family-id> directory (will create otf/ttf/woff/woff2 underneath) */
  outDir: string
  /** Filename stem, e.g. "RedwoodSerif-Regular". */
  fileStem: string
  /** Source TTFObject (will be written verbatim as TTF). */
  ttfObject: TTFObject
  /** OTF branding (consumed by `OTFWriter` for the CFF Top DICT strings). */
  branding: BrandingInput
  /**
   * Optional post-construction hook called between TTF and OTF emission.
   * Receives the same TTFObject the OTF writer will see — mutate `data.gsub`
   * (e.g. via `new Substitution(...).add('liga', ...)`) to embed lookups.
   */
  configureOtf?: (data: TTFObject) => void
  /** Optional: also wrap the OTF as WOFF/WOFF2 (for ligature-bearing families). */
  woffFromOtf?: boolean
}

export async function writeFamilyOutputs(o: WriteOutputs): Promise<{
  ttf: Buffer
  otf: Buffer
  woff: Buffer
  woff2: Buffer
}> {
  fillRequiredFields(o.ttfObject as unknown as FontData)
  const ttfArr = new TTFWriter().write(o.ttfObject)
  const ttf = Buffer.from(ttfArr)
  const otf = buildOtfFromTtfObject(o.ttfObject, o.configureOtf)

  // For ligature-bearing families we want WOFF/WOFF2 to come from the OTF
  // (since GSUB authoring may have been routed through the OTF path).
  const sfntForWoff = o.woffFromOtf ? otf : ttf
  const sfntForWoffAb = sfntForWoff.buffer.slice(sfntForWoff.byteOffset, sfntForWoff.byteOffset + sfntForWoff.byteLength) as ArrayBuffer
  const woff = sfntToWoff(sfntForWoff)
  const woff2 = Buffer.from(await encodeWOFF2Native(sfntForWoffAb))

  const otfDir = resolve(o.outDir, 'otf')
  const ttfDir = resolve(o.outDir, 'ttf')
  const woffDir = resolve(o.outDir, 'woff')
  const woff2Dir = resolve(o.outDir, 'woff2')
  await mkdir(otfDir, { recursive: true })
  await mkdir(ttfDir, { recursive: true })
  await mkdir(woffDir, { recursive: true })
  await mkdir(woff2Dir, { recursive: true })

  await writeFile(resolve(otfDir, `${o.fileStem}.otf`), otf)
  await writeFile(resolve(ttfDir, `${o.fileStem}.ttf`), ttf)
  await writeFile(resolve(woffDir, `${o.fileStem}.woff`), woff)
  await writeFile(resolve(woff2Dir, `${o.fileStem}.woff2`), woff2)

  return { ttf, otf, woff, woff2 }
}
