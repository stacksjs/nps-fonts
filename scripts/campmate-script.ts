#!/usr/bin/env bun
/**
 * Campmate Script — USFS/NPS trailhead-sign brush-script.
 *
 * A hand-lettered connected cursive evocative of the wood/metal routed-sign
 * lettering seen on USFS and NPS trailhead markers: upright with a slight
 * ~15° italic slant, warm, outdoorsy, with real brush contrast — thick
 * downstrokes vs. thin upstrokes at roughly 3:1.
 *
 * Drawing strategy
 * ----------------
 * Each glyph is assembled from simple, non-self-intersecting primitives:
 *   - rect   — thick vertical stems and slabs
 *   - ellipse (with hole=true for counters) — bowls
 *   - halfRing — soft curves (C, S, etc.)
 *   - legStroke — diagonals (v, w, k, x, N, A…)
 *
 * The "brush contrast" look is produced by pairing a THICK rect (downstroke,
 * width STEM_THICK ≈ 110) with THIN horizontal elements (upstrokes, joins,
 * crossbars of width STEM_THIN ≈ 35). Bowls are drawn with brushBowl(),
 * which fills a ring whose vertical sides are thick and whose top/bottom
 * caps are thin — the signature pressure/release of a brush.
 *
 * After every glyph is drawn, a 15° italic shear is applied in-place. Then
 * we measure the bounding box and, if the post-shear path extends left of
 * LSB, we translate the whole path right (and pad the advance) so that
 * xMin >= LSB for every glyph — no more "Campmat  e" spacing gaps.
 *
 * Ligatures (oo, ll, tt, ee, ss) are drawn as two separate letter shapes
 * placed slightly closer together than the normal advance would allow —
 * so they touch/overlap in ink rather than render as an "=" shape. They
 * are registered via the OpenType `liga` GSUB.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { sfntToWoff } from './lib/woff.ts'

const wawoff2 = await import('wawoff2')

const ROOT = resolve(import.meta.dir, '..')
const FONTS_DIR = resolve(ROOT, 'fonts', 'campmate-script')

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const UPM = 1000
const CAP = 680
const XH = 420
const ASC = 780
const DESC = -240

// Brush contrast: thick downstroke vs. thin upstroke.
// Contrast ratio ≈ 110/35 ≈ 3.1:1 — squarely in USFS brush-script territory.
const STEM_THICK = 110
const STEM_THIN = 35
const STEM_MED = 70      // middle weight (used for bowl horizontal caps)

const LSB = 90
const RSB = 30  // tight — script letters should connect/overlap, not space out
const KAPPA = 0.5522847498307936

// Italic shear
const SLANT_DEG = 15
const SHEAR = Math.tan(SLANT_DEG * Math.PI / 180)   // ≈ 0.2679

/** Apply italic shear (x += SHEAR * y) to every command in a Path, in place. */
function applyShear(p: opentype.Path) {
  for (const cmd of p.commands) {
    const c = cmd as { type: string, x?: number, y?: number, x1?: number, y1?: number, x2?: number, y2?: number }
    if (c.y !== undefined && c.x !== undefined) c.x = c.x + SHEAR * c.y
    if (c.y1 !== undefined && c.x1 !== undefined) c.x1 = c.x1 + SHEAR * c.y1
    if (c.y2 !== undefined && c.x2 !== undefined) c.x2 = c.x2 + SHEAR * c.y2
  }
}

/**
 * Estimate the right edge of the glyph's "baseline band" — the x-max of
 * commands whose y is within the x-height range. Ascender overhang (which
 * sits above the next letter's blank LSB space) is ignored, so the glyph's
 * advance can stay tight without making letters collide at the baseline.
 */
function estimateBaselineRightEdge(p: opentype.Path): number {
  let maxX = 0
  for (const cmd of p.commands) {
    const c = cmd as { type: string, x?: number, y?: number }
    if (c.x !== undefined && c.y !== undefined && c.y <= XH + 20 && c.y >= -80) {
      if (c.x > maxX) maxX = c.x
    }
  }
  return maxX
}

// ---------------------------------------------------------------------------
// Path primitives (verbatim from summitgrade-1935.ts, plus small helpers)
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
    // bottom
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

// ---------------------------------------------------------------------------
// Derived primitives (glyph-building blocks)
// ---------------------------------------------------------------------------

/**
 * A "brush bowl": an oval ring whose vertical sides are thick (STEM_THICK)
 * and whose top/bottom caps are thin (STEM_MED). This produces the
 * pressure/release contrast of a brush pen going around a curve.
 *
 * Implementation: fill an outer ellipse, subtract an inner ellipse whose
 * x-radius is shrunk by `thick` (thick sides) and whose y-radius is shrunk
 * by `thin` (thin caps). Non-self-intersecting.
 */
function brushBowl(p: opentype.Path, cx: number, cy: number, rx: number, ry: number, thick = STEM_THICK, thin = STEM_MED) {
  ellipse(p, cx, cy, rx, ry)
  const irx = Math.max(1, rx - thick)
  const iry = Math.max(1, ry - thin)
  ellipse(p, cx, cy, irx, iry, true)
}

/** Thick vertical downstroke — a rect, centered on x=cx. */
function thickStem(p: opentype.Path, cx: number, y0: number, y1: number, w = STEM_THICK) {
  rect(p, cx - w / 2, y0, w, y1 - y0)
}

/** Thin horizontal or diagonal upstroke — just a rect (if horizontal) or legStroke (if diagonal). */
function thinBar(p: opentype.Path, x0: number, x1: number, cy: number, w = STEM_THIN) {
  rect(p, x0, cy - w / 2, x1 - x0, w)
}

/**
 * A short thin upward-curving "entry" stroke at the bottom-left of a
 * letter that sits to the right of another letter. Draws a legStroke
 * from (x, 0) rising to (x+dx, dy).
 */
function entryTick(p: opentype.Path, x: number, dx = 60, dy = 110, w = STEM_THIN) {
  legStroke(p, x, x + dx, 0, dy, w)
}

/**
 * A short thin upward-rising "exit" tail at the bottom-right of a letter,
 * going from (x, 0) up-right to (x+dx, dy). Forms the connecting hairline
 * to the next glyph.
 */
function exitTick(p: opentype.Path, x: number, dx = 70, dy = 120, w = STEM_THIN) {
  legStroke(p, x, x + dx, 0, dy, w)
}

// ---------------------------------------------------------------------------
// Glyph drawers
// ---------------------------------------------------------------------------

interface GlyphResult { advance: number }
type Drawer = (p: opentype.Path) => GlyphResult

// Body widths — design targets, not hard limits. Actual advance is also
// clamped in the build() loop against the post-shear bbox + RSB.
const LC_W = 520
const LC_NARROW = 360
const LC_WIDE = 680
const CAP_W = 720
const CAP_NARROW = 460
const CAP_WIDE = 900

// ---------------------------------------------------------------------------
// Lowercase
// ---------------------------------------------------------------------------

// a — round bowl, thick right stem, small exit tail at baseline
const a: Drawer = (p) => {
  const w = LC_W
  const rx = (w - STEM_THICK) / 2 - 20
  const ry = XH / 2
  const cx = LSB + rx + 15
  const cy = ry
  brushBowl(p, cx, cy, rx, ry)
  // thick right stem (kissed to bowl)
  const stemX = cx + rx - STEM_THICK / 2
  thickStem(p, stemX, 0, XH)
  exitTick(p, stemX + STEM_THICK / 2, 60, 90)
  return { advance: LSB + w + RSB }
}

