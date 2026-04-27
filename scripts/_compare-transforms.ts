#!/usr/bin/env bun
/**
 * Side-by-side visual comparison of pre-transform ("Before") vs
 * post-transform ("After") font cuts. For each family, builds two TTFs
 * in-memory — one with the family's PIPELINE skipped, one with it
 * applied — then composes an HTML page and captures it via Bun.WebView.
 *
 *   bun run scripts/_compare-transforms.ts
 *   bun run scripts/_compare-transforms.ts --out /tmp/transforms-compare.png
 *
 * The "Before" build still runs the full sanitization + branding pipeline;
 * only the geometric transform layer is removed. So differences in the
 * screenshot are isolated to the transform's effect.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TTFWriter, type TTFObject } from 'ts-fonts'
import {
  brandNameTable,
  loadOutlines,
  mergeUppercaseFrom,
  type BrandingInput,
  type FontData,
} from './lib/extracted.ts'
import { PIPELINES } from './lib/transforms.ts'
import { ALL_FAMILIES, FAMILY_DISPLAY, type FamilyId } from './lib/common.ts'

const ROOT = resolve(import.meta.dir, '..')

interface Cut {
  /** Display label shown above the row. */
  label: string
  /** Composed TTFObject ready for write (post-merge, post-patch). */
  data: () => Promise<FontData>
  /** Pipeline key in PIPELINES (or null if family has no transform). */
  pipelineKey: keyof typeof PIPELINES | null
  /** Family id used to resolve display name + sample text. */
  familyId: FamilyId
  /** Sample to typeset in the comparison row. */
  sample: string
  /** Sample size in CSS px. */
  size: number
}

const CUTS: Cut[] = [
  {
    label: 'Redwood Serif',
    familyId: 'redwood-serif',
    pipelineKey: 'redwood-serif',
    sample: 'Mountains calling',
    size: 140,
    data: async () => {
      const lower = await loadOutlines('sources/redwood-serif/outlines.json')
      const upper = await loadOutlines('sources/redwood-serif/outlines-wide.json')
      mergeUppercaseFrom(lower, upper)
      return lower
    },
  },
  {
    label: 'Sequoia Sans (Regular)',
    familyId: 'sequoia-sans',
    pipelineKey: 'sequoia-sans',
    sample: 'YOSEMITE 1864',
    size: 150,
    data: async () => {
      const base = await loadOutlines('sources/sequoia-sans/outlines.json')
      const upper = await loadOutlines('sources/sequoia-sans/outlines-light.json')
      mergeUppercaseFrom(base, upper)
      return base
    },
  },
  {
    label: 'Campmate Script',
    familyId: 'campmate-script',
    pipelineKey: 'campmate-script',
    sample: 'Crooked River Camp',
    size: 150,
    data: async () => loadOutlines('sources/campmate-script/outlines.json'),
  },
  {
    label: 'Switchback Clean',
    familyId: 'switchback',
    pipelineKey: 'switchback-clean',
    sample: 'NORTH RIM 7100',
    size: 150,
    data: async () => loadOutlines('sources/switchback/outlines-clean.json'),
  },
  {
    label: 'Switchback Rough',
    familyId: 'switchback',
    pipelineKey: 'switchback-rough',
    sample: 'NEXT WATER 4 MI',
    size: 150,
    data: async () => loadOutlines('sources/switchback/outlines-rough.json'),
  },
  {
    label: 'NPS 2026',
    familyId: 'nps-2026',
    pipelineKey: 'nps-2026',
    sample: 'CRATER LAKE 1902',
    size: 150,
    // Skip patches/additions for this comparison — we want to isolate the
    // transform layer's contribution, not measure patch impact too.
    data: async () => {
      const raw = JSON.parse(await readFile(resolve(ROOT, 'sources/nps-2026/outlines.json'), 'utf8')) as FontData
      // Round to int (loadOutlines does this; we bypassed it).
      for (const g of raw.glyf) {
        if (g.contours) for (const c of g.contours) for (const p of c) {
          p.x = Math.round(p.x); p.y = Math.round(p.y)
        }
      }
      return raw
    },
  },
]

