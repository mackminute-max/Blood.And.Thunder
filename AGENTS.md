# AGENTS.md — Blood and Thunder

Instructions for AI coding agents working in this repository. Apply these rules to every task unless the project owner explicitly changes them. This file governs **how to implement** the game; it does not supersede the game specification.

## 1. Mission and scope

**Blood and Thunder** (former codename: BludWheelz) is a browser-first, fantasy chariot combat-racing roguelite auto-battler. The player manages a stable and enters one Racing Unit (RU: draft beasts + chariot + driver), rather than directly driving. The initial deliverable is a **playable, deterministic, inspectable racing prototype**, not the full campaign game.

Priorities, in order:
1. Correct simulation and reproducibility.
2. Developer inspectability, configurable parameters, and automated tests.
3. Interesting autonomous racing and combat behavior.
4. Readable race presentation and event-grounded commentary.
5. Visual polish and campaign features later.

Do not build deferred campaign systems, advanced visuals, or unrelated features without explicit authorization. Do not invent new gameplay rules when the specification supplies an answer.

## 2. Source of truth and decision authority

Read **`Blood_and_Thunder_Prototype_Development_Spec_v0.2.md`** before designing or changing simulation behavior. If it is not in the repository, **stop and request it**; do not reconstruct it from memory or assume it exists at another path. Read the relevant sections and appendices for each task, not just the summary.

Precedence:
1. Explicit project-owner instructions and subsequently approved amendments.
2. **APPROVED** gameplay decisions in specification Sections 1–11.
3. Accepted decisions in `docs/DECISIONS.md` (or an existing equivalent register).
4. **PROVISIONAL** engineering baselines in specification Appendices A–F.
5. Local implementation choices.

The v0.2 appendices provide implementable defaults, **not newly approved game canon**. Preserve that distinction in code, documentation, and communications. If a provisional choice conflicts with an approved rule, follow the approved rule and flag the conflict. If a later accepted decision conflicts with the specification, document it and request a specification update.

**Decision classification:**
- `APPROVED`: Must be preserved; ask before changing.
- `PROVISIONAL`: May be implemented as a configurable, tested baseline; document the choice and consequences.
- `DEFERRED`: Do not implement unless the owner explicitly expands scope.
- `UNRESOLVED`: Ask when it materially affects gameplay, architecture, data compatibility, or deterministic outcomes; otherwise choose the smallest reversible approach and record it as provisional.

Never silently promote a provisional value, formula, rule, or schema into an approved requirement. Never silently replace a specified algorithm with a simpler one just to make a demo work.

## 3. Working method for each coding task

1. Inspect the current repository, package scripts, relevant modules, tests, and specification sections. Do not assume the repo is empty.
2. Restate the requested scope and identify the acceptance criteria. If the task is large, propose a small milestone-oriented plan before major edits.
3. Identify relevant **APPROVED**, **PROVISIONAL**, and **UNRESOLVED** decisions. Ask focused questions only for blocking decisions; do not repeatedly ask about settled design.
4. Make the smallest coherent implementation. Keep unrelated behavior and public interfaces stable.
5. Add or update tests alongside implementation, including deterministic and failure-path tests.
6. Run applicable checks, inspect failures, and fix issues caused by the change. Do not claim checks passed unless they actually ran.
7. Update decision records, configuration documentation, and relevant examples if behavior or data contracts changed.
8. Report changed files, behavior, tests run/results, assumptions, and remaining issues. Separate implemented work from recommendations.

**Do not implement the entire specification in one giant change.** Work through Milestones A–E in specification Section 16, meeting the corresponding exit criteria before advancing. Within a milestone, prefer small independently testable increments.

## 4. Required technical architecture

- **Language:** TypeScript, strict type checking. Prefer explicit domain types and discriminated unions over `any` and unvalidated strings.
- **Browser:** Vite; **rendering:** Phaser 2D; **tests:** Vitest; **versioning:** Git; **local persistence:** IndexedDB where needed.
- **Headless simulation:** No imports from Phaser, browser DOM, UI components, rendering code, or commentary. Must run in automated tests without a browser.
- Separate modules for race control, track/topology, movement, occupancy/conflicts, entities/stat aggregation, AI, combat, environment/events, race rules, event log, and diagnostics.
- UI consumes authoritative state and events. UI must **never mutate simulation state directly**.
- All player commands (including Strategy Signs) and developer overrides enter through a validated, tick-stamped command queue.
- Store immutable initial configuration separately from mutable race state. Prefer pure calculation functions and explicit state transitions.
- Use versioned JSON data definitions and runtime validation. Validate IDs, references, ranges, topology, configuration, and imported files at boundaries.
- Keep formulas, weights, thresholds, rates, presets, and race defaults in editable configuration rather than scattering magic numbers through source code.
- Preserve extension points without prematurely implementing deferred systems. Avoid unnecessary abstraction layers and dependency additions.

