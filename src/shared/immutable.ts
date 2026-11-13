import type { DeepReadonly } from '../contracts/initialization.ts';
export function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
/** Copy validated JSON-shaped state without browser or Node globals. */
export type MutableJson<T> = T extends object ? { -readonly [K in keyof T]: MutableJson<T[K]> } : T;
export function copyJson<T>(value: T): MutableJson<T> { return JSON.parse(JSON.stringify(value)) as MutableJson<T>; }
