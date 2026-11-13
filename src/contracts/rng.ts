export const RNG_VERSION = 'xoshiro128ss-fnv1a-utf8-v1' as const;
export const STREAM_NAMES = ['ai', 'movement', 'combat', 'events', 'tieBreak'] as const;
export type StreamName = typeof STREAM_NAMES[number];
export type RngState = readonly [number, number, number, number];
export type RngStreams = Record<StreamName, RngState>;