The specification's suggested folder structure is guidance; conform to an existing coherent repository structure rather than reorganizing it without cause.

## 5. Determinism is a nonnegotiable invariant

Given the same **engine version + validated initial configuration + seed + ordered tick-stamped commands**, the engine must reproduce the same authoritative state transitions and results.

- Use an explicit seeded pseudorandom generator passed to simulation subsystems. Never use `Math.random()` for simulation outcomes.
- Do not use wall-clock time, `Date.now()`, animation frame timing, UI state, or asynchronous completion order to decide simulation outcomes.
- Define stable ordering for entity iteration, simultaneous actions, conflicts, event emission, and ties. Do not let array insertion order accidentally determine winners.
- Use fixed simulation ticks. Playback speed, pausing, and rendering cadence must not alter simulation results.
- Log effective tick and payload of all commands, including debug overrides. Record seed, schema/engine version, initial configuration, and relevant state hashes/snapshots.
- Use deterministic numeric operations and document rounding/precision rules. Avoid introducing platform-dependent behavior into authoritative calculations.
- Do not assume that two *different* configurations with the same seed will consume random draws in the same order.
- Make it possible to run batches of races headlessly and to compare the first divergent tick between two executions.

## 6. Approved gameplay invariants — do not regress

- One RU occupies one `(segment, lane)` tile at a time; no two active RUs finish a resolved tick in the same tile.
- An RU may traverse multiple tiles per tick; **all intermediate transitions** must be checked.
- Unused movement progress blocked by a conflict is **discarded**, never banked.
- Ordinary favorable adjacent-lane changes have no automatic speed/progress penalty; difficult maneuvers may incur risk/cost.
- Resolve movement from simultaneous intents, not arbitrary sequential iteration. Distinguish a movement conflict from damaging physical contact.
- Chariot ramming is normally **lateral**; routine deliberate rear-end ramming is not the standard attack because beasts pull ahead of the chariot.
- RU performance is derived from individual beasts, chariot, driver, equipment, and conditions. Track team fatigue initially, but individual beast condition/damage.
- Driver AI uses perceived information, utility scores, personality, pre-race strategy, and limited tactical memory; it outputs intents, not guaranteed outcomes.
- Strategy Signs: **three raises/replacements per race by default**, raising costs one, replacing costs one, lowering is free, an active sign persists, and driver obedience is not guaranteed. Commands may be issued while paused and apply at the next valid tick boundary.
- Combat is part of race ticks, uses cooldowns/channels and component-specific damage; default lethality is configurable **Dangerous**.
- Start racers in **aligned, non-staggered rows**. Do not compensate for inside-lane corner advantages by staggering starting positions.
- Standings use normalized course progress, not raw physical distance. Record lap/finish crossings from transitions, with fractional-tick timing.
- Disabled RUs may temporarily obstruct tiles; delayed removal is the default. Ensure races do not silently deadlock.
- External random race events are optional (default intensity: **Occasional**); weather, track conditions, and events are separate systems. Crowd influence affects morale/performance, not direct physical interference.
- Commentary derives only from authoritative events. It must not fabricate attacks, incidents, results, or causal claims.

See the specification for qualifications and detailed behavior. This list is a guardrail, not a replacement for it.

## 7. Prototype developer tooling is mandatory

Developer tooling is part of the **initial prototype**, not a post-launch extra. Build it incrementally alongside the simulation.

Required capabilities:
- Edit individual beast/chariot/driver attributes and condition, AI personality/weights, and relevant movement, collision, combat, weather, event, and race-rule settings **without editing source code**.
- Show calculated RU stats and their contributing modifiers. Label temporary derived-stat overrides clearly.
- Save/load/reset/import/export test configurations and fixed-seed scenarios.
- Pause, advance **exactly one tick**, and inspect authoritative RU/tile/event state.
- Inspect AI candidate actions, scores, chosen intents, and actual outcomes.
- Inspect movement intentions, intermediate transitions, conflicts, contact outcomes, and discarded progress.
- Permit only explicitly supported live overrides while paused, applied through the command queue and logged with old/new values, target, source, and effective tick. Initialization-sensitive settings require a restart.
- Separate player commentary from structured diagnostic logs. Support `error`, `warning`, `info`, and `trace` levels; filtering by tick, RU, subsystem, severity, and event type; and JSON export (human-readable export optional).
- Provide an event timeline and reproducible diagnostic bundle. Surface invariant violations rather than silently repairing invalid state.

Do not defer these requirements merely because the first viewer uses simple markers.

## 8. Test and validation policy

Use Vitest for unit, integration, deterministic regression, and invariant tests. Add targeted tests for every new mechanic.

