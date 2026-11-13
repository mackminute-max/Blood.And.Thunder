# Blood and Thunder

Browser-first chariot racing prototype. Read AGENTS.md and Blood_and_Thunder_Prototype_Development_Spec_v0.2.md before development. Approved gameplay and provisional appendix baselines remain distinct.

## Development

Use Node 24.22.1 (see .node-version) and npm 11.9.0. Install with `npm ci`.

- `npm run dev`: Phaser race viewer, Race radio, standings/player panels, configuration editor, exact stepping, playback and diagnostic download.
- `npm run headless`: validate and initialize the six-RU reference scenario without advancing ticks. Optional arguments: `npm run headless -- scenario.json content.json`.
- `npm run movement -- 10`: execute ten fixed movement ticks and print a diagnostic bundle. Optional arguments: `npm run movement -- 10 scenario.json content.json`. Invalid setup/count or simulation error returns nonzero.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: required checks.
- `npm run test:browser`: functional smoke test against the running development server on port 5173. Requires Chromium; set CHROMIUM_PATH when it is not /usr/bin/chromium.

## Core movement harness

`src/content/oval-six-v1.scenario.json` and `src/content/reference.content.json` provide explicit versioned fixture data. Schema `c2-1` and simulation `0.7.0` require formula coefficients, movement limits and complete per-RU `targetSpeedRatios`. A ratio is a pre-race developer setting, not a player driving command. Reinitialize to apply JSON edits; the current run's configuration is immutable.

Derived max speed, acceleration, braking, handling, stability and endurance expose their input factors in `derived.breakdown`. Each step advances one fixed `tickDurationSeconds` (default 0.20). Movement accounts for each tile's lane-specific travel cost, checks every intermediate boundary and discards remaining budget on a blocked transition. Simultaneous forward departures/merges resolve before atomic position commitment. B1 supports adjacent lane changes and corner handling as described below. Damaging contact remains for C1.

Inspect the latest tick's authoritative state, transition/block events, stat and movement diagnostics, and state checksum in the browser. Export includes immutable initial scenario/content, current/last-valid state, RNG state/version, latest tick and diagnostics. The headless engine retains only the latest tick. The browser adds a bounded history of snapshots/logs with explicit dropped counters; neither is a complete replay log or a restorable snapshot. Checksums round numbers to 1e-8, sort object keys, and use noncryptographic FNV-1a32; raw state remains unrounded.

Invalid initialization refuses to run with field paths. A tick failure rolls back attempted movement and emits an invariant error with the last valid state. Transition caps and maxTicks bound the harness. Reinitialize after a halt/error.

## Boundaries and pending work

Simulation and shared configuration/contracts cannot import Phaser, presentation, application or persistence. Engine types exclude DOM/Node globals. UI consumes immutable state; all selected live overrides pass through the validated tick command queue.

The raw A2 movement harness does not credit laps. The A3 race controller applies the approved start-line accounting described below. Combat, fatigue accumulation, event scheduling, wreck cleanup, commentary, persistence and campaign features remain future phases. Current movement is a developer harness, not a playable race.

See docs/DECISIONS.md, docs/CHANGELOG.md and docs/IMPLEMENTATION_STATUS.md for provisional formulas, validation evidence and scope. Unknown versions are rejected; no scenario migrations are implemented.

## A3 circuit lifecycle

`npm run race` runs `oval-six-v1` to completion and prints a diagnostic bundle with classification and component state. Optional arguments: `npm run race -- scenario.json content.json`. Invalid setup or simulation errors exit nonzero. The four-front-row regression fixture remains available at `src/content/oval-front-four-a3.scenario.json`.

In the browser, **Start / restart reference race** explicitly replaces the editor contents with the reference scenario. The mode selector switches between raw movement inspection and circuit rules. Step through countdown/racing/conclusion; completion disables stepping and displays the result in the state inspector. Diagnostic download includes the result. The Phaser viewer, radio and terminal result/highlight panel consume the live authoritative frames.

