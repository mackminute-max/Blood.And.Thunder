import { copyJson, freezeDeep } from '../shared/immutable.ts';
export interface InspectionOutput { state: unknown; events: readonly unknown[]; diagnostics: readonly unknown[]; stateHash?: string }
export interface CapturedFrame extends InspectionOutput { captureId: number }
export interface LogRow {
  index: number; kind: 'event' | 'diagnostic'; tick: number; substep: number;
  ruId: string; actorIds: readonly string[]; subsystem: string; level: string; type: string; message: string; detail: unknown;
}
export interface LogFilter { minTick?: number; maxTick?: number; ruId?: string; subsystem?: string; level?: string; type?: string; search?: string }
const object = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
export function frameTick(frame: InspectionOutput): number { return Number(object(frame.state).tick); }
export function framePhase(frame: InspectionOutput): string { return String(object(frame.state).phase); }
export function filterLogs(rows: readonly LogRow[], filter: LogFilter): LogRow[] {
  return rows.filter(row => (filter.minTick === undefined || row.tick >= filter.minTick) && (filter.maxTick === undefined || row.tick <= filter.maxTick)
    && (!filter.ruId || (row.ruId === filter.ruId || row.actorIds.includes(filter.ruId))) && (!filter.subsystem || row.subsystem === filter.subsystem)
    && (!filter.level || row.level === filter.level) && (!filter.type || row.type === filter.type)
    && (!filter.search || (JSON.stringify(row.detail) ?? '').toLowerCase().includes(filter.search.toLowerCase())));
}
/** Presentation-side bounded history; never changes the engine or authoritative state. */
export function createRecording(frameLimit = 200, recordLimit = 50000) {
  if (!Number.isSafeInteger(frameLimit) || frameLimit < 1 || !Number.isSafeInteger(recordLimit) || recordLimit < 1) throw new Error('History limits must be positive integers');
  const frames: CapturedFrame[] = []; const rows: LogRow[] = [];
  let captureId = 0; let droppedFrames = 0; let droppedRecords = 0; let index = 0;
  return {
    append(frame: InspectionOutput) {
      if (!Number.isSafeInteger(frameTick(frame)) || frameTick(frame) < 0) throw new Error('Invalid frame tick');
      const owned = freezeDeep({ ...copyJson(frame), captureId: captureId++ }) as CapturedFrame;
      frames.push(owned);
      if (frames.length > frameLimit) { frames.shift(); droppedFrames++; }
      for (const [kind, records] of [['event', frame.events], ['diagnostic', frame.diagnostics]] as const) for (const detail of records) {
        const record = object(detail); const type = String(record.type ?? 'diagnostic');
        rows.push(freezeDeep({ index: index++, kind, tick: Number(record.tick ?? frameTick(frame)), substep: Number(record.substep ?? 0), ruId: String(record.ruId ?? ''), actorIds: Array.isArray(record.actorIds) ? record.actorIds.filter((actor): actor is string => typeof actor === 'string') : [], subsystem: String(record.subsystem ?? (/^(movement_|lane_change_|handling_|collision_)/.test(type) ? 'movement' : /^(attack_|ram_|combat_|defense_|component_|ru_disabled)/.test(type) ? 'combat' : /^(hazard_|fatigue_|wreck_)/.test(type) ? 'environment' : type.startsWith('ai_') ? 'ai' : /^(command_|sign_|developer_override)/.test(type) ? 'commands' : 'rules')), level: String(record.level ?? 'info'), type, message: String(record.message ?? type), detail: copyJson(detail) }));
      }
      if (rows.length > recordLimit) { const count = rows.length - recordLimit; rows.splice(0, count); droppedRecords += count; }
    },
    frames: () => [...frames], rows: () => [...rows],
    summary: () => ({ frameLimit, recordLimit, droppedFrames, droppedRecords, retainedFrames: frames.length, retainedRecords: rows.length }),
  };
}
