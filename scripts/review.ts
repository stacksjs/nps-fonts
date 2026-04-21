#!/usr/bin/env bun
/**
 * Self-contained font review page. Builds a single HTML file that
 * embeds all four families (base64 WOFF2) and serves it on localhost.
 *
 *   bun run review            # build + serve on http://localhost:3333
 *   bun run review --port 8080
 *   bun run review --no-serve # just write the HTML file and exit
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ALL_FAMILIES, FAMILY_DISPLAY, type FamilyId } from './lib/common.ts'

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts')
const OUT = resolve(ROOT, 'web', 'review')

async function fontAsBase64(id: FamilyId): Promise<string> {
  const meta = FAMILY_DISPLAY[id]
  const path = resolve(FONTS, id, 'woff2', `${meta.file}-Regular.woff2`)
  const buf = await Bun.file(path).bytes()
  return Buffer.from(buf).toString('base64')
}

function fontFace(id: FamilyId, base64: string): string {
  const meta = FAMILY_DISPLAY[id]
  return `@font-face {
  font-family: "${meta.display}";
  src: url(data:font/woff2;base64,${base64}) format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: block;
}`
}

interface Sample {
  label: string
  text: string
  size: number
}

const SAMPLES: Record<FamilyId, Sample[]> = {
  'nps-2026': [
    { label: 'Hero', text: 'NPS 2026 1935', size: 120 },
    { label: 'Pangram', text: 'CRATER LAKE · EST 1902 · ELEV 7100 FT', size: 48 },
    { label: 'Caps', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', size: 42 },
    { label: 'Digits & punctuation', text: '0123456789 & — .,!?()/', size: 44 },
  ],
  'redwood-serif': [
    { label: 'Hero', text: 'Redwood Serif', size: 120 },
    { label: 'Pangram', text: 'The mountains are calling and I must go.', size: 40 },
    { label: 'Caps', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', size: 40 },
    { label: 'Lowercase', text: 'abcdefghijklmnopqrstuvwxyz', size: 40 },
    { label: 'Digits & punctuation', text: '0123456789 & — .,!?()/', size: 40 },
  ],
  'campmate-script': [
    { label: 'Hero', text: 'Campmate Script', size: 120 },
    { label: 'Ligatures (liga on)', text: 'coffee · hello · little · kittens · essential', size: 56 },
    { label: 'Pangram', text: 'Welcome to Crooked River Camp', size: 56 },
    { label: 'Lowercase', text: 'abcdefghijklmnopqrstuvwxyz', size: 44 },
    { label: 'Caps', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', size: 44 },
  ],
  'nps-symbols': [
    { label: 'ASCII shortcuts', text: 'A M T F P C S L W * B H O D X', size: 80 },
    { label: 'PUA codepoints', text: '\uE000 \uE001 \uE002 \uE003 \uE005 \uE006 \uE009 \uE00A \uE00B', size: 80 },
  ],
}

function familySection(id: FamilyId): string {
  const meta = FAMILY_DISPLAY[id]
  const ligaStyle = id === 'campmate-script' ? `; font-feature-settings: "liga" on` : ''
  const rows = SAMPLES[id].map(s => `
    <div class="sample">
      <div class="label">${s.label} · ${s.size}px</div>
      <div class="specimen" style="font-family: '${meta.display}', serif; font-size: ${s.size}px${ligaStyle}">${escapeHtml(s.text)}</div>
    </div>`).join('')
  const waterfall = id === 'nps-symbols'
    ? ''
    : [14, 18, 24, 32, 48, 72, 96].map(sz => `
    <div class="sample">
      <div class="label">${sz}px</div>
      <div class="specimen" style="font-family: '${meta.display}', serif; font-size: ${sz}px${ligaStyle}">${escapeHtml(meta.pangram)}</div>
    </div>`).join('')

  return `
<section class="family" id="${id}">
  <header>
    <h2 style="font-family: '${meta.display}', serif${ligaStyle}">${meta.display}</h2>
    <p class="tagline">${escapeHtml(meta.tagline)}</p>
  </header>
  ${rows}
  ${waterfall}
  <details class="tester">
    <summary>Type tester — click to edit</summary>
    <div class="tester-controls">
      <label>Size <input type="range" min="14" max="240" value="64" data-control="size" data-target="tester-${id}"></label>
    </div>
    <div class="specimen tester-area" id="tester-${id}" contenteditable="true" spellcheck="false"
         style="font-family: '${meta.display}', serif; font-size: 64px${ligaStyle}">
      ${escapeHtml(meta.pangram)}
    </div>
  </details>
</section>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

async function buildHtml(): Promise<string> {
  const faces = await Promise.all(
    ALL_FAMILIES.map(async id => fontFace(id, await fontAsBase64(id))),
  )

  const nav = ALL_FAMILIES.map(id => `<a href="#${id}">${FAMILY_DISPLAY[id].display}</a>`).join(' · ')
  const families = ALL_FAMILIES.map(familySection).join('\n')
  const fontList = ALL_FAMILIES.map(id => `"${FAMILY_DISPLAY[id].display}"`).join(', ')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NPS Fonts — Review</title>
  <style>
${faces.join('\n')}

:root {
  --bg: #f5efe2;
  --ink: #1f2a23;
  --moss: #47614d;
  --rust: #b04a2e;
  --rule: #d6cdba;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, sans-serif;
  line-height: 1.35;
}

header.page {
  position: sticky;
  top: 0;
  background: var(--bg);
  border-bottom: 1px solid var(--rule);
  padding: 12px 24px;
  z-index: 10;
}

header.page .brand { font-weight: 700; margin-right: 12px; }
header.page nav a {
  color: var(--moss);
  text-decoration: none;
  font-size: 14px;
}
header.page nav a:hover { color: var(--rust); text-decoration: underline; }

main { padding: 24px; max-width: 1400px; margin: 0 auto; }

section.family {
  margin-bottom: 48px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--rule);
}
section.family header { margin-bottom: 16px; }
section.family h2 { margin: 0 0 4px; font-size: 48px; }
section.family .tagline {
  margin: 0;
  color: var(--moss);
  font-size: 14px;
  font-style: italic;
}

.sample {
  padding: 12px 0;
  border-top: 1px dotted var(--rule);
}
.sample .label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--moss);
  margin-bottom: 4px;
}
.sample .specimen {
  color: var(--ink);
  line-height: 1.15;
  overflow-wrap: anywhere;
}

details.tester {
  margin-top: 16px;
  padding: 12px;
  background: #fff8ea;
  border: 1px solid var(--rule);
  border-radius: 4px;
}
details.tester summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--moss);
}
.tester-controls {
  margin: 8px 0;
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: var(--moss);
}
.tester-controls input[type="range"] { width: 200px; }
.tester-area {
  min-height: 100px;
  padding: 12px;
  background: var(--bg);
  border: 1px dashed var(--rule);
  border-radius: 4px;
  outline: none;
}
.tester-area:focus { border-color: var(--rust); }
  </style>
</head>
<body>
  <header class="page">
    <span class="brand">NPS Fonts · Review</span>
    <nav>${nav}</nav>
  </header>
  <main>
    <p style="color: var(--moss); font-size: 13px;">Self-contained review page. Fonts embedded as base64. Edit the tester boxes; drag sliders to resize.</p>
    ${families}
  </main>
  <script>
    document.querySelectorAll('input[data-control="size"]').forEach(r => {
      r.addEventListener('input', (e) => {
        const target = document.getElementById(r.dataset.target)
        if (target) target.style.fontSize = e.target.value + 'px'
      })
    })
  </script>
</body>
</html>`
}

async function main() {
  const argv = Bun.argv.slice(2)
  const noServe = argv.includes('--no-serve')
  const portIdx = argv.indexOf('--port')
  const requested = portIdx >= 0 ? Number(argv[portIdx + 1]) : Number(process.env.PORT ?? 3333)

  await mkdir(OUT, { recursive: true })
  const html = await buildHtml()
  const outFile = resolve(OUT, 'index.html')
  await writeFile(outFile, html)
  const sizeKB = (html.length / 1024).toFixed(1)
  console.log(`✓ review.html → ${outFile} (${sizeKB} KB)`)

  if (noServe) return

  for (let port = requested; port < requested + 20; port++) {
    try {
      Bun.serve({
        port,
        fetch: () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      })
      console.log(`\n→ http://localhost:${port}\n  (ctrl-C to stop)`)
      return
    }
    catch (err) {
      const e = err as { code?: string }
      if (e.code !== 'EADDRINUSE') throw err
    }
  }
  throw new Error(`No free port in range ${requested}–${requested + 19}`)
}

await main()
