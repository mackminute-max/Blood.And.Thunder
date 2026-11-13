import { readFileSync } from 'node:fs';
import { compareDiagnosticSources } from '../src/diagnostics/compare.ts';
try {
  if (process.argv.length !== 4) throw new Error('Usage: npm run compare -- left-diagnostic.json right-diagnostic.json');
  const result = compareDiagnosticSources(readFileSync(process.argv[2]!, 'utf8'), readFileSync(process.argv[3]!, 'utf8'));
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : 'Comparison failed'); process.exitCode = 1; }
