#!/usr/bin/env bun
/**
 * Build the NPS Symbols parametric icon font from scratch.
 *
 * Drawn entirely with ts-fonts paths — no upstream source. Pictographs
 * are placed at PUA codepoints (U+E000+) so they don't collide with text,
 * and also at semantic ASCII letters so users can type them naturally
 * (e.g. 'M' for mountain in a "NPS Symbols" font-family stack).
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildFontFromGlyphs, encodeWOFF2Native, OTFWriter, OTGlyph, Path, type Glyph } from 'ts-fonts'
import { sfntToWoff } from './lib/woff.ts'

const ROOT = resolve(import.meta.dir, '..')
const FONTS = resolve(ROOT, 'fonts', 'nps-symbols')

const UPM = 1000
const ICON_SIZE = 800       // bounding box of icon
const ICON_BASELINE = 0     // sits on baseline
const ICON_TOP = ICON_SIZE  // grows upward
const ADVANCE = 1000        // square advance width
const PAD = 100             // visual padding inside the advance

// ---------------------------------------------------------------------------
// Path drawing helpers (small standalone copy — no shared lib needed)
// ---------------------------------------------------------------------------

const KAPPA = 0.5522847498307936

function rect(p: Path, x: number, y: number, w: number, h: number) {
  p.moveTo(x, y)
  p.lineTo(x + w, y)
  p.lineTo(x + w, y + h)
  p.lineTo(x, y + h)
  p.close()
}
function ellipse(p: Path, cx: number, cy: number, rx: number, ry: number, hole = false) {
  const kx = rx * KAPPA, ky = ry * KAPPA
  if (!hole) {
    p.moveTo(cx + rx, cy)
    p.curveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
    p.curveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
    p.curveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
    p.curveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
  } else {
    p.moveTo(cx + rx, cy)
    p.curveTo(cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry)
    p.curveTo(cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy)
    p.curveTo(cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry)
    p.curveTo(cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy)
  }
  p.close()
}
function poly(p: Path, pts: [number, number][]) {
  p.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i]![0], pts[i]![1])
  p.close()
}
function strokeLine(p: Path, x1: number, y1: number, x2: number, y2: number, w: number) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy)
  if (L === 0) return
  const nx = -dy / L * w / 2, ny = dx / L * w / 2
  p.moveTo(x1 + nx, y1 + ny)
  p.lineTo(x2 + nx, y2 + ny)
  p.lineTo(x2 - nx, y2 - ny)
  p.lineTo(x1 - nx, y1 - ny)
  p.close()
}

// ---------------------------------------------------------------------------
// Icon drawers — each returns a Path centered in [PAD, UPM-PAD]
// ---------------------------------------------------------------------------

type Drawer = (p: Path) => void

/** NPS arrowhead — the iconic shield silhouette. Curved top, sloped
 *  shoulders, pointed bottom. Reads as the NPS shield even at small sizes. */
const arrowhead: Drawer = (p) => {
  const cx = ADVANCE / 2
  const top = ICON_TOP - PAD * 0.6
  const bottom = PAD * 0.4
  const half = (ICON_SIZE - PAD) * 0.45
  const shoulderY = top - ICON_SIZE * 0.2
  const tipDepth = ICON_SIZE * 0.15
  // Going CCW from top-left: across the curved top, down the curved
  // shoulders, in toward the central point, back up.
  p.moveTo(cx - half, shoulderY)
  // Top: gentle convex curve
  p.curveTo(
    cx - half * 0.6, top + ICON_SIZE * 0.05,
    cx + half * 0.6, top + ICON_SIZE * 0.05,
    cx + half, shoulderY,
  )
  // Right shoulder slopes down with slight curve
  p.curveTo(
    cx + half, shoulderY - ICON_SIZE * 0.18,
    cx + half * 0.55, bottom + tipDepth + ICON_SIZE * 0.05,
    cx + half * 0.42, bottom + tipDepth,
  )
  // Right side curves in toward the bottom point
  p.curveTo(
    cx + half * 0.32, bottom + tipDepth * 0.5,
    cx + half * 0.12, bottom,
    cx, bottom,
  )
  // Mirror back up the left side
  p.curveTo(
    cx - half * 0.12, bottom,
    cx - half * 0.32, bottom + tipDepth * 0.5,
    cx - half * 0.42, bottom + tipDepth,
  )
  p.curveTo(
    cx - half * 0.55, bottom + tipDepth + ICON_SIZE * 0.05,
    cx - half, shoulderY - ICON_SIZE * 0.18,
    cx - half, shoulderY,
  )
  p.close()
}

const mountain: Drawer = (p) => {
  // Two clean triangular peaks of different heights, sitting on a baseline.
  // Back peak is taller, front peak is in front and to the left.
  const base = PAD + 60
  const left = PAD + 40
  const right = ADVANCE - PAD - 40
  const w = right - left
  // Single combined silhouette traced left-to-right then back along the base.
  // Front peak apex
  const frontApex = [left + w * 0.32, base + ICON_SIZE * 0.55] as const
  // Valley between peaks
  const valley = [left + w * 0.58, base + ICON_SIZE * 0.32] as const
  // Back peak apex
  const backApex = [left + w * 0.7, base + ICON_SIZE * 0.85] as const
  // Right baseline corner
  poly(p, [
    [left, base],
    [frontApex[0], frontApex[1]],
    [valley[0], valley[1]],
    [backApex[0], backApex[1]],
    [right, base],
  ])
  // Snow cap on back peak (triangular cutout)
  const snowH = ICON_SIZE * 0.18
  const snowAt = (y: number, slopeL: number, slopeR: number, apexX: number, apexY: number) => {
    const dy = apexY - y
    return [apexX - slopeL * dy, apexX + slopeR * dy]
  }
  void snowAt
  // Approximate snow cap as small triangle near the back-peak apex
  poly(p, [
    [backApex[0] - ICON_SIZE * 0.07, backApex[1] - snowH],
    [backApex[0] + ICON_SIZE * 0.07, backApex[1] - snowH],
    [backApex[0], backApex[1]],
  ].reverse() as [number, number][])
}

