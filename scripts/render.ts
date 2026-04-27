#!/usr/bin/env bun
/**
 * Render specimen PNGs from built fonts. Used as the visual feedback
 * loop while iterating on glyph drawings: build → render → view → revise.
 *
 *   bun run scripts/render.ts                              # all families, default specimens
 *   bun run scripts/render.ts --family nps-2026    # single family
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Resvg } from 'ts-svg'
import { parse } from 'ts-fonts'
import { ALL_FAMILIES, FAMILY_DISPLAY, type FamilyId } from './lib/common.ts'

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts')
const OUT = resolve(ROOT, 'specimens')

interface RenderOpts {
  fontPath: string
  text: string
  fontSize: number
  width: number
  background?: string
  ink?: string
}

async function renderToSVG(opts: RenderOpts): Promise<string> {
  const buf = await Bun.file(opts.fontPath).arrayBuffer()
  const font = parse(buf)
  const padding = opts.fontSize * 0.4
  const baseline = opts.fontSize + padding
  const path = font.getPath(opts.text, padding, baseline, opts.fontSize, { features: { liga: true } })
  const advance = font.getAdvanceWidth(opts.text, opts.fontSize, { features: { liga: true } })
  const width = Math.max(opts.width, advance + padding * 2)
  const height = opts.fontSize + padding * 2
  const pathSvg = path.toSVG({ decimalPlaces: 2 })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${opts.background ?? '#f5efe2'}"/>
  ${pathSvg.replace(/<path /, `<path fill="${opts.ink ?? '#1f2a23'}" `)}
</svg>`
}

async function svgToPng(svg: string, scale = 4): Promise<Buffer> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    background: 'rgba(255,255,255,0)',
  })
  return resvg.render().asPng()
}

interface Specimen {
  label: string
  text: string
  fontSize: number
  width?: number
}

const SPECIMEN_SETS: Record<FamilyId, Specimen[]> = {
  'nps-2026': [
    { label: 'hero', text: 'NPS 2026', fontSize: 200 },
    { label: 'pangram', text: 'CRATER LAKE EST 1902', fontSize: 140 },
    { label: 'caps', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', fontSize: 90 },
    { label: 'digits', text: '0123456789 — 14.7 MI', fontSize: 110 },
  ],
  'redwood-serif': [
    { label: 'hero', text: 'Redwood', fontSize: 220 },
    { label: 'pangram', text: 'The mountains are calling and I must go.', fontSize: 90 },
    { label: 'caps', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', fontSize: 80 },
    { label: 'lc', text: 'abcdefghijklmnopqrstuvwxyz', fontSize: 80 },
  ],
  'campmate-script': [
    { label: 'hero', text: 'Campmate', fontSize: 220 },
    { label: 'pangram', text: 'Welcome to Crooked River Camp', fontSize: 120 },
    { label: 'ligatures', text: 'coffee hello little kittens essential', fontSize: 120 },
    { label: 'lc', text: 'abcdefghijklmnopqrstuvwxyz', fontSize: 90 },
    { label: 'caps', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', fontSize: 100 },
  ],
  'nps-symbols': [
    { label: 'icons', text: 'AMTFPCSLW*BHO', fontSize: 200 },
    { label: 'icons2', text: '\uE017\uE018\uE019\uE01A\uE01B\uE01C\uE01D\uE01E\uE01F', fontSize: 200 },
  ],
  'sequoia-sans': [
    { label: 'hero', text: 'Sequoia', fontSize: 220 },
    { label: 'pangram', text: 'YOSEMITE valley · est 1864 · Half Dome', fontSize: 90 },
    { label: 'caps', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', fontSize: 80 },
    { label: 'lc', text: 'abcdefghijklmnopqrstuvwxyz', fontSize: 80 },
  ],
  'switchback': [
    { label: 'hero', text: 'SWITCHBACK', fontSize: 200 },
    { label: 'pangram', text: 'NORTH RIM · 7100 FT · NEXT WATER 4 MI', fontSize: 110 },
    { label: 'caps', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', fontSize: 90 },
    { label: 'digits', text: '0123456789 — TRAIL 4.7 MI', fontSize: 110 },
  ],
}

function fontPathFor(id: FamilyId): string {
  const meta = FAMILY_DISPLAY[id]
  return resolve(FONTS, id, 'otf', `${meta.file}-Regular.otf`)
}

async function renderFamily(id: FamilyId, opts: { onlyHero?: boolean } = {}) {
  const fontPath = fontPathFor(id)
  const dir = resolve(OUT, id)
  await mkdir(dir, { recursive: true })
  const specimens = opts.onlyHero
    ? (SPECIMEN_SETS[id] ?? []).filter(s => s.label === 'hero')
    : (SPECIMEN_SETS[id] ?? [])
  for (const s of specimens) {
    const svg = await renderToSVG({
      fontPath,
      text: s.text,
      fontSize: s.fontSize,
      width: s.width ?? 1600,
    })
    const png = await svgToPng(svg, 4)
    const file = resolve(dir, `${s.label}.png`)
    await writeFile(file, png)
    console.log(`  ✓ ${id}/${s.label}.png  (${s.text.length} chars @ ${s.fontSize}px)`)
  }
}

interface Args { family?: FamilyId, onlyHero: boolean }
function parseArgs(argv: string[]): Args {
  const out: Args = { onlyHero: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--family') out.family = argv[++i] as FamilyId
    else if (a === '--hero') out.onlyHero = true
  }
  return out
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2))
  const targets = args.family ? [args.family] : [...ALL_FAMILIES]
  await mkdir(OUT, { recursive: true })
  for (const id of targets) {
    console.log(`\n[${id}] (${FAMILY_DISPLAY[id].display})`)
    await renderFamily(id, { onlyHero: args.onlyHero })
  }
  console.log(`\nSpecimens written to ${OUT}/`)
}

await main()
