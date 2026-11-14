import type { Hazard } from './environment.ts';
import type { TileRef } from '../configuration/schemas.ts';
export type SpeedMode = 'push' | 'cruise' | 'conserve' | 'brake';
export interface PerceivedRU { id: string; tile: TileRef; progressInSegment: number; speedMps: number; status: string; ahead: number; behind: number }
export interface Perception { effectiveAwareness: number; aheadRange: number; behindRange: number; objects: PerceivedRU[]; hazards: Hazard[] }
export interface CandidateScore { id: string; mode: SpeedMode; laneDelta: -1 | 0 | 1; targetLane: number; targetSpeedMps: number; rejected: string | null; utility: number; factors: Record<string, number> }
export interface AiOutcome { lane: number; speedMps: number; blocked: boolean; laneRejected: boolean }
export interface AiDecision { raceContext: { lapsRemaining: number; cutoffRemaining: number | null; finalLap: boolean }; fatigueGainMultiplier: number; movementTick: number; perception: Perception; candidates: CandidateScore[]; chosen: CandidateScore; outcome: AiOutcome | null; unavailableActions: string[] }
export interface AiMemory { hazards: { hazard: Hazard; lastSeen: number }[]; targetLane: number | null; commitmentUntil: number; reevaluate: boolean; lastFailed: boolean }
export interface CommandReceipt { accepted: boolean; reason: string; effectiveTick: number | null }
export interface CommandJournalEntry { submittedAtTick: number; submittedAtPhase: string; origin: 'scripted' | 'live'; paused: boolean; input: unknown; receipt: CommandReceipt }
