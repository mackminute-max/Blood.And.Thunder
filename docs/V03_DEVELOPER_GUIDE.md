# v0.3 developer and playtest workflow

Run commands from the repository root with Node 24.22.1 / npm 11.9.0. Install with `npm ci` (use `--cache /tmp/bt-npm-cache` if the home cache is not writable), then `npm run dev`. Chromium smoke tests expect that server on port 5173 and `/usr/bin/chromium`, or `CHROMIUM_PATH` set to an installed browser. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:browser`.

## Reproducible manual loop

1. In Scenario, import one of `src/content/scenarios/v03/{combat-baseline,pure-baseline,equalized-rus,high-sign-influence}.configuration.json`. Portable presets include complete validated scenario/content inputs, not mutable race snapshots. Rules → Race ruleset selects Combat/Pure; draft changes require Initialize/restart. The active ruleset is printed above the viewer and in results/exports.
2. For a single equal-stat edit, open RUs → Apply to all RUs. Choose an attribute, enter its value, and Preview. Review every RU/asset's old/new values, then Apply to all RUs. `beasts.*` affects **all beasts on all RUs**. Invalid edits reject the whole operation. Restore original values undoes the most recent bulk operation only if no subsequent draft edits would be overwritten. Save a named scenario before repeated edits. Per-RU numeric controls remain available.
3. The equalized preset sets listed beast/driver/personality/chariot skill attributes to 70, common chariot weight 180 kg, common component maximum/current health 100, and balanced pre-race strategies. It preserves roster IDs, equipment, grid positions, lane costs and other configuration. Equal raw skills do not imply equal starting positions or equipment.
4. Save the named scenario and seed (Scenario → Edit scenario and content JSON → `scenario.seed`). Run once with no signs. Pause/step one tick to inspect AI candidate scores/rejections, movement and official events. Results show per-RU counters and component condition. Save Export latest/crash snapshot when complete.
5. Reinitialize the same draft/seed. Before Play, queue a sign: it activates at the common starting signal. During a race, queue it mid-lap and observe **Active**, **Pending**, the next-line-crossing explanation and opportunities. Active replacement waits for crossing. Lowering active is free and keeps pending intact. Cancel pending gives no refund. A second pending sign rejects, as does Attack in Pure Racing. Pending signs retained at termination are exported without invented activations.
6. In RUs → Strategy Sign influence, compare global strength 1, 2 (shipped hypothesis) and 4 with the same per-sign values and seed. Effective multipliers and ranges are shown; Reset restores shipped defaults. Only sign utility changes, not unrelated fatigue/physics. Export configuration and latest diagnostics for each case. Compare live diagnostic captures in Comparison to inspect replay authenticity and changed states/events; a reconstructed match cannot validate tampered historical evidence.
7. Repeat with the differentiated baseline, both rulesets, alternate fixed weather, and event-intensity controls. Record qualitative observations separately: visible overtakes, dominant combat, perceived sign influence, readability and competitiveness. Automated smoke tests verify controls, not human judgments of fun or balance.

## Paired quantitative evidence

`node scripts/v03-balance.ts /tmp/bt-v03-evidence` regenerates presets and runs the complete fixed matrix: 64 compact seeds × eight mode/Conserve-strength variants, plus 72 full-reference/equalized races. Reference no-sign/2× cases use 12 paired seeds; 1×/4× probes and equalized cases use the first four. Every run records configuration/tuning/final hashes, classification, components, per-RU authoritative counters, lane exposure, action distribution and failures. Pure offense is asserted zero. JSON and per-variant CSV outputs go to the chosen directory. `--quick` runs 26 cases for smoke validation only; it is not the release evidence.

The existing `npm run batch -- plan.json output-prefix` also supports sign variants. In v0.3, plan signs queue at tick 1 for common-signal activation. Browser paired draft batches use scripted sign commands from the draft, not live commands you issued to a separate race. For live-command comparisons use diagnostic captures/journals, or add an explicit tick-1 scripted command to a saved draft.

## Measurement semantics and limitations

- Overtakes require a strict normalized progress reversal on authoritative transition/contact/tick paths. Initial ties do not count as passes. Prior ordering persists through exact tick-boundary ties. Finished/disabled units cannot acquire post-terminal overtakes. Within-tile paths use explicit piecewise interpolation; this is not continuous physical telemetry.
- Lead time integrates those paths until the first finish, splits exactly tied lead intervals equally, and is zero after a winner finishes. DNFs keep earned counters; no-finisher races accrue through termination.
- Incidents include each contact participant plus each failed handling check. Lateral changes count accepted lateral events. Blocks, laps, fractional finish times, attack attempts/hits/actual HP damage, component condition, fatigue and sign usage come from the engine. Penalties are zero because no penalty-assessment mechanic exists.
- Incidental-contact damage records actual HP loss after durability/protection. Deliberate ram, intentional attack and incidental contact remain distinct diagnostic categories.
- Numeric tuning/formulas are provisional. A stronger utility score need not change an already-saturated decision. Compare action distributions, not just hashes or scores. Paired seeds do not prove isolated causation when changed behavior changes RNG consumption.
- The complete audit remains unavailable under the owner's proceed-without-it direction. Unseen Medium/Low definitions are not claimed closed. See V03_AUDIT_REMEDIATION.md.

## v0.2 migration

Only portable `blood-thunder-configuration-a4-1` files with simulation 0.7.0 / schema c2-1 are supported by the explicit migration:

```sh
node scripts/migrate-v02.ts old.configuration.json new.configuration.json
```

The output file must not already exist. This validates all inputs and preserves caller/source data, adds Combat as the default ruleset and the new tuning defaults, and moves the scenario to simulation 0.8.0. Review queued-sign semantics and 2× global influence before running; old scripted raises now wait for line activation. Historical v0.2 diagnostics and golden reports cannot be relabeled into canonical v0.3 replay. Keep those artifacts and rerun original scenarios to collect new evidence. No automatic mutable-state migration or restoration is provided.