The approved rule uses **one common start clock**. Front-row racers begin lap 1 at the line. Rear racers start at negative normalized progress; their first accepted crossing starts lap 1 without completing a lap. They finish after the configured full laps at the shared line. `firstLapStartedAtSeconds` records their approach time but is never subtracted from finish time. Rejected crossings do not start or complete a lap. A rear finisher completing L laps records L+1 line crossings. See decision D-034, which resolves specification F.3.

`rules.countdownTicks` is 0 in the fixture; positive values delay the common race clock without consuming the race watchdog. `finishTieToleranceSeconds` is 1e-6 in the fixture. Finish times use fractional tick timing, finishers stop/leave occupancy, and shared ties receive competition ranks. Cutoff is checked at the end of the winner's race tick plus `finishCutoffTicks`; zero permits other finishes in that same tick. No active entrants remain after completion; cutoff/watchdog DNFs preserve their reason.

Normalized standings use signed initial position plus accepted segment transitions and fraction, independent of physical lane meters. The controller supports nonzero finish indices and multiple aligned rear rows. Results distinguish supported statistics from unavailable combat/incident/leading metrics. Optional retirement thresholds and disabled-wreck cleanup remain later work; existing disabled components retain their reason, and active units with zero propulsion retire automatically.

Gate A, B1/B2 and C1/C2 combat and environmental mechanics are implemented; D viewer/commentary is implemented; E regression/comparison tools and initial balance evidence are implemented. Formula choices and numeric defaults remain provisional except where explicitly approved. Input schema is c2-1, simulation 0.7.0; older simulation versions are rejected rather than silently reinterpreted.

## A4 developer workflow

The Developer panels separate configuration, component/tuning editors, implemented rule fields and logs. RUs offers individual beast/chariot/driver/personality fields and definition/tuning selectors. Numeric ranges come from the versioned validation schemas; cross-field validation appears in the draft preview. Reference values have per-field reset buttons. **Draft previews and edits do not alter the active run.** Initialize/restart to apply edits. Scenario JSON remains available for topology and other structured fields.

Use a configuration name and **Save locally** / **Load saved** for IndexedDB storage in the current browser origin. **Export configuration** downloads a self-contained scenario/content/mode package; **Import configuration file** validates it before applying. **Reset defaults** restores bundled reference data. A storage failure leaves the simulation usable and manual export available. Configurations persist across page reloads in the same browser profile/origin; browser data deletion removes local saves, so export important scenarios.

Play/pause schedules fixed engine ticks at 1×/2×/4× without changing dt. Stepping advances exactly one tick and is disabled while playing. Select a retained tick to inspect its snapshot and an optional RU ID to inspect that unit's tile/components/stats; historical selection does not rewind the live simulation. Future steps continue from the live tick.

Logs supports tick range, RU/actor ID, subsystem, level, event type and text filters. Click a row to inspect its JSON. Movement diagnostics contain budgets, transition candidates/results, conflict reasons and discarded meters; derived snapshots expose modifier breakdowns. All four log levels are supported; unavailable later-subsystem traces are identified rather than fabricated.

Default retention is 200 tick snapshots and 50,000 log records, configurable before initialization. Capture IDs distinguish error snapshots at an unchanged committed tick. Dropped counts are visible. The list displays at most 300 matching rows; **Export diagnostics** includes all retained unfiltered rows and snapshots, input configuration, last valid state and latest result. Exports are capped at 20 MiB; **Export latest / crash snapshot** remains available without buffered history if a full trace is too large. Reduce retention and rerun for a smaller trace. They provide reproducible inputs and diagnostic history, not full replay restoration.

The portable configuration marker is `blood-thunder-configuration-a4-1`; buffered trace metadata uses `a4-1`. The developer artifact format is independent of the current simulation version (`0.7.0`). Selected paused developer overrides now use the command queue below. Combat inspects implemented actions; Environment inspects conditions/events; Comparison labels later capabilities.

## B1 lane and corner fixtures

