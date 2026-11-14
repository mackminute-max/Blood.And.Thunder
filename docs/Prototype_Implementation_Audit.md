# Blood and Thunder — independent implementation audit

**Historical baseline audit.** Subsequent implementation responses and current verification are tracked in [AUDIT_REMEDIATION.md](AUDIT_REMEDIATION.md). Findings below are preserved as originally audited.


Audit baseline: `8b3ea2a205eb5b7a082459eebda54a250ee63dcd`, branch `codex/v0.3`; simulation `0.8.0`, schema `c2-1`. Executed 2026-11-14 UTC. Scope: repository source, configuration/content, automated tests, developer tools, production specification, decision register, implementation claims, and saved balance evidence. **Audit only; no source, configuration, tests, or gameplay defaults changed.**

This is a new audit of the current implementation. It is not a recovered copy of the missing historical v0.2 audit. New finding identifiers below deliberately do not reuse that audit's H/M/L identifiers. The owner's earlier permission to proceed without that document is a scope waiver, not proof that its unseen findings were closed. Instructions embedded in the development briefs were evaluated as implementation requirements; the current user's audit-only request governs this work.

## 1. Verdict

The repository contains a substantial working prototype, a genuinely headless fixed-tick simulation, two rulesets within one engine, extensive deterministic regression tests, and useful developer/replay/batch tools. It is not merely a Phaser animation with simulated-looking outcomes. All currently registered automated tests pass.

Nevertheless, the blanket statement that F–J are implemented overstates completion against the full brief. A reproduced editor bug silently loses sign-strength changes. The stronger-sign requirement has only conditional evidence: the default 1×→2× Conserve comparisons plateau on the saved reference and compact samples, and the targeted behavioral test alters the sign weights to manufacture a decision boundary. Several original requirements remain partial or absent, including complete race-context AI, persistent wreck mode, crowd influence, equipment performance modifiers, officiating, logging generation/sampling controls, and named deferred integration contracts.

No Critical issue was established. This audit records **2 High, 11 Medium, and 3 Low findings**. Severity measures present impact on correctness, trustworthy tuning, or explicit acceptance requirements; it does not imply that every missing feature belongs in the next implementation scope. Some gaps have already been explicitly deferred. There is no evidence here of approved cross-platform bit-identical execution, finished balance, or closure of unseen historical findings.

Read the accompanying [requirement inventory](Prototype_Audit_Requirements.md) for individual coverage, authority, and deferred scope. “Implemented” there means the named capability exists and was supported by inspection/tests, not that every valid configuration or future use has been proven correct.

## 2. Authority and method

Authority used: latest explicit owner decisions in the v0.3 brief; approved v0.2 sections except where superseded; accepted decision amendments, especially D-034 common-clock rear-row starts and D-061 simultaneous same-phase combat; provisional appendices A–F; documented implementation defaults. Numeric coefficients, sign catalog, collision probabilities, candidate scoring, memory policy, cancellation without refund, and queue-while-pending rejection remain provisional. Their presence in code or a passing test does not make them approved canon.

Inspected the actual `src/simulation`, `configuration`, `contracts`, `diagnostics`, `presentation`, `application`, `persistence`, and shared modules, content/scenarios/presets, build/lint/type configuration, package scripts, tests, browser smoke scripts, and relevant documentation. Reviewed movement scheduling and fractional contacts, arbitration, lane changes, derived stats, AI/perception, sign commands/crossings, combat targeting/damage, environmental lifecycle, statistics/classification, replay/capture comparison, editor state ownership, persistence, viewer/commentary, and batch execution.

Ran the complete registered test suite, all browser scripts, typecheck/lint/build, and additional read-only probes. Inspected a fresh browser developer workflow and screenshot. Examined the stored 584-run balance summary with its seed/variant definitions; independently reran two full-reference cases. Did not rerun every saved balance case, perform statistical balance approval, formally verify numerical algorithms, audit third-party dependency internals, or test every browser engine. There is no coverage-percentage claim.

## 3. Actual execution results

Environment: Linux x64, Node `24.22.1`, npm `11.9.0`, installed pinned dependencies, Chromium `/usr/bin/chromium`. Browser scripts used the existing responsive Vite server at `http://127.0.0.1:5173`.

