# Implementation status

Gate 0 and increments A1/A2 are implemented. A3 is implemented with the owner-approved common-clock rear-row rule. A4 developer tooling is implemented for current core mechanics; Gate A checks pass; B1/B2 are implemented; current Gate B checks pass. C1/C2 combat and environmental mechanics and D presentation are implemented; E regression/comparison tooling and baseline review are complete.

## Available

- Pinned TypeScript/Vite/Phaser/Vitest/npm tooling, engine-only type target and architectural lint restrictions.
- Strict versioned schemas, reference/asset/topology/grid validation, explicit 48×4 six-RU fixture, immutable initialization and independent named PRNG streams.
- Provisional RU stat equations with individually conditioned beasts/driver/chariot, editable coefficients and detailed modifier breakdowns.
- Fixed-tick lateral/longitudinal movement with acceleration/braking, trapezoidal meters, fractional carry, lane-specific costs, all intermediate transitions and blocked-budget discard.
- Atomic forward departure groups, merge arbitration, reciprocal-exchange rejection, blocked traces without automatic damage/speed loss.
- Immutable tick snapshots, deterministic comparison checksums, diagnostic/crash bundle export, transactional error handling and bounded tick/transition limits.
- Browser setup editor, stat/state inspection, exact one-tick step and diagnostic download; Node initialization and movement CLIs.

## A2 validation

- `npm run typecheck`, `npm run lint`: passed.
- `npm test`: 8 files, 90 tests passed. Includes healthy derivation arithmetic, coefficient editing, condition/load/fatigue/traction modifiers, acceleration/braking, fractional carry, intermediate transitions, lane costs, blocked discard, vacated/contested/reciprocal/dependency cases, raw crossing timing, immutable snapshots, reordered inputs, repeated stepping, safety limits and native Node CLIs.
- `npm run build`: passed; existing bundle-size warning remains (about 1.41 MB minified / 357 KB gzip).
- `npm run test:browser`: validates Phaser initialization, component/seed edits, invalid setup rejection, deterministic reset, exact stepping and diagnostic download.

## A3 lifecycle and classification

- Circuit controller for the six-RU reference and front-row regression fixtures: grid/countdown/racing/concluding/complete/error phases; common race clock excluding countdown; lap crossings and interpolated finish times.
- Normalized course standings, shared competition ranks for ties, terminal component records, automatic zero-propulsion retirement, cutoff/watchdog DNF reasons.
- Finishers stop exactly at the crossing and leave occupancy while retaining results. Race diagnostic exports include immutable results, supported counters, unavailable-statistics labels and last valid state on failure.
- `npm run race` and browser A3 sample controls execute the six-RU reference. Rear racers first cross the line to start lap 1 without a completed lap; finish timing stays on the common clock. The front-row regression fixture and raw movement harness remain available.
- Current checks: typecheck/lint/build passed; 9 test files and 116 tests passed; Chromium smoke checks cover six-RU result generation and result download in addition to existing movement/editor checks. Build retains the known large Phaser bundle warning (~1.42 MB minified / 360 KB gzip).

## Next and unresolved

A3 is complete. Explicit owner approval of the shared-clock rule resolves D-005 / specification F.3 (recorded in D-034). Rear normalized positions start behind the line, and accepted first crossings start lap 1; all subsequent full-lap finishes use the original common clock. Tests cover blocked/partial first crossings, common-clock ties, multiple laps, countdown, nonzero finish indices and deeper rows, plus six-RU replay consistency. The A2 movement harness remains separate and awards no official laps or results.

A4 provides configuration forms/previews/reset, named IndexedDB saves, portable configuration import/export, fixed-speed playback, bounded trace capture, searchable/filterable logs and historical state/RU inspection. Selected paused developer overrides now use the validated B2 queue. B1 adds adjacent lane maneuvers, corner safe-speed/control, atomic conflict scheduling, yield/brake outcomes and deadlock safety recovery. B2 adds utility AI, perception/commitment, strategies, signs and replayable commands. C1 provides component combat and readiness. C2 adds fatigue accumulation, event systems, accidental contact and wreck cleanup. D viewer/commentary is implemented; E regression/comparison tooling and baseline evidence are implemented. Phaser race presentation and commentary are now supplied by D. Full mutable snapshot restoration and campaign features are not implemented; E supplies regression/comparison and baseline evidence.

## A4 validation

