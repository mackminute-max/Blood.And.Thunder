# Blood and Thunder — Prototype v0.3 Development Instructions for Codex

**Status:** Owner-directed update specification; implement in gated milestones F–J  
**Version:** 0.3 planning/implementation brief  
**Date:** 2026-11-13  
**Primary objective:** Correct verified v0.2 defects, add two race rulesets, make RU balancing efficient, and rework Strategy Signs into queued, line-activated, more consequential directives. **Do not build the campaign/stable progression loop in this update.**

## 0. Instructions to Codex: read first

1. Read repository-root `AGENTS.md`, the authoritative `Blood_and_Thunder_Prototype_Development_Spec_v0.2.md` (wherever it actually resides), `docs/DECISIONS.md`, `docs/ACCEPTANCE_MATRIX.md`, `docs/IMPLEMENTATION_STATUS.md`, all relevant test/configuration documentation, and the **complete** `docs/Prototype_Implementation_Audit.md` if present.
2. The audit excerpt supplied for this brief ends at `## 5. Findings by severity / ### Critical`. It identifies H-01 through H-04 and M-01 through M-11 by summary, but does **not** supply their complete detailed definitions. **Read the full repository audit before claiming any detailed finding has been remediated.** Do not infer missing acceptance criteria from IDs alone.
3. Authority order: latest explicit owner decisions in this v0.3 brief; earlier approved v0.2 Sections 1–11 except where superseded here; accepted decision-register amendments (including D-034 and D-061); provisional v0.2 Appendices A–F; implementation defaults. If this document conflicts with `AGENTS.md`, report the conflict and update documentation consistently; do not silently override approved mechanics.
4. Inspect the **actual** code and UI before changing anything. Reuse existing config schema, command queue, state transitions, logging, scenario editor, batch tools, and tests wherever practical. Do not duplicate engines or create parallel rule implementations.
5. Before changes: ensure a clean Git working tree, preserve existing work, and create a recoverable v0.2 baseline tag or branch **only if it does not overwrite an existing tag/branch**. Do not force-push or reset user work. Work on a dedicated v0.3 branch. Report exact baseline revision.
6. Implement F → G → H → I → J in small reviewable changes. After each milestone, run relevant tests, typecheck, lint, build, and browser smoke tests where applicable. Update the decision register, status/acceptance matrices, and migration notes. Report what was actually tested, not just intended.
7. Keep simulation deterministic, headless, fixed-tick, and independent of Phaser/browser timers. All tuning must be validated, versioned, serializable, replayable, and visible in diagnostics. Avoid unseeded randomness, array-order arbitration, UI-driven simulation state, or hidden magic constants.

## 1. Scope and explicit owner decisions

**Approved for v0.3:**

- **Two race rulesets:** `Combat Racing` (offensive combat and deliberate lateral ramming legal) and `Pure Racing` (no deliberate attacks or offensive ramming; incidental contact remains possible and may have consequences).
- **Bulk RU attribute editing:** Developer tools must be able to set the same supported attribute to the same value across **all RUs in the current scenario** in one operation. Provide a convenient workflow for repeated balancing and preserve per-RU editing.
- **Queued Strategy Signs:** Player can raise a sign at any time, but it takes effect **only when that RU next crosses the start/finish line**. A pre-race queued sign activates at the starting signal. The existing active sign remains effective while a replacement is pending. Lowering an active sign is immediate and free. The default three raise/replace opportunities per race remains.
- **Stronger Strategy Signs:** Make the influence observably more dramatic than v0.2 while retaining driver autonomy and safety-critical reactions. Expose global and per-sign influence tuning in developer tools; inspect existing settings before adding duplicates.
- **Audit repairs:** Address verified High findings and review remaining Medium/Low findings from the complete audit; integrate regression coverage.
- **Balance instrumentation:** Improve batch comparisons and manual-test controls to tune and compare both race formats and sign influence.

**Not approved by implication:** guaranteed sign obedience, free replacement of pending signs, separate race engines, automatic prohibition of incidental collision damage, removal of individual RU identities, full new game economy, or broad AI rewrites unrelated to measured behavior.

## 2. Milestone F — Correctness and audit remediation

### F1. Reconcile full audit

Create/update `docs/V03_AUDIT_REMEDIATION.md` with each finding ID, severity, reproducible symptom, approved/provisional requirement affected, relevant files, planned fix, test, and status. The provided audit summary reports **0 Critical, 4 High, 11 Medium, 4 Low**. Do not mark Medium/Low items fixed without inspecting their complete descriptions. Prioritize correctness and integrity before numerical balance.