| Command/check | Actual result | Interpretation |
|---|---|---|
| `npm test` | **21 files, 261 tests passed**, 232.16 s | Includes the four distinct 1,000-seed compact movement/AI/combat/environment suites. These are bounded safety fixtures, not 4,000 full-reference balance races. |
| `npm run typecheck` | Passed | Main project and engine-only target. |
| `npm run lint` | Passed | Includes engine import/global restrictions. |
| `npm run build` | Passed | Existing >500 kB chunk warning; Phaser chunk approximately 1.54 MB minified / 395 kB gzip. |
| `npm run test:browser` | **All nine scripts passed** | Browser, developer, movement, AI, combat, environment, presentation, analysis, v03. |
| Additional guarded headless/reorder/replay probe | Passed; 9 frames, complete, `fnv1a32-rounded8:453b6ba4` | Throws on `Math.random`, `Date.now`, `window`, `document`, `indexedDB`, and `requestAnimationFrame`; exact frame equality after reversed entries/beasts/segments; exact latest-frame replay. |
| Reference reexecution: `v03-reference-001`, Combat, no sign | Passed; saved configuration/final hashes match | 1/6 finishers, 89 attacks, 4 contacts; final `fnv1a32-rounded8:3b4dad93`. |
| Same reference seed, Pure, no sign | Passed; saved configuration/final hashes match | 1/6 finishers, zero attacks, 1 contact; final `fnv1a32-rounded8:6a8b41a4`. |
| Sign-strength→beast-edit browser probe | **Defect reproduced**, no page exception | Content 3→2 while displayed effective multiplier remains 3. |
| Capture-evidence scope probe | **Limitation reproduced** | Removing latest events still gives `valid: true`, event match `null`; invented diagnostics/last-valid/queue summaries still compare `identical: true`. |

The nine browser scripts actually exercised canvas initialization, setup rejection/reset, numeric previews, IndexedDB reload, import/export, playback/headless hashes, bounded recording, movement fixtures, AI/sign queues, combat readiness, fatigue/hazards/wrecks, player/opponent visibility, radio/results, comparison workers/cancellation, both rulesets, bulk atomic edits/restoration, and sign tuning. Passing them does not cover the cross-editor interaction reproduced in this audit.

Raw run logs and scratch probe scripts were kept under `/tmp/bt-audit-*`; the enduring results and reproduction details are recorded here. They are not committed test additions. `scripts/v03-balance.ts` was deliberately **not invoked**: it writes tracked preset files even as part of measurement (AUD-L03), which would violate this audit's source/configuration restriction.

## 4. Milestones A–J, individually

| Milestone | Assessment | Evidence and remaining gap |
|---|---|---|
| A — core simulation/test harness | **Core gate implemented; full tooling promise partial** | Strict initialization, headless derivation/movement, immutable snapshots, fixed stepping, aligned-grid lifecycle, fractional finishes, developer inspection and tests are real. All-value form coverage and generation-level logging controls are incomplete; see M07/M09. |
| B — AI/lane maneuvers/occupancy | **Core implemented; broader AI contract partial** | Atomic occupancy, adjacent maneuvers, safety/commitment, utility factors, perception and legal intent resolution are present. Race-aware strategy and contradictory-observation memory invalidation are absent; M06. |
| C — combat/conditions/events | **Substantial, partial against all approved scope** | Independent combat channels, component consequences, fatigue, fixed weather, seeded events, incidental contacts and delayed wrecks work. Persistent wreck mode, crowd influence, fuller weather dimensions and equipment semantics are missing/partial; M05/M08/M10. |
| D — viewer/commentary | **Implemented with factual/presentation defects** | Schematic Phaser track, selection/follow/privacy, standings/player panels, prominent event radio, playback and results work. Damage wording can overstate HP loss; sign activation notification can be suppressed; M02/M03. |
| E — regression/balance tooling | **Implemented, with bounded capture assurance** | Deterministic scenarios, headless CLI, worker batch comparison, divergence paths, historical inspector, results and saved evidence exist. Capture validity excludes some exported evidence; M01. Balance quality is explicitly unresolved. |
| F — correctness/audit remediation | **Summary repairs largely implemented; full closure unverified** | Fractional .95 regression, own-key ID validation, operative nerve/durability/roughness/severity and shared result counters have tests. Penalties remain a zero placeholder; M04. Original detailed audit never available; cannot certify its complete closure. |
| G — two configurable rulesets | **Implemented in inspected scope** | Shared engine; Combat default, Pure AI suppression and authoritative prohibition, incompatible Attack rejection, incidental contact retained, serialized labels/hashes/replay. Fresh Pure reference gives zero attacks; crafted consequences covered by tests. |
| H — bulk edits/sign tuning | **Partial; exit not reliable** | Atomic validated all-RU operations and restoration work. Dedicated sign controls exist but later ordinary edits can silently overwrite them (H01). Remaining form/log coverage gaps persist. |
| I — queued/stronger signs | **Queue semantics implemented; stronger-effect/presentation requirements partial** | Common-start and real crossing activation, retained old active sign, costs/cancel/lower, terminal pending state, multi-transition and replay tests present. Default stronger-effect evidence falls short (H02); activation notification and intra-tick fatigue semantics need attention. |
| J — validation/balance/release candidate | **Tools/evidence implemented; unconditional exit claim premature** | All required fresh checks pass; saved 584 runs, presets and written manual loop exist. H's reliability defect and I's behavioral evidence gap remain. Broader sign catalog/conditions experiments and observability evidence are incomplete. Balance approval was never required to claim tool completion, but also has not been obtained. |

