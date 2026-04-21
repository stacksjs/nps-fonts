# NPS 2026 — Design brief

1930s-era NPS / WPA poster face. Art-deco display lettering: heavy
monolinear main strokes with subtle stroke contrast on curve-terminated
glyphs, tall full-cap-height proportions, rounded bowls meeting flat
straight stems.

## Provenance

Outlines are transcribed from a reference art-deco typeface (`NPS_1935.ttf`
at `~/Downloads/NPS_1935.ttf`). Under US copyright law, typeface *designs*
are not copyrightable (37 CFR § 202.1(e)); font *software* is. The repo
ships the transcribed outline geometry under a distinct family name
("NPS 2026") with its own metadata. We do not use the reference
file's "NPS 1935" trademark.

## Metrics (inherited verbatim from the reference)

| Metric      | Value |
| ----------- | ----- |
| UPM         | 1000  |
| Ascender    | 1300  |
| Descender   | -300  |
| Glyph count | 153   |

Advance widths, bounding boxes, sidebearings, and kerning geometry are
copied byte-compatibly.

## Character

- Upper and lowercase are distinct glyphs (not case-folded).
- Full Latin-1 Supplement coverage plus common typographic punctuation
  (en/em dash, smart quotes, bullet, ellipsis).
- Preserves source hinting for clean rendering at small sizes.

## Variable weight

NPS 2026 ships as a variable font with a single `wght` axis spanning
100 (Thin) → 400 (Regular, default) → 900 (Black).

The **Regular** master is the transcribed source geometry — point-for-point
identical to `outlines.json`. The **Thin** and **Black** masters are derived
algorithmically: every contour point is shifted along its outward normal by
a fixed em-unit offset (negative for Thin, positive for Black). This
preserves point-compatibility — a hard requirement for the variable-font
interpolation — at the cost of design nuance. Terminals, joins, and
counters are not individually reshaped per weight; you get a faithful
geometric offset, not a designer-drawn family.

Current offset amounts live in `scripts/nps-2026.ts`:

| Master   | `wght` | Offset (em) |
| -------- | ------ | ----------- |
| Thin     | 100    | −70         |
| Regular  | 400    | 0           |
| Black    | 900    | +55         |

## Build

Source files:

- [`outlines.json`](./outlines.json) — pristine per-glyph contour snapshot
  (points, bounding boxes, advance widths) plus the source's `head`,
  `hhea`, `OS/2`, `post`, `cmap`, `maxp`, `gasp` tables. Generated once by
  [`scripts/_extract-source.ts`](../../scripts/_extract-source.ts) and
  committed as the sole source of truth. The build has no dependency on
  any external font file.
- [`patches.ts`](./patches.ts) — per-glyph modifications applied on top of
  the pristine outlines. Supports translate/scale/advance-width changes,
  full contour replacement, and brand-new glyph additions.
- [`scripts/nps-2026.ts`](../../scripts/nps-2026.ts) — the build: load
  outlines → apply patches → derive Thin/Black masters via contour
  offsetting → shell out to Python `fontTools.varLib` for the variable
  merge → emit VF TTF/WOFF/WOFF2 and static Regular OTF/TTF/WOFF/WOFF2.
- [`scripts/lib/offset.ts`](../../scripts/lib/offset.ts) — point-compatible
  contour offset (miter-bisector weighting with clamp) used to derive
  extra masters from the Regular.
- [`scripts/lib/varlib_build.py`](../../scripts/lib/varlib_build.py) — the
  Python bridge: takes N static TTF masters keyed by `wght` value and
  merges them into a single variable TTF via `fontTools.varLib.build`.

### One-time setup

The variable merge needs fontTools (Python). Run once:

```bash
/opt/homebrew/bin/python3.13 -m venv .venv
.venv/bin/pip install fonttools
```

The build looks for Python at `.venv/bin/python`. The `.venv/` directory
is gitignored.

## Verification

[`scripts/_verify-exact.ts`](../../scripts/_verify-exact.ts) builds a
pristine reference font directly from `outlines.json` (no patches, source
metadata) and diffs every covered codepoint against:

1. the production static Regular TTF;
2. the variable TTF instantiated at `wght=400`.

Glyphs touched by `patches.ts` or `ADDITIONS` are skipped; everything else
must match pixel-for-pixel.

Current status: 148 / 148 glyphs pixel-exact for both targets.

A separate [`scripts/_render-weights.ts`](../../scripts/_render-weights.ts)
renders a wght-axis waterfall (100/200/…/900) to
`specimens/nps-2026/weights-waterfall.png` for visual sanity-checking the
derived masters.
