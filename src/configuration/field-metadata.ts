import { z } from 'zod';
import { contentSchema, scenarioSchema } from './schemas.ts';
type JsonSchema = { type?: string; minimum?: number; maximum?: number; exclusiveMinimum?: number; properties?: Record<string, JsonSchema>; items?: JsonSchema; additionalProperties?: JsonSchema | boolean };
const schema = z.toJSONSchema(contentSchema) as JsonSchema;
const scenarioFields = z.toJSONSchema(scenarioSchema) as JsonSchema;
export function fieldMetadata(path: readonly string[]) {
  let current: JsonSchema | undefined = path[0] === '$scenario' ? scenarioFields : schema;
  if (path[0] === '$scenario') path = path.slice(1);
  for (const part of path) {
    if (current?.type === 'array') current = current.items;
    else current = current?.properties?.[part] ?? (typeof current?.additionalProperties === 'object' ? current.additionalProperties : undefined);
  }
  return { min: current?.minimum, max: current?.maximum, exclusiveMin: current?.exclusiveMinimum, integer: current?.type === 'integer' };
}