No source changes are proposed as already performed. Recommendations below are follow-up work, not new gameplay approval.

## 5. Findings by severity

### AUD-H01 — Ordinary editor silently overwrites newer sign tuning

**Requirement:** v0.3 H2/H exit/J: reliable saveable, exportable tuning; all edits must preserve unrelated fields. **Status:** reproduced functional defect, not an approved design variation.

**Reproduction:** Open a fresh developer page → RUs → set dedicated global sign influence to 3 and commit the input → inspect content JSON (3) → edit a beast speed to 86 and commit → inspect content JSON (2). Dedicated effective multiplier display remains 3. No exception or rejection appears. Negative control: choosing Pure and then changing laps retained Pure; the defect is not universal to all forms.

**Cause/evidence:** `src/presentation/developer/setup.ts:56`–67 builds generic editors from a captured whole-content `draft`; its callback writes the stale enclosing draft. Dedicated controls at `setup.ts:78`–85 read current content and update it without rebuilding the generic editor snapshots. `numeric-editor.ts:5` and its apply callback retain independent cloned values.

**Impact:** The developer can believe a race used stronger signs while exported/run configuration uses the old value. Tuning experiments, reproducibility records, and UI truthfulness are compromised even though engine execution itself remains deterministic. Existing isolated editor tests miss interaction order.

**Recommendation:** Use a single current validated draft with field-scoped updates or refresh dependent editors atomically; add a cross-editor persistence/export/reinitialize test. Do not change gameplay coefficients to compensate.

### AUD-H02 — Default stronger-sign claim lacks the required behavioral demonstration

**Requirement:** v0.3 I3/J3 explicitly require observably more dramatic behavior, not only larger diagnostic numbers, and require boundary/commitment refinement if scaling plateaus. **Status:** partial explicit owner requirement; multiplier values themselves remain provisional.

`src/simulation/ai/driver.ts:75`–91 scales sign contributions, then clamps candidate utility to 0–100 before choosing by score and candidate ID. Saturation erases distinctions; safety and commitment can also dominate. The saved report acknowledges Conserve saturation. Across all four paired full-reference seeds used for 1×/2× checks in each mode, the player's action distribution is unchanged; compact 1×/2× aggregate counts are also unchanged. The targeted strength test in `tests/v03-signs.test.ts` first scales Conserve catalog contributions by `.3`, then establishes a configurable boundary. This is valid evidence that the control can affect choices, but not that shipped defaults deliver the requested improvement over v0.2.

This does **not** show that signs have no effect: no-sign→Conserve strongly changes the player's choices, and 4× changes some cases. It shows that default increased strength and the broader Push Hard/Defend/Attack behavioral promises remain insufficiently demonstrated. The stored 584-case study concentrates on Conserve; it does not establish each directive's intended observable response.

**Impact:** I and J cannot be marked unconditionally complete. More pressure on saturated utility values can produce misleading tuning expectations.

**Recommendation:** Establish paired per-sign behavior and visible outcome evidence on unmodified shipped configurations; inspect raw/clamped rankings and commitment before considering configurable refinements. Preserve legality, autonomy and safety. Any eventual numeric target needs owner review.

### AUD-M01 — “Valid capture” covers endpoint reconstruction, not the complete diagnostic bundle

`src/diagnostics/compare.ts:9`–24 accepts optional latest events and strips unmodeled top-level fields. `auditDiagnostic` checks reconstructed state, hash, journal and events **if supplied**. Fresh probes removed latest events and obtained `valid: true`, `matchesLatestEvents: null`; changed latest diagnostics and supplied invented last-valid/queue summaries still produced `valid: true` and `identical: true`.

State/journal tampering is genuinely detected, and v0.3's fix correctly prevents invalid serialized state being masked by identical reconstructed inputs. This finding concerns the remaining assurance boundary: historical diagnostic rows, retained frame history, last-valid state and extra summaries are not authenticated. FNV32 rounded-eight comparison is also a regression checksum, not cryptographic provenance.

**Authority/impact:** Diagnostic integrity and honest labeling, v0.3 F3/H3 and v0.2 §13.6; partial contract, not evidence of nondeterministic state. A fresh AI may incorrectly accept corrupted forensic commentary as verified.

**Recommendation:** Label scope as endpoint/input verification, report absent evidence, and separately validate claimed historical records if full-capture verification is intended. Test diagnostic-only alteration and absent-event paths.

### AUD-M02 — Attack/contact logs and radio can report more damage than actual HP loss

`simulation/combat/resolve.ts:94`–99 emits attack-hit amount after protection but before durability/health clipping. `combat/damage.ts:13`–20 applies durability and clamps at remaining HP, emitting actual loss in `component_damaged` and actual credited counters. `presentation/commentary/generator.ts:29` narrates the earlier amount as damage. `movement/contact.ts:41` similarly emits nominal collision damage before actual HP changes are accumulated at line 46.

