import { z } from 'zod';
import { contentSchema, scenarioSchema } from '../configuration/schemas.ts';
import { validateSetup } from '../configuration/validate.ts';
import { parseSetupJson } from '../configuration/load.ts';
const savedSchema = z.strictObject({ kind: z.literal('blood-thunder-configuration-a4-1'), name: z.string().trim().min(1).max(80), mode: z.enum(['movement', 'race']), scenario: scenarioSchema, content: contentSchema });
export type SavedConfiguration = z.infer<typeof savedSchema>;
export function validateSavedConfiguration(input: unknown): SavedConfiguration {
  const saved = savedSchema.parse(input);
  const setup = validateSetup(saved.scenario, saved.content);
  return { ...saved, ...setup };
}
export function importConfiguration(source: string): SavedConfiguration {
  return validateSavedConfiguration(parseSetupJson(source, 'configuration'));
}
export function exportConfiguration(input: unknown): string {
  return JSON.stringify(validateSavedConfiguration(input), null, 2);
}
export function openConfigurationStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('blood-and-thunder-developer', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('configurations', { keyPath: 'name' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Cannot open IndexedDB'));
    request.onblocked = () => reject(new Error('Configuration database is blocked by another tab'));
  });
}
export async function saveConfiguration(input: unknown): Promise<void> {
  const saved = validateSavedConfiguration(input);
  const db = await openConfigurationStore();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('configurations', 'readwrite');
    tx.objectStore('configurations').put(saved);
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Save failed'));
  }); } finally { db.close(); }
}
export async function loadConfiguration(name: string): Promise<SavedConfiguration> {
  const db = await openConfigurationStore();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('configurations', 'readonly');
    const request = tx.objectStore('configurations').get(name);
    request.onsuccess = () => { try { resolve(validateSavedConfiguration(request.result)); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error ?? new Error('Load failed'));
  }); } finally { db.close(); }
}
export async function listConfigurations(): Promise<string[]> {
  const db = await openConfigurationStore();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('configurations', 'readonly').objectStore('configurations').getAllKeys();
    request.onsuccess = () => resolve(request.result.map(String).sort());
    request.onerror = () => reject(request.error ?? new Error('Cannot list saved configurations'));
  }); } finally { db.close(); }
}