// b — tall ascender stem on left + bowl attached to bottom half
const b: Drawer = (p) => {
  const w = LC_W
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, ASC - 40)
  const rx = (w - STEM_THICK) / 2 - 10
  const cx = stemX + rx + STEM_THICK / 2 - 10
  const cy = XH / 2
  brushBowl(p, cx, cy, rx, cy)
  return { advance: LSB + w + RSB }
}

// c — open left half-ring with thin top/bottom hooks
const c: Drawer = (p) => {
  const w = LC_W - 40
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  const cy = XH / 2
  const ry = XH / 2
  // back: thick left half
  halfRing(p, cx, cy, rx, ry, STEM_THICK, 'left')
  // thin top hook going right — START far enough left to overlap the ring wall
  const innerLeftX = cx - rx + STEM_THICK - 10  // a bit past the inner right edge
  thinBar(p, innerLeftX, cx + rx * 0.6, XH - STEM_MED / 2 - 6, STEM_MED * 0.8)
  // thin bottom hook going right
  thinBar(p, innerLeftX, cx + rx * 0.45, STEM_MED / 2 + 6, STEM_MED * 0.8)
  exitTick(p, cx + rx * 0.5, 50, 80)
  return { advance: LSB + w + RSB }
}

// d — bowl on left + tall ascender stem on right
const d: Drawer = (p) => {
  const w = LC_W
  const rx = (w - STEM_THICK) / 2 - 15
  const cx = LSB + rx + STEM_THICK / 2
  const cy = XH / 2
  brushBowl(p, cx, cy, rx, cy)
  const stemX = cx + rx - STEM_THICK / 2
  thickStem(p, stemX, 0, ASC - 40)
  exitTick(p, stemX + STEM_THICK / 2, 60, 90)
  return { advance: LSB + w + RSB }
}

// e — oval with a thin horizontal crossbar splitting the counter
const e: Drawer = (p) => {
  const w = LC_W - 30
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  const cy = XH / 2
  brushBowl(p, cx, cy, rx, cy)
  // crossbar inside counter (thin)
  const barW = rx * 2 - STEM_THICK * 0.8
  thinBar(p, cx - barW / 2, cx + barW / 2, cy, STEM_THIN)
  exitTick(p, cx + rx - STEM_THICK * 0.2, 55, 80)
  return { advance: LSB + w + RSB }
}

// f — tall ascender+descender stem with thin crossbar at x-height
const f: Drawer = (p) => {
  const w = LC_NARROW + 40
  const stemX = LSB + STEM_THICK / 2 + 30
  thickStem(p, stemX, DESC + 30, ASC - 40)
  // thin crossbar across x-height
  thinBar(p, stemX - STEM_THICK * 0.9, stemX + STEM_THICK * 1.1, XH - STEM_THIN, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// g — bowl at x-height + descender stem curving left into a hook
const g: Drawer = (p) => {
  const w = LC_W
  const rx = (w - STEM_THICK) / 2 - 10
  const cx = LSB + rx + STEM_THICK / 2
  brushBowl(p, cx, XH / 2, rx, XH / 2)
  const stemX = cx + rx - STEM_THICK / 2
  thickStem(p, stemX, DESC / 2 + 30, XH)
  // descender hook curving to the left
  halfRing(p, stemX - 65, DESC / 2 + 30, 65, 55, STEM_MED, 'bottom')
  return { advance: LSB + w + RSB }
}

// h — tall ascender stem + thin arch to right stem
const h: Drawer = (p) => {
  const w = LC_W + 40
  const leftX = LSB + STEM_THICK / 2
  thickStem(p, leftX, 0, ASC - 40)
  const rightX = LSB + w - STEM_THICK / 2 - 20
  thickStem(p, rightX, 0, XH - STEM_THIN)
  // thin arch connector between stem tops at x-height
  const archCX = (leftX + rightX) / 2
  const archRX = (rightX - leftX) / 2
  halfRing(p, archCX, XH - STEM_THIN, archRX, STEM_MED, STEM_THIN, 'top')
  exitTick(p, rightX + STEM_THICK / 2, 60, 90)
  return { advance: LSB + w + RSB }
}

// i — short stem + dot above
const i: Drawer = (p) => {
  const w = LC_NARROW - 60
  const stemX = LSB + w / 2
  thickStem(p, stemX, 0, XH)
  // dot above x-height
  ellipse(p, stemX + 12, XH + 90, STEM_THICK * 0.48, STEM_THICK * 0.48)
  exitTick(p, stemX + STEM_THICK / 2, 55, 85)
  return { advance: LSB + w + RSB }
}

// j — stem with descender hook + dot above
const j_lc: Drawer = (p) => {
  const w = LC_NARROW - 40
  const stemX = LSB + w / 2 + 10
  thickStem(p, stemX, DESC / 2 + 30, XH)
  halfRing(p, stemX - 55, DESC / 2 + 30, 55, 50, STEM_MED, 'bottom')
  ellipse(p, stemX + 15, XH + 90, STEM_THICK * 0.48, STEM_THICK * 0.48)
  return { advance: LSB + w + RSB }
}

// k — ascender stem + two thin diagonals
const k: Drawer = (p) => {
  const w = LC_W
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, ASC - 40)
  // upper leg (thin)
  legStroke(p, stemX + STEM_THICK / 2, LSB + w - 40, XH * 0.4, XH, STEM_THIN)
  // lower leg (thick — main downstroke)
  legStroke(p, stemX + STEM_THICK / 2, LSB + w - 20, XH * 0.4, 0, STEM_THICK * 0.85)
  exitTick(p, LSB + w - 20, 55, 80)
  return { advance: LSB + w + RSB }
}

// l — single tall ascender stem
const l: Drawer = (p) => {
  const w = LC_NARROW
  const stemX = LSB + w / 2
  thickStem(p, stemX, 0, ASC - 40)
  exitTick(p, stemX + STEM_THICK / 2, 60, 90)
  return { advance: LSB + w + RSB }
}

// m — 3 thick stems joined by 2 thin arches
const m: Drawer = (p) => {
  const w = 740
  const s1 = LSB + STEM_THICK / 2
  const s2 = s1 + (w - STEM_THICK) / 2
  const s3 = s1 + (w - STEM_THICK)
  thickStem(p, s1, 0, XH)
  thickStem(p, s2, 0, XH - STEM_THIN)
  thickStem(p, s3, 0, XH - STEM_THIN)
  halfRing(p, (s1 + s2) / 2, XH - STEM_THIN, (s2 - s1) / 2, STEM_MED, STEM_THIN, 'top')
  halfRing(p, (s2 + s3) / 2, XH - STEM_THIN, (s3 - s2) / 2, STEM_MED, STEM_THIN, 'top')
  exitTick(p, s3 + STEM_THICK / 2, 60, 90)
  return { advance: LSB + w + RSB }
}

// n — 2 thick stems joined by 1 thin arch
const n: Drawer = (p) => {
  const w = LC_W + 40
  const s1 = LSB + STEM_THICK / 2
  const s2 = s1 + (w - STEM_THICK)
  thickStem(p, s1, 0, XH)
  thickStem(p, s2, 0, XH - STEM_THIN)
  halfRing(p, (s1 + s2) / 2, XH - STEM_THIN, (s2 - s1) / 2, STEM_MED, STEM_THIN, 'top')
  exitTick(p, s2 + STEM_THICK / 2, 60, 90)
  return { advance: LSB + w + RSB }
}

// o — brush-bowl oval
const o: Drawer = (p) => {
  const w = LC_W - 20
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  const cy = XH / 2
  brushBowl(p, cx, cy, rx, cy)
  exitTick(p, cx + rx - STEM_THICK * 0.15, 55, 80)
  return { advance: LSB + w + RSB }
}

// p — descender stem + bowl on the right
const p_lc: Drawer = (p) => {
  const w = LC_W
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, DESC + 40, XH)
  const rx = (w - STEM_THICK) / 2 - 10
  const cx = stemX + rx + STEM_THICK / 2 - 10
  const cy = XH / 2
  brushBowl(p, cx, cy, rx, cy)
  return { advance: LSB + w + RSB }
}

