#!/usr/bin/env bun
/**
 * Build the static specimen site under web/dist/.
 *
 *   bun run scripts/web.ts            # build
 *   bun run scripts/web.ts --serve    # build + serve on http://localhost:3000
 */

import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ALL_FAMILIES, FAMILY_DISPLAY, type FamilyId } from './lib/common.ts'
import { discoverStaticCuts, hasVariable, type StaticCut } from './lib/cuts.ts'

const ROOT = resolve(import.meta.dir, '..')
const FONTS_DIR = resolve(ROOT, 'fonts')
const WEB_SRC = resolve(ROOT, 'web')
const DIST = resolve(WEB_SRC, 'dist')

async function copyDir(src: string, dst: string) {
  await mkdir(dst, { recursive: true })
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = resolve(src, entry.name)
    const d = resolve(dst, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await copyFile(s, d)
  }
}

async function buildFamilyCss(id: FamilyId, urlPrefix = '../fonts'): Promise<string> {
  const meta = FAMILY_DISPLAY[id]
  const url = `${urlPrefix}/${id}`
  const cuts = await discoverStaticCuts(id)
  if (cuts.length === 0) {
    cuts.push({ stem: `${meta.file}-Regular`, style: 'Regular', weight: meta.weight })
  }
  const lines: string[] = [`/* ${meta.display} — generated @font-face. */`]

  if (hasVariable(id)) {
    const stem = `${meta.file}[wght]`
    lines.push(
      '@font-face {',
      `  font-family: "${meta.display}";`,
      `  src: url("${url}/woff2/${stem}.woff2") format("woff2-variations"),`,
      `       url("${url}/woff/${stem}.woff") format("woff-variations"),`,
      `       url("${url}/ttf/${stem}.ttf") format("truetype-variations");`,
      '  font-weight: 100 900;',
      `  font-style: ${meta.style};`,
      '  font-display: swap;',
      '}',
    )
  }

  for (const cut of cuts) {
    const family = cut.siblingFamily ?? meta.display
    lines.push(
      '@font-face {',
      `  font-family: "${family}";`,
      `  src: url("${url}/woff2/${cut.stem}.woff2") format("woff2"),`,
      `       url("${url}/woff/${cut.stem}.woff") format("woff"),`,
      `       url("${url}/otf/${cut.stem}.otf") format("opentype");`,
      `  font-weight: ${cut.weight};`,
    )
    if (cut.stretch) lines.push(`  font-stretch: ${cut.stretch};`)
    lines.push(
      `  font-style: ${meta.style};`,
      '  font-display: swap;',
      '}',
    )
  }
  lines.push('')
  return lines.join('\n')
}

function ligaStyle(id: FamilyId): string {
  return id === 'campmate-script' ? '; font-feature-settings: "liga" on' : ''
}

function cutLabel(cut: StaticCut): string {
  const parts: string[] = [cut.style]
  parts.push(String(cut.weight))
  if (cut.stretch) parts.push(cut.stretch)
  if (cut.siblingFamily) parts.push('sibling family')
  return parts.join(' · ')
}

function cutFontStyle(meta: { display: string }, cut: StaticCut, id: FamilyId): string {
  const family = cut.siblingFamily ?? meta.display
  const parts = [`font-family: '${family}'`, `font-weight: ${cut.weight}`]
  if (cut.stretch) parts.push(`font-stretch: ${cut.stretch}`)
  return parts.join('; ') + ligaStyle(id)
}

