# Blood and Thunder — Game Vision and Overall Structure

**Document type:** Project-wide design and development guide  
**Version:** 1.0 — 2026-11-13  
**Purpose:** Define what Blood and Thunder is, how its major systems fit together, and the principles that should guide future design and implementation.  
**Status:** Vision and structure guide. This is **not** a complete mechanics specification, numerical balance sheet, or declaration that future systems are already implemented.

## 1. Executive concept

**Blood and Thunder is a fantasy chariot-racing roguelite with auto-battler mechanics and stable management.** The player owns and manages a racing stable rather than directly driving a chariot. They recruit and develop drivers and draft beasts, maintain and configure chariots, choose equipment and tactics, enter competitions, and contend with the consequences of each race.

Races are primarily **autonomous simulations**. Drivers make their own moment-to-moment decisions based on their abilities, personalities, the team they are driving, conditions, opponents, and the player's preparation. The player has limited but meaningful tactical influence through **Strategy Signs**. The intended experience combines the anticipation of motorsport, the unpredictability of fantasy chariot combat, the planning of a management game, and the adaptation and risk of a roguelite.

The game is about **building a competitive stable, making consequential choices, and watching those choices play out in races that tell their own stories**. The central question is not whether the player can steer skillfully; it is whether they have assembled, prepared, and directed a team capable of succeeding under uncertain conditions.

### Design pillars

1. **Management over reflexes.** Success comes primarily from roster construction, preparation, strategy, development, and risk management—not manual steering or action combat.
2. **Autonomous competitors with character.** Drivers and teams should behave differently for understandable reasons. A driver's judgment and personality matter alongside raw statistics.
3. **Meaningful, legible simulation.** Positioning, speed, fatigue, handling, collisions, combat, conditions, and results follow consistent rules. Outcomes should be explainable through data and events.
4. **Limited but consequential intervention.** Strategy Signs can redirect the race without turning it into direct control. Their influence must be noticeable but not guaranteed.
5. **Runs with escalating choices and consequences.** A sequence of races and inter-race decisions creates a roguelite arc; the home stable provides continuity across runs.
6. **Emergent racing drama.** Overtakes, breakdowns, gambles, crashes, rivalries, and unexpected results should arise from the simulation and be communicated clearly.
7. **Mechanics first, visuals in service of clarity.** Build reliable, tunable systems before investing heavily in presentation polish.

## 2. Setting and identity

Blood and Thunder takes place in a **fantasy racing world**, not a strictly historical Roman recreation. The sport features chariots drawn by a range of beasts, drivers with distinctive talents and temperaments, varied equipment, and potentially magical gear. Combat can be part of the spectacle, but not every event permits deliberate violence.

The setting should support a variety of competitors, stables, venues, racing traditions, and equipment without requiring a particular lore or campaign structure at the outset. Its tone can be rough, dangerous, competitive, and colorful; the game should derive much of its personality from the competitors and what happens on the track.

**Not yet established as final:** specific nations, factions, leagues, currencies, magic systems, named characters, venue catalogs, and world history. These are future content-design decisions, not assumptions for the simulation engine.

## 3. The player's role

The player is a **stable owner/manager**. They are responsible for building and maintaining a roster, selecting a race entry, deciding how resources are spent, and setting tactical priorities. They enter **one Racing Unit (RU) per race**, even if their permanent stable contains multiple possible teams and configurations.

### Player decisions by phase

| Phase | Main player responsibilities |
|---|---|
| Home stable | Maintain the long-term roster and inventory; plan development and investment; choose what to bring into a run |
| Run preparation | Select a driver, draft beasts, chariot, and available equipment; assess risks and choose a competition strategy |
| Pre-race | Review track, weather, event rules, opposition, and the chosen RU; set the opening tactical instruction |
| Race | Observe the simulation; use a limited number of Strategy Signs; decide when to keep, replace, or lower instructions |
| Post-race | Review classification, performance, injuries/damage, rewards, and consequences |
| Between races | Respond to events, make upgrades or repairs, manage resources, and prepare for the next race |
| End of run | Resolve the run outcome; retain applicable permanent rewards and consequences; discard run-only improvements |

The player's **agency should be front-loaded into preparation**, reinforced by a small number of strategic choices during the race, and tested through consequences afterward.

## 4. Core game loop

