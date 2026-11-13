# Blood and Thunder
## Prototype Development Specification — v0.2 (Implementation Baseline)

**Status:** Implementation-oriented draft for review; Sections 1–11 remain approved, Appendices A–F are PROVISIONAL engineering baselines  
**Former development codename:** BludWheelz  
**Date:** 2026-11-10  
**Source:** Approved Race Simulation design sections 1–11  
**Scope:** Browser-first racing simulation prototype, its presentation, tuning, diagnostics, and integration contracts. Management and roguelite campaign systems are context and future integration targets, not fully specified here.

> **Authority and uncertainty:** Sections 1–11 reproduce approved gameplay decisions from v0.1. The implementation appendices introduce explicit **PROVISIONAL** algorithms, values, contracts, sample content, and acceptance criteria to make a first coding pass possible. These are recommendations for review, **not additional approved canon**. In a conflict, approved design takes precedence. Do not silently promote provisional choices to approved rules. A developer may implement provisional defaults behind configuration, but must log them in the decision register.
>
> **Document precedence:** (1) approved requirements in Sections 1–11; (2) accepted amendments recorded in the decision register; (3) provisional Appendices A–F; (4) local code choices. The original TBD labels in Sections 1–11 remain historical markers; their working answers appear in appendices.

---

# 1. Product Vision and Prototype Goals

**Blood and Thunder** is a fantasy chariot combat-racing roguelite auto-battler. The player is a stable owner/manager, not the chariot driver. The player assembles a racing unit (RU), selects pre-race strategy, and watches an autonomous race unfold, with a limited number of tactical interventions via **Strategy Signs**. One chariot from the player's stable enters each race. Long-term progression involves a home stable, persistent drivers, individual draft beasts, chariots, equipment, race series, between-race events, temporary run upgrades, and permanent rewards.

The initial prototype must prove the following:

1. Deterministic, headless, tick-based multi-RU racing on a lane-and-segment track.
2. Autonomous driver decisions that respond to racing, combat, positioning, and conditions.
3. Meaningful interactions between component stats, movement, lane choice, collision, combat, and fatigue.
4. A small number of Strategy Sign interventions with persistent effects.
5. Readable top-down race presentation and prominent radio-style play-by-play commentary.
6. **First-class developer tools** for changing values, stepping ticks, inspecting AI and movement decisions, and exporting detailed logs.
7. Repeatable test scenarios for balancing and regression testing.

**Guiding priorities:** mechanics and inspectability over visual polish; modularity and data-driven configuration over premature complexity; no requirement to use an LLM at runtime.

## 1.1 Non-goals for the first prototype

Not required initially: sophisticated sprite animation, fully simulated continuous physics, multi-tile RU footprints, separate individual-beast fatigue meters, elaborate campaign economy, detailed recovery mechanics, every race format, full replay viewer, continuously deforming terrain, dynamic weather transitions, complex officiating, or large procedural content catalogs. Interfaces should nevertheless permit later addition where specified below.

---

# 2. Technical Architecture

## 2.1 Approved stack and boundaries

- **Language:** TypeScript.
- **Platform:** Browser-first; potential desktop packaging later.
- **Rendering:** Phaser 2D, initially top-down.
- **Development environment:** Node.js, Vite, Git.
- **Testing:** Vitest.
- **Persistence:** Browser-local IndexedDB for saves, test scenarios, and configuration; export/import portable files.
- **Data:** JSON-driven definitions, validated on load.
- **Simulation:** Headless, deterministic engine, not coupled to Phaser, the DOM, or commentary.
- **Management UI:** Separate from race simulation and renderer.

Suggested conceptual module layout (implementation recommendation, not mandated folder names):

```text
src/
  simulation/
    core/            # clock, seeded RNG, race controller, commands, state
    track/           # geometry, lane/segment topology, conditions
    movement/        # speed, progress, maneuvers, occupancy
    conflicts/       # simultaneous movement conflict and collisions
    entities/        # beasts, teams, chariots, drivers, RU aggregation
    ai/              # perception, utility scoring, behavior, commitments
    combat/          # attacks, defense, targeting, damage
    environment/     # weather, crowd influence, external events
    rules/           # laps, classification, elimination, victory
    logging/         # structured diagnostics and authoritative event log
  presentation/
    phaser/          # viewer and camera
    commentary/      # event-to-text generation
    ui/              # standings, RU panel, Strategy Signs, results
    developer/       # tuning, inspectors, logs, test harness
  content/           # versioned JSON definitions and scenarios
  persistence/       # IndexedDB, import/export, migrations
  tests/             # unit, deterministic regression, integration
```

## 2.2 Authoritative flow

```text
Versioned race configuration + seed + initial roster
                  |
                  v
         Race Controller / fixed tick
                  |
       +----------+-----------+
       |          |           |
       v          v           v
    Driver AI  Movement     Combat / Environment
       |          |           |
       +----------+-----------+
                  |
       Conflict / outcome resolution
                  |
       Updated authoritative race state
                  |
       Structured events and diagnostics
                  |
       +----------+-----------+
       |          |           |
       v          v           v
   Phaser UI   Commentary   Debug / Export

Player Strategy Sign / developer commands
      -> validated command queue -> simulation tick boundary
```

All simulation-affecting commands must pass through a defined interface. Renderer, commentary, and diagnostic display cannot silently mutate simulation state. Preserve original immutable race configuration separately from mutable runtime state.

## 2.3 Determinism

Given the same versioned configuration, initial state, seed, and tick-stamped input commands, the engine must produce the same authoritative outcomes. Use a seeded RNG, stable iteration and tie-breaking, consistent calculation order, and deterministic state transitions. Avoid presentation-time or wall-clock-dependent simulation logic. Log developer overrides as commands. Playback speed changes must not alter simulated tick duration.

---

# 3. Section 1 — Track Geometry [APPROVED]

A track is an ordered sequence of longitudinal **segments** with lateral **lanes**. Each `(segment, lane)` pair defines a spatial tile. Initial prototype: **four-lane oval**; architecture must support non-oval tracks and varying lane counts by segment.

Segment metadata includes:

- Segment identifier, track order, and connectivity.
- Type: straight, corner, or transition.
- Turn direction: left, right, or none.
- Turn severity / curvature.
- Surface type and environmental properties.
- Available lanes and their adjacency/connectivity.
- Start/finish boundary markers.
- Visual path or rendering metadata.
- **Per-lane relative travel-length modifier**, so corner lanes can have different effective path lengths.

Inside corner lanes generally have shorter paths but may have lower safe cornering speeds; outer lanes may be longer but permit higher safe speeds. Geometry stores these distinctions; **Movement** applies their effects. Lane-length modifiers are not a reason to stagger starting positions or calculate standings from raw traveled distance.

**TBD:** Segment length units, lane transition topology for non-ovals, exact curvature scaling, and data schema.

---

# 4. Section 2 — Spatial Occupancy [APPROVED]

- A **Racing Unit (RU)** consists of draft beasts, chariot, and driver.
- One RU occupies **one tile** `(segment, lane)` at a time, even though its components remain individually targetable.
- Tiles are deliberately larger than the RU. No multi-tile footprints or continuous collision bodies.
- Two RUs may not occupy the same tile at the end of a resolved transition/tick.
- RUs may traverse **multiple tiles in one tick**. Check each intermediate tile/transition for interactions.
- Entering a tile vacated by another RU during the same tick can be valid, subject to simultaneous-intent conflict resolution.
- Environmental obstacles can also occupy or affect tiles; their behavior is defined by their type.

Spatial abstraction is a mechanical representation, not a statement that draft beasts and chariot occupy the same physical point. Relative direction still matters for contact and targeting.

---

# 5. Section 3 — Speed & Movement [APPROVED]

Each RU has:

- **Target Speed:** desired speed from AI, strategy, and constraints.
- **Current Speed:** actual speed that changes through acceleration and braking.
- **Fractional Movement Progress:** carried between ticks for smooth progression on discrete tiles.

At each tick, update current speed toward target speed using effective acceleration/braking limits. Convert movement into progress through tiles, accounting for lane-specific travel-length effects and segment conditions. An RU may cross multiple tile boundaries in one tick; resolve each transition in order.

Normal fractional remainder carries forward. **Unused movement progress blocked by a conflict is discarded**, not banked for a future burst. The conflict may also change current speed depending on the outcome. There is no accumulation of stored movement while stuck.

Effective speed and maneuvering are influenced by maximum speed, acceleration, braking, handling, corner severity, surface, weather, fatigue, damage, and other modifiers.

**TBD:** Tick duration, movement unit scale, exact speed/progress conversion, numeric acceleration/braking formulas, and corner speed curves. These are tuning parameters, not hardcoded constants.

---

# 6. Section 4 — Lane Changes & Handling [APPROVED]

- Ordinary maneuver: **one adjacent lane per tick**.
- Standard lane changes are possible on straights and corners when geometry and occupancy allow.
- Aggressive multi-lane moves are deferred, but architecture may later support them.
- Handling is an effective RU attribute affecting maneuver efficiency and control.
- **Routine lane changes under favorable conditions are reliable and do not require a speed/progress penalty.**
- Difficult maneuvers can impose cost, control risk, or checks; examples: controlled, strained, dangerous.
- Driver AI selects maneuver intent; Movement and Conflict systems determine whether it succeeds.
- Cornering creates a choice between shorter inner paths and potentially higher safe speed on outer paths.

Avoid making lane changes intrinsically punitive; the choice should be situational.

---

# 7. Section 5 — Collision & Movement Conflict Resolution [APPROVED]

**Movement conflict** is distinct from **physical collision/contact**. Every conflicting movement attempt receives a resolution check; outcomes can include yielding, braking, avoidance, blocking, harmless contact, or damaging impact. **Collision does not automatically cause damage or speed loss.**

## 7.1 Simultaneous-intent resolution

1. Collect all RU movement and maneuver intents before committing positions.
2. Determine projected tile transitions and arrival ordering within the tick.
3. Resolve interactions incrementally as units attempt transitions, including intermediate tiles.
4. Handle rear-following conflicts, contested destinations, crossings, lane swaps, deliberate rams, and obstacles.
5. Use projected arrival, maneuver context, and deterministic tie-breakers; do not arbitrarily privilege array iteration order.
6. Commit legal positions and effects; discard blocked unused progress.

Impact severity may be minor, moderate, or major, based on relative speed, contact geometry, stability/resistance, and other contextual modifiers. Damage resolution belongs to component systems.

## 7.2 Directional physical contact

Draft beasts are ahead of the chariot. Consequently:

- **Normal deliberate chariot ramming is lateral**, e.g. frame, wheels, blades, or side contact.
- Deliberate rear-end chariot ramming is **not** a routine tactic because the attacking team's beasts would collide first; rear-end impacts are exceptional/accidental situations.
- Draft-beast natural attacks (bite, kick, gore, etc.) are **combat actions**, not chariot rams.
- Any RU can attempt a ram if position and rules permit it.
- Direction and relative tile relationships govern valid contact/targeting, without adding multi-tile RU occupancy.

**TBD:** Exact resolution probabilities, tie-breaker priority order, severity formulas, and control thresholds. Determinism is mandatory.

---

# 8. Section 6 — RU Attributes & Component Statistics [APPROVED]

The RU's performance is **derived from its components**, not normally assigned as independent base stats.

## 8.1 Individual draft beasts

Each beast is a distinct persistent asset with:

| Attribute | Meaning |
|---|---|
| Speed | Contribution to maximum pace |
| Power | Pulling force and launch/acceleration contribution |
| Agility | Responsiveness and maneuvering |
| Endurance | Sustained exertion capacity |
| Discipline | Control and response to driver commands |
| Toughness | Resistance to injury and damage |

Beasts also have individual condition, injuries, traits, and abilities. Team composition aggregates contributions; mixed-species teams should be architecturally possible but are not required in the first content set.

**Initial simplification:** Track fatigue at the draft-team level, while retaining **individual beast damage/condition**. Individual fatigue may be added later.

