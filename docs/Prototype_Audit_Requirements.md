# Audit requirement inventory — v0.2 plus v0.3

**Historical baseline audit.** Subsequent implementation responses and current verification are tracked in [AUDIT_REMEDIATION.md](AUDIT_REMEDIATION.md). Findings below are preserved as originally audited.


Companion to [the independent audit](Prototype_Implementation_Audit.md), baseline `8b3ea2a205eb5b7a082459eebda54a250ee63dcd`. This inventory decomposes the production documents into independently assessable capabilities; repeated requirements are cross-referenced rather than counted as separate implementations. Illustrative contract names, example events, optional features and explicitly deferred systems are not mandatory mechanics. No source changes were made.

**Status:** Full = capability implemented with supporting inspection/tests; Partial = substantive implementation with a remaining requirement/assurance gap; Missing = no functional implementation; Different = deliberate alternate implementation; Deferred = explicitly future/optional scope; Unverified = evidence unavailable. Full is not formal verification for every valid input. **Authority:** A = approved baseline; V = explicit v0.3 requirement; P = provisional appendix/default; O = optional/deferred. Code paths are under `src/` unless stated otherwise. Findings use the new audit's AUD- identifiers.

## Architecture, geometry, occupancy, movement

| ID / production requirement | Authority | Status | Actual evidence / limitation |
|---|---|---|---|
| 1: Browser-first TypeScript/Vite/Phaser prototype | A | Full | Pinned package/tooling; built application and Chromium canvas checks. |
| 1: Autonomous racing rather than direct driving | A | Full | AI intents and mechanics; player signs, not steering. |
| 1.1: No campaign/stable economy in initial prototype | O/V | Deferred | Correctly absent; component results retained for handoff. |
| 2.1: Phaser outside authoritative simulation | A | Full | Engine-only type target, lint boundary, guarded native Node probe. |
| 2.2: Config→AI intents→mechanics→state→events→adapters | A | Full | `simulation/core/race-engine.ts` orchestration and separated modules. |
| 2.2/F.1: Engine exclusively owns mutable state | A/P | Full | Copied/frozen config and output; presentation interpolation separate. |
| 2.2: All simulation inputs through defined queue | A | Full | `core/commands.ts`; registered paused overrides, scripted/live journal. |
| 2.3/A.6: Fixed tick, seeded randomness, stable order | A/P | Full | Named xoshiro streams, canonicalization, exact-frame/reorder/replay tests. |
| 2.3: Playback rate independent of tick duration | A | Full | Browser 1×/2×/4× and headless equality. |
| 2.3: Portable deterministic outcomes across arbitrary runtimes | P | Unverified | Node/Chromium V8 tested; no broad JS-engine identity proof, AUD-L01. |
| 3: Ordered longitudinal segments and lateral tiles | A | Full | Validated track schema/topology and movement lookups. |
| 3: Four-lane oval initial content | A | Full | `oval-six-v1`, six RUs / 48×4 reference. |
| 3: Varying lanes and non-oval simulation topology | A | Partial | Explicit ordered closed-loop connectivity/variable lanes; renderer remains schematic ellipse, no broad custom topology UI proof. |
| 3: Type, turn direction, severity, surface, connectivity | A | Full | Schema/validation; condition and handling consumers. |
| 3: Start/finish marker and rendering metadata | A | Full | Configured finish order, metadata and geometry adapter. |
| 3: Per-lane travel-length modifier | A | Full | Movement distance costs; normalized classification unaffected. |
| 3: Inner-shorter/outer-safer tactical distinction | A | Full | Reference lane lengths/safe speed; curve handling tests. |
| 4: One RU = team/cart/driver; single occupancy tile | A | Full | Component roster and invariant checks. |
| 4: Unique occupancy after resolved transition/tick | A | Full | Arbitration/invariants, four compact safety suites. |
| 4: Multi-tile intermediate transitions checked | A | Full | Scheduler loop, adversarial tests including contacts/finishes. |
| 4: Same-tick vacated tile can be entered | A | Full | Atomic departure/dependency arbitration. |
| 4: Obstacle occupancy distinct by type | A | Full | Hazards and disabled RU occupancy/cleanup. |
| 5: Target/current speed and acceleration/braking | A | Full | `movement/integrate.ts`, scheduler, focused tests. |
| 5: Fractional movement carries normally | A | Full | Per-segment progress and carry tests. |
| 5: Blocked unused budget discarded | A | Full | Scheduler trace and no-banking tests. |
| 5: Conditions/damage/fatigue affect movement | A | Full | Derived/lane conditions; environment/attribute regressions. |
| 5: Units/formulas tunable rather than hidden policy | A/P | Partial | Major coefficients exposed; hardcoded policy inventory in audit §8. |
| 6: At most adjacent lane per tick | A | Full | Lane intent schema/resolver. |
| 6: Routine favorable lane changes no intrinsic penalty | A | Full | Reliable routine path and direct tests. |
| 6: Difficult handling cost/risk, corner choice | A | Full | Conditions, handling checks and safe speeds. |
| 6: Aggressive multi-lane moves | O | Deferred | Correct initial adjacent-only behavior. |
| 7: Movement conflict distinct from physical damage | A | Full | Yield/brake/block/contact paths; no blanket collision damage. |
| 7.1: Collect intents, fractional arrivals, atomic commit | A | Full | Stable scheduler/arbitration and time-correct .95 regression. |
| 7.1: Contested destination and dependency chains | A | Full | Priority/stability/seeded tie and failed-chain propagation tests. |
| 7.1: Crossing/lane-swap policy | A/P | Different | Reciprocal exchange rejected under documented provisional contract. |
| 7.1: No array-order advantage | A | Full | Sorted stable IDs and reordered entity regressions/probe. |
| 7.2: Deliberate rams lateral, no routine rear ram | A | Full | Targeting/ram validation; incidental rear impact separate. |
| 7.2: Beast attacks distinct from rams | A | Full | Beast combat channel, provider and attack classification. |
| 7: Impact context and component consequences | A/P | Full | Relative speed/stability/contact geometry, shared damage pipeline. |