```text
PERMANENT HOME STABLE
  Maintain roster, chariots, beasts, inventory, long-term progression
                       |
                       v
START A RUN / CHOOSE A RACING SETUP
  Select one RU and commit available resources
                       |
                       v
PRE-RACE PREPARATION
  Review event rules, track, conditions, rivals; configure tactics
                       |
                       v
AUTONOMOUS RACE
  Simulation runs; player observes and queues limited Strategy Signs
                       |
                       v
RACE RESULTS AND CONSEQUENCES
  Placement, rewards, damage, fatigue, injuries, performance analysis
                       |
             +---------+---------+
             |                   |
       MORE RACES           RUN COMPLETE
             |                   |
             v                   v
   BETWEEN-RACE EVENT     META PROGRESSION
   Repair / upgrade /     Keep permanent gains,
   choose / adapt         resolve lasting effects
             |                   |
             +--> NEXT RACE      +--> HOME STABLE
```

The **race** is the main dramatic payoff; the **stable and run** provide the decisions that make each race matter. Neither should be developed in isolation from the other.

## 5. Racing Unit: the fundamental competitor

An **RU** is the combined on-track competitor: **driver + chariot + draft beasts**, with associated equipment, condition, and temporary modifiers. An RU is not a single character statistic or a vehicle sprite. It is a collection of components whose strengths, weaknesses, and damage states interact.

### Core components

**Draft beasts.** Individual beasts have attributes for **Speed, Power, Agility, Endurance, Discipline, and Toughness**. They contribute to acceleration, sustainable pace, maneuverability, responsiveness, and survivability. Beast condition and injury should matter; individual beast damage is distinct from the team's shared fatigue model used in the prototype.

**Chariot.** Chariot attributes include **Weight, Stability, Durability, Protection, Rolling Efficiency, Maneuverability, and Capacity**. Different builds should create tradeoffs among speed, handling, resilience, and combat capability.

**Driver.** Driver attributes include **Driving, Beast Handling, Combat, Awareness, and Nerve**. The driver also has a behavioral profile/personality and tactical tendencies. Skill and temperament should affect decisions as well as outcomes.

**Equipment and modifications.** The broader game should support equipment, upgrades, and potentially magic that alter RU performance and tactical options. Exact item catalogs, slots, crafting, and acquisition rules remain to be designed.

### Development objective

Avoid a single universally optimal build. Fast teams should face tradeoffs; durable teams should sacrifice something; aggressive drivers should create different opportunities and risks than cautious drivers. The same RU may perform differently on different tracks, in different conditions, and under different event rules.

## 6. Race formats and competition rules

The v0.3 design introduces **two configurable race formats**, sharing one underlying race engine:

### Combat Racing

Deliberate attacks and offensive ramming are legal. AI may select combat actions, component damage and disablement can affect outcomes, and racing position still matters. Combat should create strategic tradeoffs rather than replace the race with an arena battle.

### Pure Racing

Deliberate attacks and offensive ramming are prohibited. The focus is speed, overtaking, handling, positioning, and endurance. **Incidental contact is still possible**, and normal collision consequences may apply. Track hazards, weather, fatigue, and racing risk remain relevant. Pure Racing is not a collision-free mode.

Both formats should share track geometry, movement, occupancy, classification, fatigue, and environmental systems. Rule differences should be expressed as validated event/race configuration, not duplicated engines. Future leagues or special events may vary rules, but additional formats are **not yet approved**.

## 7. The race simulation

The race engine is the mechanical heart of the game. It must run independently of the user interface and visual renderer, produce reproducible results from the same configuration/seed/commands, and expose sufficient state and events to explain what happened.

### Track and movement

The approved prototype uses track **segments and lanes** with lane-dependent travel effects, corner direction/severity, and discrete spatial occupancy. Each RU occupies one `(segment, lane)` tile at a time. Movement includes speed, acceleration, braking, fractional progress, lane selection, and intermediate occupancy checks when advancing through multiple tiles. Conflicting simultaneous movement intentions are arbitrated deterministically; movement conflict is distinguished from physical contact and resulting damage.

The initial reference track is a **four-lane oval**; the architecture should support additional layouts. Geometry and lane selection should matter to overtaking and tactics, not merely decorate the race.

### Driver autonomy