### F2. High findings (required)

- **H-01: fractional contact scheduling/accounting.** Reproduce the reported controlled case where progress was `0.90` instead of time-correct `0.95`. Fix time-of-contact integration and remaining fractional movement consistently for all affected RUs. Preserve simultaneous arrival resolution, atomic occupancy, no progress banking when blocked, intermediate-tile checks, and fractional finish timestamps. Add adversarial regression tests (different speeds, simultaneous contacts, multi-tile movement, lane changes, tie ordering, finish-line crossing, reordered entity inputs). Do not merely alter expected output to match the defect.
- **H-02: malformed command target IDs.** Validate IDs such as `constructor`, `__proto__`, and `toString` without exceptions or prototype-chain lookup vulnerabilities. Use safe own-key maps/Maps and schema-level checks. Invalid commands must produce structured rejection, no authoritative mutation, and no replay divergence. Test direct API, imported configuration, developer UI, and replay where applicable.
- **H-03: inert approved attributes.** Audit mechanical consumers for driver `nerve`, chariot `durability`, intrinsic track `roughness`, and turn `severity`. Make approved attribute meanings mechanically operative in the appropriate risk, damage, movement/handling, or environment calculations, with explainable derived values and deterministic tests. **Exact formulas are provisional**: choose small, tunable, documented effects rather than inventing permanent canon. Ensure changes are detectable under controlled test conditions without forcing a change in every tick/hash. Avoid double-counting existing related modifiers.
- **H-04: incomplete results statistics.** Produce authoritative per-RU final classification, finish times, laps, overtakes, time leading, combat actions/hits, damage, incidents, penalties, component condition, and Strategy Sign usage as required by v0.2 §11.6. Define precise event-derived counting semantics, including no-finish/DNF cases, ties, and noncombat race mode. Results UI, export, and batch metrics should consume the same authoritative counters. Do not synthesize missing data from presentation animations.

### F3. Other findings and safety

From the summary: **M-01** actor/target log filtering misses target hits; **M-03** reconstructed-run identity can mask an invalid historical capture; **M-02** logging controls; **M-04** editor coverage; **M-05** extension hooks; **M-06** persistent-wreck mode; **M-07** AI context/memory; **M-08** environmental scope; **M-09** full-reference balance evidence; **M-10** hardcoded policy; **M-11** determinism enforcement. Confirm exact scope in full audit. Fix M-01 and M-03 as part of v0.3 diagnostic integrity, and address M-02/M-04/M-09 where needed for milestones H/J. Triage the rest explicitly as `fix now`, `defer with reason`, or `needs owner decision`. Inspect all four Low findings and record dispositions. Do not expand scope to speculative features just to close a finding.

**F exit:** H-01 through H-04 have reproductions and passing regressions; M-01/M-03 integrity issues addressed; deterministic reference behavior verified; audit matrix and documentation updated. No new race-format tuning until this gate passes.

## 3. Milestone G — Two configurable race rulesets

### G1. Model and controls

Introduce a validated, versioned race rule setting, e.g. `raceRules.competitionStyle: 'combat' | 'pure'` (adapt naming to existing contracts). Default **Combat Racing** for backward compatibility with v0.2 fixtures. Display an explicit selector in the developer scenario/race setup panel and show the active ruleset in the viewer and exported results. Persist in scenario/config exports, hashes, logs, and deterministic replay inputs. Do not create two simulation engines.

### G2. Combat Racing

Preserve v0.2 mechanics: legal driver melee/ranged attacks, trained-beast attacks, mounted weapons where equipped, deliberate lateral rams, defenses, incidental collisions, component damage, and existing lethality settings. Respect cooldowns, legality, availability, and D-061 simultaneous combat resolution.

### G3. Pure Racing

