# NPS 2026 — Design brief

1930s-era NPS / WPA poster face. Art-deco display lettering: heavy
monolinear main strokes with subtle stroke contrast on curve-terminated
glyphs, tall full-cap-height proportions, rounded bowls meeting flat
straight stems.

## Provenance

Outlines are transcribed from a reference art-deco typeface (`NPS_1935.ttf`
in `~/Downloads/`). Under US copyright law, typeface *designs* are not
copyrightable (37 CFR § 202.1(e)); font *software* is. The repo ships the
transcribed outline geometry under a distinct family name ("NPS 2026")
with its own metadata. We do not use the reference file's "NPS 1935"
trademark.

## Metrics (inherited verbatim from the reference)

| Metric      | Value |
| ----------- | ----- |
| UPM         | 1000  |
| Ascender    | 1300  |
| Descender   | -300  |
| Glyph count | 153   |

Advance widths, bounding boxes, and sidebearings are copied byte-compatibly
for the Regular master.

## Variable weight

NPS 2026 ships as a variable font with a single `wght` axis spanning
100 (Thin) → 400 (Regular, default) → 900 (Black). Nine named CSS-weight
instances (Thin / ExtraLight / Light / Regular / Medium / SemiBold / Bold
/ ExtraBold / Black) are exposed via `fvar`.

The **Regular** master is the transcribed source geometry — point-for-point
identical to `outlines.json`. **Thin** and **Black** masters are derived
algorithmically by `scripts/lib/offset.ts`: every contour point is shifted
along its perpendicular normal by a fixed em-unit offset, with the winding
direction auto-detected from the source so positive offset reliably adds
ink. Point-compatibility is preserved — a hard requirement for variable
interpolation — at the cost of design nuance. Terminals, joins, and
counters aren't individually reshaped per weight; you get a faithful
geometric offset, not a designer-drawn family.

Current offset amounts are in `scripts/nps-2026.ts`:

| Master   | `wght` | Offset (em) |
| -------- | ------ | ----------- |
| Thin     | 100    | −70         |
| Regular  | 400    | 0           |
| Black    | 900    | +55         |

## Build

The entire pipeline is pure TypeScript — no external binary dependencies.

Source files:

- [`outlines.json`](./outlines.json) — pristine per-glyph snapshot (points,
  bounding boxes, advance widths) plus `head`, `hhea`, `OS/2`, `post`,
  `cmap`, `maxp`, `gasp` tables. Generated once by
  [`scripts/_extract-source.ts`](../../scripts/_extract-source.ts) and
  committed as the sole source of truth. No external font file is read at
  build time.
- [`patches.ts`](./patches.ts) — per-glyph modifications applied on top of
  the pristine outlines. Supports translate/scale/advance-width/LSB edits,
  full contour replacement, and new-glyph additions.
- [`scripts/nps-2026.ts`](../../scripts/nps-2026.ts) — the build: load
  outlines → apply patches → derive Thin/Black masters via contour
  offsetting → merge with `buildVariableFont` (from `ts-font-editor`) →
  emit VF TTF/WOFF/WOFF2 and static Regular OTF/TTF/WOFF/WOFF2.
- [`scripts/lib/offset.ts`](../../scripts/lib/offset.ts) — point-compatible
  contour offset with miter-bisector corner handling and auto-detected
  outer-winding convention.

## ts-font-editor

Variable-font merging, TTF reading/writing, and static instance
generation are all provided by
[`ts-font-editor`](https://github.com/stacksjs/ts-font-editor) —
`bun link`-ed during development. Replaces the previous
`fonteditor-core` (JS) + `fontTools` (Python) combo with a single
TypeScript dependency.

## Verification

[`scripts/_verify-exact.ts`](../../scripts/_verify-exact.ts) builds a
pristine reference font directly from `outlines.json` and per-pixel diffs
every covered codepoint against:

1. the built static Regular TTF;
2. the variable TTF instantiated at `wght=400`.

Glyphs touched by `patches.ts` or `ADDITIONS` are skipped; everything else
must match pixel-for-pixel.

Current status: 148 / 148 glyphs pixel-exact for both targets.

[`scripts/_render-weights.ts`](../../scripts/_render-weights.ts) renders a
wght-axis waterfall (100/200/…/900) to
`specimens/nps-2026/weights-waterfall.png` for visual sanity-checking the
derived masters.

## Tests

```bash
bun test
```

Unit tests live in `test/`:

- `offset.test.ts` — contour offsetting (grow/shrink semantics per
  winding, outer-winding detection, bbox recomputation).
- `patches.test.ts` — patch application (translate/scale/advance/LSB/
  setContours/mapContours, composition order).
- `nps-2026.test.ts` — end-to-end build output (axis range, named
  instances, gvar glyph count, family branding).

Plus the legacy `tests/build.test.ts` that checks each family's built
fonts pass structural sanity (metrics, copyright, postscript naming).
