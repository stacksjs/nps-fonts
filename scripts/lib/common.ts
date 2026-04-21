/**
 * Constants shared across families.
 */

export const UPM = 1000

// Vertical metrics (shared across the John Muir families to make pairing trivial).
export const ASCENDER = 800
export const DESCENDER = -200
export const CAP_HEIGHT = 700
export const X_HEIGHT = 500

export const DEFAULT_LSB = 60
export const DEFAULT_RSB = 60

export type WeightName = 'Light' | 'Regular' | 'Medium' | 'Bold' | 'Black'

/** OS/2 weight class per CSS spec. */
export const WEIGHT_CLASS: Record<WeightName, number> = {
  Light: 300,
  Regular: 400,
  Medium: 500,
  Bold: 700,
  Black: 900,
}

/** Default stroke thickness (em units) per weight, used by the parametric drawer. */
export const STROKE: Record<WeightName, number> = {
  Light: 50,
  Regular: 80,
  Medium: 100,
  Bold: 140,
  Black: 180,
}

export interface CharsetEntry {
  name: string
  unicode: number
}

const range = (start: number, end: number, prefix?: string): CharsetEntry[] => {
  const out: CharsetEntry[] = []
  for (let cp = start; cp <= end; cp++) {
    out.push({ name: prefix ? `${prefix}${cp}` : String.fromCodePoint(cp), unicode: cp })
  }
  return out
}

const DIGIT_NAMES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
] as const

const PUNCT_NAMES: Record<number, string> = {
  0x0020: 'space',
  0x0021: 'exclam',
  0x0022: 'quotedbl',
  0x0023: 'numbersign',
  0x0024: 'dollar',
  0x0025: 'percent',
  0x0026: 'ampersand',
  0x0027: 'quotesingle',
  0x0028: 'parenleft',
  0x0029: 'parenright',
  0x002A: 'asterisk',
  0x002B: 'plus',
  0x002C: 'comma',
  0x002D: 'hyphen',
  0x002E: 'period',
  0x002F: 'slash',
  0x003A: 'colon',
  0x003B: 'semicolon',
  0x003C: 'less',
  0x003D: 'equal',
  0x003E: 'greater',
  0x003F: 'question',
  0x0040: 'at',
  0x005B: 'bracketleft',
  0x005C: 'backslash',
  0x005D: 'bracketright',
  0x005E: 'asciicircum',
  0x005F: 'underscore',
  0x0060: 'grave',
  0x007B: 'braceleft',
  0x007C: 'bar',
  0x007D: 'braceright',
  0x007E: 'asciitilde',
}

// Latin-1 Supplement glyph names (U+00A0–U+00FF) — only entries we draw.
const LATIN1_NAMES: Record<number, string> = {
  0x00A0: 'space', // nbsp reuses 'space'
  0x00A1: 'exclamdown',
  0x00A2: 'cent',
  0x00A3: 'sterling',
  0x00A5: 'yen',
  0x00A7: 'section',
  0x00A9: 'copyright',
  0x00AE: 'registered',
  0x00B0: 'degree',
  0x00B1: 'plusminus',
  0x00B5: 'micro',
  0x00B6: 'paragraph',
  0x00B7: 'middot',
  0x00BF: 'questiondown',
  0x00C0: 'Agrave', 0x00C1: 'Aacute', 0x00C2: 'Acircumflex', 0x00C3: 'Atilde',
  0x00C4: 'Adieresis', 0x00C5: 'Aring', 0x00C6: 'AE', 0x00C7: 'Ccedilla',
  0x00C8: 'Egrave', 0x00C9: 'Eacute', 0x00CA: 'Ecircumflex', 0x00CB: 'Edieresis',
  0x00CC: 'Igrave', 0x00CD: 'Iacute', 0x00CE: 'Icircumflex', 0x00CF: 'Idieresis',
  0x00D1: 'Ntilde',
  0x00D2: 'Ograve', 0x00D3: 'Oacute', 0x00D4: 'Ocircumflex', 0x00D5: 'Otilde',
  0x00D6: 'Odieresis', 0x00D8: 'Oslash',
  0x00D9: 'Ugrave', 0x00DA: 'Uacute', 0x00DB: 'Ucircumflex', 0x00DC: 'Udieresis',
  0x00DD: 'Yacute',
  0x00DF: 'germandbls',
  0x00E0: 'agrave', 0x00E1: 'aacute', 0x00E2: 'acircumflex', 0x00E3: 'atilde',
  0x00E4: 'adieresis', 0x00E5: 'aring', 0x00E6: 'ae', 0x00E7: 'ccedilla',
  0x00E8: 'egrave', 0x00E9: 'eacute', 0x00EA: 'ecircumflex', 0x00EB: 'edieresis',
  0x00EC: 'igrave', 0x00ED: 'iacute', 0x00EE: 'icircumflex', 0x00EF: 'idieresis',
  0x00F1: 'ntilde',
  0x00F2: 'ograve', 0x00F3: 'oacute', 0x00F4: 'ocircumflex', 0x00F5: 'otilde',
  0x00F6: 'odieresis', 0x00F8: 'oslash',
  0x00F9: 'ugrave', 0x00FA: 'uacute', 0x00FB: 'ucircumflex', 0x00FC: 'udieresis',
  0x00FD: 'yacute', 0x00FF: 'ydieresis',
}

