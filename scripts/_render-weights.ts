#!/usr/bin/env bun
/**
 * Render NPS 2026 at multiple wght axis positions as a visual waterfall.
 * Uses ts-fonts to instantiate a static TTF at each axis position
 * (pure TypeScript — no Python dependency).
 *
 *   bun run scripts/_render-weights.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'ts-fonts'
import { Resvg } from 'ts-svg'
import { instantiateVariable } from './nps-2026.ts'

const ROOT = resolve(import.meta.dir, '..')
const VF = resolve(ROOT, 'fonts', 'nps-2026', 'ttf', 'NPS_2026[wght].ttf')
const OUT = resolve(ROOT, 'specimens', 'nps-2026')

await mkdir(OUT, { recursive: true })

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]
const text = 'NPS 2026 · CRATER LAKE 1902'
const size = 80, pad = 20, rowH = size + pad * 2
const width = 1600

const vfBuf = Buffer.from(await Bun.file(VF).arrayBuffer())

const svgParts: string[] = []
svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${WEIGHTS.length * rowH}" viewBox="0 0 ${width} ${WEIGHTS.length * rowH}"><rect width="100%" height="100%" fill="#f5efe2"/>`)
for (const [i, w] of WEIGHTS.entries()) {
  const instBuf = instantiateVariable(vfBuf, { wght: w })
  const ab = instBuf.buffer.slice(instBuf.byteOffset, instBuf.byteOffset + instBuf.byteLength) as ArrayBuffer
  const font = parse(ab)
  const y = i * rowH + pad + size
  svgParts.push(`<text x="20" y="${y}" font-family="monospace" font-size="14" fill="#888">${w}</text>`)
  const path = font.getPath(text, 100, y, size)
  svgParts.push(`<path d="${path.toPathData(3)}" fill="#1f2a23"/>`)
}
svgParts.push('</svg>')

const png = new Resvg(svgParts.join(''), { fitTo: { mode: 'zoom', value: 2 }, background: '#f5efe2' }).render().asPng()
const outFile = resolve(OUT, 'weights-waterfall.png')
await writeFile(outFile, png)
console.log(`✓ waterfall → ${outFile}`)