## Components, AI, Strategy Signs, combat

| ID / production requirement | Authority | Status | Actual evidence / limitation |
|---|---|---|---|
| 8.1: Individual beast identity and six base attributes | A | Full | Strict definitions/rosters and component condition. |
| 8.1: Team fatigue, individual beast damage | A | Full | `environment/fatigue.ts`, independent component health/bands. |
| 8.1: Injuries/traits/abilities | A | Full | Injury records, trained attack providers and data-driven weather/trait traction/fatigue modifiers. |
| 8.1: Mixed species/team extensions | O | Deferred | Definitions not species-hardwired; no required expanded content. |
| 8.2: Weight/stability/durability/protection/efficiency/handling | A | Full | Derivation/contact/damage consumers; new durability regression. |
| 8.2: Capacity/loadout constraints | A/P | Full | Equipment reference/uniqueness checks and capacity-slot bounds in validation; performance modifiers assessed separately. |
| 8.2: Chariot has no propulsion | A | Full | Team derivation; all-beasts-disabled prevents continuation. |
| 8.3: Driving/handling/combat/awareness/nerve | A | Full | Mechanical consumers including F nerve risk change. |
| 8.4: Six effective stats component-derived | A | Full | `simulation/entities/derive.ts`, inspected breakdown, arithmetic tests. |
| 8.4: Equipment modifies derived performance | A | Partial | Combat equipment works; generalized stat modifiers absent, M10. |
| 8.4: Conditions/component damage alter effective stats | A | Full | Bands, load, team coordination, fatigue, traction. |
| 8.4: Overrides explicit and marked | A | Full | Paused queue registry; events/export show override source/old/new. |
| 9.1: Utility AI local perception and awareness | A | Full | `ai/driver.ts`, no hidden-opponent intent in tactical perception. |
| 9.1: Five personality traits separate from skill | A | Full | Personality factor inputs, editor and tests. |
| 9.1: Pre-race strategies and active sign influence | A | Full | Mode tables and sign factors; meaningful stronger delta separately partial. |
| 9.1: Speed/condition/fatigue/readiness affect choices | A | Full | Derived candidate scores and combat planning. |
| 9.1: Current strategic race context | A | Partial | Local tactical state only; laps/standings/cutoff absent, M06. |
| 9.1: Seeded small variation and commitment | A/P | Full | Fixed random budget and bounded target-lane commitment. |
| B.6: Invalidate contradicted observed hazard | P | Different | TTL/known expiry retained; D-081 simplification, M06. |
| 9.1: Candidates/rejections/factors/chosen/resolved traces | A | Full | AI inspector and diagnostics; production cost controls partial. |
| 9.2: Three default opportunities | A | Full | Validated race setting and accounting tests. |
| 9.2: Raise/replace charged; lower free | A | Full | Charge at accepted boundary, journal/replay, invalid commands free. |
| 9.2: Active persistent, autonomy/safety retained | A | Full | AI weights plus legality/safety; old active retained while queued. |
| 9.2: Tick-stamped sign replay | A | Full | Submission phase/tick/effective boundary and rejected input replay. |
| 10.1: Driver melee/ranged | A | Full | Weapons, arcs/range, readiness, effects. |
| 10.1: Mounted weapons and trained beast attacks | A | Full | Separate providers/channels, independent cooldowns. |
| 10.1: Lateral ram shared contact resolution | A | Full | Ram validation, contact and damage integration. |
| 10.1: Active guard/passive protection | A | Full | Guard opportunity/cooldown and component protection. |
| 10.2: Action-specific cooldowns, limited parallelism | A | Full | Distinct driver/mounted/beast/defensive channels. |
| 10.3: Arc/range/provider/readiness/rules validation | A | Full | Candidate and authoritative validation; negative tests. |
| 10.3: Seeded probabilistic hit/defense resolution | A | Full | Combat named RNG stream and trace factors. |
| 10.3: Individual target components and bands | A | Full | Driver/cart/beasts; configurable thresholds and consequences. |
| 10.3/D-061: Simultaneous same-phase mutual disable | A | Full | Frozen phase damage; earlier disable cancels later action. |
| 10.3: Meaningful combat tradeoffs/viable racing | A | Partial | Recovery/equipment/position cost real; full-reference attrition unbalanced, not owner-approved targets. |
| 10.4: Dangerous/Sporting/Brutal adjustable presets | A | Full | Lethality profile data, living-only fatality/injury, cart destruction. |
| 10.4: Recovery/economy handled outside race | A/O | Deferred | Damage output exists, campaign correctly absent; named handoff partial M10. |
| 10.1/F.5: Future magic/trap/special ability hooks | P/O | Partial | Modular combat but no complete named extension contracts, M10. |