const tent: Drawer = (p) => {
  // Triangular A-frame tent with door slit
  const cx = ADVANCE / 2
  const base = PAD + 80
  const top = base + ICON_SIZE * 0.85
  const halfBase = (ICON_SIZE - PAD * 2) * 0.45
  // Outer triangle
  poly(p, [
    [cx - halfBase, base],
    [cx + halfBase, base],
    [cx + halfBase * 0.05, top],
    [cx - halfBase * 0.05, top],
  ])
  // Door cutout (counter)
  poly(p, [
    [cx - halfBase * 0.18, base],
    [cx - halfBase * 0.18, base + ICON_SIZE * 0.35],
    [cx, base + ICON_SIZE * 0.5],
    [cx + halfBase * 0.18, base + ICON_SIZE * 0.35],
    [cx + halfBase * 0.18, base],
  ].reverse() as [number, number][])
}

const campfire: Drawer = (p) => {
  // Two angled logs (X pattern) at the base + a licking flame above.
  const cx = ADVANCE / 2
  const base = PAD + 60
  const logLen = ICON_SIZE * 0.7
  const logW = ICON_SIZE * 0.09
  // Two angled logs forming an X
  strokeLine(p, cx - logLen / 2, base + logW * 0.6, cx + logLen / 2, base, logW)
  strokeLine(p, cx - logLen / 2, base, cx + logLen / 2, base + logW * 0.6, logW)
  // Flame: a teardrop with curling tip, going up
  const flameBase = base + logW * 1.4
  const flameTop = base + ICON_SIZE * 0.85
  const flameH = flameTop - flameBase
  const halfW = ICON_SIZE * 0.22
  // Going CCW: start at left-base of flame, sweep right around the bottom,
  // up the right side with a slight inward curl, hook over the top, down
  // the left side with a deeper inward curl.
  p.moveTo(cx - halfW, flameBase)
  p.curveTo(cx - halfW, flameBase - ICON_SIZE * 0.05, cx + halfW, flameBase - ICON_SIZE * 0.05, cx + halfW, flameBase)
  // Right side rising
  p.curveTo(cx + halfW * 0.95, flameBase + flameH * 0.35, cx + halfW * 0.55, flameBase + flameH * 0.55, cx + halfW * 0.6, flameBase + flameH * 0.7)
  // Curl over the top (off-center peak — flame leans right)
  p.curveTo(cx + halfW * 0.65, flameTop - flameH * 0.05, cx + halfW * 0.25, flameTop, cx + ICON_SIZE * 0.04, flameTop - flameH * 0.05)
  // Left side coming down with an inward S-curve
  p.curveTo(cx - halfW * 0.15, flameTop - flameH * 0.2, cx - halfW * 0.6, flameBase + flameH * 0.55, cx - halfW * 0.7, flameBase + flameH * 0.4)
  p.curveTo(cx - halfW * 0.95, flameBase + flameH * 0.2, cx - halfW * 1.05, flameBase + flameH * 0.05, cx - halfW, flameBase)
  p.close()
}

const pine: Drawer = (p) => {
  // Three-tier conifer + trunk
  const cx = ADVANCE / 2
  const base = PAD + 40
  const trunkW = ICON_SIZE * 0.12
  const trunkH = ICON_SIZE * 0.18
  rect(p, cx - trunkW / 2, base, trunkW, trunkH)
  // Three triangular tiers, each smaller and higher
  const tiers = 3
  const top = base + trunkH
  const tierH = (ICON_SIZE - trunkH - PAD * 0.5) / (tiers + 0.5)
  for (let i = 0; i < tiers; i++) {
    const y = top + i * tierH * 0.7
    const w = (ICON_SIZE * 0.6) * (1 - i * 0.18)
    poly(p, [
      [cx - w / 2, y],
      [cx + w / 2, y],
      [cx, y + tierH * 1.2],
    ])
  }
}

const compass: Drawer = (p) => {
  // Outer ring with a prominent diamond-shaped N/S needle inside.
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  const ro = ICON_SIZE * 0.45
  const ri = ro - ICON_SIZE * 0.08
  // Outer ring (donut)
  ellipse(p, cx, cy, ro, ro)
  ellipse(p, cx, cy, ri, ri, true)
  // North needle (top, big)
  poly(p, [
    [cx, cy + ri * 0.85],
    [cx + ri * 0.18, cy],
    [cx, cy - ri * 0.05],
    [cx - ri * 0.18, cy],
  ])
  // South needle (bottom, slightly smaller — visual hierarchy)
  poly(p, [
    [cx, cy - ri * 0.85],
    [cx + ri * 0.14, cy - ri * 0.05],
    [cx, cy - ri * 0.05],
    [cx - ri * 0.14, cy - ri * 0.05],
  ])
  // Center hub
  ellipse(p, cx, cy - ri * 0.025, ri * 0.08, ri * 0.08)
}

const sun: Drawer = (p) => {
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  const r = ICON_SIZE * 0.26
  ellipse(p, cx, cy, r, r)
  // 8 chunky rays
  for (let i = 0; i < 8; i++) {
    const ang = (Math.PI * 2 * i) / 8
    const inner = r * 1.2
    const outer = r * 1.85
    strokeLine(
      p,
      cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner,
      cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer,
      ICON_SIZE * 0.09,
    )
  }
}

const moon: Drawer = (p) => {
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  const r = ICON_SIZE * 0.4
  ellipse(p, cx, cy, r, r)
  ellipse(p, cx + r * 0.4, cy, r * 0.85, r * 0.85, true)
}

const star: Drawer = (p) => {
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  const ro = ICON_SIZE * 0.42
  const ri = ro * 0.42
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI * 2 * i) / 10 - Math.PI / 2
    const r = i % 2 === 0 ? ro : ri
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r])
  }
  poly(p, pts)
}

