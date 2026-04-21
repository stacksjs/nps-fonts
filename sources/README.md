# Sources

The "source of truth" for each family is the TypeScript drawing script
in `scripts/<family>.ts` plus the shared primitives declared inline in
each script. This directory holds **design briefs** — the human
references and proportions that the drawing scripts target.

| Family               | Brief                                                         |
| -------------------- | ------------------------------------------------------------- |
| NPS 2026     | [`nps-2026/DESIGN.md`](./nps-2026/DESIGN.md)  |
| Redwood Serif        | [`redwood-serif/DESIGN.md`](./redwood-serif/DESIGN.md)        |
| Campmate Script      | [`campmate-script/DESIGN.md`](./campmate-script/DESIGN.md)    |

The NPS Symbols pictograph font has no design brief — see
[`../scripts/symbols.ts`](../scripts/symbols.ts) for the glyph code.

When iterating on a glyph, prefer drawing in your editor of choice
(Glyphs, FontForge, Illustrator), then port the shapes back to the
drawing script.