## 8.2 Chariot

| Attribute | Meaning |
|---|---|
| Weight | Load affecting performance and impacts |
| Stability | Resistance to loss of control |
| Durability | Structural integrity |
| Protection | Defensive coverage |
| Rolling Efficiency | Mechanical travel efficiency |
| Maneuverability | Contribution to lane changes and handling |
| Capacity | Loadout/crew/equipment constraints |

The chariot has **no independent propulsion**.

## 8.3 Driver

| Skill | Role |
|---|---|
| Driving | Speed management, maneuver execution |
| Beast Handling | Coordination and control of the draft team |
| Combat | Weapon use and fighting decisions |
| Awareness | Hazard and opponent perception |
| Nerve | Response to danger and pressure |

Personality is separate from skill (see Section 9 below).

## 8.4 Effective RU values

Compute **Maximum Speed, Acceleration, Braking, Handling, Stability, and Endurance** from beasts, chariot, driver, equipment, damage, fatigue, and conditions. Keep protection, durability, injury, and damage component-specific. Expose the inputs and derivation in developer tools.

**TBD:** Aggregation formulas, stat scales, team-size effects, equipment slot rules, and condition thresholds. Developer overrides may temporarily replace derived values for tests but must be visibly marked as overrides.

---

# 9. Section 7 — Driver AI & Behavior [APPROVED]

## 9.1 Utility-based autonomous AI

Drivers evaluate legal tactical actions using a **utility scoring system**, informed by:

- Perceived local track state, hazards, opponents, and openings.
- Driver skills and awareness range (no omniscience).
- Personality traits: **Aggression, Risk Tolerance, Patience, Competitiveness, Discipline**.
- Pre-race coaching/strategy: e.g. balanced, aggressive, defensive, endurance, sprint, opportunistic.
- Active Strategy Sign.
- Current speed, condition, fatigue, equipment readiness, and race context.
- Small seeded variation.
- Limited short-term memory/commitment to prevent oscillating decisions.

AI produces **intents**, not guaranteed outcomes. Mechanical systems validate and resolve them. Log candidate actions, utilities, modifiers, rejected/invalid actions, chosen intent, and actual outcome for debugging.

## 9.2 Strategy Signs

- Default **three opportunities per race**; upgrades/events may modify this count.
- Raising a sign costs one opportunity.
- Lowering an active sign is **free**.
- Replacing a sign costs another opportunity.
- Active sign persists until lowered/replaced.
- No active sign: driver follows personality, base AI, and pre-race strategy.
- A sign strongly influences utility, but does **not** force an action; personality and situational safety still matter.
- Safety-critical reactions remain available.

Illustrative directives: Push Hard, Defend Position, Attack, Conserve. **Final sign catalog, exact effects, and UI wording are TBD.**

All sign commands are timestamped by effective simulation tick and included in deterministic replays.

---

# 10. Section 8 — Combat Actions & Resolution [APPROVED]

Combat occurs inside ordinary race ticks, not in separate combat turns.

## 10.1 Combat categories

1. Driver melee attacks.
2. Ranged attacks.
3. Deliberate lateral chariot ramming (resolved through collision/contact system).
4. Trained draft-beast natural attacks.
5. Defensive actions/reactions.

Magic, traps, and special abilities are later extensions; leave compatible hooks.

## 10.2 Readiness and channels

Use **action-specific cooldowns**, not a universal action-point pool. Maintain separate, initially limited action channels for driver weapon, beast natural attack, chariot-mounted equipment, and defensive reaction. Compatible actions may operate in parallel when rules and readiness allow. Cooldown values, concurrency restrictions, and recovery timing are **TBD**.

## 10.3 Attack resolution

- Validate relative position, direction/arc, range, equipment, eligibility, readiness, and competition rules.
- Resolve attack probabilistically using seeded randomness, skill, position, conditions, weapon accuracy, and defense.
- Distinguish passive defenses from active guard/evasion; active defense has an opportunity cost but not necessarily a speed penalty.
- Resolve component-specific hits to **draft team / individual beast, chariot, or driver**, as appropriate.
- Record damage, status, and mechanical consequences at well-defined simulation boundaries.
- Weapons specify range, arc, valid targets, accuracy, damage, recovery, and effects.

Component condition bands: **Functional, Damaged, Critical, Disabled**. Exact thresholds and effects are configurable/TBD.

Combat must have tradeoffs in positioning, risk, recovery, and equipment so racing without constant fighting remains viable.

## 10.4 Lethality and recovery

Default lethality profile: **Dangerous** — meaningful injuries, destruction, and eliminations; fatalities possible but relatively uncommon.

Other example profiles:

- **Sporting:** Mostly nonfatal injury and temporary disablement.
- **Brutal:** Greater frequency of severe injury, destruction, and fatalities.

These are **presets, not rigid modes**. Independently tune injury severity, fatality chance, component destruction, elimination, and related parameters by race type, league, arena rules, difficulty, and events. Combat restrictions are configurable; **combat is generally legal by default** unless a competition prohibits particular weapons, targets, or actions.

The race records what was damaged. The **campaign/stable layer** later calculates treatment, repair, recovery time, permanent injury, and economic consequences.

---

# 11. Section 9 — Race Flow, Rules & Results [APPROVED]

## 11.1 Lifecycle

1. **Race Setup:** Load versioned track, competitors, rules, weather, event settings, seed.
2. **Starting Grid:** Assign unique starting tiles and initialize state.
3. **Race Start:** Standing start by default; countdown and timing activation.
4. **Active Racing:** Repeated AI, movement, combat, conditions, events, standings.
5. **Race Conclusion:** Finishers, eliminations, timeouts, classification.
6. **Results & Rewards Handoff:** Emit results and damage record; campaign handles rewards.

A central Race Controller orchestrates phases; individual mechanics remain in their own modules.

## 11.2 Starting grid — IMPORTANT APPROVED REVISION

**Do not use a staggered grid to equalize lane path lengths.** Start racers in aligned rows, with racers in a row sharing the same longitudinal starting position and occupying different lanes. Racers can freely change lanes subject to the approved maneuver rules. Starting on the inside is a **modest tactical advantage** (especially approaching corners), not an overpowering advantage to be canceled out. This makes grid assignment meaningful.

Grid assignment may be random, qualifying-based, previous-results-based, or league-based. Initial prototype can randomize valid positions. **Standing starts** are the default; rolling starts may be configured later.

## 11.3 Timing and standings

- Simulation time is based on fixed ticks; viewer playback time is separate.
- Track **completed laps, current segment, lane, fractional progress, normalized longitudinal race progress, and line-crossing times**.
- Detect lap/finish crossings from actual transitions, including multi-tile movement within one tick.
- **Standings use normalized course progress, not physical distance traveled**; lane path-length differences influence travel efficiency, not artificial standings advantage.
- Resolve close finishes with **fractional-tick crossing times**. Exact equal times may produce official ties, subject to race rules.

## 11.4 Race formats and conclusion

Initial format: standard circuit race; first eligible RU to complete the required laps wins. Other RUs may continue to finish, subject to a configurable cutoff. Future rule modules may support elimination, timed, endurance, combat arena, and hybrid formats without changing the movement/combat engine.

Finish states include Finished, Retired, Disabled, Disqualified, and DNF; specific cause should be retained separately from general classification. Initially support automatic retirement for inability to continue and optional pre-race retirement thresholds. Advanced AI risk-based withdrawal is later scope.

## 11.5 Disabled RU handling

Configurable modes:

- Immediate removal.
- **Delayed removal (default).**
- Persistent wreck.

A disabled RU may temporarily occupy a tile and obstruct traffic. Removal timing must prevent permanent deadlock in ordinary prototype races; advanced track-clearing crews are deferred.

## 11.6 Race rules, officiating, and results

Race Rules Engine interprets authoritative simulation events to determine legal actions, penalties, victory, classification, and early termination. Events may trigger rules hooks but must not directly rewrite standings.

Produce structured results with final classification, finish time, laps, overtakes, time leading, combat actions/hits, damage, incidents, penalties, component condition, and Strategy Sign usage. Results are an input to campaign systems; the race engine does not calculate the full economy.

---

# 12. Section 10 — Race Events & Environmental Conditions [APPROVED]

Three separate, interconnected modules:

1. **Weather:** precipitation, wind, temperature, visibility, intensity.
2. **Track Conditions:** surface, traction, roughness, obstructions, changing local conditions.
3. **Race Events:** discrete external incidents and simulation-generated hazards.

These systems publish conditions/modifiers/events; Movement, Combat, and AI apply or interpret them. Weather does not directly move an RU.

## 12.1 Weather and track

- Initial prototype uses **fixed weather per race**; dynamic weather supported architecturally for later implementation.
- Track surface and conditions may vary **by segment and lane**.
- Weather affects traction, handling, perception, fatigue, and possibly ranged attacks.
- Track wear/degradation is optional and initially event-driven or threshold-based, not continuously simulated.
- Environmental beast traits are data-driven (e.g. heat adaptation, sure-footedness, mud aptitude) and modify existing calculations.

## 12.2 Event scheduler

Seeded and configurable; **random external incidents are optional and not guaranteed**. Default event intensity: **Occasional**, with many races having no major external incident. Other presets: Disabled, Rare, Frequent, Chaotic. Exact rates and weights **TBD**.

Event definitions may include ID, eligibility, trigger conditions, weight/probability, race-progress window, cooldown, duration, severity, and affected tiles/segments/lanes.

Example events: debris, escaped animals, spectators on track, surface damage, weather shift, arena interference. Damage generated by racing itself (e.g. a broken wheel leaving debris) is a simulation-generated incident, distinct from random external scheduling.

Hazard placement respects tile occupancy and validity; a hazard cannot materialize inside an occupied RU tile without explicit collision semantics. Moving hazards can use simplified movement behaviors, not full RU AI.

**Event fairness:** Random external incidents should generally be detectable with a reasonable chance to react. Surprise unavoidable harm is exceptional and may be allowed by specifically chaotic competition rules.

## 12.3 AI and crowd

Driver AI perceives and responds to conditions through its existing awareness/utility mechanisms. Drivers differ in caution and risk appetite. **Crowd Influence** is a separate lightweight system affecting morale/performance only, not ordinary direct physical interference. A spectator physically entering the track is an exceptional **Race Event**, not a crowd morale mechanic.

---

# 13. Section 11 — Race Presentation, Commentary & Prototype Tools [APPROVED]

## 13.1 Race viewer and controls

- Top-down Phaser 2D viewer; colored markers/simple sprites are sufficient initially.
- Display RU positions, lanes, overtakes, combat/contact, hazards, stopped units, weather, and player RU identity.
- **Full Track View** default; optional **Follow View** and RU selection.
- Standings panel: classification, progress, gaps when calculable.
- Player RU panel: current/target speed, draft-team fatigue, individual/component condition, driver behavior, active strategy, combat readiness.
- Opponent detail must respect in-game information/visibility restrictions; no automatic exposure of hidden intentions.
- Pause, normal/accelerated playback, optional slow playback; playback speed does not alter simulation outcomes.
- **Strategy Signs may be issued while paused** and take effect at the next valid tick boundary.
- Post-race results, highlights, and stable condition report.

The **commentary feed is as important as the race viewer**, not a minor combat log. Allocate meaningful screen space and maintain readability at accelerated speeds.

## 13.2 Commentary generator

Separate event-driven text module producing energetic **horse-race radio-style play-by-play**. It receives structured authoritative events and may use templates, variation, and contextual phrasing. No runtime LLM is required.

- Distinguish **intent**, **attempt**, and **confirmed outcome**.
- Prioritize Critical (finish/elimination), High (lead change/major attack), Medium (position/hazard), Low (routine maneuver), Background (atmosphere).
- Suppress repetitive trivial events; combine related events into coherent statements.
- Commentary must not invent incidents or announce unconfirmed outcomes.
- Preserve event timing; minor display buffering is acceptable.
- Support post-race highlights derived from logged events.