const water: Drawer = (p) => {
  // Three sine-like wave bars
  const w = ICON_SIZE * 0.7
  const left = (ADVANCE - w) / 2
  const amp = ICON_SIZE * 0.08
  for (let i = 0; i < 3; i++) {
    const y = PAD + ICON_SIZE * (0.25 + i * 0.22)
    const t = ICON_SIZE * 0.05
    p.moveTo(left, y - t)
    p.curveTo(left + w * 0.25, y + amp - t, left + w * 0.5, y - amp - t, left + w, y - t)
    p.lineTo(left + w, y + t)
    p.curveTo(left + w * 0.5, y - amp + t, left + w * 0.25, y + amp + t, left, y + t)
    p.close()
  }
}

const trail: Drawer = (p) => {
  // Two footprints, offset
  const drawFoot = (cx: number, cy: number, w: number, h: number) => {
    // Sole oval
    ellipse(p, cx, cy, w * 0.4, h * 0.5)
    // Toe pads (5 circles)
    const toes = 5
    for (let i = 0; i < toes; i++) {
      const t = (i - 2) * 0.18
      ellipse(p, cx + t * w, cy + h * 0.5, w * 0.07, w * 0.07)
    }
  }
  drawFoot(ADVANCE * 0.32, PAD + ICON_SIZE * 0.32, ICON_SIZE * 0.28, ICON_SIZE * 0.32)
  drawFoot(ADVANCE * 0.62, PAD + ICON_SIZE * 0.62, ICON_SIZE * 0.28, ICON_SIZE * 0.32)
}

const binoculars: Drawer = (p) => {
  // Two cylinder barrels side by side with a hinge connector.
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  const barrelW = ICON_SIZE * 0.22
  const barrelH = ICON_SIZE * 0.5
  const eyeR = barrelW * 0.35
  const gap = ICON_SIZE * 0.06
  const lx = cx - gap / 2 - barrelW
  const rx = cx + gap / 2
  // Left barrel — rounded rectangle
  rect(p, lx, cy - barrelH / 2, barrelW, barrelH)
  // Eyepiece detail (hole)
  ellipse(p, lx + barrelW / 2, cy + barrelH * 0.28, eyeR, eyeR)
  ellipse(p, lx + barrelW / 2, cy + barrelH * 0.28, eyeR * 0.55, eyeR * 0.55, true)
  // Lens detail (hole)
  ellipse(p, lx + barrelW / 2, cy - barrelH * 0.28, eyeR * 1.1, eyeR * 1.1)
  ellipse(p, lx + barrelW / 2, cy - barrelH * 0.28, eyeR * 0.7, eyeR * 0.7, true)
  // Right barrel — mirror
  rect(p, rx, cy - barrelH / 2, barrelW, barrelH)
  ellipse(p, rx + barrelW / 2, cy + barrelH * 0.28, eyeR, eyeR)
  ellipse(p, rx + barrelW / 2, cy + barrelH * 0.28, eyeR * 0.55, eyeR * 0.55, true)
  ellipse(p, rx + barrelW / 2, cy - barrelH * 0.28, eyeR * 1.1, eyeR * 1.1)
  ellipse(p, rx + barrelW / 2, cy - barrelH * 0.28, eyeR * 0.7, eyeR * 0.7, true)
  // Hinge bar between barrels
  rect(p, cx - gap / 2 - 4, cy - barrelH * 0.05, gap + 8, barrelH * 0.1)
}

const flag: Drawer = (p) => {
  const cx = ADVANCE / 2
  const base = PAD + 60
  // Pole
  rect(p, cx - ICON_SIZE * 0.04, base, ICON_SIZE * 0.08, ICON_SIZE * 0.85)
  // Triangular pennant
  poly(p, [
    [cx + ICON_SIZE * 0.04, base + ICON_SIZE * 0.85],
    [cx + ICON_SIZE * 0.45, base + ICON_SIZE * 0.7],
    [cx + ICON_SIZE * 0.04, base + ICON_SIZE * 0.55],
  ])
}

const tree: Drawer = (p) => {
  // Round-canopy deciduous
  const cx = ADVANCE / 2
  const base = PAD + 40
  const trunkW = ICON_SIZE * 0.12
  const trunkH = ICON_SIZE * 0.32
  rect(p, cx - trunkW / 2, base, trunkW, trunkH)
  // Canopy
  ellipse(p, cx, base + trunkH + ICON_SIZE * 0.28, ICON_SIZE * 0.36, ICON_SIZE * 0.32)
}

const tracks: Drawer = (p) => {
  // Tire-track pair
  const w = ICON_SIZE * 0.7
  const h = ICON_SIZE * 0.5
  const left = (ADVANCE - w) / 2
  const top = PAD + ICON_SIZE / 2 - h / 2
  for (let lane = 0; lane < 2; lane++) {
    for (let i = 0; i < 6; i++) {
      const x = left + lane * w * 0.55 + i * (w * 0.4 / 6)
      rect(p, x, top, w * 0.05, h)
    }
  }
}

const shield: Drawer = (p) => {
  // Heraldic shield silhouette (badge)
  const cx = ADVANCE / 2
  const top = PAD + ICON_SIZE * 0.95
  const bottom = PAD + 40
  const half = ICON_SIZE * 0.36
  p.moveTo(cx - half, top)
  p.lineTo(cx + half, top)
  p.lineTo(cx + half, bottom + ICON_SIZE * 0.35)
  p.curveTo(cx + half, bottom, cx + half * 0.4, bottom, cx, bottom)
  p.curveTo(cx - half * 0.4, bottom, cx - half, bottom, cx - half, bottom + ICON_SIZE * 0.35)
  p.close()
}

const closed: Drawer = (p) => {
  // Filled X (no entry / closed)
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  const r = ICON_SIZE * 0.4
  strokeLine(p, cx - r, cy - r, cx + r, cy + r, ICON_SIZE * 0.18)
  strokeLine(p, cx - r, cy + r, cx + r, cy - r, ICON_SIZE * 0.18)
}

