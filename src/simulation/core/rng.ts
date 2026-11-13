import { utf8Bytes } from '../../shared/utf8.ts';
/** xoshiro128** 1.1 transition by Blackman/Vigna; all arithmetic is uint32.
 * Seed expansion v1: FNV-1a UTF-8(JSON.stringify([seed, stream, wordIndex]))
 * for indices 0..3. Lone UTF-16 surrogates encode as U+FFFD.
 * Reference: https://prng.di.unimi.it/xoshiro128starstar.c (public domain).
 */
import { STREAM_NAMES } from '../../contracts/rng.ts';
import type { RngState, RngStreams } from '../../contracts/rng.ts';
export { RNG_VERSION, STREAM_NAMES } from '../../contracts/rng.ts';
export type { RngState, RngStreams, StreamName } from '../../contracts/rng.ts';

export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of utf8Bytes(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
}
const rotateLeft = (value: number, bits: number) => ((value << bits) | (value >>> (32 - bits))) >>> 0;
export function createRng(initial: RngState): { nextUint32(): number; next(): number; snapshot(): RngState } {
  if (initial.length !== 4 || initial.some(word => !Number.isInteger(word) || word < 0 || word > 0xffffffff) || initial.every(word => word === 0)) {
    throw new Error('RNG state must contain four uint32 words, not all zero');
  }
  let [a, b, c, d] = initial;
  const nextUint32 = () => {
    const result = Math.imul(rotateLeft(Math.imul(b, 5), 7), 9) >>> 0;
    const temporary = (b << 9) >>> 0;
    c = (c ^ a) >>> 0; d = (d ^ b) >>> 0; b = (b ^ c) >>> 0; a = (a ^ d) >>> 0;
    c = (c ^ temporary) >>> 0; d = rotateLeft(d, 11);
    return result;
  };
  return { nextUint32, next: () => nextUint32() / 0x100000000, snapshot: () => Object.freeze([a, b, c, d] as const) };
}
export function seedStreams(seed: string): RngStreams {
  const result = {} as RngStreams;
  for (const stream of STREAM_NAMES) {
    const state: [number, number, number, number] = [0, 1, 2, 3].map(index => fnv1a(JSON.stringify([seed, stream, index]))) as [number, number, number, number];
    if (state.every(word => word === 0)) state[0] = 1;
    result[stream] = Object.freeze(state);
  }
  return result;
}