// q — bowl + right descender stem
const q: Drawer = (p) => {
  const w = LC_W
  const rx = (w - STEM_THICK) / 2 - 15
  const cx = LSB + rx + STEM_THICK / 2
  brushBowl(p, cx, XH / 2, rx, XH / 2)
  const stemX = cx + rx - STEM_THICK / 2
  thickStem(p, stemX, DESC + 40, XH)
  return { advance: LSB + w + RSB }
}

// r — short stem + thin arm flicking up-right with ball terminal
const r: Drawer = (p) => {
  const w = LC_NARROW + 90
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, XH)
  const armLen = w * 0.5
  legStroke(p, stemX + STEM_THICK / 2, stemX + armLen, XH - STEM_THIN, XH - 10, STEM_THIN)
  ellipse(p, stemX + armLen, XH - 10, STEM_THICK * 0.38, STEM_THICK * 0.38)
  return { advance: LSB + w + RSB }
}

// s — brush S: thick spine diagonal, thin top+bottom arcs
// The spine must overlap the flat sides of each arc's end — we extend it
// past each arc center in y so the parallelogram fully bridges them.
const s: Drawer = (p) => {
  const w = LC_W - 60
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  const ry = XH * 0.25
  halfRing(p, cx, XH - ry, rx, ry, STEM_MED, 'top')
  halfRing(p, cx, ry, rx, ry, STEM_MED, 'bottom')
  // Thick diagonal: go from inside the bottom arc's right wall to inside the
  // top arc's left wall. Extend a bit past ry/XH-ry so the spine fully
  // overlaps the arc strokes for a clean join.
  legStroke(
    p,
    cx + rx - STEM_MED,       // bottom x — hugs inner-right of bottom arc
    cx - rx + STEM_MED,       // top x — hugs inner-left of top arc
    ry - STEM_MED * 0.3,      // start slightly inside the bottom arc
    XH - ry + STEM_MED * 0.3, // end slightly inside the top arc
    STEM_THICK * 0.95,
  )
  return { advance: LSB + w + RSB }
}

// t — stem with crossbar, slightly above x-height
const t: Drawer = (p) => {
  const w = LC_NARROW + 40
  const stemX = LSB + STEM_THICK / 2 + 20
  thickStem(p, stemX, 0, XH + 140)
  thinBar(p, stemX - STEM_THICK * 0.9, stemX + STEM_THICK * 1.1, XH - STEM_THIN, STEM_THIN)
  exitTick(p, stemX + STEM_THICK / 2, 55, 85)
  return { advance: LSB + w + RSB }
}

// u — 2 thick stems with a thin bottom loop
const u: Drawer = (p) => {
  const w = LC_W + 40
  const s1 = LSB + STEM_THICK / 2
  const s2 = s1 + (w - STEM_THICK)
  thickStem(p, s1, STEM_THIN, XH)
  thickStem(p, s2, 0, XH)
  halfRing(p, (s1 + s2) / 2, STEM_THIN, (s2 - s1) / 2, STEM_MED, STEM_THIN, 'bottom')
  exitTick(p, s2 + STEM_THICK / 2, 60, 90)
  return { advance: LSB + w + RSB }
}

// v — thick left leg + thin right leg
const v: Drawer = (p) => {
  const w = LC_W
  const x0 = LSB
  const cx = x0 + w / 2
  legStroke(p, cx, x0 + STEM_THICK / 2, 0, XH, STEM_THICK * 0.95)
  legStroke(p, cx, x0 + w - STEM_THIN, 0, XH, STEM_THIN)
  exitTick(p, x0 + w - STEM_THIN, 55, 80)
  return { advance: LSB + w + RSB }
}

// w — two v's joined
const w_lc: Drawer = (p) => {
  const w = 760
  const x0 = LSB
  const q1 = x0 + w * 0.25
  const q2 = x0 + w * 0.5
  const q3 = x0 + w * 0.75
  legStroke(p, q1, x0 + STEM_THICK / 2, 0, XH, STEM_THICK * 0.95)
  legStroke(p, q1, q2, 0, XH, STEM_THIN)
  legStroke(p, q3, q2, 0, XH, STEM_THICK * 0.95)
  legStroke(p, q3, x0 + w - STEM_THIN, 0, XH, STEM_THIN)
  exitTick(p, x0 + w - STEM_THIN, 55, 80)
  return { advance: LSB + w + RSB }
}

// x — thick down-right + thin down-left diagonal
const x_lc: Drawer = (p) => {
  const w = LC_W
  const x0 = LSB
  legStroke(p, x0 + STEM_THICK / 2, x0 + w - STEM_THICK / 2, 0, XH, STEM_THICK * 0.9)
  legStroke(p, x0 + w - STEM_THIN, x0 + STEM_THIN, 0, XH, STEM_THIN)
  exitTick(p, x0 + w - STEM_THICK / 2, 55, 80)
  return { advance: LSB + w + RSB }
}

// y — thick diagonal in + thick descender diagonal out
const y: Drawer = (p) => {
  const w = LC_W + 20
  const s1 = LSB + STEM_THICK / 2
  const s2 = s1 + (w - STEM_THICK)
  legStroke(p, (s1 + s2) / 2, s1, 0, XH, STEM_THICK * 0.95)
  legStroke(p, s2 - 30, s2, DESC + 40, XH, STEM_THICK * 0.95)
  return { advance: LSB + w + RSB }
}

