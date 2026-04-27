#!/usr/bin/env bun
/**
 * Self-contained verification for NPS 2026.
 *
 * Builds a "pristine" reference font from outlines.json and per-pixel diffs
 * every covered codepoint against:
 *   1. the built static Regular TTF
 *   2. the variable TTF instantiated at wght=400 (default)
 *
 * Glyphs touched by `PATCHES`/`ADDITIONS` are skipped; everything else must
 * match pixel-for-pixel.
 *
 *   bun run scripts/_verify-exact.ts
 *
 * Exits 0 on success, 1 on any unexpected mismatch.
 */
import { Resvg } from 'ts-svg'
import png from 'ts-png'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInstance, Font, parse, TTFReader, TTFWriter, type TTFObject } from 'ts-fonts'
import { ADDITIONS, PATCHES } from '../sources/nps-2026/patches.ts'
import { PIPELINES } from './lib/transforms.ts'

const ROOT = resolve(import.meta.dir, '..')
const OUTLINES = resolve(ROOT, 'sources', 'nps-2026', 'outlines.json')
const BUILT_STATIC = resolve(ROOT, 'fonts', 'nps-2026', 'ttf', 'NPS_2026-Regular.ttf')
const BUILT_VF = resolve(ROOT, 'fonts', 'nps-2026', 'ttf', 'NPS_2026[wght].ttf')

// Build pristine TTF from outlines.json. Apply the same transform pipeline
// the production build uses so the pristine reference reflects the intended
// output for non-patched glyphs (otherwise every glyph would diff because
// of the post-patch differentiation pass).
const pristineData = JSON.parse(await readFile(OUTLINES, 'utf8')) as TTFObject
PIPELINES['nps-2026']!(pristineData as unknown as Parameters<typeof PIPELINES['nps-2026']>[0])
const pristineBuf = Buffer.from(new TTFWriter().write(pristineData))
const pristine = parse(pristineBuf.buffer.slice(pristineBuf.byteOffset, pristineBuf.byteOffset + pristineBuf.byteLength))

// Parse built static TTF
const builtStaticArrayBuf = await Bun.file(BUILT_STATIC).arrayBuffer()
const builtStatic = parse(builtStaticArrayBuf)

// Instantiate built variable TTF at wght=400 and parse
let builtVfAt400: Font | null = null
if (existsSync(BUILT_VF)) {
  const vfBuf = await Bun.file(BUILT_VF).arrayBuffer()
  const vf = new TTFReader().read(vfBuf)
  const inst = createInstance(vf, { coordinates: { wght: 400 }, updateName: false })
  const instBuf = Buffer.from(new TTFWriter().write(inst))
  builtVfAt400 = parse(instBuf.buffer.slice(instBuf.byteOffset, instBuf.byteOffset + instBuf.byteLength))
}

function renderPNG(font: Font, ch: string): Buffer {
  const size = 500, pad = 50, baseline = size + pad
  const w = Math.max(700, Math.ceil(font.getAdvanceWidth(ch, size)) + pad * 2)
  const h = size + pad * 2
  const path = font.getPath(ch, pad, baseline, size)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/><path d="${path.toPathData(3)}" fill="black"/></svg>`
  return new Resvg(svg).render().asPng()
}

function pixelsMatch(a: Buffer, b: Buffer): { diff: number, total: number } {
  const A = png.sync.read(a), B = png.sync.read(b)
  if (A.width !== B.width || A.height !== B.height) return { diff: -1, total: -1 }
  let diff = 0
  for (let i = 0; i < A.data.length; i += 4) {
    if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) diff++
  }
  return { diff, total: A.data.length / 4 }
}

const patchedNames = new Set([...Object.keys(PATCHES), ...ADDITIONS.map(a => a.name)])

const covered: Array<{ cp: number, name: string }> = []
for (let cp = 0x0020; cp <= 0xFFFF; cp++) {
  const g = pristine.charToGlyph(String.fromCodePoint(cp))
  if (!g || g.index === 0) continue
  covered.push({ cp, name: g.name ?? `glyph${g.index}` })
}

interface Result { exact: number, mismatches: Array<{ cp: number, name: string, diff: number }> }

function check(target: Font, label: string): Result {
  let exact = 0
  const mismatches: Array<{ cp: number, name: string, diff: number }> = []
  for (const { cp, name } of covered) {
    if (patchedNames.has(name)) continue
    const ch = String.fromCodePoint(cp)
    const { diff } = pixelsMatch(renderPNG(pristine, ch), renderPNG(target, ch))
    if (diff === 0) exact++
    else mismatches.push({ cp, name, diff })
  }
  const pristineCount = covered.length - [...patchedNames].filter(n => covered.some(c => c.name === n)).length
  const status = mismatches.length === 0 ? '✓' : '✗'
  console.log(`${status} ${label.padEnd(22)} ${exact} / ${pristineCount} pixel-exact`)
  return { exact, mismatches }
}

const skipped = [...patchedNames].filter(n => covered.some(c => c.name === n)).length
if (skipped > 0) console.log(`patched/added:         ${skipped} glyph(s) skipped: ${[...patchedNames].join(', ')}`)

const results = [check(builtStatic, 'static Regular TTF')]
if (builtVfAt400) results.push(check(builtVfAt400, 'variable @ wght=400'))
else console.log(`  ! variable TTF check skipped (file not found)`)

const allMismatches = results.flatMap(r => r.mismatches)
if (allMismatches.length > 0) {
  console.log(`\n✗ unexpected mismatches:`)
  for (const m of allMismatches) {
    console.log(`  U+${m.cp.toString(16).padStart(4, '0')} '${String.fromCodePoint(m.cp)}' (${m.name}): ${m.diff}px differ`)
  }
  process.exit(1)
}
console.log(`\n✓ all targets match outlines.json exactly.`)
