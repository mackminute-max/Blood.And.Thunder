import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { PositionChange, PresentationEvent } from '../race/model.ts';
import { COMMENTARY } from './settings.ts';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export interface Call { id: string; tick: number; fraction: number; priority: Priority; text: string; sourceIds: string[]; type: string }
const weight = { critical: 4, high: 3, medium: 2, low: 1 };
export function createCommentary(config: DeepReadonly<InitialConfiguration>, settings = COMMENTARY) {
  let calls: Call[] = []; let highlights: Call[] = []; const recent = new Map<string, number>(); let lastTick = -1; let suppressed = 0;
  const name = (id: unknown) => config.scenario.entries.find(e => e.id === id)?.name ?? String(id ?? 'Racer');
  return {
    append(tick: number, events: readonly DeepReadonly<PresentationEvent>[], changes: readonly PositionChange[] = []) {
      if (tick <= lastTick) return; lastTick = tick;
      const actorId = (eventId: string) => { const event = events.find(e => e.id === eventId); return event && 'ruId' in event ? event.ruId : null; };
      const candidates: Call[] = []; const outcomeIds = new Set(events.filter(e => e.type === 'attack_hit' || e.type === 'attack_miss').map(e => String(e.details.attackId)));
      const add = (event: DeepReadonly<PresentationEvent>, priority: Priority, text: string, sourceIds = [event.id]) => candidates.push({ id: `call:${event.id}`, tick: event.tick, fraction: 'fraction' in event ? event.fraction : 'details' in event && typeof event.details.fraction === 'number' ? event.details.fraction : ['race_finished', 'ru_dnf'].includes(event.type) ? 1 : 0, priority, text, sourceIds, type: event.type });
      for (const e of events) {
        const actor = 'ruId' in e ? name(e.ruId) : '';
        const d = 'details' in e ? e.details : {};
        switch (e.type) {
          case 'race_started': add(e, 'high', 'The start is given—Blood and Thunder is under way!'); break;
          case 'lap_started': add(e, 'medium', `${actor} crosses the line to begin lap one.`); break;
          case 'lap_crossed': add(e, 'medium', `${actor} completes lap ${String(d.completedLaps)}!`); break;
          case 'ru_finished': add(e, 'critical', `${actor} crosses the finish at ${e.timeSeconds.toFixed(3)} seconds!`); break;
          case 'race_finished': add(e, 'critical', Array.isArray(d.winnerIds) && d.winnerIds.length ? `Race classified! ${d.winnerIds.map(name).join(' and ')} ${d.winnerIds.length === 1 ? 'takes' : 'share'} the victory.` : 'Race classified—no eligible finisher.'); break;
          case 'ru_disabled': add(e, 'critical', `${actor} is disabled and out of the running.`); break;
          case 'ru_retired': add(e, 'critical', `${actor} retires from the race.`); break;
          case 'ru_dnf': add(e, 'critical', `${actor} is classified DNF: ${String(d.reason).replaceAll('_', ' ')}.`); break;
          case 'invariant_violation': add(e, 'critical', 'Race stopped: the simulation reported an error. No result is confirmed.'); break;
          case 'attack_hit': add(e, Number(d.amount) >= settings.majorDamage ? 'high' : 'medium', `${actor} lands ${d.channel === 'ram' ? 'a lateral ram on' : 'a hit on'} ${name(d.targetRuId)}—${String(d.amount)} damage to ${String(d.componentKind)}.`); break;
          case 'attack_miss': add(e, 'low', `${actor} attacks ${name(d.targetRuId)}, but misses.`); break;
          case 'attack_attempt': case 'ram_attempt': if (!outcomeIds.has(String(d.attackId))) add(e, 'low', `${actor} attempts ${e.type === 'ram_attempt' ? 'a lateral ram on' : 'an attack against'} ${name(d.targetRuId)}.`); break;
          case 'attack_rejected': if (e.ruId === config.scenario.entries.find(entry => entry.isPlayer)?.id) add(e, 'low', `${actor}'s planned attack cannot proceed: ${String(d.reason).replaceAll('_', ' ')}.`); break;
          case 'component_disabled': add(e, 'high', `${actor}'s ${String(d.componentKind)} is disabled${d.dead === true ? '; a fatality is confirmed' : d.destroyed === true ? ' and destroyed' : ''}.`); break;
          case 'contact': if (d.accidental === true) add(e, d.severity === 'major' ? 'high' : 'medium', `${actor} makes ${String(d.severity)} contact with ${name(d.targetId)}.`); break;
          case 'hazard_activated': { const hazard = d.hazard as { type: string }; add(e, 'medium', hazard.type === 'animal_crossing' ? 'An animal enters the course—watch that lane!' : hazard.type === 'debris_spawn' ? 'Debris is on the course!' : 'A patch of rough track develops on the course.'); break; }
          case 'wreck_removed': add(e, 'medium', `${actor}'s wreck is cleared from the course.`); break;
          case 'sign_queued': add(e, 'low', `${actor}'s ${String(d.pendingSign).replaceAll('-', ' ')} sign is queued for the next line crossing.`); break;
          case 'sign_cancelled': if(d.cancelled) add(e, 'low', `${actor}'s pending sign is cancelled; its opportunity is not refunded.`); break;
          case 'sign_activated':
          case 'sign_raised': add(e, 'medium', `${actor}'s ${String(d.newValue ?? 'strategy').replaceAll('-', ' ')} sign is active; the driver still chooses the response.`); break;
          case 'sign_lowered': if(d.oldValue !== null) add(e, 'low', `${actor}'s sign is lowered.`); break;
          case 'lane_change_resolved': if (e.accepted) add(e, 'low', `${actor} moves to lane ${e.to.lane + 1}.`); break;
        }
      }
      for (const change of changes) candidates.push({ id: `call:${change.id}`, tick, fraction: 1, priority: change.lead ? 'high' : 'medium', text: `${name(change.ruId)} moves ahead of ${name(change.passedRuId)}${change.lead ? ' and takes the outright lead' : ''}!`, sourceIds: change.evidence, type: 'position_change' });
      // Combine same-tick lap/finish and attack outcome chatter; retain every critical call.
      const finished = new Set(events.filter(e => e.type === 'ru_finished').map(e => 'ruId' in e ? e.ruId : null));
      const ranked = candidates.filter(call => !(call.type === 'lap_crossed' && finished.has(actorId(call.sourceIds[0]!) ?? ''))).sort((a, b) => weight[b.priority] - weight[a.priority] || candidates.indexOf(a) - candidates.indexOf(b));
      let routine = 0;
      const selected = ranked.filter(call => {
        if (call.priority === 'critical' || call.priority === 'high') return true;
        const key = `${call.type}:${actorId(call.sourceIds[0]!) ?? ''}`;
        if (routine >= settings.maxRoutinePerTick || tick - (recent.get(key) ?? -Infinity) < settings.repeatTicks) { suppressed++; return false; }
        recent.set(key, tick); routine++; return true;
      }).sort((a, b) => a.fraction - b.fraction || candidates.indexOf(a) - candidates.indexOf(b));
      calls = [...calls, ...selected].slice(-settings.maxFeed);
      highlights = [...highlights, ...selected.filter(call => call.priority === 'critical' || call.priority === 'high')].sort((a, b) => weight[b.priority] - weight[a.priority] || a.tick - b.tick).slice(0, settings.maxHighlights);
    },
    feed: () => calls.map(call => ({ ...call, sourceIds: [...call.sourceIds] })), highlights: () => highlights.map(call => ({ ...call, sourceIds: [...call.sourceIds] })), summary: () => ({ suppressed, retained: calls.length, highlightCount: highlights.length }),
  };
}
