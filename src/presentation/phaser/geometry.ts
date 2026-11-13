import type { DeepReadonly } from '../../contracts/initialization.ts';
import type { ContentRegistry, TileRef } from '../../configuration/schemas.ts';
import type { ViewFrame } from '../race/model.ts';
type Track = DeepReadonly<ContentRegistry['tracks'][number]>;
export const VIEW = { width: 960, height: 500, centerX: 480, centerY: 250, radiusX: 340, radiusY: 145, laneWidth: 16 };
export interface Point { x: number; y: number }
/** Schematic topology, equal visual segment angles; never a physical distance calculation. */
export function tilePoint(track: Track, tile: DeepReadonly<TileRef>, fraction = 0): Point {
  const segment = track.segments.find(s => s.id === tile.segmentId)!; const lane = segment.lanes.find(l => l.index === tile.lane)!;
  const angle = -Math.PI / 2 + (segment.order + fraction) / track.segments.length * Math.PI * 2;
  const laneIndex = tile.lane + (lane.next.lane - tile.lane) * fraction;
  return { x: VIEW.centerX + (VIEW.radiusX + laneIndex * VIEW.laneWidth) * Math.cos(angle), y: VIEW.centerY + (VIEW.radiusY + laneIndex * VIEW.laneWidth) * Math.sin(angle) };
}
export function visualPath(track: Track, id: string, previous: ViewFrame | null, current: ViewFrame) {
  const ru = current.state.ruStates[id]!; const old = previous?.state.ruStates[id];
  if (!old || previous!.state.tick + 1 !== current.state.tick) return [{ fraction: 0, ...tilePoint(track, ru.tile, ru.progressInSegment) }, { fraction: 1, ...tilePoint(track, ru.tile, ru.progressInSegment) }];
  const path = [{ fraction: 0, ...tilePoint(track, old.tile, old.progressInSegment) }];
  for (const event of current.events) if ('ruId' in event && event.ruId === id) {
    if (event.type === 'lane_change_resolved' && event.accepted) path.push({ fraction: 0, ...tilePoint(track, event.to, old.progressInSegment) });
    if (event.type === 'movement_transition') path.push({ fraction: event.fraction, ...tilePoint(track, event.to) });
  }
  path.push({ fraction: 1, ...tilePoint(track, ru.tile, ru.progressInSegment) });
  return path;
}
export function samplePath(path: readonly (Point & { fraction: number })[], fraction: number): Point {
  const next = path.findIndex(point => point.fraction > fraction);
  if (next < 0) { const point = path.at(-1)!; return { x: point.x, y: point.y }; }
  const a = path[Math.max(0, next - 1)]!; const b = path[next]!;
  const ratio = b.fraction > a.fraction ? Math.max(0, Math.min(1, (fraction - a.fraction) / (b.fraction - a.fraction))) : 1;
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
}