async function familyCard(id: FamilyId): Promise<string> {
  const meta = FAMILY_DISPLAY[id]
  const extra = ligaStyle(id)
  const cuts = await discoverStaticCuts(id)
  const variable = hasVariable(id)
  const cutsBadge = (variable ? ['Variable wght 100–900'] : [])
    .concat(cuts.map(c => c.style))
    .join(' · ')
  const waterfall = cuts.length > 1
    ? cuts.map(c => `
    <div class="row">
      <span class="label">${escapeHtml(cutLabel(c))}</span>
      <span class="specimen" style="${cutFontStyle(meta, c, id)}">${meta.pangram}</span>
    </div>`).join('')
    : `
    <div class="row">
      <span class="label">Specimen</span>
      <span class="specimen" style="font-family: '${meta.display}'${extra}">${meta.pangram}</span>
    </div>`
  return `
<section class="family" id="${id}">
  <link rel="stylesheet" href="./css/${id}.css">
  <header class="family-head">
    <h2 class="family-name" style="font-family: '${meta.display}'${extra}">${meta.display}</h2>
    <span class="family-meta">${escapeHtml(cutsBadge)} · OTF · TTF · WOFF · WOFF2</span>
  </header>
  <div class="family-display" style="font-family: '${meta.display}'${extra}">${meta.hero}</div>
  <div class="family-waterfall">${waterfall}
  </div>
  <div class="family-actions">
    <a class="btn primary" href="./families/${id}.html">Open specimen</a>
    <a class="btn" href="./fonts/${id}/">Download files</a>
  </div>
  <pre class="snippet"><button class="copy">copy</button>bun add @nps-fonts/${id}

@import "@nps-fonts/${id}";
font-family: "${meta.display}";</pre>
  <p class="attribution">${meta.tagline}</p>
</section>`
}

/**
 * Sample lines for the verification rows. Each family gets a few lines
 * exercising upper, lower, digits, punct, plus any feature flag (like
 * the Campmate Script ligatures or the NPS Symbols pictographs).
 */
function verifySamples(id: FamilyId): string[] {
  if (id === 'nps-symbols') {
    return ['A M T F P C S L W * B H O D X', 'mountain · tent · campfire · compass · pine']
  }
  if (id === 'campmate-script') {
    return [
      'The mountains are calling — and I must go.',
      'oo ll oss or os er ax ux ex zz bs br ox ix yx ws wr nx rx',
      'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789 . , ; : ! ? — ‘ ’ “ ”',
    ]
  }
  if (id === 'nps-2026' || id === 'switchback') {
    return [
      'CRATER LAKE · EST 1902 · ELEV 7100 FT',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789 — ‘ ’ “ ” · & ?',
    ]
  }
  return [
    'The mountains are calling and I must go.',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789 — ‘ ’ “ ” · & ? @',
  ]
}

/**
 * Render one verification row per cut for a family — designed to make
 * it visually obvious that every cut loads, every glyph maps, and any
 * weight/stretch/ligature feature is wired correctly.
 */
async function verifyCard(id: FamilyId): Promise<string> {
  const meta = FAMILY_DISPLAY[id]
  const extra = ligaStyle(id)
  const cuts = await discoverStaticCuts(id)
  const variable = hasVariable(id)
  const samples = verifySamples(id)

  const rows: string[] = []

  // Variable axis row (if present): a single line at three weights to
  // make scrubbing visible.
  if (variable) {
    rows.push(`
      <div class="vrow">
        <div class="vmeta">
          <code>${meta.file}[wght].woff2</code>
          <span>variable axis</span>
          <span>wght 100 → 900</span>
        </div>
        <div class="vsamples">
          <div class="vline" style="font-family: '${meta.display}'${extra}; font-weight: 100">${escapeHtml(samples[0]!)}</div>
          <div class="vline" style="font-family: '${meta.display}'${extra}; font-weight: 400">${escapeHtml(samples[0]!)}</div>
          <div class="vline" style="font-family: '${meta.display}'${extra}; font-weight: 900">${escapeHtml(samples[0]!)}</div>
        </div>
      </div>`)
  }

  for (const cut of cuts) {
    const family = cut.siblingFamily ?? meta.display
    const styleParts = [`font-family: '${family}'`, `font-weight: ${cut.weight}`]
    if (cut.stretch) styleParts.push(`font-stretch: ${cut.stretch}`)
    const css = styleParts.join('; ') + extra
    const tags: string[] = [`weight ${cut.weight}`]
    if (cut.stretch) tags.push(`stretch ${cut.stretch}`)
    if (cut.siblingFamily) tags.push(`family <q>${escapeHtml(cut.siblingFamily)}</q>`)
    rows.push(`
      <div class="vrow">
        <div class="vmeta">
          <code>${cut.stem}.woff2</code>
          ${tags.map(t => `<span>${t}</span>`).join('\n          ')}
        </div>
        <div class="vsamples">
          ${samples.map(s => `<div class="vline" style="${css}">${escapeHtml(s)}</div>`).join('\n          ')}
        </div>
      </div>`)
  }

  const cutCount = cuts.length + (variable ? 1 : 0)
  // Pictograph faces (NPS Symbols) would render their own family name as
  // unreadable glyphs — fall back to the site title font for the heading.
  const titleStyle = id === 'nps-symbols'
    ? ''
    : ` style="font-family: '${meta.display}'${extra}"`
  return `
<section class="vfamily" id="${id}">
  <header class="vhead">
    <h2 class="vname"${titleStyle}>${meta.display}</h2>
    <span class="vcount">${cutCount} ${cutCount === 1 ? 'cut' : 'cuts'}</span>
    <a class="vdetails" href="./families/${id}.html">full specimen →</a>
  </header>
  ${rows.join('\n  ')}
</section>`
}