Drivers use a **utility-based AI** informed by perceived race conditions, skills, personality, strategy, and short-term decision context. Their decisions may include pace selection, lane changes, passing, defending position, and—when permitted—offensive actions. Drivers are not perfect optimizers, but their behavior should be coherent enough for players to recognize patterns and make informed decisions.

### Contact, combat, and damage

The simulation distinguishes ordinary movement conflict, incidental collision, and deliberate offensive action. Chariot rams are principally **lateral engagements**, not conventional rear-end vehicle rams, because draft beasts lead the chariot. Combat can target different RU components and produce consequences such as reduced performance or disablement. Combat permissions depend on the race format.

### Conditions and events

Weather, surface/track conditions, fatigue, and occasional external race events can change race behavior. Examples include debris, animals, or spectators entering the course. Not every race must have a random incident. The crowd may affect morale or performance but should not directly interfere with competitors.

### Race lifecycle and results

The race has a standing, **non-staggered aligned grid**, a shared race clock, lap accounting, ordered standings, fractional-tick finishing where appropriate, and a final classification. A rear-row RU's first crossing of the start/finish line begins lap 1 rather than crediting a completed lap. A disabled RU is normally removed after a delay rather than vanishing instantly. Results should communicate not only placement but also why the race unfolded as it did.

### Determinism and observability

The engine should support seed-controlled race reproduction, headless batch simulation, input replay, structured event logs, state inspection, and test scenarios. Reproducibility is essential for debugging and balancing; it is not a guarantee that every existing mechanic is already correct.

## 8. Strategy Signs: limited in-race control

Strategy Signs are the player's primary direct intervention during a race. They represent a manager holding up tactical instructions to the passing driver, **not direct steering or guaranteed obedience**.

### Approved v0.3 behavior

- The baseline allowance is **three raises/replacements per race**, adjustable through authorized tuning or upgrades/events where applicable.
- The player can **queue** a sign at any time; it enters a **Pending** state.
- The pending sign becomes **Active when the player's RU next crosses the start/finish line**.
- A sign queued before the start becomes active at the starting signal.
- The currently active sign remains in effect until lowered or until a queued replacement activates; queuing a replacement does **not** cancel the old sign immediately.
- Lowering the active sign is **free and immediate**.
- An active sign influences the driver's autonomous AI and persists until changed; it is not a one-tick command.
- Sign influence should be **noticeable**, with configurable global and per-sign strength and diagnostic visibility into AI response.

This creates a deliberate rhythm: observe the current lap, decide on an instruction, and see it take effect at the next pass. The exact sign catalog and balance coefficients belong in the mechanics/configuration documents, not this vision guide.

## 9. The run: roguelite structure

A **run** consists of a series of races separated by events and opportunities to adapt. The player begins with a setup selected from the permanent home stable and tries to progress through the series while managing performance, damage, fatigue, resources, and uncertain opportunities.

### Two progression layers

**Run-specific progression:** Temporary upgrades, event outcomes, situational resources, and other advantages or liabilities that shape the current series. Temporary improvements expire when the run ends.

**Permanent progression:** The stable, roster, available assets, and lasting rewards or consequences that carry into later runs. Permanent gains should expand choices and strategic possibilities, rather than simply erase all risk.

### Between-race decisions

The inter-race phase should provide meaningful choices about repair, recovery, equipment, team composition where permitted, temporary improvements, and event responses. These decisions should create tradeoffs: spending to survive the next race may reduce resources for later; chasing speed may increase vulnerability; preserving valuable assets may be wiser than pursuing a risky result.

### Still to be designed

The exact number of races per run, event-generation structure, progression currencies, reward economy, shop systems, injury and recovery rules, asset loss/permadeath policy, unlocks, run failure conditions, and long-term campaign objectives are **open design areas**. Do not silently treat any one implementation as established canon.

## 10. The home stable: long-term management

The permanent home stable is the player's strategic base and persistent identity. It should eventually provide ways to:

- Maintain multiple drivers, beasts, and chariots while entering only one RU per race.
- Assemble and compare different RU configurations.
- Manage condition, repairs, recovery, and readiness.
- Store equipment and select upgrades or loadouts.
- Track results, development, and potentially reputations or rivalries.
- Choose a setup for a new run and assess the cost of committing valuable assets.

**Home stable locations or base options** are part of the intended design space; their mechanics and effects are not yet finalized. Stable management should have meaningful consequences for racing rather than becoming a disconnected menu of upgrades.

