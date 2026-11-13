# v0.3 audit remediation — Milestone F in progress

Baseline: `25e51c22db4a1a325b7104acd9d2bbe33a5db399` (`origin/codex/prototype-a-e` at inspection). Local preservation tag: `v0.2-baseline-25e51c2`; working branch: `codex/v0.3`.

The owner authorized F–J on 2026-11-13. The v0.3 development brief is retained at the repository root. The complete `docs/Prototype_Implementation_Audit.md` is **absent** from the available implementation branch. The owner explicitly directed proceeding without the unavailable audit. Summary-defined requirements can be implemented and tested; detailed audit closure remains unverified. Summaries below come only from that brief. The implementation proceeds using the supplied brief under that owner direction.

| ID | Reported severity / symptom | Requirement and affected files | Work / regression | Status |
|---|---|---|---|---|
| H-01 | High: contact progress 0.90 instead of 0.95 | Fractional movement/contact integration; `simulation/movement/schedule.ts` | Reproduced exactly against original scheduler; synchronize nonparticipating RU travel to impact time, then scale remaining travel only. `scheduler.test.ts` tests expected .95, discarded actor travel, reordered inputs and occupancy. Existing scheduler/lane/race coverage also required. | Preliminary fix; full audit and remaining adversarial coverage required |
| H-02 | High: malformed command RU IDs | Validated commands/no authoritative mutation; `configuration/ids.ts`, `commands.ts`, `schemas.ts`, `simulation/core/commands.ts` | Shared ID schema rejects Object.prototype names; own-key lookup at queue submission/application. Player/developer inherited-target inputs reject without mutation and replay identically in `ai.test.ts`. | Preliminary fix; full audit/UI verification required |
| H-03 | High: inert nerve/durability/roughness/severity | Approved attributes must affect mechanics; derive/conditions/damage/AI consumers | Search confirms no mechanical consumption of these intrinsic values. Hazard roughness already changes traction and must not be double-counted. Exact new formulas remain provisional. | Implemented from summary with bounded configurable attribute effects and controlled tests; full-audit reconciliation pending |
| H-04 | High: incomplete result statistics | v0.2 §11.6; rules/classification, contracts/race, diagnostics/batch, results UI | Existing batch observed passes are explicitly not authoritative sub-tick overtakes. Define event-derived metrics and shared counters before changing result outputs. | Implemented shared counters/results/UI/per-RU batch data; full-audit reconciliation pending |
| M-01 | Medium: target-side log filtering | Inspectability; `diagnostics/recording.ts` | Collect explicit top-level/payload actor and target references, including defense opponent. Tests cover attacks, contacts, defense, combined filters and exclusion of unrelated payload strings. | Preliminary fix; exact audit scope pending |
| M-02 | Medium: logging controls | Logging/editor controls | Complete description needed | Not triaged |
| M-03 | Medium: reconstructed-run identity masks invalid capture | Capture integrity; `diagnostics/compare.ts` | Comparisons audit both serialized captures; expose reconstructed equality separately and report `identical: false` if either capture is invalid. `analysis.test.ts` exercises tampered phase with otherwise identical replay inputs. | Preliminary fix; exact audit scope pending |
| M-04 | Medium: editor coverage | Developer tools | Complete description needed | Not triaged |
| M-05 | Medium: extension hooks | Extension boundaries | Complete description needed | Not triaged |
| M-06 | Medium: persistent-wreck mode | Wreck lifecycle | Complete description needed | Not triaged |
| M-07 | Medium: AI context/memory | AI | Complete description needed | Not triaged |
| M-08 | Medium: environmental scope | Environment | Complete description needed | Not triaged |
| M-09 | Medium: full-reference balance evidence | Reference batch evidence | Complete description needed; no balance claim | Not triaged |
| M-10 | Medium: hardcoded policy | Configurable policy | Complete description needed | Not triaged |
| M-11 | Medium: determinism enforcement | Deterministic engine boundaries | Complete description needed | Not triaged |
| Four Low findings | Low: IDs/details not supplied | Unknown | Do not invent IDs or acceptance criteria | Blocked on full audit |

The brief reports 0 Critical, 4 High, 11 Medium and 4 Low. This inventory does not independently verify those counts. Supply the complete audit by repository branch/path or accessible link to reconcile requirements, dispositions and regression evidence before the F exit gate.


## Dispositions without unavailable detail

Owner direction permits proceeding; it does not supply unseen finding definitions. M-02/M-04 are addressed through existing bounded recordings, explicit actor/target filtering, schema-derived numeric controls, and the H bulk/sign UI work. M-09 is addressed by J paired reference/adversarial evidence. These remain summary-level work, not verified detailed closure.

M-05 extension hooks, M-06 persistent wreck mode, M-07 broad AI context/memory, M-08 expanded environmental systems and M-10 unspecified policies are deferred pending concrete reproduction/requirements; changing them speculatively risks unrelated mechanics. M-11 determinism receives existing architectural restrictions plus repeated/reordered/replay regressions throughout v0.3. The four unspecified Low findings need the full audit before any disposition beyond pending review.
