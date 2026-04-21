#!/usr/bin/env bun
/**
 * Render NPS 2026 at multiple wght axis positions as a sanity check.
 * Uses fontTools (via the local .venv) to instantiate a static TTF at each
 * position, then renders it with resvg.
 *
 *   bun run scripts/_render-weights.ts
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { Resvg } from '@resvg/resvg-js'

const ROOT = resolve(import.meta.dir, '..')
const VF = resolve(ROOT, 'fonts', 'nps-2026', 'ttf', 'NPS_2026[wght].ttf')
const VENV_PY = resolve(ROOT, '.venv', 'bin', 'python')
const TMP = resolve(ROOT, '.build', 'weight-previews')
const OUT = resolve(ROOT, 'specimens', 'nps-2026')

await mkdir(TMP, { recursive: true })
await mkdir(OUT, { recursive: true })

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

// Instantiate a static TTF per weight via fontTools
const script = `
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
vf = TTFont(sys.argv[1])
wght = int(sys.argv[2])
inst = instantiateVariableFont(vf, {'wght': wght})
inst.save(sys.argv[3])
`
const scriptPath = resolve(TMP, 'instantiate.py')
await writeFile(scriptPath, script)

const paths: Record<number, string> = {}
for (const w of WEIGHTS) {
  const out = resolve(TMP, `w${w}.ttf`)
  const r = spawnSync(VENV_PY, [scriptPath, VF, String(w), out], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error('instantiate failed at wght=', w, r.stderr)
    process.exit(1)
  }
  paths[w] = out
}

// Render a waterfall: one row per weight
const text = 'NPS 2026 · CRATER LAKE 1902'
const size = 80, pad = 20, rowH = size + pad * 2
const width = 1600
const rows = WEIGHTS.map((w, i) => {
  const buf = Bun.file(paths[w]!)
  return { w, y: i * rowH + pad + size, buf }
})

const svgParts: string[] = []
svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${WEIGHTS.length * rowH}" viewBox="0 0 ${width} ${WEIGHTS.length * rowH}"><rect width="100%" height="100%" fill="#f5efe2"/>`)
for (const [i, w] of WEIGHTS.entries()) {
  const buf = await Bun.file(paths[w]!).arrayBuffer()
  const font = opentype.parse(buf)
  const y = i * rowH + pad + size
  const label = `${w}`.padStart(4, ' ')
  // weight label on left
  svgParts.push(`<text x="20" y="${y}" font-family="monospace" font-size="14" fill="#888">${label}</text>`)
  const path = font.getPath(text, 100, y, size)
  svgParts.push(`<path d="${path.toPathData(3)}" fill="#1f2a23"/>`)
}
svgParts.push('</svg>')
const svg = svgParts.join('')

const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, background: '#f5efe2' }).render().asPng()
const outFile = resolve(OUT, 'weights-waterfall.png')
await writeFile(outFile, png)
console.log(`✓ waterfall → ${outFile}`)

await rm(TMP, { recursive: true, force: true })
