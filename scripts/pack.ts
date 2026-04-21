#!/usr/bin/env bun
/**
 * Generate per-family npm packages under packages/<family>/.
 * All families are parametric originals — single regular weight.
 */

import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ALL_FAMILIES, FAMILY_DISPLAY, type FamilyId } from './lib/common.ts'

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts')
const PACKAGES = resolve(ROOT, 'packages')

const VERSION = process.env.NPM_VERSION ?? readVersion()

function readVersion(): string {
  const pkg = require(resolve(ROOT, 'package.json'))
  return pkg.version as string
}

async function copyDir(src: string, dst: string) {
  await mkdir(dst, { recursive: true })
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = resolve(src, entry.name)
    const d = resolve(dst, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await copyFile(s, d)
  }
}

function hasVariable(id: FamilyId): boolean {
  const meta = FAMILY_DISPLAY[id]
  return existsSync(resolve(FONTS, id, 'ttf', `${meta.file}[wght].ttf`))
}

function buildCss(id: FamilyId): string {
  const meta = FAMILY_DISPLAY[id]
  const base = `${meta.file}-Regular`
  const lines: string[] = [`/* ${meta.display} — ${meta.tagline} */`, '']

  if (hasVariable(id)) {
    lines.push(
      '/* Variable — wght axis 100–900, preferred. */',
      '@font-face {',
      `  font-family: "${meta.display}";`,
      `  src: url("./fonts/woff2/${meta.file}[wght].woff2") format("woff2-variations"),`,
      `       url("./fonts/woff/${meta.file}[wght].woff") format("woff-variations"),`,
      `       url("./fonts/ttf/${meta.file}[wght].ttf") format("truetype-variations");`,
      '  font-weight: 100 900;',
      `  font-style: ${meta.style};`,
      '  font-display: swap;',
      '}',
      '',
      '/* Static Regular — fallback for tools without variable-font support. */',
      '@font-face {',
      `  font-family: "${meta.display} Static";`,
      `  src: url("./fonts/woff2/${base}.woff2") format("woff2"),`,
      `       url("./fonts/woff/${base}.woff") format("woff"),`,
      `       url("./fonts/otf/${base}.otf") format("opentype");`,
      `  font-weight: ${meta.weight};`,
      `  font-style: ${meta.style};`,
      '  font-display: swap;',
      '}',
      '',
    )
  }
  else {
    lines.push(
      '@font-face {',
      `  font-family: "${meta.display}";`,
      `  src: url("./fonts/woff2/${base}.woff2") format("woff2"),`,
      `       url("./fonts/woff/${base}.woff") format("woff"),`,
      `       url("./fonts/otf/${base}.otf") format("opentype");`,
      `  font-weight: ${meta.weight};`,
      `  font-style: ${meta.style};`,
      '  font-display: swap;',
      '}',
      '',
    )
  }
  return lines.join('\n')
}

function buildPkgJson(id: FamilyId): object {
  const meta = FAMILY_DISPLAY[id]
  return {
    name: `@nps-fonts/${id}`,
    version: VERSION,
    description: `${meta.display} — ${meta.tagline} OFL-1.1. Unaffiliated with the U.S. National Park Service.`,
    keywords: ['font', 'typography', 'webfont', 'ofl', 'national-parks', id],
    license: 'OFL-1.1',
    homepage: `https://github.com/stacksjs/nps-fonts#${id}`,
    repository: {
      type: 'git',
      url: 'git+https://github.com/stacksjs/nps-fonts.git',
      directory: `packages/${id}`,
    },
    bugs: 'https://github.com/stacksjs/nps-fonts/issues',
    main: 'index.css',
    style: 'index.css',
    files: ['index.css', 'fonts/', 'README.md', 'LICENSE'],
    publishConfig: { access: 'public' },
    sideEffects: ['*.css'],
  }
}

