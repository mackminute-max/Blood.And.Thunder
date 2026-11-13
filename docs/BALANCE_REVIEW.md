# E baseline review — 2026-11-13

No mechanics, formula coefficients or shipped reference defaults were changed. The engine remains simulation 0.7.0 / schema c2-1. This is a reproducible initial sample and tooling baseline, not a declaration that the game is balanced.

## Reproduce

From the repository root:

```sh
npm run batch -- src/content/scenarios/e-stress.plan.json /tmp/bt-stress
npm run batch -- src/content/scenarios/e-reference.plan.json /tmp/bt-reference
npm run compare -- left-diagnostic.json right-diagnostic.json
npm run replay -- exported-diagnostic.json
```

The batch plan names every seed, variant, source configuration and optional scripted sign. Paths are relative to the working directory. JSON reports include normalized source configurations, per-run configuration/tuning/final hashes, per-run metrics, aggregates and paired deltas; each variant also gets a CSV. CLI progress goes to stderr. Simulation errors retain the engine crash bundle in the run record and cause a nonzero exit. Large generated logs are not checked in; rebuild them with the plans. The checked-in [reference report](balance/reference-e1.json), per-variant CSVs and [stress summary](balance/stress-e1.json) retain the measured evidence and seed lists.

## Full 48-segment six-RU reference

Twelve ordered seeds E-OVAL-000 through E-OVAL-011; three variants use the same content/rules: baseline, persistent Conserve on the player, persistent Attack on the player. Signs are scripted at the first movement tick through the ordinary command queue and cost one opportunity. Opponent strategies, weather, Dangerous lethality, Occasional incidents and the three-lap common-clock race are unchanged.

| Metric | Baseline | Conserve | Attack |
|---|---:|---:|---:|
| Races / entrants | 12 / 72 | 12 / 72 | 12 / 72 |
| Simulation errors | 0 | 0 | 0 |
| Finishers / finish rate | 13 / 18.06% | 13 / 18.06% | 13 / 18.06% |
| Finish-cutoff classifications | 39 | 37 | 39 |
| Chariot disablements | 20 | 22 | 20 |
| Recorded full laps | 117 | 109 | 108 |
| Full-lap p10 / median / p90 (s) | 44.60 / 59.18 / 79.99 | 48.43 / 69.91 / 85.78 | 42.88 / 58.35 / 77.29 |
| Attacks / hits / ram attempts | 1103 / 618 / 264 | 1205 / 676 / 308 | 1002 / 546 / 276 |
| Accidental contacts | 20 | 21 | 23 |
| Destroyed chariots | 4 | 3 | 2 |
| Fatalities / severe-injury markers | 0 / 0 | 0 / 0 | 0 / 0 |
| Mean of run-average fatigue / maximum | 11.01 / 31.88 | 11.45 / 36.51 | 10.10 / 27.44 |
| Blocked forward transitions | 131 | 130 | 113 |
| Scheduled / activated external incidents | 3 / 3 | 3 / 3 | 3 / 3 |

No deadlock/invariant warning was emitted in these runs. The aggregate entrant finish-rate delta was zero for both paired sign comparisons. This does not imply equal player outcomes or equivalent racing behavior: metrics combine all entrants, completed-lap samples differ, signs alter autonomous preferences, and changes can alter named RNG draw consumption. The report is descriptive; twelve seeds do not establish significance. Zero fatalities in this sample does not establish a zero fatality probability; dedicated lethality tests force eligible living-component disablement and verify those outcomes.

The low finish rate is the clearest follow-up signal. The default cutoff is 100 ticks (20 simulated seconds after the first finisher), while the measured full-lap spread is broad; chariot disablement is also a substantial competing outcome. The sample does not isolate the causes.

## Compact engineering batch

1,000 seeds E-STRESS-0000 through E-STRESS-0999; three RUs, four segments of 4 m, dt1 s, twelve-tick watchdog, current AI/combat/weather/event rules otherwise inherited. These deliberate geometry/time/horizon changes are a safety fixture, not a tuned alternative to the reference race.

- Zero simulation errors; 2,999 of 3,000 entrants finished; one race-timeout DNF.
- 8,999 full laps; p10/median/p90 1.345 / 1.831 / 4.148 simulated seconds.
- 6,931 attacks, 3,970 hits, 1,683 ram attempts and 12 accidental contacts.
- 289 external incidents scheduled and activated; 169 blocked forward transitions.
- 1,519 observed progress reversals, no severe injuries/fatalities/destruction, maximum fatigue 1.776.

Engine invariants validate each committed tick and surface errors rather than repairing invalid state. This combines systems across many seeds but does not substitute for full-reference balance sampling. Existing isolated/adversarial tests remain necessary for forced lethality, collision, cornering, timing, invalid input and crash paths.

## Metric definitions and limits

- Finish rate: finished entrants divided by all entrants. `dnfReasons` includes every nonfinished status/reason (including disabled/retired), not only literal DNF rows.
- Full-lap time: accepted lap_crossed time minus previous lap start/crossing; the rear-row approach is excluded. Unfinished laps are absent; distributions are therefore completion-conditioned.
- `overtakesObserved`: strict normalized-progress reversal between consecutive snapshots, only racers active at both endpoints. This is a derived observation; intra-tick passes/repasses, status-only changes and ties are not counted. It is not a new authoritative game statistic.
- Lane seconds: active exposure integrated from accepted lateral/forward transition fractions and finish/disable/retirement boundaries; countdown excluded. Standing and final-tick fatigue follow current engine semantics.
- Contacts: accidental participant-contact counters divided by two; deliberate rams are reported separately. Fatalities count dead drivers/beasts, destruction counts carts, injury count counts injury markers.
- Fatigue: per-run sample-weighted mean over RU movement-tick samples and maximum; aggregate reports mean of those run means. AI speed-mode counts and per-RU lane seconds remain in JSON/CSV.
- Incident counts distinguish scheduled external incidents from all successful activations (including explicit fixtures if a plan contains them). This reference plan has no explicit environmental fixtures.
- Hashes use the existing noncryptographic FNV-1a / rounded-eight canonical contract. They are comparison checksums, not security digests.

## Recommended next review

1. Run larger paired full-reference samples with isolated cutoff variants (for example, 100 versus 300 ticks) and combat disabled/enabled to separate time-window effects from attrition. Keep default content unchanged until a concrete candidate is reviewed.
2. Add entrant-specific outcome summaries before interpreting a player sign's competitive benefit. Current aggregate paired deltas describe whole-race changes only.
3. Inspect representative low-finish seeds in Comparison, including tick-0 configuration differences and the earliest behavioral divergence. Use verified state/events to investigate pacing and contact opportunities.
4. Compare lethality/event distributions over substantially more full races and enough eligible disablements before changing probabilities. Preserve optional event absence and independent profile knobs.

Ordinary candidate edits already use the validated developer numeric editors/JSON and captured draft comparisons. [TUNING_REGISTER.md](TUNING_REGISTER.md) inventories current values and their authority; none were promoted to approved canon by this review.