- `npm run typecheck`, `npm run lint`, `npm run build`: passed. Existing Phaser bundle-size warning remains (~1.44 MB minified / 364 KB gzip).
- `npm test`: 10 files, 122 tests passed; new tests cover portable configurations, invalid versions/references, buffer bounds/drop counters, duplicate committed ticks, immutable ownership, combined log filters and schema-derived editor metadata.
- `npm run test:browser`: existing six-RU/editor/result checks and new A4 checks pass. New checks verify numeric preview/reset and draft isolation, IndexedDB save/load across reload, file round trips, invalid-import isolation, 1×/2×/4× and headless hash equality, pause stability, historical inspection without rewind, multi-field filtering, retention counts/trace downloads and storage-failure isolation.

Gate A evidence: movement/fractional/blocked-budget tests, aligned-grid tests, fractional/tied finish tests and deterministic repeat runs are complemented by browser configuration editing, tick stepping and trace export. No later-milestone behavior is claimed.

Current schema c2-1 / simulation 0.7.0 explicitly versions environmental additions; no automatic migration from earlier inputs exists. See D-026–D-081 and CHANGELOG.md for current provisional choices and approved rear-row scope. The specification is unchanged at the repository root.


## B1 validation and scope

- Typecheck, lint and build passed; existing Phaser bundle warning remains (~1.45 MB minified / 367 KB gzip).
- 11 files / 140 tests pass, including 1,000 compact seeded maneuver races terminating within 12 movement ticks with no occupancy/nonfinite invariant failures. This is safety/regression evidence, not full-game balancing.
- Tests cover routine penalty-free lane changes, swaps, contests, accepted/failed departure chains, topology/stationary rejection, forward fallback, abort budgets, seeded difficult checks, corner tradeoffs, once-per-entry checks, post-failure remaining timing, clean yield/braking, deadlock recovery, countdown-independent plan ticks, invalid plans and preservation of rear-row lap accounting.
- Browser checks cover maneuver draft isolation, duplicate rejection, routine success, seeded failure, selected-tick movement inspection, filtering and configuration export, alongside prior six-RU/A4 regression checks.

All numerical handling/conflict baselines remain PROVISIONAL and tunable. B1 did not claim collision damage, actual contact/ram actions or disabled-wreck cleanup. AI/signs/live overrides are now supplied by B2 below.


## B2 validation and scope

- Utility movement AI scores 12 candidates from restricted perception with full factors/rejection/outcome traces, personality/strategy/sign preferences, seeded fixed-budget noise and absolute lane commitment. The six-RU reference uses AI; fixture control preserves existing mechanic tests.
- Strict tick queues handle persistent signs, approved opportunity costs, paused registered overrides, explicit opponent test permission and bounded submission journals. UI shows queued versus active sign and actual behavior; selected fields are logged/labeled, not arbitrary live object mutation.
- Raw/race replay re-executes initial configuration plus scripted/live inputs with submission phase/tick context, reproducing queued/rejected inputs and failed ticks. Full snapshot restoration, comparison viewer and complete replay UI remain later work.
- Typecheck, lint, build and four Chromium smoke scripts pass. Existing bundle-size warning remains (~1.47 MB minified / 373 KB gzip).
- 12 files / 158 tests pass, including a separate 1,000-seed compact AI/sign batch (three RUs, four segments, 12 race-tick limit) with no invariant or termination failures. This is not full-game balancing.
- New checks cover unseen opponent isolation, skill/weather awareness, candidate scores, personality/strategy/sign effects, safety and non-guaranteed obedience, commitment/reset, persistence/replacement/free lowering/exhaustion, countdown ordering, rejected/unauthorized/duplicate input, pause/registry/NaN validation, old/new labels, command bounds, normal/error/raw/race replay and reordered inputs. Browser checks include player signs/AI inspection, overrides, journals and downloaded race replay in Node.

Combat/guard action execution remains C1. Push Hard exposes its future fatigue multiplier but fatigue accumulation and hazard perception/memory remain C2. Numeric utility definitions, safety filters and sign catalog/weights are provisional; approved sign accounting and rear-row timing are preserved. No complete playable prototype is claimed before the remaining combat/environment/viewer/commentary gates.


## C1 validation and scope

- Final checks: typecheck, lint, build and all five Chromium smoke scripts pass. Vitest: 13 files / 179 tests pass, including 1,000 compact C1 combat seeds alongside earlier B1/B2 seed batches. Production bundle is ~1.49 MB minified / 378 KB gzip; the existing size warning remains.