Minimum test categories:
- Track connectivity, lane topology, valid starting grids, and aligned rows.
- Acceleration/braking, fractional movement, multi-tile transitions, and blocked-progress discard.
- Contested tiles, vacated tiles, swaps/crossings, deterministic conflict ordering, and no duplicate occupancy.
- Lane handling and lane-length effects versus normalized standings.
- AI perception limits, utility decisions, sign influence/persistence, and seeded repeatability.
- Combat arcs, cooldowns, simultaneous actions, damage, and component disablement.
- Environmental effects, hazard placement, event frequency controls, and wreck removal.
- Fractional finish timing, laps, classification, DNF, ties, and race termination.
- Debug command validation, logging, import/export, and one-tick stepping.
- Commentary correspondence to real events and separation of viewer from simulation.

Use the specification's `oval-six-v1` reference scenario and adversarial fixtures when available. Keep deterministic golden tests focused on stable **authoritative outcomes**; avoid brittle UI snapshot tests for simulation logic. When a formula changes intentionally, explain and review golden-result changes rather than blindly accepting new snapshots.

Before marking a task complete, run the project's relevant `typecheck`, `lint` (if configured), `test`, and `build` scripts. If a script or dependency is unavailable, report that explicitly; do not fabricate a passing result. Never delete or weaken a failing test merely to make CI green.

## 9. Data integrity, logging, and error handling

- Define and version public data contracts; use explicit migrations or reject incompatible saves with actionable errors.
- Treat imported JSON and developer inputs as untrusted. Validate before applying; do not execute code from configuration.
- Prefer structured event payloads with stable IDs, tick, actors, location, and outcome. Use stable event ordering and distinguish attempted actions from confirmed outcomes.
- Avoid logging unbounded trace data by default. Support configurable verbosity, bounded buffers, export, and optional snapshots while retaining enough information to diagnose failures.
- Log invalid state and failed command validation with sufficient context. Do not silently ignore invalid commands, impossible topology, or missing component references.
- Keep presentation failures from corrupting simulation state. Error messages should identify subsystem and relevant tick/entity when possible.

## 10. Git and change safety

- Inspect `git status` before editing. Preserve unrelated work and user changes.
- Do not run destructive Git commands (`reset --hard`, `clean -fd`, force push, rewriting shared history) without explicit approval.
- Do not commit secrets, credentials, local machine paths, generated bulk logs, or unnecessary build artifacts.
- Use focused commits or clearly separable changes; do not combine broad refactors with gameplay modifications unless necessary.
- Add dependencies only when justified; explain why a library is needed and prefer the established stack.
- Do not change package manager, build tooling, directory layout, or persistence strategy without a reason and user approval for material changes.

## 11. Documentation and decision register

Maintain `docs/DECISIONS.md` (create it when first needed) with, at minimum:

| Field | Meaning |
|---|---|
| ID / date | Stable identifier and date |
| Subsystem | Movement, AI, combat, etc. |
| Status | APPROVED / PROVISIONAL / DEFERRED / UNRESOLVED |
| Decision | Exact behavior, formula, value, or interface |
| Authority | Specification section, explicit user approval, or implementation baseline |
| Rationale | Why this approach was selected |
| Configuration key | How it can be changed, if applicable |
| Tests | Evidence or regression tests |
| Revisit trigger | What would justify changing it |

Do not mark an implementation assumption as `APPROVED` merely because it has been coded. Keep a short `docs/IMPLEMENTATION_STATUS.md` (or existing equivalent) recording completed milestones, gaps, and known issues. Update example configurations when contracts change.

## 12. When to stop and ask

Request direction before:
- Changing an approved rule or introducing a new core mechanic.
- Choosing between incompatible interpretations that materially change race behavior.
- Making a nonreversible architectural decision or changing established public data formats without a migration plan.
- Adding major scope outside the active milestone or implementing a deferred feature.
- Replacing deterministic behavior with approximate/nondeterministic shortcuts.
- Removing tests, diagnostic capabilities, or developer tuning controls to simplify implementation.

You **may** implement a documented provisional baseline from v0.2 without asking about every number, provided it remains configurable and tested. If a detail is truly unspecified and nonblocking, choose a minimal reversible default, record it, and flag it in the task report.

## 13. Expected task report

End each coding task with a compact, factual report:

1. **Implemented:** Behavior and files changed.
2. **Validation:** Commands actually run, pass/fail status, and notable results.
3. **Decisions:** Approved rules preserved; provisional choices and decision-register entries.
4. **Remaining:** Known limitations, unresolved questions, and next suggested small task.

Never claim a feature is finished, tested, or playable without corresponding implementation and evidence. The project owner makes final design decisions; the coding agent is responsible for implementation discipline and transparent reporting.

## v0.3 task authority

For owner-authorized v0.3 work, also read `Blood_and_Thunder_v0.3_Codex_Development_Instructions.md`. Its explicit owner decisions supersede earlier rules only where stated. Implement gated milestones F–J; preserve the v0.2 specification and its approved rules otherwise. Track unresolved full-audit requirements in `docs/V03_AUDIT_REMEDIATION.md`. Provisional defaults remain provisional.
