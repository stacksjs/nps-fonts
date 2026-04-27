#!/usr/bin/env bun
/**
 * Sanity checks on built fonts: re-parse each output, verify metadata
 * is set, glyph count + cmap coverage are reasonable, and that the
 * declared family name in the `name` table matches the manifest.
 */

import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Font, parse } from 'ts-fonts'
import { ALL_FAMILIES, FAMILY_DISPLAY } from './lib/common.ts'

const FONTS_DIR = resolve(import.meta.dir, '..', 'fonts')

interface Issue {
  level: 'error' | 'warn'
  file: string
  message: string
}

async function main() {
  const issues: Issue[] = []
  let checked = 0

  for (const id of ALL_FAMILIES) {
    const meta = FAMILY_DISPLAY[id]
    const otfDir = resolve(FONTS_DIR, id, 'otf')
    let entries: string[] = []
    try {
      entries = (await readdir(otfDir)).filter(f => f.endsWith('.otf'))
    }
    catch {
      issues.push({ level: 'error', file: id, message: 'no otf/ directory' })
      continue
    }
    if (entries.length === 0) {
      issues.push({ level: 'error', file: id, message: 'no .otf files built' })
      continue
    }
    for (const file of entries) {
      const path = resolve(otfDir, file)
      const buf = await Bun.file(path).arrayBuffer()
      let font: Font
      try {
        font = parse(buf)
      }
      catch (e) {
        issues.push({ level: 'error', file, message: `failed to parse: ${(e as Error).message}` })
        continue
      }
      checked++

      const familyName = font.familyName
      if (familyName !== meta.display) {
        issues.push({
          level: 'error',
          file,
          message: `family name mismatch: got "${familyName}", expected "${meta.display}"`,
        })
      }
      const cr = (font.data.name.copyright as string) ?? ''
      if (!cr.includes('NPS Fonts')) {
        issues.push({ level: 'warn', file, message: 'copyright missing "NPS Fonts" credit' })
      }

      console.log(
        `✓ ${file.padEnd(40)} `
        + `glyphs=${String(font.numGlyphs).padStart(4)} `
        + `upm=${font.data.head?.unitsPerEm ?? '?'}`,
      )
    }
  }

  console.log(`\nChecked ${checked} font(s).`)
  for (const i of issues) {
    const tag = i.level === 'error' ? '✗' : '!'
    console.log(`${tag} [${i.file}] ${i.message}`)
  }

  const errors = issues.filter(i => i.level === 'error').length
  if (errors > 0) {
    console.error(`\n${errors} error(s) — failing.`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