## 11. Player experience and presentation

The race is **watched and managed**, not driven. The presentation must make an autonomous contest exciting and intelligible.

### Race viewer

The initial implementation is a **browser-based, 2D top-down Phaser viewer**. It should clearly display RU positions, movement, lane changes, relative standing, important condition changes, pending/active signs, and significant race events. Visual fidelity can increase later, but must never become the source of authoritative game rules.

### Commentary

A prominent, scrolling **radio-style race commentary** channel—evoking a horse-race announcer—translates authoritative simulation events into readable drama. Commentary should prioritize starts, passes, attacks, crashes, critical damage, strategy changes, and finishes. It must not invent events that the simulation did not report.

### Feedback and explanation

Players should understand what they tried to accomplish, what their driver actually did, and why. The interface should show relevant tactical state, team condition, event rules, and results without requiring the player to study raw debug data. Richer performance summaries and race histories can make the management loop more compelling over time.

### Accessibility and pacing

Pause, step, and playback-speed controls are valuable for prototype inspection and player comprehension. A full accessibility specification, spectator features, and final UI design remain future work.

## 12. Technical architecture and boundaries

The project is **browser-first**, built in **TypeScript**, with **Phaser** used for race rendering. The simulation is **headless** and separate from both rendering and the future management interface. A possible desktop version is a long-term option, not an initial constraint.

```text
HOME STABLE / MANAGEMENT UI
            |
            v
CAMPAIGN AND RUN SYSTEMS
  roster • equipment • economy • events • progression • persistence
            |
            v
RACE SETUP / VALIDATED CONFIGURATION
  RU components • track • format • conditions • seed • strategy
            |
            v
DETERMINISTIC HEADLESS RACE ENGINE
  AI • movement • occupancy • contact • combat • fatigue • events
            |
            v
AUTHORITATIVE STATE + STRUCTURED EVENT STREAM
            |
       +----+-------------------+
       |                        |
PHASER RACE VIEWER       DIAGNOSTICS / REPLAY / BATCH TESTS
COMMENTARY / PLAYER UI
```

The core engine should be modular, data-driven, testable, and independent of browser timing, animation, and presentation. The management game should pass validated race setups into the engine and consume authoritative results, rather than bypassing or reimplementing race mechanics.

## 13. Developer tools and balancing philosophy

Because the game relies on interacting simulation systems, **developer tools are part of the development foundation**, not optional polish. The project needs to support quick, controlled experiments without rewriting source code for every adjustment.

Core capabilities include:

- Inspect and edit RU attributes, derived values, race rules, AI weights, physics, and conditions.
- **Apply a chosen attribute value to all RUs at once**, with clear scope and validation; retain individual editing.
- Configure race format and Strategy Sign influence, including global and per-sign effects.
- Pause and step individual ticks, inspect intentions and outcomes, and view structured diagnostics.
- Save/export scenarios, run repeatable seed-controlled races, and compare batches.
- Analyze overtakes, finish gaps, damage, DNFs, collisions, attacks, sign compliance, and other relevant performance metrics.

**Balance goals are qualitative before numerical:** build diversity, understandable tradeoffs, meaningful driver personalities, viable racing and combat approaches, race uncertainty without arbitrary chaos, and a manageable risk/reward curve across a run. Use repeated headless tests to identify patterns and manual playtesting to determine whether the results are engaging.

The prototype audit identified correctness and coverage gaps. Fixing those precedes relying on batch data for serious tuning. Passing tests alone is not proof of enjoyable or fully compliant gameplay.

## 14. Development sequence and scope discipline

### Stage 1 — Race prototype (Milestones A–E)

Build the deterministic racing engine, AI, occupancy, combat, conditions/events, viewer, commentary, and developer test infrastructure. **A–E have been implemented as a substantial working prototype, but the implementation audit identified unresolved deviations.** Treat this as an implemented foundation under validation, not a fully certified finished system.

### Stage 2 — Prototype v0.3 (Milestones F–J)

Address audit defects; add **Combat Racing/Pure Racing**; expand developer bulk editing and tuning; implement **queued line-activated Strategy Signs with stronger configurable effects**; and conduct structured balance testing. The v0.3 document defines implementation detail and acceptance criteria. These features are **approved requirements**, not all necessarily delivered at the time of this guide.

### Stage 3 — Race-system validation