- Driver melee/ranged, independently equipped mounted attacks, trained beast natural attacks, deliberate lateral ram contact and active guard execute inside both tick controllers. Component health/bands influence stats; damage/disablement, injury/fatality/destruction outcomes and combat statistics are authoritative and replayable.
- Owner-approved simultaneous same-phase resolution permits mutual disablement; earlier-phase disablement cancels later actions. Accepted movement is never retroactively changed. Shared-clock rear-row accounting and sign opportunity rules are preserved.
- Combat developer panel exposes candidates/factors/rejections, readiness, components, resolved events and traces for selected ticks. Validated pre-race combat/guard fixture editors accompany the existing numeric weapon/profile/tuning forms, raw JSON, filters, exports and replay.
- Automated coverage includes targeting/arcs/range/occlusion/rules/providers, mounted/channel independence, guard/miss/cancellation readiness, damage/protection/bands, living-only lethality, single-beast degradation, mutual kills, preMove movement cancellation, actual postMove escape, signs/perception, reordered inputs and raw/race replay. A separate 1,000-seed compact combat batch checks termination, occupancy, finite state, health/bands and cooldown invariants (three RUs, four segments, three movement ticks). This is safety evidence, not balancing.
- Numeric defaults/geometry/utility costs remain PROVISIONAL. Input versions c1-1 / 0.6.0 reject older files; no automatic migration. See D-061–D-070.

C2 now supplies fatigue accumulation, hazards/environmental incidents, accidental contact damage and delayed wreck removal (see below). Existing bounded deadlock retirement/watchdogs remain as final safety limits. Recovery/economy, full replay UI and campaign systems remain unimplemented; D supplies viewer/commentary. Existing Phaser bundle-size warning remains.


## C2 conditions, fatigue, events and wrecks

- Final validation: typecheck, lint and production build pass. Vitest: 14 files / 197 tests pass. All six Chromium smoke scripts pass, including the new Environment workflow and exported Node replay. One browser attempt timed out while the CPU-heavy suite ran concurrently; rerunning the browser suite on its own passed. Existing bundle warning remains (~1.51 MB minified / 383 KB gzip).
- C2 acceptance includes 1,000 compact seeded combined races across four fixed weather profiles, four segments, three RUs and an eight-movement-tick limit. The batch verifies actual incident activations and physical contacts occurred, with bounded termination, legal occupancy, finite state and fatigue/hazard invariants. Earlier B1/B2/C1 seed batches remain. These are safety/regression checks, not game-balance evidence.

- Team fatigue/recovery follows B.4 after movement, with fixed weather/endurance/Push Hard modifiers; next-tick stats change without retroactive speed mutation. UI exposes fatigue bands and sample/mean/max counters.
- Clear/rain/storm/heat presets, per-lane surface × weather × optional attached-beast trait modifiers, local roughness, visibility-sensitive perception and ranged penalties operate through existing condition consumers.
- Optional seeded capped-Poisson external incidents allow zero and obey configured schedule window/spacing; occupancy-safe activation, skips, expiry and animal movement are deterministic. Explicit environmental fixtures remain separate from random intensity. Debris/animals block every intermediate/lateral transition; roughness alters traction.
- AI perceives local hazards and retains bounded last-seen memory; hazard discovery resets commitment, candidates expose risk/utility factors. No hidden hazard access is used for utility and no extra movement-AI RNG draws are consumed.
- Separate accidental-contact checks distinguish avoidance, harmless impacts and chariot damage. Accepted moves remain committed; collision consequences use the shared component/lethality code. Stats identify physical collisions/damage separately from weapon attempts.
- Disabled-RU occupancy is removed after configured delay, retaining status/reason/components/results. Zero-delay cleanup and all-routes-blocked early safety clearance are explicit; removed wrecks cease obstructing movement/perception/ranged line of sight.
- Environment editor/inspector, numeric tuning, selected-tick traces, filters and exported raw/race replay cover the new state. C2 input versions are c2-1 / 0.7.0; old versions reject explicitly, no automatic migration. D-071–D-081 document provisional choices.

Gate C covers implemented combat/environment mechanics only. Milestone D race rendering/commentary is implemented below. Dynamic weather, wind simulation, crowd morale, continuous wear, recovery/economy, full replay viewer and campaign mechanics remain deferred; the Phaser viewer now consumes authoritative snapshots/events.


## D viewer, panels, radio and results