## 13.3 Strategy Sign UI

Dedicated persistent panel displaying active sign, remaining opportunities, and current driver behavior. Raise/lower/replace interactions obey Section 9.2. The UI must distinguish sign issued, sign active, and what the driver actually chose to do. Signs do not imply guaranteed obedience.

## 13.4 Developer tuning interface — REQUIRED IN INITIAL PROTOTYPE

A dedicated **Developer Tools / Debug Panel**, separate from ordinary player controls, must permit:

- Editing individual beast, chariot, and driver base attributes and condition.
- Adjusting driver personality, AI utility weights, strategy parameters, and relevant decision thresholds.
- Adjusting movement, handling, collision, combat, lethality, weather, track, event, and race-rule parameters.
- Inspecting **derived RU statistics and the modifiers/contributions used to compute them**.
- Saving, loading, resetting, importing, and exporting test configurations.
- **Pre-race edits** applied on race initialization.
- **Selected live debug overrides** while paused, applied at a defined tick boundary.
- Clearly labeling derived-stat overrides so they are not confused with ordinary component-driven mechanics.

Live changes must log target RU/parameter, old value, new value, effective tick, and source (`developer_override`). Some initialization-sensitive parameters may require race restart rather than live edit.

## 13.5 Diagnostic logs — REQUIRED IN INITIAL PROTOTYPE

**Diagnostic logs are separate from player commentary.** Provide:

| Level | Purpose |
|---|---|
| Error | Invalid states, failed actions, broken invariants |
| Warning | Unexpected situations, conflicts, possible deadlocks |
| Info | Race events, attacks, overtakes, damage, eliminations |
| Trace | Full AI scores, movement math, collision resolution, modifiers |

Filter by RU, subsystem, tick/time, severity, and event type. Provide searchable event timeline, selected tick inspection, and **JSON export** with optional human-readable text export.

**Mandatory debugging tools:** pause; single-tick step; state inspector for RU/tile/event; AI decision inspector with candidate utilities and rationale; movement inspector showing intent, actual transitions, conflicts, discarded progress, and speed effects; race-event timeline; reproducible export bundle.

## 13.6 Deterministic scenarios and replay data

Save test scenarios containing initial state/configuration, track, roster, rules, random seed, and any scripted commands. Rerun the same scenario to compare parameter changes. Record game/simulation version, tick-stamped Strategy Sign commands, developer overrides, and structured events. Architect for full race replay; a polished replay viewer is deferred.

**Important:** An altered parameter creates a new test case, even when the original seed is reused; matching seeds do not guarantee the same random draw sequence after behavioral divergence. Compare outcomes using saved seeds and documented configuration differences, not an assumption that every subsequent event will be identical.

---

# 14. Proposed Data Contracts (Illustrative; NOT yet approved schema)

The following interfaces clarify boundaries for implementation. Names and shapes can be revised without changing approved game mechanics.

```ts
type Tick = number;
type RUId = string;
type SegmentId = string;
type LaneId = number;

type TileRef = { segmentId: SegmentId; lane: LaneId };

type RaceConfig = {
  schemaVersion: string;
  seed: string;
  trackId: string;
  raceFormatId: string;
  ruEntries: RUEntryConfig[];
  startingGrid: Record<RUId, TileRef>;
  weatherPresetId: string;
  eventIntensity: 'disabled' | 'rare' | 'occasional' | 'frequent' | 'chaotic';
  lethalityProfileId: string;
  tuningProfileId: string;
};

type SimCommand =
  | { type: 'raiseSign'; ruId: RUId; signId: string; effectiveTick: Tick }
  | { type: 'lowerSign'; ruId: RUId; effectiveTick: Tick }
  | { type: 'developerOverride'; path: string; oldValue: unknown; newValue: unknown; effectiveTick: Tick };

type SimEvent = {
  id: string;
  tick: Tick;
  type: string;
  actorIds: RUId[];
  location?: TileRef;
  payload: Record<string, unknown>;
};

type DiagnosticRecord = {
  tick: Tick;
  level: 'error' | 'warning' | 'info' | 'trace';
  subsystem: string;
  ruId?: RUId;
  message: string;
  details?: Record<string, unknown>;
};
```

**Contract requirements:** versioned JSON, validated IDs and ranges, stable event ordering, no UI-specific objects in simulation state, and sufficient information to reconstruct outcomes. `RUEntryConfig` and exact event payload schemas are **TBD**.

---

# 15. Proposed Simulation Tick Pipeline (Implementation Recommendation)

The exact order of combat, environmental updates, and conflict effects has **not** been numerically specified or separately approved. The following is a coherent starting pipeline to implement and test:

1. Apply queued commands scheduled for this tick (including signs/debug overrides).
2. Apply continuing statuses, environmental state, and event expiration/activation at defined boundaries.
3. Construct each driver's perceived state; calculate utility scores; choose action intents.
4. Validate action readiness, legality, and positional requirements.
5. Update target/current speed and propose incremental movement transitions.
6. Resolve simultaneous tile conflicts and directional contacts deterministically.
7. Resolve eligible attacks, defenses, damage, fatigue, and condition changes in a documented order.
8. Process lap/finish crossings, eliminations, race rules, and event-triggered hazards.
9. Emit authoritative events and diagnostic traces; commit final state and state hash/snapshot as configured.
10. Determine whether another tick is required; publish state to presentation consumers.

**Key implementation decision to test:** If combat and movement affect one another within a tick, define exact substep boundaries so there is no ambiguous “attack before/after moving” behavior. Keep all event ordering deterministic and visible in traces. Do not silently assume the pipeline above is final canon.

---

# 16. Prototype Build Plan (Recommended)

This sequence is a development recommendation, not an additional gameplay approval.

## Milestone A — Core simulation and test harness

- Versioned configuration loader/validator and seeded RNG.
- Track segments/lanes and non-staggered aligned grid.
- RU entities, basic derived stats, fixed ticks, fractional movement, laps/finish.
- Headless race execution and deterministic result checks.
- **Developer config editor, tick stepping, structured logs, export** from the outset.

**Exit criteria:** Two runs with identical inputs yield identical state/results; starting grid and finish classification work; a user can change RU stats without source edits.

## Milestone B — AI, lane maneuvers, and occupancy

- Utility-based AI, pre-race strategies, personality, simple perception.
- Adjacent-lane changes, corner effects, simultaneous movement conflicts.
- Movement inspector and AI utility trace.
- Strategy Sign command interface with three-opportunity rules.

**Exit criteria:** RUs choose lanes and speeds differently by attributes/personality; blocked progress does not accumulate; sign changes are traceable and reproducible.

## Milestone C — Combat, conditions, and events

- Driver attack and defense, basic beast attacks, lateral ram interaction.
- Component targeting/damage, cooldowns/channels, configurable Dangerous lethality.
- Fixed weather, lane-specific traction, optional seeded event scheduler, debris.
- Race eliminations and delayed disabled-RU removal.

**Exit criteria:** Combat and environmental effects produce consistent component and movement outcomes; changing lethality/event settings has measurable effects; no invalid tile occupancy.

## Milestone D — Viewer and commentary

- Phaser top-down track viewer and RU markers.
- Live standings, player RU status, pause/speed, sign panel.
- Priority-based radio commentary from structured events.
- Results/highlights screen.

**Exit criteria:** UI matches simulation state; commentary never claims nonexistent outcomes; paused sign commands take effect at correct ticks.

## Milestone E — Balance and regression suite

- Saved scenarios, fixed-seed batch runs, comparison summaries.
- Export/import diagnostic bundles and state inspections.
- Test cornering, overtakes, collision conflicts, cooldowns, weather, event frequency, finish timing, and eliminations.
- Tune data and formulas; document selected numeric defaults.

**Exit criteria:** Repeatable regression suite; common deadlocks and invalid states are diagnosed; balancing does not require code changes for ordinary stat/parameter edits.

---

# 17. Acceptance Tests and Invariants

## 17.1 Required invariants

1. No two active RUs end a resolved tick in the same tile.
2. Every multi-tile move checks intermediate transitions.
3. Blocked unused movement progress is discarded.
4. Routine lane changes do not incur an automatic speed penalty under favorable conditions.
5. No RU receives a race result solely because of renderer state.
6. Finishing and lap crossings are counted at actual transition times, not only tick endpoints.
7. Lane-length modifiers affect travel, but standings use normalized progress.
8. The start grid is aligned by row, **not lane-staggered**.
9. No Strategy Sign is raised when opportunities are exhausted; lowering is free.
10. Same config + seed + tick-stamped commands + engine version -> same outcomes.
11. Random external incidents are not required every race.
12. Crowd morale effects do not directly manipulate physical occupancy.
13. A race can be run entirely headlessly with no Phaser dependency.
14. Debug overrides are labeled, applied at valid boundaries, and logged.
15. Commentary cannot change simulation outcomes.

## 17.2 Suggested automated test matrix

| Area | Tests |
|---|---|
| Track | Valid connectivity; lane counts; corners; start/finish |
| Occupancy | Contested tile; vacated tile; lane swap; rear-following; multi-tile transitions |
| Movement | Fractional carry; acceleration/braking; blocked-progress loss; corner lane effects |
| AI | Personality sensitivity; strategy changes; sign persistence; awareness limits |
| Combat | Legal arcs; channel cooldowns; defense; component damage; lateral vs rear contact |
| Environment | Fixed weather; lane traction; hazard validity; optional event frequency |
| Results | Lap crossings; fractional finishes; ties; DNF; cutoff; delayed wreck removal |
| Determinism | Seeded replay; command timestamps; stable event ordering |
| Debugging | Editable config; trace filtering; export; paused overrides; one-tick step |
| Presentation | No simulation mutation; event-driven commentary; accurate standings |

## 17.3 Batch balance diagnostics (recommended)

Track finish rates, lap times, overtakes, collisions, attacks attempted/landed, injury rates, fatalities, fatigue trajectories, sign usage, lane occupancy, AI action frequencies, blocked transitions, and environmental incident rates. Compare distributions across controlled configurations, not only individual race outcomes.

---

# 18. Configuration and Tuning Register

**All values below are intentionally unassigned until tuning.** The prototype must expose them in a configuration layer wherever practical.

| Subsystem | Example tunables | Status |
|---|---|---|
| Clock | Tick duration, simulation speed | TBD |
| Track | Segment lengths, lane length modifiers, turn severity | TBD |
| Movement | Acceleration, braking, speed caps, corner penalties | TBD |
| Handling | Maneuver difficulty thresholds, control consequences | TBD |
| Collision | Conflict priority, contact severity, speed loss | TBD |
| Beasts | Stat scales, team aggregation, fatigue rates | TBD |
| Chariot | Weight, rolling efficiency, stability, damage response | TBD |
| Driver AI | Utility weights, awareness, risk, memory, seeded variance | TBD |
| Strategy Signs | Sign catalog, utility influence, upgrade effects | 3 base opportunities approved; remaining TBD |
| Combat | Accuracy, damage, cooldowns, defense, condition thresholds | TBD |
| Lethality | Sporting/Dangerous/Brutal presets and independent knobs | Dangerous default approved; numbers TBD |
| Weather | Traction, wind, visibility, temperature modifiers | TBD |
| Events | Intensity rates, weights, duration, cooldowns, fairness limits | Occasional default approved; numbers TBD |
| Race Rules | Laps, cutoff, disabled removal delay, penalties | Behaviors approved; values TBD |
| Commentary | Priority thresholds, throttling, phrasing templates | TBD |
| Logging | Trace sampling, export size, snapshot cadence | TBD |

---

# 19. Deferred Systems and Integration Boundaries

The full game is a roguelite stable-management experience, but this specification focuses on its race prototype. The following remain future design/implementation tracks:

