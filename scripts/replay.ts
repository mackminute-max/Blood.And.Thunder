import { readFileSync } from 'node:fs';
import { importDiagnostic, auditDiagnostic } from '../src/diagnostics/compare.ts';
try {
  if (!process.argv[2]) throw new Error('Pass an exported race diagnostic JSON file');
  const result = auditDiagnostic(importDiagnostic(readFileSync(process.argv[2], 'utf8')));
  console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.message : 'Replay failed'); process.exitCode = 1; }