export const CHARSET: CharsetEntry[] = (() => {
  const entries: CharsetEntry[] = []
  for (let cp = 0x0020; cp <= 0x007E; cp++) {
    if (cp >= 0x0030 && cp <= 0x0039) {
      entries.push({ name: DIGIT_NAMES[cp - 0x0030]!, unicode: cp })
    }
    else if (cp >= 0x0041 && cp <= 0x005A) {
      entries.push({ name: String.fromCodePoint(cp), unicode: cp })
    }
    else if (cp >= 0x0061 && cp <= 0x007A) {
      entries.push({ name: String.fromCodePoint(cp), unicode: cp })
    }
    else if (cp in PUNCT_NAMES) {
      entries.push({ name: PUNCT_NAMES[cp]!, unicode: cp })
    }
  }
  // NBSP — same shape as space, separate codepoint
  entries.push({ name: 'space', unicode: 0x00A0 })
  for (const cp of Object.keys(LATIN1_NAMES).map(Number).sort((a, b) => a - b)) {
    if (cp === 0x00A0) continue // already added above
    entries.push({ name: LATIN1_NAMES[cp]!, unicode: cp })
  }
  return entries
})()

// De-duplicate glyph names (multiple codepoints can map to one glyph, e.g. NBSP→space).
// The font-writer handles that via opentype.js's glyph cmap which supports multiple unicodes per glyph.

/** Glyphs keyed by codepoint for quick lookup. */
export const CHARSET_BY_CP: Map<number, CharsetEntry> = new Map(
  CHARSET.map(e => [e.unicode, e]),
)

export const ALL_FAMILIES = [
  'nps-2026',
  'redwood-serif',
  'campmate-script',
  'nps-symbols',
] as const

export type FamilyId = (typeof ALL_FAMILIES)[number]

export interface FamilyMeta {
  /** Human display name. */
  display: string
  /** Output filename stem (no extension, no weight suffix). */
  file: string
  /** Short genre / one-liner for the specimen site and README. */
  tagline: string
  /** Hero display string. */
  hero: string
  /** Pangram/sample string for specimen waterfalls. */
  pangram: string
  /** CSS weight — all current families are single-weight (400). */
  weight: number
  /** `font-style` value. */
  style: 'normal' | 'italic'
}

export const FAMILY_DISPLAY: Record<FamilyId, FamilyMeta> = {
  'nps-2026': {
    display: 'NPS 2026',
    file: 'NPS_2026',
    tagline: '1930s NPS / WPA display face — art-deco geometry, variable weight 100–900.',
    hero: 'NPS 2026',
    pangram: 'CRATER LAKE · EST 1902 · ELEV 7100 FT',
    weight: 400,
    style: 'normal',
  },
  'redwood-serif': {
    display: 'Redwood Serif',
    file: 'RedwoodSerif',
    tagline: 'Old-style serif with bracketed serifs and stroke contrast — John Muir field-journal warmth.',
    hero: 'Redwood',
    pangram: 'The mountains are calling and I must go.',
    weight: 400,
    style: 'normal',
  },
  'campmate-script': {
    display: 'Campmate Script',
    file: 'CampmateScript',
    tagline: 'Soft rounded upright script with ligatures — perfectly imperfect trailhead lettering.',
    hero: 'Campmate',
    pangram: 'Welcome to Crooked River Camp',
    weight: 400,
    style: 'normal',
  },
  'nps-symbols': {
    display: 'NPS Symbols',
    file: 'NPSSymbols',
    tagline: 'Original parametric pictograph icon font — 23 NPS-themed symbols.',
    hero: 'AMTFP',
    pangram: 'AMTFPCSLW*BHODX',
    weight: 400,
    style: 'normal',
  },
}

const PARAMETRIC_SET: ReadonlySet<FamilyId> = new Set<FamilyId>([
  'nps-2026',
  'redwood-serif',
  'campmate-script',
  'nps-symbols',
])

/** Families that are forked from an upstream OFL source. (None remain — all four families are drawn from scratch.) */
export const FORKED_FAMILIES = ALL_FAMILIES.filter(f => !PARAMETRIC_SET.has(f)) as readonly FamilyId[]

/** Families built parametrically from scratch (no upstream source). */
export const PARAMETRIC_FAMILIES: readonly FamilyId[] = [...PARAMETRIC_SET]