const open: Drawer = (p) => {
  // Filled checkmark (open / OK)
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  const w = ICON_SIZE * 0.45
  strokeLine(p, cx - w, cy, cx - w * 0.2, cy - w * 0.6, ICON_SIZE * 0.16)
  strokeLine(p, cx - w * 0.2, cy - w * 0.6, cx + w, cy + w * 0.5, ICON_SIZE * 0.16)
}

const trailMarker: Drawer = (p) => {
  // Diamond — classic backcountry trail blaze
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  const r = ICON_SIZE * 0.42
  poly(p, [[cx, cy + r], [cx + r * 0.6, cy], [cx, cy - r], [cx - r * 0.6, cy]])
}

const bear: Drawer = (p) => {
  // Stylized bear silhouette (round head, two ears, oval body)
  const cx = ADVANCE / 2
  const baseY = PAD + ICON_SIZE * 0.35
  // Body
  ellipse(p, cx, baseY, ICON_SIZE * 0.32, ICON_SIZE * 0.22)
  // Head
  ellipse(p, cx, baseY + ICON_SIZE * 0.36, ICON_SIZE * 0.22, ICON_SIZE * 0.18)
  // Two ears (small circles)
  ellipse(p, cx - ICON_SIZE * 0.18, baseY + ICON_SIZE * 0.5, ICON_SIZE * 0.07, ICON_SIZE * 0.07)
  ellipse(p, cx + ICON_SIZE * 0.18, baseY + ICON_SIZE * 0.5, ICON_SIZE * 0.07, ICON_SIZE * 0.07)
}

const hiker: Drawer = (p) => {
  // Stick-figure hiker with backpack
  const cx = ADVANCE * 0.45
  const base = PAD + 60
  // Head
  ellipse(p, cx, base + ICON_SIZE * 0.78, ICON_SIZE * 0.08, ICON_SIZE * 0.08)
  // Body (vertical line)
  strokeLine(p, cx, base + ICON_SIZE * 0.7, cx + ICON_SIZE * 0.05, base + ICON_SIZE * 0.35, ICON_SIZE * 0.06)
  // Arm with walking stick
  strokeLine(p, cx + ICON_SIZE * 0.02, base + ICON_SIZE * 0.55, cx + ICON_SIZE * 0.32, base + ICON_SIZE * 0.7, ICON_SIZE * 0.05)
  strokeLine(p, cx + ICON_SIZE * 0.32, base + ICON_SIZE * 0.85, cx + ICON_SIZE * 0.32, base, ICON_SIZE * 0.04)
  // Back leg
  strokeLine(p, cx + ICON_SIZE * 0.05, base + ICON_SIZE * 0.35, cx - ICON_SIZE * 0.05, base + ICON_SIZE * 0.05, ICON_SIZE * 0.06)
  // Front leg
  strokeLine(p, cx + ICON_SIZE * 0.05, base + ICON_SIZE * 0.35, cx + ICON_SIZE * 0.18, base + ICON_SIZE * 0.05, ICON_SIZE * 0.06)
  // Backpack (rectangle behind body)
  rect(p, cx - ICON_SIZE * 0.13, base + ICON_SIZE * 0.45, ICON_SIZE * 0.13, ICON_SIZE * 0.22)
}

const cloud: Drawer = (p) => {
  const cy = PAD + ICON_SIZE * 0.5
  ellipse(p, ADVANCE * 0.32, cy, ICON_SIZE * 0.14, ICON_SIZE * 0.14)
  ellipse(p, ADVANCE * 0.45, cy + ICON_SIZE * 0.06, ICON_SIZE * 0.18, ICON_SIZE * 0.18)
  ellipse(p, ADVANCE * 0.6, cy + ICON_SIZE * 0.04, ICON_SIZE * 0.16, ICON_SIZE * 0.16)
  ellipse(p, ADVANCE * 0.7, cy - ICON_SIZE * 0.02, ICON_SIZE * 0.12, ICON_SIZE * 0.12)
  rect(p, ADVANCE * 0.28, cy - ICON_SIZE * 0.08, ICON_SIZE * 0.45, ICON_SIZE * 0.12)
}

const backpack: Drawer = (p) => {
  // Hiking backpack — wide rounded body, top flap with strap, two side
  // bottle pockets, top haul loop. Reads at small sizes.
  const cx = ADVANCE / 2
  const base = PAD + 60
  const bodyW = ICON_SIZE * 0.58
  const bodyH = ICON_SIZE * 0.62
  const flapH = ICON_SIZE * 0.16
  // Two side pockets first (wider so they stick out on the sides)
  const pocketW = ICON_SIZE * 0.13
  const pocketH = bodyH * 0.55
  rect(p, cx - bodyW / 2 - pocketW * 0.6, base + bodyH * 0.18, pocketW, pocketH)
  rect(p, cx + bodyW / 2 - pocketW * 0.4, base + bodyH * 0.18, pocketW, pocketH)
  // Body (main pack)
  rect(p, cx - bodyW / 2, base, bodyW, bodyH)
  // Top flap (overhangs body)
  rect(p, cx - bodyW * 0.55, base + bodyH, bodyW * 1.1, flapH)
  // Front strap (horizontal across flap)
  rect(p, cx - bodyW * 0.55, base + bodyH + flapH * 0.3, bodyW * 1.1, ICON_SIZE * 0.025)
  // Front pocket detail (small rect on the body)
  rect(p, cx - bodyW * 0.22, base + bodyH * 0.18, bodyW * 0.44, bodyH * 0.32)
  // Top haul loop (filled half-disc on top of flap)
  const loopY = base + bodyH + flapH
  const loopR = ICON_SIZE * 0.07
  p.moveTo(cx - loopR, loopY)
  p.curveTo(cx - loopR, loopY + loopR * 1.4, cx + loopR, loopY + loopR * 1.4, cx + loopR, loopY)
  p.lineTo(cx + loopR * 0.6, loopY)
  p.curveTo(cx + loopR * 0.6, loopY + loopR, cx - loopR * 0.6, loopY + loopR, cx - loopR * 0.6, loopY)
  p.close()
}

