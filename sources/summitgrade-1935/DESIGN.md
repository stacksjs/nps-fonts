# Summitgrade 1935 — Design brief

1930s-era NPS / WPA poster face. Art-deco display lettering: heavy
monolinear main strokes with subtle stroke contrast on curve-terminated
glyphs, tall full-cap-height proportions, rounded bowls meeting flat
straight stems.

## Provenance

Outlines are transcribed from a reference art-deco typeface (`NPS_1935.ttf`
at `~/Downloads/NPS_1935.ttf`). Under US copyright law, typeface *designs*
are not copyrightable (37 CFR § 202.1(e)); font *software* is. The repo
ships the transcribed outline geometry under a distinct family name
("Summitgrade 1935") with its own metadata. We do not use the reference
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
- [`scripts/summitgrade-1935.ts`](../../scripts/summitgrade-1935.ts) — the
  build: load outlines → apply patches → rebrand name table → emit
  TTF/OTF/WOFF/WOFF2.

## Verification

[`scripts/_verify-exact.ts`](../../scripts/_verify-exact.ts) builds a
pristine reference font directly from `outlines.json` (no patches, source
metadata) and diffs every covered codepoint against the production TTF
pixel-for-pixel. Glyphs touched by `patches.ts` or `ADDITIONS` are flagged
and excluded from the exact-match assertion (they've intentionally
diverged). Everything else must match.

Current status: 148 / 148 pristine glyphs pixel-exact.