In Movement, choose a RU, movement tick and adjacent lane delta, then **Add maneuver fixture**. This edits the pre-race draft only; initialize to apply. Countdown ticks do not consume maneuver ticks. A RU gets at most one planned lateral maneuver per movement tick. These are developer fixtures, not AI decisions, player driving or live overrides. The reference maneuvers list is empty.

Lateral requests resolve together before forward movement, preserve longitudinal fraction, and check explicit adjacency/occupancy. Favorable changes have no automatic roll or speed penalty. Difficult maneuvers use the seeded configurable B.5 check; failure stays in the original lane. By default a rejected request falls back to forward travel; abortIfBlocked discards that tick's forward travel budget. Moving from rest laterally requires the explicit allowStationaryLaneChange rule.

Safe corner speed and shorter inner/longer outer travel costs appear in derived breakdowns and traces. The fixed target-speed harness normally targets at/below current safe speed; disable respectSafeCornerSpeed for overspeed fixtures. Accepted entry from a straight or a different turn triggers one overspeed control check per corner region. Failure slows current speed and only unspent travel; prior transitions/timing remain intact.

Conflicts produce yield or brake without inventing damage. All unused blocked movement is discarded. Brake uses a provisional relative stopping-distance heuristic and configurable brakeFactor; no automatic penalty applies to a clean yield. Repeated blocking warns at the configured threshold and retires the stuck active RU at recovery threshold, without moving it into occupied space. Disabled-wreck cleanup remains C2.

Movement inspection shows attempts/results, rolls/probabilities, safe speeds, budgets, all intermediate transitions and discarded progress; Logs recognizes all lane/handling event types as movement. Formula/rate values remain editable in RUs → Formula and movement tuning. See D-043–D-050 for provisional semantics. Schema c2-1 / simulation 0.7.0 include these changes; no automatic migration exists.

## B2 AI, Strategy Signs and commands

The reference scenario uses `controller: "ai"`. Choose the controller draft in Scenario and initialize to apply it. `fixture` retains fixed targetSpeedRatios and B1 maneuver fixtures for regression; AI and nonempty maneuver fixtures cannot be mixed. In AI mode the driver chooses a speed/lane intent from perceived local information, personality, strategy, active sign, component-derived performance and seeded variation. Movement/conflict systems still determine the result.

The AI panel shows each RU's perceived objects, all 12 rejected/legal candidates, utility factors, chosen intent and actual outcome for the selected tick. RUs → Formula and movement tuning includes the AI weights, speed ratios, commitment and sign/strategy parameters. RUs → Drivers edits personality and skills. Candidate features and numerical defaults are PROVISIONAL (D-051–D-060).

Use the persistent Strategy Signs panel to raise/replace/lower signs, including while paused. Queued commands do not change active state until the next global simulation tick. Raising or replacing costs one opportunity, lowering is free; the active sign persists. The panel distinguishes queued/applied/rejected commands, active sign, remaining opportunities and actual driver mode. Safety constraints may defeat a sign preference. Attack and Defend influence combat choices; Push Hard multiplies fatigue gain by the configured 1.15 baseline.

In RUs, selected developer overrides are available while paused: `maxSpeedMps` (temporary derived override) and `teamFatigue`, each in [0,100]. Queue/reset applies at the next tick and logs old/new/target/source/time; initial configuration remains unchanged. Active max-speed overrides are labeled in state and derivation breakdown. Other fields require pre-race editing/reinitialization. Public engine calls use `submit(command, {paused:true})` for overrides; signs need no pause. `source:"developer"` signs targeting opponents additionally require the pre-race allowDeveloperSignCommands rule.

Commands contain commandId, source, effectiveTick, ruId and the typed payload (`raiseSign`/signId, `lowerSign`, or `developerOverride`/field/value). Command ticks include countdown; B1 maneuver ticks do not. Same-tick submission order is preserved. Scripted commands use the same validation and are automatically queued at initialization. A queue receipt is not an application guarantee: inactive targets or depleted sign budget can reject at the tick boundary. Duplicate/stale/unknown/unauthorized commands are refused. Null override values reset; lowering with no active sign is a free no-op. Re-raising the same active sign costs one opportunity.