Consequently a hit on a high-durability cart or near-zero-health target can be announced as a larger loss than actually occurred. Result damage counters are correctly based on actual loss; they should not be accused of the same defect. This is source-established semantic inconsistency; no standalone additional combat fixture was executed during this audit.

**Authority:** Approved §13.2 confirmed truthful outcomes and explainable component damage. **Recommendation:** Distinguish raw/post-protection/actual damage fields and use actual loss for factual narration and major-damage prioritization; test durability and overkill cases across simultaneous hits.

### AUD-M03 — Sign activation notification is not guaranteed

`presentation/commentary/generator.ts` gives activation a routine notification subject to routine-cap/repetition suppression. The player panel updates Active/Pending correctly, but there is no independent guaranteed crossing notification. Multiple important events in one tick or repeated activations inside the repeat window can hide it.

**Authority:** Explicit v0.3 I4 asks for notification at crossing. **Status:** partial UI contract; suppression itself is a sensible provisional radio policy. **Recommendation:** Separate a small reliable sign-state notification from optional radio text; cover rapid replacement/crowded-event ticks. This observation is from code-path inspection, not a newly executed rapid-crossing browser fixture.

### AUD-M04 — Penalties/officiating are a placeholder, without unavailability labeling

`RaceStatistics.penalties` initializes to zero in `simulation/core/race-engine.ts`; there is no penalty assessment or disqualification command/rules hook incrementing it. `rules/classification.ts` supplies `unavailableStatistics: []`. Zero currently means no implemented assessment, not verified absence of infractions under a substantive officiating policy.

**Authority:** Approved §11.6 and v0.3 F2 require statistics and event-driven legality/penalties; exact penalty rules are not approved. **Status:** missing mechanic/partial metric, not permission to invent penalties. Basic legality and retirement/classification do work. **Recommendation:** Declare unsupported officiating explicitly and seek a defined rules policy before implementation. Keep zero-count and unsupported semantics distinct.

### AUD-M05 — No explicit persistent-wreck mode

`configuration/schemas.ts` and `environment/lifecycle.ts` offer numeric removal delay, zero-delay cleanup, delayed obstructions and optional early clearing. There is no validated named persistent-wreck mode. Setting a very large delay approximates persistence only until early clearing/watchdogs and has no distinct serialization or result semantics.

**Authority:** Approved §11.5 lists immediate/delayed/persistent modes. The v0.3 remediation document explicitly defers the summary finding under the owner's proceed-without-audit direction. **Status:** approved-spec gap with recorded deferral; not a newly unauthorized deviation. **Recommendation:** Retain as an open requirement and define persistence/deadlock interaction before implementation. Do not claim setting an arbitrary huge number implements the contract.

### AUD-M06 — AI omits strategic race context and retains contradicted hazard memories

`ai/driver.ts:11` restricts tactical state to tick/RUs/RNG/hazards; decisions never consult laps remaining, standings, finish eligibility or cutoff. Race-related personality coefficients exist, but this is local tactical utility rather than full race-context strategy. At lines 48–52, remembered hazards expire by age/known expiry and are refreshed when seen; an absent hazard in currently visible space does not invalidate an old observation.

**Authority:** Approved §9.1 includes race context; provisional B.6 requests contradictory-observation invalidation. D-081 documents a last-observed TTL simplification, and tests encode it. **Status:** approved scope partial plus deliberate provisional difference; not random AI malfunction. **Recommendation:** Make memory validity observable and define the minimal race-context inputs without granting opponent omniscience. Test final-lap/cutoff decisions and visible early hazard removal.

### AUD-M07 — Logging controls filter retained output but do not control production/sampling

The engine constructs detailed candidate/transition diagnostics each tick. Recording exposes bounded frame/record counts and drop counters; UI filters by level/subsystem/tick/RU/type/search. There is no true configurable generation verbosity, trace sampling interval or snapshot cadence. Filtering after allocation does not lower trace-production cost. `diagnostics/recording.ts` infers event categories by regex; plain `contact` falls through to `rules`, so movement/combat subsystem filters can omit a central contact event.

**Authority:** Developer observability, v0.3 H3 and provisional logging/UX controls. Existing bounded capture and actor/target filtering are real and tested; this is partial coverage. **Recommendation:** Define explicit event subsystem metadata, keep authoritative events independent of trace levels, and provide deterministic diagnostic sampling that cannot alter RNG/state.

### AUD-M08 — Environmental scope is narrower than the approved model

