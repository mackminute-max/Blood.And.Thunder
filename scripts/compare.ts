import { readFileSync } from 'node:fs';
import { compareDiagnosticSources } from '../src/diagnostics/compare.ts';
try {
  const paths = process.argv.slice(2).filter(arg=>arg!=='--assert-identical');
  if (paths.length !== 2) throw new Error('Usage: npm run compare -- left-diagnostic.json right-diagnostic.json [--assert-identical]');
  const result = compareDiagnosticSources(readFileSync(paths[0]!, 'utf8'), readFileSync(paths[1]!, 'utf8'));
  console.log(JSON.stringify(result, null, 2));
  if (process.argv.includes('--assert-identical') && result.identical !== true) process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.message : 'Comparison failed'); process.exitCode = 1; }