function pairings(): string {
  return `
<section class="pairings">
  <h2>Pairings</h2>
  <div class="pairing">
    <div class="pair-meta">
      NPS 2026 over Redwood Serif
      <strong>Display + body</strong>
    </div>
    <div>
      <h3 class="pair-headline" style="font-family: 'NPS 2026';">CRATER LAKE</h3>
      <p class="pair-body" style="font-family: 'Redwood Serif';">Established 1902. Deepest lake in the United States, formed when Mount Mazama collapsed roughly 7,700 years ago. The water is so pure it absorbs almost every wavelength but blue.</p>
    </div>
  </div>
  <div class="pairing script">
    <div class="pair-meta">
      Campmate Script over Redwood Serif
      <strong>Headline + body</strong>
    </div>
    <div>
      <h3 class="pair-headline" style="font-family: 'Campmate Script'; font-feature-settings: 'liga' on;">Welcome, campers</h3>
      <p class="pair-body" style="font-family: 'Redwood Serif';">Quiet hours begin at ten. Pack out what you pack in. Bear boxes at every site — please use them. Check the trailhead board for closures before you set out tomorrow.</p>
    </div>
  </div>
</section>`
}

async function indexHtml(): Promise<string> {
  const verifyCards = (await Promise.all(ALL_FAMILIES.map(verifyCard))).join('\n')
  const fontFaceImports = ALL_FAMILIES.map(id => `<link rel="stylesheet" href="./css/${id}.css">`).join('\n  ')
  const nav = ALL_FAMILIES.map(id => `<a href="#${id}">${FAMILY_DISPLAY[id].display.split(' ')[0]}</a>`).join(' ')
  const cutCounts = await Promise.all(ALL_FAMILIES.map(async (id) => {
    const cuts = await discoverStaticCuts(id)
    return cuts.length + (hasVariable(id) ? 1 : 0)
  }))
  const totalCuts = cutCounts.reduce((a, b) => a + b, 0)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NPS Fonts — original typefaces inspired by U.S. national parks</title>
  <meta name="description" content="Original open-source typefaces inspired by U.S. National Park Service signage. Drawn from scratch, released under SIL OFL 1.1.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath fill='%23b04a2e' d='M32 4 L60 56 L4 56 Z'/%3E%3C/svg%3E">
  ${fontFaceImports}
  <link rel="stylesheet" href="./assets/css/main.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <span class="brand">NPS Fonts<span class="dot">.</span></span>
      <nav class="nav">
        ${nav}
        <a href="https://github.com/national-park-service/fonts">GitHub</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="verify">
      <header class="verify-head">
        <h1 class="verify-title">Verify</h1>
        <p class="verify-lede">${ALL_FAMILIES.length} families · ${totalCuts} cuts. Each row loads the actual <code>woff2</code> shown — if a row renders in the wrong fallback, that file is broken.</p>
      </header>
      <div class="verify-controls" data-verify-controls>
        <label>
          <span class="ctrl-label">Size <span data-value="vsize">28</span>px</span>
          <input type="range" min="12" max="160" value="28" step="1" data-control="vsize">
        </label>
        <label>
          <span class="ctrl-label">Line height <span data-value="vlh">1.18</span></span>
          <input type="range" min="0.9" max="2" value="1.18" step="0.02" data-control="vlh">
        </label>
        <label>
          <span class="ctrl-label">Tracking <span data-value="vtrack">0.000</span>em</span>
          <input type="range" min="-0.04" max="0.2" value="0" step="0.005" data-control="vtrack">
        </label>
      </div>
      ${verifyCards}
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <div>
        <h4>NPS Fonts</h4>
        <p>Original open-source typefaces inspired by U.S. National Park Service signage. Released under the SIL Open Font License 1.1.</p>
        <p>© 2026 NPS Fonts contributors</p>
      </div>
      <div>
        <h4>Project</h4>
        <ul>
          <li><a href="https://github.com/national-park-service/fonts">Repository</a></li>
          <li><a href="https://github.com/national-park-service/fonts/issues">Issues</a></li>
          <li><a href="https://github.com/national-park-service/fonts/blob/main/CONTRIBUTING.md">Contributing</a></li>
          <li><a href="https://github.com/national-park-service/fonts/blob/main/OFL.txt">License (OFL)</a></li>
        </ul>
      </div>
      <div>
        <h4>Install</h4>
        <ul>
          <li><a href="https://www.npmjs.com/package/@nps-fonts/all">npm</a></li>
          <li><a href="https://www.jsdelivr.com/package/npm/@nps-fonts/all">jsDelivr</a></li>
          <li><a href="https://github.com/national-park-service/fonts/releases">Release ZIPs</a></li>
        </ul>
      </div>
    </div>
  </footer>

  <script src="./assets/js/typetester.js"></script>
  <script src="./assets/js/verify.js"></script>
</body>
</html>`
}

async function familyPageHtml(id: FamilyId): Promise<string> {
  const meta = FAMILY_DISPLAY[id]
  const cssHref = `../css/${id}.css`
  const mainCss = '../assets/css/main.css'
  const extraStyle = ligaStyle(id)
  const cuts = await discoverStaticCuts(id)
  const variable = hasVariable(id)

  const testerSample = id === 'nps-symbols'
    ? 'A M T F P C S L W * B H O D X'
    : id === 'nps-2026'
      ? `HALF DOME 8842 FT\n0123456789 NORTH RIM · 14.7 MI\nABCDEFGHIJKLMNOPQRSTUVWXYZ`
      : id === 'campmate-script'
        ? `Welcome to Crooked River Camp\ncoffee · hello · little kittens\nabcdefghijklmnopqrstuvwxyz`
        : `The mountains are calling and I must go.\nHALF DOME · NORTH RIM · 14.7 MI\nabcdefghijklmnopqrstuvwxyz 0123456789`

  // Per-cut waterfall, shown when there are multiple cuts (otherwise the
  // single-cut specimen below is enough on its own).
  const cutsWaterfall = cuts.length > 1
    ? `
    <section class="families">
      <div class="family">
        <header class="family-head">
          <h2 class="family-name">Cuts</h2>
          <span class="family-meta">${cuts.length} static cut${cuts.length === 1 ? '' : 's'}${variable ? ' + 1 variable axis' : ''}</span>
        </header>
        <div class="family-waterfall">
          ${cuts.map(c => `<div class="row">
            <span class="label">${escapeHtml(cutLabel(c))}</span>
            <span class="specimen" style="${cutFontStyle(meta, c, id)}">${meta.pangram}</span>
          </div>`).join('\n          ')}
        </div>
      </div>
    </section>`
    : ''

  // Weight options for the type-tester populated from real cuts so e.g.
  // Sequoia Sans's Thin/Light/Regular show up. Each option's value is the
  // CSS font-weight to apply.
  const weightOptions = (cuts.length > 0
    ? Array.from(new Set(cuts.map(c => c.weight))).sort((a, b) => a - b)
    : [meta.weight])
    .map(w => `<option value="${w}"${w === meta.weight ? ' selected' : ''}>${w}</option>`)
    .join('')

  const tester = `
<section class="tester" data-tester>
  <h2>Type tester</h2>
  <div class="tester-controls">
    <label>Size <span class="value" data-value="size">64px</span><input type="range" data-control="size" min="14" max="200" value="64"></label>
    <label>Tracking <span class="value" data-value="tracking">0.000</span><input type="range" data-control="tracking" min="-0.05" max="0.3" step="0.005" value="0"></label>
    <label>Weight <select data-control="weight">${weightOptions}</select></label>
    <label>Style <select data-control="style"><option>normal</option></select></label>
  </div>
  <textarea class="tester-area" style="font-family: '${meta.display}'${extraStyle}">${testerSample}</textarea>
</section>`

  const codePoints: number[] = []
  if (id === 'nps-symbols') {
    for (const c of 'AMTFPCSLW*BHODX') codePoints.push(c.charCodeAt(0))
  }
  else {
    for (let cp = 0x21; cp <= 0x7E; cp++) codePoints.push(cp)
  }
  const glyphs = `<section class="glyphs-section"><h2>${id === 'nps-symbols' ? 'Pictographs' : 'Character map'}</h2><div class="glyphs" style="font-family: '${meta.display}'${extraStyle}">${
    codePoints.map(cp => `<span class="cell" data-cp="${cp.toString(16).toUpperCase().padStart(4, '0')}">${escapeHtml(String.fromCodePoint(cp))}</span>`).join('')
  }</div></section>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${meta.display} · NPS Fonts</title>
  <link rel="stylesheet" href="${cssHref}">
  <link rel="stylesheet" href="${mainCss}">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a href="../" class="brand">NPS Fonts<span class="dot">.</span></a>
      <nav class="nav"><a href="../">All families</a> <a href="https://github.com/national-park-service/fonts">GitHub</a></nav>
    </div>
  </header>
  <main class="wrap">
    <section class="hero">
      <h1 style="font-family: '${meta.display}'${extraStyle}">${meta.hero}</h1>
      <p class="lede">${meta.pangram}</p>
      <div class="pills">
        <span class="pill">Original parametric</span>
        <span class="pill">OTF · TTF · WOFF · WOFF2</span>
        <span class="pill">OFL-1.1</span>
      </div>
      <p class="attribution">${meta.tagline}</p>
    </section>
    <section class="families">
      <div class="family">
        <div class="family-waterfall">
          <div class="row">
            <span class="label">Specimen</span>
            <span class="specimen" style="font-family: '${meta.display}'${extraStyle}">${meta.pangram}</span>
          </div>
        </div>
        <pre class="snippet"><button class="copy">copy</button>bun add @nps-fonts/${id}

@import "@nps-fonts/${id}";
font-family: "${meta.display}";</pre>
      </div>
    </section>
    ${cutsWaterfall}
    ${tester}
    ${glyphs}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <div><h4>NPS Fonts</h4><p>© 2026 contributors · OFL-1.1</p></div>
      <div><h4>Project</h4><ul><li><a href="https://github.com/national-park-service/fonts">Repository</a></li><li><a href="../">All families</a></li></ul></div>
      <div></div>
    </div>
  </footer>
  <script src="../assets/js/typetester.js"></script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

async function build() {
  await rm(DIST, { recursive: true, force: true })
  await mkdir(DIST, { recursive: true })

  await copyDir(resolve(WEB_SRC, 'assets'), resolve(DIST, 'assets'))
  await copyDir(FONTS_DIR, resolve(DIST, 'fonts'))

  await mkdir(resolve(DIST, 'css'), { recursive: true })
  for (const id of ALL_FAMILIES) {
    await writeFile(resolve(DIST, 'css', `${id}.css`), await buildFamilyCss(id))
  }

  await writeFile(resolve(DIST, 'index.html'), await indexHtml())
  await mkdir(resolve(DIST, 'families'), { recursive: true })
  for (const id of ALL_FAMILIES) {
    await writeFile(resolve(DIST, 'families', `${id}.html`), await familyPageHtml(id))
  }

  console.log(`Built specimen site → ${DIST}`)
}

async function serve() {
  const argv = Bun.argv.slice(2)
  const portFlag = argv.indexOf('--port')
  const portArg = portFlag >= 0 ? argv[portFlag + 1] : undefined
  const requested = portArg ? Number(portArg) : Number(process.env.PORT ?? 3000)
  const handler = (req: Request) => {
    const url = new URL(req.url)
    let p = decodeURIComponent(url.pathname)
    if (p.endsWith('/')) p += 'index.html'
    const file = Bun.file(resolve(DIST, '.' + p))
    return new Response(file)
  }
  for (let port = requested; port < requested + 20; port++) {
    try {
      Bun.serve({ port, fetch: handler })
      console.log(`Serving ${DIST} at http://localhost:${port}`)
      return
    }
    catch (err) {
      const e = err as { code?: string }
      if (e.code !== 'EADDRINUSE') throw err
      console.log(`port ${port} busy, trying ${port + 1}…`)
    }
  }
  throw new Error(`No free port found in range ${requested}–${requested + 19}`)
}

const argv = Bun.argv.slice(2)
await build()
if (argv.includes('--serve')) {
  await serve()
}

export { buildFamilyCss }
