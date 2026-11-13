import { SetupValidationError } from './validate.ts';
import { utf8Bytes } from '../shared/utf8.ts';
/** Portable JSON boundary. Schema/reference validation is performed by initializeRace. */
export function parseSetupJson(source: string, label: string): unknown {
  const tooLarge = () => new SetupValidationError([{ path: label, message: 'JSON exceeds 20 MiB limit' }]);
  if (source.length > 20 * 1024 * 1024) throw tooLarge();
  let byteCount = 0;
  const bytes = utf8Bytes(source);
  while (!bytes.next().done) if (++byteCount > 20 * 1024 * 1024) throw tooLarge();
  let depth = 0; let inString = false; let escaped = false;
  for (const char of source) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') { if (++depth > 64) throw new SetupValidationError([{ path: label, message: 'JSON nesting exceeds 64 levels' }]); }
    else if (char === '}' || char === ']') depth--;
  }
  try { return JSON.parse(source) as unknown; }
  catch { throw new SetupValidationError([{ path: label, message: 'Invalid JSON syntax' }]); }
}