const axe: Drawer = (p) => {
  // Hand axe / hatchet — handle running diagonally with wedge head
  const base = PAD + 50
  const top = base + ICON_SIZE * 0.85
  // Handle (slightly curved diagonal)
  const handleW = ICON_SIZE * 0.07
  strokeLine(p, ADVANCE * 0.32, base, ADVANCE * 0.62, top - ICON_SIZE * 0.15, handleW)
  // Axe head — wedge shape at the top end of the handle
  const hx = ADVANCE * 0.62
  const hy = top - ICON_SIZE * 0.15
  poly(p, [
    [hx - ICON_SIZE * 0.05, hy + ICON_SIZE * 0.06],
    [hx + ICON_SIZE * 0.18, hy + ICON_SIZE * 0.20],
    [hx + ICON_SIZE * 0.25, hy + ICON_SIZE * 0.10],
    [hx + ICON_SIZE * 0.22, hy - ICON_SIZE * 0.04],
    [hx + ICON_SIZE * 0.10, hy - ICON_SIZE * 0.10],
    [hx - ICON_SIZE * 0.02, hy - ICON_SIZE * 0.04],
  ])
  // Pommel cap at handle butt
  ellipse(p, ADVANCE * 0.32, base, ICON_SIZE * 0.05, ICON_SIZE * 0.05)
}

const waterBottle: Drawer = (p) => {
  // Tall slim insulated water bottle — body with rounded shoulders, narrow
  // neck, screw cap on top.
  const cx = ADVANCE / 2
  const base = PAD + 50
  const bodyW = ICON_SIZE * 0.36
  const bodyH = ICON_SIZE * 0.62
  const shoulderH = ICON_SIZE * 0.08
  const neckW = bodyW * 0.42
  const neckH = ICON_SIZE * 0.08
  const capW = neckW * 1.25
  const capH = ICON_SIZE * 0.07
  // Body (rectangle)
  rect(p, cx - bodyW / 2, base, bodyW, bodyH)
  // Shoulders — trapezoid narrowing to neck width
  poly(p, [
    [cx - bodyW / 2, base + bodyH],
    [cx + bodyW / 2, base + bodyH],
    [cx + neckW / 2, base + bodyH + shoulderH],
    [cx - neckW / 2, base + bodyH + shoulderH],
  ])
  // Neck
  rect(p, cx - neckW / 2, base + bodyH + shoulderH, neckW, neckH)
  // Cap (slightly wider than neck)
  rect(p, cx - capW / 2, base + bodyH + shoulderH + neckH, capW, capH)
  // Decorative label band around middle of body
  rect(p, cx - bodyW / 2 - ICON_SIZE * 0.02, base + bodyH * 0.32, bodyW + ICON_SIZE * 0.04, ICON_SIZE * 0.05)
}

const camera: Drawer = (p) => {
  // Compact camera — body silhouette with viewfinder hump on top, big lens
  // hole cut from the body, with a small filled dot at the lens center.
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE * 0.5
  const bodyW = ICON_SIZE * 0.72
  const bodyH = ICON_SIZE * 0.5
  // Viewfinder hump (small rectangle on top center)
  const vfW = bodyW * 0.32
  const vfH = ICON_SIZE * 0.12
  rect(p, cx - vfW / 2, cy + bodyH / 2, vfW, vfH)
  // Body
  rect(p, cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH)
  // Big lens HOLE cut from body (CW winding subtracts under non-zero rule)
  const lr = bodyH * 0.42
  ellipse(p, cx + bodyW * 0.08, cy, lr, lr, true)
  // Small filled iris dot at lens center
  ellipse(p, cx + bodyW * 0.08, cy, lr * 0.32, lr * 0.32)
  // Flash square at top-left of body
  rect(p, cx - bodyW * 0.42, cy + bodyH * 0.18, bodyW * 0.16, bodyH * 0.18)
}

const fish: Drawer = (p) => {
  // Side-profile fish — pointed oval body + triangular tail + dot eye
  const cx = ADVANCE / 2 - ICON_SIZE * 0.05
  const cy = PAD + ICON_SIZE / 2
  const bodyL = ICON_SIZE * 0.55
  const bodyH = ICON_SIZE * 0.32
  // Body — pointy oval (head at LEFT, tail-end at RIGHT)
  p.moveTo(cx - bodyL / 2, cy)  // head tip
  p.curveTo(cx - bodyL * 0.4, cy + bodyH / 2, cx + bodyL * 0.3, cy + bodyH / 2, cx + bodyL / 2, cy)
  p.curveTo(cx + bodyL * 0.3, cy - bodyH / 2, cx - bodyL * 0.4, cy - bodyH / 2, cx - bodyL / 2, cy)
  p.close()
  // Tail fin (triangle at right)
  poly(p, [
    [cx + bodyL / 2 - ICON_SIZE * 0.02, cy],
    [cx + bodyL / 2 + ICON_SIZE * 0.18, cy + ICON_SIZE * 0.15],
    [cx + bodyL / 2 + ICON_SIZE * 0.18, cy - ICON_SIZE * 0.15],
  ])
  // Eye dot (cut out as small hole in body)
  ellipse(p, cx - bodyL * 0.32, cy + bodyH * 0.1, ICON_SIZE * 0.025, ICON_SIZE * 0.025, true)
}

