#!/usr/bin/env bun
/**
 * Campmate Script — rounded upright script with brush-style ligatures.
 *
 * Outlines live in `sources/campmate-script/outlines.json`. The source
 * carries 19 designer ligature glyphs (named `xy.liga`, `xyz.liga`) but
 * the extractor doesn't preserve GSUB. We rebuild the `liga` GSUB feature
 * via ts-fonts' Substitution helper by parsing each ligature glyph
 * name back into its component letters.
 */
import { resolve } from 'node:path'
import { Substitution, type TTFObject } from 'ts-fonts'
import {
  brandNameTable,
  loadOutlines,
  writeFamilyOutputs,
  type FontData,
} from './lib/extracted.ts'
import { PIPELINES } from './lib/transforms.ts'
import { FAMILY_DISPLAY } from './lib/common.ts'

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'campmate-script')

const META = FAMILY_DISPLAY['campmate-script']
const COPYRIGHT = `Copyright (c) 2026, NPS Fonts contributors. ${META.display} — released under the SIL Open Font License 1.1.`
const DESCRIPTION = `${META.display} — rounded upright script with brush ligatures via OpenType liga GSUB.`
const VERSION = 'Version 1.000'

/** Reconstruct GSUB `liga` rules from the glyph naming convention `<chars>.liga`. */
function addLigatureRules(data: TTFObject): number {
  // Build name → index map
  const idxByName = new Map<string, number>()
  // Also build single-char → glyph index map via the cmap.
  const idxByChar = new Map<string, number>()
  for (let i = 0; i < data.glyf.length; i++) {
    const g = data.glyf[i]!
    if (g.name) idxByName.set(g.name, i)
  }
  // The TTFObject.cmap is `Record<number, number>` (codepoint → glyphIndex).
  for (const cpStr of Object.keys(data.cmap ?? {})) {
    const cp = Number(cpStr)
    const gid = (data.cmap as Record<number, number>)[cp]!
    if (gid === 0) continue
    idxByChar.set(String.fromCodePoint(cp), gid)
  }

  const sub = new Substitution({ data })
  let added = 0
  for (let i = 0; i < data.glyf.length; i++) {
    const g = data.glyf[i]!
    const m = g.name?.match(/^([a-z]+)\.liga$/)
    if (!m) continue
    const chars = m[1]!
    if (!g.name) continue
    const ligIdx = idxByName.get(g.name)
    if (ligIdx == null || ligIdx === 0) continue
    const subIndices: number[] = []
    let valid = true
    for (const ch of chars) {
      const idx = idxByChar.get(ch)
      if (idx == null) { valid = false; break }
      subIndices.push(idx)
    }
    if (!valid) continue
    sub.add('liga', { sub: subIndices, by: ligIdx })
    added++
  }
  return added
}

export async function buildCampmateScript() {
  const data = await loadOutlines('sources/campmate-script/outlines.json')
  PIPELINES['campmate-script']!(data)

  const branding = {
    family: META.display,
    postscript: META.file,
    styleName: 'Regular',
    copyright: COPYRIGHT,
    description: DESCRIPTION,
    version: VERSION,
    weightClass: 400,
    widthClass: 5,
  }
  brandNameTable(data, branding)

  let ligaCount = 0
  const out = await writeFamilyOutputs({
    outDir: FONTS,
    fileStem: `${META.file}-Regular`,
    ttfObject: data as unknown as Parameters<typeof writeFamilyOutputs>[0]['ttfObject'],
    branding,
    woffFromOtf: true,
    configureOtf: (d) => { ligaCount = addLigatureRules(d) },
  })

  return { glyphCount: (data as FontData).glyf.length, ligaCount, ...out }
}

const r = await buildCampmateScript()
console.log(
  `✓ ${META.display}: ${r.glyphCount} glyphs (${r.ligaCount} ligatures) · `
  + `TTF ${(r.ttf.length / 1024).toFixed(1)}KB · OTF ${(r.otf.length / 1024).toFixed(1)}KB · `
  + `WOFF2 ${(r.woff2.length / 1024).toFixed(1)}KB`,
)
