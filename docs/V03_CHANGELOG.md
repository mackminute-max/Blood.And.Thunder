# v0.3 work in progress

F–J are not complete. Baseline and outstanding audit dependency are recorded in V03_AUDIT_REMEDIATION.md.

## Preliminary F changes

- Fractional contact scheduling preserves travel completed before impact and scales only the remaining interval. Sub-tile movement is no longer finalized before earlier contacts are known.
- Commands and configuration identifiers share a schema that rejects prototype property names. Command queue RU lookup uses own keys. Rejected commands retain structured events and replay journals.
- Developer RU log filters include explicit actors and targets, including combat/contact payload targets and defense opponents. Arbitrary payload text is not treated as participation.
- Diagnostic comparison exposes `captureAudits`, `capturesValid` and `reconstructedIdentical`. `identical` requires both valid captures and equal reconstructed runs; an invalid capture cannot establish historical equality. Existing independent audits remain available.

No race-format, bulk-edit, queued-sign, balance tuning or campaign changes have been made. No audit finding is claimed closed without the full audit.

## G–I

- `rules.competitionStyle` persists `combat` (default) / `pure`; Pure blocks deliberate attacks/rams in AI and authoritative resolution and rejects Attack signs/imports. Incidental collisions remain physical consequences.
- Bulk pre-race RU editing previews all old/new asset values, validates atomically, and supports guarded original-value restoration. Beast paths affect every beast in every RU. Dedicated global/per-sign controls expose effective utility strength and default resets.
- Signs now have separate active/pending state. Accepted raises consume at command processing; activation occurs at the common signal or next forward line crossing. Lowering does not cancel pending. Cancellation gives no refund and second pending submissions reject. Mid-movement activations affect subsequent AI decisions. UI/radio never call a merely pending sign active.
- Default global influence is provisional 2×; per-sign defaults 1×, ranges 0–8 each. Only utility contributions scale. Existing Push Hard fatigue is separate.
- Simulation 0.8.0 rejects canonical replay of 0.7.0 diagnostic histories: contact, counters, sign semantics and defaults changed. Do not relabel old histories to pretend replay compatibility. Historical v0.2 reports remain unchanged.


## J and validation

- Added deterministic paired reference/compact/equalized evidence generation, per-mode/per-RU aggregates (including finish times, DNFs, blocks, fatigue, contacts, condition distributions and sign usage), four portable presets and a manual guide.
- Corrected strict pass counting through exact tick-boundary ties and ended lead credit at first finish. Incidents count both contact participants; incidental damage reports actual HP loss.
- Added explicit v0.2 portable configuration migration; preserves source files, rejects diagnostic histories and refuses output overwrite.
- Bulk undo survives subsequent previews; no-op pending/lower controls do not invent radio facts. Imported reserved target IDs cannot replace the current live run.
- Complete suite: 261 tests / 21 files; nine Chromium flows; typecheck/lint/build passed, with focused final refinements checked separately. 584 balance cases across 18 variants produced zero simulation errors. Existing Phaser bundle warning remains.
- Balance remains unapproved: low reference completion, high Combat attrition and Conserve strength saturation are documented. Complete audit definitions remain unavailable under the explicit proceed-without-it instruction.
