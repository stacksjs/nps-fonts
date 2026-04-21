# NPS Fonts

Original open-source typefaces inspired by U.S. National Park Service
signage. Every glyph drawn from scratch — no OFL forks. Released under
the SIL Open Font License 1.1.

> **Disclaimer.** This project is independent and **not affiliated with, endorsed by, or sponsored by** the U.S. National Park Service or the U.S. Department of the Interior. The names, designs, and aesthetics here are *inspired by* the broader public-lands visual tradition. See [`DISCLAIMER.md`](./DISCLAIMER.md).

## The families

| Family               | Genre                                         | Reference inspiration                      |
| -------------------- | --------------------------------------------- | ------------------------------------------ |
| **NPS 2026** | Vintage 1930s NPS display caps (all-caps)     | NPS 1935 routed-redwood signage            |
| **Redwood Serif**    | Old-style serif with stroke contrast          | Vicarel Studios *John Muir Serif*          |
| **Campmate Script**  | Rounded upright script with ligatures         | Vicarel Studios *VS Outdoor Script*        |
| **NPS Symbols**      | Pictograph icon font (23 glyphs)              | Original — NPS-themed icons                |

All families ship in **`.otf`**, **`.ttf`**, **`.woff`**, and **`.woff2`**.

**Campmate Script** ships with 5 OpenType `liga` ligatures (`oo`, `ll`, `tt`, `ee`, `ss`). Enable with:

```css
font-family: "Campmate Script";
font-feature-settings: "liga" on;
```

**NPS Symbols** carries 23 NPS-themed pictographs (mountain, tent, campfire, compass, arrowhead, pine, hiker, bear, trail markers, weather glyphs) at PUA codepoints `U+E000+` and ASCII shortcuts (`M` = mountain, `T` = tent, `F` = campfire, etc.).

## Install

### Desktop

Download the family ZIP from the [latest release](https://github.com/stacksjs/nps-fonts/releases) and install.

### Web (CDN)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@nps-fonts/nps-2026/index.css">
```

### npm

```bash
bun add @nps-fonts/nps-2026
# or: npm install @nps-fonts/nps-2026
```

```css
@import "@nps-fonts/nps-2026";

h1 { font-family: "NPS 2026", system-ui, sans-serif; }
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

## Specimen site

Live demo: <https://stacksjs.github.io/nps-fonts/>

## Build from source

Requires [Bun](https://bun.sh) 1.1+.

```bash
bun install
bun run build                            # build all four families
bun run build:family nps-2026    # build a single family
bun run web                              # build the specimen site under web/dist
bun run check                            # sanity-check built fonts
bun test tests/                          # run smoke tests
```

Each drawing script emits OTF / TTF / WOFF / WOFF2 under `fonts/<family>/`.

## Repository layout

```
nps-fonts/
├── sources/                # design briefs (human-readable per-family notes)
├── fonts/                  # built artifacts (.otf .ttf .woff .woff2) — committed
├── packages/               # generated npm packages (one per family + meta)
├── scripts/
│   ├── build.ts            # build orchestrator
│   ├── nps-2026.ts # drawing script — display caps
│   ├── redwood-serif.ts    # drawing script — old-style serif
│   ├── campmate-script.ts  # drawing script — rounded script w/ ligatures
│   ├── symbols.ts          # drawing script — NPS Symbols pictographs
│   ├── pack.ts             # generate npm packages
│   ├── web.ts              # build specimen site
│   ├── render.ts           # render PNG specimens from built fonts
│   ├── check.ts            # sanity checks
│   └── lib/                # shared common metadata + WOFF wrapper
├── web/                    # specimen site source
├── tests/                  # smoke tests
└── .github/                # CI/CD
```

## From-scratch origins

v0.7.0 replaced the previous OFL-fork approach with four original
parametric families drawn from scratch using `opentype.js`. The
previous forks (Wayfinder Sans/Serif, Campfire Script, Switchback,
Cairn, Routemark Sans, Trailmark Script) were removed.

This lets us ship a consistent visual system tuned specifically for
NPS wayfinding aesthetics, without the attribution and renaming
burden of maintaining multiple OFL forks.

## Contributing

PRs welcome at every level — additional weights, polish passes on
specific glyphs, specimen site improvements, packaging, language
coverage. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[SIL Open Font License 1.1](./OFL.txt). You may use, modify, and redistribute these fonts — including in commercial work — provided you retain the license. **Reserved Font Names**: *NPS 2026*, *Redwood Serif*, *Campmate Script*, *NPS Symbols*.

## Status

**v0.7.0 — original parametric release.** All four families are drawn
from scratch. Per-glyph refinement (polish passes, hinting, kerning,
language coverage extensions) is the work for v0.8+.
