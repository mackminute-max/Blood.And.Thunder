import { ESLint } from 'eslint';
import { expect, it } from 'vitest';
it('rejects forbidden engine imports and browser/nondeterministic APIs', async () => {
  const lint = new ESLint();
  for (const source of ["import Phaser from 'phaser';", "import x from '../../presentation/phaser/viewer.ts';", 'window.alert(1);', 'Math.random();', 'Date.now();', 'new Date();', 'const clock = Date; clock.now();', 'const random = Math.random; random();', 'const m = Math; m.random();', 'performance.now();', 'globalThis.Math.random();']) {
    const [result] = await lint.lintText(source, { filePath: 'src/simulation/core/probe.ts' });
    expect(result?.messages.some(message => message.ruleId?.startsWith('no-restricted'))).toBe(true);
  }
});
