#!/usr/bin/env bun
/**
 * Redwood Serif — a warm, bookish transitional serif inspired by
 * Plantin, Rawlinson Next (which NPS uses), and early 1910s book faces.
 * Drawn from scratch with opentype.js. Substantial bracketed slab feet,
 * two-storey 'a', loop-descender 'g', curved-leg R, park-field-journal
 * warmth. Think NPS Unigrid posters and ranger-station handbooks — not
 * Art Deco, not geometric.
 *
 * Primitives (rect / ellipse / legStroke / halfRing / slabSerif) are
 * shared with Summitgrade 1935 so every glyph is a simple union of
 * closed sub-paths. No concave sweep brackets — the fillet is just a
 * small rect at each stem/slab join.
 *
 * Coverage: A-Z, a-z, 0-9, common punctuation. Single weight.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { sfntToWoff } from './lib/woff.ts'

const wawoff2 = await import('wawoff2')

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'redwood-serif')

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const UPM = 1000
const CAP = 700
const XH = 500                   // bookish large x-height
const ASCENDER = 720             // ascender reaches just above CAP
const DESCENDER = -200
const STEM = 105                 // heavy vertical stem for bookish weight
const THIN = 50                  // thin stroke (~2.1 : 1 contrast)
const LC_STEM = 96               // lowercase stem slightly lighter
const LC_THIN = 48
const LSB = 90
const RSB = 90
const KAPPA = 0.5522847498307936

// Serif geometry (simple slab with tiny fillet rects on each side)
const SERIF_H = 36               // slab height at foot/head
const SERIF_EXT = 50             // outward overshoot each side
const FILLET = 6                 // tiny chamfer height at slab/stem junction
const OV = 3                     // overlap fudge for joins

// Lowercase serif geometry (a little shorter)
const LC_SERIF_H = 32
const LC_SERIF_EXT = 42

// Crossbar heights (transitional — moderate)
const H_BAR_Y = CAP * 0.50
const A_BAR_Y = CAP * 0.32
const E_BAR_Y = CAP * 0.48

// ---------------------------------------------------------------------------
// Primitives — shared with Summitgrade 1935
// ---------------------------------------------------------------------------

function rect(p: opentype.Path, x: number, y: number, w: number, h: number) {
  p.moveTo(x, y)
  p.lineTo(x + w, y)
  p.lineTo(x + w, y + h)
  p.lineTo(x, y + h)
  p.close()
}

function ellipse(p: opentype.Path, cx: number, cy: number, rx: number, ry: number, hole = false) {
  const kx = rx * KAPPA, ky = ry * KAPPA
  if (!hole) {
    p.moveTo(cx + rx, cy)
    p.curveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
    p.curveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
    p.curveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
    p.curveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
  }
  else {
    p.moveTo(cx + rx, cy)
    p.curveTo(cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry)
    p.curveTo(cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy)
    p.curveTo(cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry)
    p.curveTo(cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy)
  }
  p.close()
}

function legStroke(p: opentype.Path, xBottom: number, xTop: number, yBottom: number, yTop: number, w: number) {
  const halfW = w / 2
  p.moveTo(xBottom - halfW, yBottom)
  p.lineTo(xBottom + halfW, yBottom)
  p.lineTo(xTop + halfW, yTop)
  p.lineTo(xTop - halfW, yTop)
  p.close()
}

function halfRing(p: opentype.Path, cx: number, cy: number, rx: number, ry: number, w: number, side: 'right' | 'left' | 'top' | 'bottom') {
  const k = KAPPA
  const irx = Math.max(0, rx - w)
  const iry = Math.max(0, ry - w)
  const hollow = irx > 0 && iry > 0
  if (side === 'right') {
    if (hollow) {
      p.moveTo(cx, cy - ry)
      p.curveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy)
      p.curveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry)
      p.lineTo(cx, cy + iry)
      p.curveTo(cx + irx * k, cy + iry, cx + irx, cy + iry * k, cx + irx, cy)
      p.curveTo(cx + irx, cy - iry * k, cx + irx * k, cy - iry, cx, cy - iry)
      p.lineTo(cx, cy - ry)
      p.close()
    }
    else {
      p.moveTo(cx, cy + ry)
      p.lineTo(cx, cy - ry)
      p.curveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy)
      p.curveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry)
      p.close()
    }
  }
  else if (side === 'left') {
    if (hollow) {
      p.moveTo(cx, cy + ry)
      p.curveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy)
      p.curveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry)
      p.lineTo(cx, cy - iry)
      p.curveTo(cx - irx * k, cy - iry, cx - irx, cy - iry * k, cx - irx, cy)
      p.curveTo(cx - irx, cy + iry * k, cx - irx * k, cy + iry, cx, cy + iry)
      p.lineTo(cx, cy + ry)
      p.close()
    }
    else {
      p.moveTo(cx, cy - ry)
      p.lineTo(cx, cy + ry)
      p.curveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy)
      p.curveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry)
      p.close()
    }
  }
  else if (side === 'top') {
    if (hollow) {
      p.moveTo(cx + rx, cy)
      p.curveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry)
      p.curveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy)
      p.lineTo(cx - irx, cy)
      p.curveTo(cx - irx, cy + iry * k, cx - irx * k, cy + iry, cx, cy + iry)
      p.curveTo(cx + irx * k, cy + iry, cx + irx, cy + iry * k, cx + irx, cy)
      p.lineTo(cx + rx, cy)
      p.close()
    }
    else {
      p.moveTo(cx + rx, cy)
      p.curveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry)
      p.curveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy)
      p.lineTo(cx + rx, cy)
      p.close()
    }
  }
  else {
    if (hollow) {
      p.moveTo(cx - rx, cy)
      p.curveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry)
      p.curveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy)
      p.lineTo(cx + irx, cy)
      p.curveTo(cx + irx, cy - iry * k, cx + irx * k, cy - iry, cx, cy - iry)
      p.curveTo(cx - irx * k, cy - iry, cx - irx, cy - iry * k, cx - irx, cy)
      p.lineTo(cx - rx, cy)
      p.close()
    }
    else {
      p.moveTo(cx - rx, cy)
      p.curveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry)
      p.curveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy)
      p.lineTo(cx - rx, cy)
      p.close()
    }
  }
}

// Simple bracketed slab serif drawn as a rectangle with two tiny "fillet"
// corner rects that soften the slab→stem junction. No concave sweeps,
// no cubic brackets — just plain rects, which keeps the union artifact-free.
// `side` is 'top' or 'bottom'. The slab itself sits at `atY` (baseline for
// bottom, cap-top for top). The fillet rects sit between the stem edge and
// where the slab overhangs begin.
function slabSerif(
  p: opentype.Path,
  cx: number,
  stemW: number,
  atY: number,
  opts: { side?: 'top' | 'bottom', extL?: number, extR?: number, height?: number, filletL?: boolean, filletR?: boolean } = {},
) {
  const side = opts.side ?? 'bottom'
  const extL = opts.extL ?? SERIF_EXT
  const extR = opts.extR ?? SERIF_EXT
  const h = opts.height ?? SERIF_H
  const stemL = cx - stemW / 2
  const stemR = cx + stemW / 2
  const leftX = stemL - extL
  const rightX = stemR + extR
  const fillet = Math.min(FILLET, h - 2)

  if (side === 'bottom') {
    // Main slab rect at baseline.
    rect(p, leftX, atY, rightX - leftX, h)
    // Tiny fillet chamfers (small wedge-ish rects) sitting just above the
    // slab, abutting the stem on each side. These soften the 90-degree
    // junction into a bookish bracket without using cubic curves.
    if ((opts.filletL ?? true) && extL > 0) {
      // Step rect: 8 wide × fillet tall, hugging the outer side of the stem.
      rect(p, stemL - Math.min(extL * 0.45, 14), atY + h - OV, Math.min(extL * 0.45, 14), fillet + OV)
    }
    if ((opts.filletR ?? true) && extR > 0) {
      rect(p, stemR, atY + h - OV, Math.min(extR * 0.45, 14), fillet + OV)
    }
  }
  else {
    // Top slab: atY is the TOP of the slab.
    rect(p, leftX, atY - h, rightX - leftX, h)
    if ((opts.filletL ?? true) && extL > 0) {
      rect(p, stemL - Math.min(extL * 0.45, 14), atY - h - fillet, Math.min(extL * 0.45, 14), fillet + OV)
    }
    if ((opts.filletR ?? true) && extR > 0) {
      rect(p, stemR, atY - h - fillet, Math.min(extR * 0.45, 14), fillet + OV)
    }
  }
}

// Bowl from a stem's right edge: used on B, D, P, R, and lowercase.
function drawBowl(p: opentype.Path, stemRightX: number, bottomY: number, w: number, h: number, stroke: number) {
  const cy = bottomY + h / 2
  const rx = w
  const ry = h / 2
  const k = KAPPA
  const irx = Math.max(0, rx - stroke)
  const iry = Math.max(0, ry - stroke * 0.9)
  if (irx > 0 && iry > 0) {
    p.moveTo(stemRightX, cy - ry)
    p.curveTo(stemRightX + rx * k, cy - ry, stemRightX + rx, cy - ry * k, stemRightX + rx, cy)
    p.curveTo(stemRightX + rx, cy + ry * k, stemRightX + rx * k, cy + ry, stemRightX, cy + ry)
    p.lineTo(stemRightX, cy + iry)
    p.curveTo(stemRightX + irx * k, cy + iry, stemRightX + irx, cy + iry * k, stemRightX + irx, cy)
    p.curveTo(stemRightX + irx, cy - iry * k, stemRightX + irx * k, cy - iry, stemRightX, cy - iry)
    p.lineTo(stemRightX, cy - ry)
    p.close()
  }
  else {
    p.moveTo(stemRightX, cy + ry)
    p.lineTo(stemRightX, cy - ry)
    p.curveTo(stemRightX + rx * k, cy - ry, stemRightX + rx, cy - ry * k, stemRightX + rx, cy)
    p.curveTo(stemRightX + rx, cy + ry * k, stemRightX + rx * k, cy + ry, stemRightX, cy + ry)
    p.close()
  }
}

// U-bottom bowl: for U and lowercase u.
function drawBottomBowl(p: opentype.Path, leftX: number, rightX: number, topY: number, depth: number, stroke: number) {
  const cx = (leftX + rightX) / 2
  const rx = (rightX - leftX) / 2
  const ry = depth
  const k = KAPPA
  const irx = Math.max(0, rx - stroke)
  const iry = Math.max(0, ry - stroke)
  if (irx > 0 && iry > 0) {
    p.moveTo(leftX, topY)
    p.curveTo(leftX, topY - ry * k, cx - rx * k, topY - ry, cx, topY - ry)
    p.curveTo(cx + rx * k, topY - ry, rightX, topY - ry * k, rightX, topY)
    p.lineTo(rightX - stroke, topY)
    p.curveTo(rightX - stroke, topY - iry * k, cx + irx * k, topY - iry, cx, topY - iry)
    p.curveTo(cx - irx * k, topY - iry, leftX + stroke, topY - iry * k, leftX + stroke, topY)
    p.lineTo(leftX, topY)
    p.close()
  }
  else {
    p.moveTo(leftX, topY)
    p.curveTo(leftX, topY - ry * k, cx - rx * k, topY - ry, cx, topY - ry)
    p.curveTo(cx + rx * k, topY - ry, rightX, topY - ry * k, rightX, topY)
    p.lineTo(leftX, topY)
    p.close()
  }
}

// Stressed ellipse ring — slight vertical stress (bookish transitional).
function stressedRing(p: opentype.Path, cx: number, cy: number, rx: number, ry: number, stroke: number) {
  ellipse(p, cx, cy, rx, ry)
  const irx = Math.max(1, rx - stroke * 0.95)
  const iry = Math.max(1, ry - stroke * 0.75)
  ellipse(p, cx, cy, irx, iry, true)
}

// Small teardrop / ball terminal (for a, c, f, r, etc.).
function dropTerminal(p: opentype.Path, cx: number, cy: number, w: number, h: number) {
  ellipse(p, cx, cy, w / 2, h / 2)
}

// ---------------------------------------------------------------------------
// Glyph drawers
// ---------------------------------------------------------------------------

interface GlyphResult { advance: number }
type Drawer = (p: opentype.Path) => GlyphResult

const WIDE_W = CAP * 1.04
const ROUND_W = CAP * 0.82

// ---------------------------------------------------------------------------
// A — solid apex (pointy), crossbar at 0.32 CAP, flared slab feet.
// ---------------------------------------------------------------------------
const A: Drawer = (p) => {
  const w = CAP * 0.92
  const x0 = LSB
  const cx = x0 + w / 2
  const apexY = CAP
  const apexFlatHalf = 12
  const leftDia = THIN + 24
  const rightDia = STEM

  // Left (thin) and right (heavy) diagonals — old-style contrast.
  legStroke(p, x0 + leftDia * 0.5, cx - apexFlatHalf, 0, apexY, leftDia)
  legStroke(p, x0 + w - rightDia * 0.5, cx + apexFlatHalf, 0, apexY, rightDia)

  // Tiny flat apex cap so the peak isn't a needle.
  rect(p, cx - apexFlatHalf - 4, apexY - 14, apexFlatHalf * 2 + 8, 14)

  // Crossbar spanning the inner diagonal edges.
  const barY = A_BAR_Y
  const slopeL = (cx - apexFlatHalf - (x0 + leftDia * 0.5)) / apexY
  const slopeR = ((x0 + w - rightDia * 0.5) - (cx + apexFlatHalf)) / apexY
  const innerL = (x0 + leftDia * 0.5) + slopeL * barY + leftDia * 0.5 - 6
  const innerR = (x0 + w - rightDia * 0.5) - slopeR * barY - rightDia * 0.5 + 6
  rect(p, innerL, barY, innerR - innerL, THIN + 18)

  // Slab feet — flare outward only (typical for serif A).
  slabSerif(p, x0 + leftDia * 0.5, leftDia, 0, { side: 'bottom', extL: SERIF_EXT - 6, extR: SERIF_EXT + 4 })
  slabSerif(p, x0 + w - rightDia * 0.5, rightDia, 0, { side: 'bottom', extL: SERIF_EXT + 4, extR: SERIF_EXT - 6 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// B — stem with stacked bowls, bottom bowl slightly wider.
// ---------------------------------------------------------------------------
const B: Drawer = (p) => {
  const w = CAP * 0.72
  const x0 = LSB
  const stemCx = x0 + STEM / 2

  rect(p, x0, 0, STEM, CAP)

  const upperBowlH = CAP * 0.50
  const upperBowlW = w - STEM - 14
  const lowerBowlH = CAP - upperBowlH
  const lowerBowlW = w - STEM
  drawBowl(p, x0 + STEM, CAP - upperBowlH, upperBowlW, upperBowlH, THIN + 40)
  drawBowl(p, x0 + STEM, 0, lowerBowlW, lowerBowlH, THIN + 40)

  slabSerif(p, stemCx, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 6, filletR: false })
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom', extL: SERIF_EXT, extR: 6, filletR: false })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// C — open bowl with short upper beak and small lower terminal.
// ---------------------------------------------------------------------------
const C: Drawer = (p) => {
  const w = ROUND_W
  const x0 = LSB
  const cx = x0 + w / 2
  const cy = CAP / 2
  const rx = w / 2
  const ry = CAP / 2
  const stroke = THIN + 42

  // Outer C ring — we draw a full ellipse hollow then chisel out the right
  // opening with a large rect positioned to the right of cx.
  ellipse(p, cx, cy, rx, ry)
  ellipse(p, cx, cy, rx - stroke, ry - stroke * 0.85, true)
  // Carve the right mouth opening.
  rect(p, cx + rx * 0.15, cy - ry * 0.55, rx, ry * 1.1)

  // Small beaked upper terminal (old-style spur at top-right of the bowl).
  rect(p, cx + rx * 0.15 - 12, CAP - stroke - 4, 20, stroke * 0.75)
  // Small lower terminal with a soft drop.
  dropTerminal(p, cx + rx * 0.35, stroke * 0.55, THIN + 30, THIN + 40)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// D — stem with full-height bowl.
// ---------------------------------------------------------------------------
const D: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  const stemCx = x0 + STEM / 2

  rect(p, x0, 0, STEM, CAP)
  drawBowl(p, x0 + STEM, 0, w - STEM, CAP, THIN + 42)

  slabSerif(p, stemCx, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 4, filletR: false })
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom', extL: SERIF_EXT, extR: 4, filletR: false })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// E — stem + 3 arms, serifs on top/bottom of stem.
// ---------------------------------------------------------------------------
const E: Drawer = (p) => {
  const w = CAP * 0.68
  const x0 = LSB
  const stemCx = x0 + STEM / 2
  const armH = THIN + 36

  rect(p, x0, 0, STEM, CAP)
  // Top and bottom arms.
  rect(p, x0, CAP - armH, w, armH)
  rect(p, x0, 0, w, armH)
  // Middle bar (slightly shorter).
  rect(p, x0, E_BAR_Y, w * 0.78, THIN + 28)

  slabSerif(p, stemCx, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 0 })
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom', extL: SERIF_EXT, extR: 0 })

  // End ticks on top & bottom arms (tiny downward/upward stubs).
  rect(p, x0 + w - 10, CAP - armH - 14, 10, 14)
  rect(p, x0 + w - 10, armH, 10, 14)
  // End tick on middle bar.
  rect(p, x0 + w * 0.78 - 4, E_BAR_Y - 10, 10, 10)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// F — like E minus the bottom arm.
// ---------------------------------------------------------------------------
const F: Drawer = (p) => {
  const w = CAP * 0.64
  const x0 = LSB
  const stemCx = x0 + STEM / 2
  const armH = THIN + 36

  rect(p, x0, 0, STEM, CAP)
  rect(p, x0, CAP - armH, w, armH)
  rect(p, x0, E_BAR_Y, w * 0.74, THIN + 28)

  slabSerif(p, stemCx, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 0 })
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom' })

  rect(p, x0 + w - 10, CAP - armH - 14, 10, 14)
  rect(p, x0 + w * 0.74 - 4, E_BAR_Y - 10, 10, 10)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// G — like C with a short inner spur and a small right shelf.
// ---------------------------------------------------------------------------
const G: Drawer = (p) => {
  const w = ROUND_W
  const x0 = LSB
  const cx = x0 + w / 2
  const cy = CAP / 2
  const rx = w / 2
  const ry = CAP / 2
  const stroke = THIN + 42

  ellipse(p, cx, cy, rx, ry)
  ellipse(p, cx, cy, rx - stroke, ry - stroke * 0.85, true)
  rect(p, cx + rx * 0.18, cy - ry * 0.2, rx, ry * 0.75)

  // Horizontal shelf bar at mid-height on the right.
  rect(p, cx + rx * 0.18 - 22, cy - 4, rx * 0.7, THIN + 24)
  // Vertical spur dropping from shelf to the lower bowl rim.
  rect(p, x0 + w - stroke, 0, stroke, cy + 8)

  // Upper beak terminal.
  rect(p, cx + rx * 0.18 - 12, CAP - stroke - 4, 20, stroke * 0.75)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// H — two stems with crossbar.
// ---------------------------------------------------------------------------
const H: Drawer = (p) => {
  const w = CAP * 0.84
  const x0 = LSB
  const cxL = x0 + STEM / 2
  const cxR = x0 + w - STEM / 2

  rect(p, x0, 0, STEM, CAP)
  rect(p, x0 + w - STEM, 0, STEM, CAP)
  rect(p, x0 + STEM - 2, H_BAR_Y - (THIN + 22) / 2, w - 2 * STEM + 4, THIN + 22)

  slabSerif(p, cxL, STEM, CAP, { side: 'top' })
  slabSerif(p, cxL, STEM, 0, { side: 'bottom' })
  slabSerif(p, cxR, STEM, CAP, { side: 'top' })
  slabSerif(p, cxR, STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// I — stem with big slab serifs.
// ---------------------------------------------------------------------------
const I: Drawer = (p) => {
  const cx = LSB + STEM / 2 + 10
  rect(p, cx - STEM / 2, 0, STEM, CAP)
  slabSerif(p, cx, STEM, CAP, { side: 'top', extL: SERIF_EXT + 6, extR: SERIF_EXT + 6 })
  slabSerif(p, cx, STEM, 0, { side: 'bottom', extL: SERIF_EXT + 6, extR: SERIF_EXT + 6 })
  return { advance: LSB + STEM + 20 + RSB }
}

// ---------------------------------------------------------------------------
// J — stem with top serif and a curved descent below baseline.
// ---------------------------------------------------------------------------
const J: Drawer = (p) => {
  const w = CAP * 0.56
  const x0 = LSB
  const stemCx = x0 + w - STEM / 2 - 10
  const hookBotY = -140
  const hookCY = hookBotY + STEM * 0.4

  // Main vertical stem (top slab down to a curve start).
  rect(p, stemCx - STEM / 2, hookCY, STEM, CAP - hookCY)
  // Bottom hook half-ring descending below baseline.
  halfRing(p, stemCx - (w * 0.38), hookCY, w * 0.42, (hookCY - hookBotY) + STEM * 0.3, STEM, 'bottom')

  slabSerif(p, stemCx, STEM, CAP, { side: 'top' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// K — stem with upper thin diagonal and lower thicker leg that flares.
// ---------------------------------------------------------------------------
const K: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  const stemCx = x0 + STEM / 2

  rect(p, x0, 0, STEM, CAP)
  const midY = CAP * 0.44

  // Upper arm — thin.
  legStroke(p, x0 + STEM - 4, x0 + w - THIN * 0.4, midY, CAP, THIN + 14)
  // Lower leg — thicker, flaring outward.
  legStroke(p, x0 + w + 6, x0 + STEM - 4, 0, midY, STEM - 10)

  // Small slab on upper arm end (down into bar).
  rect(p, x0 + w - 18, CAP - 20, 22, 20)
  // Slab foot on leg.
  slabSerif(p, x0 + w + 6, STEM - 10, 0, { side: 'bottom', extL: 14, extR: SERIF_EXT })

  slabSerif(p, stemCx, STEM, CAP, { side: 'top' })
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom', extR: 0 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// L — stem + bottom arm.
// ---------------------------------------------------------------------------
const L: Drawer = (p) => {
  const w = CAP * 0.68
  const x0 = LSB
  const stemCx = x0 + STEM / 2

  rect(p, x0, 0, STEM, CAP)
  rect(p, x0, 0, w, THIN + 36)

  slabSerif(p, stemCx, STEM, CAP, { side: 'top' })
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom', extR: 0 })
  rect(p, x0 + w - 10, THIN + 36, 10, 14)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// M — outer stems with inner diagonals to baseline.
// ---------------------------------------------------------------------------
const M: Drawer = (p) => {
  const w = WIDE_W
  const x0 = LSB
  const cxL = x0 + STEM / 2
  const cxR = x0 + w - STEM / 2

  rect(p, x0, 0, STEM, CAP)
  rect(p, x0 + w - STEM, 0, STEM, CAP)

  const cx = x0 + w / 2
  const dia = THIN + 28

  legStroke(p, cx - dia / 2 + OV, x0 + STEM + dia / 2 - OV, 0, CAP, dia)
  legStroke(p, cx + dia / 2 - OV, x0 + w - STEM - dia / 2 + OV, 0, CAP, dia)
  rect(p, cx - dia, 0, dia * 2, 6)

  slabSerif(p, cxL, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 0 })
  slabSerif(p, cxR, STEM, CAP, { side: 'top', extL: 0, extR: SERIF_EXT })
  slabSerif(p, cxL, STEM, 0, { side: 'bottom' })
  slabSerif(p, cxR, STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// N — stems with diagonal.
// ---------------------------------------------------------------------------
const N: Drawer = (p) => {
  const w = CAP * 0.84
  const x0 = LSB
  const cxL = x0 + STEM / 2
  const cxR = x0 + w - STEM / 2

  rect(p, x0, 0, STEM, CAP)
  rect(p, x0 + w - STEM, 0, STEM, CAP)
  legStroke(p, x0 + w - STEM + OV, x0 + STEM - OV, 0, CAP, THIN + 24)

  slabSerif(p, cxL, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, cxR, STEM, CAP, { side: 'top', extL: 5, extR: SERIF_EXT })
  slabSerif(p, cxL, STEM, 0, { side: 'bottom', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, cxR, STEM, 0, { side: 'bottom', extL: 5, extR: SERIF_EXT })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// O — stressed ring, bookish proportions.
// ---------------------------------------------------------------------------
const O: Drawer = (p) => {
  const w = ROUND_W
  const x0 = LSB
  const cx = x0 + w / 2
  stressedRing(p, cx, CAP / 2, w / 2, CAP / 2, THIN + 48)
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// P — stem with upper bowl.
// ---------------------------------------------------------------------------
const P: Drawer = (p) => {
  const w = CAP * 0.72
  const x0 = LSB
  const stemCx = x0 + STEM / 2

  rect(p, x0, 0, STEM, CAP)
  const bowlH = CAP * 0.52
  drawBowl(p, x0 + STEM, CAP - bowlH, w - STEM, bowlH, THIN + 40)

  slabSerif(p, stemCx, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 4, filletR: false })
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Q — O + short tail crossing bottom of bowl.
// ---------------------------------------------------------------------------
const Q: Drawer = (p) => {
  const w = ROUND_W
  const x0 = LSB
  const cx = x0 + w / 2
  stressedRing(p, cx, CAP / 2, w / 2, CAP / 2, THIN + 48)

  // Tail starts near center bottom of bowl, sweeps down-right past the
  // baseline and ring. Bookish: short, decisive, crossing through the bowl.
  const tailStartX = cx + w * 0.04
  const tailStartY = CAP * 0.10
  const tailEndX = x0 + w + 10
  const tailEndY = -80
  legStroke(p, tailEndX, tailStartX, tailEndY, tailStartY, THIN + 14)
  // Small end stub.
  rect(p, tailEndX - (THIN + 14) / 2, tailEndY, THIN + 14, 14)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// R — stem, upper bowl, curved/flared leg.
// ---------------------------------------------------------------------------
const R: Drawer = (p) => {
  const w = CAP * 0.80
  const x0 = LSB
  const stemCx = x0 + STEM / 2

  rect(p, x0, 0, STEM, CAP)
  const bowlH = CAP * 0.52
  drawBowl(p, x0 + STEM, CAP - bowlH, w - STEM, bowlH, THIN + 40)
  const junctionY = CAP - bowlH

  // Curved/tapered leg: thinner near the bowl junction, thicker at the base,
  // flaring a bit outward past x0 + w.
  const legFootX = x0 + w + 4
  const legTopX = x0 + STEM + 6
  const halfTop = (THIN + 16) / 2
  const halfBot = (STEM - 12) / 2
  p.moveTo(legFootX - halfBot, 0)
  p.lineTo(legFootX + halfBot, 0)
  p.lineTo(legTopX + halfTop, junctionY + OV)
  p.lineTo(legTopX - halfTop, junctionY + OV)
  p.close()

  slabSerif(p, stemCx, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 4, filletR: false })
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom' })
  slabSerif(p, legFootX, STEM - 12, 0, { side: 'bottom', extL: 10, extR: SERIF_EXT })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// S — classical S with top and bottom curves and a diagonal spine.
// ---------------------------------------------------------------------------
const S: Drawer = (p) => {
  const w = CAP * 0.68
  const x0 = LSB
  const cx = x0 + w / 2
  const rx = w / 2
  const ry = CAP * 0.28
  const upperCY = CAP - ry
  const lowerCY = ry
  const stroke = THIN + 40

  halfRing(p, cx, upperCY, rx, ry, stroke, 'top')
  halfRing(p, cx, lowerCY, rx, ry, stroke, 'bottom')
  legStroke(p, x0 + w - stroke * 0.45, x0 + stroke * 0.45, lowerCY - 4, upperCY + 4, stroke * 0.95)

  // Small drop terminals top-right and bottom-left for that bookish finish.
  dropTerminal(p, x0 + w - stroke / 2, upperCY + 6, THIN + 26, THIN + 36)
  dropTerminal(p, x0 + stroke / 2, lowerCY - 6, THIN + 26, THIN + 36)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// T — top bar + stem.
// ---------------------------------------------------------------------------
const T: Drawer = (p) => {
  const w = CAP * 0.80
  const x0 = LSB
  const barH = THIN + 36
  const stemCx = x0 + w / 2

  rect(p, x0, CAP - barH, w, barH)
  rect(p, stemCx - STEM / 2, 0, STEM, CAP - barH + OV)

  // End ticks drop down from bar.
  rect(p, x0, CAP - barH - 14, 14, 14)
  rect(p, x0 + w - 14, CAP - barH - 14, 14, 14)

  slabSerif(p, stemCx, STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// U — two stems + bottom bowl.
// ---------------------------------------------------------------------------
const U: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  const stemBottom = CAP * 0.28
  const cxL = x0 + STEM / 2
  const cxR = x0 + w - STEM / 2

  rect(p, x0, stemBottom, STEM, CAP - stemBottom)
  rect(p, x0 + w - STEM, stemBottom, STEM, CAP - stemBottom)
  drawBottomBowl(p, x0, x0 + w, stemBottom, stemBottom, THIN + 42)

  slabSerif(p, cxL, STEM, CAP, { side: 'top', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, cxR, STEM, CAP, { side: 'top', extL: 5, extR: SERIF_EXT })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// V — two diagonals meeting at baseline.
// ---------------------------------------------------------------------------
const V: Drawer = (p) => {
  const w = CAP * 0.88
  const x0 = LSB
  const cx = x0 + w / 2
  const diaL = STEM - 12       // left is heavy in old-style
  const diaR = THIN + 20

  legStroke(p, cx + OV, x0 + diaL / 2, 0, CAP, diaL)
  legStroke(p, cx - OV, x0 + w - diaR / 2, 0, CAP, diaR)
  rect(p, cx - diaL * 0.4, 0, diaL * 0.8, 6)

  slabSerif(p, x0 + diaL / 2, diaL, CAP, { side: 'top', extL: 26, extR: 22, height: 22 })
  slabSerif(p, x0 + w - diaR / 2, diaR, CAP, { side: 'top', extL: 22, extR: 26, height: 22 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// W — four diagonals, inner peak to cap top.
// ---------------------------------------------------------------------------
const W: Drawer = (p) => {
  const w = WIDE_W * 1.10
  const x0 = LSB
  const dia1 = STEM - 22
  const dia2 = THIN + 18
  const cx = x0 + w / 2
  const footL = x0 + w * 0.28
  const footR = x0 + w * 0.72

  legStroke(p, footL + OV, x0 + dia1 / 2, 0, CAP, dia1)
  legStroke(p, footL - OV, cx - dia2 / 2 + OV, 0, CAP, dia2)
  legStroke(p, footR + OV, cx + dia2 / 2 - OV, 0, CAP, dia2)
  legStroke(p, footR - OV, x0 + w - dia1 / 2, 0, CAP, dia1)
  rect(p, footL - dia1 * 0.4, 0, dia1 * 0.8, 6)
  rect(p, footR - dia1 * 0.4, 0, dia1 * 0.8, 6)
  rect(p, cx - dia2, CAP - 6, dia2 * 2, 6)

  slabSerif(p, x0 + dia1 / 2, dia1, CAP, { side: 'top', extL: 22, extR: 18, height: 20 })
  slabSerif(p, cx - dia2 / 2 + OV, dia2, CAP, { side: 'top', extL: 16, extR: 16, height: 20 })
  slabSerif(p, cx + dia2 / 2 - OV, dia2, CAP, { side: 'top', extL: 16, extR: 16, height: 20 })
  slabSerif(p, x0 + w - dia1 / 2, dia1, CAP, { side: 'top', extL: 18, extR: 22, height: 20 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// X — crossed diagonals with corner slab feet.
// ---------------------------------------------------------------------------
const X: Drawer = (p) => {
  const w = CAP * 0.84
  const x0 = LSB
  const dia1 = STEM - 14
  const dia2 = THIN + 18
  legStroke(p, x0, x0 + w, 0, CAP, dia1)
  legStroke(p, x0 + w, x0, 0, CAP, dia2)
  const cx = x0 + w / 2
  rect(p, cx - 20, CAP / 2 - 20, 40, 40)

  slabSerif(p, x0, dia1, 0, { side: 'bottom', extL: 28, extR: 22, height: 22 })
  slabSerif(p, x0 + w, dia1, 0, { side: 'bottom', extL: 22, extR: 28, height: 22 })
  slabSerif(p, x0, dia2, CAP, { side: 'top', extL: 28, extR: 22, height: 22 })
  slabSerif(p, x0 + w, dia2, CAP, { side: 'top', extL: 22, extR: 28, height: 22 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Y — two diagonals meet at mid-height, stem to baseline.
// ---------------------------------------------------------------------------
const Y: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  const cx = x0 + w / 2
  const peakY = CAP * 0.46
  const diaL = STEM - 18
  const diaR = THIN + 16

  legStroke(p, cx - diaL / 2 + OV, x0 + diaL / 2, peakY, CAP, diaL)
  legStroke(p, cx + diaR / 2 - OV, x0 + w - diaR / 2, peakY, CAP, diaR)
  rect(p, cx - STEM / 2, 0, STEM, peakY + OV)
  rect(p, cx - diaL * 0.5, peakY - OV, diaL, OV * 2)

  slabSerif(p, x0 + diaL / 2, diaL, CAP, { side: 'top', extL: 26, extR: 20, height: 22 })
  slabSerif(p, x0 + w - diaR / 2, diaR, CAP, { side: 'top', extL: 20, extR: 26, height: 22 })
  slabSerif(p, cx, STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Z — two bars + diagonal.
// ---------------------------------------------------------------------------
const Z: Drawer = (p) => {
  const w = CAP * 0.76
  const x0 = LSB
  const barH = THIN + 36
  rect(p, x0, CAP - barH, w, barH)
  rect(p, x0, 0, w, barH)
  legStroke(p, x0 + (THIN + 20) * 0.4, x0 + w - (THIN + 20) * 0.4, barH - OV, CAP - barH + OV, THIN + 38)

  // Terminal drops top-left and bottom-right.
  rect(p, x0, CAP - barH - 14, 16, 14)
  rect(p, x0 + w - 16, barH, 16, 14)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Lowercase helpers
// ---------------------------------------------------------------------------

// Slab foot for lowercase stems — uses LC_SERIF_* metrics.
function lcFoot(p: opentype.Path, cx: number, stemW: number, atY: number, opts: { side?: 'top' | 'bottom', extL?: number, extR?: number, filletL?: boolean, filletR?: boolean } = {}) {
  slabSerif(p, cx, stemW, atY, {
    side: opts.side ?? 'bottom',
    extL: opts.extL ?? LC_SERIF_EXT,
    extR: opts.extR ?? LC_SERIF_EXT,
    height: LC_SERIF_H,
    filletL: opts.filletL,
    filletR: opts.filletR,
  })
}

// Head serif (flag) for ascender stems — slanted rect on the left top.
function lcHeadSerif(p: opentype.Path, cx: number, stemW: number, top: number) {
  // Small slanted flag extending upward and to the left of the stem top.
  const flagW = LC_SERIF_EXT
  const flagH = 22
  legStroke(p, cx - stemW / 2 - flagW * 0.15, cx - stemW / 2 - flagW, top - 4, top + flagH, THIN + 18)
  // And a small slab under the flag along the top of the stem.
  rect(p, cx - stemW / 2 - 6, top - 6, stemW + 12, 12)
}

// drawLeftBowl — mirror of drawBowl. Closes onto a stem's LEFT edge. The
// outer rim goes CCW on the left half of the ellipse; the inner counter
// (if any) goes CW to punch out the bowl hollow.
function drawLeftBowl(p: opentype.Path, stemLeftX: number, bottomY: number, w: number, h: number, stroke: number) {
  const cy = bottomY + h / 2
  const rx = w
  const ry = h / 2
  const k = KAPPA
  const irx = Math.max(0, rx - stroke)
  const iry = Math.max(0, ry - stroke * 0.9)
  if (irx > 0 && iry > 0) {
    // Outer: bottom-at-stem, around left, to top-at-stem.
    p.moveTo(stemLeftX, cy + ry)
    p.curveTo(stemLeftX - rx * k, cy + ry, stemLeftX - rx, cy + ry * k, stemLeftX - rx, cy)
    p.curveTo(stemLeftX - rx, cy - ry * k, stemLeftX - rx * k, cy - ry, stemLeftX, cy - ry)
    // Inner: top-at-stem, around (smaller) left, back to bottom-at-stem.
    p.lineTo(stemLeftX, cy - iry)
    p.curveTo(stemLeftX - irx * k, cy - iry, stemLeftX - irx, cy - iry * k, stemLeftX - irx, cy)
    p.curveTo(stemLeftX - irx, cy + iry * k, stemLeftX - irx * k, cy + iry, stemLeftX, cy + iry)
    p.lineTo(stemLeftX, cy + ry)
    p.close()
  }
  else {
    p.moveTo(stemLeftX, cy + ry)
    p.curveTo(stemLeftX - rx * k, cy + ry, stemLeftX - rx, cy + ry * k, stemLeftX - rx, cy)
    p.curveTo(stemLeftX - rx, cy - ry * k, stemLeftX - rx * k, cy - ry, stemLeftX, cy - ry)
    p.lineTo(stemLeftX, cy + ry)
    p.close()
  }
}

// ---------------------------------------------------------------------------
// a — two-storey: upper small bowl + larger bottom bowl stacked on the right
//     stem. Both bowls are D-shapes that close back onto the stem's left edge.
// ---------------------------------------------------------------------------
const a: Drawer = (p) => {
  const w = XH * 1.12
  const x0 = LSB
  const stemX = x0 + w - LC_STEM
  const stemCx = stemX + LC_STEM / 2
  const stroke = LC_THIN + 34

  // Right stem — full x-height.
  rect(p, stemX, 0, LC_STEM, XH)

  // Upper (smaller) bowl — about 45% of x-height, attached to stem LEFT edge.
  const upperBowlH = XH * 0.48
  const upperBowlW = w - LC_STEM - 10
  drawLeftBowl(p, stemX, XH - upperBowlH, upperBowlW, upperBowlH, stroke)

  // Lower (larger) bowl — about 55% of x-height, also on stem LEFT edge.
  const lowerBowlH = XH * 0.58
  const lowerBowlW = w - LC_STEM
  drawLeftBowl(p, stemX, 0, lowerBowlW, lowerBowlH, stroke)

  // Foot serif on stem.
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom', extL: LC_SERIF_EXT * 0.6, extR: LC_SERIF_EXT })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// b — ascender stem + round bowl at x-height.
// ---------------------------------------------------------------------------
const b: Drawer = (p) => {
  const w = XH * 1.10
  const x0 = LSB
  const stemCx = x0 + LC_STEM / 2
  const stroke = LC_THIN + 36

  rect(p, x0, 0, LC_STEM, ASCENDER)

  // Bowl sits on the stem's right from baseline up to XH.
  const bowlH = XH
  drawBowl(p, x0 + LC_STEM, 0, w - LC_STEM, bowlH, stroke)

  // Top serif (flag-like) and foot serif on the stem.
  slabSerif(p, stemCx, LC_STEM, ASCENDER, { side: 'top', extL: LC_SERIF_EXT, extR: 0, height: 22 })
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom', extL: LC_SERIF_EXT, extR: 4 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// c — left half-ring (open on the right) with small beaked arms.
// ---------------------------------------------------------------------------
const c: Drawer = (p) => {
  const w = XH * 1.04
  const x0 = LSB
  const cx = x0 + w / 2
  const cy = XH / 2
  const rx = w / 2
  const ry = XH / 2
  const stroke = LC_THIN + 34

  halfRing(p, cx, cy, rx, ry, stroke, 'left')

  // Short top arm going right from the top of the half-ring.
  const armLen = w * 0.18
  rect(p, cx - 4, XH - stroke, armLen + 4, stroke)
  // Short bottom arm.
  rect(p, cx - 4, 0, armLen + 4, stroke)

  // Drop terminals.
  dropTerminal(p, cx + armLen, XH - stroke * 0.5, THIN + 20, THIN + 28)
  dropTerminal(p, cx + armLen, stroke * 0.5, THIN + 20, THIN + 28)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// d — ascender stem on right, bowl closed onto stem's LEFT edge.
// ---------------------------------------------------------------------------
const d: Drawer = (p) => {
  const w = XH * 1.12
  const x0 = LSB
  const stemX = x0 + w - LC_STEM
  const stemCx = stemX + LC_STEM / 2
  const stroke = LC_THIN + 36

  rect(p, stemX, 0, LC_STEM, ASCENDER)
  drawLeftBowl(p, stemX, 0, w - LC_STEM, XH, stroke)

  slabSerif(p, stemCx, LC_STEM, ASCENDER, { side: 'top', extL: 0, extR: LC_SERIF_EXT, height: 22 })
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom', extL: 4, extR: LC_SERIF_EXT })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// e — upper bowl closed at crossbar + open mouth below crossbar.
//     We split this into (a) a top half-ring forming the top of the bowl,
//     (b) a left half-ring filling the lower-left quadrant, (c) a crossbar
//     and top arm stitching them together, and (d) a small drop terminal.
// ---------------------------------------------------------------------------
const e: Drawer = (p) => {
  const w = XH * 1.02
  const x0 = LSB
  const cx = x0 + w / 2
  const cy = XH / 2
  const rx = w / 2
  const ry = XH / 2
  const stroke = LC_THIN + 34
  const barY = cy + 6                        // crossbar sits slightly above middle

  // Top half-ring (forms the TOP of the e — outer and inner contours).
  halfRing(p, cx, barY, rx, XH - barY, stroke, 'top')
  // Bottom half-ring (forms the bottom curve, open on the right).
  halfRing(p, cx, barY, rx, barY, stroke, 'bottom')
  // Crossbar — solid rect joining them.
  rect(p, x0 + stroke * 0.5, barY - (THIN + 14) / 2, w - stroke * 1.0, THIN + 14)
  // Carve right mouth below bar with a CCW rect that erases via winding —
  // instead of relying on winding carving, we simply don't draw anything
  // there. The bottom half-ring is already open on the right.

  // Small drop at lower terminal.
  dropTerminal(p, cx + rx * 0.55, stroke * 0.4, THIN + 18, THIN + 26)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// f — ascender stem with top hook and crossbar at x-height.
// ---------------------------------------------------------------------------
const f: Drawer = (p) => {
  const w = XH * 0.70
  const x0 = LSB
  const stemCx = x0 + LC_STEM / 2 + 14
  const stroke = LC_THIN + 32

  // Main stem up through ascender.
  rect(p, stemCx - LC_STEM / 2, 0, LC_STEM, ASCENDER - 40)

  // Top curl: a small half-ring arcing left then down at the very top.
  halfRing(p, stemCx - 14, ASCENDER - 40, 28, 40, stroke, 'top')
  // End drop on hook.
  dropTerminal(p, stemCx - 42, ASCENDER - 54, THIN + 20, THIN + 28)

  // Crossbar at x-height.
  rect(p, stemCx - LC_STEM / 2 - 30, XH - 14, LC_STEM + 48, THIN + 18)

  // Foot serif.
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// g — single-storey bowl at x-height + looped descender tail (bookish).
//     The bowl is a D-shape on a right stem, and the descender below the
//     baseline is a short U-bottom bowl that hangs from the stem.
// ---------------------------------------------------------------------------
const g: Drawer = (p) => {
  const w = XH * 1.14
  const x0 = LSB
  const stemX = x0 + w - LC_STEM
  const stemCx = stemX + LC_STEM / 2
  const stroke = LC_THIN + 34

  // Right stem: from the top of the descender hook up to x-height.
  const hookTopY = DESCENDER + 60
  rect(p, stemX, hookTopY, LC_STEM, XH - hookTopY)

  // Upper bowl, attached to stem's LEFT edge.
  drawLeftBowl(p, stemX, 0, w - LC_STEM, XH, stroke)

  // Descender hook: short U-bowl hanging from the stem, opening left.
  const hookDepth = hookTopY - DESCENDER
  drawBottomBowl(p, stemX - (w - LC_STEM) * 0.7, stemX + LC_STEM, hookTopY, hookDepth, stroke * 0.9)
  // Small drop at the left end of the hook.
  dropTerminal(p, stemX - (w - LC_STEM) * 0.6, hookTopY - hookDepth + stroke * 0.4, THIN + 18, THIN + 26)

  // Small ear at top-right of bowl.
  rect(p, stemX + LC_STEM - OV, XH - 20, 22, 20)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// h — ascender stem + shoulder arch to a second stem.
// ---------------------------------------------------------------------------
const h: Drawer = (p) => {
  const w = XH * 1.14
  const x0 = LSB
  const stroke = LC_THIN + 34
  const stemCx = x0 + LC_STEM / 2

  rect(p, x0, 0, LC_STEM, ASCENDER)

  // Shoulder arch: top halfRing from stem into a right stem.
  const rightStemCx = x0 + w - LC_STEM / 2
  const archCY = XH - XH * 0.32
  const archRX = (rightStemCx - stemCx) / 2
  const archCX = stemCx + archRX
  halfRing(p, archCX, archCY, archRX, XH * 0.32, stroke, 'top')
  // Right stem.
  rect(p, x0 + w - LC_STEM, 0, LC_STEM, archCY + OV)

  slabSerif(p, stemCx, LC_STEM, ASCENDER, { side: 'top', extL: LC_SERIF_EXT, extR: 0, height: 22 })
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom' })
  lcFoot(p, rightStemCx, LC_STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// i — stem + dot.
// ---------------------------------------------------------------------------
const i: Drawer = (p) => {
  const w = LC_STEM + LC_SERIF_EXT * 2
  const x0 = LSB
  const stemCx = x0 + w / 2

  rect(p, stemCx - LC_STEM / 2, 0, LC_STEM, XH)
  slabSerif(p, stemCx, LC_STEM, XH, { side: 'top', extL: LC_SERIF_EXT * 0.6, extR: LC_SERIF_EXT * 0.6, height: 20 })
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom' })

  // Dot above at ascender region.
  const dotR = LC_STEM * 0.55
  ellipse(p, stemCx, ASCENDER - dotR - 6, dotR, dotR)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// j — descending stem with dot.
// ---------------------------------------------------------------------------
const j: Drawer = (p) => {
  const w = LC_STEM + LC_SERIF_EXT * 2
  const x0 = LSB
  const stemCx = x0 + w / 2 + 10
  const hookBotY = DESCENDER + 30
  const hookCY = hookBotY + LC_STEM * 0.4

  rect(p, stemCx - LC_STEM / 2, hookCY, LC_STEM, XH - hookCY)
  halfRing(p, stemCx - (w * 0.28), hookCY, w * 0.32, (hookCY - hookBotY) + LC_STEM * 0.3, LC_STEM * 0.9, 'bottom')

  slabSerif(p, stemCx, LC_STEM, XH, { side: 'top', extL: LC_SERIF_EXT * 0.6, extR: LC_SERIF_EXT * 0.6, height: 20 })

  // Dot above at ascender region.
  const dotR = LC_STEM * 0.55
  ellipse(p, stemCx, ASCENDER - dotR - 6, dotR, dotR)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// k — ascender stem with small diagonals.
// ---------------------------------------------------------------------------
const k: Drawer = (p) => {
  const w = XH * 1.04
  const x0 = LSB
  const stemCx = x0 + LC_STEM / 2

  rect(p, x0, 0, LC_STEM, ASCENDER)
  const midY = XH * 0.46

  legStroke(p, x0 + LC_STEM - 4, x0 + w - (LC_THIN * 0.4), midY, XH, LC_THIN + 10)
  legStroke(p, x0 + w, x0 + LC_STEM - 4, 0, midY, LC_STEM - 16)

  // Foot rect on leg.
  rect(p, x0 + w - 20, 0, 26, LC_SERIF_H)

  slabSerif(p, stemCx, LC_STEM, ASCENDER, { side: 'top', extL: LC_SERIF_EXT, extR: 0, height: 22 })
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom', extR: 0 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// l — simple ascender stem.
// ---------------------------------------------------------------------------
const l: Drawer = (p) => {
  const w = LC_STEM + LC_SERIF_EXT * 2
  const x0 = LSB
  const stemCx = x0 + w / 2

  rect(p, stemCx - LC_STEM / 2, 0, LC_STEM, ASCENDER)
  slabSerif(p, stemCx, LC_STEM, ASCENDER, { side: 'top', extL: LC_SERIF_EXT, extR: 0, height: 22 })
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// m — three stems with two shoulder arches.
// ---------------------------------------------------------------------------
const m: Drawer = (p) => {
  const w = XH * 1.66
  const x0 = LSB
  const stroke = LC_THIN + 32

  const cxA = x0 + LC_STEM / 2
  const cxB = x0 + w / 2
  const cxC = x0 + w - LC_STEM / 2

  rect(p, x0, 0, LC_STEM, XH)
  rect(p, cxB - LC_STEM / 2, 0, LC_STEM, XH)
  rect(p, x0 + w - LC_STEM, 0, LC_STEM, XH)

  // Two arches.
  const archCY = XH - XH * 0.30
  const archRX1 = (cxB - cxA) / 2
  const archRX2 = (cxC - cxB) / 2
  halfRing(p, cxA + archRX1, archCY, archRX1, XH * 0.30, stroke, 'top')
  halfRing(p, cxB + archRX2, archCY, archRX2, XH * 0.30, stroke, 'top')

  lcFoot(p, cxA, LC_STEM, 0, { side: 'bottom' })
  lcFoot(p, cxB, LC_STEM, 0, { side: 'bottom' })
  lcFoot(p, cxC, LC_STEM, 0, { side: 'bottom' })
  // Small top serif on first stem.
  slabSerif(p, cxA, LC_STEM, XH, { side: 'top', extL: LC_SERIF_EXT * 0.8, extR: 0, height: 20 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// n — left stem + shoulder arch + right stem.
// ---------------------------------------------------------------------------
const n: Drawer = (p) => {
  const w = XH * 1.14
  const x0 = LSB
  const stroke = LC_THIN + 34
  const stemCx = x0 + LC_STEM / 2
  const rightStemCx = x0 + w - LC_STEM / 2

  rect(p, x0, 0, LC_STEM, XH)
  rect(p, x0 + w - LC_STEM, 0, LC_STEM, XH)

  const archCY = XH - XH * 0.32
  const archRX = (rightStemCx - stemCx) / 2
  halfRing(p, stemCx + archRX, archCY, archRX, XH * 0.32, stroke, 'top')

  slabSerif(p, stemCx, LC_STEM, XH, { side: 'top', extL: LC_SERIF_EXT * 0.8, extR: 0, height: 20 })
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom' })
  lcFoot(p, rightStemCx, LC_STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// o — round bowl at x-height.
// ---------------------------------------------------------------------------
const o: Drawer = (p) => {
  const w = XH * 1.06
  const x0 = LSB
  const cx = x0 + w / 2
  stressedRing(p, cx, XH / 2, w / 2, XH / 2, LC_THIN + 36)
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// p — stem descending below baseline + bowl at x-height.
// ---------------------------------------------------------------------------
const pGlyph: Drawer = (p) => {
  const w = XH * 1.14
  const x0 = LSB
  const stemCx = x0 + LC_STEM / 2
  const stroke = LC_THIN + 36

  rect(p, x0, DESCENDER, LC_STEM, XH - DESCENDER)

  drawBowl(p, x0 + LC_STEM, 0, w - LC_STEM, XH, stroke)

  slabSerif(p, stemCx, LC_STEM, XH, { side: 'top', extL: LC_SERIF_EXT, extR: 0, height: 22 })
  lcFoot(p, stemCx, LC_STEM, DESCENDER, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// q — stem descending below baseline + bowl on stem's LEFT edge.
// ---------------------------------------------------------------------------
const q: Drawer = (p) => {
  const w = XH * 1.14
  const x0 = LSB
  const stemX = x0 + w - LC_STEM
  const stemCx = stemX + LC_STEM / 2
  const stroke = LC_THIN + 36

  rect(p, stemX, DESCENDER, LC_STEM, XH - DESCENDER)
  drawLeftBowl(p, stemX, 0, w - LC_STEM, XH, stroke)

  slabSerif(p, stemCx, LC_STEM, XH, { side: 'top', extL: 0, extR: LC_SERIF_EXT, height: 22 })
  lcFoot(p, stemCx, LC_STEM, DESCENDER, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// r — stem + short shoulder hook.
// ---------------------------------------------------------------------------
const r: Drawer = (p) => {
  const w = XH * 0.84
  const x0 = LSB
  const stemCx = x0 + LC_STEM / 2
  const stroke = LC_THIN + 32

  rect(p, x0, 0, LC_STEM, XH)

  // Short arch hook from stem top going right and down.
  const archCY = XH - XH * 0.30
  const archRX = (w - LC_STEM) * 0.72
  halfRing(p, x0 + LC_STEM + archRX * 0.2, archCY, archRX, XH * 0.30, stroke, 'top')
  // Drop terminal at hook end.
  dropTerminal(p, x0 + LC_STEM + archRX * 0.95, archCY + 6, THIN + 22, THIN + 30)

  slabSerif(p, stemCx, LC_STEM, XH, { side: 'top', extL: LC_SERIF_EXT * 0.8, extR: 0, height: 20 })
  lcFoot(p, stemCx, LC_STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// s — lowercase S (like the cap S but smaller).
// ---------------------------------------------------------------------------
const s: Drawer = (p) => {
  const w = XH * 0.92
  const x0 = LSB
  const cx = x0 + w / 2
  const rx = w / 2
  const ry = XH * 0.28
  const upperCY = XH - ry
  const lowerCY = ry
  const stroke = LC_THIN + 34

  halfRing(p, cx, upperCY, rx, ry, stroke, 'top')
  halfRing(p, cx, lowerCY, rx, ry, stroke, 'bottom')
  legStroke(p, x0 + w - stroke * 0.45, x0 + stroke * 0.45, lowerCY - 4, upperCY + 4, stroke * 0.95)

  dropTerminal(p, x0 + w - stroke / 2, upperCY + 6, THIN + 22, THIN + 30)
  dropTerminal(p, x0 + stroke / 2, lowerCY - 6, THIN + 22, THIN + 30)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// t — short ascender stem with crossbar and hook foot.
// ---------------------------------------------------------------------------
const t: Drawer = (p) => {
  const w = XH * 0.72
  const x0 = LSB
  const stemCx = x0 + LC_STEM / 2 + 10
  const topY = XH + 120

  rect(p, stemCx - LC_STEM / 2, 0, LC_STEM, topY)

  // Crossbar at x-height.
  rect(p, stemCx - LC_STEM / 2 - 28, XH - 14, LC_STEM + 50, THIN + 18)

  // Little hook at foot.
  rect(p, stemCx + LC_STEM / 2 - OV, 0, 22, LC_THIN + 20)
  dropTerminal(p, stemCx + LC_STEM / 2 + 20, LC_THIN + 12, THIN + 20, THIN + 28)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// u — two stems joined by a bottom bowl, with a little right-stem finial.
// ---------------------------------------------------------------------------
const u: Drawer = (p) => {
  const w = XH * 1.14
  const x0 = LSB
  const stroke = LC_THIN + 34
  const stemBottom = XH * 0.28
  const stemCxL = x0 + LC_STEM / 2
  const stemCxR = x0 + w - LC_STEM / 2

  rect(p, x0, stemBottom, LC_STEM, XH - stemBottom)
  rect(p, x0 + w - LC_STEM, 0, LC_STEM, XH)
  drawBottomBowl(p, x0, x0 + w, stemBottom, stemBottom, stroke)

  slabSerif(p, stemCxL, LC_STEM, XH, { side: 'top', extL: LC_SERIF_EXT * 0.8, extR: 0, height: 20 })
  slabSerif(p, stemCxR, LC_STEM, XH, { side: 'top', extL: 0, extR: LC_SERIF_EXT * 0.8, height: 20 })
  lcFoot(p, stemCxR, LC_STEM, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// v — two diagonals meeting at baseline.
// ---------------------------------------------------------------------------
const v: Drawer = (p) => {
  const w = XH * 1.10
  const x0 = LSB
  const cx = x0 + w / 2
  const diaL = LC_STEM - 14
  const diaR = LC_THIN + 12

  legStroke(p, cx + OV, x0 + diaL / 2, 0, XH, diaL)
  legStroke(p, cx - OV, x0 + w - diaR / 2, 0, XH, diaR)
  rect(p, cx - diaL * 0.4, 0, diaL * 0.8, 6)

  slabSerif(p, x0 + diaL / 2, diaL, XH, { side: 'top', extL: 20, extR: 16, height: 18 })
  slabSerif(p, x0 + w - diaR / 2, diaR, XH, { side: 'top', extL: 16, extR: 20, height: 18 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// w — four diagonals.
// ---------------------------------------------------------------------------
const w: Drawer = (p) => {
  const w_ = XH * 1.58
  const x0 = LSB
  const dia1 = LC_STEM - 22
  const dia2 = LC_THIN + 10
  const cx = x0 + w_ / 2
  const footL = x0 + w_ * 0.28
  const footR = x0 + w_ * 0.72

  legStroke(p, footL + OV, x0 + dia1 / 2, 0, XH, dia1)
  legStroke(p, footL - OV, cx - dia2 / 2 + OV, 0, XH, dia2)
  legStroke(p, footR + OV, cx + dia2 / 2 - OV, 0, XH, dia2)
  legStroke(p, footR - OV, x0 + w_ - dia1 / 2, 0, XH, dia1)
  rect(p, footL - dia1 * 0.4, 0, dia1 * 0.8, 6)
  rect(p, footR - dia1 * 0.4, 0, dia1 * 0.8, 6)
  rect(p, cx - dia2, XH - 6, dia2 * 2, 6)

  slabSerif(p, x0 + dia1 / 2, dia1, XH, { side: 'top', extL: 18, extR: 14, height: 18 })
  slabSerif(p, cx - dia2 / 2 + OV, dia2, XH, { side: 'top', extL: 14, extR: 14, height: 18 })
  slabSerif(p, cx + dia2 / 2 - OV, dia2, XH, { side: 'top', extL: 14, extR: 14, height: 18 })
  slabSerif(p, x0 + w_ - dia1 / 2, dia1, XH, { side: 'top', extL: 14, extR: 18, height: 18 })

  return { advance: LSB + w_ + RSB }
}

// ---------------------------------------------------------------------------
// x — two crossed diagonals with small corner slabs.
// ---------------------------------------------------------------------------
const x: Drawer = (p) => {
  const w = XH * 1.00
  const x0 = LSB
  const dia1 = LC_STEM - 18
  const dia2 = LC_THIN + 12
  legStroke(p, x0, x0 + w, 0, XH, dia1)
  legStroke(p, x0 + w, x0, 0, XH, dia2)
  const cx = x0 + w / 2
  rect(p, cx - 16, XH / 2 - 16, 32, 32)

  slabSerif(p, x0, dia1, 0, { side: 'bottom', extL: 22, extR: 18, height: 18 })
  slabSerif(p, x0 + w, dia1, 0, { side: 'bottom', extL: 18, extR: 22, height: 18 })
  slabSerif(p, x0, dia2, XH, { side: 'top', extL: 22, extR: 18, height: 18 })
  slabSerif(p, x0 + w, dia2, XH, { side: 'top', extL: 18, extR: 22, height: 18 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// y — two diagonals with descender.
// ---------------------------------------------------------------------------
const y: Drawer = (p) => {
  const w = XH * 1.10
  const x0 = LSB
  const cx = x0 + w / 2
  const diaL = LC_STEM - 14
  const diaR = LC_THIN + 12

  // Left diagonal: from top-left down to just above baseline meeting point.
  legStroke(p, cx + OV, x0 + diaL / 2, XH * 0.05, XH, diaL)
  // Right diagonal continues all the way down into the descender.
  legStroke(p, x0 + w * 0.18, x0 + w - diaR / 2, DESCENDER + 20, XH, diaR)
  // Join small block.
  rect(p, cx - diaL * 0.4, XH * 0.05, diaL * 0.8, 8)
  // Descender tail finial.
  dropTerminal(p, x0 + w * 0.18 - 6, DESCENDER + 28, THIN + 20, THIN + 26)

  slabSerif(p, x0 + diaL / 2, diaL, XH, { side: 'top', extL: 20, extR: 16, height: 18 })
  slabSerif(p, x0 + w - diaR / 2, diaR, XH, { side: 'top', extL: 16, extR: 20, height: 18 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// z — lowercase Z.
// ---------------------------------------------------------------------------
const z: Drawer = (p) => {
  const w = XH * 0.96
  const x0 = LSB
  const barH = LC_THIN + 30
  rect(p, x0, XH - barH, w, barH)
  rect(p, x0, 0, w, barH)
  legStroke(p, x0 + (LC_THIN + 16) * 0.4, x0 + w - (LC_THIN + 16) * 0.4, barH - OV, XH - barH + OV, LC_THIN + 28)

  rect(p, x0, XH - barH - 12, 14, 12)
  rect(p, x0 + w - 14, barH, 14, 12)

  return { advance: LSB + w + RSB }
}

// ---- Digits ----

const zero: Drawer = (p) => {
  const w = CAP * 0.64
  const x0 = LSB
  const cx = x0 + w / 2
  stressedRing(p, cx, CAP / 2, w / 2, CAP / 2, THIN + 42)
  return { advance: LSB + w + RSB }
}

const one: Drawer = (p) => {
  const w = CAP * 0.50
  const x0 = LSB
  const stemCx = x0 + w - STEM * 0.6
  rect(p, stemCx - STEM / 2, 0, STEM, CAP)
  legStroke(p, stemCx - STEM / 2, x0 + STEM * 0.2, CAP - STEM * 1.5, CAP, STEM * 0.8)
  slabSerif(p, stemCx, STEM, 0, { side: 'bottom' })
  return { advance: LSB + w + RSB }
}

const two: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const cx = x0 + w / 2
  const upperCY = CAP * 0.70
  const upperRX = w / 2
  const upperRY = CAP * 0.30
  const stroke = THIN + 40
  halfRing(p, cx, upperCY, upperRX, upperRY, stroke, 'top')
  rect(p, cx + upperRX - stroke - OV, upperCY - stroke * 0.4, stroke + OV, upperRY * 0.6)
  legStroke(p, x0 + STEM * 0.4, cx + upperRX - stroke * 0.5, stroke, upperCY, stroke * 0.9)
  rect(p, x0, 0, w, THIN + 36)
  dropTerminal(p, cx - upperRX + stroke / 2, upperCY + 5, THIN + 22, THIN + 30)
  return { advance: LSB + w + RSB }
}

const three: Drawer = (p) => {
  const w = CAP * 0.64
  const x0 = LSB
  const cx = x0 + w / 2
  const upperCY = CAP * 0.74
  const lowerCY = CAP * 0.26
  const rx = w / 2
  const ry = CAP * 0.26
  const stroke = THIN + 40
  halfRing(p, cx, upperCY, rx, ry, stroke, 'right')
  halfRing(p, cx, lowerCY, rx, ry, stroke, 'right')
  rect(p, cx - stroke * 0.4 - OV, CAP / 2 - stroke * 0.4, stroke * 1.4 + OV * 2, stroke * 0.85)
  dropTerminal(p, x0 + stroke / 2, upperCY + 5, THIN + 22, THIN + 30)
  dropTerminal(p, x0 + stroke / 2, lowerCY - 5, THIN + 22, THIN + 30)
  return { advance: LSB + w + RSB }
}

const four: Drawer = (p) => {
  const w = CAP * 0.70
  const x0 = LSB
  rect(p, x0 + w - STEM * 1.2, 0, STEM, CAP)
  const barY = CAP * 0.30
  const barH = THIN + 38
  legStroke(p, x0, x0 + w - STEM * 1.2, barY, CAP, THIN + 38)
  rect(p, x0, barY, w, barH)
  slabSerif(p, x0 + w - STEM * 0.7, STEM, 0, { side: 'bottom' })
  return { advance: LSB + w + RSB }
}

const five: Drawer = (p) => {
  const w = CAP * 0.64
  const x0 = LSB
  const cx = x0 + w / 2
  const stroke = THIN + 40
  rect(p, x0, CAP - stroke, w, stroke)
  rect(p, x0, CAP * 0.5, STEM, CAP / 2)
  halfRing(p, cx, CAP * 0.30, w / 2, CAP * 0.30, stroke, 'right')
  rect(p, x0, CAP * 0.5, STEM * 1.5 + OV, STEM)
  dropTerminal(p, x0 + stroke / 2, CAP * 0.30 - CAP * 0.30 + 5, THIN + 22, THIN + 30)
  return { advance: LSB + w + RSB }
}

const six: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const cx = x0 + w / 2
  const stroke = THIN + 40
  const lowerRY = CAP * 0.32
  const lowerCY = lowerRY
  const lowerRX = w / 2
  ellipse(p, cx, lowerCY, lowerRX, lowerRY)
  ellipse(p, cx, lowerCY, lowerRX - stroke, lowerRY - stroke, true)
  rect(p, x0, lowerCY - OV, STEM, CAP - lowerCY - stroke + OV)
  halfRing(p, x0 + STEM + (w - STEM) / 4, CAP - stroke, (w - STEM) / 4, stroke * 0.9, stroke * 0.85, 'top')
  dropTerminal(p, x0 + STEM + (w - STEM) / 2 - 5, CAP - stroke - stroke * 0.4, THIN + 22, THIN + 30)
  return { advance: LSB + w + RSB }
}

const seven: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const barH = THIN + 36
  rect(p, x0, CAP - barH, w, barH)
  legStroke(p, x0 + STEM * 0.6, x0 + w - STEM * 0.5, 0, CAP - barH, STEM)
  rect(p, x0, CAP - barH - 12, 12, 12)
  return { advance: LSB + w + RSB }
}

const eight: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const cx = x0 + w / 2
  const upperCY = CAP * 0.70
  const lowerCY = CAP * 0.28
  const upperRX = w * 0.42
  const upperRY = CAP * 0.28
  const lowerRX = w / 2
  const lowerRY = CAP * 0.30
  const stroke = THIN + 40
  ellipse(p, cx, upperCY, upperRX, upperRY)
  ellipse(p, cx, upperCY, upperRX - stroke * 0.85, upperRY - stroke * 0.85, true)
  ellipse(p, cx, lowerCY, lowerRX, lowerRY)
  ellipse(p, cx, lowerCY, lowerRX - stroke * 0.85, lowerRY - stroke * 0.85, true)
  return { advance: LSB + w + RSB }
}

const nine: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const cx = x0 + w / 2
  const stroke = THIN + 40
  const upperRY = CAP * 0.32
  const upperCY = CAP - upperRY
  const upperRX = w / 2
  ellipse(p, cx, upperCY, upperRX, upperRY)
  ellipse(p, cx, upperCY, upperRX - stroke, upperRY - stroke, true)
  rect(p, x0 + w - STEM, stroke, STEM, upperCY - stroke + OV)
  halfRing(p, x0 + STEM + (w - STEM) * 0.75 / 2, stroke, (w - STEM) / 4, stroke * 0.9, stroke * 0.85, 'bottom')
  dropTerminal(p, x0 + stroke * 0.5, stroke + stroke * 0.3, THIN + 22, THIN + 30)
  return { advance: LSB + w + RSB }
}

// ---- Punctuation ----

const period: Drawer = (p) => {
  const r = STEM * 0.46
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  return { advance: LSB + r * 2 + RSB }
}

const comma: Drawer = (p) => {
  const r = STEM * 0.46
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  legStroke(p, cx - r * 0.3, cx - r * 0.6, -STEM * 1.1, 0, STEM * 0.6)
  return { advance: LSB + r * 2 + RSB }
}

const colon: Drawer = (p) => {
  const r = STEM * 0.46
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  ellipse(p, cx, XH * 0.75, r, r)
  return { advance: LSB + r * 2 + RSB }
}

const semicolon: Drawer = (p) => {
  const r = STEM * 0.46
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  legStroke(p, cx - r * 0.3, cx - r * 0.6, -STEM * 1.1, 0, STEM * 0.6)
  ellipse(p, cx, XH * 0.75, r, r)
  return { advance: LSB + r * 2 + RSB }
}

const exclam: Drawer = (p) => {
  const r = STEM * 0.46
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  // Taper toward the top for an old-style feel.
  legStroke(p, cx, cx, CAP * 0.22, CAP, STEM * 0.9)
  return { advance: LSB + STEM + RSB }
}

const question: Drawer = (p) => {
  const w = CAP * 0.56
  const x0 = LSB
  const cx = x0 + w / 2
  const upperCY = CAP * 0.76
  const upperRX = w / 2
  const upperRY = CAP * 0.24
  const stroke = THIN + 38
  halfRing(p, cx, upperCY, upperRX, upperRY, stroke, 'top')
  rect(p, cx + upperRX - stroke, upperCY - stroke * 0.3, stroke, upperRY * 0.5)
  rect(p, cx - STEM / 2 + upperRX * 0.1, CAP * 0.22, STEM, CAP * 0.32)
  const r = STEM * 0.46
  ellipse(p, cx + upperRX * 0.1, r, r, r)
  return { advance: LSB + w + RSB }
}

const hyphen: Drawer = (p) => {
  const w = CAP * 0.42
  rect(p, LSB, XH * 0.44 - (THIN + 20) / 2, w, THIN + 20)
  return { advance: LSB + w + RSB }
}

const apostrophe: Drawer = (p) => {
  const x0 = LSB
  legStroke(p, x0 + STEM * 0.4, x0, CAP * 0.6, CAP - STEM * 0.2, STEM * 0.6)
  return { advance: LSB + STEM + RSB }
}

const quotedbl: Drawer = (p) => {
  const x0 = LSB
  const gap = STEM * 1.0
  legStroke(p, x0 + STEM * 0.4, x0, CAP * 0.6, CAP - STEM * 0.2, STEM * 0.6)
  legStroke(p, x0 + gap + STEM * 0.4, x0 + gap, CAP * 0.6, CAP - STEM * 0.2, STEM * 0.6)
  return { advance: LSB + gap + STEM + RSB }
}

const ampersand: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  const cx = x0 + w * 0.42
  const stroke = THIN + 36
  const upperCY = CAP * 0.74
  const upperR = CAP * 0.22
  ellipse(p, cx, upperCY, upperR, upperR)
  ellipse(p, cx, upperCY, upperR - stroke, upperR - stroke, true)
  const lowerCY = CAP * 0.28
  const lowerRX = w * 0.46
  const lowerRY = CAP * 0.28
  const lowerCX = x0 + w * 0.46
  halfRing(p, lowerCX, lowerCY, lowerRX, lowerRY, stroke, 'left')
  rect(p, lowerCX, lowerCY + lowerRY - stroke, lowerRX * 0.45, stroke)
  legStroke(p, lowerCX + lowerRX * 0.55, cx - upperR * 0.4, stroke, lowerCY + lowerRY * 0.4, stroke * 0.85)
  return { advance: LSB + w + RSB }
}

const parenleft: Drawer = (p) => {
  const w = CAP * 0.32
  const x0 = LSB
  const cx = x0 + w + STEM
  halfRing(p, cx, CAP / 2, w + STEM, CAP * 0.55, STEM * 0.8, 'left')
  return { advance: LSB + w + RSB }
}

const parenright: Drawer = (p) => {
  const w = CAP * 0.32
  const x0 = LSB
  const cx = x0 - STEM
  halfRing(p, cx, CAP / 2, w + STEM, CAP * 0.55, STEM * 0.8, 'right')
  return { advance: LSB + w + RSB }
}

const slash: Drawer = (p) => {
  const w = CAP * 0.44
  const x0 = LSB
  legStroke(p, x0, x0 + w, -100, CAP, THIN + 32)
  return { advance: LSB + w + RSB }
}

const middot: Drawer = (p) => {
  const r = STEM * 0.42
  const cx = LSB + r
  ellipse(p, cx, CAP * 0.45, r, r)
  return { advance: LSB + r * 2 + RSB }
}

const emdash: Drawer = (p) => {
  const w = CAP * 1.00
  rect(p, LSB, XH * 0.44 - (THIN + 20) / 2, w, THIN + 20)
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Glyph table
// ---------------------------------------------------------------------------

interface GlyphSpec {
  name: string
  unicodes: number[]
  draw: Drawer
}

const GLYPHS: GlyphSpec[] = [
  { name: 'A', unicodes: [0x41], draw: A },
  { name: 'B', unicodes: [0x42], draw: B },
  { name: 'C', unicodes: [0x43], draw: C },
  { name: 'D', unicodes: [0x44], draw: D },
  { name: 'E', unicodes: [0x45], draw: E },
  { name: 'F', unicodes: [0x46], draw: F },
  { name: 'G', unicodes: [0x47], draw: G },
  { name: 'H', unicodes: [0x48], draw: H },
  { name: 'I', unicodes: [0x49], draw: I },
  { name: 'J', unicodes: [0x4A], draw: J },
  { name: 'K', unicodes: [0x4B], draw: K },
  { name: 'L', unicodes: [0x4C], draw: L },
  { name: 'M', unicodes: [0x4D], draw: M },
  { name: 'N', unicodes: [0x4E], draw: N },
  { name: 'O', unicodes: [0x4F], draw: O },
  { name: 'P', unicodes: [0x50], draw: P },
  { name: 'Q', unicodes: [0x51], draw: Q },
  { name: 'R', unicodes: [0x52], draw: R },
  { name: 'S', unicodes: [0x53], draw: S },
  { name: 'T', unicodes: [0x54], draw: T },
  { name: 'U', unicodes: [0x55], draw: U },
  { name: 'V', unicodes: [0x56], draw: V },
  { name: 'W', unicodes: [0x57], draw: W },
  { name: 'X', unicodes: [0x58], draw: X },
  { name: 'Y', unicodes: [0x59], draw: Y },
  { name: 'Z', unicodes: [0x5A], draw: Z },
  { name: 'a', unicodes: [0x61], draw: a },
  { name: 'b', unicodes: [0x62], draw: b },
  { name: 'c', unicodes: [0x63], draw: c },
  { name: 'd', unicodes: [0x64], draw: d },
  { name: 'e', unicodes: [0x65], draw: e },
  { name: 'f', unicodes: [0x66], draw: f },
  { name: 'g', unicodes: [0x67], draw: g },
  { name: 'h', unicodes: [0x68], draw: h },
  { name: 'i', unicodes: [0x69], draw: i },
  { name: 'j', unicodes: [0x6A], draw: j },
  { name: 'k', unicodes: [0x6B], draw: k },
  { name: 'l', unicodes: [0x6C], draw: l },
  { name: 'm', unicodes: [0x6D], draw: m },
  { name: 'n', unicodes: [0x6E], draw: n },
  { name: 'o', unicodes: [0x6F], draw: o },
  { name: 'p', unicodes: [0x70], draw: pGlyph },
  { name: 'q', unicodes: [0x71], draw: q },
  { name: 'r', unicodes: [0x72], draw: r },
  { name: 's', unicodes: [0x73], draw: s },
  { name: 't', unicodes: [0x74], draw: t },
  { name: 'u', unicodes: [0x75], draw: u },
  { name: 'v', unicodes: [0x76], draw: v },
  { name: 'w', unicodes: [0x77], draw: w },
  { name: 'x', unicodes: [0x78], draw: x },
  { name: 'y', unicodes: [0x79], draw: y },
  { name: 'z', unicodes: [0x7A], draw: z },
  { name: 'zero', unicodes: [0x30], draw: zero },
  { name: 'one', unicodes: [0x31], draw: one },
  { name: 'two', unicodes: [0x32], draw: two },
  { name: 'three', unicodes: [0x33], draw: three },
  { name: 'four', unicodes: [0x34], draw: four },
  { name: 'five', unicodes: [0x35], draw: five },
  { name: 'six', unicodes: [0x36], draw: six },
  { name: 'seven', unicodes: [0x37], draw: seven },
  { name: 'eight', unicodes: [0x38], draw: eight },
  { name: 'nine', unicodes: [0x39], draw: nine },
  { name: 'period', unicodes: [0x2E], draw: period },
  { name: 'comma', unicodes: [0x2C], draw: comma },
  { name: 'colon', unicodes: [0x3A], draw: colon },
  { name: 'semicolon', unicodes: [0x3B], draw: semicolon },
  { name: 'exclam', unicodes: [0x21], draw: exclam },
  { name: 'question', unicodes: [0x3F], draw: question },
  { name: 'hyphen', unicodes: [0x2D], draw: hyphen },
  { name: 'apostrophe', unicodes: [0x27], draw: apostrophe },
  { name: 'quotedbl', unicodes: [0x22], draw: quotedbl },
  { name: 'ampersand', unicodes: [0x26], draw: ampersand },
  { name: 'parenleft', unicodes: [0x28], draw: parenleft },
  { name: 'parenright', unicodes: [0x29], draw: parenright },
  { name: 'slash', unicodes: [0x2F], draw: slash },
  { name: 'middot', unicodes: [0x00B7], draw: middot },
  { name: 'emdash', unicodes: [0x2014], draw: emdash },
]

async function build() {
  const notdef = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: CAP * 0.82 + LSB + RSB,
    path: new opentype.Path(),
  })
  const space = new opentype.Glyph({
    name: 'space',
    unicode: 0x20,
    advanceWidth: CAP * 0.34 + LSB,
    path: new opentype.Path(),
  })
  ;(space as opentype.Glyph & { unicodes: number[] }).unicodes = [0x20, 0xA0]

  const glyphs: opentype.Glyph[] = [notdef, space]

  for (const spec of GLYPHS) {
    const path = new opentype.Path()
    let { advance } = spec.draw(path)
    // Auto-pad: if any drawn path extends left of LSB, translate everything
    // right so the glyph's xMin >= LSB — prevents the glyph from visually
    // overlapping the previous character on the line.
    const bb = path.getBoundingBox()
    const leftOverflow = LSB - bb.x1
    if (leftOverflow > 0.001) {
      // Add a small safety pad so that cubic-curve bboxes computed by the
      // parser (which consider off-curve control point extrema) never dip
      // below LSB due to rounding. Round up to an integer.
      const shift = Math.ceil(leftOverflow + 0.5)
      for (const cmd of path.commands as Array<Record<string, number>>) {
        if ('x' in cmd) cmd.x += shift
        if ('x1' in cmd) cmd.x1 += shift
        if ('x2' in cmd) cmd.x2 += shift
      }
      advance += shift
    }
    // Round all path coords to integers so that opentype.js' CFF delta
    // encoder doesn't accumulate fractional rounding drift between
    // subpaths. Rounding here is stable and keeps xMin integer-aligned.
    for (const cmd of path.commands as Array<Record<string, number>>) {
      if ('x' in cmd) cmd.x = Math.round(cmd.x)
      if ('y' in cmd) cmd.y = Math.round(cmd.y)
      if ('x1' in cmd) cmd.x1 = Math.round(cmd.x1)
      if ('y1' in cmd) cmd.y1 = Math.round(cmd.y1)
      if ('x2' in cmd) cmd.x2 = Math.round(cmd.x2)
      if ('y2' in cmd) cmd.y2 = Math.round(cmd.y2)
    }
    // Re-check xMin after rounding — round up any sub-LSB points to LSB.
    const bbFinal = path.getBoundingBox()
    if (bbFinal.x1 < LSB) {
      const finalShift = Math.ceil(LSB - bbFinal.x1)
      for (const cmd of path.commands as Array<Record<string, number>>) {
        if ('x' in cmd) cmd.x += finalShift
        if ('x1' in cmd) cmd.x1 += finalShift
        if ('x2' in cmd) cmd.x2 += finalShift
      }
      advance += finalShift
    }
    // Ensure advance at least clears the glyph's right edge + RSB.
    const bb2 = path.getBoundingBox()
    const minAdvance = bb2.x2 + RSB
    if (advance < minAdvance) advance = minAdvance

    const g = new opentype.Glyph({
      name: spec.name,
      unicode: spec.unicodes[0]!,
      advanceWidth: advance,
      path,
    })
    if (spec.unicodes.length > 1) {
      (g as opentype.Glyph & { unicodes: number[] }).unicodes = spec.unicodes
    }
    glyphs.push(g)
  }

  const font = new opentype.Font({
    familyName: 'Redwood Serif',
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: ASCENDER,
    descender: DESCENDER,
    designer: 'NPS Fonts contributors',
    designerURL: 'https://github.com/stacksjs/nps-fonts',
    manufacturer: 'NPS Fonts',
    license: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
    licenseURL: 'https://openfontlicense.org',
    version: '0.8.0',
    description: 'Redwood Serif — warm bookish transitional serif inspired by Plantin and NPS Rawlinson. Park field-journal warmth, 1910s book-face bones.',
    copyright: 'Copyright (c) 2026, NPS Fonts contributors. With Reserved Font Name "Redwood Serif".',
    trademark: '',
    glyphs,
  })

  if (font.tables.os2) {
    font.tables.os2.usWeightClass = 400
    font.tables.os2.achVendID = 'NPSF'
    font.tables.os2.fsSelection = 0x40
  }

  const otfBuf = Buffer.from(font.toArrayBuffer() as ArrayBuffer)

  await mkdir(resolve(FONTS, 'otf'), { recursive: true })
  await mkdir(resolve(FONTS, 'ttf'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff2'), { recursive: true })

  await writeFile(resolve(FONTS, 'otf', 'RedwoodSerif-Regular.otf'), otfBuf)
  await writeFile(resolve(FONTS, 'ttf', 'RedwoodSerif-Regular.ttf'), otfBuf)
  await writeFile(resolve(FONTS, 'woff', 'RedwoodSerif-Regular.woff'), sfntToWoff(otfBuf))
  const woff2Buf = Buffer.from(await wawoff2.compress(otfBuf))
  await writeFile(resolve(FONTS, 'woff2', 'RedwoodSerif-Regular.woff2'), woff2Buf)

  console.log(`\u2713 Redwood Serif: ${GLYPHS.length} glyphs \u00b7 ${(otfBuf.length / 1024).toFixed(1)}KB OTF`)
}

await build()
export const REDWOOD_GLYPHS = GLYPHS