## Race lifecycle, environment, presentation, development tools

| ID / production requirement | Authority | Status | Actual evidence / limitation |
|---|---|---|---|
| 11.1: Setup/grid/countdown/racing/conclusion/results | A | Full | Central controller and separate mechanics. |
| 11.2: Aligned rows, no lane-distance staggering | A | Full | Grid validator/reference fixtures. |
| 11.2: Grid assignment policies/random initial grid | A/O | Partial | Configured explicit valid grid; no broad qualifying/randomization workflow. Randomization is permitted, not mandatory. |
| 11.2/D-034: Common clock and rear-row first crossing | A | Full | First line starts lap without credit; nonzero finish and deeper-row tests. |
| 11.3: Normalized progress, fractional line/finish time | A | Full | Actual transitions, lane-neutral course standings, close/tied finishes. |
| 11.4: Circuit winner and configurable cutoff | A | Full | First eligible finish and remaining conclusion. |
| 11.4: Finished/Retired/Disabled/DNF reasons | A | Full | Terminal fields/reason and auto inability retirement. |
| 11.4: Disqualified/officiating state | A | Partial | Classification type not substantive assessor; penalties zero, M04. |
| 11.4: Pre-race retirement thresholds | O | Deferred | Optional thresholds beyond inability not implemented. |
| 11.4: Rolling/other race formats/strategic withdrawal | O | Deferred | Correct initial circuit/standing start; extension contract partial. |
| 11.5: Immediate and default delayed wreck removal | A | Full | Delay zero/positive, occupancy, browser cleanup checks. |
| 11.5: Persistent wreck mode | A | Missing | No explicit schema/contract; documented deferral, M05. |
| 11.5: Ordinary deadlock safety | A/P | Full | Bounded cleanup/deadlock watchdogs; forced retirement fallback. |
| 11.6: Rules interpret legal actions/victory/termination | A | Full | Shared legal rules and classification/controller. |
| 11.6: Event-driven penalties/officiating | A | Missing | Zero field only, no assessor; M04. |
| 11.6: Classification/time/laps/components | A | Full | Structured result from authoritative state. |
| 11.6: Overtakes/time leading/incidents | A/V | Full | Progress-path counters, tie state, lead ends at first finish, participants counted. |
| 11.6: Combat/hit/actual damage/sign usage | A/V | Full | Shared authoritative counters and per-RU batch exports. |
| 11.6: Unsupported result stats identified | A/P | Partial | `unavailableStatistics: []` despite officiating gap, M04. |
| 12: Separate weather/conditions/events responsibilities | A | Full | Profiles/condition consumers/lifecycle module. |
| 12.1: Fixed race weather; local lane/segment effects | A | Full | Traction/visibility/fatigue, roughness/surface modifiers. |
| 12: Explicit wind/temperature/intensity dimensions | A | Partial | Aggregate profiles omit independent dimensions, M08. |
| 12.1: Environmental beast traits | A | Full | `environment/traits.ts`; trait/weather matching, mean team traction/fatigue effects; controlled rain/mud test. |
| 12.1: Dynamic weather/continuous track wear | O | Deferred | Fixed weather allowed; event-driven roughness present. |
| 12.2: Seeded optional incidents/intensity presets | A | Full | Disabled through Chaotic, Occasional default, no guaranteed event. |
| 12.2: Weights/progress windows/cooldown/duration/severity | A/P | Full | Validated event controls, schedule and logs. |
| 12.2: Placement occupancy/fairness/validity | A | Full | Placement buffer/occupied exclusion, detectable hazards. No exhaustive fairness proof. |
| 12.2: Simulation-generated incidents distinct | A | Full | Wreck/contact/cleanup lifecycle distinct from external spawn attempts. |
| 12.2: Simplified moving hazards | A/O | Full | Moving-animal behavior; broader example catalog optional. |
| 12.3: AI responds through perception/utility | A | Full | Hazard perception/risk, with memory caveat M06. |
| 12.3: Separate crowd morale/performance influence | A/P | Missing | Approved prose vs optional appendix ambiguity; M08 needs disposition. |
| 13.1: Top-down markers/full track/follow/select | A | Full | Phaser viewer/geometry; browser flow and visual inspection. |
| 13.1: Positions/lanes/contact/hazards/stopped/weather/player | A | Full | Event/state overlays and status display. |
| 13.1: Standings/progress/calculable gaps | A | Full | Presentation race model/panel and results. |
| 13.1: Player speed/fatigue/components/strategy/readiness | A | Full | Panel derives from immutable snapshots. |
| 13.1: Opponent visibility/hidden-intent restrictions | A | Full | Player presentation privacy; separate developer inspector. |
| 13.1: Pause/playback/paused signs | A/V | Full | Next boundary command processing, exact step and rates. |
| 13.1: Results/highlights/stable condition report | A | Full | Result/components and event highlights; no campaign recovery calculation. |
| 13.2: Prominent radio-style separate event commentary | A | Full | Dedicated generator/UI area, deterministic template events. |
| 13.2: Intent/attempt/confirmed outcome distinction | A | Partial | Mostly factual; nominal damage overstates HP loss, M02. |
| 13.2: Priorities/suppression/timing/highlights | A | Full | Routine cap/repeat suppression, critical events, logged highlights. |
| 13.3/I4: Persistent active/pending/opportunities/behavior | A/V | Full | Simultaneous text labels and timing explanation. |
| I4: Reliable crossing activation notification | V | Partial | Routine radio can suppress; no guaranteed separate notice, M03. |
| 13.4: Numeric components/personality/tuning forms | A | Full | Generic numeric metadata/ranges/previews/reset. |
| 13.4/E.5: Form editor for every tunable | P | Partial | JSON needed for structure/enum/boolean/track edits, M09. |
| 13.4: Derived values/contributions inspectable | A | Full | Initialization/stat previews and state inspector. |
| 13.4: Save/load/reset/import/export configs | A | Partial | Mechanisms work; cross-editor update loses tuning, H01. |
| 13.4: Pre-race vs selected paused live edits separated | A | Full | Running race isolation, restart needed for config edits. |
| 13.4: Live override old/new/effective tick/source | A | Full | Queue events and journal replay. |
| 13.5: Error/Warning/Info/Trace diagnostic records | A | Full | Structured diagnostic/event output and separate player feed. |
| 13.5: Actor and target RU filters/search/timeline/JSON | A/V | Full | Explicit actor/target extraction, tests and browser filtering. |
| 13.5: Correct subsystem attribution | A | Partial | Plain `contact` maps to rules fallback, M07. |
| E.5/F.4: Bounded recording and dropped counts | P | Full | 200-frame/50,000-row defaults, configurable retention, tests. |
| Logging generation level/sampling/snapshot cadence | P/V | Partial | Display filtering/retention only; no production sampling, M07. |
| 13.5: Tick step/RU/tile/event/AI/movement inspector | A | Full | Recorded immutable tick inspection and diagnostic panels. |
| 13.6: Version/seed/config/scripted/live command scenarios | A | Full | Strict configuration plus journal and events. |
| 13.6: Replay from inputs | A | Full | Native Node and browser exports reconstruct state/journal. |
| 13.6: Full mutable snapshot restore/polished replay UI | O | Deferred | Historical inspection is not rewind; correctly documented. |
| E.5: First divergence/paths/noncanonical versions | P | Full | Comparison worker/CLI; unsupported versions static only. |
| E.5: Full capture authenticity | V | Partial | Endpoint verified, diagnostic/history evidence excluded, M01. |
| F.4: Invalid config/override/storage/crash isolation | P | Full | Validation paths, structured rejection, rollback/error bundle, storage-failure browser check. |
| F.4: Full-trace streaming/text export | O | Deferred | JSON capture exists; optional streaming/text not supplied. |

