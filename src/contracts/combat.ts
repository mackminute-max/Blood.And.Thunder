export type CombatPhase = 'preMove' | 'contact' | 'postMove';
export type CombatChannel = 'driver' | 'beast' | 'mounted' | 'ram';
export interface AttackPlan { ruId: string; targetRuId: string; weaponId: string }
export interface CombatCandidate extends AttackPlan { channel: CombatChannel; rejected: string | null; utility: number; factors: Record<string, number> }
export interface CombatDecision { movementTick: number; candidates: CombatCandidate[]; selected: AttackPlan[]; guard: boolean; guardUtility: number }
export interface CombatStats { attempts: number; hits: number; damageDealt: number; damageReceived: number; ramAttempts: number; defenses: number }
