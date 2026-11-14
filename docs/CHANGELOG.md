# Simulation changes

## Simulation 0.9.0 — independent audit remediation

Responses to all16 new AUD- findings: current-draft scalar edits; raw utility ranking/legal speed blending; full supplied-recording verification with unified initialization frames; actual damage event semantics; guaranteed activation feedback; explicit unsupported penalty metadata in results/UI/batches; persistent wreck mode; race-context/hazard-memory corrections; lazy diagnostic/snapshot sampling; neutral configurable crowd/weather dimensions; equipment stat modifiers and deferred extension contracts; fractional secondary sign fatigue; workload/lint guards; readable current status/CI; read-only measurements and strict comparison exits. See [AUDIT_REMEDIATION.md](AUDIT_REMEDIATION.md) for provisional choices, tests and limitations.

Compatibility: migrate portable0.7/0.8 configurations explicitly; historical diagnostics remain version-specific. No blind golden-hash update or balance approval. Final validation:283 tests/23 files, nine browser scripts, typecheck/lint/build;26 fresh matrix cases, zero errors.


## E analysis and regression — 2026-11-13 (simulation remains 0.7.0)

Adds validated diagnostic audit/import, read-only replay observation, first-divergence CLI/browser inspection with changed paths/events/diagnostics and noncanonical incompatible-version labels. Adds explicit seeded batch plans, per-run JSON/CSV metrics, distributions/hashes, paired draft/sign comparisons and worker cancellation/export isolated from the live race.

Includes saved compact stress fixture/1,000-seed plan, a12-seed full-reference baseline/Conserve/Attack plan, measured concise JSON/CSV evidence, tuning inventory, balance review and25-item acceptance matrix. No gameplay defaults or simulation/input formats changed; analysis artifacts use e1 markers. Full-reference low entrant finish rates warrant cutoff/attrition experiments, not a claim of balanced gameplay. D-089–D-096 document semantics and limits.

## D presentation — 2026-11-13 (simulation remains 0.7.0)

Replaces the empty Phaser shell with a schematic race viewer, accepted-transition animation, full/follow view and marker selection. Adds live standings/player status, perceived-only opponent detail, source-backed Race radio, terminal classification/highlights/individual condition report and responsive desktop/mobile layout. Promotes existing playback/sign controls above the course; Circuit lifecycle becomes the initial browser mode, raw harness stays available.

Commentary consumes confirmed events and conservative snapshot progress reversals, with priority/repeat limits and source evidence; it cannot mutate engine state or turn misses/plans into hits. Paused snapshots are exact; display timing/selection/camera/history do not alter commands or replay hashes. No simulation/input/artifact version changed. D-082–D-088 record provisional visual/radio choices. E balance/comparison work remains next.

## 0.7.0 / schema c2-1 — 2026-11-13

C2 adds post-movement team fatigue/recovery, fixed weather presets, local roughness and optional beast-trait modifiers, seeded optional incident scheduling, debris/animal obstruction, hazard perception/memory, accidental-contact avoidance/damage and delayed wreck cleanup. Accepted transitions and approved shared-clock/simultaneous-attack/sign rules are preserved. Numeric contact tables, scheduling estimates and fatigue interpretation remain provisional (D-071–D-081).

Adds tuning.environment, explicit environmental fixtures, schedules/hazards, wreck occupancy metadata and fatigue/contact result statistics. Both controllers and deterministic replay include the new state; examples are explicitly updated, older versions reject with no automatic migration. Environment editor/inspector and numeric controls accompany selected-tick logs/exports and a Chromium replay check. Pre-C2 mechanic fixtures disable new environmental effects for exact isolated regressions; C2 acceptance checks enable/combine them. Milestone D viewer/commentary remains next.

## 0.6.0 / schema c1-1 — 2026-11-13

C1 adds action/channel readiness, perceived utility combat candidates, driver/mounted/beast attacks, lateral ram contact, guard, seeded hit/target/damage resolution, component condition/disablement and configurable lethality outcome markers. Owner-approved simultaneous same-phase attacks can mutually disable; earlier-phase disablement cancels subsequent actions and movement. Both raw and circuit controllers, combat statistics and command-aware deterministic replay include combat state.

Adds strict combat tuning, weighted target categories, combat/guard fixture plans, component kind/dead state and per-action cooldowns. Examples explicitly updated; older versions rejected, no automatic migration. Combat inspector, validated fixture drafts, numeric tuning/profile/weapon forms, classified combat logs and browser export→Node replay cover current behavior. See D-061–D-070. C2 environmental/fatigue/accidental-contact/wreck work remains next; no complete playable prototype is claimed.

## 0.5.0 / schema b2-1 — 2026-11-12

Adds perceived utility movement AI, 12 candidate traces, editable personality/strategy/sign utility contributions, safety rejections, seeded variation and absolute lane commitment with resolved-outcome feedback. Six-RU reference now defaults to AI; older mechanical fixtures explicitly select fixture control. Fixed 12-draw budgets per actor/tick isolate noise from hidden changes in another actor's candidate eligibility.