- **Stable management:** roster, recruitment, training, chariot maintenance, equipment, home-stable selection.
- **Run progression:** race series, between-race events, temporary upgrades that expire at run end.
- **Meta progression:** permanent unlocks/rewards retained between runs.
- **Recovery/economy:** injuries, treatment, repairs, time, currency, and long-term consequences.
- **Expanded races:** elimination, endurance, combat arena, hybrid formats, additional tracks.
- **Expanded mechanics:** dynamic weather, detailed track wear, individual fatigue, advanced moving hazards, more equipment and magic, advanced retirement AI.
- **Presentation polish:** animation, VFX, audio, cinematic highlights, complete replay viewer.

**Integration contract:** The race engine receives validated roster/equipment/configuration and returns authoritative classification, incidents, component condition, and statistics. Campaign systems own economic and progression calculations. Race logic should not import campaign UI or persistence details.

---

# 20. Open Questions for Implementation Review

These are **not objections to approved design**; they identify areas requiring specific numbers or algorithmic choices before coding or during balancing.

1. What units and tick duration will make multi-tile movement, acceleration, and finish interpolation intuitive?
2. What formulas combine individual beasts into team Speed/Power/Agility/Endurance and derive RU attributes?
3. How are movement transitions with exactly equal projected arrival times resolved deterministically?
4. How should lane-change crossing paths be represented without violating one-tile occupancy?
5. At which substeps do attacks occur relative to movement and collisions?
6. What are the initial attack cooldowns, channel compatibility rules, defense costs, and damage thresholds?
7. What initial stat scales and default roster/track size produce readable, competitive races?
8. How are fatigue and morale translated into attribute modifiers?
9. How much advance warning should an average driver receive for each hazard type?
10. What is the default finish cutoff and disabled-RU removal delay?
11. What diagnostic snapshot frequency balances reproducibility and browser memory?
12. Which debug parameters are safe to override live, and which require reinitialization?
13. How are versioned test scenarios migrated when configuration schemas change?
14. Which commentary events are most useful, and how many lines per simulated minute remain readable?

Resolve these through explicit, data-driven prototype choices and tests. Do not silently turn an illustrative number into an approved rule.

---

# 21. Approved Decision Index

| Section | Decision set | Status |
|---|---|---|
| 1 | Segment/lane track geometry; corner direction and relative lane lengths | **Approved** |
| 2 | One RU per tile; intermediate transition checks | **Approved** |
| 3 | Target/current speed; fractional progress; blocked-progress loss | **Approved** |
| 4 | Adjacent lane changes; routine moves without mandatory penalty | **Approved** |
| 5 | Simultaneous movement conflicts; distinct collisions; lateral ramming | **Approved** |
| 6 | Individual beasts and component stats; derived RU performance; team fatigue initially | **Approved** |
| 7 | Utility AI, personality, pre-race strategy, persistent Strategy Signs | **Approved** |
| 8 | Combat channels/cooldowns, component damage, flexible Dangerous lethality | **Approved** |
| 9 | Race lifecycle, aligned non-staggered grid, timing, results, rules | **Approved** |
| 10 | Weather/track/events, optional seeded incidents, fairness, crowd morale | **Approved** |
| 11 | Viewer, prominent commentary, signs, playback, mandatory tuning/debugging | **Approved** |

**Document status:** Ready for design review and conversion into a detailed implementation backlog. No code implementation is claimed by this specification.


---

# Appendix A — Executable Simulation Contract [PROVISIONAL]

**Purpose.** Make the race engine implementable without relying on unstated assumptions. All numeric values and arbitration choices in this appendix are provisional. The engine must allow them to be replaced through versioned configuration. Preserve the approved invariants: headless determinism, single-tile RU occupancy, intermediate-tile checks, no mandatory penalty for ordinary lane changes, no banked blocked movement, aligned starts, lateral rams, and authoritative event logging.

## A.1 Canonical coordinate and clock model

- `tick` is a nonnegative integer. `tickDurationSeconds = 0.20` by default (five ticks per simulated second); the tick duration is immutable during a race.
- `segmentIndex` is an integer in `[0, segmentCount-1]`; `laneIndex` is an integer in `[0, laneCount-1]`, with lane `0` innermost on the reference oval. Track topology is explicit; do not infer connectivity from an array index for future non-ovals.
- A segment represents one **normalized course unit** (NCU) of longitudinal progress, independent of lane. Define `coursePosition = completedLaps * segmentCount + segmentIndex + progressInSegment` where `progressInSegment ∈ [0,1)`; this is the canonical standings coordinate.
- Each `(segment, lane)` has a **physical traversal cost** `segmentMeters * laneLengthMultiplier`. Speed is in meters/second. For a fixed longitudinal fraction `df`, physical distance required is `df * segmentMeters * laneLengthMultiplier`.
- `progressInSegment` is **physical progress converted to longitudinal fraction** in the current lane. When changing lanes within the same segment, preserve the longitudinal fraction, not the previous lane's remaining physical distance; never teleport to a new segment because of a lane change.
- One RU occupies the tile of its current segment and lane; progress within the tile is continuous **for ordering and timing only**, not for collision bodies. An RU cannot end an atomic transition occupying the same tile as another active RU.
- Use fixed-step simulation math, deterministic integer iteration, and stable IDs. Floating point is acceptable for prototype if all calculations use a consistent order and epsilon (default `1e-9`), with snapshot hashes based on canonical serialized numeric rounding (default 1e-8) rather than JavaScript object insertion order.
- A race has a `maxTicks` watchdog (default 6000); exceeding it classifies remaining active RUs as DNF with reason `race_timeout` rather than hanging.

**Important constraint:** The coarse one-RU-per-tile model means two RUs cannot share the same segment/lane even at different longitudinal fractions. This creates spacing effects. For prototype, that is an intentional approximation. Do not introduce sub-tile multi-occupancy to fix congestion without a separate design decision.

## A.2 Atomic movement scheduling

**Recommended implementation:** Each tick contains an ordered sequence of discrete transition events rather than updating all RUs in array order. The scheduler works on a frozen tick-start snapshot plus committed substep changes.

1. Calculate effective stats, speed limits and target speeds from tick-start state, AI intents and environment.
2. Integrate current speed once for the tick: `v1 = clamp(v0 + clamp(vTarget-v0, -brake*dt, accel*dt), 0, effectiveMaxSpeed)`. Default travel budget `meters = (v0+v1)/2 * dt` (trapezoidal integration). Persist `v1` unless later contact changes it.
3. For each RU, convert remaining travel budget into its next segment-boundary arrival fraction. An RU may request at most one adjacent lane change during the tick; the requested lane is evaluated at the first legal transition opportunity (see A.3).
4. Generate candidate **transition intents** `(ruId, fromTile, toTile, projectedFractionOfTick, maneuverType, travelRemaining)`. Sort by projectedFractionOfTick ascending; then stable RU ID only as a deterministic *tie-break*, never as an unconditional advantage.
5. Group transition intents whose projected arrival times are equal within epsilon; resolve them simultaneously using A.4. Resolve any interactions with static/moving hazards and occupied tiles before committing.
6. Commit accepted transitions atomically; update lap crossings and progress. Recompute next transition proposals from remaining distance; repeat until all budgets exhausted or blocked. Cap iterations (`maxTransitionsPerTick`, default 64 per RU) and emit an error on violation.
7. If a transition is blocked, **discard the RU's remaining travel budget for that tick**, set `blockedThisTick = true`, and apply only the conflict outcome's configured speed effect. No hidden progress accumulator is retained from blocked movement.
8. If a RU has insufficient budget to reach its next boundary, advance fractional longitudinal progress by `remainingMeters / (segmentMeters * laneLengthMultiplier)`, consuming budget. Normal fractional position persists to next tick.
9. If a RU finishes the race during an accepted transition, record crossing at `tickStartTime + projectedFractionOfTick * dt` and stop scheduling further movement for that RU if the race format requires it.

**Arrival calculation:** For the next longitudinal boundary, `distanceNeeded = (1-progressInSegment) * segmentMeters * laneLengthMultiplier`. Arrival fraction is cumulative distance spent in this tick divided by integrated tick travel budget. This is a provisional approximation: it assumes uniform distribution of integrated distance within the tick. Use the same convention for every RU and document it in results. A later higher-fidelity integrator must be versioned.

**Zero movement:** If travel budget is zero, no longitudinal transition is proposed. An ordinary lane change may still be allowed at zero speed only if `allowStationaryLaneChange` is explicitly enabled (default false).

## A.3 Lane change semantics

- A normal lane change is a lateral transition between adjacent lanes at the **same longitudinal segment** and preserves `progressInSegment`.
- To avoid ambiguous simultaneous lateral and forward moves, evaluate the lane change as the RU's first atomic transition in the tick, before its first longitudinal boundary crossing. If legal, commit it at a provisional time fraction `0` for purposes of tile occupancy, then calculate remaining longitudinal movement in the new lane. This is an abstraction, **not** a physical instantaneous teleport: visual interpolation may animate laterally over the tick.
- A lane change does not consume travel meters, reduce speed, or add an automatic handling roll under favorable conditions. It still requires a free destination tile or a successful conflict resolution.
- One lane change per tick maximum; requests outside lane bounds or missing connectivity are rejected and logged. A rejected lane change does not automatically cancel forward movement; the AI's fallback is to proceed in the original lane unless the maneuver specifically requested `abortIfBlocked`.
- A difficult lane change can impose a seeded control check and consequences according to tuning. Default difficult conditions: traction below 0.75, effective handling below 40, or current speed above corner safe speed. A failed difficult maneuver stays in original lane and may reduce speed; never bypass occupancy checks.
- Because a lateral move at tick start can conflict with a longitudinal transition, process all tick-start lateral requests together first, resolve swaps/crossings using A.4, then longitudinal scheduling. This ordering is the provisional rule to eliminate cross-phase ambiguity.

**Known approximation:** A lane change at time zero may allow earlier access to the shorter inside path. This is intentional for the first prototype and should be flagged in the decision register for balance testing.

## A.4 Conflict resolution and contact outcomes

Define these conflict types in this precedence order: (1) invalid track connection, (2) static blocking hazard, (3) occupied destination not vacating in this atomic group, (4) same destination contested by multiple movers, (5) reciprocal lane swap / crossing, (6) deliberate lateral ram. A deliberate ram can be resolved together with (3)–(5) but **cannot** bypass occupancy legality.

**Deterministic arbitration policy (provisional):**

- **Vacating destination:** Entering an occupied tile is legal only if the occupant's departure is accepted in the same atomic group or was committed earlier in the tick. Do not assume intended departures succeed.
- **Contested free destination:** Choose priority by earlier projected arrival time. For arrivals tied within epsilon, compare `(maneuverPriority, stabilityScore, seededTieBreaker, ruId)`; default maneuver priorities: continuing forward 2, ordinary lane change 1, deliberate ram 0. Higher stability wins the second comparison. Generate tie-break random values in stable sorted RU-ID order; exact ties fall back to lexicographically smaller ID. All candidates must receive a recorded resolution result.
- **Reciprocal swap:** Reject a simultaneous exchange of tiles in the same atomic group by default (both yield). This avoids passing through each other in the coarse grid. Optional contact may be generated if closing/relative motion meets a threshold.
- **Rear following:** If the tile ahead is occupied and not vacating, the follower yields/brakes. Do not classify this automatically as a damaging collision; contact is separately resolved if the follower cannot avoid it under configured braking/awareness thresholds.
- **Deliberate lateral ram:** Requires adjacent lateral relationship and eligibility under combat/race rules. Resolve contact as an attack-like collision event with target's defense/stability; the attacker's movement still requires a legal destination after contact resolution. Never allow two RUs to end in one tile.
- **Blocking contact:** For a contested tile, default resolution is `yield` with no damage and speed reduced toward `yieldSpeedFactor * priorSpeed` (default 0.75) only when the outcome is `brake`; a clean `yield` can have no speed loss. The contact outcome is selected by explicit thresholds/seeded checks, not by occupancy alone.
- **Deadlock handling:** Maintain per-RU `blockedTicks`. At 20 consecutive blocked ticks emit a warning; at 50 invoke a deterministic safety recovery (`forcedRetire` or `clearWreck` according to rules). Do not move an RU into an occupied tile to resolve deadlock.

