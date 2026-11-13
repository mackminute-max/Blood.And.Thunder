/** Resolves simultaneous destinations before any position commits. */
export interface TransitionIntent { ruId: string; fromKey: string; toKey: string; stability: number; fraction: number; priority: number }
export type ConflictReason = 'occupied' | 'contested' | 'reciprocal';
export function propagateDepartures(accepted: Set<string>, intents: readonly TransitionIntent[], occupancy: ReadonlyMap<string, string>, reasons: Map<string, ConflictReason>) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const intent of intents) if (accepted.has(intent.ruId)) {
      const occupant = occupancy.get(intent.toKey);
      if (occupant && occupant !== intent.ruId && !accepted.has(occupant)) { accepted.delete(intent.ruId); reasons.set(intent.ruId, 'occupied'); changed = true; }
    }
  }
}
export function arbitrate(intents: readonly TransitionIntent[], occupancy: ReadonlyMap<string, string>, draw: () => number) {
  const sorted = [...intents].sort((a, b) => a.ruId < b.ruId ? -1 : 1);
  const destinations = new Map<string, TransitionIntent[]>();
  for (const intent of sorted) destinations.set(intent.toKey, [...destinations.get(intent.toKey) ?? [], intent]);
  const contested = new Set([...destinations.values()].filter(group => group.length > 1).flatMap(group => group.map(intent => intent.ruId)));
  const ties = new Map(sorted.filter(intent => contested.has(intent.ruId)).map(intent => [intent.ruId, draw()]));
  const accepted = new Set<string>(); const reasons = new Map<string, ConflictReason>();
  for (const group of destinations.values()) {
    group.sort((a, b) => b.priority - a.priority || b.stability - a.stability || (ties.get(b.ruId) ?? 0) - (ties.get(a.ruId) ?? 0) || (a.ruId < b.ruId ? -1 : 1));
    accepted.add(group[0]!.ruId); group.slice(1).forEach(intent => reasons.set(intent.ruId, 'contested'));
  }
  for (const intent of sorted) {
    const occupant = occupancy.get(intent.toKey); const departure = sorted.find(other => other.ruId === occupant);
    if (accepted.has(intent.ruId) && departure && accepted.has(departure.ruId) && departure.ruId !== intent.ruId && departure.toKey === intent.fromKey) {
      accepted.delete(intent.ruId); accepted.delete(departure.ruId); reasons.set(intent.ruId, 'reciprocal'); reasons.set(departure.ruId, 'reciprocal');
    }
  }
  propagateDepartures(accepted, sorted, occupancy, reasons);
  return { accepted, reasons, ties, intents: sorted };
}