Weather profiles supply aggregate traction/visibility/fatigue effects, but do not model explicit wind/temperature dimensions. There is no separate crowd morale/performance system. Data-driven environmental beast-trait modifiers **are implemented**: `environment/traits.ts` matches traits/weather and averages attached-beast traction/fatigue multipliers, consumed by derivation, lane conditions and fatigue, with a controlled mud/rain test. Local lane conditions, roughness/severity, event scheduling, moving animals, fixed-weather consequences and fatigue are implemented.

**Authority:** Approved §§12.1–12.3; provisional B.8 treats a crowd factor as optional, so its initial delivery priority is ambiguous. Fixed rather than dynamic weather is explicitly correct for the first prototype. Example event types are illustrative, not a checklist requiring every example. **Recommendation:** Record these particular gaps as deferred/owner-scope decisions rather than claim complete environmental implementation; avoid building a broad new weather simulation without scope agreement.

### AUD-M09 — “Every value” editor promise is only partly met

Generic forms cover numeric leaves, supported RU bulk paths and dedicated signs; raw JSON covers broader structured edits. Track structure, enumerations/booleans and several schemas still depend on JSON rather than per-field forms with units/ranges/reset. The dedicated bulk selector's default strategy path and numeric default value are not type-aware. Copy-from-RU is optional and absent; portable presets do exist.

**Authority:** Approved §13.4 mostly met through forms plus JSON, but provisional E.5's editor-for-every-stat/tuning UX is incomplete. This is separate from the data-loss defect H01. **Recommendation:** Publish accurate form/JSON coverage and make bulk value entry schema-aware; prioritize regular balance workflows rather than duplicating every schema in hand-maintained controls.

### AUD-M10 — Deferred integration hooks/equipment modifiers are not complete contracts

Equipment supports provisioning, attacks and readiness. Derived performance does not consume an equipment stat-modifier layer. The engine has useful internal phase boundaries and a structured result, but lacks named deterministic input/output interfaces for all Appendix F.5 handoffs: alternative formats, dynamic weather, magic, campaign rewards, moving-obstacle extension, long-term injuries and equipment modifiers. A hardcoded `circuit` format/closed channel set is not such an interface.

**Authority:** Approved §8.4 equipment-derived performance and later-compatible boundaries; F.5 provisional named hooks. Full campaign, magic and alternative formats are intentionally deferred and should remain so. **Recommendation:** Document existing boundaries and missing interfaces, define minimal contracts only when needed; do not confuse speculative feature implementation with a hook.

### AUD-M11 — Sign crossing can change the fatigue multiplier for an entire mixed-sign tick

AI chooses before movement; crossing activation occurs within movement (`core/race-engine.ts:106`, `:121`). `environment/fatigue.ts:13` reads the resulting active sign and applies its multiplier over the whole tick. The prior AI decision carries a fatigue multiplier but the fatigue updater does not use it. Thus an intra-tick Push Hard activation is treated coarsely as full-tick exertion, even though decisions before crossing used the previous sign.

**Authority:** v0.3 distinguishes pending from active and separately tunable secondary effects. D-072 already documents endpoint/full-tick fatigue; that policy predates the new fractional sign boundary. **Status:** inspected coarse timing, provisional-policy ambiguity, not a proven pre-crossing AI influence bug. **Recommendation:** Explicitly decide/document the interaction or integrate secondary effects by active interval; add a crossing-fraction test. Do not silently declare the existing endpoint approximation approved by v0.3.

### AUD-L01 — Future reproducibility and resource guards are incomplete

Current source does not use wall-clock/browser randomness in the simulation. Lint/string architecture tests nevertheless prohibit only known direct patterns; aliases, `new Date`, other clocks and future dependencies could evade them. Same-runtime determinism is well supported; Node and Chromium both use V8 and do not prove cross-engine floating-point identity. Full values remain JS doubles; hashes round to eight places. Scenario horizons/roster sizes are not comprehensively practical-capped even though JSON size/depth, command count, transition limits and analysis endpoints are bounded. A valid huge horizon can cause an expensive worker/batch run; worker cancellation mitigates UI impact.

**Recommendation:** State runtime compatibility precisely, strengthen boundary enforcement when extending dependencies, and define operational workload limits. This is a future risk, not demonstrated current nondeterminism or an unbounded-memory exploit.

### AUD-L02 — Documentation and code structure slow a fresh AI and invite mistaken closure

`IMPLEMENTATION_STATUS.md` leads with F–J implemented while historical paragraphs still call 0.7.0 current and mention features as future work. `V03_AUDIT_REMEDIATION.md` retains “F in progress” in its title but describes final work and absent historical audit. Append-only decisions require conflict resolution across many pages. Dense multi-action lines in scheduling/UI/statistics and generic event payloads make semantic mistakes harder to spot. There is no repository CI workflow under `.github`, and no configured coverage threshold/report demonstrating untested branches.

**Recommendation:** Provide a concise current authority/status index linking historical notes; retain history with explicit superseded labels. Refactor only in a separately authorized implementation task. Passing local checks and a completion table should never replace reading the active code paths.

