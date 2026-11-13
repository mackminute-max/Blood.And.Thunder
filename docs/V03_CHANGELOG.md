# v0.3 work in progress

F–J are not complete. Baseline and outstanding audit dependency are recorded in V03_AUDIT_REMEDIATION.md.

## Preliminary F changes

- Fractional contact scheduling preserves travel completed before impact and scales only the remaining interval. Sub-tile movement is no longer finalized before earlier contacts are known.
- Commands and configuration identifiers share a schema that rejects prototype property names. Command queue RU lookup uses own keys. Rejected commands retain structured events and replay journals.
- Developer RU log filters include explicit actors and targets, including combat/contact payload targets and defense opponents. Arbitrary payload text is not treated as participation.
- Diagnostic comparison exposes `captureAudits`, `capturesValid` and `reconstructedIdentical`. `identical` requires both valid captures and equal reconstructed runs; an invalid capture cannot establish historical equality. Existing independent audits remain available.

No race-format, bulk-edit, queued-sign, balance tuning or campaign changes have been made. No audit finding is claimed closed without the full audit.