const deer: Drawer = (p) => {
  // Front-facing stag head silhouette — bold antlers above an oval head
  // with snout. Reads instantly even at small sizes (avoids the fragile
  // side-profile body+legs problem).
  const cx = ADVANCE / 2
  const baseY = PAD + ICON_SIZE * 0.22
  // Head — wider oval
  ellipse(p, cx, baseY + ICON_SIZE * 0.22, ICON_SIZE * 0.18, ICON_SIZE * 0.22)
  // Snout — narrower oval at the bottom of the head
  ellipse(p, cx, baseY + ICON_SIZE * 0.05, ICON_SIZE * 0.10, ICON_SIZE * 0.10)
  // Two ears stick out to the sides at the top of the head
  poly(p, [
    [cx - ICON_SIZE * 0.18, baseY + ICON_SIZE * 0.32],
    [cx - ICON_SIZE * 0.30, baseY + ICON_SIZE * 0.42],
    [cx - ICON_SIZE * 0.20, baseY + ICON_SIZE * 0.40],
  ])
  poly(p, [
    [cx + ICON_SIZE * 0.18, baseY + ICON_SIZE * 0.32],
    [cx + ICON_SIZE * 0.30, baseY + ICON_SIZE * 0.42],
    [cx + ICON_SIZE * 0.20, baseY + ICON_SIZE * 0.40],
  ])
  // Antlers — symmetric branching shape rising from top of head
  const antlerBase = baseY + ICON_SIZE * 0.4
  const antlerTop = baseY + ICON_SIZE * 0.78
  const drawAntler = (sign: number) => {
    const baseX = cx + sign * ICON_SIZE * 0.05
    // Main shaft going up-and-out
    strokeLine(p, baseX, antlerBase, baseX + sign * ICON_SIZE * 0.12, antlerTop, ICON_SIZE * 0.045)
    // Three prongs branching from main shaft
    const shaft = (t: number) => [
      baseX + sign * ICON_SIZE * 0.12 * t,
      antlerBase + (antlerTop - antlerBase) * t,
    ] as const
    const p1 = shaft(0.25)
    const p2 = shaft(0.55)
    const p3 = shaft(0.85)
    strokeLine(p, p1[0], p1[1], p1[0] + sign * ICON_SIZE * 0.10, p1[1] + ICON_SIZE * 0.05, ICON_SIZE * 0.035)
    strokeLine(p, p2[0], p2[1], p2[0] + sign * ICON_SIZE * 0.14, p2[1] + ICON_SIZE * 0.10, ICON_SIZE * 0.035)
    strokeLine(p, p3[0], p3[1], p3[0] + sign * ICON_SIZE * 0.06, p3[1] + ICON_SIZE * 0.08, ICON_SIZE * 0.030)
  }
  drawAntler(-1)
  drawAntler(1)
}

const canoe: Drawer = (p) => {
  // Side-view canoe — pointed crescent hull resting on imaginary water,
  // with a paddle leaning against it from above.
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE * 0.4
  const w = ICON_SIZE * 0.82
  const h = ICON_SIZE * 0.22
  // Hull traced CCW: lower edge is a deep curve (boat bottom), upper edge
  // is a shallower curve (gunwale), meeting at sharp bow & stern points.
  p.moveTo(cx - w / 2, cy)              // bow (left tip)
  p.curveTo(                              // bottom of hull (deep curve down)
    cx - w * 0.3, cy - h,
    cx + w * 0.3, cy - h,
    cx + w / 2, cy,                       // stern (right tip)
  )
  p.curveTo(                              // gunwale (shallow curve up)
    cx + w * 0.3, cy - h * 0.18,
    cx - w * 0.3, cy - h * 0.18,
    cx - w / 2, cy,
  )
  p.close()
  // Optional thwart (cross-bar across middle of hull)
  rect(p, cx - w * 0.04, cy - h * 0.32, w * 0.08, h * 0.18)
  // Paddle leaning up-right from the hull
  const px1 = cx + w * 0.1
  const py1 = cy - h * 0.05
  const px2 = cx + w * 0.42
  const py2 = cy + ICON_SIZE * 0.38
  strokeLine(p, px1, py1, px2, py2, ICON_SIZE * 0.045)
  // Paddle blade (oval at upper end)
  ellipse(p, px2 + ICON_SIZE * 0.04, py2 + ICON_SIZE * 0.08, ICON_SIZE * 0.07, ICON_SIZE * 0.13)
}

const mapIcon: Drawer = (p) => {
  // Folded map — three vertical panels with fold creases
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE * 0.5
  const w = ICON_SIZE * 0.72
  const h = ICON_SIZE * 0.55
  const panelW = w / 3
  // Three panels at slight zigzag
  poly(p, [
    [cx - w / 2, cy + h / 2],
    [cx - w / 2 + panelW, cy + h / 2 - ICON_SIZE * 0.04],
    [cx - w / 2 + panelW, cy - h / 2 - ICON_SIZE * 0.04],
    [cx - w / 2, cy - h / 2],
  ])
  poly(p, [
    [cx - w / 2 + panelW, cy + h / 2 - ICON_SIZE * 0.04],
    [cx - w / 2 + 2 * panelW, cy + h / 2 + ICON_SIZE * 0.04],
    [cx - w / 2 + 2 * panelW, cy - h / 2 + ICON_SIZE * 0.04],
    [cx - w / 2 + panelW, cy - h / 2 - ICON_SIZE * 0.04],
  ])
  poly(p, [
    [cx - w / 2 + 2 * panelW, cy + h / 2 + ICON_SIZE * 0.04],
    [cx + w / 2, cy + h / 2],
    [cx + w / 2, cy - h / 2],
    [cx - w / 2 + 2 * panelW, cy - h / 2 + ICON_SIZE * 0.04],
  ])
  // Marker pin (drop shape) on the central panel
  const px = cx + ICON_SIZE * 0.02
  const py = cy + ICON_SIZE * 0.05
  ellipse(p, px, py + ICON_SIZE * 0.04, ICON_SIZE * 0.05, ICON_SIZE * 0.05, true)
  poly(p, [
    [px - ICON_SIZE * 0.04, py + ICON_SIZE * 0.06],
    [px + ICON_SIZE * 0.04, py + ICON_SIZE * 0.06],
    [px, py - ICON_SIZE * 0.06],
  ].reverse() as [number, number][])
}

const arrow: Drawer = (p) => {
  // Right-pointing arrow (directional sign)
  const cy = PAD + ICON_SIZE / 2
  const left = PAD + 40
  const right = ADVANCE - PAD - 40
  const shaftH = ICON_SIZE * 0.18
  const headH = ICON_SIZE * 0.45
  const headLen = ICON_SIZE * 0.32
  // Shaft
  rect(p, left, cy - shaftH / 2, right - left - headLen + ICON_SIZE * 0.02, shaftH)
  // Triangular head
  poly(p, [
    [right - headLen, cy - headH / 2],
    [right, cy],
    [right - headLen, cy + headH / 2],
  ])
}