### AUD-L03 — Measurement command mutates tracked presets; CLI comparison exit semantics are weak

`scripts/v03-balance.ts` writes the exported preset JSON before running its matrix, including shortened measurement workflows; it is not a read-only measurement command. A fresh AI can inadvertently modify source-controlled experiment inputs while trying to reproduce results. Separately, `scripts/compare.ts` reports divergent/invalid comparison JSON without a failure exit status, unlike replay's invalid-capture exit behavior. This weakens naive CI scripting, though the JSON contains the necessary result.

**Recommendation:** Split preset generation from measurement or add an explicit write flag, document side effects, and offer an assertion/failure-exit mode. No such code changes were made during the audit.

## 6. Determinism and architectural independence

The authoritative design is convincing within its stated prototype contract. `core/rng.ts` implements seeded xoshiro128** with named streams; initialization validates/canonicalizes input, mechanics use stable IDs and stable iteration, command submission records tick/phase/context, and fixed tick duration is independent of render cadence. Movement tie-breaking is deliberate rather than incidental array order. Results, pending signs, cooldowns, hazards and RNG state participate in exported state. Cloned/frozen snapshots prevent renderer ownership of live mechanics. Engine-only TypeScript compilation excludes DOM types; lint prohibits Phaser/presentation/persistence/application imports into the engine boundary.

The fresh guarded probe loaded the engine without Phaser and ran it with browser APIs, wall-clock time and unseeded RNG inaccessible. It compared complete frames after input reordering and replayed commands to an exactly equal latest frame. The normal suites additionally cover reorder, repeated stepping, failed commands, rollback, simultaneous contacts, fractional finishes, both modes and native Node/browser consistency. Two independent full-reference reexecutions matched checked-in evidence.

Therefore **yes: the simulation is genuinely headless and deterministic for tested version/configuration/seed/input combinations in the tested runtime**. This is stronger than comparing final winners or animations. It is not a formal proof for every schema-valid input or every JS runtime. Hash equality alone is weaker than exact equality because of rounding/collisions; capture verification is narrower than complete forensic authenticity (M01). Seed pairing compares experiments; it does not guarantee the same later RNG consumption after behavior diverges.

## 7. Subsystem review: intent versus execution

### Movement, occupancy and conflicts

Speed approaches a target under acceleration/braking constraints; trapezoidal distance is converted through per-lane lengths, fractional remainder and intermediate transitions. Scheduler handles atomic arrival groups, legal departures, contested targets, reciprocal-exchange rejection, dependency propagation, blocked-budget discard, contact-induced remaining-time changes and fractional finish crossings. The .90→.95 correction is substantive, not a changed expected value. Lane movement is adjacent, routine favorable changes have no automatic penalty, and difficult/corner handling invokes configurable risk. Contact is distinct from blocked motion; not every failed pass causes damage.

The main future risk is scheduler complexity: lane changes, pre/post combat, contact, hazard/control checks, finish removal and remaining-travel rescaling share mutable state and callbacks. Event ordering and simultaneous-condition regressions must accompany changes. Coarse tiles, deterministic epsilon grouping, simple braking/contact heuristics, reciprocal swap prohibition and forced deadlock retirement are deliberate provisional approximations, not physically continuous racing. No new occupancy violation was found.

### Derived attributes and AI

RU stats are genuinely component-derived and inspectable; individual beast health remains separate while fatigue is team-level. Driver nerve now affects collision avoidance; chariot durability affects cart HP loss; roughness and corner severity have mechanical consumers. Controlled tests support these rather than expecting every attribute change to alter every run. Overrides are explicit paused commands, labeled and replayed.

AI evaluates twelve speed/lane candidates, local perception, personality/strategy/sign factors, safety exclusions, seeded noise and commitment. It produces intents for mechanics to validate. It is not a rich race strategist: context/memory gaps are M06; clamp/tie/commitment behavior is H02. Equipment affects available combat but not a full performance modifier pipeline. A test showing a nonzero factor does not establish a useful behavioral gradient.

### Signs and command ownership

Queued and active state are distinct; charge occurs on accepted processing, rejected submissions do not consume an opportunity, lowering is free, cancelling does not refund, and a second pending sign is rejected. Pre-race activation uses the common signal for rear rows; in-race activation uses actual accepted forward line transitions, including multi-tile/fractional/final crossings. A previous active sign persists while replacement is pending; disabled/terminal pending state does not manufacture later AI actions. Player permission and developer opponent override permission are separate. ID schemas reject prototype names and application uses own-key lookup. Input journal replay includes rejected commands and failed ticks.

These are real queue mechanics, not a timer approximation. Cancellation/no-refund and pending rejection are explicitly provisional defaults, not silent canon. Secondary fatigue timing and visible notifications remain partial. Dedicated tuning reliability and meaningful stronger default behavior are the two High findings.