**Collision severity prototype:** `impactEnergyIndex = effectiveMass * relativeSpeed^2 / 2`, normalized against configurable `minorImpactEnergy` and `majorImpactEnergy`; add angle, stability and protection modifiers. Default thresholds are in Appendix B. The index is game abstraction, not physical joules. Minor/moderate/major outcomes determine speed and component damage using seeded damage tables. Separate `movement_conflict`, `contact`, `collision_damage`, and `ram_attempt` event types.

## A.5 Tick lifecycle and phase boundaries

The following is the **provisional executable tick order**; it replaces Section 15's ambiguous order for the first implementation only.

| Phase | Action | Reads | Writes | Logging |
|---|---|---|---|---|
| 0 | Validate/apply queued tick commands | commands, prior state | active signs, permitted overrides | command accepted/rejected |
| 1 | Advance statuses, cooldowns, environmental expiration; activate scheduled hazards | prior state, scheduler | statuses, hazards, readiness | event lifecycle |
| 2 | Derive RU stats and perception snapshots | components, conditions | derived stat cache, perceived state | modifiers/perception |
| 3 | AI chooses target speed, lane intent, driver/beast actions and defenses | frozen perceived state | action intents | full utility trace |
| 4 | Validate legal intents and reserve channels | intents, readiness, rules | validated action plans | rejected intents |
| 5 | Resolve **pre-movement** eligible ranged actions only | tick-start positions | damage/status, readiness | attacks/damage |
| 6 | Recompute any affected movement stats; resolve tick-start lateral changes | current state | lane occupancy | lane decisions/conflicts |
| 7 | Integrate speeds and schedule longitudinal movement/contact | current state, budgets | positions, speed, collisions, fatigue-driving inputs | transition traces |
| 8 | Resolve **post-movement** melee, beast and remaining ranged actions | end-of-movement positions | damage/status, cooldowns | attacks/damage |
| 9 | Apply fatigue and late status effects; check elimination, laps, finish and race rules | committed state/events | classifications/results | rule outcomes |
| 10 | Emit ordered events, diagnostics, state hash/snapshot; publish state | complete state | immutable tick result | event log, trace |

**Combat timing policy:** Ranged actions can be configured `preMove` or `postMove`; prototype default ranged `preMove`, melee and beast attacks `postMove`. A planned post-movement attack is revalidated against final positions; if target moved out of range, the action fails as `out_of_range` and does **not** consume its cooldown (configurable). A pre-movement hit can disable a target before it moves; disabled targets receive zero movement budget that tick. Damage from collisions during phase 7 affects subsequent attacks and next tick's movement, but does not retroactively alter already completed transitions.

**Defense:** Passive defense always applies. A defensive reaction may be triggered in phases 5, 7, or 8 if its channel is ready and the perceived threat qualifies. At most one active defense per RU per tick by default; consume defensive cooldown only on actual use. Use deterministic event-ordering to choose among multiple threats.

**Cooldown rule:** At phase 1 decrement remaining cooldown by one tick, minimum zero. A successful action at phase 5/7/8 sets its cooldown to `max(1, configuredCooldownTicks)`. It cannot be used again until a future tick. Disabled actors cannot execute later-phase actions; earlier completed actions remain valid.

**Race result ordering:** For each accepted longitudinal transition, emit a crossing candidate immediately with interpolated time. Phase 9 finalizes classification and tie handling. If multiple RUs cross in the same tick, sort by crossing time, then exact tie policy; do not sort by RU ID to manufacture a winner.

## A.6 Randomness and reproducibility

- Use a documented seeded PRNG (provisional `xoshiro128**` with seed expansion from UTF-8 string via a documented 32-bit hash), and record PRNG implementation/version in exports.
- Prefer **independent named RNG streams** (`ai`, `movement`, `combat`, `events`, `tieBreak`) derived from the race seed. This limits unrelated systems' effect on random sequences; it does not guarantee identical draws after behavioral divergence.
- Within each stream, draw in stable RU ID and event ID order. No `Math.random()` anywhere in simulation code.
- Serialize the canonical state with sorted keys and stable array order; store a hash per tick in Trace mode. If replay hashes diverge, report the first differing tick and path.
- Record accepted/rejected commands and the effective tick; user input time is not authoritative. A paused command targets the next unprocessed tick.
- Never use wall-clock time, Phaser frame delta, DOM order, browser locale, or asynchronous completion order to determine mechanics.

## A.7 Terminal conditions and safety

- `active`: RU eligible to race; `finished`: completed course; `retired`: voluntary/rules withdrawal; `disabled`: cannot continue due to component state; `disqualified`: removed by rules; `dnf`: generic unresolved nonfinish at race cutoff. Store detailed reason separately.
- Default wreck cleanup: remove a disabled RU from occupancy after 10 ticks, but preserve its component state and result. A wreck is a hazard while present. If a wreck blocks the only legal route, cleanup is allowed earlier by a rules-driven safety hook.
- After the winner finishes, allow others 100 ticks to finish (default cutoff). At cutoff, classify unfinished active RUs as DNF with `finish_cutoff` reason. If all remaining RUs are terminal, end immediately.
- Stop on invalid state with a diagnostic error and exportable crash snapshot in developer mode; in normal mode, end race as `simulation_error` rather than looping forever.

---

# Appendix B — Provisional Numerical Baseline and Formulas [PROVISIONAL]

**Design intent:** Provide coherent starting numbers that make the first race run. These are **not approved balance values**. Every value belongs in versioned tuning JSON, not embedded across code. A slider changing a base attribute must cause the dependent derived values to recalculate. Use an inspector to display each contribution.

## B.1 Units, ranges and reference race

| Parameter | Provisional default | Notes |
|---|---:|---|
| Tick duration | 0.20 seconds | 5 ticks/s; immutable mid-race |
| Base stat scale | 0–100 | UI and schema validation; no hidden 1–10 conversion |
| Standard team size | 2 beasts | Other sizes supported by schema; balancing later |
| Oval segments | 48 | 2 straights × 16; 2 corners × 8 |
| Lanes | 4 | lane 0 inner |
| Nominal segment length | 10 m | 480 m normalized lap |
| Laps | 3 | 144 longitudinal segments |
| RUs | 6 | one player, five AI |
| Max ticks | 6000 | watchdog |
| Finish cutoff | 100 ticks | after first finisher |
| Disabled wreck removal | 10 ticks | default delayed removal |
| Strategy Sign opportunities | 3 | **APPROVED** |
| External event intensity | Occasional | **APPROVED** default |
| Lethality profile | Dangerous | **APPROVED** default |
| Race start | Standing, aligned rows | **APPROVED** |

**Physical plausibility caveat:** This is an arcade abstraction. The meter/second unit system aids debugging, not historical chariot realism. If lap times are unsatisfactory, tune speed, length, or lap count rather than adding ad hoc time multipliers.

## B.2 Track configuration

- Oval geometry: segments `0–15` straight; `16–23` left corner; `24–39` straight; `40–47` left corner. Segment 0 begins at the start/finish line. Use explicit connectivity to next segment and legal adjacent lanes.
- Straight lane multipliers: `[1.00, 1.00, 1.00, 1.00]`.
- Corner lane multipliers: `[0.94, 0.98, 1.02, 1.06]`.
- Corner safe-speed multipliers against RU max speed: `[0.72, 0.79, 0.86, 0.93]`. These interact with handling and traction; inner lane is shorter but has lower safe speed.
- Transition segments, if introduced, interpolate between straight/corner modifiers rather than changing them discontinuously.
- Base surface traction `1.00`, roughness `0.00`; example wet traction `0.80`, mud `0.65`, loose debris `0.55`.
- `safeCornerSpeed = maxSpeed * laneCornerFactor * clamp(traction,0.4,1.1) * (0.8+0.2*handling/100)`. AI should usually target at/below safe speed; exceeding it triggers difficult handling checks, not automatic damage.

## B.3 Draft team and derived RU formulas

For each beast `i`, normalize all attributes to `[0,100]`. Let `avg(X)` be arithmetic mean of **active, attached** beasts. A disabled beast remains a component but contributes at a reduced factor (`disabledPullFactor`, default 0.20) until rules force retirement. For first prototype, two-beast teams use simple arithmetic mean, plus a coordination factor; this avoids needing complex harness simulation.

- `coordination = clamp(0.65 + 0.35 * avg(Discipline)/100, 0.65, 1.00)`.
- `teamSpeed = avg(Speed) * coordination`.
- `teamPower = avg(Power) * coordination * sqrt(teamSize / 2)`; capped to 130 for provisional nonstandard team sizes.
- `teamAgility = avg(Agility) * coordination`.
- `teamEndurance = avg(Endurance)`.
- `teamToughness = avg(Toughness)`.
- `teamFatigue` is a single number `[0,100]`, starting at 0; individual beast condition is separate.

Chariot attributes `[0,100]` except `weightKg` and `capacitySlots`; driver skills `[0,100]`. The following give a typical RU approximately 10–16 m/s depending on components:

```text
loadFactor       = clamp(1 - max(0, weightKg - 140) / 600, 0.60, 1.05)
fatigueFactor    = clamp(1 - teamFatigue / 180, 0.45, 1.00)
damageFactor     = clamp(1 - weightedConditionDamage / 180, 0.45, 1.00)
maxSpeedMps      = (5 + 0.12*teamSpeed) * (0.70 + 0.30*rollingEfficiency/100)
                   * loadFactor * fatigueFactor * damageFactor
accelMps2        = (0.6 + 0.025*teamPower) * loadFactor * fatigueFactor
brakeMps2        = (1.2 + 0.018*teamAgility + 0.010*drivingSkill)
                   * clamp(traction, 0.45, 1.10)
handling         = clamp(0.30*teamAgility + 0.25*chariotManeuverability
                   + 0.25*drivingSkill + 0.20*beastHandlingSkill, 0, 100)
stability        = clamp(0.50*chariotStability + 0.20*teamToughness
                   + 0.30*drivingSkill, 0, 100)
endurance        = clamp(0.75*teamEndurance + 0.25*beastHandlingSkill, 0, 100)
```

`weightedConditionDamage` is the weighted average of component damage percentages: draft team 0.50, chariot 0.35, driver 0.15. All multipliers and weights must be editable. `effectiveMass` for collision index uses `weightKg + beastMassEquivalentKg` (default 300 kg per beast) as an abstract tunable.

**Disabled team edge case:** If all attached beasts are disabled or driver is disabled, RU becomes `disabled` immediately; max speed is zero. A disabled chariot also forces RU disablement unless a future rules module permits continuation.

## B.4 Fatigue and exertion

- Team fatigue increases once per tick after movement: `fatigueGain = dt * baseFatiguePerSecond * exertion * (1.2 - endurance/200) * weatherFatigueFactor`.
- Defaults: `baseFatiguePerSecond = 0.15`, `exertion = 0.5 + 0.7 * (currentSpeed/max(1,maxSpeed)) + 0.3 * max(0, acceleration/3)`; clamp exertion to `[0.25,1.5]`.
- When speed is below 35% of max and not accelerating, allow recovery: `fatigue -= dt * 0.08`, minimum 0. No negative fatigue.
- Fatigue affects speed and acceleration via `fatigueFactor`; thresholds for UI: Fresh 0–24, Working 25–49, Tired 50–74, Exhausted 75–100.
- **Avoid circular calculation:** Compute fatigue factor from fatigue at phase 2; apply phase 9 fatigue to next tick's derived stats. Damage in phase 5 can trigger phase 6 stat recomputation, but fatigue does not retroactively change same-tick speed.

## B.5 Handling and control

