# v0.3 balance and release-candidate evidence

The v0.3 workflow is implemented and reproducible. **Balance is not approved or declared achieved.** The full audit was unavailable; the owner explicitly directed proceeding from the supplied brief. Unseen audit findings remain unverified.

## Provenance and matrix

- Implementation revision: `f4ef8bf0a3c926f5f551c2d8f257cebd82c4d3c0`; preserved v0.2 baseline: `25e51c22db4a1a325b7104acd9d2bbe33a5db399`.
- Simulation `0.8.0`, schema `c2-1`; Node `24.22.1`, npm `11.9.0`, Linux x64. The machine provides four CPU cores and 32 GiB memory. Vitest uses one worker to keep the seeded suites within predictable resource bounds.
- **584 races / 18 variants:** 512 compact adversarial races (64 seeds × two rulesets × no sign / Conserve 1× / 2× / 4×), 64 differentiated full-reference races, and eight equalized full-reference races.
- Reference no-sign and 2× variants use `v03-reference-001` through `012`; 1×/4× probes and equalized variants use `001` through `004`. Compact seeds are `v03-compact-001` through `064`. Exact lists, configuration/tuning/final hashes, run metrics, per-RU aggregates and example terminal classifications are retained in [summary.json](balance/v03/summary.json).
- Reproduce from the repository root: `node scripts/v03-balance.ts /tmp/bt-v03-evidence`. This writes full validated inputs, per-run/per-RU results and CSV files. The checked-in summary omits repeated component snapshots for every sample; it retains all scalar run metrics, complete per-RU aggregate counters/condition distributions and one full classification per variant. Raw tick logs are not committed.
- Exploratory 26-race smoke results and interrupted pre-correction batches are excluded from these totals. Final evidence uses the corrected tick-boundary pass ordering and lead-clock semantics. Aggregates were rechecked from the retained authoritative run results.

## Outcomes

All 584 races completed with **zero simulation errors**. Across **292 Pure Racing cases**, there were **zero offensive attempts and deliberate rams**, while **57 incidental contacts caused 33 actual HP damage**. Pure mode still permits overtaking and collision consequences. Combat attack totals include ram attempts; the ram column is a subset, not additional attacks.

| Variant | Races | Finishers / entrants | Overtakes | Attack attempts | Rams | Incidental contacts |
|---|---:|---:|---:|---:|---:|---:|
| compact-combat-no-sign | 64 | 192/192 (100.0%) | 127 | 454 | 111 | 0 |
| compact-combat-conserve-1x | 64 | 192/192 (100.0%) | 127 | 323 | 111 | 1 |
| compact-combat-conserve-2x | 64 | 192/192 (100.0%) | 127 | 323 | 111 | 1 |
| compact-combat-conserve-4x | 64 | 192/192 (100.0%) | 127 | 322 | 111 | 1 |
| compact-pure-no-sign | 64 | 192/192 (100.0%) | 127 | 0 | 0 | 0 |
| compact-pure-conserve-1x | 64 | 192/192 (100.0%) | 128 | 0 | 0 | 1 |
| compact-pure-conserve-2x | 64 | 192/192 (100.0%) | 128 | 0 | 0 | 1 |
| compact-pure-conserve-4x | 64 | 192/192 (100.0%) | 128 | 0 | 0 | 1 |
| reference-combat-no-sign | 12 | 15/72 (20.8%) | 118 | 1120 | 280 | 13 |
| reference-combat-conserve-2x | 12 | 14/72 (19.4%) | 147 | 1291 | 320 | 19 |
| reference-combat-conserve-1x | 4 | 5/24 (20.8%) | 52 | 382 | 87 | 6 |
| reference-combat-conserve-4x | 4 | 5/24 (20.8%) | 51 | 372 | 88 | 5 |
| reference-pure-no-sign | 12 | 12/72 (16.7%) | 119 | 0 | 0 | 9 |
| reference-pure-conserve-2x | 12 | 12/72 (16.7%) | 167 | 0 | 0 | 25 |
| reference-pure-conserve-1x | 4 | 4/24 (16.7%) | 53 | 0 | 0 | 8 |
| reference-pure-conserve-4x | 4 | 4/24 (16.7%) | 54 | 0 | 0 | 6 |
| equalized-reference-combat-no-sign | 4 | 8/24 (33.3%) | 64 | 450 | 44 | 2 |
| equalized-reference-pure-no-sign | 4 | 24/24 (100.0%) | 65 | 0 | 0 | 6 |

## Interpretation and open balance work

