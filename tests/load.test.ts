import { expect, it } from 'vitest';
import { parseSetupJson } from '../src/configuration/load.ts';
it('parses portable JSON and respects brackets in escaped strings', () => {
  const value = { text: '["\\]', nested: { valid: true } };
  expect(parseSetupJson(JSON.stringify(value), 'scenario')).toEqual(value);
});
it('rejects invalid JSON, excessive depth and oversized imports with paths', () => {
  expect(() => parseSetupJson('{bad}', 'scenario')).toThrow('scenario: Invalid JSON');
  expect(() => parseSetupJson('['.repeat(65) + '0' + ']'.repeat(65), 'content')).toThrow('content: JSON nesting');
  expect(() => parseSetupJson(' '.repeat(20 * 1024 * 1024 + 1), 'content')).toThrow('content: JSON exceeds');
});
