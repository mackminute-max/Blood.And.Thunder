import { execFileSync, spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('executes the reference initialization in native Node without browser globals', () => {
  const output: unknown = JSON.parse(execFileSync(process.execPath, ['scripts/headless.ts'], { encoding: 'utf8' }));
  expect(output).toMatchObject({ state: { scenarioId: 'oval-six-v1', phase: 'grid', tick: 0 }, events: [{ type: 'race_initialized' }] });
});
it('reports invalid scenario files with a nonzero exit status', () => {
  const result = spawnSync(process.execPath, ['scripts/headless.ts', 'package.json'], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('scenario.schemaVersion');
});
it('runs fixed movement ticks through native Node and exports reproducible input/state', () => {
  const output: unknown = JSON.parse(execFileSync(process.execPath, ['scripts/movement.ts', '3'], { encoding: 'utf8' }));
  expect(output).toMatchObject({ kind: 'a2-movement-diagnostic', state: { tick: 3, phase: 'running' }, initialConfiguration: { scenario: { simulationVersion: '0.7.0' } } });
});
it('rejects invalid headless movement tick counts', () => {
  const result = spawnSync(process.execPath, ['scripts/movement.ts', '-1'], { encoding: 'utf8' });
  expect(result.status).toBe(1); expect(result.stderr).toContain('Ticks must be an integer');
});
it('runs an A3 front-row circuit to an explicit classified result', () => {
  const output: unknown = JSON.parse(execFileSync(process.execPath, ['scripts/race.ts', 'src/content/oval-front-four-a3.scenario.json'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  expect(output).toMatchObject({ kind: 'a3-race-diagnostic', state: { phase: 'complete', result: { outcome: 'classified', scenarioId: 'oval-front-four-a3', winnerIds: expect.arrayContaining([expect.any(String)]) } } });
});
it('runs the six-RU reference circuit with approved rear-row accounting', () => {
  const output: unknown = JSON.parse(execFileSync(process.execPath, ['scripts/race.ts'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  expect(output).toMatchObject({ kind: 'a3-race-diagnostic', state: { phase: 'complete', result: { outcome: 'classified', scenarioId: 'oval-six-v1', classification: expect.arrayContaining([expect.objectContaining({ ruId: 'ru-bone' }), expect.objectContaining({ ruId: 'ru-copper' })]) } } });
}, 15000);
