# Contributing to NPS Fonts

Type design is slow, iterative, opinionated work. There is room for help
at every level — from polishing one glyph in one weight, to extending
language coverage, to building tooling. Welcome.

## Ground rules

1. **OFL all the way down.** Every contribution is licensed under the
   [SIL Open Font License 1.1](./OFL.txt). By submitting a PR you confirm
   you have the right to release the work under the OFL.
2. **No unattributed copying.** Do not copy outlines from proprietary
   typefaces. Do not import outlines from another OFL font without
   updating `FONTLOG.txt`, `AUTHORS.md`, and the in-font copyright string
   per the OFL terms.
3. **Reserved Font Names.** Modified versions distributed under a
   different name must not use *NPS 2026*, *Redwood Serif*,
   *Campmate Script*, or *NPS Symbols* as primary font names —
   that is a Reserved Font Name protection under the OFL.

## Getting set up

```bash
git clone https://github.com/national-park-service/fonts.git
cd nps-fonts
bun install
bun run build       # builds all families, all formats
bun run check       # sanity-checks built fonts
bun run web         # builds the specimen site locally
```

You will need:

- [Bun](https://bun.sh) 1.1+
- A font editor is **optional** — sources are TypeScript drawing scripts.
  If you'd rather work in [Glyphs](https://glyphsapp.com) /
  [FontForge](https://fontforge.org), the built `.otf` is your starting
  point; export changes back into the per-family drawing script.

## Workflow

1. Open an issue describing what you want to change (glyph, weight,
   feature, language coverage). Coordinate before drawing — concurrent
   edits to the same glyph create painful merges.
2. Branch off `main`.
3. Edit the relevant drawing script under `scripts/<family>.ts`
   (or the design notes under `sources/<family>/`).
4. Run `bun run build:family <family>` to regenerate binaries.
5. Run `bun run check` and address any new findings.
6. Open a PR. Include before/after PNGs of the affected glyphs in the
   PR description.

## Style guidance per family

See `sources/<family>/DESIGN.md` for the design brief and target
proportions of each family.

## What needs help right now

- **Drawing.** The v0.0.1 outlines are procedurally generated and need
  real type design. Pick a glyph, pick a family, and draw.
- **Kerning.** Mostly nonexistent in v0.0.1.
- **OpenType features.** Ligatures, alternates, small caps, fractions.
- **Hinting.** Especially on TTF for Windows rendering.
- **Language coverage.** Latin-Extended-A and -B, then expand from
  there.

## Code of conduct

Be kind. Assume good faith. Report problems to the maintainers.
