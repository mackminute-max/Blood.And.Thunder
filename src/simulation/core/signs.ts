import type { MovementRU, MovementEventInput } from '../../contracts/movement.ts';
/** Called only at the common signal or an authoritative forward line transition. */
export function activatePendingSign(ru: MovementRU, tick: number, fraction: number, context: 'starting_signal' | 'line_crossing', emit: (event: MovementEventInput)=>void) {
  if(ru.status!=='active'||!ru.pendingSign)return;
  const pending=ru.pendingSign;const oldValue=ru.activeSignId;
  ru.activeSignId=pending.signId;ru.pendingSign=null;ru.signUsage.activated++;ru.aiMemory.reevaluate=true;
  emit({type:'sign_activated',ruId:ru.id,fraction,details:{...pending,oldValue,newValue:ru.activeSignId,context,effectiveTick:tick,fraction,opportunitiesRemaining:ru.signOpportunitiesRemaining}});
}
