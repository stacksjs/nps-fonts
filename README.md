# NPS Fonts

Six open-source typefaces inspired by U.S. National Park Service signage,
posters, and trail markers. Released under the
[SIL Open Font License 1.1](./OFL.txt).

> **Disclaimer.** This project is independent and **not affiliated with, endorsed by, or sponsored by**
> the U.S. National Park Service or the U.S. Department of the Interior. The names and aesthetics here
> are *inspired by* the broader public-lands visual tradition. See [`DISCLAIMER.md`](./DISCLAIMER.md).

## Families

### NPS 2026

![NPS 2026 specimen](./specimens/cards/nps-2026.png)

A 1930s WPA-era display face — heavy art-deco caps with rounded bowls
and flat stems, designed for headlines, trail signs, and route badges.
Ships as a **variable font** with a `wght` axis spanning **100 → 900**
(nine named instances: Thin / ExtraLight / Light / Regular / Medium /
SemiBold / Bold / ExtraBold / Black) plus a static Regular for tools
without variable-font support.

```css
@import "@nps-fonts/nps-2026";
h1 { font-family: "NPS 2026"; font-weight: 900; }
```

### Redwood Serif

![Redwood Serif specimen](./specimens/cards/redwood-serif.png)

An old-style transitional serif with stroke contrast and bracketed
serifs — bookish, with the warmth of an early-20th-century field
journal. Single Regular cut covering A–Z, a–z, digits, ASCII
punctuation, and Latin-1 Supplement.

```css
@import "@nps-fonts/redwood-serif";
body { font-family: "Redwood Serif"; }
```

### Campmate Script

![Campmate Script specimen](./specimens/cards/campmate-script.png)

A rounded upright brush script for hand-painted trailhead boards.
Single Regular cut, includes **19 OpenType `liga` ligatures** (`oo`,
`ll`, `oss`, `or`, `os`, `er`, `ax`, `ux`, `ex`, `zz`, `bs`, `br`,
`ox`, `ix`, `yx`, `ws`, `wr`, `nx`, `rx`).

```css
@import "@nps-fonts/campmate-script";
h2 {
  font-family: "Campmate Script";
  font-feature-settings: "liga" on; /* or font-variant-ligatures: common-ligatures; */
}
```

### NPS Symbols

![NPS Symbols specimen](./specimens/cards/nps-symbols.png)

Pictograph icon font — 23 NPS-themed symbols (mountain, tent,
campfire, compass, arrowhead, pine, hiker, bear, trail markers,
weather glyphs) at PUA codepoints `U+E000+` and ASCII shortcuts
(`M` = mountain, `T` = tent, `F` = campfire, `A` = arrowhead, etc.).

```css
@import "@nps-fonts/nps-symbols";
.icon { font-family: "NPS Symbols"; }
```

### Sequoia Sans

![Sequoia Sans specimen](./specimens/cards/sequoia-sans.png)

A humanist display sans for park field guides — high-contrast strokes
and slightly extended uppercase. Four cuts pair lowercase + uppercase
masters from the source family:

| Cut     | OS/2 weight | OS/2 width | Notes                            |
| ------- | ----------: | ---------: | -------------------------------- |
| Regular | 400         | 5 (normal) | Lowercase + Light uppercase      |
| Wide    | 400         | 7 (wide)   | Lowercase + Wide uppercase       |
| Light   | 300         | 5 (normal) | Light uppercase only (display)   |
| Thin    | 100         | 5 (normal) | Thin uppercase only (display)    |

```css
@import "@nps-fonts/sequoia-sans";
h1 { font-family: "Sequoia Sans"; font-weight: 100; }              /* Thin */
h2 { font-family: "Sequoia Sans"; font-weight: 400; font-stretch: 125%; } /* Wide */
```

### Switchback

![Switchback specimen](./specimens/cards/switchback.png)

Routed-trail display caps for backcountry signage — chiseled letters
with two sibling cuts: **Regular** (clean machine-routed) and
**Rough** (distressed/chiseled, published as the sibling family
`"Switchback Rough"` in CSS so the two never collide at the same
weight).

```css
@import "@nps-fonts/switchback";
h1 { font-family: "Switchback"; }       /* clean */
.weathered { font-family: "Switchback Rough"; }
```

## Install

All families ship in **`.otf`**, **`.ttf`**, **`.woff`**, and
**`.woff2`** formats.

### npm

```bash
bun add @nps-fonts/all              # everything
# or per family:
bun add @nps-fonts/nps-2026 @nps-fonts/redwood-serif @nps-fonts/campmate-script
bun add @nps-fonts/nps-symbols @nps-fonts/sequoia-sans @nps-fonts/switchback
```

```css
@import "@nps-fonts/all";
/* or one at a time: */
@import "@nps-fonts/redwood-serif";
```

