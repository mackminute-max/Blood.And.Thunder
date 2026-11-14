# Prototype acceptance and regression map

Simulation 0.8.0 / schema c2-1. Each reference below points to executable coverage; no single seed is treated as balance proof. `npm test` runs the unit/integration suite (including prior 1,000-seed batches). With the dev server running, `npm run test:browser` runs actual Chromium controls/export/replay checks. Batch plans and limitations are in BALANCE_REVIEW.md.

| Specification D.4 | Evidence |
|---|---|
| 1 empty/multi-tile track movement | movement.test.ts, scheduler.test.ts |
| 2 blocked travel discard | movement.test.ts, scheduler.test.ts, lanes.test.ts |
| 3 accepted vacated destinations | scheduler.test.ts, lanes.test.ts |
| 4 contested tiles/order invariance | scheduler.test.ts, lanes.test.ts |
| 5 reciprocal swaps | scheduler.test.ts, lanes.test.ts |
| 6 inside/outside corner tradeoff | lanes.test.ts, movement.test.ts |
| 7 aligned/no-stagger grid | initialization.test.ts, race.test.ts |
| 8 routine free adjacent maneuver | lanes.test.ts |
| 9 difficult seeded control | lanes.test.ts; movement-smoke.mjs |
| 10 melee range/arc | combat.test.ts |
| 11 preMove disablement | combat.test.ts |
| 12 postMove escape/no default cooldown | combat.test.ts |
| 13 lateral ram and occupancy | combat.test.ts, environment.test.ts |
| 14 fatigue/next-tick effects | environment.test.ts |
| 15 damage bands/disablement | movement.test.ts, combat.test.ts |
| 16 signs/cost/pause | ai.test.ts; ai-smoke.mjs, presentation-smoke.mjs |
| 17 disabled/occasional event absence | environment.test.ts |
| 18 legal hazard placement | environment.test.ts; environment-smoke.mjs |
| 19 wreck delay/early safety/retained condition | environment.test.ts; environment-smoke.mjs |
| 20 fractional finishes/ties/rear approach | race.test.ts |
| 21 replay/cadence/headless | ai.test.ts, analysis.test.ts, presentation.test.ts; developer/ai/presentation/analysis smoke scripts |
| 22 semantic input-order invariance | initialization/race/ai/combat/environment/analysis tests |
| 23 registered paused overrides | ai.test.ts; ai-smoke.mjs |
| 24 crash/last-valid capture | movement/race/ai/analysis tests; existing diagnostic exports |
| 25 1,000-seed safety | lanes/ai/combat/environment test batches; e-stress.plan.json with measured 1,000-race report |

Gate E additions: analysis.test.ts covers audit corruption detection, full-journal verification, initial/command-caused/failed-tick/unequal-length divergence, noncanonical versions, bounded changed paths, real lap/lane metrics, derived counters, paired quantiles, CSV escaping and CLI workflows. analysis-smoke.mjs covers actual import/audit/first-divergence, incompatible-version labels, worker batch/cancel/export and live-race isolation.

Remaining limitations are explicit: compact batches are not full-reference balance proof; snapshot progress reversals are not sub-tick overtake truth; differing versions receive static noncanonical inspection only; mutable saved-state restoration and cinematic replay remain deferred. All ordinary tuning remains editable through validated pre-race configuration. No approved mechanic was changed in E.

v0.3 F (simulation 0.8.0): scheduler tests reproduce time-correct contact travel with multiple arrival times/progress and reordered inputs; v03-correctness tests cover intrinsic roughness, severity, durability, nerve and normalized pass/lead counters. AI tests cover inherited-target rejects/replay. Developer/analysis tests cover target participation and invalid historical capture identity. Old v0.2 balance artifacts remain historical evidence only.


## v0.3 F–J acceptance map

| Gate | Executable evidence | Outcome / scope |
|---|---|---|
| F contact integration | scheduler.test.ts, lanes.test.ts, environment.test.ts | .90→.95 reproduction, multiple arrival times/progress, atomic scheduling, blocked discard, fractional post-contact finish, reorder and occupancy checks |
| F malformed IDs/integrity | ai.test.ts, developer-tools.test.ts, analysis.test.ts, v03-smoke.mjs | Direct/import/player/developer inherited IDs reject without mutation; target-side filtering and invalid-capture identity regressions pass |
| F attributes/results | v03-correctness.test.ts, analysis.test.ts | Nerve/durability/roughness/severity consumers; strict overtakes/ties, first-finisher lead clock and shared result/export/batch counters |
| G rulesets | v03-rulesets.test.ts, combat.test.ts, v03-smoke.mjs | Legal Combat attack versus Pure rejection, direct resolver enforcement, zero offensive AI candidates and retained incidental contact consequences |
| H editing | v03-bulk.test.ts, developer-tools.test.ts, v03-smoke.mjs | All beasts/RUs, nested personality/strategy fields, invalid atomic rejection, preview/apply/restore, later-preview undo, preserved identities and live isolation |
| I signs | v03-signs.test.ts, ai.test.ts, presentation.test.ts, ai-smoke.mjs, v03-smoke.mjs | Common/rear-row signal, pending/active replacement, forward/multi-tile/final crossings, before/after crossing order, no-refund cancellation, free lower, exhaustion, disabled/terminal behavior and replay/reorder |
| I stronger tuning | v03-signs.test.ts and dedicated browser fields | Controlled 1×→2× decision change with fixed boundary-fixture weights; ranges/effective multipliers/reset; fatigue separate; reference saturation explicitly reported |
| J measurements | scripts/v03-balance.ts; docs/balance/v03/summary.json | 584 cases / 18 variants, 292 Pure cases with zero offense, exact seeds/hashes, per-mode/per-RU metrics, no simulation errors |
| J migration/presets | v03-migration.test.ts; four portable v03 presets | Explicit 0.7.0 configuration migration and validated export/import; diagnostic histories remain incompatible |
| Full regression | npm test; npm run test:browser | 21 files / 261 tests and nine browser flows passed; affected final refinements have additional targeted checks |

The unavailable full audit was waived as a prerequisite by the owner. Unknown detailed findings remain unverified. Human balance/qualitative approval remains open by design; automated functional acceptance does not assert fun, competitiveness or universal sign-strength improvement.
