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

function buildFamilyCss(id: FamilyId, urlPrefix = '../fonts'): string {
  const meta = FAMILY_DISPLAY[id]
  const base = `${meta.file}-Regular`
  const url = `${urlPrefix}/${id}`
  return [
    `/* ${meta.display} — generated @font-face. */`,
    '@font-face {',
    `  font-family: "${meta.display}";`,
    `  src: url("${url}/woff2/${base}.woff2") format("woff2"),`,
    `       url("${url}/woff/${base}.woff") format("woff"),`,
    `       url("${url}/otf/${base}.otf") format("opentype");`,
    `  font-weight: ${meta.weight};`,
    `  font-style: ${meta.style};`,
    '  font-display: swap;',
    '}',
    '',
  ].join('\n')
}

function familyCard(id: FamilyId): string {
  const meta = FAMILY_DISPLAY[id]
  const extraStyle = id === 'campmate-script' ? '; font-feature-settings: "liga" on' : ''
  return `
<section class="family" id="${id}">
  <link rel="stylesheet" href="./css/${id}.css">
  <header class="family-head">
    <h2 class="family-name" style="font-family: '${meta.display}'${extraStyle}">${meta.display}</h2>
    <span class="family-meta">Original parametric · Regular · OTF · TTF · WOFF · WOFF2</span>
  </header>
  <div class="family-display" style="font-family: '${meta.display}'${extraStyle}">${meta.hero}</div>
  <div class="family-waterfall">
    <div class="row">
      <span class="label">Specimen</span>
      <span class="specimen" style="font-family: '${meta.display}'${extraStyle}">${meta.pangram}</span>
    </div>
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

function indexHtml(): string {
  const families = ALL_FAMILIES.map(familyCard).join('\n')
  const fontFaceImports = ALL_FAMILIES.map(id => `<link rel="stylesheet" href="./css/${id}.css">`).join('\n  ')
  const nav = ALL_FAMILIES.map(id => `<a href="#${id}">${FAMILY_DISPLAY[id].display.split(' ')[0]}</a>`).join(' ')
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
        <a href="https://github.com/stacksjs/nps-fonts">GitHub</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <h1>Built for the<br><span class="accent">long trail.</span></h1>
      <p class="lede">${ALL_FAMILIES.length} open-source typefaces inspired by U.S. National Park Service signage, posters, and trail markers — drawn from scratch and released under the SIL Open Font License 1.1, free for any use.</p>
      <p class="signature">Pack it in, pack it out.</p>
      <div class="pills">
        <span class="pill">${ALL_FAMILIES.length} families</span>
        <span class="pill">Drawn from scratch</span>
        <span class="pill">OFL 1.1</span>
        <span class="pill">OTF · TTF · WOFF · WOFF2</span>
      </div>
      <p class="disclaimer">Independent project — not affiliated with the U.S. National Park Service. All glyphs drawn from scratch by NPS Fonts contributors.</p>
    </section>

    <section class="families">
      ${families}
    </section>

    ${pairings()}
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
          <li><a href="https://github.com/stacksjs/nps-fonts">Repository</a></li>
          <li><a href="https://github.com/stacksjs/nps-fonts/issues">Issues</a></li>
          <li><a href="https://github.com/stacksjs/nps-fonts/blob/main/CONTRIBUTING.md">Contributing</a></li>
          <li><a href="https://github.com/stacksjs/nps-fonts/blob/main/OFL.txt">License (OFL)</a></li>
        </ul>
      </div>
      <div>
        <h4>Install</h4>
        <ul>
          <li><a href="https://www.npmjs.com/package/@nps-fonts/all">npm</a></li>
          <li><a href="https://www.jsdelivr.com/package/npm/@nps-fonts/all">jsDelivr</a></li>
          <li><a href="https://github.com/stacksjs/nps-fonts/releases">Release ZIPs</a></li>
        </ul>
      </div>
    </div>
  </footer>

  <script src="./assets/js/typetester.js"></script>
</body>
</html>`
}

function familyPageHtml(id: FamilyId): string {
  const meta = FAMILY_DISPLAY[id]
  const cssHref = `../css/${id}.css`
  const mainCss = '../assets/css/main.css'
  const extraStyle = id === 'campmate-script' ? "; font-feature-settings: 'liga' on" : ''
  const testerSample = id === 'nps-symbols'
    ? 'A M T F P C S L W * B H O D X'
    : id === 'nps-2026'
      ? `HALF DOME 8842 FT\n0123456789 NORTH RIM · 14.7 MI\nABCDEFGHIJKLMNOPQRSTUVWXYZ`
      : id === 'campmate-script'
        ? `Welcome to Crooked River Camp\ncoffee · hello · little kittens\nabcdefghijklmnopqrstuvwxyz`
        : `The mountains are calling and I must go.\nHALF DOME · NORTH RIM · 14.7 MI\nabcdefghijklmnopqrstuvwxyz 0123456789`

  const tester = `
<section class="tester" data-tester>
  <h2>Type tester</h2>
  <div class="tester-controls">
    <label>Size <span class="value" data-value="size">64px</span><input type="range" data-control="size" min="14" max="200" value="64"></label>
    <label>Tracking <span class="value" data-value="tracking">0.000</span><input type="range" data-control="tracking" min="-0.05" max="0.3" step="0.005" value="0"></label>
    <label>Weight <select data-control="weight"><option value="400">400</option></select></label>
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
      <nav class="nav"><a href="../">All families</a> <a href="https://github.com/stacksjs/nps-fonts">GitHub</a></nav>
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
    ${tester}
    ${glyphs}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <div><h4>NPS Fonts</h4><p>© 2026 contributors · OFL-1.1</p></div>
      <div><h4>Project</h4><ul><li><a href="https://github.com/stacksjs/nps-fonts">Repository</a></li><li><a href="../">All families</a></li></ul></div>
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
    await writeFile(resolve(DIST, 'css', `${id}.css`), buildFamilyCss(id))
  }

  await writeFile(resolve(DIST, 'index.html'), indexHtml())
  await mkdir(resolve(DIST, 'families'), { recursive: true })
  for (const id of ALL_FAMILIES) {
    await writeFile(resolve(DIST, 'families', `${id}.html`), familyPageHtml(id))
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