### Combat and contact

Targeting checks range/arc/relative geometry, channel equipment/providers, cooldown, allowed component and competition rules. Driver, mounted, trained-beast and guard channels are separate; simultaneous same-phase damage uses a frozen phase and can mutually disable participants, consistent with D-061. Earlier-phase disablement cancels later actions without retroactively changing committed movement. Pure mode suppresses offensive candidates and enforces rules again at authoritative resolution; incidental contact retains shared consequences. Protection, durability, bands, injuries/destruction/fatality, disabled propulsion and actual credited HP loss are real.

Numeric lethality/accuracy/guard probabilities remain provisional. Coarse arcs and fixed fixture plans simplify geometry/testing. Nominal-versus-actual damage narration is M02. Full-reference attrition shows that legal mechanics need tuning review; it does not establish a particular official target or justify disabling incidental damage in Pure mode.

### Environment, lifecycle and results

Weather is fixed per race, correctly within initial scope. Per-lane conditions, hazards, fatigue, seeded optional event attempts, occupancy-aware spawning, durations, moving animals, early clearing and disabled obstructions are implemented. External scheduled incidents and simulation-generated effects are distinguishable. Persistent mode/crowd/weather dimensions remain gaps. Event “occasional” settings do not guarantee an incident, which matches intent.

Race controller separates grid/countdown/racing/conclusion, uses common time and correct rear-row first crossing, tracks normalized course progress rather than lane-distance advantage, and gives fractional times/tied ranks. Finishers stop/leave occupancy; inability to continue, cutoff and watchdog reasons persist. Shared authoritative statistics count progress-path overtakes, tie behavior, lead time until first finisher, attacks/hits, actual damage, incident participants and sign usage; presentation does not synthesize final counters. Results expose individual component condition. Penalties remain unsupported despite a zero field (M04). Full campaign rewards/economy are correctly absent.

### Tools, replay and presentation

Pause/single-step, 1×/2×/4×, configuration validation, numeric previews/reset, JSON import/export, IndexedDB saves, bulk preview/apply/restore and paused registered overrides are functional. Browser analysis is in a cancellable worker; it does not mutate the running engine. Ring recording is bounded with dropped counters; filters now include actors and targets. Historical state inspection is not live-state rewind. Replay means reexecuting initial configuration and recorded commands, not restoring arbitrary mutable snapshots. A polished replay viewer was explicitly deferred.

Comparison reconstructs both runs, finds first state/event hash divergence and displays changed paths; incompatible versions are noncanonical static comparisons. Endpoint state integrity is checked. However, compare/audit paths repeat whole reexecutions several times, adding avoidable cost on long traces. Recording clones both states and verbose diagnostics and shifts/splices arrays; bounded memory still has substantial CPU/serialization cost. Rendering uses schematic ellipse geometry/equal angular segments rather than an authoritative continuous physical oval, which is acceptable prototype presentation but must not be mistaken for a physics visualization. Opponent debug data is appropriately separated from ordinary player presentation. Radio is prominent and factual in most paths, with M02/M03 exceptions.

## 8. Placeholder, hardcoded-policy and shortcut register

| Item | Actual implementation | Disposition |
|---|---|---|
| Penalties | Always initialized zero; no assessor | Unsupported mechanic, M04; not measured absence of infractions. |
| Utility candidate set and scores | Four speed modes × three lateral choices, fixed 12 random draws, clamp 0–100, ID tie-break | Provisional deterministic architecture; saturation risk H02. |
| Hazard risk weights | Roughness `.4` versus other hazard `1`, distance floor `1` in driver | Hidden/local tuning policy; expose/document if experiments need it. |
| Awareness/condition formulas | Discrete segment perception, all same-segment RUs visible, condition-band factors | Deliberate coarse abstraction; not continuous occlusion. |
| Fatigue | Tick-end speed/conditions; full-tick gain, including final/disable tick | Documented approximation; new sign boundary ambiguity M11. |
| Durability safety floor | Damage factor `max(.1, …)` | Defensive numerical constant; ensure tuning domain semantics remain documented. |
| Reciprocal tile exchange | Rejected rather than continuous crossing | Provisional arbitration choice, tested; not approved universal collision law. |
| Deadlock handling | Bounded checks/forced retirement rather than full track-clearing crews | Safety fallback, not emergent race strategy. |
| Hazard memory | Last observation plus TTL/known expiry | Intentional provisional shortcut, M06. |
| Persistent wreck | Approximation possible by large delay only | Missing explicit contract, M05. |
| Weather/environment | Aggregate profiles; no crowd model or independent wind/temperature dimensions | Scope gap M08, not all named example incidents mandatory. |
| Equipment | Weapon/channel provisioning without generalized stat modifiers | Partial approved derivation scope, M10. |
| Race format | Strict circuit only | Initial format correct; future hook partial. |
| Viewer path | Schematic ellipse and presentation interpolation | Acceptable display approximation; never feeds mechanics. |
| Capture identity | FNV32 with rounded-eight canonical values | Useful comparison contract, not cryptographic or bit-exact proof. |
| Diagnostics/event payloads | Extensive `Record<string, unknown>` with string/regex interpretation | Transitional schema debt; already contributes to M02/M07. |
| Fixtures | Short tracks/ticks, controlled plans, equalized stats | Valuable adversarial tests; cannot stand in for full-reference balance. |
| Preset exports | Large repeated full catalogs | Portable and validated, but duplication/generator drift risk. |