### CDN

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@nps-fonts/all/index.css">
```

### Self-hosted `@font-face`

```css
@font-face {
  font-family: "Redwood Serif";
  src: url("/fonts/RedwoodSerif-Regular.woff2") format("woff2"),
       url("/fonts/RedwoodSerif-Regular.woff") format("woff"),
       url("/fonts/RedwoodSerif-Regular.otf") format("opentype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

### Desktop

Download family ZIPs from the
[latest release](https://github.com/national-park-service/fonts/releases).

## Build from source

Requires [Bun](https://bun.sh) 1.1+.

```bash
bun install
bun run build                            # build all six families
bun run build:family redwood-serif       # build a single family
bun run check                            # sanity-check built fonts
bun test                                 # run smoke + unit tests
bun run dev                              # serve the verify/specimen site
bun run web                              # build the static site under web/dist
bun run pack:all                         # generate per-family npm packages
bun run cards                            # regenerate the README specimen cards
bun run verify                           # NPS 2026 pixel-exact regression
```

Each family's drawing script emits OTF / TTF / WOFF / WOFF2 under
`fonts/<family>/`.

## Repository layout

```
nps-fonts/
├── sources/                    # per-family DESIGN.md + extracted outlines.json
│   ├── nps-2026/               # outlines.json + patches.ts
│   ├── redwood-serif/          # outlines.json + outlines-wide.json
│   ├── campmate-script/        # outlines.json
│   ├── sequoia-sans/           # outlines{,-light,-thin,-wide}.json
│   └── switchback/             # outlines-{clean,rough}.json
├── fonts/                      # built artifacts — committed
├── packages/                   # generated npm packages (one per family + meta)
├── scripts/
│   ├── build.ts                # build orchestrator
│   ├── _extract-source.ts      # SOURCE=... OUT=... extracts outlines.json
│   ├── _verify-exact.ts        # NPS 2026 pixel-exact self-check
│   ├── nps-2026.ts             # variable display caps build
│   ├── redwood-serif.ts        # serif build (lowercase + Wide uppercase merge)
│   ├── campmate-script.ts      # script build w/ GSUB liga reconstruction
│   ├── sequoia-sans.ts         # 4-cut humanist sans build
│   ├── switchback.ts           # Clean + Rough display caps build
│   ├── symbols.ts              # NPS Symbols pictograph build
│   ├── pack.ts                 # generate npm packages
│   ├── web.ts                  # specimen site (verify view + family pages)
│   ├── specimen-cards.ts       # the per-family cards screenshotted into README
│   ├── screenshot.ts           # Bun.WebView headless PNG capture
│   ├── render.ts               # raw glyph PNG rendering
│   ├── check.ts                # sanity checks on built fonts
│   └── lib/
│       ├── common.ts           # shared family metadata + charset
│       ├── cuts.ts             # per-family static-cut discovery
│       ├── extracted.ts        # load + merge + brand + write helpers
│       ├── offset.ts           # contour offsetting for variable masters
│       └── woff.ts             # WOFF 1.0 wrapper
├── web/                        # specimen / verify site source
├── tests/                      # build smoke tests
├── test/                       # unit tests (offset, patches, interpolation)
└── .github/                    # CI/CD
```

## How the families are built

The fonts are built in pure TypeScript via
[`ts-fonts`](https://github.com/stacksjs/ts-fonts) and
[`opentype.js`](https://github.com/opentypejs/opentype.js) — no Python
toolchain required.

Five of the six families load their geometry from JSON files under
`sources/<family>/outlines*.json` (extracted once via
`scripts/_extract-source.ts`). The build pipeline rounds floats to
integers, brands the `name` table, applies any per-family transforms
(uppercase merging, variable-master offsetting, GSUB ligature
reconstruction), and writes OTF / TTF / WOFF / WOFF2 in one pass via
the shared helpers in `scripts/lib/extracted.ts`. **NPS Symbols** is
the exception — its 23 pictographs are drawn parametrically in
`scripts/symbols.ts`.

**NPS 2026** additionally derives Thin (wght 100) and Black (wght 900)
masters from the Regular outlines via point-compatible contour
offsetting (`scripts/lib/offset.ts`), then merges all three into a
variable font with `buildVariableFont` from `ts-fonts`. The
`bun run verify` script per-pixel-diffs every covered codepoint against
the source `outlines.json` to catch regressions.

## Specimen site

Run `bun run dev` to launch the verify view at <http://localhost:3001>.
The page loads each family's actual `.woff2` files and shows a row per
cut with sample text — handy for spotting fallback rendering or broken
files at a glance. Drag the size / line-height / tracking sliders to
inspect glyph shapes at any size; settings persist via `localStorage`.

A static specimen site is built under `web/dist/` by `bun run web`.

## Contributing

PRs welcome at every level — additional weights, polish passes on
specific glyphs, kerning, language coverage, specimen site
improvements, packaging. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[SIL Open Font License 1.1](./OFL.txt). You may use, modify, and
redistribute these fonts — including in commercial work — provided
you retain the license. **Reserved Font Names**: *NPS 2026*,
*Redwood Serif*, *Campmate Script*, *NPS Symbols*, *Sequoia Sans*,
*Switchback*.