// z — thin top + thin bottom bars + thick diagonal spine
const z: Drawer = (p) => {
  const w = LC_W - 40
  const x0 = LSB
  const barH = STEM_MED * 0.75
  // Thin top bar
  thinBar(p, x0, x0 + w, XH - barH / 2, barH)
  // Thin bottom bar
  thinBar(p, x0, x0 + w, barH / 2, barH)
  // Thick diagonal spine — starts INSIDE the bottom bar, ends INSIDE the top bar
  legStroke(
    p,
    x0 + w - STEM_THICK * 0.4,
    x0 + STEM_THICK * 0.4,
    barH * 0.3,
    XH - barH * 0.3,
    STEM_THICK * 0.9,
  )
  exitTick(p, x0 + w - STEM_THICK / 2, 55, 80)
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Uppercase — slightly flourished brush caps. Height = CAP. Also brush-contrast.
// ---------------------------------------------------------------------------

// A — thick left diagonal, thin right diagonal, thin crossbar
const Acap: Drawer = (p) => {
  const w = CAP_W
  const x0 = LSB
  const cx = x0 + w / 2
  legStroke(p, cx, x0 + STEM_THICK / 2, 0, CAP, STEM_THICK)
  legStroke(p, cx, x0 + w - STEM_THIN, 0, CAP, STEM_THIN)
  thinBar(p, x0 + w * 0.22, x0 + w * 0.78, CAP * 0.32, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// B — thick stem + two bowls
const Bcap: Drawer = (p) => {
  const w = CAP_W * 0.78
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  // upper bowl
  const ubRx = (w - STEM_THICK) / 2
  const ubCx = stemX + ubRx
  brushBowl(p, ubCx, CAP * 0.74, ubRx, CAP * 0.26)
  // lower bowl (slightly larger)
  const lbRx = (w - STEM_THICK) / 2 + 20
  const lbCx = stemX + lbRx
  brushBowl(p, lbCx, CAP * 0.26, lbRx, CAP * 0.26)
  return { advance: LSB + w + RSB }
}

// C — thick left half-ring with thin top/bottom hooks
const Ccap: Drawer = (p) => {
  const w = CAP_W
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  const cy = CAP / 2
  halfRing(p, cx, cy, rx, CAP / 2, STEM_THICK, 'left')
  // hooks must start INSIDE the ring wall to connect. Inner right edge is at
  // x = cx - rx + STEM_THICK; bar slightly overlaps that.
  const innerLeftX = cx - rx + STEM_THICK - 10
  thinBar(p, innerLeftX, cx + rx * 0.55, CAP - STEM_MED / 2 - 6, STEM_MED * 0.85)
  thinBar(p, innerLeftX, cx + rx * 0.45, STEM_MED / 2 + 6, STEM_MED * 0.85)
  return { advance: LSB + w + RSB }
}

// D — thick stem + thick bowl
const Dcap: Drawer = (p) => {
  const w = CAP_W
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  const rx = (w - STEM_THICK) / 2
  const cx = stemX + rx
  brushBowl(p, cx, CAP / 2, rx, CAP / 2)
  return { advance: LSB + w + RSB }
}

// E — thick stem + top/bottom thin arms + thin middle arm
const Ecap: Drawer = (p) => {
  const w = CAP_W * 0.74
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  thinBar(p, stemX, LSB + w, CAP - STEM_MED / 2 - 4, STEM_MED)
  thinBar(p, stemX, LSB + w, STEM_MED / 2 + 4, STEM_MED)
  thinBar(p, stemX, LSB + w * 0.82, CAP / 2, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// F — E minus bottom arm
const Fcap: Drawer = (p) => {
  const w = CAP_W * 0.72
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  thinBar(p, stemX, LSB + w, CAP - STEM_MED / 2 - 4, STEM_MED)
  thinBar(p, stemX, LSB + w * 0.82, CAP / 2, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// G — left half-ring + top/bottom thin hooks + inward thick spur
const Gcap: Drawer = (p) => {
  const w = CAP_W
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  const cy = CAP / 2
  halfRing(p, cx, cy, rx, CAP / 2, STEM_THICK, 'left')
  const innerLeftX = cx - rx + STEM_THICK - 10
  thinBar(p, innerLeftX, cx + rx * 0.55, CAP - STEM_MED / 2 - 6, STEM_MED * 0.85)
  thinBar(p, innerLeftX, cx + rx * 0.45, STEM_MED / 2 + 6, STEM_MED * 0.85)
  // thick inward spur from right (starts at bar, ends mid-height)
  thickStem(p, cx + rx * 0.55 - STEM_THICK / 2, CAP * 0.3, CAP * 0.52)
  thinBar(p, cx + rx * 0.25, cx + rx * 0.55, CAP * 0.44, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// H — two thick stems + thin crossbar
const Hcap: Drawer = (p) => {
  const w = CAP_W * 0.88
  const s1 = LSB + STEM_THICK / 2
  const s2 = s1 + (w - STEM_THICK)
  thickStem(p, s1, 0, CAP)
  thickStem(p, s2, 0, CAP)
  thinBar(p, s1, s2, CAP / 2, STEM_MED * 0.9)
  return { advance: LSB + w + RSB }
}

// I — a single thick stem
const Icap: Drawer = (p) => {
  const w = CAP_NARROW * 0.7
  const stemX = LSB + w / 2
  thickStem(p, stemX, 0, CAP)
  return { advance: LSB + w + RSB }
}

// J — descender stem with hook
const Jcap: Drawer = (p) => {
  const w = CAP_W * 0.6
  const stemX = LSB + w * 0.62
  thickStem(p, stemX, STEM_THIN * 1.5, CAP)
  halfRing(p, stemX - w * 0.32, STEM_THIN * 1.5, w * 0.32, STEM_MED * 1.2, STEM_MED, 'bottom')
  return { advance: LSB + w + RSB }
}

// K — thick stem + upper thin leg + lower thick leg
const Kcap: Drawer = (p) => {
  const w = CAP_W * 0.85
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  legStroke(p, stemX + STEM_THICK / 2, LSB + w - 10, CAP * 0.48, CAP, STEM_THIN)
  legStroke(p, stemX + STEM_THICK / 2, LSB + w, CAP * 0.48, 0, STEM_THICK * 0.9)
  return { advance: LSB + w + RSB }
}

// L — thick stem + thin bottom arm
const Lcap: Drawer = (p) => {
  const w = CAP_W * 0.7
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  thinBar(p, stemX, LSB + w, STEM_MED / 2 + 4, STEM_MED)
  return { advance: LSB + w + RSB }
}

// M — two thick stems + two thin diagonals meeting at a low V
const Mcap: Drawer = (p) => {
  const w = CAP_W * 1.1
  const s1 = LSB + STEM_THICK / 2
  const s2 = s1 + (w - STEM_THICK)
  const mid = (s1 + s2) / 2
  thickStem(p, s1, 0, CAP)
  thickStem(p, s2, 0, CAP)
  legStroke(p, s1, mid, CAP, CAP * 0.28, STEM_THIN)
  legStroke(p, s2, mid, CAP, CAP * 0.28, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// N — two thick stems + thick diagonal top-left -> bottom-right
const Ncap: Drawer = (p) => {
  const w = CAP_W * 0.92
  const s1 = LSB + STEM_THICK / 2
  const s2 = s1 + (w - STEM_THICK)
  thickStem(p, s1, 0, CAP)
  thickStem(p, s2, 0, CAP)
  legStroke(p, s1, s2, CAP, 0, STEM_THICK * 0.85)
  return { advance: LSB + w + RSB }
}

// O — brush bowl
const Ocap: Drawer = (p) => {
  const w = CAP_W
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  brushBowl(p, cx, CAP / 2, rx, CAP / 2)
  return { advance: LSB + w + RSB }
}

// P — thick stem + upper bowl
const Pcap: Drawer = (p) => {
  const w = CAP_W * 0.78
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  const rx = (w - STEM_THICK) / 2
  brushBowl(p, stemX + rx, CAP * 0.72, rx, CAP * 0.28)
  return { advance: LSB + w + RSB }
}

// Q — brush bowl with a thick tail slash
const Qcap: Drawer = (p) => {
  const w = CAP_W
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  brushBowl(p, cx, CAP / 2, rx, CAP / 2)
  legStroke(p, cx + rx * 0.3, cx + rx + STEM_THICK * 0.8, CAP * 0.22, -STEM_THICK * 0.8, STEM_THICK * 0.85)
  return { advance: LSB + w + RSB }
}

// R — stem + upper bowl + thick leg
const Rcap: Drawer = (p) => {
  const w = CAP_W * 0.88
  const stemX = LSB + STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  const rx = (w - STEM_THICK) / 2 - 30
  brushBowl(p, stemX + rx, CAP * 0.72, rx, CAP * 0.28)
  legStroke(p, stemX + rx, LSB + w, CAP * 0.44, 0, STEM_THICK * 0.9)
  return { advance: LSB + w + RSB }
}

// S — matches the LC s but at CAP height
const Scap: Drawer = (p) => {
  const w = CAP_W * 0.72
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  const ry = CAP * 0.25
  halfRing(p, cx, CAP - ry, rx, ry, STEM_MED, 'top')
  halfRing(p, cx, ry, rx, ry, STEM_MED, 'bottom')
  legStroke(
    p,
    cx + rx - STEM_MED,
    cx - rx + STEM_MED,
    ry - STEM_MED * 0.3,
    CAP - ry + STEM_MED * 0.3,
    STEM_THICK * 0.95,
  )
  return { advance: LSB + w + RSB }
}

// T — thick stem + thin top bar
const Tcap: Drawer = (p) => {
  const w = CAP_W * 0.88
  const cx = LSB + w / 2
  thickStem(p, cx, 0, CAP)
  thinBar(p, LSB, LSB + w, CAP - STEM_MED / 2 - 4, STEM_MED)
  return { advance: LSB + w + RSB }
}

// U — two thick stems + thin bottom curve
const Ucap: Drawer = (p) => {
  const w = CAP_W * 0.92
  const s1 = LSB + STEM_THICK / 2
  const s2 = s1 + (w - STEM_THICK)
  thickStem(p, s1, CAP * 0.3, CAP)
  thickStem(p, s2, 0, CAP)
  halfRing(p, (s1 + s2) / 2, CAP * 0.3, (s2 - s1) / 2, CAP * 0.3, STEM_THICK, 'bottom')
  return { advance: LSB + w + RSB }
}

// V — thick left + thin right
const Vcap: Drawer = (p) => {
  const w = CAP_W
  const x0 = LSB
  const cx = x0 + w / 2
  legStroke(p, cx, x0 + STEM_THICK / 2, 0, CAP, STEM_THICK)
  legStroke(p, cx, x0 + w - STEM_THIN, 0, CAP, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// W — two V's side-by-side
const Wcap: Drawer = (p) => {
  const w = CAP_WIDE + 40
  const x0 = LSB
  const q1 = x0 + w * 0.25
  const q2 = x0 + w * 0.5
  const q3 = x0 + w * 0.75
  legStroke(p, q1, x0 + STEM_THICK / 2, 0, CAP, STEM_THICK)
  legStroke(p, q1, q2, 0, CAP, STEM_THIN)
  legStroke(p, q3, q2, 0, CAP, STEM_THICK)
  legStroke(p, q3, x0 + w - STEM_THIN, 0, CAP, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// X — thick down-right + thin down-left diagonal
const Xcap: Drawer = (p) => {
  const w = CAP_W * 0.88
  const x0 = LSB
  legStroke(p, x0 + STEM_THICK / 2, x0 + w - STEM_THICK / 2, 0, CAP, STEM_THICK)
  legStroke(p, x0 + w - STEM_THIN, x0 + STEM_THIN, 0, CAP, STEM_THIN)
  return { advance: LSB + w + RSB }
}

// Y — thick left diagonal + thin right diagonal + thick stem
const Ycap: Drawer = (p) => {
  const w = CAP_W * 0.9
  const x0 = LSB
  const cx = x0 + w / 2
  legStroke(p, cx, x0 + STEM_THICK / 2, CAP / 2, CAP, STEM_THICK)
  legStroke(p, cx, x0 + w - STEM_THIN, CAP / 2, CAP, STEM_THIN)
  thickStem(p, cx, 0, CAP / 2 + STEM_THICK / 2)
  return { advance: LSB + w + RSB }
}

// Z — thin top + thin bottom bars + thick diagonal spine
const Zcap: Drawer = (p) => {
  const w = CAP_W * 0.85
  const x0 = LSB
  thinBar(p, x0, x0 + w, CAP - STEM_MED / 2, STEM_MED)
  thinBar(p, x0, x0 + w, STEM_MED / 2, STEM_MED)
  legStroke(
    p,
    x0 + w - STEM_THICK * 0.4,
    x0 + STEM_THICK * 0.4,
    STEM_MED * 0.5,
    CAP - STEM_MED * 0.5,
    STEM_THICK * 0.95,
  )
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Digits (lined, at CAP height)
// ---------------------------------------------------------------------------

const dZero: Drawer = (p) => {
  const w = CAP_W * 0.58
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  brushBowl(p, cx, CAP / 2, rx, CAP / 2)
  return { advance: LSB + w + RSB }
}

const dOne: Drawer = (p) => {
  const w = CAP_W * 0.42
  const stemX = LSB + w / 2
  thickStem(p, stemX, 0, CAP)
  legStroke(p, stemX - w * 0.3, stemX, CAP * 0.78, CAP, STEM_THIN)
  thinBar(p, stemX - w * 0.35, stemX + w * 0.35, STEM_MED / 2 + 4, STEM_MED)
  return { advance: LSB + w + RSB }
}

const dTwo: Drawer = (p) => {
  const w = CAP_W * 0.58
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  halfRing(p, cx, CAP * 0.72, rx, CAP * 0.28, STEM_THICK, 'top')
  legStroke(p, LSB + w - STEM_THICK / 2, LSB + STEM_THIN, CAP * 0.5, STEM_MED, STEM_THICK * 0.85)
  thinBar(p, LSB, LSB + w, STEM_MED / 2 + 4, STEM_MED)
  return { advance: LSB + w + RSB }
}

const dThree: Drawer = (p) => {
  const w = CAP_W * 0.58
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  halfRing(p, cx, CAP * 0.72, rx, CAP * 0.28, STEM_THICK, 'right')
  halfRing(p, cx, CAP * 0.28, rx, CAP * 0.28, STEM_THICK, 'right')
  return { advance: LSB + w + RSB }
}

const dFour: Drawer = (p) => {
  const w = CAP_W * 0.62
  const stemX = LSB + w - STEM_THICK / 2
  thickStem(p, stemX, 0, CAP)
  legStroke(p, LSB + STEM_THIN, stemX - STEM_THICK / 2, CAP * 0.38, CAP, STEM_THIN)
  thinBar(p, LSB, LSB + w, CAP * 0.38, STEM_MED)
  return { advance: LSB + w + RSB }
}

const dFive: Drawer = (p) => {
  const w = CAP_W * 0.58
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  halfRing(p, cx, CAP * 0.3, rx, CAP * 0.3, STEM_THICK, 'right')
  thickStem(p, LSB + STEM_THICK / 2, CAP * 0.6, CAP)
  thinBar(p, LSB + STEM_THICK / 2, LSB + w, CAP - STEM_MED / 2 - 4, STEM_MED)
  return { advance: LSB + w + RSB }
}

const dSix: Drawer = (p) => {
  const w = CAP_W * 0.58
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  brushBowl(p, cx, CAP * 0.3, rx, CAP * 0.3)
  legStroke(p, cx - rx + STEM_THICK / 2, cx + rx * 0.3, CAP * 0.3 + STEM_THICK / 2, CAP, STEM_THICK * 0.9)
  return { advance: LSB + w + RSB }
}

const dSeven: Drawer = (p) => {
  const w = CAP_W * 0.58
  thinBar(p, LSB, LSB + w, CAP - STEM_MED / 2 - 4, STEM_MED)
  legStroke(p, LSB + w - STEM_THICK, LSB + STEM_THIN, CAP - STEM_MED, 0, STEM_THICK * 0.85)
  return { advance: LSB + w + RSB }
}

const dEight: Drawer = (p) => {
  const w = CAP_W * 0.58
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  brushBowl(p, cx, CAP * 0.72, rx * 0.9, CAP * 0.26)
  brushBowl(p, cx, CAP * 0.28, rx, CAP * 0.28)
  return { advance: LSB + w + RSB }
}

const dNine: Drawer = (p) => {
  const w = CAP_W * 0.58
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  brushBowl(p, cx, CAP * 0.7, rx, CAP * 0.3)
  legStroke(p, cx + rx - STEM_THICK / 2, cx - rx * 0.3, CAP * 0.7 - STEM_THICK / 2, 0, STEM_THICK * 0.9)
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Punctuation
// ---------------------------------------------------------------------------

const dPeriod: Drawer = (p) => {
  const r = STEM_THICK * 0.5
  const w = r * 4.5
  ellipse(p, w / 2, r, r, r)
  return { advance: w }
}

const dComma: Drawer = (p) => {
  const r = STEM_THICK * 0.5
  const w = r * 4.5
  ellipse(p, w / 2, r, r, r)
  legStroke(p, w / 2, w / 2 - r * 0.8, r, DESC * 0.35, r * 1.1)
  return { advance: w }
}

const dColon: Drawer = (p) => {
  const r = STEM_THICK * 0.5
  const w = r * 4.5
  ellipse(p, w / 2, r, r, r)
  ellipse(p, w / 2, XH - r, r, r)
  return { advance: w }
}

const dSemicolon: Drawer = (p) => {
  const r = STEM_THICK * 0.5
  const w = r * 4.5
  ellipse(p, w / 2, XH - r, r, r)
  ellipse(p, w / 2, r, r, r)
  legStroke(p, w / 2, w / 2 - r * 0.8, r, DESC * 0.35, r * 1.1)
  return { advance: w }
}

const dExclam: Drawer = (p) => {
  const w = CAP_NARROW * 0.5
  const cx = LSB + w / 2
  thickStem(p, cx, XH * 0.4, CAP)
  ellipse(p, cx, STEM_THICK * 0.5, STEM_THICK * 0.5, STEM_THICK * 0.5)
  return { advance: LSB + w + RSB }
}

const dQuestion: Drawer = (p) => {
  const w = CAP_W * 0.55
  const rx = (w - STEM_THICK) / 2
  const cx = LSB + rx + STEM_THICK / 2
  halfRing(p, cx, CAP * 0.75, rx, CAP * 0.2, STEM_THICK, 'top')
  thickStem(p, cx + rx * 0.1, CAP * 0.32, CAP * 0.55)
  ellipse(p, cx + rx * 0.1, STEM_THICK * 0.5, STEM_THICK * 0.5, STEM_THICK * 0.5)
  return { advance: LSB + w + RSB }
}

const dHyphen: Drawer = (p) => {
  const w = CAP_W * 0.42
  thinBar(p, LSB, LSB + w, XH * 0.5, STEM_MED)
  return { advance: LSB + w + RSB }
}

const dApostrophe: Drawer = (p) => {
  const w = CAP_NARROW * 0.5
  const cx = LSB + w / 2
  legStroke(p, cx, cx - 10, CAP * 0.72, CAP * 0.98, STEM_THICK)
  return { advance: LSB + w + RSB }
}

const dQuotedbl: Drawer = (p) => {
  const w = CAP_NARROW * 0.85
  const cx0 = LSB + w * 0.3
  const cx1 = LSB + w * 0.7
  legStroke(p, cx0, cx0 - 10, CAP * 0.72, CAP * 0.98, STEM_THICK)
  legStroke(p, cx1, cx1 - 10, CAP * 0.72, CAP * 0.98, STEM_THICK)
  return { advance: LSB + w + RSB }
}

const dAmpersand: Drawer = (p) => {
  const w = CAP_W * 0.9
  brushBowl(p, LSB + w * 0.3, CAP * 0.76, w * 0.22, CAP * 0.18)
  brushBowl(p, LSB + w * 0.42, CAP * 0.28, w * 0.3, CAP * 0.25)
  legStroke(p, LSB + w * 0.18, LSB + w * 0.88, CAP * 0.1, CAP * 0.55, STEM_THICK * 0.85)
  return { advance: LSB + w + RSB }
}

const dParenLeft: Drawer = (p) => {
  const w = CAP_NARROW * 0.55
  halfRing(p, LSB + w, CAP * 0.45, w * 0.85, CAP * 0.6, STEM_MED, 'left')
  return { advance: LSB + w + RSB }
}

const dParenRight: Drawer = (p) => {
  const w = CAP_NARROW * 0.55
  halfRing(p, LSB, CAP * 0.45, w * 0.85, CAP * 0.6, STEM_MED, 'right')
  return { advance: LSB + w + RSB }
}

const dSlash: Drawer = (p) => {
  const w = CAP_W * 0.5
  legStroke(p, LSB, LSB + w, -STEM_THICK * 0.4, CAP, STEM_THICK * 0.85)
  return { advance: LSB + w + RSB }
}

const dMiddot: Drawer = (p) => {
  const r = STEM_THICK * 0.5
  const adv = r * 5
  ellipse(p, adv / 2, XH * 0.5, r, r)
  return { advance: adv }
}

const dEmdash: Drawer = (p) => {
  const w = CAP
  thinBar(p, LSB, LSB + w, XH * 0.5, STEM_MED)
  return { advance: LSB + w + RSB }
}

// ---------------------------------------------------------------------------
// Ligatures — each ligature draws two full copies of the letter placed
// slightly closer together than normal, so that the two shapes kiss or
// overlap in ink rather than render as a separated "=" sign.
// ---------------------------------------------------------------------------

// o_o — two bowls close together
const ooLig: Drawer = (p) => {
  const w = LC_W - 20
  const rx = (w - STEM_THICK) / 2
  const cy = XH / 2
  const cx1 = LSB + rx + STEM_THICK / 2
  // offset second bowl by roughly bowl width minus overlap
  const gap = rx * 2 + STEM_THICK - 20
  const cx2 = cx1 + gap
  brushBowl(p, cx1, cy, rx, cy)
  brushBowl(p, cx2, cy, rx, cy)
  exitTick(p, cx2 + rx - STEM_THICK * 0.15, 55, 80)
  const right = cx2 + rx + STEM_THICK / 2
  return { advance: right - LSB + LSB + RSB }
}

// l_l — two tall ascender stems close together
const llLig: Drawer = (p) => {
  const w = LC_NARROW
  const s1 = LSB + w / 2
  const s2 = s1 + w - 20    // second l tucked in
  thickStem(p, s1, 0, ASC - 40)
  thickStem(p, s2, 0, ASC - 40)
  exitTick(p, s2 + STEM_THICK / 2, 60, 90)
  return { advance: s2 + STEM_THICK / 2 - LSB + LSB + RSB }
}

// t_t — two stems sharing a single long thin crossbar
const ttLig: Drawer = (p) => {
  const stemSpan = LC_NARROW + 40
  const s1 = LSB + STEM_THICK / 2 + 20
  const s2 = s1 + stemSpan - 40
  thickStem(p, s1, 0, XH + 140)
  thickStem(p, s2, 0, XH + 140)
  // shared thin crossbar spanning both
  thinBar(p, s1 - STEM_THICK * 0.9, s2 + STEM_THICK * 1.1, XH - STEM_THIN, STEM_THIN)
  exitTick(p, s2 + STEM_THICK / 2, 55, 85)
  return { advance: s2 + STEM_THICK / 2 - LSB + LSB + RSB }
}

// e_e — two e's close together
const eeLig: Drawer = (p) => {
  const w = LC_W - 30
  const rx = (w - STEM_THICK) / 2
  const cy = XH / 2
  const cx1 = LSB + rx + STEM_THICK / 2
  const gap = rx * 2 + STEM_THICK - 20
  const cx2 = cx1 + gap
  brushBowl(p, cx1, cy, rx, cy)
  const barW = rx * 2 - STEM_THICK * 0.8
  thinBar(p, cx1 - barW / 2, cx1 + barW / 2, cy, STEM_THIN)
  brushBowl(p, cx2, cy, rx, cy)
  thinBar(p, cx2 - barW / 2, cx2 + barW / 2, cy, STEM_THIN)
  exitTick(p, cx2 + rx - STEM_THICK * 0.2, 55, 80)
  return { advance: cx2 + rx + STEM_THICK / 2 - LSB + LSB + RSB }
}

// s_s — two s shapes close together
const ssLig: Drawer = (p) => {
  const w = LC_W - 60
  const rx = (w - STEM_THICK) / 2
  const cx1 = LSB + rx + STEM_THICK / 2
  const gap = rx * 2 + STEM_THICK - 15
  const cx2 = cx1 + gap
  const ry = XH * 0.25
  halfRing(p, cx1, XH - ry, rx, ry, STEM_MED, 'top')
  halfRing(p, cx1, ry, rx, ry, STEM_MED, 'bottom')
  legStroke(p, cx1 + rx * 0.55, cx1 - rx * 0.55, ry, XH - ry, STEM_THICK * 0.85)
  halfRing(p, cx2, XH - ry, rx, ry, STEM_MED, 'top')
  halfRing(p, cx2, ry, rx, ry, STEM_MED, 'bottom')
  legStroke(p, cx2 + rx * 0.55, cx2 - rx * 0.55, ry, XH - ry, STEM_THICK * 0.85)
  return { advance: cx2 + rx + STEM_THICK / 2 - LSB + LSB + RSB }
}

// ---------------------------------------------------------------------------
// Glyph table
// ---------------------------------------------------------------------------

interface GlyphSpec {
  name: string
  unicode: number | null
  draw: Drawer
}

const GLYPHS: GlyphSpec[] = [
  { name: 'a', unicode: 0x61, draw: a },
  { name: 'b', unicode: 0x62, draw: b },
  { name: 'c', unicode: 0x63, draw: c },
  { name: 'd', unicode: 0x64, draw: d },
  { name: 'e', unicode: 0x65, draw: e },
  { name: 'f', unicode: 0x66, draw: f },
  { name: 'g', unicode: 0x67, draw: g },
  { name: 'h', unicode: 0x68, draw: h },
  { name: 'i', unicode: 0x69, draw: i },
  { name: 'j', unicode: 0x6A, draw: j_lc },
  { name: 'k', unicode: 0x6B, draw: k },
  { name: 'l', unicode: 0x6C, draw: l },
  { name: 'm', unicode: 0x6D, draw: m },
  { name: 'n', unicode: 0x6E, draw: n },
  { name: 'o', unicode: 0x6F, draw: o },
  { name: 'p', unicode: 0x70, draw: p_lc },
  { name: 'q', unicode: 0x71, draw: q },
  { name: 'r', unicode: 0x72, draw: r },
  { name: 's', unicode: 0x73, draw: s },
  { name: 't', unicode: 0x74, draw: t },
  { name: 'u', unicode: 0x75, draw: u },
  { name: 'v', unicode: 0x76, draw: v },
  { name: 'w', unicode: 0x77, draw: w_lc },
  { name: 'x', unicode: 0x78, draw: x_lc },
  { name: 'y', unicode: 0x79, draw: y },
  { name: 'z', unicode: 0x7A, draw: z },
  { name: 'A', unicode: 0x41, draw: Acap },
  { name: 'B', unicode: 0x42, draw: Bcap },
  { name: 'C', unicode: 0x43, draw: Ccap },
  { name: 'D', unicode: 0x44, draw: Dcap },
  { name: 'E', unicode: 0x45, draw: Ecap },
  { name: 'F', unicode: 0x46, draw: Fcap },
  { name: 'G', unicode: 0x47, draw: Gcap },
  { name: 'H', unicode: 0x48, draw: Hcap },
  { name: 'I', unicode: 0x49, draw: Icap },
  { name: 'J', unicode: 0x4A, draw: Jcap },
  { name: 'K', unicode: 0x4B, draw: Kcap },
  { name: 'L', unicode: 0x4C, draw: Lcap },
  { name: 'M', unicode: 0x4D, draw: Mcap },
  { name: 'N', unicode: 0x4E, draw: Ncap },
  { name: 'O', unicode: 0x4F, draw: Ocap },
  { name: 'P', unicode: 0x50, draw: Pcap },
  { name: 'Q', unicode: 0x51, draw: Qcap },
  { name: 'R', unicode: 0x52, draw: Rcap },
  { name: 'S', unicode: 0x53, draw: Scap },
  { name: 'T', unicode: 0x54, draw: Tcap },
  { name: 'U', unicode: 0x55, draw: Ucap },
  { name: 'V', unicode: 0x56, draw: Vcap },
  { name: 'W', unicode: 0x57, draw: Wcap },
  { name: 'X', unicode: 0x58, draw: Xcap },
  { name: 'Y', unicode: 0x59, draw: Ycap },
  { name: 'Z', unicode: 0x5A, draw: Zcap },
  { name: 'zero', unicode: 0x30, draw: dZero },
  { name: 'one', unicode: 0x31, draw: dOne },
  { name: 'two', unicode: 0x32, draw: dTwo },
  { name: 'three', unicode: 0x33, draw: dThree },
  { name: 'four', unicode: 0x34, draw: dFour },
  { name: 'five', unicode: 0x35, draw: dFive },
  { name: 'six', unicode: 0x36, draw: dSix },
  { name: 'seven', unicode: 0x37, draw: dSeven },
  { name: 'eight', unicode: 0x38, draw: dEight },
  { name: 'nine', unicode: 0x39, draw: dNine },
  { name: 'period', unicode: 0x2E, draw: dPeriod },
  { name: 'comma', unicode: 0x2C, draw: dComma },
  { name: 'colon', unicode: 0x3A, draw: dColon },
  { name: 'semicolon', unicode: 0x3B, draw: dSemicolon },
  { name: 'exclam', unicode: 0x21, draw: dExclam },
  { name: 'question', unicode: 0x3F, draw: dQuestion },
  { name: 'hyphen', unicode: 0x2D, draw: dHyphen },
  { name: 'apostrophe', unicode: 0x27, draw: dApostrophe },
  { name: 'quotedbl', unicode: 0x22, draw: dQuotedbl },
  { name: 'ampersand', unicode: 0x26, draw: dAmpersand },
  { name: 'parenleft', unicode: 0x28, draw: dParenLeft },
  { name: 'parenright', unicode: 0x29, draw: dParenRight },
  { name: 'slash', unicode: 0x2F, draw: dSlash },
  { name: 'middot', unicode: 0x00B7, draw: dMiddot },
  { name: 'emdash', unicode: 0x2014, draw: dEmdash },
  // Ligatures — no unicode, accessed via GSUB
  { name: 'o_o', unicode: null, draw: ooLig },
  { name: 'l_l', unicode: null, draw: llLig },
  { name: 't_t', unicode: null, draw: ttLig },
  { name: 'e_e', unicode: null, draw: eeLig },
  { name: 's_s', unicode: null, draw: ssLig },
]

// ---------------------------------------------------------------------------
// Build: shear, auto-pad LSB, clamp advance to bbox + RSB.
// ---------------------------------------------------------------------------

async function build() {
  const notdef = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: LC_W + LSB + RSB,
    path: new opentype.Path(),
  })
  const space = new opentype.Glyph({
    name: 'space',
    unicode: 0x20,
    advanceWidth: Math.round(LC_W * 0.5),
    path: new opentype.Path(),
  })
  ;(space as opentype.Glyph & { unicodes: number[] }).unicodes = [0x20, 0xA0]

  const glyphs: opentype.Glyph[] = [notdef, space]
  const indexByName: Record<string, number> = {}

  for (const spec of GLYPHS) {
    const path = new opentype.Path()
    let { advance } = spec.draw(path)

    // 1) Apply italic shear to every path command.
    applyShear(path)

    // 2) Normalize horizontal position. Shear pushes high-y points rightward,
    //    so after shear the visible bbox typically starts well to the right
    //    of the intended LSB. We translate the path so xMin == LSB — this
    //    both prevents paths extending left of LSB (the "Campmat  e" bug)
    //    and pulls rightward-drifted glyphs back in, so letters don't have
    //    huge left-side whitespace. The advance is reduced by the same
    //    amount so the next letter sits right where we want.
    const bb = path.getBoundingBox()
    const dx = LSB - bb.x1
    if (Math.abs(dx) > 0.5) {
      for (const cmd of path.commands as Array<Record<string, number>>) {
        if ('x' in cmd) cmd.x += dx
        if ('x1' in cmd) cmd.x1 += dx
        if ('x2' in cmd) cmd.x2 += dx
      }
      advance += dx
    }

    // 3) Script faces overlap by design: the top of this glyph (pushed
    //    right by shear) is allowed to hang over the LSB whitespace of
    //    the next glyph. We therefore do NOT clamp advance to bbox.x2 + RSB.
    //    Instead, we only ensure the *baseline* right edge (x-height and
    //    below) plus RSB fits; the ascender overhang is permitted.
    const baselineRight = estimateBaselineRightEdge(path)
    const minAdvance = baselineRight + RSB
    if (advance < minAdvance) advance = minAdvance

    const g = new opentype.Glyph({
      name: spec.name,
      unicode: spec.unicode ?? 0,
      advanceWidth: Math.round(advance),
      path,
    })
    indexByName[spec.name] = glyphs.length
    glyphs.push(g)
  }

  const font = new opentype.Font({
    familyName: 'Campmate Script',
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: ASC,
    descender: DESC,
    designer: 'NPS Fonts contributors',
    designerURL: 'https://github.com/stacksjs/nps-fonts',
    manufacturer: 'NPS Fonts',
    license: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
    licenseURL: 'https://openfontlicense.org',
    version: '0.9.0',
    description: 'Campmate Script — USFS/NPS trailhead-sign brush-script. Connected cursive with brush contrast (thick downstrokes, thin upstrokes) and 15° italic slant. Includes oo/ll/tt/ee/ss ligatures via OpenType liga GSUB.',
    copyright: 'Copyright (c) 2026, NPS Fonts contributors. With Reserved Font Name "Campmate Script".',
    trademark: '',
    glyphs,
  })

  if (font.tables.os2) {
    font.tables.os2.usWeightClass = 500
    font.tables.os2.achVendID = 'NPSF'
    font.tables.os2.fsSelection = 0x41  // italic + regular
  }
  if (font.tables.post) {
    font.tables.post.italicAngle = -SLANT_DEG
  }

  // GSUB `liga`
  const ligaturePairs: [string, string, string][] = [
    ['o', 'o', 'o_o'],
    ['l', 'l', 'l_l'],
    ['t', 't', 't_t'],
    ['e', 'e', 'e_e'],
    ['s', 's', 's_s'],
  ]
  const sub = font.substitution as unknown as {
    add: (feature: string, entry: { sub: number[], by: number }) => void
  }
  for (const [aName, bName, lig] of ligaturePairs) {
    sub.add('liga', {
      sub: [indexByName[aName]!, indexByName[bName]!],
      by: indexByName[lig]!,
    })
  }

  const otfBuf = Buffer.from(font.toArrayBuffer() as ArrayBuffer)

  await mkdir(resolve(FONTS_DIR, 'otf'), { recursive: true })
  await mkdir(resolve(FONTS_DIR, 'ttf'), { recursive: true })
  await mkdir(resolve(FONTS_DIR, 'woff'), { recursive: true })
  await mkdir(resolve(FONTS_DIR, 'woff2'), { recursive: true })

  await writeFile(resolve(FONTS_DIR, 'otf', 'CampmateScript-Regular.otf'), otfBuf)
  await writeFile(resolve(FONTS_DIR, 'ttf', 'CampmateScript-Regular.ttf'), otfBuf)
  await writeFile(resolve(FONTS_DIR, 'woff', 'CampmateScript-Regular.woff'), sfntToWoff(otfBuf))
  const woff2Buf = Buffer.from(await wawoff2.compress(otfBuf))
  await writeFile(resolve(FONTS_DIR, 'woff2', 'CampmateScript-Regular.woff2'), woff2Buf)

  console.log(`✓ Campmate Script: ${GLYPHS.length} glyphs (${ligaturePairs.length} ligatures) · ${(otfBuf.length / 1024).toFixed(1)}KB OTF`)
}

await build()

export const CAMPMATE_GLYPHS = GLYPHS