- Disallow **intentional offensive actions** by all RUs: melee, ranged, mounted, trained-beast attacks, deliberate offensive ramming, and any equivalent attack intent. Enforce this at **both AI candidate generation and authoritative action validation/resolution**; UI-only hiding is insufficient.
- Permit legal overtaking, lane defense/positioning, braking, hazard avoidance, and ordinary maneuvering. A defensive maneuver must not be implemented as an intentional attack or damaging ram.
- **Incidental contact remains possible**, including unavoidable movement conflicts, side contact, and collision with obstructions. Resolve contact with the shared physics/contact system. Damage or loss of control from incidental contact remains possible under existing physics; do not automatically disable all collision consequences.
- A race ruleset is **not** a physics preset: retain weather, fatigue, track roughness/severity, hazards, and race-ending conditions unless separately configured.
- Prevent deliberate-attack AI utility bonuses from influencing decisions in pure mode. An `Attack` Strategy Sign, if present in the catalog, must **not authorize prohibited actions**. Preferred v0.3 behavior: reject queuing an incompatible Attack sign in Pure Racing with clear UI explanation and no opportunity consumed; validate the same rule in the engine. If an imported scenario has an incompatible queued/active sign, apply a documented deterministic rejection/clear policy before the race and record it. This is an implementation default subject to owner review, not new permanent sign canon.
- Preserve any existing legal incidental-contact event logging; distinguish `intentional_attack`, `deliberate_ram`, and `incidental_contact` in diagnostics and metrics. Avoid classifying an ordinary failed pass as a deliberate ram solely because contact occurred.

### G4. Ruleset acceptance

Paired seed/scenario tests: Combat mode permits valid offensive action; Pure mode produces **zero legal offensive actions and deliberate rams** while still allowing overtakes and at least one reproducible incidental contact consequence in a crafted fixture. Test direct malicious/invalid combat commands, AI intents, transitions between saved configurations, imported/replayed races, results, and UI. No mode-specific nondeterminism or occupancy violation.

## 4. Milestone H — Developer tooling and bulk RU edits

### H1. All-RU editing

Add an obvious `Apply to all RUs` action next to supported per-RU editable attributes, or an equivalent dedicated bulk-edit panel. It must:

1. Let the developer choose **attribute path**, enter a valid value, preview the affected RUs and old/new values, then apply to **every RU in the current scenario** with one confirmation. Cover relevant driver skills, draft-beast attributes, chariot attributes, AI/personality/strategy parameters, and other RU-scoped tunables supported by existing schema. For nested multi-beast attributes, clearly define whether it means **all beasts on all RUs** or a specific indexed beast slot; do not silently update just one beast.
2. Apply as one validated, atomic scenario edit: either all eligible targets change or none do. Respect per-field bounds/types and referential integrity. Display reasons for rejected operations; no partial updates or silent clamping.
3. Preserve RU IDs, individual rosters, equipment, and unrelated fields. Never accidentally change track/global settings when applying an RU-scoped edit.
4. Support **pre-race scenario editing** as the minimum. If live-race bulk overrides are offered, they must be separate, explicit developer-only commands, tick-stamped, validated, recorded, and replayable. Do not reset a running race implicitly.
5. Provide undo or easy restoration via a pre-edit snapshot / named scenario, with clear indication of unsaved changes. Include `Restore original values` if feasible without introducing hidden state.
6. Offer optional `Copy values from RU` and `Save/load balance preset` only after core all-RU editing works; presets must use versioned validated data and not overwrite unrelated scenario configuration.

### H2. Developer access to sign tuning

Expose global sign influence and per-sign strength settings in the existing developer UI, **not only JSON files**. Display current values, effective derived multipliers, valid ranges, and reset-to-default. Changes must be saveable, comparable, exportable, and visible in AI diagnostic traces. Inspect existing tuning controls and extend them rather than duplicating fields.

### H3. Diagnostics usability

Improve actor **and target** event filtering (M-01), recording/capture authenticity (M-03), and logging verbosity/sampling/editor coverage where confirmed by full audit. Provide direct visibility into sign state, queue timing, next activation crossing, consumed opportunities, current AI utilities, and reasons a sign did not cause the desired action.

**H exit:** one action can set every RU's chosen attribute consistently; invalid bulk edits are atomic rejects; sign tuning is accessible and persisted; export/import and deterministic reruns preserve edits.

## 5. Milestone I — Strategy Sign rework

### I1. State model and terminology

Maintain per-controlled-RU **`activeSign`** and **`pendingSign`** separately. A raised sign is accepted and **queued** now; it is **not active until the next eligible start/finish-line crossing**. State and command history must distinguish `queued`, `activated`, `lowered`, `replaced`, `rejected`, and `expired/cancelled` if applicable. Retain the approved default of **3 raise/replace opportunities per race**; a successfully accepted raise/replacement consumes one at queue time; invalid/rejected submissions consume none. Lowering active sign is free and immediate at the next valid command-processing boundary.

### I2. Timing and edge cases