Most tuning coefficients are data-driven; the presence of hardcoded guards does not mean the entire simulation is hardcoded. Distinguish algorithmic constants from gameplay policies before deciding what to expose.

## 9. Balance evidence and test limitations

Saved v0.3 evidence contains **584 races / 18 variants / zero reported simulation errors**: 512 compact cases and 72 full-reference/equalized cases. Those counts were inspected, not all freshly executed. The two selected reference reruns matched exactly. All 292 stored Pure cases have zero attacks/deliberate ram attempts, while 57 incidental contacts and 33 actual HP damage demonstrate retained consequences.

The differentiated full reference is poorly completing: Combat no-sign finishes **15/72 entrants (20.8%)**, with 1,120 attacks, 280 ram attempts, 22 cart-disable DNFs and 35 cutoff DNFs. Pure no-sign finishes **12/72 (16.7%)**, with 60 cutoff DNFs. Combat Conserve 2× finishes **14/72 (19.4%)**; Pure Conserve 2× remains 12/72. The player's Conserve decisions strongly change from no-sign, but 1×/2× plateau. Whole-race attack counts can increase even while the player conserves; that is not proof that the player ignored the directive.

Equalized Pure finishes **24/24**, versus equalized Combat **8/24**. Equalization changes multiple attributes, health, load and strategy while preserving equipment/grid; it does not isolate one causal parameter. Compact variants finish all 192 entrants per variant and cannot justify the much lower full-reference completion rates. No official desired finish/DNF/attack rates exist; this audit does not invent any.

Important untested or insufficiently demonstrated behavior:

- Cross-editor mutation ordering and stale effective-value display (fresh failure H01).
- Each sign's default behavioral gradient and visible effect across ordinary/differentiated rosters, both relevant modes and conditions; current tests demonstrate an altered-weight boundary.
- Full diagnostic-history authenticity and precise meaning of incomplete evidence (M01).
- Nominal/actual damage wording with durability, overkill and simultaneous contributors.
- Rapid/crowded activation notifications and interval-aware secondary sign effects.
- Persistent wreck semantics, strategic final-lap/cutoff behavior, contradictory hazard observations, crowd/equipment hooks and officiating: absent behavior cannot be validated by existing tests.
- Practical large input/workload behavior, all browser engines and cross-runtime numerical portability.
- Independent quantitative balance/UX evaluation across all weather/event/roster combinations. Existing browser assertions and one screenshot are not a player study.

No extra tests were added: this task requested an audit. A passing suite is credible evidence for covered cases; it is not proof of all production requirements or a substitute for a coverage inventory.

## 10. Fresh-AI handoff and recommended follow-up order

A new AI should first read the v0.3 authority order, the two approved decision amendments, this audit and its requirement inventory. It should not treat the historical status counts or missing-audit summaries as full acceptance criteria. Be especially careful with the long append-only decision register, stale “current version” paragraphs, engine-versus-movement-harness distinctions, provisional numeric choices, saved-versus-fresh measurement counts, and measurement-script side effects.

Recommended order for a separately authorized implementation task:

1. Repair editor state ownership and add interaction regression; verify the exact configuration used in every experiment matches displayed/exported tuning.
2. Clarify capture verification scope and damage amount semantics; make activation notification reliable.
3. Measure all directives on shipped defaults; address proven utility/commitment boundaries through configurable mechanisms without guaranteed obedience.
4. Obtain dispositions for unsupported officiating, persistent wreck mode, environmental scope and extension contracts. Preserve explicit deferrals where appropriate.
5. Address logging generation/category controls and document form coverage, then broaden strategic AI/timing tests within approved scope.
6. Consolidate current status/authority documentation and split read-only measurement from artifact generation. Preserve historical reports and baseline tag.

Architectural strengths worth retaining are the single headless engine, validated immutable boundaries, named RNG streams, transactional rollback, authoritative results, tick/phase command journal, and separation of presentation/persistence/analysis. The primary future risks are scheduler coupling, snapshot/editor ownership, utility saturation, loosely typed event semantics, expensive trace/replay duplication, and documentation that can be mistaken for verification.

No implementation, publication, deployment or source changes were performed as part of this audit.
