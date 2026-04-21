#!/usr/bin/env bun
/**
 * Summitgrade 1935 — a parametric Clarendon slab-serif display face
 * drawn from scratch with opentype.js. Evokes the routed-wood NPS
 * signage of the 1930s CCC era: solid, bracketed slab serifs, closed
 * counters, ball terminals on C/G/S/J, vertical stress on O/Q.
 *
 * Reference: Clarendon URW / Farnham / Belizio. Low-contrast (~1.30:1),
 * bracketed slabs, Clarendon-height crossbars (0.42–0.48 of CAP).
 *
 * Coverage: A-Z (also mapped to a-z), 0-9, basic punctuation. Single weight.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { sfntToWoff } from './lib/woff.ts'

const wawoff2 = await import('wawoff2')

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'summitgrade-1935')

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const UPM = 1000
const CAP = 700
const ASCENDER = CAP + 100        // 800
const DESCENDER = -180
const STROKE = 130               // stem width (main vertical)
const THIN = 100                 // thin stroke (1.30 : 1 ratio)
const LSB = 90
const RSB = 90
const KAPPA = 0.5522847498307936

// Slab serif geometry
const SERIF_H = 48               // slab height
const SERIF_EXT = 70             // overshoot each side of stem
const BRACKET_R = 22             // bracket radius joining stem to slab

// ---------------------------------------------------------------------------
// Path primitives
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

// Clarendon slab serif with bracketed join to a vertical stem.
//
// This draws a single closed polygon shaped like:   ___|¯¯stem¯¯|___
//                                                  /                \
//                                                 /__________________\
// that overlaps the bottom of the stem. For the bottom variant (`side`='bottom')
// the slab base sits at y=atY and its flat top (= atY + h) continues into the
// stem via small bracket curves on each side. The polygon goes UP past atY + h
// inside the stem region, forming a small rectangular "plug" that guarantees
// a solid union with the stem rect. Similarly for top.
function slabSerif(
  p: opentype.Path,
  cx: number,
  stemW: number,
  atY: number,
  opts: { side?: 'top' | 'bottom', extL?: number, extR?: number, height?: number, bracketR?: number } = {},
) {
  const side = opts.side ?? 'bottom'
  const extL = opts.extL ?? SERIF_EXT
  const extR = opts.extR ?? SERIF_EXT
  const h = opts.height ?? SERIF_H
  const br = Math.max(0, Math.min(opts.bracketR ?? BRACKET_R, h - 4, Math.max(0, Math.min(extL, extR) - 4)))
  const leftX = cx - stemW / 2 - extL
  const rightX = cx + stemW / 2 + extR
  const stemL = cx - stemW / 2
  const stemR = cx + stemW / 2
  // k is the cubic-Bezier magic constant for quarter-circle approximation
  const k = KAPPA

  if (side === 'bottom') {
    // Slab at baseline. Slab top = atY + h. The shape extends further up
    // through the stem's footprint by `br` so that the union with the stem rect
    // has no seam.
    const slabTop = atY + h
    const stemPlugTop = slabTop + br + 2  // a couple extra units for safety overlap
    p.moveTo(leftX, atY)
    p.lineTo(rightX, atY)
    p.lineTo(rightX, slabTop)
    // approach right bracket — we travel left along slab top to (stemR + br, slabTop)
    p.lineTo(stemR + br, slabTop)
    // bracket curve going up and inward: end at (stemR, slabTop + br)
    p.curveTo(stemR + br * (1 - k), slabTop, stemR, slabTop + br * (1 - k), stemR, slabTop + br)
    // up along stem right edge into plug
    p.lineTo(stemR, stemPlugTop)
    // across
    p.lineTo(stemL, stemPlugTop)
    // down along stem left edge to bracket start
    p.lineTo(stemL, slabTop + br)
    // left bracket curve going down and outward: end at (stemL - br, slabTop)
    p.curveTo(stemL, slabTop + br * (1 - k), stemL - br * (1 - k), slabTop, stemL - br, slabTop)
    // continue left along slab top to the outer edge
    p.lineTo(leftX, slabTop)
    p.close()
  }
  else {
    // Top slab: atY = top of slab; bottom of slab = atY - h; plug extends
    // further down into stem by `br`.
    const slabBottom = atY - h
    const stemPlugBottom = slabBottom - br - 2
    p.moveTo(leftX, atY)
    p.lineTo(leftX, slabBottom)
    p.lineTo(stemL - br, slabBottom)
    p.curveTo(stemL - br * (1 - k), slabBottom, stemL, slabBottom - br * (1 - k), stemL, slabBottom - br)
    p.lineTo(stemL, stemPlugBottom)
    p.lineTo(stemR, stemPlugBottom)
    p.lineTo(stemR, slabBottom - br)
    p.curveTo(stemR, slabBottom - br * (1 - k), stemR + br * (1 - k), slabBottom, stemR + br, slabBottom)
    p.lineTo(rightX, slabBottom)
    p.lineTo(rightX, atY)
    p.close()
  }
}

// Ball terminal: a filled drop/teardrop ellipse used on C, G, S, J
// terminal ends. Default w slightly less than h for a round finial;
// orientation just centers the oval at (cx, cy).
function ballTerminal(p: opentype.Path, cx: number, cy: number, w: number, h: number) {
  ellipse(p, cx, cy, w / 2, h / 2)
}

// A stem with slab serifs on top and/or bottom. Convenience for single-stem letters.
function slabStem(
  p: opentype.Path,
  cx: number,
  stemW: number,
  y0: number,
  y1: number,
  opts: { top?: boolean, bottom?: boolean, extL?: number, extR?: number, topExtL?: number, topExtR?: number, botExtL?: number, botExtR?: number } = {},
) {
  rect(p, cx - stemW / 2, y0, stemW, y1 - y0)
  const top = opts.top ?? true
  const bottom = opts.bottom ?? true
  if (bottom) {
    slabSerif(p, cx, stemW, y0, { side: 'bottom', extL: opts.botExtL ?? opts.extL, extR: opts.botExtR ?? opts.extR })
  }
  if (top) {
    slabSerif(p, cx, stemW, y1, { side: 'top', extL: opts.topExtL ?? opts.extL, extR: opts.topExtR ?? opts.extR })
  }
}

function drawBowl(p: opentype.Path, stemRightX: number, bottomY: number, w: number, h: number, stroke: number) {
  const cy = bottomY + h / 2
  const rx = w
  const ry = h / 2
  const k = KAPPA
  const irx = rx - stroke
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

// Solid O ring with vertical stress: the inner contour has thinner
// horizontal sides and thicker top/bottom, giving the Clarendon feel.
function stressedRing(p: opentype.Path, cx: number, cy: number, rx: number, ry: number) {
  // Outer
  ellipse(p, cx, cy, rx, ry)
  // Inner: sides thinner (rx - STROKE*0.95), top/bottom thicker (ry - STROKE*0.65)
  const irx = Math.max(1, rx - STROKE * 0.95)
  const iry = Math.max(1, ry - STROKE * 0.65)
  ellipse(p, cx, cy, irx, iry, true)
}

// ---------------------------------------------------------------------------
// Glyph drawers
// ---------------------------------------------------------------------------

interface GlyphResult { advance: number }
type Drawer = (p: opentype.Path) => GlyphResult

const WIDE_W = CAP * 1.10
const ROUND_W = CAP * 0.80       // squarish O

// Crossbar parameters (Clarendon-high)
const BAR_Y = CAP * 0.44          // crossbar y (bottom of bar) for H/E/F
const BAR_H = STROKE * 0.82
const A_BAR_Y = CAP * 0.30
const A_BAR_H = STROKE * 0.80

// Drop / ball terminal size
const DROP_W = STROKE * 0.75
const DROP_H = STROKE * 1.00

// ---------------------------------------------------------------------------
// A: solid apex (small flat 30x15 cap), crossbar at 0.42*CAP, slab feet.
// ---------------------------------------------------------------------------
const A: Drawer = (p) => {
  const w = CAP * 0.92
  const x0 = LSB
  const cx = x0 + w / 2
  const apexY = CAP
  const apexFlatHalf = 18   // apex is 36 wide total
  const diag = THIN

  // Left and right diagonals meet at a small flat apex of width 2*apexFlatHalf.
  legStroke(p, x0 + diag * 0.5, cx - apexFlatHalf, 0, apexY, diag)
  legStroke(p, x0 + w - diag * 0.5, cx + apexFlatHalf, 0, apexY, diag)

  // Solid apex cap (single rect): 36 wide x 18 tall sitting at the top
  rect(p, cx - apexFlatHalf - 6, apexY - 18, apexFlatHalf * 2 + 12, 18)

  // Crossbar — solid, spans between the two inner diagonal edges at A_BAR_Y.
  const slope = (cx - apexFlatHalf - (x0 + diag * 0.5)) / apexY
  const innerL = (x0 + diag * 0.5) + slope * A_BAR_Y + diag * 0.5 - 10
  const innerR = (x0 + w - diag * 0.5) - slope * A_BAR_Y - diag * 0.5 + 10
  rect(p, innerL, A_BAR_Y, innerR - innerL, A_BAR_H)

  // Slab feet — outer extension larger than inner (feet flare outward).
  slabSerif(p, x0 + diag * 0.5, diag, 0, { side: 'bottom', extL: SERIF_EXT - 10, extR: SERIF_EXT })
  slabSerif(p, x0 + w - diag * 0.5, diag, 0, { side: 'bottom', extL: SERIF_EXT, extR: SERIF_EXT - 10 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// B: upper bowl 0.48 CAP, lower bowl +25 wider. Slab top + bottom on stem.
// ---------------------------------------------------------------------------
const B: Drawer = (p) => {
  const w = CAP * 0.74
  const x0 = LSB
  const stemCx = x0 + STROKE / 2

  // Stem
  rect(p, x0, 0, STROKE, CAP)

  const upperBowlH = CAP * 0.48
  const upperBowlW = w - STROKE - 10      // slightly narrower
  const lowerBowlH = CAP - upperBowlH
  const lowerBowlW = w - STROKE           // wider
  drawBowl(p, x0 + STROKE, CAP - upperBowlH, upperBowlW, upperBowlH, STROKE)
  drawBowl(p, x0 + STROKE, 0, lowerBowlW, lowerBowlH, STROKE)

  // Slabs on stem (left overhangs more than right where bowls meet)
  slabSerif(p, stemCx, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 10 })
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom', extL: SERIF_EXT, extR: 10 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// C: solid left half-ring, top/bottom arms with ball terminals (drop).
// ---------------------------------------------------------------------------
const C: Drawer = (p) => {
  const w = ROUND_W
  const x0 = LSB
  const cx = x0 + w / 2
  const cy = CAP / 2
  const rx = w / 2
  const ry = CAP / 2

  // Solid left half-annulus (the back of the C).
  halfRing(p, cx, cy, rx, ry, STROKE, 'left')

  // Top arm: a horizontal bar from the top of the half-ring extending right,
  // ending in a ball terminal. Arm sits inside the top stroke zone.
  const topArmY = CAP - STROKE
  const topArmLen = w * 0.22
  rect(p, cx - 4, topArmY, topArmLen + 4, STROKE)
  // Ball terminal at the right end — vertically centered on the arm
  ballTerminal(p, cx + topArmLen, topArmY + STROKE * 0.55, DROP_W * 1.1, DROP_H * 1.15)

  // Bottom arm + ball terminal
  const botArmY = 0
  const botArmLen = w * 0.22
  rect(p, cx - 4, botArmY, botArmLen + 4, STROKE)
  ballTerminal(p, cx + botArmLen, botArmY + STROKE * 0.45, DROP_W * 1.1, DROP_H * 1.15)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// D: slab top+bottom on stem, bowl.
// ---------------------------------------------------------------------------
const D: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  const stemCx = x0 + STROKE / 2

  rect(p, x0, 0, STROKE, CAP)
  drawBowl(p, x0 + STROKE, 0, w - STROKE, CAP, STROKE)

  // Slabs only on left of stem (right of stem is where bowl attaches)
  slabSerif(p, stemCx, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom', extL: SERIF_EXT, extR: 5 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// E: slab stem, bar terminals with tick drops. Middle bar 0.88*w, solid.
// ---------------------------------------------------------------------------
const E: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const stemCx = x0 + STROKE / 2

  // Stem
  rect(p, x0, 0, STROKE, CAP)
  // Top & bottom arms (full w)
  rect(p, x0, CAP - STROKE, w, STROKE)
  rect(p, x0, 0, w, STROKE)
  // Middle bar at Clarendon-high crossbar
  rect(p, x0, BAR_Y, w * 0.80, BAR_H)

  // Slab on left side of stem top & bottom (bars cover the right side)
  slabSerif(p, stemCx, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 0 })
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom', extL: SERIF_EXT, extR: 0 })

  // Small slab/tick on the right ends of top & bottom arms (extending slightly down/up)
  // Top arm right terminal — drops DOWN from arm into brackets
  rect(p, x0 + w - 8, CAP - STROKE - 14, 8, 14)
  // Bottom arm right terminal — drops UP
  rect(p, x0 + w - 8, STROKE, 8, 14)
  // Middle bar right terminal tick — small drop
  rect(p, x0 + w * 0.80 - 2, BAR_Y - 10, 8, 10)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// F: same as E minus bottom arm.
// ---------------------------------------------------------------------------
const F: Drawer = (p) => {
  const w = CAP * 0.64
  const x0 = LSB
  const stemCx = x0 + STROKE / 2

  rect(p, x0, 0, STROKE, CAP)
  rect(p, x0, CAP - STROKE, w, STROKE)
  rect(p, x0, BAR_Y, w * 0.78, BAR_H)

  slabSerif(p, stemCx, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 0 })
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom', extL: SERIF_EXT, extR: SERIF_EXT })

  // Top-arm right tick
  rect(p, x0 + w - 8, CAP - STROKE - 14, 8, 14)
  // Middle bar right tick
  rect(p, x0 + w * 0.78 - 2, BAR_Y - 10, 8, 10)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// G: left half-ring, top arm with ball, spur from upper-right edge only.
// NO inner crossbar rect.
// ---------------------------------------------------------------------------
const G: Drawer = (p) => {
  const w = ROUND_W
  const x0 = LSB
  const cx = x0 + w / 2
  const cy = CAP / 2
  const rx = w / 2
  const ry = CAP / 2

  halfRing(p, cx, cy, rx, ry, STROKE, 'left')

  // Top arm + ball terminal
  const topArmY = CAP - STROKE
  const topArmLen = w * 0.22
  rect(p, cx - 4, topArmY, topArmLen + 4, STROKE)
  ballTerminal(p, cx + topArmLen, topArmY + STROKE * 0.55, DROP_W * 1.1, DROP_H * 1.15)

  // Bottom arm — solid extending further right than C (the G "jaw")
  const botArmY = 0
  const botArmLen = w * 0.44
  rect(p, cx - 4, botArmY, botArmLen + 4, STROKE)

  // Short vertical spur from upper-right edge descending halfway (the G spur)
  const spurX = x0 + w - STROKE
  const spurBotY = 0
  const spurTopY = CAP * 0.48
  rect(p, spurX, spurBotY, STROKE, spurTopY)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// H: two slab stems, crossbar at 0.48 CAP.
// ---------------------------------------------------------------------------
const H: Drawer = (p) => {
  const w = CAP * 0.84
  const x0 = LSB
  const cxL = x0 + STROKE / 2
  const cxR = x0 + w - STROKE / 2

  rect(p, x0, 0, STROKE, CAP)
  rect(p, x0 + w - STROKE, 0, STROKE, CAP)
  // Crossbar between stems
  rect(p, x0 + STROKE - 2, CAP * 0.46, w - 2 * STROKE + 4, STROKE * 0.82)

  slabSerif(p, cxL, STROKE, CAP, { side: 'top' })
  slabSerif(p, cxL, STROKE, 0, { side: 'bottom' })
  slabSerif(p, cxR, STROKE, CAP, { side: 'top' })
  slabSerif(p, cxR, STROKE, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// I: single slab stem with big serifs.
// ---------------------------------------------------------------------------
const I: Drawer = (p) => {
  const cx = LSB + STROKE / 2
  rect(p, LSB, 0, STROKE, CAP)
  slabSerif(p, cx, STROKE, CAP, { side: 'top', extL: SERIF_EXT + 5, extR: SERIF_EXT + 5 })
  slabSerif(p, cx, STROKE, 0, { side: 'bottom', extL: SERIF_EXT + 5, extR: SERIF_EXT + 5 })
  return { advance: LSB + STROKE + SERIF_EXT * 2 + RSB - 20 }
}

// ---------------------------------------------------------------------------
// J: stem with top slab, bottom ball terminal replacing naked halfRing.
// ---------------------------------------------------------------------------
const J: Drawer = (p) => {
  const w = CAP * 0.56
  const x0 = LSB
  const stemCx = x0 + w - STROKE / 2
  const hookCY = CAP * 0.22
  const hookCX = x0 + w / 2

  // Stem (from hookCY up to CAP)
  rect(p, x0 + w - STROKE, hookCY, STROKE, CAP - hookCY)

  // Bottom hook (half-ring on the bottom)
  halfRing(p, hookCX, hookCY, w / 2, CAP * 0.22, STROKE, 'bottom')

  // Top slab on stem
  slabSerif(p, stemCx, STROKE, CAP, { side: 'top' })

  // Ball terminal at the end (left) of the hook — replacing the plain endpoint
  ballTerminal(p, hookCX - w / 2 + STROKE * 0.48, hookCY + STROKE * 0.15, DROP_W * 1.1, DROP_H * 1.15)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// K: slab stem; small slab on upper + lower arm where they meet right edge.
// ---------------------------------------------------------------------------
const K: Drawer = (p) => {
  const w = CAP * 0.80
  const x0 = LSB
  const stemCx = x0 + STROKE / 2

  // Stem
  rect(p, x0, 0, STROKE, CAP)
  const midY = CAP * 0.44

  // Upper arm: from stem right edge at midY up to top-right
  legStroke(p, x0 + STROKE - 3, x0 + w - THIN * 0.4, midY, CAP, THIN)
  // Lower leg: from stem right edge at midY down-right to bottom-right, thicker (main stem)
  legStroke(p, x0 + w - STROKE * 0.4, x0 + STROKE - 3, 0, midY, STROKE)

  // Small slab on upper arm right end — going down, small 16x22
  rect(p, x0 + w - 18, CAP - 18, 18, 18)
  // Small slab on lower leg right end — bottom serif
  rect(p, x0 + w - STROKE * 0.4 - 20, 0, 40, SERIF_H * 0.9)

  // Slab stem top/bottom
  slabSerif(p, stemCx, STROKE, CAP, { side: 'top' })
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom', extR: 0 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// L: top slab on stem, small drop on bar right end.
// ---------------------------------------------------------------------------
const L: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const stemCx = x0 + STROKE / 2

  rect(p, x0, 0, STROKE, CAP)
  rect(p, x0, 0, w, STROKE)

  slabSerif(p, stemCx, STROKE, CAP, { side: 'top' })
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom', extR: 0 })
  // Small drop/tick on right end of bottom bar
  rect(p, x0 + w - 10, STROKE, 10, 14)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// M: valley to baseline (y=0), base slabs on outer stems.
// ---------------------------------------------------------------------------
const M: Drawer = (p) => {
  const w = WIDE_W
  const x0 = LSB
  const cxL = x0 + STROKE / 2
  const cxR = x0 + w - STROKE / 2

  // Outer stems
  rect(p, x0, 0, STROKE, CAP)
  rect(p, x0 + w - STROKE, 0, STROKE, CAP)

  const cx = x0 + w / 2
  const valleyY = 0              // descends to baseline
  const dia = THIN * 0.75
  const OV = 4

  // Two diagonals from inner top of each stem down to the center at baseline
  legStroke(p, cx - dia / 2 + OV, x0 + STROKE + dia / 2 - OV, valleyY, CAP, dia)
  legStroke(p, cx + dia / 2 - OV, x0 + w - STROKE - dia / 2 + OV, valleyY, CAP, dia)
  // Fill the valley cusp
  rect(p, cx - dia, 0, dia * 2, 6)

  // Top slabs on outer stems (extending outward only)
  slabSerif(p, cxL, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 0 })
  slabSerif(p, cxR, STROKE, CAP, { side: 'top', extL: 0, extR: SERIF_EXT })
  // Base slabs
  slabSerif(p, cxL, STROKE, 0, { side: 'bottom' })
  slabSerif(p, cxR, STROKE, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// N: top+base slabs on stems, diagonal from top-left to bottom-right.
// ---------------------------------------------------------------------------
const N: Drawer = (p) => {
  const w = CAP * 0.84
  const x0 = LSB
  const cxL = x0 + STROKE / 2
  const cxR = x0 + w - STROKE / 2
  const OV = 4

  rect(p, x0, 0, STROKE, CAP)
  rect(p, x0 + w - STROKE, 0, STROKE, CAP)
  legStroke(p, x0 + w - STROKE + OV, x0 + STROKE - OV, 0, CAP, THIN)

  // Slabs — inner side of each stem overshoot is reduced to blend with diagonal
  slabSerif(p, cxL, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, cxR, STROKE, CAP, { side: 'top', extL: 5, extR: SERIF_EXT })
  slabSerif(p, cxL, STROKE, 0, { side: 'bottom', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, cxR, STROKE, 0, { side: 'bottom', extL: 5, extR: SERIF_EXT })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// O: vertical stress — sides thinner than top/bottom.
// ---------------------------------------------------------------------------
const O: Drawer = (p) => {
  const w = ROUND_W
  const x0 = LSB
  const cx = x0 + w / 2
  stressedRing(p, cx, CAP / 2, w / 2, CAP / 2)
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// P: slab stem, bowl height 0.52*CAP.
// ---------------------------------------------------------------------------
const P: Drawer = (p) => {
  const w = CAP * 0.70
  const x0 = LSB
  const stemCx = x0 + STROKE / 2

  rect(p, x0, 0, STROKE, CAP)
  const bowlH = CAP * 0.52
  drawBowl(p, x0 + STROKE, CAP - bowlH, w - STROKE, bowlH, STROKE)

  slabSerif(p, stemCx, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Q: stressed O + tail crossing baseline, sweeping past x0+w+30 to the right.
// ---------------------------------------------------------------------------
const Q: Drawer = (p) => {
  const w = ROUND_W
  const x0 = LSB
  const cx = x0 + w / 2
  stressedRing(p, cx, CAP / 2, w / 2, CAP / 2)

  // Tail: starts inside the bowl at lower-right, sweeps out past right edge
  // to x0 + w + 30, with a slight upturn at the end. Use legStroke + small cap.
  const tailStartX = cx + w * 0.05
  const tailStartY = CAP * 0.18
  const tailEndX = x0 + w + 30
  const tailEndY = -STROKE * 0.3
  legStroke(p, tailEndX, tailStartX, tailEndY, tailStartY, THIN * 0.9)
  // Upturn at the outer tip (short 20x20 tick)
  rect(p, tailEndX - THIN * 0.4, tailEndY, THIN * 0.8, 20)

  return { advance: LSB + w + 30 + RSB }
}

// ---------------------------------------------------------------------------
// R: slab stem, curved-S leg, slab foot.
// ---------------------------------------------------------------------------
const R: Drawer = (p) => {
  const w = CAP * 0.78
  const x0 = LSB
  const stemCx = x0 + STROKE / 2
  const OV = 4

  rect(p, x0, 0, STROKE, CAP)
  const bowlH = CAP * 0.52
  drawBowl(p, x0 + STROKE, CAP - bowlH, w - STROKE, bowlH, STROKE)
  const junctionY = CAP - bowlH

  // Curved leg (approximated with two leg strokes: upper section thin near bowl junction,
  // lower section thick near base). Thick at base = STROKE, thin at bowl = STROKE*0.6.
  // Use a single tapered leg (trapezoid)
  const legFootX = x0 + w + 6
  const legTopX = x0 + STROKE + 10
  const halfTop = STROKE * 0.3
  const halfBot = STROKE * 0.5
  p.moveTo(legFootX - halfBot, 0)
  p.lineTo(legFootX + halfBot, 0)
  p.lineTo(legTopX + halfTop, junctionY + OV)
  p.lineTo(legTopX - halfTop, junctionY + OV)
  p.close()

  slabSerif(p, stemCx, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom' })
  // Slab foot on leg
  slabSerif(p, legFootX, STROKE * 0.7, 0, { side: 'bottom', extL: 15, extR: SERIF_EXT })

  return { advance: LSB + w + 30 + RSB }
}

// ---------------------------------------------------------------------------
// S: two halfRings + diagonal + ball terminals top-right & bottom-left.
// ---------------------------------------------------------------------------
const S: Drawer = (p) => {
  const w = CAP * 0.70
  const x0 = LSB
  const cx = x0 + w / 2
  const upperCY = CAP * 0.72
  const lowerCY = CAP * 0.28
  const rx = w / 2
  const ry = CAP * 0.28

  halfRing(p, cx, upperCY, rx, ry, STROKE, 'top')
  halfRing(p, cx, lowerCY, rx, ry, STROKE, 'bottom')
  legStroke(p, x0 + w - STROKE * 0.5, x0 + STROKE * 0.5, lowerCY - STROKE * 0.2, upperCY + STROKE * 0.2, STROKE)

  // Ball terminal top-right (end of upper halfRing on the right side where it curls back)
  ballTerminal(p, x0 + w - STROKE / 2, upperCY + 8, DROP_W, DROP_H)
  // Ball terminal bottom-left
  ballTerminal(p, x0 + STROKE / 2, lowerCY - 8, DROP_W, DROP_H)

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// T: drop ticks at top-bar ends, slab foot on stem.
// ---------------------------------------------------------------------------
const T: Drawer = (p) => {
  const w = CAP * 0.78
  const x0 = LSB
  const stemCx = x0 + w / 2

  rect(p, x0, CAP - STROKE, w, STROKE)
  rect(p, x0 + w / 2 - STROKE / 2, 0, STROKE, CAP)

  // Drop ticks on top bar ends — extending downward from bar
  rect(p, x0, CAP - STROKE - 14, 12, 14)
  rect(p, x0 + w - 12, CAP - STROKE - 14, 12, 14)

  // Slab foot on stem
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// U: top slabs on both stems + bottom bowl.
// ---------------------------------------------------------------------------
const U: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  const stemBottom = CAP * 0.30
  const cxL = x0 + STROKE / 2
  const cxR = x0 + w - STROKE / 2

  rect(p, x0, stemBottom, STROKE, CAP - stemBottom)
  rect(p, x0 + w - STROKE, stemBottom, STROKE, CAP - stemBottom)
  drawBottomBowl(p, x0, x0 + w, stemBottom, stemBottom, STROKE)

  slabSerif(p, cxL, STROKE, CAP, { side: 'top', extL: SERIF_EXT, extR: 5 })
  slabSerif(p, cxR, STROKE, CAP, { side: 'top', extL: 5, extR: SERIF_EXT })

  return { advance: LSB + w + RSB }
}

// Re-add drawBottomBowl which was moved to primitives above (keep original behavior)
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

// ---------------------------------------------------------------------------
// V: top slab serifs on each diagonal (25x20 each)
// ---------------------------------------------------------------------------
const V: Drawer = (p) => {
  const w = CAP * 0.86
  const x0 = LSB
  const cx = x0 + w / 2
  const dia = THIN * 0.98
  const OV = 4
  legStroke(p, cx + OV, x0 + dia / 2, 0, CAP, dia)
  legStroke(p, cx - OV, x0 + w - dia / 2, 0, CAP, dia)
  rect(p, cx - dia, 0, dia * 2, 6)

  // Top slab serifs (25 wide x 20 tall on each side of each diagonal top)
  // Left diagonal top is at x = x0 + dia/2
  slabSerif(p, x0 + dia / 2, dia, CAP, { side: 'top', extL: 25, extR: 25, height: 20 })
  slabSerif(p, x0 + w - dia / 2, dia, CAP, { side: 'top', extL: 25, extR: 25, height: 20 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// W: top slab serifs on each diagonal top.
// ---------------------------------------------------------------------------
const W: Drawer = (p) => {
  const w = WIDE_W * 1.05
  const x0 = LSB
  const dia = THIN * 0.68
  const cx = x0 + w / 2
  const footL = x0 + w * 0.28
  const footR = x0 + w * 0.72
  const OV = 4
  legStroke(p, footL + OV, x0 + dia / 2, 0, CAP, dia)
  legStroke(p, footL - OV, cx - dia / 2 + OV, 0, CAP, dia)
  legStroke(p, footR + OV, cx + dia / 2 - OV, 0, CAP, dia)
  legStroke(p, footR - OV, x0 + w - dia / 2, 0, CAP, dia)
  rect(p, footL - dia, 0, dia * 2, 6)
  rect(p, footR - dia, 0, dia * 2, 6)
  rect(p, cx - dia, CAP - 6, dia * 2, 6)

  // Top slab serifs at each of the 4 diagonal tops
  slabSerif(p, x0 + dia / 2, dia, CAP, { side: 'top', extL: 20, extR: 18, height: 20 })
  slabSerif(p, cx - dia / 2 + OV, dia, CAP, { side: 'top', extL: 18, extR: 18, height: 20 })
  slabSerif(p, cx + dia / 2 - OV, dia, CAP, { side: 'top', extL: 18, extR: 18, height: 20 })
  slabSerif(p, x0 + w - dia / 2, dia, CAP, { side: 'top', extL: 18, extR: 20, height: 20 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// X: four corner slab serifs.
// ---------------------------------------------------------------------------
const X: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  legStroke(p, x0, x0 + w, 0, CAP, THIN * 0.95)
  legStroke(p, x0 + w, x0, 0, CAP, THIN * 0.95)
  const cx = x0 + w / 2
  rect(p, cx - THIN * 0.4, CAP / 2 - THIN * 0.4, THIN * 0.8, THIN * 0.8)

  // Corner slab serifs — small (25x20)
  slabSerif(p, x0, THIN * 0.95, 0, { side: 'bottom', extL: 25, extR: 20, height: 20 })
  slabSerif(p, x0 + w, THIN * 0.95, 0, { side: 'bottom', extL: 20, extR: 25, height: 20 })
  slabSerif(p, x0, THIN * 0.95, CAP, { side: 'top', extL: 25, extR: 20, height: 20 })
  slabSerif(p, x0 + w, THIN * 0.95, CAP, { side: 'top', extL: 20, extR: 25, height: 20 })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Y: top slabs on arms, bottom slab on stem.
// ---------------------------------------------------------------------------
const Y: Drawer = (p) => {
  const w = CAP * 0.82
  const x0 = LSB
  const cx = x0 + w / 2
  const peakY = CAP * 0.46
  const dia = THIN * 0.95
  const OV = 4
  legStroke(p, cx - dia / 2 + OV, x0 + dia / 2, peakY, CAP, dia)
  legStroke(p, cx + dia / 2 - OV, x0 + w - dia / 2, peakY, CAP, dia)
  rect(p, cx - STROKE / 2, 0, STROKE, peakY + OV)
  rect(p, cx - dia, peakY - OV, dia * 2, OV * 2)

  // Top slabs on arms
  slabSerif(p, x0 + dia / 2, dia, CAP, { side: 'top', extL: 25, extR: 20, height: 20 })
  slabSerif(p, x0 + w - dia / 2, dia, CAP, { side: 'top', extL: 20, extR: 25, height: 20 })
  // Bottom slab on stem
  slabSerif(p, cx, STROKE, 0, { side: 'bottom' })

  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Z: terminal drops top-left and bottom-right.
// ---------------------------------------------------------------------------
const Z: Drawer = (p) => {
  const w = CAP * 0.74
  const x0 = LSB
  const OV = 4
  rect(p, x0, CAP - STROKE, w, STROKE)
  rect(p, x0, 0, w, STROKE)
  legStroke(p, x0 + THIN * 0.4, x0 + w - THIN * 0.4, STROKE - OV, CAP - STROKE + OV, THIN * 0.95)

  // Terminal drop top-left: small rect dropping from top bar
  rect(p, x0, CAP - STROKE - 14, 14, 14)
  // Terminal drop bottom-right: small rect rising from bottom bar
  rect(p, x0 + w - 14, STROKE, 14, 14)

  return { advance: LSB + w + RSB }
}

// ---- Digits ----
const zero: Drawer = (p) => {
  const w = CAP * 0.62
  const x0 = LSB
  const cx = x0 + w / 2
  ellipse(p, cx, CAP / 2, w / 2, CAP / 2)
  ellipse(p, cx, CAP / 2, w / 2 - STROKE * 0.9, CAP / 2 - STROKE * 0.6, true)
  return { advance: LSB + w + RSB }
}
const one: Drawer = (p) => {
  const w = CAP * 0.50
  const x0 = LSB
  const stemCx = x0 + w - STROKE * 0.6
  rect(p, stemCx - STROKE / 2, 0, STROKE, CAP)
  legStroke(p, stemCx - STROKE / 2, x0 + STROKE * 0.2, CAP - STROKE * 1.5, CAP, STROKE * 0.85)
  // Base slab serif
  slabSerif(p, stemCx, STROKE, 0, { side: 'bottom' })
  return { advance: LSB + w + RSB }
}
const two: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const cx = x0 + w / 2
  const upperCY = CAP * 0.70
  const upperRX = w / 2
  const upperRY = CAP * 0.30
  const OV = 2
  halfRing(p, cx, upperCY, upperRX, upperRY, STROKE, 'top')
  rect(p, cx + upperRX - STROKE - OV, upperCY - STROKE * 0.4, STROKE + OV, upperRY * 0.6)
  legStroke(p, x0 + STROKE * 0.4, cx + upperRX - STROKE * 0.5, STROKE, upperCY, STROKE * 0.95)
  rect(p, x0, 0, w, STROKE)
  // Ball terminal on upper-left (where halfRing ends on the left)
  ballTerminal(p, cx - upperRX + STROKE / 2, upperCY + 5, DROP_W, DROP_H)
  return { advance: LSB + w + RSB }
}
const three: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const flatX = x0 + STROKE / 2
  const rx = w - STROKE
  const upperCY = CAP * 0.73
  const lowerCY = CAP * 0.27
  const ry = CAP * 0.27
  halfRing(p, flatX, upperCY, rx, ry, STROKE, 'right')
  halfRing(p, flatX, lowerCY, rx, ry, STROKE, 'right')
  // Middle junction on the right: fills gap between arcs
  rect(p, flatX + rx - STROKE, CAP / 2 - STROKE * 0.5, STROKE, STROKE)
  // Ball terminals at the arc's top-left (upper) and bottom-left (lower) endpoints
  ballTerminal(p, flatX + DROP_W * 0.2, upperCY + ry - STROKE * 0.5, DROP_W, DROP_H)
  ballTerminal(p, flatX + DROP_W * 0.2, lowerCY - ry + STROKE * 0.5, DROP_W, DROP_H)
  return { advance: LSB + w + RSB }
}
const four: Drawer = (p) => {
  const w = CAP * 0.70
  const x0 = LSB
  rect(p, x0 + w - STROKE * 1.2, 0, STROKE, CAP)
  const barY = CAP * 0.30
  const barH = STROKE * 0.85
  legStroke(p, x0, x0 + w - STROKE * 1.2, barY, CAP, STROKE * 0.85)
  rect(p, x0, barY, w, barH)
  // Base slab on stem
  slabSerif(p, x0 + w - STROKE * 0.7, STROKE, 0, { side: 'bottom' })
  return { advance: LSB + w + RSB }
}
const five: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const flatX = x0 + STROKE / 2
  const OV = 2
  // Top horizontal bar
  rect(p, x0, CAP - STROKE, w, STROKE)
  // Left vertical stem from top down to mid
  rect(p, x0, CAP * 0.52, STROKE, CAP * 0.48)
  // Short nub extending right at mid (where stem ends into bowl)
  rect(p, x0, CAP * 0.52 - OV, STROKE * 1.5 + OV, STROKE)
  // Bottom bowl: half-ring opening left
  const bowlCY = CAP * 0.30
  const bowlRY = CAP * 0.30
  const bowlRX = w - STROKE
  halfRing(p, flatX, bowlCY, bowlRX, bowlRY, STROKE, 'right')
  // Ball terminal at the bowl's bottom-left endpoint
  ballTerminal(p, flatX + DROP_W * 0.2, bowlCY - bowlRY + STROKE * 0.5, DROP_W, DROP_H)
  return { advance: LSB + w + RSB }
}
const six: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const cx = x0 + w / 2
  const OV = 2
  const lowerRY = CAP * 0.32
  const lowerCY = lowerRY
  const lowerRX = w / 2
  // Lower bowl
  ellipse(p, cx, lowerCY, lowerRX, lowerRY)
  ellipse(p, cx, lowerCY, lowerRX - STROKE, lowerRY - STROKE, true)
  // Upper hook: stem descending from top-left to the bowl
  rect(p, x0, lowerCY - OV, STROKE, CAP - lowerCY - STROKE * 0.3 + OV)
  // Top half-ring from top-left curving right — forming the top of "6"
  const topRX = (w - STROKE) * 0.55
  const topCX = x0 + STROKE / 2 + topRX
  halfRing(p, topCX, CAP - STROKE / 2, topRX, STROKE * 0.9, STROKE, 'top')
  // Ball terminal at the right endpoint of the top hook
  ballTerminal(p, topCX + topRX - STROKE * 0.4, CAP - STROKE * 0.45, DROP_W, DROP_H)
  return { advance: LSB + w + RSB }
}
const seven: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  rect(p, x0, CAP - STROKE, w, STROKE)
  legStroke(p, x0 + STROKE * 0.6, x0 + w - STROKE * 0.5, 0, CAP - STROKE, STROKE)
  // Small drop on top-left of bar
  rect(p, x0, CAP - STROKE - 12, 12, 12)
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
  ellipse(p, cx, upperCY, upperRX, upperRY)
  ellipse(p, cx, upperCY, upperRX - STROKE * 0.85, upperRY - STROKE * 0.85, true)
  ellipse(p, cx, lowerCY, lowerRX, lowerRY)
  ellipse(p, cx, lowerCY, lowerRX - STROKE * 0.85, lowerRY - STROKE * 0.85, true)
  return { advance: LSB + w + RSB }
}
const nine: Drawer = (p) => {
  const w = CAP * 0.66
  const x0 = LSB
  const cx = x0 + w / 2
  const OV = 2
  const upperRY = CAP * 0.32
  const upperCY = CAP - upperRY
  const upperRX = w / 2
  // Upper bowl
  ellipse(p, cx, upperCY, upperRX, upperRY)
  ellipse(p, cx, upperCY, upperRX - STROKE, upperRY - STROKE, true)
  // Stem descending from bowl right-side to near baseline
  rect(p, x0 + w - STROKE, STROKE * 0.3 - OV, STROKE, upperCY - STROKE * 0.3 + OV)
  // Bottom hook: half-ring from stem curving left
  const botRX = (w - STROKE) * 0.55
  const botCX = x0 + w - STROKE / 2 - botRX
  halfRing(p, botCX, STROKE / 2, botRX, STROKE * 0.9, STROKE, 'bottom')
  // Ball terminal at the left endpoint of the bottom hook
  ballTerminal(p, botCX - botRX + STROKE * 0.4, STROKE * 0.45, DROP_W, DROP_H)
  return { advance: LSB + w + RSB }
}

// ---- Punctuation ----
const period: Drawer = (p) => {
  const r = STROKE * 0.52
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  return { advance: LSB + r * 2 + RSB }
}
const comma: Drawer = (p) => {
  const r = STROKE * 0.52
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  legStroke(p, cx - r * 0.3, cx - r * 0.6, -STROKE * 1.3, 0, STROKE * 0.7)
  return { advance: LSB + r * 2 + RSB }
}
const colon: Drawer = (p) => {
  const r = STROKE * 0.52
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  ellipse(p, cx, CAP * 0.5, r, r)
  return { advance: LSB + r * 2 + RSB }
}
const semicolon: Drawer = (p) => {
  const r = STROKE * 0.52
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  legStroke(p, cx - r * 0.3, cx - r * 0.6, -STROKE * 1.3, 0, STROKE * 0.7)
  ellipse(p, cx, CAP * 0.5, r, r)
  return { advance: LSB + r * 2 + RSB }
}
const exclam: Drawer = (p) => {
  const r = STROKE * 0.52
  const cx = LSB + r
  ellipse(p, cx, r, r, r)
  rect(p, cx - STROKE / 2, CAP * 0.22, STROKE, CAP * 0.78)
  return { advance: LSB + STROKE + RSB }
}
const question: Drawer = (p) => {
  const w = CAP * 0.58
  const x0 = LSB
  const cx = x0 + w / 2
  const upperCY = CAP * 0.78
  const upperRX = w / 2
  const upperRY = CAP * 0.22
  halfRing(p, cx, upperCY, upperRX, upperRY, STROKE, 'top')
  rect(p, cx + upperRX - STROKE, upperCY - STROKE * 0.4, STROKE, upperRY * 0.6)
  rect(p, cx - STROKE / 2 + upperRX * 0.1, CAP * 0.22, STROKE, CAP * 0.34)
  const r = STROKE * 0.52
  ellipse(p, cx + upperRX * 0.1, r, r, r)
  return { advance: LSB + w + RSB }
}
const hyphen: Drawer = (p) => {
  const w = CAP * 0.42
  rect(p, LSB, CAP / 2 - STROKE / 2, w, STROKE * 0.85)
  return { advance: LSB + w + RSB }
}
const apostrophe: Drawer = (p) => {
  const x0 = LSB
  legStroke(p, x0 + STROKE * 0.4, x0, CAP * 0.6, CAP - STROKE * 0.2, STROKE * 0.7)
  return { advance: LSB + STROKE + RSB }
}
const quotedbl: Drawer = (p) => {
  const x0 = LSB
  const gap = STROKE * 1.0
  legStroke(p, x0 + STROKE * 0.4, x0, CAP * 0.6, CAP - STROKE * 0.2, STROKE * 0.7)
  legStroke(p, x0 + gap + STROKE * 0.4, x0 + gap, CAP * 0.6, CAP - STROKE * 0.2, STROKE * 0.7)
  return { advance: LSB + gap + STROKE + RSB }
}
const ampersand: Drawer = (p) => {
  const w = CAP * 0.80
  const x0 = LSB
  const cx = x0 + w * 0.42
  const upperCY = CAP * 0.74
  const upperR = CAP * 0.22
  ellipse(p, cx, upperCY, upperR, upperR)
  ellipse(p, cx, upperCY, upperR - STROKE, upperR - STROKE, true)
  const lowerCY = CAP * 0.28
  const lowerRX = w * 0.46
  const lowerRY = CAP * 0.28
  const lowerCX = x0 + w * 0.46
  halfRing(p, lowerCX, lowerCY, lowerRX, lowerRY, STROKE, 'left')
  rect(p, lowerCX, lowerCY + lowerRY - STROKE, lowerRX * 0.45, STROKE)
  legStroke(p, lowerCX + lowerRX * 0.55, cx - upperR * 0.4, STROKE, lowerCY + lowerRY * 0.4, STROKE * 0.85)
  return { advance: LSB + w + RSB }
}
const parenleft: Drawer = (p) => {
  const w = CAP * 0.34
  const x0 = LSB
  const cx = x0 + w + STROKE
  halfRing(p, cx, CAP / 2, w + STROKE, CAP * 0.55, STROKE * 0.85, 'left')
  return { advance: LSB + w + RSB }
}
const parenright: Drawer = (p) => {
  const w = CAP * 0.34
  const x0 = LSB
  const cx = x0 - STROKE
  halfRing(p, cx, CAP / 2, w + STROKE, CAP * 0.55, STROKE * 0.85, 'right')
  return { advance: LSB + w + RSB }
}
const slash: Drawer = (p) => {
  const w = CAP * 0.42
  const x0 = LSB
  legStroke(p, x0, x0 + w, -STROKE * 0.5, CAP, STROKE * 0.85)
  return { advance: LSB + w + RSB }
}
const middot: Drawer = (p) => {
  const r = STROKE * 0.48
  const cx = LSB + r
  ellipse(p, cx, CAP * 0.45, r, r)
  return { advance: LSB + r * 2 + RSB }
}
const emdash: Drawer = (p) => {
  const w = CAP * 1.0
  rect(p, LSB, CAP / 2 - STROKE / 2 + 10, w, STROKE * 0.78)
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Glyph table — each cap is also mapped to its lowercase codepoint
// (Summitgrade 1935 is an all-caps face).
// ---------------------------------------------------------------------------

interface GlyphSpec {
  name: string
  unicodes: number[]
  draw: Drawer
}

const GLYPHS: GlyphSpec[] = [
  { name: 'A', unicodes: [0x41, 0x61], draw: A },
  { name: 'B', unicodes: [0x42, 0x62], draw: B },
  { name: 'C', unicodes: [0x43, 0x63], draw: C },
  { name: 'D', unicodes: [0x44, 0x64], draw: D },
  { name: 'E', unicodes: [0x45, 0x65], draw: E },
  { name: 'F', unicodes: [0x46, 0x66], draw: F },
  { name: 'G', unicodes: [0x47, 0x67], draw: G },
  { name: 'H', unicodes: [0x48, 0x68], draw: H },
  { name: 'I', unicodes: [0x49, 0x69], draw: I },
  { name: 'J', unicodes: [0x4A, 0x6A], draw: J },
  { name: 'K', unicodes: [0x4B, 0x6B], draw: K },
  { name: 'L', unicodes: [0x4C, 0x6C], draw: L },
  { name: 'M', unicodes: [0x4D, 0x6D], draw: M },
  { name: 'N', unicodes: [0x4E, 0x6E], draw: N },
  { name: 'O', unicodes: [0x4F, 0x6F], draw: O },
  { name: 'P', unicodes: [0x50, 0x70], draw: P },
  { name: 'Q', unicodes: [0x51, 0x71], draw: Q },
  { name: 'R', unicodes: [0x52, 0x72], draw: R },
  { name: 'S', unicodes: [0x53, 0x73], draw: S },
  { name: 'T', unicodes: [0x54, 0x74], draw: T },
  { name: 'U', unicodes: [0x55, 0x75], draw: U },
  { name: 'V', unicodes: [0x56, 0x76], draw: V },
  { name: 'W', unicodes: [0x57, 0x77], draw: W },
  { name: 'X', unicodes: [0x58, 0x78], draw: X },
  { name: 'Y', unicodes: [0x59, 0x79], draw: Y },
  { name: 'Z', unicodes: [0x5A, 0x7A], draw: Z },
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
    const bb = path.getBoundingBox()
    const leftOverflow = LSB - bb.x1
    if (leftOverflow > 0.5) {
      for (const cmd of path.commands as Array<Record<string, number>>) {
        if ('x' in cmd) cmd.x += leftOverflow
        if ('x1' in cmd) cmd.x1 += leftOverflow
        if ('x2' in cmd) cmd.x2 += leftOverflow
      }
      advance += leftOverflow
    }
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
    familyName: 'Summitgrade 1935',
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
    description: 'Summitgrade 1935 — vintage 1930s NPS Clarendon slab-serif display caps. Routed-redwood, CCC-era signage aesthetic.',
    copyright: 'Copyright (c) 2026, NPS Fonts contributors. With Reserved Font Name "Summitgrade 1935".',
    trademark: '',
    glyphs,
  })

  if (font.tables.os2) {
    font.tables.os2.usWeightClass = 700
    font.tables.os2.achVendID = 'NPSF'
    font.tables.os2.fsSelection = 0xC0
  }

  const otfBuf = Buffer.from(font.toArrayBuffer() as ArrayBuffer)

  await mkdir(resolve(FONTS, 'otf'), { recursive: true })
  await mkdir(resolve(FONTS, 'ttf'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff2'), { recursive: true })

  await writeFile(resolve(FONTS, 'otf', 'Summitgrade1935-Regular.otf'), otfBuf)
  await writeFile(resolve(FONTS, 'ttf', 'Summitgrade1935-Regular.ttf'), otfBuf)
  await writeFile(resolve(FONTS, 'woff', 'Summitgrade1935-Regular.woff'), sfntToWoff(otfBuf))
  const woff2Buf = Buffer.from(await wawoff2.compress(otfBuf))
  await writeFile(resolve(FONTS, 'woff2', 'Summitgrade1935-Regular.woff2'), woff2Buf)

  console.log(`✓ Summitgrade 1935: ${GLYPHS.length} glyphs · ${(otfBuf.length / 1024).toFixed(1)}KB OTF`)
}

await build()
export const SUMMITGRADE_GLYPHS = GLYPHS