- **Pre-race:** A queued sign activates at the common starting signal, including rear-row RUs. Do not confuse start-line crossing with a completed lap.
- **During race:** Activation occurs at the **next actual forward crossing** of that RU's start/finish line, not at a tick timer or completion of an arbitrary segment. Use the authoritative track transition/crossing event; handle multi-tile-per-tick and fractional-tick crossings.
- **Replacement:** The current active sign remains in effect while a different sign is pending. On the crossing, pending atomically replaces active. The replacement sign must not affect AI decisions **before** activation.
- **No active sign:** Queued sign remains pending; base AI/personality/pre-race strategy continues until activation.
- **Lower active:** Free and immediate at next valid command-processing boundary. **If a pending sign also exists, lowering active does not cancel pending**; provide a separate explicit `Cancel pending` control. This is a proposed interaction detail, not an approved change to the opportunity economy.
- **Cancel pending:** For v0.3, cancellation is allowed without refunding the opportunity already spent. This is a **provisional default**: document and request owner approval before locking as canon. Avoid hidden refunds or loopholes allowing unlimited free sign switching.
- **Queue while pending:** Reject a second queued sign until the pending sign activates or is explicitly cancelled; do not silently overwrite it. This is a **provisional default** chosen for clear accounting and testability.
- **Same-tick crossing/command:** Define deterministic ordering using existing command submission/tick phase and crossing timestamps. A command accepted **before** that tick's movement/crossing may activate at that crossing; one submitted afterward waits for the next. Document exact behavior and ensure replay reproduces it.
- **Race ends before crossing:** Pending sign never activates. Preserve queued/unused state in results and logs. Disabled/retired RU cannot activate a pending sign after elimination.
- **Final crossing:** If a finish-line crossing ends the RU's race, record crossing and result consistently; no post-finish AI action is created merely because a sign activated at the finish.
- **Player control:** Keep owner-directed sign permissions and developer override permissions distinct. No sign changes for unrelated AI RUs unless explicitly authorized by developer mode.

### I3. Stronger, configurable effect

Retain utility-based autonomous driving. **Do not guarantee obedience or bypass legality, cooldown, perception, safety, or pure-racing restrictions.** Introduce a configurable global strength (suggested initial multiplier **2.0×** the v0.2 sign-specific utility contribution) and per-sign multipliers (suggested **1.0×** initially). These are **initial tuning hypotheses, not approved numerical canon**. Expose bounded ranges and effective utility adjustments in the dev tools. Existing sign-specific secondary effects (e.g. Push Hard fatigue) should be explicit and separately tunable; avoid accidentally multiplying unrelated fatigue or physics effects when scaling utility.

Evaluate signs against their intended behavior: Push Hard increases pursuit/push choices; Defend Position increases protection/position-holding; Conserve reduces aggression/exertion; Attack increases **legal** attacks/rams in Combat Racing only. Strength should be measurable under comparable conditions, not merely produce larger numbers in logs. Driver personality and situational safety must still sometimes override the sign. If simple utility scaling fails to produce a meaningful behavioral change, instrument and refine AI decision boundaries/commitment behavior through configurable mechanisms, with targeted tests rather than hidden hardcoded overrides.

### I4. Presentation, commentary, and logs

Display `Active: ...`, `Pending: ... (activates at next line crossing)`, and remaining opportunities simultaneously. Differentiate pending vs active visually; show activation notification at crossing. Never describe a queued sign as already influencing the driver. Log authoritative queue/activation events with RU, tick, crossing context, previous/new sign, opportunity count, and utility contribution; commentary may reference these factual events without inventing obedience. Update replay, results, export, and UI smoke tests.

### I5. Strategy Sign acceptance matrix

Automate at minimum: pre-start activation; mid-lap pending; line crossing activates once; multi-tile crossing; rear-row first crossing (D-034); active sign persists while replacement queued; immediate free lowering; cancellation policy; second-pending rejection; exhausted opportunities; illegal Attack sign in Pure Racing; race termination before activation; simultaneous input/crossing; seed replay; reordered RU inputs; comparison of baseline vs higher sign strength with a scenario designed to produce a measurable change. No hidden opportunity charges or refunds.

**I exit:** queue semantics are correct at authoritative crossing boundaries; stronger effects can be measured; UI makes timing unambiguous; all key edge cases replay deterministically.

## 6. Milestone J — Balancing, validation, and release candidate

### J1. First establish trustworthy measurements

