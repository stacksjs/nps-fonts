import opentype from 'opentype.js'

const family = Bun.argv[2] ?? 'summitgrade-1935'
const file = Bun.argv[3] ?? 'Summitgrade1935-Regular.otf'
const text = Bun.argv[4] ?? '0123456789 — 14.7 MI'

const buf = await Bun.file(`/Users/chrisbreuer/Code/nps-fonts/fonts/${family}/otf/${file}`).arrayBuffer()
const f = opentype.parse(buf)

for (const c of [...text]) {
  const g = f.charToGlyph(c)
  const bb = g.path.getBoundingBox()
  const pathW = (bb.x2 - bb.x1).toFixed(0)
  const overhang = (bb.x2 - g.advanceWidth).toFixed(0)
  console.log(`U+${c.charCodeAt(0).toString(16).padStart(4, '0')} '${c}' adv=${g.advanceWidth} xMin=${bb.x1.toFixed(0)} xMax=${bb.x2.toFixed(0)} w=${pathW} overhangR=${overhang}`)
}
