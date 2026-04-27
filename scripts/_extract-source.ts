#!/usr/bin/env bun
/**
 * One-shot bootstrapper: snapshot a TTF/OTF master into a portable JSON
 * (`outlines.json`) that the build pipeline consumes. Run once per family
 * to seed `sources/<family>/outlines.json`; that JSON is then the sole
 * committed source of truth and no external font is read at build time.
 *
 * Use this when starting a new family from your own master file or from
 * an OFL/PD reference that you have the right to ingest. The committed
 * outlines.json is what the build, the verification script, and any
 * downstream consumers read — the original source file is not required
 * (and is not redistributed by this repo).
 *
 *   SOURCE=/abs/path/to/master.otf \
 *   OUT=sources/<family>/outlines.json \
 *     bun run scripts/_extract-source.ts
 *
 * Raw passthrough tables (Uint8Array) and binary-typed fields are stripped
 * for JSON-portability; the build recomputes anything derivable.
 */
import { otf2ttfobject, TTFReader } from 'ts-fonts'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, extname } from 'node:path'
import { sanitizeNameTable } from './_sanitize-sources.ts'

const ROOT = resolve(import.meta.dir, '..')
const SOURCE = process.env.SOURCE
const OUT = process.env.OUT ? resolve(ROOT, process.env.OUT) : undefined

if (!SOURCE || !OUT) {
  console.error('Usage: SOURCE=<path/to/master.otf|ttf> OUT=sources/<family>/outlines.json bun run scripts/_extract-source.ts')
  process.exit(1)
}

const buf = await Bun.file(SOURCE).arrayBuffer()
const ext = extname(SOURCE).toLowerCase()
const ttf = ext === '.otf' ? otf2ttfobject(buf) : new TTFReader().read(buf)

// Drop binary-typed fields that JSON can't represent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clean = { ...ttf } as any
delete clean.rawTables
delete clean.support
if (clean.HVAR?.raw) delete clean.HVAR
if (clean.MVAR?.raw) delete clean.MVAR
if (clean.gvar?.raw) delete clean.gvar

// Strip identifying name-table fields. brandNameTable() repopulates these
// at build time, so the committed JSON only needs to carry glyph + metric
// data — never the source font's branding.
clean.name = sanitizeNameTable(clean.name)

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(clean, null, 2))

console.log(`✓ extracted ${ttf.glyf.length} glyphs + font tables → ${OUT}`)
console.log(`  size: ${((await Bun.file(OUT).arrayBuffer()).byteLength / 1024).toFixed(1)}KB`)