Diagnostic exports now include commandJournal, pending/overflow summary, initial inputs and current/last-valid state. `npm run replay -- path/to/diagnostic.json` re-executes either raw movement or race inputs plus live journal and reports matchesExportedHash. This is deterministic input replay, not mutable-state restoration or a polished replay viewer. Pending future and rejected inputs are retained within the command submission bound; replay uses origin/tick/phase/pause context. Journals cap at 10,000 submissions by default; additional attempts are rejected with an overflow counter.

Current inputs use c2-1 / 0.7.0. Older files are rejected explicitly; no automatic migration is implemented. Recovery, campaign systems and full mutable snapshot restoration remain future work.


## C1 combat

Combat runs in headless raw/race ticks: pre-movement ranged, lateral contact, then post-movement attacks. Eligible same-phase attacks resolve together (approved, allowing mutual disablement). Earlier-phase disablement cancels later actions. Driver, mounted, trained beast, ram and defensive channels use independent readiness with action-specific cooldowns. Melee/ranged share the driver channel. Passive protection, active guard, component health/bands and configurable injury/fatality/destruction outcomes are implemented; numeric defaults remain provisional (D-061–D-070).

Combat shows selected-tick candidate scores/rejections, channel/action cooldowns, component condition and actual results. Edit weapon damage/accuracy/targetWeights, tuningProfiles.combat and lethalityProfiles through RUs numeric forms or full content JSON; initialization-sensitive changes require restart. Combat fixture editors accept arrays of `{movementTick,ruId,targetRuId,weaponId}` and `{movementTick,ruId}` guard plans. Select fixture controller, validate the draft, then initialize; duplicate channel slots and invalid references are rejected. AI controller uses autonomous decisions instead of fixture plans. These are test fixtures, not live player driving commands.

Default geometry: adjacent-lane melee/lateral ram, same-lane ranged with RU occlusion, trained beast adjacent/forward attacks. No free driver attack accompanies a ram. PostMove escape cancels without cooldown by default; preMove damage recomputes movement stats and can stop the target. Component/attack events and combat statistics are exported and deterministically replayed. Injuries are race outcome markers; campaign recovery remains deferred. C2 adds accidental contact and wreck removal below. The Phaser viewer and Race radio are supplied by D below.


## C2 conditions and incidents

Team fatigue now accumulates after movement using exertion, endurance, fixed weather and Push Hard; slow nonaccelerating teams can recover. Fatigue changes next-tick stats. Clear, rain, storm and heat are editable presets. Local roughness changes traction; optional validated beast-trait modifiers affect traction/fatigue. Numerical baselines remain PROVISIONAL (D-071–D-081).

Environment selects fixed weather and random-event intensity, and edits explicit `environmentPlans` fixture arrays (`id,movementTick,type,tile,durationTicks`). Validate the draft, then restart. Disabled intensity means no **random external** incidents; explicitly configured fixtures still execute. Seeded event counts allow zero, capped at three by default; placement respects occupancy and reaction space. Debris and animals block transitions, roughness changes local traction, and all expire. Animals advance across free lanes at configured intervals. AI perceives local hazards, records bounded memory and scores avoidance.

Movement conflicts can produce avoidance, harmless contact, or component damage through a separate seeded contact check. No automatic collision damage follows an occupancy rejection. Accepted transitions are preserved and blocked travel discarded. Disabled RUs obstruct until cleanup (10 movement ticks by default); removal retains disabled classification/component state. A configurable blocked-route safety hook can clear a wreck earlier. Environment and Movement inspectors show these transitions, fatigue, events, memory and counters; filters and diagnostic replay include them. RUs → tuningProfiles exposes numeric fatigue/event/collision controls; full validated JSON also edits boolean rules and trait modifiers.

These systems complete the current Gate C mechanics checks. D now supplies Phaser race rendering and event-grounded commentary; campaign recovery and dynamic weather remain deferred. E supplies batch/comparison and regression tooling below.