const snowflake: Drawer = (p) => {
  const cx = ADVANCE / 2
  const cy = PAD + ICON_SIZE / 2
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI * i) / 3
    const r = ICON_SIZE * 0.35
    strokeLine(p, cx, cy, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, ICON_SIZE * 0.05)
    // Small branches
    const bx = cx + Math.cos(ang) * r * 0.6
    const by = cy + Math.sin(ang) * r * 0.6
    const ang2 = ang + Math.PI / 3
    const ang3 = ang - Math.PI / 3
    strokeLine(p, bx, by, bx + Math.cos(ang2) * r * 0.2, by + Math.sin(ang2) * r * 0.2, ICON_SIZE * 0.04)
    strokeLine(p, bx, by, bx + Math.cos(ang3) * r * 0.2, by + Math.sin(ang3) * r * 0.2, ICON_SIZE * 0.04)
  }
}

// ---------------------------------------------------------------------------
// Glyph table
// ---------------------------------------------------------------------------

interface GlyphSpec {
  name: string
  /** Primary unicode (PUA). */
  pua: number
  /** Optional secondary unicode mapping (so users can type 'M' for mountain). */
  ascii?: number
  draw: Drawer
}

const GLYPHS: GlyphSpec[] = [
  { name: 'arrowhead', pua: 0xE000, ascii: 'A'.charCodeAt(0), draw: arrowhead },
  { name: 'mountain', pua: 0xE001, ascii: 'M'.charCodeAt(0), draw: mountain },
  { name: 'tent', pua: 0xE002, ascii: 'T'.charCodeAt(0), draw: tent },
  { name: 'campfire', pua: 0xE003, ascii: 'F'.charCodeAt(0), draw: campfire },
  { name: 'pine', pua: 0xE004, ascii: 'P'.charCodeAt(0), draw: pine },
  { name: 'compass', pua: 0xE005, ascii: 'C'.charCodeAt(0), draw: compass },
  { name: 'sun', pua: 0xE006, ascii: 'S'.charCodeAt(0), draw: sun },
  { name: 'moon', pua: 0xE007, ascii: 'L'.charCodeAt(0), draw: moon }, // Lunar
  { name: 'star', pua: 0xE008, ascii: '*'.charCodeAt(0), draw: star },
  { name: 'water', pua: 0xE009, ascii: 'W'.charCodeAt(0), draw: water },
  { name: 'trail', pua: 0xE00A, draw: trail },
  { name: 'binoculars', pua: 0xE00B, ascii: 'B'.charCodeAt(0), draw: binoculars },
  { name: 'flag', pua: 0xE00C, draw: flag },
  { name: 'tree', pua: 0xE00D, draw: tree },
  { name: 'tracks', pua: 0xE00E, draw: tracks },
  { name: 'shield', pua: 0xE00F, draw: shield },
  { name: 'closed', pua: 0xE010, ascii: 'X'.charCodeAt(0), draw: closed },
  { name: 'open', pua: 0xE011, ascii: 'O'.charCodeAt(0), draw: open },
  { name: 'trailMarker', pua: 0xE012, ascii: 'D'.charCodeAt(0), draw: trailMarker },
  { name: 'bear', pua: 0xE013, draw: bear },
  { name: 'hiker', pua: 0xE014, ascii: 'H'.charCodeAt(0), draw: hiker },
  { name: 'cloud', pua: 0xE015, draw: cloud },
  { name: 'snowflake', pua: 0xE016, ascii: 'N'.charCodeAt(0), draw: snowflake },
  { name: 'backpack', pua: 0xE017, draw: backpack },
  { name: 'axe', pua: 0xE018, draw: axe },
  { name: 'waterBottle', pua: 0xE019, draw: waterBottle },
  { name: 'camera', pua: 0xE01A, draw: camera },
  { name: 'fish', pua: 0xE01B, draw: fish },
  { name: 'deer', pua: 0xE01C, draw: deer },
  { name: 'canoe', pua: 0xE01D, draw: canoe },
  { name: 'map', pua: 0xE01E, draw: mapIcon },
  { name: 'arrow', pua: 0xE01F, ascii: '>'.charCodeAt(0), draw: arrow },
]

// ---------------------------------------------------------------------------
// Build the font
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Path → TT contour conversion. Cubic curves are split into two quadratics
// at t=0.5 (close enough at icon scale) so the result fits the TTFObject
// glyf model. OTFWriter then re-lifts the quadratics back to cubics for
// the CFF charstring — the round-trip is lossless within ±0.5 unit.
// ---------------------------------------------------------------------------

interface Pt { x: number, y: number, onCurve: boolean }
type Contour = Pt[]

function cubicToTwoQuadratics(
  x0: number, y0: number,
  c1x: number, c1y: number,
  c2x: number, c2y: number,
  x1: number, y1: number,
): { mid: Pt, ctrl1: Pt, ctrl2: Pt, end: Pt } {
  // Split cubic at t=0.5; each half approximates as a quadratic.
  // Mid-point on the cubic at t=0.5
  const mx = 0.125 * x0 + 0.375 * c1x + 0.375 * c2x + 0.125 * x1
  const my = 0.125 * y0 + 0.375 * c1y + 0.375 * c2y + 0.125 * y1
  // Tangent endpoints at t=0.5: derivative blends c1+c2 with t=0.5.
  // Half-cubic A: P0, c1, (c1+c2)/2, mid → quadratic ctrl ≈ midpoint of cubic c1 and (c1+c2)/2
  const halfC = { x: (c1x + c2x) / 2, y: (c1y + c2y) / 2 }
  // Quadratic for A endpoints (P0, mid) with control c1' = (3c1 - P0 + halfC) / 3
  // Approximation: use the midpoint of c1 and halfC as the quadratic control.
  const ctrl1: Pt = { x: (c1x + halfC.x) / 2, y: (c1y + halfC.y) / 2, onCurve: false }
  // Quadratic for B endpoints (mid, P1) with control c2' similarly
  const ctrl2: Pt = { x: (halfC.x + c2x) / 2, y: (halfC.y + c2y) / 2, onCurve: false }
  return {
    mid: { x: mx, y: my, onCurve: true },
    ctrl1,
    ctrl2,
    end: { x: x1, y: y1, onCurve: true },
  }
}