function buildReadme(id: FamilyId): string {
  const meta = FAMILY_DISPLAY[id]
  return `# @nps-fonts/${id}

${meta.display} — ${meta.tagline}

Original parametric font, drawn from scratch by NPS Fonts contributors. Released under the [SIL Open Font License 1.1](./LICENSE). **Independent project, not affiliated with the U.S. National Park Service.**

## Install

\`\`\`bash
bun add @nps-fonts/${id}
# or: npm install @nps-fonts/${id}
\`\`\`

## Use

\`\`\`css
@import "@nps-fonts/${id}";

body { font-family: "${meta.display}", system-ui, sans-serif; }
\`\`\`

Or via CDN:

\`\`\`html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@nps-fonts/${id}/index.css">
\`\`\`

## Files

${hasVariable(id) ? `| Format | Path | Notes |
|---|---|---|
| Variable TTF | \`fonts/ttf/${meta.file}[wght].ttf\` | wght axis 100–900 |
| Variable WOFF2 | \`fonts/woff2/${meta.file}[wght].woff2\` | wght axis 100–900 |
| Variable WOFF | \`fonts/woff/${meta.file}[wght].woff\` | wght axis 100–900 |
| Static OTF    | \`fonts/otf/${meta.file}-Regular.otf\` | Regular only |
| Static TTF    | \`fonts/ttf/${meta.file}-Regular.ttf\` | Regular only |
| Static WOFF   | \`fonts/woff/${meta.file}-Regular.woff\` | Regular only |
| Static WOFF2  | \`fonts/woff2/${meta.file}-Regular.woff2\` | Regular only |` : `| Format | Path |
|---|---|
| OTF    | \`fonts/otf/${meta.file}-Regular.otf\` |
| TTF    | \`fonts/ttf/${meta.file}-Regular.ttf\` |
| WOFF   | \`fonts/woff/${meta.file}-Regular.woff\` |
| WOFF2  | \`fonts/woff2/${meta.file}-Regular.woff2\` |`}

## Project

Source, specimens, and the full family suite:
<https://github.com/stacksjs/nps-fonts>
`
}

async function buildFamilyPackage(id: FamilyId) {
  const dir = resolve(PACKAGES, id)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  await writeFile(resolve(dir, 'package.json'), `${JSON.stringify(buildPkgJson(id), null, 2)}\n`)
  await writeFile(resolve(dir, 'README.md'), buildReadme(id))
  await writeFile(resolve(dir, 'index.css'), buildCss(id))
  await copyFile(resolve(ROOT, 'OFL.txt'), resolve(dir, 'LICENSE'))

  const fontsSrc = resolve(FONTS, id)
  const fontsDst = resolve(dir, 'fonts')
  await copyDir(fontsSrc, fontsDst)
}

async function buildMetaPackage() {
  const dir = resolve(PACKAGES, 'all')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const pkg = {
    name: '@nps-fonts/all',
    version: VERSION,
    description: `NPS Fonts meta-package — installs all ${ALL_FAMILIES.length} families.`,
    license: 'OFL-1.1',
    homepage: 'https://github.com/stacksjs/nps-fonts',
    repository: {
      type: 'git',
      url: 'git+https://github.com/stacksjs/nps-fonts.git',
      directory: 'packages/all',
    },
    bugs: 'https://github.com/stacksjs/nps-fonts/issues',
    main: 'index.css',
    style: 'index.css',
    files: ['index.css', 'README.md', 'LICENSE'],
    publishConfig: { access: 'public' },
    sideEffects: ['*.css'],
    dependencies: Object.fromEntries(ALL_FAMILIES.map(id => [`@nps-fonts/${id}`, VERSION])),
  }

  await writeFile(resolve(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  await writeFile(
    resolve(dir, 'index.css'),
    ALL_FAMILIES.map(id => `@import "@nps-fonts/${id}";`).join('\n') + '\n',
  )
  await writeFile(
    resolve(dir, 'README.md'),
    `# @nps-fonts/all

The full NPS Fonts suite — ${ALL_FAMILIES.length} original parametric families in one install.

\`\`\`bash
bun add @nps-fonts/all
\`\`\`

\`\`\`css
@import "@nps-fonts/all";
\`\`\`

See <https://github.com/stacksjs/nps-fonts> for individual families and specimens.
`,
  )
  await copyFile(resolve(ROOT, 'OFL.txt'), resolve(dir, 'LICENSE'))
}

async function main() {
  await mkdir(PACKAGES, { recursive: true })
  for (const id of ALL_FAMILIES) {
    await buildFamilyPackage(id)
    console.log(`✓ packages/${id}`)
  }
  await buildMetaPackage()
  console.log(`✓ packages/all`)
  console.log(`\nVersion: ${VERSION}`)
}

await main()
