export interface CommentarySettings { maxFeed: number; maxHighlights: number; maxRoutinePerTick: number; repeatTicks: number; majorDamage: number }
export const COMMENTARY: Readonly<CommentarySettings> = Object.freeze({ maxFeed: 120, maxHighlights: 40, maxRoutinePerTick: 2, repeatTicks: 15, majorDamage: 15 });