interface PathCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z'
  x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number
}

function pathToContours(path: Path): Contour[] {
  const contours: Contour[] = []
  let current: Contour | null = null
  let lastX = 0, lastY = 0
  for (const cmd of path.commands as unknown as PathCommand[]) {
    switch (cmd.type) {
      case 'M':
        current = []
        contours.push(current)
        current.push({ x: cmd.x!, y: cmd.y!, onCurve: true })
        lastX = cmd.x!; lastY = cmd.y!
        break
      case 'L':
        if (!current) break
        current.push({ x: cmd.x!, y: cmd.y!, onCurve: true })
        lastX = cmd.x!; lastY = cmd.y!
        break
      case 'Q':
        if (!current) break
        current.push({ x: cmd.x1!, y: cmd.y1!, onCurve: false })
        current.push({ x: cmd.x!, y: cmd.y!, onCurve: true })
        lastX = cmd.x!; lastY = cmd.y!
        break
      case 'C': {
        if (!current) break
        const split = cubicToTwoQuadratics(lastX, lastY, cmd.x1!, cmd.y1!, cmd.x2!, cmd.y2!, cmd.x!, cmd.y!)
        current.push(split.ctrl1)
        current.push(split.mid)
        current.push(split.ctrl2)
        current.push(split.end)
        lastX = cmd.x!; lastY = cmd.y!
        break
      }
      case 'Z':
        current = null
        break
    }
  }
  return contours
}

function bboxOf(contours: Contour[]): { xMin: number, yMin: number, xMax: number, yMax: number } {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity
  for (const c of contours) for (const p of c) {
    if (p.x < xMin) xMin = p.x
    if (p.x > xMax) xMax = p.x
    if (p.y < yMin) yMin = p.y
    if (p.y > yMax) yMax = p.y
  }
  if (!Number.isFinite(xMin)) { xMin = 0; yMin = 0; xMax = 0; yMax = 0 }
  return { xMin: Math.round(xMin), yMin: Math.round(yMin), xMax: Math.round(xMax), yMax: Math.round(yMax) }
}

function makeGlyph(name: string, unicodes: number[], path: Path | null): Glyph {
  const contours: Contour[] = path ? pathToContours(path) : []
  // Round all coords to integers (TTF requirement).
  for (const c of contours) for (const p of c) {
    p.x = Math.round(p.x); p.y = Math.round(p.y)
  }
  const bb = bboxOf(contours)
  return {
    name,
    unicode: unicodes,
    advanceWidth: ADVANCE,
    leftSideBearing: 0,
    xMin: bb.xMin,
    yMin: bb.yMin,
    xMax: bb.xMax,
    yMax: bb.yMax,
    contours,
  } as unknown as Glyph
}

async function build() {
  const glyphs: Glyph[] = []
  glyphs.push(makeGlyph('.notdef', [], null))
  glyphs.push(makeGlyph('space', [0x20], null))

  for (const spec of GLYPHS) {
    const path = new Path()
    spec.draw(path)
    const unicodes = spec.ascii !== undefined ? [spec.pua, spec.ascii] : [spec.pua]
    glyphs.push(makeGlyph(spec.name, unicodes, path))
  }

  const ttf = buildFontFromGlyphs({
    glyphs,
    unitsPerEm: UPM,
    ascender: ICON_TOP + PAD,
    descender: -PAD,
    capHeight: ICON_TOP,
    xHeight: ICON_TOP * 0.5,
    weightClass: 400,
    vendorID: 'NPSF',
    familyName: 'NPS Symbols',
    styleName: 'Regular',
    postScriptName: 'NPSSymbols-Regular',
    fullName: 'NPS Symbols',
    version: 'Version 0.5.0',
    copyright: 'Copyright (c) 2026, NPS Fonts contributors. With Reserved Font Name "NPS Symbols".',
    description: 'NPS Symbols — National Park Service-inspired pictograph font. Drawn from scratch.',
    designer: 'NPS Fonts contributors',
    designerURL: 'https://github.com/stacksjs/nps-fonts',
    manufacturer: 'NPS Fonts',
    license: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
    licenseURL: 'https://openfontlicense.org',
  })

  const otfBuf = Buffer.from(new OTFWriter({ fontName: 'NPSSymbols-Regular' }).write(ttf))
  const otfAb = otfBuf.buffer.slice(otfBuf.byteOffset, otfBuf.byteOffset + otfBuf.byteLength) as ArrayBuffer

  await mkdir(resolve(FONTS, 'otf'), { recursive: true })
  await mkdir(resolve(FONTS, 'ttf'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff'), { recursive: true })
  await mkdir(resolve(FONTS, 'woff2'), { recursive: true })
  void dirname

  await writeFile(resolve(FONTS, 'otf', 'NPSSymbols-Regular.otf'), otfBuf)
  await writeFile(resolve(FONTS, 'ttf', 'NPSSymbols-Regular.ttf'), otfBuf)
  await writeFile(resolve(FONTS, 'woff', 'NPSSymbols-Regular.woff'), sfntToWoff(otfBuf))
  const woff2Buf = Buffer.from(await encodeWOFF2Native(otfAb))
  await writeFile(resolve(FONTS, 'woff2', 'NPSSymbols-Regular.woff2'), woff2Buf)

  // OTGlyph imported but not used at runtime (kept for API symmetry).
  void OTGlyph
  console.log(`✓ NPS Symbols: ${GLYPHS.length} pictographs · ${(otfBuf.length / 1024).toFixed(1)}KB OTF`)
}

await build()
export const NPS_SYMBOL_GLYPHS = GLYPHS