- Favorable lane change: legal adjacency, free tile, traction ≥ 0.75, handling ≥ 40, speed ≤ safe corner speed. Success without RNG and no speed cost.
- Difficult change: compute `controlScore = handling + 20*(traction-1) - 30*max(0,currentSpeed/safeSpeed-1)`. Success probability `clamp(0.50 + (controlScore-50)/150,0.10,0.95)`.
- On failure: remain in original lane; default speed factor 0.90 and log `handling_failure`. Severe loss of control only when configured for dangerous surfaces or high overspeed; default 5% of failed difficult checks.
- Normal forward travel above safe corner speed uses same control check once per corner entry, not every tick, to avoid repeated punishment. On failure, reduce speed and optionally create contact risk.

## B.6 AI scoring and commitment

**Candidate intent set:** target speed mode `{push, cruise, conserve, brake}`, lane intent `{stay,left,right}`, optional driver action `{none, melee, ranged}`, beast action `{none, naturalAttack}`, defense policy `{normal, guard}`. Filter invalid candidates before scoring. To prevent combinatorial explosion, score speed and lane jointly (maximum 12 combinations) and combat channels separately using the same perceived snapshot.

Score each movement candidate on a 0–100 utility scale:

```text
utility = 30
  + 25*expectedProgressGainNormalized
  + 18*overtakeOpportunity
  - 25*collisionRisk
  - 15*fatigueCost
  - 18*cornerOverspeedRisk
  + personalityAdjustment
  + strategyAdjustment
  + signAdjustment
  + seededNoise
```

All normalized inputs are `[0,1]`; adjustments are additive and data-driven. Initial personality trait ranges `[0,100]`; map `(trait-50)/50` to `[-1,1]`. Suggested adjustments: aggression increases combat utility by up to 12 and reduces perceived contact penalty up to 6; risk tolerance reduces collision penalty up to 8; patience favors conserve by up to 6; competitiveness boosts overtaking up to 8; discipline increases sign compliance up to 25% of sign adjustment. Skills affect success probability, not personality.

- Pre-race strategy: balanced 0; aggressive +8 push/+6 attack; defensive +8 guard/−6 dangerous lane change; endurance +10 conserve; sprint +10 push; opportunistic +8 valid overtake/attack when risk low.
- Seeded noise: uniform `[-2,+2]` utility points per candidate, drawn in stable candidate ID order.
- Commitment: retain chosen lane plan for at least 3 ticks unless a hazard, collision, invalid maneuver, or sign change forces reevaluation. Switching away from an existing valid plan costs 5 utility points.
- Awareness: base `2 + floor(awarenessSkill/25)` longitudinal segments ahead, 1 segment behind, all lanes in the same segment; visibility factor may shrink this. No omniscience. Remember seen hazards for 5 ticks; memory is invalidated by contradictory observation.
- No legal movement candidate: target speed 0, lane stay; still evaluate eligible defense.

**Strategy Sign provisional catalog:**

| Sign | Utility adjustments while active | Other effect |
|---|---|---|
| Push Hard | +18 push; +8 overtake | +15% fatigue gain |
| Defend Position | +16 guard; +8 lane stay when threatened; −8 risky change | No guaranteed avoidance |
| Attack | +22 valid combat action; +8 lateral ram opportunity | Does not bypass cooldown or safety |
| Conserve | +18 conserve; −10 push; −8 unnecessary attack | Reduced exertion through chosen speed |

Signs modify AI preferences, **never directly set speed or perform attacks**. Active sign remains until lowered/replaced; raising costs one opportunity, lowering free. If an active sign is replaced, decrement one opportunity and set the new sign atomically. Reject commands if insufficient opportunities or target is not player's controlled RU. Developer tools may issue explicit test commands to AI RUs with a separate permission flag.

## B.7 Combat baseline

| Parameter | Default | Notes |
|---|---:|---|
| Driver melee range | same segment, adjacent lane | directional arc must allow target |
| Ranged range | up to 3 segments ahead/behind | line of sight and arc |
| Beast natural range | adjacent lane or immediately forward tile | species/weapon eligibility |
| Melee cooldown | 5 ticks | driver channel |
| Ranged cooldown | 8 ticks | driver channel |
| Beast attack cooldown | 7 ticks | beast channel |
| Active defense cooldown | 6 ticks | defense channel |
| Ram cooldown | 10 ticks | movement/contact channel |
| Base attack hit chance | 0.55 | before modifiers |
| Active guard reduction | 0.20 | subtract from hit chance |

Hit probability: `clamp(baseAccuracy + 0.003*(attackerSkill-50) - 0.002*(defenderDriving-50) + positionalBonus - visibilityPenalty - activeGuardPenalty, 0.05, 0.95)`. Resolve one seeded hit roll; on hit roll component target using weapon's weighted target list, then damage. Default damage: melee 8–16, ranged 6–14, beast 7–15, ram 10–25 (uniform integer inclusive), modified by protection and severity. These are **prototype health-point abstractions**, not final combat design.

- Each component has `health/maxHealth`, default max 100; individual beast, driver and chariot tracked separately.
- Condition bands: Functional > 70% health; Damaged 41–70%; Critical 1–40%; Disabled ≤ 0. A damaged component reduces relevant contributions by 10%; critical by 35%; disabled by 80% or triggers RU disablement according to component rules. Thresholds must be tunable.
- Targeting: driver melee favors driver/chariot; ranged may target driver/beast/chariot according to weapon; beast attacks favor adjacent beast/chariot; ram primarily targets chariot with secondary beast risk only on exceptional geometry. Record target selection and why it was legal.
- Defensive reaction: if available and AI elected guard, apply active guard to first eligible attack of tick; consume cooldown. Passive chariot protection subtracts `round(protection/25)` damage, minimum 1 on a hit.
- `Dangerous` profile prototype: on newly disabled beast/driver roll severe injury 25%, fatality 2%; on chariot disablement destruction 15%. Sporting: 8%, 0%, 5%; Brutal: 50%, 10%, 35%. These are **independent configurable probabilities**, not mandatory modes; death applies only to eligible living components and cannot occur twice. Injury is a race outcome marker; recovery/economy remain deferred.
- Driver and beast natural attacks require valid arc and perception. A lateral ram is a separate contact resolution; it must not also trigger a free driver melee attack unless both independent channels are ready and the AI explicitly selected both.

## B.8 Contact, weather, events and race parameters

- `minorImpactEnergy = 5,000`, `majorImpactEnergy = 25,000` (abstract energy-index units); moderate between. `effectiveMass` and relative velocity are as in A.4. For normal lane conflicts, default avoidance probability is `clamp(0.4 + (handling-50)/200 + (awareness-50)/300,0.1,0.9)` when awareness permitted a reaction; contact only on failed avoidance.
- Yield behavior default `noSpeedLoss` on clean avoidance; `brakeFactor = 0.75` when braking required; contact may use `speedAfterImpactFactor = {minor:0.90, moderate:0.70, major:0.40}`.
- Weather presets: clear `(traction=1,visibility=1,fatigue=1)`; rain `(0.80,0.85,1.05)`; storm `(0.65,0.65,1.15)`; heat `(0.95,1.00,1.20)`. Segment surface multiplies weather traction; clamp final traction `[0.4,1.1]`.
- Event intensity per race: disabled 0; rare 0.15; occasional 0.35; frequent 0.75; chaotic 1.50 **expected external events per race**. Draw seeded count from a bounded Poisson-like distribution or documented equivalent; never guarantee one. Limit external events to 3 in initial prototype. Schedule within 15–85% of expected race duration, with at least 20 ticks between events. Event placement must be legal and detectable according to driver perception.
- Initial event types: `debris_spawn` (single free tile, duration 15 ticks), `track_roughness` (one tile traction −0.20 for 20 ticks), `animal_crossing` (simple one-lane-per-3-ticks obstacle for 12 ticks). Spectators and weather changes may remain content examples until their logic is implemented.
- Crowd morale modifier: optional small performance factor `[-0.03,+0.03]`, derived from crowd state; it must never directly alter tile occupancy or create hazards.
- Standard circuit: 3 laps; first eligible finisher wins; other RUs continue up to 100 ticks; finish ties within `1e-6` simulated seconds are recorded as tied unless a league rule explicitly defines tie-breaking.

---

# Appendix C — Data Contracts, Validation and Persistence [PROVISIONAL]

**Rule:** These are concrete starting interfaces. They should compile in TypeScript after project-specific imports are added. Store definitions in JSON, validate at runtime (Zod or equivalent), and reject unknown/invalid references before a race starts. Use `schemaVersion` and `simulationVersion` separately.

```ts
export type Id = string;
export type Tick = number;
export type TileRef = { segmentId: Id; lane: number };
export type ConditionBand = 'functional'|'damaged'|'critical'|'disabled';
export type RaceStatus = 'active'|'finished'|'retired'|'disabled'|'disqualified'|'dnf';
export type VecStats = Record<string, number>;

export interface TrackSegment {
  id: Id; order: number; kind: 'straight'|'corner'|'transition';
  turn: 'none'|'left'|'right'; severity: number; meters: number;
  lanes: Array<{ index: number; lengthMultiplier: number;
    cornerSpeedFactor: number; traction: number; roughness: number;
    next: TileRef; lateralNeighbors: number[] }>;
  startFinishBoundary?: boolean;
  render?: { x: number; y: number; headingRadians: number };
}
export interface TrackDefinition {
  schemaVersion: string; id: Id; name: string;
  segments: TrackSegment[];
}
export interface BeastDefinition {
  id: Id; speciesId: Id; name: string;
  speed: number; power: number; agility: number;
  endurance: number; discipline: number; toughness: number;
  maxHealth: number; currentHealth: number;
  traits: Id[]; naturalAttackIds: Id[];
}
export interface ChariotDefinition {
  id: Id; name: string; weightKg: number; stability: number;
  durability: number; protection: number; rollingEfficiency: number;
  maneuverability: number; capacitySlots: number;
  maxHealth: number; currentHealth: number; equipmentIds: Id[];
}
export interface DriverDefinition {
  id: Id; name: string; driving: number; beastHandling: number;
  combat: number; awareness: number; nerve: number;
  personality: { aggression: number; riskTolerance: number;
    patience: number; competitiveness: number; discipline: number };
  maxHealth: number; currentHealth: number;
}
export interface WeaponDefinition {
  id: Id; name: string; channel: 'driver'|'beast'|'mounted'|'ram';
  rangeSegments: number; allowedArcs: Array<'front'|'side'|'rear'>;
  eligibleTargets: Array<'driver'|'beast'|'chariot'>;
  accuracyBase: number; minDamage: number; maxDamage: number;
  cooldownTicks: number; timing: 'preMove'|'postMove'|'contact';
  targetWeights: Partial<Record<'driver'|'beast'|'chariot',number>>;
}
export interface RUEntryConfig {
  id: Id; name: string; isPlayer: boolean;
  driverId: Id; chariotId: Id; beastIds: Id[];
  preRaceStrategy: 'balanced'|'aggressive'|'defensive'|'endurance'|'sprint'|'opportunistic';
  weaponIds: Id[];
}
export interface RaceRules {
  format: 'circuit'; laps: number; maxTicks: number;
  finishCutoffTicks: number; disabledRemovalTicks: number;
  combatAllowed: boolean; beastTargetingAllowed: boolean;
  maxSignOpportunities: number; allowStationaryLaneChange: boolean;
}
export interface RaceScenario {
  schemaVersion: string; simulationVersion: string;
  id: Id; seed: string; trackId: Id;
  entries: RUEntryConfig[]; startingGrid: Record<Id,TileRef>;
  weatherId: Id; eventIntensity: string; lethalityProfileId: Id;
  rules: RaceRules; tuningProfileId: Id;
  scriptedCommands?: SimCommand[];
}
export type SimCommand =
  | { type:'raiseSign'; ruId:Id; signId:Id; effectiveTick:Tick; commandId:Id }
  | { type:'lowerSign'; ruId:Id; effectiveTick:Tick; commandId:Id }
  | { type:'developerOverride'; path:string; value:unknown;
      effectiveTick:Tick; commandId:Id; reason?:string };
export interface ActionIntent {
  ruId:Id; tick:Tick; targetSpeedMps:number;
  laneDelta:-1|0|1; abortIfBlocked:boolean;
  driverAction?: { type:'none'|'melee'|'ranged'; targetRuId?:Id; weaponId?:Id };
  beastAction?: { type:'none'|'natural'; targetRuId?:Id; weaponId?:Id };
  defensePolicy:'normal'|'guard';
  requestedRamTargetId?:Id;
}
export interface ComponentState { id:Id; health:number; maxHealth:number;
  band:ConditionBand; injuries:Id[]; destroyed:boolean }
export interface RUState {
  id:Id; tile:TileRef; progressInSegment:number; completedLaps:number;
  speedMps:number; targetSpeedMps:number; teamFatigue:number;
  status:RaceStatus; statusReason?:string; blockedTicks:number;
  activeSignId?:Id; signOpportunitiesRemaining:number;
  driver:ComponentState; chariot:ComponentState;
  beasts:ComponentState[]; cooldowns:Record<string,number>;
  aiMemory:{ committedLaneDelta:-1|0|1; commitmentUntilTick:number;
    observedHazards:Array<{id:Id; lastSeenTick:Tick}> };
  derived?: { maxSpeedMps:number; accelMps2:number; brakeMps2:number;
    handling:number; stability:number; endurance:number;
    breakdown:Record<string,number> };
}
export interface RaceState {
  schemaVersion:string; simulationVersion:string; tick:Tick;
  phase:'setup'|'grid'|'running'|'concluding'|'complete'|'error';
  ruStates:Record<Id,RUState>; hazards:HazardState[];
  activeWeatherId:Id; rngStates:Record<string,unknown>;
  firstFinisherTick?:Tick; finishRecords:FinishRecord[];
  commandCursor:number;
}
export interface HazardState { id:Id; type:Id; tile:TileRef;
  createdTick:Tick; expiresTick:Tick; blocksTile:boolean;
  modifiers:Record<string,number> }
export interface FinishRecord { ruId:Id; finishTimeSeconds:number;
  rank?:number; tiedWith?:Id[] }
export interface SimEvent { id:Id; tick:Tick; substep:number;
  type:string; actorIds:Id[]; location?:TileRef;
  payload:Record<string,unknown> }
export interface DiagnosticRecord { tick:Tick; substep:number;
  level:'error'|'warning'|'info'|'trace'; subsystem:string;
  ruId?:Id; message:string; details?:Record<string,unknown> }
export interface RaceResult { scenarioId:Id; simulationVersion:string;
  seed:string; endTick:Tick; entries:Array<{
    ruId:Id; status:RaceStatus; reason?:string;
    rank?:number; finishTimeSeconds?:number; lapsCompleted:number;
    incidents:Id[]; finalComponents:ComponentState[];
    stats:Record<string,number> }>;
  orderedEventIds:Id[]; finalStateHash:string }
```

