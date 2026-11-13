import type { TileRef } from '../configuration/schemas.ts';
export type HazardType = 'debris_spawn' | 'track_roughness' | 'animal_crossing';
export interface ScheduledIncident { id: string; movementTick: number; type: HazardType; tile: TileRef | null; durationTicks: number; source: 'external' | 'fixture' }
export interface Hazard { id: string; type: HazardType; tile: TileRef; createdAt: number; expiresAt: number; direction: number; source: 'external' | 'fixture' }
export interface EnvironmentState { expectedRaceTicks: number; schedule: ScheduledIncident[]; activatedEvents: number; skippedEvents: number }
export interface EnvironmentStats { collisions: number; collisionDamage: number; fatigueSamples: number; fatigueTotal: number; maxFatigue: number }