function brandFor(label: string, suffix: 'before' | 'after'): BrandingInput {
  const family = `${label.replace(/[^A-Za-z0-9]/g, '')}_${suffix}`
  return {
    family,
    postscript: family,
    styleName: 'Regular',
    copyright: '',
    description: '',
    version: 'Version 0.0',
  }
}

async function buildTtfBuf(data: FontData, branding: BrandingInput): Promise<Buffer> {
  brandNameTable(data, branding)
  if (data.hhea && data.maxp) {
    if (data.hhea.numOfLongHorMetrics === undefined) {
      data.hhea.numOfLongHorMetrics = data.maxp.numGlyphs ?? data.glyf.length
    }
    data.maxp.numGlyphs = data.glyf.length
  }
  const arr = new TTFWriter().write(data as unknown as TTFObject)
  return Buffer.from(arr)
}

async function generateHtml(): Promise<{ html: string, rows: number }> {
  const rows: string[] = []
  const faces: string[] = []
  for (const cut of CUTS) {
    // Two independent FontData instances so transforms don't bleed.
    const beforeData = await cut.data()
    const afterData = await cut.data()
    if (cut.pipelineKey) PIPELINES[cut.pipelineKey]!(afterData)

    const beforeBrand = brandFor(cut.label, 'before')
    const afterBrand = brandFor(cut.label, 'after')
    const beforeBuf = await buildTtfBuf(beforeData, beforeBrand)
    const afterBuf = await buildTtfBuf(afterData, afterBrand)

    const beforeB64 = beforeBuf.toString('base64')
    const afterB64 = afterBuf.toString('base64')

    faces.push(`@font-face { font-family: "${beforeBrand.family}"; src: url(data:font/ttf;base64,${beforeB64}) format("truetype"); font-display: block; }`)
    faces.push(`@font-face { font-family: "${afterBrand.family}"; src: url(data:font/ttf;base64,${afterB64}) format("truetype"); font-display: block; }`)

    const escaped = cut.sample.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
    rows.push(`
<section class="row">
  <h2>${cut.label}</h2>
  <div class="pair">
    <div class="cell"><span class="tag">BEFORE</span><span class="specimen" style="font-family:'${beforeBrand.family}',serif;font-size:${cut.size}px">${escaped}</span></div>
    <div class="cell"><span class="tag">AFTER</span><span class="specimen" style="font-family:'${afterBrand.family}',serif;font-size:${cut.size}px">${escaped}</span></div>
    <div class="cell overlay">
      <span class="tag">OVERLAY</span>
      <span class="overlay-stack" style="font-size:${cut.size}px;font-family:'${beforeBrand.family}',serif">
        <span class="sizer" aria-hidden="true">${escaped}</span>
        <span class="layer before-layer" aria-hidden="true">${escaped}</span>
        <span class="layer after-layer"  style="font-family:'${afterBrand.family}',serif" aria-hidden="true">${escaped}</span>
      </span>
    </div>
  </div>
</section>`)
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NPS Fonts — Transform Before/After</title>
<style>
${faces.join('\n')}

* { box-sizing: border-box }
body {
  margin: 0; padding: 36px 48px; background: #f5efe2; color: #1f2a23;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
header.page {
  margin-bottom: 28px; padding-bottom: 14px; border-bottom: 1px solid #d6cdba;
}
header.page h1 { margin: 0 0 4px; font-size: 22px; }
header.page p { margin: 0; color: #47614d; font-size: 13px; }
section.row { margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px dotted #d6cdba; }
section.row h2 {
  margin: 0 0 10px; font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.08em; color: #47614d;
}
.pair { display: grid; grid-template-columns: 1fr; gap: 12px; }
.cell {
  display: flex; align-items: baseline; gap: 16px;
  padding: 14px 18px; background: #fff8ea;
  border: 1px solid #d6cdba; border-radius: 4px;
  overflow: hidden;
}
.tag {
  flex: 0 0 auto; font-size: 10px; font-weight: 700;
  letter-spacing: 0.1em; color: #b04a2e; text-transform: uppercase;
  min-width: 64px;
}
.specimen { line-height: 1.05; color: #1f2a23; }
.cell.overlay { background: #fff }
/* Stack: a hidden 'sizer' gives the container its dimensions in normal flow;
   both layers absolutely-position over it so they share the exact same
   baseline (which is what we need to actually compare geometry). */
.overlay-stack {
  position: relative; display: inline-block;
  line-height: 1; white-space: nowrap;
}
.overlay-stack .sizer { visibility: hidden; }
.overlay-stack .layer {
  position: absolute; left: 0; top: 0;
  white-space: nowrap;
  mix-blend-mode: multiply;
}
.overlay-stack .before-layer { color: #1f6feb; }
.overlay-stack .after-layer  { color: #d93025; }
/* Where both layers paint the same pixel, multiply darkens to near-black.
   Visible blue-only / red-only fringes reveal where points actually moved. */
</style>
</head>
<body>
<header class="page">
  <h1>NPS Fonts — Transform pipeline: Before / After</h1>
  <p>Each row builds the same outline source twice — once with the family's transform pipeline disabled, once with it applied. Identical branding, identical sample text. Differences shown are the isolated effect of the geometric transform layer.</p>
</header>
${rows.join('\n')}
</body>
</html>`
  return { html, rows: CUTS.length }
}

async function main() {
  const argv = Bun.argv.slice(2)
  const outIdx = argv.indexOf('--out')
  const out = outIdx >= 0 ? resolve(argv[outIdx + 1]!) : '/tmp/nps-fonts-transforms-compare.png'
  const htmlOutIdx = argv.indexOf('--html')
  const htmlOut = htmlOutIdx >= 0 ? resolve(argv[htmlOutIdx + 1]!) : null

  const { html, rows } = await generateHtml()

  if (htmlOut) {
    await mkdir(resolve(htmlOut, '..'), { recursive: true })
    await writeFile(htmlOut, html)
    console.log(`✓ HTML → ${htmlOut}`)
  }

  // Write to a temp file so screenshot.ts can navigate to it.
  const tmpHtml = '/tmp/_nps-fonts-compare.html'
  await writeFile(tmpHtml, html)

  const WV = (Bun as { WebView?: new (opts: Record<string, unknown>) => unknown }).WebView
  if (!WV) throw new Error('Bun.WebView is not available in this Bun build.')

  const width = 1400
  const wv = new WV({ width, height: 900, headless: true }) as {
    navigate: (url: string) => Promise<void>
    evaluate: (code: string) => Promise<unknown>
    resize: (w: number, h: number) => Promise<void>
    screenshot: (opts: { encoding: 'buffer', format: 'png' }) => Promise<Uint8Array>
    close: () => void
  }

  try {
    const dataUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`
    await wv.navigate(dataUrl)
    await new Promise(r => setTimeout(r, 250))
    await wv.evaluate(`(async () => { if (document.fonts?.ready) await document.fonts.ready; return true })()`)
    // Extra wait for layout to settle with all the @font-face data: URIs.
    await new Promise(r => setTimeout(r, 1200))

    const fullH = await wv.evaluate(`Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)`) as number
    const vpH = Math.max(900, Math.min(Number(fullH) || 900, 16384))
    await wv.resize(width, vpH)
    await new Promise(r => setTimeout(r, 200))

    const buf = await wv.screenshot({ encoding: 'buffer', format: 'png' })
    await Bun.write(out, buf)
    console.log(`✓ PNG → ${out} (${(buf.byteLength / 1024).toFixed(0)} KB, ${rows} rows)`)
  }
  finally {
    wv.close()
  }
}

await main()
