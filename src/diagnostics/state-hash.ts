import { fnv1a } from '../simulation/core/rng.ts';
/** A.1 prototype numeric precision, sorted object keys, stable semantic arrays.
 * A non-cryptographic comparison checksum, not an integrity/security digest. */
export function canonicalState(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot hash nonfinite state');
    return JSON.stringify(Number(value.toFixed(8)));
  }
  if (Array.isArray(value)) return `[${value.map(canonicalState).join(',')}]`;
  if (typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonicalState(child)}`).join(',')}}`;
  throw new Error('State is not JSON-shaped');
}
export const stateHash = (value: unknown) => `fnv1a32-rounded8:${fnv1a(canonicalState(value)).toString(16).padStart(8, '0')}`;
