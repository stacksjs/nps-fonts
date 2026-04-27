# Campmate Script — Design brief

A rounded upright script with brush-style contrast. Hand-painted
trailhead board lettering. Ships with 19 OpenType `liga` ligatures
designed into the source.

## Metrics

| Metric     | Value (em units, UPM 1000) |
| ---------- | -------------------------- |
| Cap height | 626                        |
| x-height   | 435                        |
| Ascender   | 763                        |
| Descender  | -200                       |
| Weight     | 400 (Regular)              |

## Ligatures

The source ships 19 designer-drawn ligature glyphs named with the
suffix `.liga` (e.g. `oo.liga`, `ll.liga`, `oss.liga`). The
[`_extract-source.ts`](../../scripts/_extract-source.ts) extractor
preserves the ligature glyph outlines but not the GSUB layout tables
(`ts-fonts` does not yet model GSUB — it's on the TODO list).

[`scripts/campmate-script.ts`](../../scripts/campmate-script.ts)
reconstructs the GSUB `liga` feature at OTF-write time by parsing
each ligature glyph name back into its component letters and
registering an opentype.js substitution rule. So `oo` → `oo.liga`,
`ll` → `ll.liga`, `oss` → `oss.liga`, etc.

To enable in CSS:

```css
font-family: "Campmate Script";
font-feature-settings: "liga" on;
/* or use the shorthand: */
font-variant-ligatures: common-ligatures;
```

## Build

Source files:

- [`outlines.json`](./outlines.json) — pristine per-glyph snapshot.
  Generated once by
  [`scripts/_extract-source.ts`](../../scripts/_extract-source.ts).
- [`scripts/campmate-script.ts`](../../scripts/campmate-script.ts) —
  load outlines, brand the name table, emit OTF/TTF/WOFF/WOFF2 via
  [`scripts/lib/extracted.ts`](../../scripts/lib/extracted.ts).
  WOFF/WOFF2 are wrapped from the OTF (which carries the GSUB
  ligature table) so browser-side ligatures work out of the box.