Use manual races and controlled batch testing to confirm that the racing engine is mechanically sound, varied, understandable, and fun to manage. Refine AI behavior, passing, collision, combat, fatigue, pacing, sign influence, and result reporting before expanding the surrounding game substantially.

### Stage 4 — First complete playable run

Implement the smallest useful version of home-stable selection, pre-race setup, a short race series, between-race events/choices, rewards, temporary progression, persistent outcomes, and save/load. The goal is an **end-to-end loop**, not an exhaustive content catalog.

### Stage 5 — Depth and content

Expand roster variety, equipment, beasts, chariots, tracks, conditions, event types, progression, and world identity. Add systems when they create meaningful decisions or distinct race behavior.

### Stage 6 — Polish and release preparation

Improve presentation, onboarding, UX, performance, accessibility, content balance, and distribution. Desktop packaging remains optional.

These are **directional stages**, not fixed delivery promises. Keep playable, testable checkpoints and avoid building large systems on unverified mechanics.

## 15. Decisions that remain open

The following require deliberate design work rather than automatic assumptions by an implementation agent:

| Area | Open decisions |
|---|---|
| Run structure | Series length, branching, event cadence, failure/success rules |
| Stable economy | Currencies, repairs, upkeep, hiring, purchasing, and resource scarcity |
| Persistence | Which injuries, losses, upgrades, and rewards survive a run |
| Progression | How drivers, beasts, chariots, and the stable improve; unlock philosophy |
| Content | Beasts, chariot types, equipment, magic, tracks, rival teams, and factions |
| Competition | League/season organization, event entry rules, special formats, rewards |
| Tactical depth | Final Strategy Sign catalog and balancing; whether additional limited interventions are warranted |
| Optional mechanics | Pit stops and other proposed systems remain unapproved |
| Presentation | Final art direction, UI structure, audio, and platform expansion |

When a decision is not settled, implement a configurable, documented provisional choice only when necessary for the next testable increment; otherwise request a design decision.

## 16. Product boundaries and anti-goals

Blood and Thunder should **not** drift into a conventional manually controlled racing game, a direct-action combat game, or a management spreadsheet disconnected from observable races. The player should not need reflexes to compensate for weak AI. The game should not require realistic continuous physics to be convincing, nor expensive graphics to make decisions legible.

Do not duplicate the simulation in the UI, make randomness untraceable, hardcode tuning values that need comparison, or allow campaign systems to rewrite race outcomes outside established interfaces. Do not introduce features solely because they are common in other roguelites; every addition should reinforce the stable-management/race-simulation loop.

## 17. Definition of the intended complete game

A successful full Blood and Thunder experience allows the player to **build a persistent stable**, **assemble a distinctive racing team**, **enter a series of varied fantasy chariot races**, **watch autonomous competitors make consequential decisions**, **intervene sparingly with meaningful Strategy Signs**, **manage damage and resources between events**, and **carry selected rewards and consequences into future runs**.

The resulting races should be different because of builds, driver personalities, race formats, tracks, conditions, and choices—not because the game arbitrarily manufactures drama. The player should finish a run understanding both **what happened** and **what they might do differently next time**.

## 18. Document authority and use by development agents

This document answers **“What game are we building, and how should its systems fit together?”** It is intended as the high-level project compass for design discussions and future Codex tasks.

For executable rules and implementation details, consult the repository's current:

1. `AGENTS.md` — working method and source-of-truth hierarchy.
2. `Blood_and_Thunder_Prototype_Development_Spec_v0.2.md` — approved baseline mechanics and separately labeled provisional details.
3. `Blood_and_Thunder_v0.3_Codex_Development_Instructions.md` — approved next-update changes, milestone requirements, and acceptance tests.
4. `docs/DECISIONS.md` (if present) — subsequently accepted decisions and amendments.
5. Current implementation audit, tests, and actual code — evidence of what is implemented, **not** independent authority to change the intended design.

If this high-level guide appears to conflict with a more specific **approved** mechanic or a later owner decision, follow the specific/later approved decision and flag the discrepancy for documentation. Never silently promote an exploratory proposal to approved design.

---

**One-sentence project statement:** *Blood and Thunder is a fantasy chariot-racing stable-management roguelite in which players build and prepare teams, influence autonomous races through limited tactical signs, and navigate a series of dangerous competitions with both temporary and lasting consequences.*