## D race viewer and Race radio

The browser opens an initialized, paused circuit race. Use **Play**, **Step one tick**, and 1×/2×/4× playback above the track. **Start / restart reference race** resets the reference scenario. Strategy Signs remain visible above the course; queued signs activate at the next valid tick and do not guarantee obedience. Movement harness is still available in Developer tools for raw mechanic inspection.

The Phaser full-track schematic shows lanes, start line, racing/stopped/finished markers, hazards and confirmed hit/contact cues. Click a marker or select an RU; Follow selected RU zooms the camera. Animation follows accepted intermediate transitions; pausing shows the exact committed state. The diagram is a schematic of topology, not a physical-distance chart.

Live standings show normalized course progress/NCU gaps and official finishing ranks/ties. Your RU panel shows component health/condition, fatigue, speed/target, driver behavior, active strategy/sign and combat readiness. Opponent detail exposes only perceived observations; private opponent state stays in the explicitly omniscient developer workbench.

Race radio is a separate deterministic event-template consumer with critical/high/medium/low priorities, repeat suppression, bounded feed/highlights and source references. Attempts, misses and canceled plans never become confirmed hits; fatalities and victory require explicit outcomes. Routine display updates are buffered at accelerated playback; pause to read. The terminal results section shows official classification, highlights and individual component outcomes. Restart clears it; inspecting developer history leaves live presentation untouched.

D changes no simulation version or mechanics: inputs remain c2-1 /0.7.0. Existing diagnostic exports and Node input replay verify authoritative hashes independently of render/camera/playback. The presentation module baselines are documented in D-082–D-088; settings live in src/presentation/commentary/settings.ts. Milestone E tooling and baseline review are available below; audio, polished art, full replay UI and campaign recovery are deferred.


## E regression, batch reports and Comparison

Run `npm run batch -- src/content/scenarios/e-reference.plan.json /tmp/bt-reference` for the full reference baseline and paired player signs, or use `e-stress.plan.json` for1,000 compact engineering races. Plans declare exact ordered seeds and scenario/content files (paths relative to repository-root working directory). CLI output includes per-run JSON/CSV, aggregate quantiles/counters, configuration/tuning/final hashes, source configurations and paired deltas. Progress goes to stderr; simulation errors retain a diagnostic bundle and exit nonzero. JSON/CSV outputs are analysis artifacts, not saved mutable game states.

In Developer → Comparison, capture/import two engine diagnostics and choose **Audit / find first divergence**. Inputs and command journals are re-executed in an isolated worker. Reports verify serialized state/hash/journal/latest events and show the earliest mismatching frame, changed paths, both events and diagnostics. Compatible current versions are canonical; unsupported/differing versions are explicitly noncanonical static inspection only. Inspect verified state in audit output. Imported state never replaces the live race. CLI equivalents are `npm run compare -- left.json right.json` and `npm run replay -- diagnostic.json`.

For tuning experiments, capture draft A, edit ordinary pre-race values with the existing numeric/JSON tools, capture draft B, then run a paired seed list (browser max100). Cancel ends the worker; it cannot affect the current race. Export retains full per-run metrics. Canonical diagnostic analysis caps100,000 endpoint ticks and shows up to100 changed paths; files/browser exports cap20MiB. CLI batch plans allow up to10,000 seeds and16 variants. Larger jobs belong in CLI output files, not browser logs.

[Baseline review](docs/BALANCE_REVIEW.md) records measured1,000 compact races and12 full-reference seeds across three variants. The latter finished13/72 entrants per variant, with no simulation errors; finish cutoff and chariot attrition warrant further review. This is a small descriptive sample, not proof of balanced gameplay or sign superiority. No gameplay defaults changed. [Tuning register](docs/TUNING_REGISTER.md) inventories provisional values and editable sources; [acceptance matrix](docs/ACCEPTANCE_MATRIX.md) maps the25 specification checks to executable coverage. D-089–D-096 record analysis conventions and limitations.