**Validation rules:** unique IDs; every reference exists; at least one RU; exactly one `isPlayer` RU in interactive scenarios; no duplicate beast/driver/chariot asset assignment unless explicitly enabled for synthetic test fixtures; unique starting tiles; legal grid topology; 1–16 lanes; nonnegative distances; positive segment meters; positive cooldowns; `0 ≤ health ≤ maxHealth`; stats in 0–100; legal weapon timing/channel combinations; no invalid sign IDs; `effectiveTick ≥ currentUnprocessedTick`; no unknown schema version; no NaN/Infinity; stable sorted entry ordering.

**Persistence formats:**

1. `*.scenario.json`: immutable initial content references, seed, rules, tuning profile, scripted commands, schema/version metadata.
2. `*.race-log.json`: scenario hash, accepted/rejected commands, ordered `SimEvent[]`, diagnostics by configured level, final result, optional snapshots and state hashes.
3. `*.snapshot.json`: complete `RaceState` including PRNG stream states and command cursor; load only if simulation version and content hashes match.
4. `*.tuning.json`: named versioned tunable constants with defaults, min/max, units, description, live-edit eligibility.

**Export safety:** Files are local user artifacts; do not upload automatically. Import must validate size, JSON depth, schema and reference integrity. For initial prototype set a configurable 20 MB export limit and warn when Trace logs exceed it. IndexedDB is a convenience store, not the sole copy of important test cases; allow explicit download/upload.

**Command validation:** `developerOverride.path` must be a validated path from a registry of tunables and mutable RU attributes, **not** arbitrary object-path execution. Record both old and new values after validation in the accepted-command log; reject invalid paths or live-ineligible fields. No dynamic code evaluation.

**Schema migration:** Provide `migrateScenario(fromVersion,toVersion)` as pure functions; do not silently rewrite original files. Store migration history and content hashes. If migration is unavailable, reject with actionable error.

---

# Appendix D — Complete Reference Scenario and Test Fixtures [PROVISIONAL]

## D.1 Reference scenario: `oval-six-v1`

- Track: `oval-48-4`, 48 segments × 4 lanes as in B.2, explicit closed-loop connectivity. Start/finish at boundary entering segment 0.
- RUs: six, named `ru-player`, `ru-iron`, `ru-vulture`, `ru-ash`, `ru-bone`, `ru-copper`.
- Starting grid aligned in **rows**, not staggered by lane: row 1 segment 0 lanes 0,1,2,3 assigned `ru-player`, `ru-iron`, `ru-vulture`, `ru-ash`; row 2 segment 47 lanes 1,2 assigned `ru-bone`, `ru-copper`. The rear row is a different longitudinal row, not a lane-distance correction. Every starting tile is unique. If starting at segment 0 triggers an immediate lap-crossing edge case, mark initial `hasCrossedStartLine=false` and count only future forward crossings.
- All entries: two beasts, one chariot, one driver; one driver melee weapon; optionally one ranged weapon on two opponents; natural beast attack on selected entries. No magic.
- Three laps; standing start; seed `BT-OVAL-SIX-001`; clear weather; occasional events; Dangerous lethality; combat legal; player has three Strategy Sign opportunities.
- Fixed track hazards initially none. External event scheduler can generate 0–3 incidents, including no incident.
- For UI, use player blue, opponents distinct colors, but colors are presentation metadata only.

## D.2 Concrete component fixture values

All stat columns are 0–100. Beast values are per beast; two beasts per RU use listed archetype unless noted. All health values start at 100.

| RU | Beast archetype (Speed/Power/Agility/Endurance/Discipline/Toughness) | Chariot (weightKg/stability/protection/rolling/maneuverability) | Driver (driving/handling/combat/awareness/nerve) | Personality aggression/risk | Strategy |
|---|---|---|---|---|---|
| ru-player | Balanced 70/70/65/70/75/65 | 140/65/45/75/70 | 70/70/65/70/70 | 55/55 | balanced |
| ru-iron | Heavy 58/90/48/78/70/85 | 185/85/80/55/45 | 60/65/75/55/80 | 85/75 | aggressive |
| ru-vulture | Fast 90/58/82/55/60/50 | 115/50/25/90/85 | 78/60/65/75/60 | 70/80 | sprint |
| ru-ash | Endurance 67/65/70/92/85/60 | 130/70/40/72/70 | 72/82/55/72/70 | 35/35 | endurance |
| ru-bone | Combat 62/78/55/65/65/78 | 165/75/70/62/58 | 65/65/90/62/85 | 90/85 | aggressive |
| ru-copper | Defensive 68/68/62/75/88/75 | 150/88/85/65/62 | 75/78/58/80/80 | 30/25 | defensive |

**Fixture clarification:** The driver column's second value is **Beast Handling** (not a new `handling` driver skill); the header is a compact label. `durability=70`, `capacitySlots=2`, and all unlisted beast/chariot/driver attributes use explicitly versioned default values in the fixture generator. Do not silently fill missing fixture fields at runtime without validated defaults.

## D.3 Suggested reference equipment

| ID | Channel | Arc | Range | Damage | Cooldown | Timing |
|---|---|---|---|---|---|---|
| `short-sword` | driver | side | same segment/adjacent lane | 8–16 | 5 | postMove |
| `short-bow` | driver | front/rear | 3 segments | 6–14 | 8 | preMove |
| `beast-gore` | beast | front/side | adjacent tile | 7–15 | 7 | postMove |
| `side-ram` | ram | side | adjacent lane | 10–25 | 10 | contact |

**Important:** `rangeSegments=0` for same-segment melee, and range evaluation for beasts uses a specific `adjacent` target predicate, not merely numeric distance. The `WeaponDefinition` should gain `rangeMode` (`sameSegmentAdjacentLane` / `forwardTile` / `segmentDistance`) if needed; this is a documented schema extension rather than implicit special casing.

## D.4 Golden tests and adversarial fixtures

Create a deterministic fixture for each case below. A golden test compares canonical state hashes/results **within the same simulation version**; do not hardcode an expected winner before the implementation is stabilized.

1. **Empty track movement:** one RU accelerates, crosses multiple segments in one tick when speed permits; fractional remainder persists.
2. **Blocked progress:** fast RU blocked by stationary RU; no travel budget stored for next tick.
3. **Vacated tile:** follower enters a tile vacated in the same accepted atomic transition group.
4. **Contested tile:** two RUs request same free tile; exactly one succeeds unless a specified alternate conflict result is implemented; order-independent.
5. **Lane swap:** reciprocal adjacent-lane swap denied under default policy, no overlapping occupancy.
6. **Corner tradeoff:** compare identical RUs on inside/outside; inside path shorter, outside safe speed higher; no forced winner claim.
7. **No-stagger start:** all front-row grid positions have identical longitudinal coordinate; no per-lane offsets.
8. **Routine maneuver:** favorable adjacent lane change succeeds with no automatic speed penalty.
9. **Difficult maneuver:** seeded control check and recorded outcome; same seed gives same result.
10. **Melee range:** same-segment side target eligible; nonadjacent or wrong arc rejected.
11. **Ranged pre-move disable:** a disabled RU cannot move later in same tick.
12. **Post-move target escape:** revalidation cancels melee without consuming cooldown by default.
13. **Ram:** lateral eligible, rear-end routine ram invalid; occupancy remains legal.
14. **Fatigue:** fatigue increases under exertion and changes next-tick derived performance.
15. **Damage bands:** thresholds correctly change contribution; disabled driver/team/chariot ends RU eligibility.
16. **Signs:** raise consumes, lower free, replace consumes, no opportunity below zero; paused commands apply next tick.
17. **Event absence:** with disabled event intensity, no external random event occurs; with occasional, some seeds yield zero events.
18. **Hazard fairness:** no hazard spawns on an occupied tile unless explicit contact semantics permit it.
19. **Wreck removal:** disabled RU occupies tile temporarily then clears on scheduled tick.
20. **Finish interpolation:** two RUs crossing in same tick ordered by fractional crossing time; exact ties remain ties.
21. **Replay determinism:** same seed/config/commands/version yields identical hashes/events/results under normal, accelerated, and headless playback.
22. **Input order invariance:** reorder RU definitions and unrelated UI elements; results identical if IDs and configuration unchanged.
23. **Developer override:** accepted live edit changes only registered field at effective tick; event includes old/new; replay reproduces it.
24. **Crash capture:** invariant violation produces diagnostic bundle, not infinite loop.
25. **Batch smoke:** 1,000 seeded headless races terminate, with zero duplicate occupancy, invalid references, or nonfinite numbers.

## D.5 Quantitative balancing reports

Produce a per-run CSV/JSON summary and batch aggregates: finish rate, DNF reason distribution, lap time median/p10/p90, overtakes, attacks attempted/hit, ram attempts, collisions, fatalities, average/max fatigue, time spent in each lane, blocked transitions, event count, and sign effect comparisons. Report seed list and tuning profile hash. Do not mistake single-seed outcome changes for statistically meaningful balance improvements.

---

# Appendix E — Development Workflow, Decision Register and Review Gates [PROVISIONAL]

