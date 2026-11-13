import { z } from 'zod';
export const SIGN_IDS = ['push-hard', 'defend-position', 'attack', 'conserve'] as const;
export const signSchema = z.enum(SIGN_IDS);
const base = { commandId: z.string().min(1).max(80), effectiveTick: z.number().int().positive(), source: z.enum(['player', 'developer']) };
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('raiseSign'), ruId: z.string().min(1), signId: signSchema }),
  z.strictObject({ ...base, type: z.literal('lowerSign'), ruId: z.string().min(1) }),
  z.strictObject({ ...base, type: z.literal('developerOverride'), ruId: z.string().min(1), field: z.enum(['teamFatigue', 'maxSpeedMps']), value: z.number().finite().min(0).max(100).nullable() }),
]);
export type SimCommand = z.infer<typeof commandSchema>;
export type SignId = z.infer<typeof signSchema>;
