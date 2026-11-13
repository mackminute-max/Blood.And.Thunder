import { expect, it } from 'vitest';
import { createRng, fnv1a, seedStreams, STREAM_NAMES } from '../src/simulation/core/rng.ts';
import type { RngState } from '../src/simulation/core/rng.ts';
import { utf8Bytes } from '../src/shared/utf8.ts';
it('matches the xoshiro128** reference sequence for state [1,2,3,4]', () => {
  const rng = createRng([1, 2, 3, 4]);
  expect(Array.from({ length: 4 }, () => rng.nextUint32())).toEqual([11520, 0, 5927040, 70819200]);
});
it('uses documented UTF-8 seed bytes and FNV-1a vectors', () => {
  expect(fnv1a('')).toBe(0x811c9dc5); expect(fnv1a('hello')).toBe(0x4f9f2cab);
  for (const seed of ['ASCII', 'é漢字', '🐎', '\ud800']) expect([...utf8Bytes(seed)]).toEqual([...new TextEncoder().encode(seed)]);
});
it('creates independent repeatable named streams and restores exact PRNG state', () => {
  const streams = seedStreams('race 🐎');
  expect(streams).toEqual(seedStreams('race 🐎'));
  expect(streams).not.toEqual(seedStreams('different'));
  expect(new Set(STREAM_NAMES.map(name => streams[name].join(','))).size).toBe(5);
  const ai = createRng(streams.ai); const combat = createRng(streams.combat);
  const combatBefore = combat.snapshot();
  for (let i = 0; i < 100; i++) expect(ai.next()).toBeGreaterThanOrEqual(0);
  expect(combat.snapshot()).toEqual(combatBefore);
  const restored = createRng(ai.snapshot());
  expect(Array.from({ length: 20 }, () => restored.nextUint32())).toEqual(Array.from({ length: 20 }, () => ai.nextUint32()));
  for (let i = 0; i < 100; i++) expect(combat.next()).toBeLessThan(1);
});
it.each([[0, 0, 0, 0], [-1, 2, 3, 4], [1.5, 2, 3, 4], [Infinity, 2, 3, 4], [2 ** 32, 2, 3, 4]])('rejects invalid RNG state %j', (...words) => {
  expect(() => createRng(words as unknown as RngState)).toThrow();
});