## Contracts, fixtures, gates and v0.3 requirements

| ID / production requirement | Authority | Status | Actual evidence / limitation |
|---|---|---|---|
| 14: Illustrative interfaces exactly reproduced | P | Different | Concrete typed APIs adapt names/shapes; allowed by illustrative status. |
| 15/A.5: Provisional tick lifecycle | P/A | Full | Commands→AI→preMove→incremental movement→postMove→fatigue/results; D-061 governs combat. |
| A.7: Bounded transitions/ticks, nonfinite/occupancy checks | P | Full | Transactional rollback and invariant/crash evidence. Practical workload limits remain L01. |
| B.1–B.3: Units/reference/stats baseline | P | Full | Versioned profiles, six-RU content; subsequent formulas documented. |
| B.4: Fatigue/exertion/recovery baseline | P | Different | D-072 endpoint/full-tick implementation; sign-crossing policy ambiguous, M11. |
| B.5/B.7/B.8: Handling/combat/contact numerical families | P | Full | Tunable profiles plus bounded hardcoded policy listed in audit. Values not approved canon. |
| C: Runtime strict schema/IDs/references/assets/grid | P/V | Full | Zod validation, safe own-key IDs, no roster sharing, closed topology. |
| C: Invalid versions rejected; deliberate migrations | P/V | Full | Explicit portable 0.7→0.8 migration; old replay noncanonical. |
| C: Persistence cannot affect mechanics | P | Full | IndexedDB adapter/storage failure isolated. |
| D.1–D.3: Complete six-RU reference/equipment | P | Full | Loaded content/fixture definitions and reference execution. |
| D.4/17: Golden/adversarial test inventory | P/A | Full | Acceptance matrix/test files cover required mechanics; all 261 registered tests pass. |
| D.5/17.3: Batch numeric distributions and seeds | P | Full | CLI/worker results, full-reference/equalized stored cases and reports. |
| E.1/E.2: Authority/decision register/provisional labeling | P | Partial | Register exists; stale status/historical context confusing, L02. |
| E.3: Milestone acceptance gates accurately reported | P/V | Partial | Full completion claims exceed H/I evidence; audit §4. |
| E.4: Every mechanic config/trace/tests/inspector/docs | P | Partial | Strong majority; unsupported/gap rows above prevent universal claim. |
| F.1: Immutable snapshot boundary and adapters | P | Full | Actual concrete API differs permissibly from sample. |
| F.2: Stable tick/substep/sequence and actor events | P | Full | Deterministic emission IDs and replay. |
| F.2: Important events have specific schemas | P | Partial | Many generic details/payload records remain; M02/M07 semantic debt. |
| F.5: Named I/O deterministic extension boundaries | P | Partial | Useful modules/results but incomplete explicit hook contracts, M10. |
| F1: Full historical audit inspected before closure | V | Unverified | Unavailable; owner waived waiting. New audit cannot reconstruct unseen definitions. |
| F1/F3: Finding triage/remediation document | V | Partial | Summary dispositions exist; detailed historical Medium/Low closure unverified. |
| F2 H-01: Fractional .90→.95 and adversarial accounting | V | Full | Scheduler regressions, stable timing/reorder/finish tests. |
| F2 H-02: Prototype-name malformed command targets | V | Full | Shared ID schema/own lookup, direct/import/browser/replay tests. |
| F2 H-03: Nerve/durability/roughness/severity consumers | V | Full | New bounded attribute tuning, derivation/damage/control tests. |
| F2 H-04: All authoritative result fields | V | Partial | Shared counters real; penalties unsupported, M04. |
| F3 M-01: Target-side filtering | V | Full | Actor/target extraction tests include both sides. |
| F3 M-03: Invalid capture cannot mask state mismatch | V | Full | `capturesValid` gates identity; remaining evidence scope M01. |
| F exit: Summary correctness and determinism | V | Partial | Direct repairs pass; historical full closure unavailable, penalty semantics partial. |
| G1: Versioned selector/default Combat/persistence/labels | V | Full | Scenario rules, viewer/results/batch/export/hash/replay. |
| G2: Combat preserves channels/guard/D-061 | V | Full | Shared engine existing combat tests retained. |
| G3: Pure offense suppressed in candidate and resolver | V | Full | No legal attack/ram; zero attacks in 292 stored Pure cases and fresh reference. |
| G3: Pure ordinary maneuvers/incidental damage retained | V | Full | Shared contacts; reproducible crafted consequence tests and reference contact. |
| G3: Pure is not different weather/fatigue physics | V | Full | Shared derivation/environment and termination. |
| G3: Attack sign rejects clearly/no charge in Pure | V | Full | Engine/schema/UI rejection; incompatible imports deterministically refused. |
| G3: Intentional/ram/incidental diagnostic distinction | V | Full | Action-kind metrics and contact source tags. |
| G4: Paired tests, malicious action, saved/import/UI | V | Full | Ruleset tests, browser and headless/replay coverage. |
| H1.1: Choose path/value/preview/every RU | V | Full | Dedicated all-RU panel, nested numeric/personality/strategy paths. |
| H1.1: All beasts on all RUs explicit | V | Full | Roster traversal, twelve-beast browser/test coverage. |
| H1.2: Atomic validation/no clamp/reasons | V | Full | Candidate copy/full validate before commit, invalid batch isolation. |
| H1.3: Preserve IDs/rosters/equipment/unrelated values | V | Full | Bulk implementation/tests; distinct ordinary-editor defect H01. |
| H1.4: Pre-race minimum/live separation | V | Full | Draft edits do not reset running race. |
| H1.5: Restore/undo/unsaved indication | V | Full | Undo snapshot retained across previews; tests/browser. |
| H1.6: Copy-from-RU | O | Deferred | Optional convenience absent. |
| H1.6/J3: Validated portable balance presets | V/O | Full | Four versioned presets, inspected/previously validated; generator side effect L03. |
| H2: Dedicated global/per-sign bounds/reset/effective values | V | Full | Dedicated UI and diagnostic factor. |
| H2/H exit: Reliable save/export/rerun preservation | V | Partial | Cross-editor stale snapshot loses strength, H01. |
| H3: Sign queue/opportunities/utilities/reasons visible | V | Full | Sign state and AI inspector; logging sampling separate partial. |
| I1: Separate active/pending/event terminology | V | Full | Authoritative fields and queue/activate/lower/cancel events. |
| I1: Charge accepted queue once, rejects free | V | Full | Counters, command journal, tests. |
| I2: Pre-race common signal including rear rows | V | Full | Start hook and D-034 tests. |
| I2: Midrace actual forward line crossing | V | Full | Scheduler crossing hook, fractional/multi-tile tests. |
| I2: Old active persists/no early AI effect | V | Full | Decision before movement; active replacement at crossing. Secondary fatigue caveat M11. |
| I2: Lower active free, pending retained | V | Full | Separate lower/cancel controls and tests. |
| I2: Cancel without refund/second-pending reject | V/P | Full | Explicit provisional defaults; no claim of permanent owner canon. |
| I2: Same-tick ordering and replay | V | Full | Tick-boundary input before movement, journal submission context. |
| I2: End/disabled/retired/final crossing states | V | Full | Pending retained if terminal before crossing, no post-finish AI manufactured. |
| I2: Controlled RU permissions | V | Full | Player/developer permissions distinct and validated. |
| I3: Default global2/per-sign1 bounded influence | V/P | Full | Versioned tuning and diagnostic effective multiplier. |
| I3: Secondary fatigue effect separate from utility scaling | V | Partial | Separate knob exists; whole-tick crossing interpretation M11. |
| I3: Shipped stronger behavior measurable/observable | V | Partial | Altered-weight boundary test and 4× examples; 1×/2× plateau, H02. |
| I3: All directives assessed for intended behavior | V | Partial | Conserve-focused study; no complete per-directive comparative evidence, H02. |
| I3: Autonomy/legality/cooldown/safety never bypassed | V | Full | Scoring influences intents; mechanical validators remain authoritative. |
| I4: Pending/active differentiated, factual timing logs | V | Full | Distinct text state, crossing event context, exported usage. |
| I4: Crossing activation notification | V | Partial | Can be suppressed by radio, M03. |
| I5: Minimum queue/timing/reorder/replay cases | V | Full | Existing tests cover enumerated queue edges; strength test limitation H02. |
| I exit: Correct queues plus stronger observable effect | V | Partial | Timing core complete, default stronger claim not established. |
| J1: Paired styles/reference/compact/per-RU metrics | V | Full | 584 stored cases, two fresh reference hash matches, detailed aggregates. |
| J1: Trustworthy displayed configuration/metrics | V | Partial | Engine counters sound except unsupported penalties; editor state H01. |
| J2: Reproducible manual equalized/no-sign/sign/high loop | V | Full | Developer guide, presets and exports/worker comparison. |
| J2: Qualitative visible effect across varied conditions | V | Partial | Written observations exist; not comprehensive per-sign/condition player-observability proof. |
| J3: No premature balance approval/official target invention | V | Full | Report explicitly leaves balance open; audit concurs. |
| J3: Correctness versus tuning/config rollback separated | V | Full | Version bump, baseline preservation, provisional values and presets. |
| J4: Required type/lint/unit/build/browser runs | V | Full | All freshly passed; audit §3 exact results. |
| J4: Reference/adversarial/headless/D-034/D-061 retained | V | Full | Four compact suites, reference reexecution and existing regressions. |
| J exit: Reliable edits/stronger signs/release readiness | V | Partial | H01/H02 prevent unconditional gate closure; balance quality remains separate. |
| 7: Changelog/guide/decisions/matrix/report/presets | V | Full | Documents and sample configurations exist, freshness debt L02. |
| 7: Preserve historical artifacts/version old semantics | V | Full | v0.2 baseline tag/history/reports retained; explicit migration. |
| 8: Incremental reviewable F–J work and baseline | V | Full | Dedicated branch, preservation tag and distinct milestone commits. |
| 8: All unseen original audit items closed | V | Unverified | No such conclusion supported; original definitions unavailable. |

## Interpretation for future work

Approved requirements currently missing or materially partial are recorded separately from provisional algorithm differences. Persistent wrecks and environmental/crowd scope need explicit disposition; penalty rules need definition, not invented behavior. Endpoint verification limits, the tuning data-loss bug, and misleading damage wording are implementation/integrity issues rather than new game design. Full campaign systems, polished replay UI, dynamic weather, rolling starts and expanded race formats remain deferred.

This inventory and the main report supersede neither approved production documents nor owner decisions. They identify evidence and gaps at one exact revision. Subsequent work should cite concrete rows and new AUD- finding IDs rather than assume equivalence with the missing historical audit.