## E.1 Source-of-truth rules for an independent coding thread

1. Read this complete specification before writing mechanics. Treat Sections 1–11 as approved requirements; Appendices A–F as **provisional implementation baselines**.
2. Do not replace approved rules with conventional racing-game assumptions. In particular: do not add staggered starts, continuous collision bodies, mandatory lane-change speed loss, universal action points, always-damaging collisions, rear-end ramming as the normal tactic, or guaranteed Strategy Sign obedience.
3. Implement one milestone at a time. Run automated tests and provide a concise change summary, decisions made, test results, and known limitations after each milestone.
4. When a value is provisional, put it in configuration. When a decision affects approved gameplay behavior, **ask for user approval before changing it**. Technical refactoring that preserves behavior need not be approved.
5. Avoid scope creep: no campaign economy, detailed recovery, elaborate art, networking, multiplayer, or runtime LLM without an explicit request.
6. Keep deterministic engine code free of Phaser/DOM/IndexedDB imports. The presentation subscribes to snapshots/events; developer UI submits validated commands.
7. Record all changes to formulas, order-of-operations, or event semantics in a changelog with simulation version bump and regression tests.
8. Keep stable IDs and versioned schemas; do not silently mutate user scenarios on load.

## E.2 Decision register template

Maintain `docs/implementation-decisions.md` with this table:

| ID | Topic | Status | Current choice | Rationale | Config path / module | Tests | Approval date |
|---|---|---|---|---|---|---|---|
| D-001 | Aligned standing grid | APPROVED | Same longitudinal coordinate across lanes per row | Meaningful lane choice | rules/grid | no-stagger | 2026-11-10 |
| D-002 | Tick duration | PROVISIONAL | 0.20 s | Readable discrete steps | tuning/clock | timing | — |
| D-003 | Lane change scheduling | PROVISIONAL | Tick-start lateral substep | Deterministic first pass | movement/lane | swap/contested | — |
| D-004 | Combat phase order | PROVISIONAL | PreMove ranged; PostMove melee/beast | Explicit interactions | combat/pipeline | pre/post move | — |
| D-005 | Beast aggregation | PROVISIONAL | Mean × coordination | Simple tunable baseline | entities/derive | stat derivation | — |
| D-006 | Full campaign economy | DEFERRED | No implementation | Outside race prototype | campaign interface | none | — |

Each entry should record superseding decisions instead of overwriting history. An implementation change is not automatically a user-approved design decision.

## E.3 Milestone gate requirements

**Gate 0 — Repo skeleton:** `npm install`, `npm run dev`, `npm run test`, `npm run build`, `npm run lint` all work; minimal headless `runRace()` executes in Node without Phaser. Define package versions and commit lockfile.

**Gate A — Core movement:** scenario loads and validates; RU positions/laps/finish work; config editor changes stats; trace export and tick step work. Tests D.4 items 1,2,7,20,21 pass.

**Gate B — AI and conflicts:** AI utility traces, lane decisions, simultaneous arbitration, signs and perception work. Tests 3–9,16,22 pass. No duplicate tile occupancy in 1,000 seeded races.

**Gate C — Combat/environment:** attacks, damage, defense, lateral ram, weather, events, delayed wrecks and results work. Tests 10–15,17–19 pass.

**Gate D — Presentation:** viewer shows authoritative state, commentary derived from events, controls and debug panel integrated. Paused signs and playback speed preserve deterministic results. No presentation imports in simulation.

**Gate E — Balance/regression:** fixture suite, seeded batch runner, first-divergence inspector, export/import and documentation complete. Tests 21–25 pass; all provisional values documented in tuning register.

## E.4 Definition of done for each mechanic

A mechanic is not complete until it has: (a) validated configuration; (b) deterministic pure or controlled-state implementation; (c) structured events; (d) Trace diagnostics with inputs/modifiers/outputs; (e) unit/integration tests including edge cases; (f) UI inspector access where relevant; (g) documentation of provisional values and limitations.

## E.5 Required developer UX

- A persistent **Developer** tab separate from player controls, with subpanels `Scenario`, `RUs`, `AI`, `Movement`, `Combat`, `Environment`, `Rules`, `Logs`, `Comparison`.
- Pre-race editor for every stat and tuning value with units, allowed range, reset-to-default, and derived-value preview. Support JSON export/import.
- Live edit only while paused, through registered command paths. Show effective tick and label overrides in UI and export.
- Tick stepping, play/pause, 1×/2×/4× presentation, and optional 0.5×. Playback does not change simulation dt.
- Log filtering by tick range, RU ID, subsystem, severity and event type; text search; event detail JSON; selected-tick state inspector.
- AI inspector shows perceived objects, rejected candidates, utility components, chosen intent and resolved outcome. Movement inspector shows budgets, transition queue, conflicts, discarded progress and resulting speed.
- First-divergence comparison between two compatible runs: compare state hashes, find earliest mismatch, display changed paths and relevant events. If simulation versions differ, label comparison as noncanonical.
- Crash snapshot export with scenario, command history, last valid state, invariant failure, and diagnostic tail. Protect against unbounded memory by configurable trace ring buffer plus optional full export.

## E.6 Coding-agent handoff prompt (copyable)

> Implement **Blood and Thunder** as a browser-first TypeScript/Vite/Phaser prototype with a fully headless deterministic simulation. The attached specification is the only authoritative design source. Approved gameplay is in Sections 1–11. Appendices A–F supply **provisional, configurable** engineering choices; do not present them as approved canon. Start with Gate 0, then Gate A; do not implement later milestones without review. Keep a decision register and versioned JSON schemas. Every mechanic requires structured logs, deterministic tests, and inspector visibility. Never invent or silently change an approved rule. Report test results and any ambiguities before advancing.

---

# Appendix F — Integration Edges, Error Handling, and Operational Details [PROVISIONAL]

## F.1 Runtime interfaces

```ts
interface SimulationEngine {
  initialize(scenario: RaceScenario, definitions: ContentRegistry): RaceState;
  submit(command: SimCommand): { accepted: boolean; reason?: string; effectiveTick?: number };
  step(): { state: Readonly<RaceState>; events: readonly SimEvent[];
    diagnostics: readonly DiagnosticRecord[]; stateHash: string };
  runUntil(predicate: (state: Readonly<RaceState>) => boolean,
    maxSteps: number): RaceResult | null;
  exportSnapshot(): string;
}
interface ContentRegistry {
  tracks: Record<Id,TrackDefinition>; beasts: Record<Id,BeastDefinition>;
  chariots: Record<Id,ChariotDefinition>; drivers: Record<Id,DriverDefinition>;
  weapons: Record<Id,WeaponDefinition>;
  tuningProfiles: Record<Id,Record<string,number>>;
}
interface PresentationAdapter {
  onTick(state: Readonly<RaceState>, events: readonly SimEvent[]): void;
  onResult(result: Readonly<RaceResult>): void;
}
```

`Readonly<T>` in TypeScript is shallow; enforce runtime immutability at the boundary using cloned/immutable snapshots or a deep-readonly type. The simulation engine owns the only mutable state. Renderers should interpolate between snapshots visually without feeding interpolated coordinates back into mechanics.

## F.2 Explicit event taxonomy

Recommended stable event types: `race_started`, `command_accepted`, `command_rejected`, `sign_raised`, `sign_lowered`, `ai_intent`, `lane_change_attempt`, `lane_change_resolved`, `movement_transition`, `movement_blocked`, `contact`, `ram_attempt`, `attack_attempt`, `attack_hit`, `attack_miss`, `defense_used`, `component_damaged`, `component_disabled`, `hazard_spawned`, `hazard_expired`, `lap_crossed`, `position_changed`, `ru_retired`, `ru_disqualified`, `ru_finished`, `race_finished`, `developer_override`, `invariant_violation`. Include `tick`, `substep`, stable event ID and actors. Commentary consumes only suitable confirmed events and may combine them; debug logs preserve granular events.

**Event ordering:** event ID format `tick:substep:sequence` where `sequence` increments deterministically within each substep. An event's causal predecessors may be stored as `causedByEventIds`. Use event schemas for important event types rather than unrestricted `payload` forever; `Record<string,unknown>` is a transition stage.

## F.3 Track topology and position calculation

- For a closed oval, next segment is `(index+1) % segmentCount` in the same lane. Lateral neighbors are `lane±1` where valid. Explicit next references remain mandatory for future tracks.
- A finish crossing occurs on a forward transition from last segment to first segment. At race initialization, starting on segment 0 does **not** count as a crossing. `completedLaps` increments only on accepted forward boundary transitions.
- For an RU on a rear starting row at segment 47, its first transition into segment 0 crosses the starting line but must **not** complete a lap. Track `hasStartedLap` or an equivalent start-line crossing count per RU: first crossing after grid start is race start for rear-row entrants, subsequent crossings count laps. Front-row entrants already begin at start line and complete a lap on their first full wrap. This avoids crediting a rear-row RU with a lap after moving only one segment.
- Better unified approach: store `initialUnwrappedCoursePosition` and `distanceSinceStartInNCU` for each RU. `completedLaps = floor(distanceSinceStartInNCU / segmentCount)` for full laps, while **official race finish** is based on crossing the shared physical finish boundary after completing the required number of whole laps. Because rear rows begin behind the line, they must cross the line to start the first lap. Implement explicit `startLineCrossings` and derive finish eligibility from `crossingsRequired` set by grid row; do not mix raw segment index with official laps.
- **Design review flag:** The exact start-line accounting for rear rows is not approved and should be validated against expected standing-grid racing behavior before locking the results system. A simple safe prototype alternative is to place all six RUs in two aligned rows on distinct *pre-start staging segments*, with timing beginning at the common start signal and counting physical line crossings consistently. This would require an explicit staging-grid topology.

## F.4 Nonblocking errors and UI feedback

- Invalid scenario: refuse start, show all validation errors with paths.
- Invalid live override: reject command, keep state unchanged, log reason.
- Invalid AI action: fall back to legal safe action and log at Warning/Trace; never crash solely because an AI chose an unavailable attack.
- Invariant violation: halt headless run, emit crash bundle, surface error prominently in developer UI.
- Excessive log volume: use bounded ring buffer (default 50,000 records) with clear dropped-record count; optional streaming export for full traces.
- Save failure: keep race running, show warning, allow manual export; persistence cannot modify simulation outcomes.
- Replay mismatch: show earliest differing tick, relevant state paths and version/config hash mismatch; never claim exact replay if versions differ.

## F.5 Deferred hooks without premature implementation

Define interfaces (not complete features) for campaign reward handoff, equipment modifiers, alternative race formats, dynamic weather, magic abilities, moving obstacles and long-term injuries. A hook must have a named input/output and deterministic invocation boundary. Do not implement speculative systems simply because the architecture permits them.

## F.6 Final pre-coding review checklist

- [ ] Confirm the provisional tick pipeline and combat timing (A.5).
- [ ] Confirm the coarse-grid lane change semantics and swap policy (A.3–A.4).
- [ ] Confirm the rear-row start-line/lap accounting approach (F.3).
- [ ] Confirm initial stat scale and formula families (B.3–B.7).
- [ ] Confirm whether two beasts per RU and six RUs are acceptable first fixtures (B.1, D.1).
- [ ] Confirm initial sign catalog/effects (B.6).
- [ ] Confirm event and lethality numerical defaults (B.7–B.8).
- [ ] Confirm versioned schemas and runtime validation (C).
- [ ] Confirm developer tools are required at Gate A, not deferred to presentation milestone (E).
- [ ] Confirm that all unresolved choices remain marked PROVISIONAL until explicitly approved.

**Bottom line:** This v0.2 document is detailed enough for an AI coding thread to scaffold the project and implement a configurable, testable first pass, while exposing exactly which mechanics are approved and which are engineering assumptions. The flagged issues—particularly tick order, lane arbitration and rear-row lap accounting—should be reviewed before treating the implementation as stable game rules.
