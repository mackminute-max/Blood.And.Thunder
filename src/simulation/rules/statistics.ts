import type { RaceState, RaceEvent } from '../../contracts/race.ts';
import type { DeepReadonly } from '../../contracts/initialization.ts';

export interface RaceStatistics { overtakes: number; timeLeadingSeconds: number; penalties: number; incidents: number; lateralChanges: number }
interface Point { fraction: number; position: number }
/** Piecewise normalized progress through authoritative boundary/contact samples. */
export function recordRaceStatistics(before: DeepReadonly<RaceState>, after: RaceState, events: readonly RaceEvent[], dt: number) {
  if (after.elapsedRaceTicks === before.elapsedRaceTicks) return [];
  const leadClockEnd = before.finishRecords.length ? 0 : Math.min(1,...events.filter(e=>e.type==='ru_finished').map(e=>'details' in e?Number(e.details.fraction):1));
  const ids = Object.keys(after.ruStates).sort();
  for(const event of events) if(event.type==='contact') {
    const participants=new Set([event.ruId,String(event.details.targetRuId??event.details.targetId??'')]);
    for(const id of participants)if(Object.hasOwn(after.ruStates,id))after.ruStates[id]!.raceStats.incidents++;
  }
  const paths = new Map<string, Point[]>(); const ends = new Map<string, number>();
  for (const id of ids) {
    const old = before.ruStates[id]!; const ru = after.ruStates[id]!;
    if (old.status !== 'active') continue;
    let position = old.initialUnwrappedCoursePosition + old.acceptedTransitions;
    const points: Point[] = [{ fraction: 0, position: old.normalizedCoursePosition }];
    let end = 1;
    for (const event of events) if ('ruId' in event && event.ruId === id) {
      if (event.type === 'movement_transition') points.push({ fraction: event.fraction, position: ++position });
      if (event.type === 'movement_sample') points.push({ fraction: event.fraction, position: position + event.progress });
      if (event.type === 'ru_finished' || event.type === 'ru_retired' || event.type === 'ru_disabled') end = Math.min(end, 'fraction' in event ? event.fraction : event.timeSeconds / dt - (after.elapsedRaceTicks - 1));
      if (event.type === 'lane_change_resolved' && event.accepted) ru.raceStats.lateralChanges++;
      if (event.type === 'handling_check' && !event.accepted) ru.raceStats.incidents++;
    }
    points.push({ fraction: end, position: ru.normalizedCoursePosition });
    points.sort((a,b) => a.fraction - b.fraction);
    paths.set(id, points); ends.set(id, Math.max(0, Math.min(1,end)));
  }
  const at = (id: string, fraction: number) => {
    const points = paths.get(id)!;
    let a = points[0]!;
    for (const b of points.slice(1)) {
      if (fraction < b.fraction && b.fraction > a.fraction) return a.position + (b.position-a.position)*(fraction-a.fraction)/(b.fraction-a.fraction);
      a = b;
    }
    return a.position;
  };
  const times = new Set([0,1,leadClockEnd,...[...paths.values()].flatMap(points => points.map(point => point.fraction))]);
  const units = [...paths.keys()];
  const baseTimes = [...times].sort((a,b)=>a-b);
  for (let i=0;i<units.length;i++) for (const b of units.slice(i+1)) for (let t=1;t<baseTimes.length;t++) {
    const a=units[i]!; const lo=baseTimes[t-1]!; const hi=baseTimes[t]!;
    const d0=at(a,lo)-at(b,lo); const d1=at(a,hi)-at(b,hi);
    if (d0*d1<0) times.add(lo+(hi-lo)*(-d0)/(d1-d0));
  }
  const ordered=[...times].sort((a,b)=>a-b); const signs=new Map<string,number>(Object.entries(after.progressOrder));
  const overtakes: { ruId: string; targetRuId: string; fraction: number }[]=[];
  for(let i=1;i<ordered.length;i++) {
    const lo=ordered[i-1]!; const hi=ordered[i]!; if(hi<=lo) continue;
    const mid=(lo+hi)/2; const active=units.filter(id=>mid<ends.get(id)!);
    if(active.length && mid < leadClockEnd) {
      const lead=Math.max(...active.map(id=>at(id,mid))); const leaders=active.filter(id=>Math.abs(at(id,mid)-lead)<1e-10);
      for(const id of leaders) after.ruStates[id]!.raceStats.timeLeadingSeconds+=(hi-lo)*dt/leaders.length;
    }
    for(let a=0;a<units.length;a++) for(const b of units.slice(a+1)) {
      const id=units[a]!; if(mid>=Math.min(ends.get(id)!,ends.get(b)!)) continue;
      const key=`${id}:${b}`; const difference=at(id,mid)-at(b,mid); const sign=Math.abs(difference)<1e-10?0:Math.sign(difference);
      const prior=signs.get(key)??Math.sign(at(id,0)-at(b,0));
      if(sign && prior && sign!==prior) {
        const actor=sign>0?id:b; const target=sign>0?b:id;
        after.ruStates[actor]!.raceStats.overtakes++; overtakes.push({ruId:actor,targetRuId:target,fraction:lo});
      }
      if(sign) signs.set(key,sign);
    }
  }
  after.progressOrder=Object.fromEntries(signs);
  return overtakes;
}
