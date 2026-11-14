import { expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './setup-fixture.ts';
import { createRaceEngine } from '../src/simulation/core/race-engine.ts';
import { assertBatchWorkload } from '../src/configuration/workload.ts';
it('compare assertion mode fails on divergent/invalid captures and succeeds on identical ones', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bt-compare-'));
    try {
        const f = fixture();
        const e = createRaceEngine(f.scenario, f.content);
        e.step();
        const left = join(directory, 'left.json');
        const right = join(directory, 'right.json');
        writeFileSync(left, e.exportBundle());
        writeFileSync(right, e.exportBundle());
        expect(() => execFileSync(process.execPath, ['scripts/compare.ts', left, right, '--assert-identical'], { stdio: 'pipe' })).not.toThrow();
        const raw = JSON.parse(e.exportBundle());
        raw.lastValidState = { invented: true };
        writeFileSync(right, JSON.stringify(raw));
        expect(spawnSync(process.execPath, ['scripts/compare.ts', left, right, '--assert-identical'], { stdio: 'pipe' }).status).toBe(1);
        expect(spawnSync(process.execPath, ['scripts/compare.ts', left, right], { stdio: 'pipe' }).status).toBe(0);
    }
    finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
it('rejects excessive browser/CLI batch work before simulation begins', () => {
    const f = fixture();
    expect(assertBatchWorkload([f], 1)).toBeGreaterThan(0);
    expect(() => assertBatchWorkload([f], 10000)).toThrow(/workload limit/);
});