After F–I, run both rule styles through paired seeds and equivalent rosters/tracks. Support at least reference oval and compact adversarial fixtures. Track race completion rate, winner/finish times, spread, laps, overtakes, lead time, lateral changes, blocks, incidental contacts, deliberate rams, attack attempts/hits, component damage, disablements, DNFs, fatigue, sign queue/activation/usage, and AI action distribution. Report statistics by **race style** and by RU. Do not count prohibited attacks in Pure Racing as successful actions. Distinguish scenario limitations from real full-reference races.

### J2. Manual playtest loop

Provide a short reproducible procedure: select ruleset; apply all-RU equal-stat baseline; save scenario and seed; run once normally with no signs; rerun with selected signs; rerun at increased influence; export results/logs; compare. Repeat with differentiated drivers/beasts/chariots, conditions, and events. Record qualitative findings (is overtaking visible? is combat dominant? does pure racing remain competitive? can player notice sign effect?) separately from numeric evidence.

### J3. Balance principles

- **Do not preemptively declare balance achieved.** User has reported substantial imbalance in manual playtesting; collect evidence and propose changes.
- Separate **correctness fixes** from **balance parameter changes**. Keep tuning in versioned configuration with before/after comparisons and rollback.
- Establish baseline distributions before selecting targets. Do not invent official target DNF, attack, or finish-gap rates without owner approval.
- Avoid tuning around one seed, one winner, or only compact test tracks. The audit's one reference run had four DNFs at cutoff and player chariot disablement; investigate across many seeds rather than treating that single observation as conclusive.
- Where possible provide saved presets such as `equalized-rus`, `combat-baseline`, `pure-racing-baseline`, and `high-sign-influence`, with explicit parameter differences and no unapproved canon values.
- Compare player-observable effect, not only simulation internals. A dramatic sign effect must be discernible in behavior and results while preserving autonomous AI.

### J4. Required verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:browser` using the project's documented browser/server prerequisites. Run reference and adversarial deterministic comparisons; exercise both rulesets; ensure no regression to D-034/D-061, occupancy, blocked progress, finish timing, event integrity, or headless/Phaser separation. Record exact commands, pass/fail, sample counts, seed lists, environment, and any skipped checks. Preserve or intentionally update golden baselines with rationale when correctness changes outcomes.

**J exit:** reproducible v0.3 build, complete tests, two race modes, reliable all-RU editing, line-queued stronger signs, authoritative metrics, and a written balance report. Balance quality itself remains an iterative owner-reviewed gate.

## 7. Deliverables and documentation

Update/create the following, adjusting paths to the existing repository structure:

- Source, configuration/schema migrations, UI, tests, and browser smoke coverage for F–J.
- `docs/V03_AUDIT_REMEDIATION.md` — all audit findings with dispositions and evidence.
- `docs/V03_CHANGELOG.md` — behavior changes, old/new config semantics, migration/backward compatibility, test outcomes.
- `docs/V03_BALANCE_REPORT.md` — scenario/seed matrix, both modes, sign-strength comparisons, quantitative and qualitative results, open questions.
- Existing `docs/DECISIONS.md`, `docs/ACCEPTANCE_MATRIX.md`, `docs/IMPLEMENTATION_STATUS.md`, and user-facing developer-tool instructions.
- A sample exported scenario for each ruleset and a reproducible all-RU equalized scenario.

Keep v0.2 artifacts intact and document superseded behavior. Update `AGENTS.md` only as needed to point Codex to this approved v0.3 brief and current authoritative documents; do not silently replace v0.2's approved sections.

## 8. Implementation discipline and handoff

At the start of each milestone, present a short implementation plan, affected modules, provisional choices, and tests. Implement, test, and commit in reviewable units. At milestone completion report: changed files, functional behavior, audit items closed/deferred, exact tests and outcomes, new tuning defaults, outstanding questions, and any divergence from this brief. **Stop and ask** if a design choice materially changes approved gameplay, violates a safety/determinism invariant, or requires choosing among incompatible user-visible rules beyond the explicitly provisional defaults here.

**Final v0.3 completion criterion:** the game can run deterministic **Combat Racing** and **Pure Racing**; developers can equalize all RU attributes through the UI; Strategy Signs queue and activate at the next line crossing with stronger tunable influence; High audit defects are repaired with regressions; diagnostics/results support meaningful balance work; and all changes are documented and verified. Do not claim that the game is fully balanced or that all audit findings are closed unless evidence supports those claims.