- Final validation: typecheck, lint, production build and all seven Chromium scripts pass. Vitest: 15 files / 211 tests pass, including all prior seeded mechanic batches and 14 new presentation/radio checks. Desktop/mobile screenshots were visually inspected. Existing Phaser bundle warning remains (~1.52 MB minified / 390 KB gzip).
- Dedicated D browser checks cover exact marker metadata/standings, responsive layout and real canvas selection after dynamic layout changes, opponent privacy, follow/full view, queued paused signs, 4× playback and exported Node replay, hazard visualization, confirmed fatality/no-finisher/successful results, highlights, restart and historical-inspection isolation.

- Top-down Phaser schematic course, lanes/start line, RU/player/stopped markers, hazards and confirmed hit/contact cues; full-track/follow/selection, accepted-transition visual interpolation and exact paused snapshots.
- Circuit lifecycle is the browser default; raw movement remains available. Existing queued signs and controller step/playback remain authoritative. Controls/signs sit above the course; diagnostics remain below.
- Live normalized standings/NCU gaps and own RU health/condition/fatigue/behavior/sign/readiness. Opponent detail is limited to current perceived observations; developer full-state inspection is explicitly labeled omniscient.
- Separate source-backed deterministic Race radio prioritizes confirmed critical/high outcomes, distinguishes attempts/misses/intent from results, suppresses routine repeats and preserves event timing. Conservative transition-backed snapshot comparison identifies progress reversals/lead changes without inventing passes from elimination/ties.
- Terminal classification/ties/no-finisher/error report, high-priority highlights and individual component condition/injury/death/destruction report. Restart clears presentation; history selection remains separate from live viewer/radio.
- No engine mechanics/version/data contract changed (simulation0.7.0/schema c2-1). Rendering clocks/camera/selection never feed back into simulation. See D-082–D-088 for provisional visual geometry, privacy and radio baselines.

Gate D presentation checks cover state alignment, factual commentary, paused signs and playback/replay determinism. Milestone E regression/scenario comparison and baseline batch summaries are implemented below. Track art/audio/cinematic replay, full state restoration, dynamic weather and campaign recovery remain deferred. Finished markers can overlap at the same finish tile; the standings/result report retains every racer. Intra-segment progress reversals without transition events are conservatively omitted from radio; no authoritative overtake counter is claimed.


## E regression, diagnostics, comparisons and baseline evidence

- Final validation: typecheck, lint, build and all eight Chromium smoke scripts pass. Vitest: 16 files / 228 tests pass, including 17 new audit/metrics/CLI checks and existing seeded mechanic batches. Additional measured batches ran 1,000 compact races plus 36 full-reference variant races with zero simulation errors. The legacy large-textarea restore was normalized to equivalent compact JSON after a browser insertion timeout; state equality assertions remain unchanged.
- Production main bundle retains the known Phaser size warning (~1.53 MB minified / 391 KB gzip); isolated analysis worker is ~196 KB. No dependency installation or gameplay/default change was required.

- Validated diagnostic import and stronger input re-execution audit verify serialized state, claimed hash, complete journal and latest events. Optional read-only observation preserves normal replay behavior and captures failed attempts at duplicate committed ticks.
- First-divergence CLI/browser inspection compares compatible runs from initialization, reports earliest frame/path/event/diagnostic differences and unequal endpoints, and does not depend on retained trace-ring completeness. Incompatible versions receive explicitly noncanonical static inspection only.
- Seeded batch CLI plans and independent browser-worker draft A/B comparisons produce JSON/CSV, per-run metrics, distributions, configuration/tuning/final hashes and paired deltas; errors retain crash evidence. Existing pre-race forms/JSON support ordinary parameter experiments without code changes.
- Saved compact engineering fixture and full-reference plans have explicit seed lists. Measured1,000 compact races: zero simulation errors,2,999/3,000 entrants finish. Separate full-reference12 seeds×3 variants: zero simulation errors;13/72 entrants finish in each variant. BALANCE_REVIEW.md records outcomes, definitions, limitations and reviewable follow-up experiments; TUNING_REGISTER.md inventories defaults; ACCEPTANCE_MATRIX.md maps specification D.4 tests1–25.
- No gameplay defaults/mechanics or engine/input versions changed (0.7.0/c2-1); D-089–D-096 document provisional analysis conventions. Broad baseline finish-rate concerns remain a tuning-review question, not a claim of finished balance.

Gate E tools complete the planned prototype regression/inspection workflow. Next work should review concrete pacing/attrition experiments against larger controlled samples. Full mutable snapshot restoration, campaign progression/recovery, audio/cinematic replay and unrelated mechanics remain deferred. No new gameplay canon is implied by milestone completion.
