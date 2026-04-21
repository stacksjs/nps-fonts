/**
 * NPS 2026 — per-glyph patches.
 *
 * Each entry targets a glyph by `name` (the same name used in the extracted
 * outlines.json). Patches apply in order after the pristine outlines are
 * loaded and before the font is written. Glyphs not listed here remain
 * byte-equivalent to the reference extraction.
 *
 * Supported operations (compose freely in one entry):
 *
 *   - `translate: { dx, dy }`       shift all contour points + bbox
 *   - `scale: { sx, sy, origin? }`  scale points relative to origin (default 0,0)
 *   - `advanceWidth: number`        set the advance width in em units
 *   - `leftSideBearing: number`     set LSB in em units (does NOT move points)
 *   - `setContours: Contour[]`      replace the outline entirely
 *   - `mapContours: (c) => c`       arbitrary transform on the contour array
 *
 * Additions (new glyphs not in the source) go in `ADDITIONS` below.
 */

export interface Point { x: number; y: number; onCurve: boolean }
export type Contour = Point[]

export interface GlyphPatch {
  translate?: { dx: number; dy: number }
  scale?: { sx: number; sy: number; origin?: { x: number; y: number } }
  advanceWidth?: number
  leftSideBearing?: number
  setContours?: Contour[]
  mapContours?: (contours: Contour[]) => Contour[]
}

export interface GlyphAddition {
  name: string
  unicode: number[]
  advanceWidth: number
  leftSideBearing?: number
  contours: Contour[]
}

/**
 * Glyph patches keyed by source glyph name. See `outlines.json` for names.
 * Examples (commented out — add your own as needed):
 *
 *   S: { advanceWidth: 1650 },                 // widen the S
 *   a: { translate: { dx: 0, dy: 20 } },       // nudge 'a' up 20 em units
 *   ampersand: {
 *     setContours: [[{x:0,y:0,onCurve:true}, ...]]
 *   },
 */
export const PATCHES: Record<string, GlyphPatch> = {
}

/**
 * Brand-new glyphs to add on top of the source. Useful for codepoints the
 * reference doesn't cover (e.g., en-dash, smart quotes, ellipsis).
 */
export const ADDITIONS: GlyphAddition[] = [
]