1. **Compact safety is not reference balance.** Every compact entrant finished. Differentiated reference completion remained 16.7–20.8%, with substantial cutoff and Combat chariot attrition. Combat/no-sign classified 15/72 entrants, with 22 chariot disablements and 35 cutoff DNFs. Pure/no-sign classified 12/72, with 60 cutoff DNFs and no offensive actions. The cutoff/stat-spread problem remains even when offense is prohibited.
2. **Equalization is useful evidence, not isolated causation.** Equalized Pure finished 24/24 entrants across four seeds; equalized Combat finished 8/24. Grid positions, lane costs and equipment were preserved, while attributes, health, weight and strategy were equalized. Multiple factors changed together and four seeds are a small sample. The result supports investigating roster spread/cutoff and combat attrition independently.
3. **Conserve changes behavior relative to no sign, but strength can saturate.** Reference Combat player attacks fell from 44 without a sign to 0 with 2× Conserve, and its movement choices shifted to Conserve. Whole-race attacks increased from 1,120 to 1,291 because the other RUs and race duration also changed; do not mistake whole-race totals for player obedience or isolated benefit. On all four paired reference probe seeds in both rulesets, 1× versus 2× produced identical action distributions and finish counts. Larger utility numbers and different state hashes alone do not establish a dramatic behavioral improvement.
4. **A controlled boundary fixture demonstrates configurable strength.** With Conserve utility weights uniformly scaled to 0.3 of the shipped catalog (held fixed across comparison), 1× selects Push and 2× selects Conserve on the same state/seed; the fatigue physics multiplier remains unchanged. This tests a real decision boundary, not a guaranteed-obedience override. It is not a claim that ordinary reference signs are fully tuned. Some 4× probes changed combat/contact outcomes, but the sample does not establish superiority.
5. **No approved balance targets were invented.** Next experiments should vary finish cutoff alone on the fixed reference seeds, then vary roster spreads and combat damage/cooldowns independently. Keep rollback presets and compare per-RU finish/survival/fatigue/action distributions. Further sign tuning should target saturated decision boundaries while preserving safety, legality and personality; avoid hidden forced actions. The shipped 2× global strength and all new attribute coefficients remain provisional hypotheses.
6. **Qualitative judgment remains separate.** Automated Chromium checks verify controls, state isolation, marker/standings presentation, pause/step, playback, factual radio, exports and replay. They do not establish competitiveness, fun, readable overtaking or player-perceived sign drama. The reproducible human playtest loop is in [V03_DEVELOPER_GUIDE.md](V03_DEVELOPER_GUIDE.md).

## Verification

| Check | Outcome |
|---|---|
| `npm run typecheck` | Passed browser and engine-only TypeScript targets |
| `npm run lint` | Passed; headless import restrictions retained |
| `npm test` | 21 files / 261 tests passed, including four 1,000-seed suites |
| Focused final report/editor/integrity checks | 34 analysis/bulk/presentation tests and six targeted identifier/migration/radio checks and four final ruleset/contact checks passed |
| `npm run build` | Passed; existing Phaser bundle warning remains (~1.54 MB minified / 395 kB gzip) |
| `npm run test:browser` | All nine Chromium smoke scripts passed; final targeted v0.3 smoke additionally verifies undo after a new preview and malformed command-target import rejection |
| `node scripts/v03-balance.ts /tmp/bt-v03-evidence` | 584 races, 18 variants, zero simulation errors |
| Evidence integrity | All per-run overtake/attack totals match shared per-RU counters; integrated lead time matches the first fractional finish time within 1e-6; Pure offense/rams are zero |
| Exported presets | All four portable presets validated, initialized and stepped successfully |

During development, full-reference and environmental suites exceeded earlier wall-clock budgets. The final tests retain all assertions and sample counts, with explicit 15s/30s reference and 180s environmental budgets and one worker. A provisional exact-tick-tie regression initially exposed a missing pass; persistent prior ordering fixed it before final evidence collection. An import smoke expectation was corrected to match the actual structured Reserved ID error. None of these cases was marked passed before its rerun succeeded.

No failed, skipped or unrun functional check is counted as a pass in the final complete suite. Targeted runs intentionally exclude unrelated tests and are reported separately. No new balance parameter changes were made in J; correctness and feature defaults are separated in prior F/G/H/I commits. No campaign/stable progression, external deployment or publication was performed.

## Remaining limitations

- Complete audit definitions and four unspecified Low findings remain unavailable. Summary-defined High repairs and M-01/M-03 regressions are implemented; unseen detailed findings are not claimed closed.
- Overtake/lead measurements use authoritative transition/contact samples and piecewise within-tile interpolation, retain strict order through ties, and exclude post-terminal actions. This remains a versioned grid simulation approximation.
- Penalties are recorded as zero because the engine has no penalty-assessment mechanic. It rejects illegal offense instead of inventing penalties.
- Old 0.7.0 diagnostic histories are not canonical replays under 0.8.0. Only explicit portable configuration migration is supported; mutable snapshot restoration remains deferred.
- The existing large Phaser bundle warning remains. Balance approval and qualitative playtest acceptance remain owner review gates.
