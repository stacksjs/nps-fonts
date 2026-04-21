#!/usr/bin/env bun
/**
 * Build orchestrator. All families are parametric originals drawn from
 * scratch with opentype.js — no OFL forks.
 *
 *   bun run scripts/build.ts                       # all families
 *   bun run scripts/build.ts --all
 *   bun run scripts/build.ts --family nps-2026
 */

import { ALL_FAMILIES, type FamilyId } from './lib/common.ts'

const argv = Bun.argv.slice(2)
const wantsAll = argv.length === 0 || argv.includes('--all')
const familyIdx = argv.indexOf('--family')
const onlyFamily = familyIdx >= 0 ? argv[familyIdx + 1] : undefined

const families = wantsAll
  ? ALL_FAMILIES
  : onlyFamily
    ? [onlyFamily as FamilyId]
    : ALL_FAMILIES

const SCRIPT: Record<FamilyId, string> = {
  'nps-symbols': './symbols.ts',
  'nps-2026': './nps-2026.ts',
  'redwood-serif': './redwood-serif.ts',
  'campmate-script': './campmate-script.ts',
}

for (const id of families) {
  const mod = SCRIPT[id]
  if (!mod) {
    console.error(`✗ unknown family: ${id}`)
    process.exit(1)
  }
  await import(mod)
}

export {}