Adds strict ordered tick-command queues, persistent Strategy Signs with approved cost rules, explicit opponent test permission, registered paused overrides, submission/application logs and re-execution of exported journals for raw movement and race controllers. AI inspector and player Sign panel distinguish intent/queue receipts/active sign/driver outcomes. No combat or hazard effects are invented.

New required inputs: controller, tuning.ai, command permission/limit rules, typed scripted commands. Artifacts remain the A4 envelope with new inner versions and command journal metadata. No migration from b1-1 / 0.4.0 is implicit. Push Hard fatigue multiplier is exposed for C2; attack/guard execution remains C1. See D-051–D-060.

## 0.4.0 / schema b1-1 — 2026-11-12

Adds B1 adjacent lane maneuvers with preserved longitudinal fraction, tick-start atomic arbitration, seeded difficult handling, corner safe-speed policy and once-per-entry overspeed checks. Mid-tick handling failures adjust only remaining distance/time. Adds explicit yield/brake outcomes, blocked warnings/forced-retirement recovery, maneuver fixtures and movement inspection. Rear-row clock/lap rules remain unchanged.

Required new inputs: scenario maneuvers (empty in reference fixtures), movement.handling/conflict tuning and respectSafeCornerSpeed. Fixtures are explicitly updated; old a3-1 / 0.3.1 inputs are rejected rather than silently migrated. Existing clean-yield regression now specifies ample braking room to retain its purpose; a separate test covers the new brake outcome. B1 tests include 1,000 compact seeded races and browser plan/trace/export checks. See D-043–D-050. AI/commands are B2; actual contact/damage remains C1.

## A4 developer tools — 2026-11-12 (simulation remains 0.3.1)

Adds schema-driven component/tuning/rule number editors, units/bounds/default resets, isolated derived-stat previews, named IndexedDB configurations and validated self-contained configuration import/export. Adds bounded immutable trace/state capture, loss counters, searchable multi-field filtering, record detail and historical tick/RU inspection. Adds 1×/2×/4× playback and pause around unchanged engine step calls. Browser tests compare playback with headless hashes, exercise persistence across reload, malformed imports, storage failure, snapshots and downloads.

No mechanics or engine input versions changed. Configuration artifacts use blood-thunder-configuration-a4-1; diagnostic exports add developerRecording formatVersion a4-1. No live override or complete replay restoration is implied. See D-037–D-042.

## 0.3.1 / schema a3-1 — 2026-11-12

Implements explicitly approved common-clock rear-row accounting (D-034), completing A3 six-RU support. Rear positions begin at negative normalized NCU; the first accepted line crossing emits lap_started without awarding a lap. Subsequent full laps and finish use accepted crossings and the original race-start clock. Adds lap-start state/timestamps and accounting invariants. Enables six-RU CLI/browser defaults; retains the front-row regression fixture.

Scenario simulationVersion is now 0.3.1; fixtures are updated explicitly. Input schema a3-1 is unchanged. No automatic migration or complete snapshot restoration is implemented. Tests include blocked/partial crossings, multiple laps, common-clock ties, countdown, alternate boundaries/deeper rows, full reference replay consistency and browser exports.

## 0.3.0 / schema a3-1 — 2026-11-12 (A3 partial)

Adds a separate circuit controller with countdown/race clocks, accepted-crossing lap/finish accounting for front-row fixtures, fractional times and shared tie ranks, normalized standings, cutoff/watchdog DNFs, zero-propulsion retirement, typed rule events, immutable results and diagnostic handoff. Movement scheduler gains opt-in event/transition/occupancy hooks so finishers stop at the crossing and stop blocking traffic; the A2 harness retains its previous behavior.

New required rules fields: countdownTicks and finishTieToleranceSeconds. No automatic migration from a2-1 exists. Rear-row policy F.3 is awaiting explicit owner review; six-RU circuit execution is gated. A separate four-front-row fixture exercises independent A3 work without modifying the reference grid. See D-026–D-033.

## 0.2.0 / schema a2-1 — 2026-11-12

Adds provisional B.3/B.7 RU stat derivation with per-component condition factors and editable coefficients. Adds A.2 fixed-tick trapezoidal movement, explicit intermediate-transition scheduling, physical lane costs, atomic forward conflict groups, clean-yield blocked-budget discard, deterministic tied-merge arbitration and raw line-crossing events. Adds diagnostic checksums, immutable stepping, safety halt/error exports and developer stepping controls.

Required input additions: tuning `stats` and `movement`, scenario `targetSpeedRatios`. Version a1-1 / simulation 0.1.0 files are rejected rather than silently migrated. Existing example files are updated explicitly. Decisions D-018–D-025 and movement/scheduler tests document these provisional choices; no approved gameplay rules changed.

## 0.1.0 / schema a1-1 — 2026-11-12

Initialization-only content/scenario validation, aligned grid, named seeded RNG streams and immutable component state. No movement or official race results.
