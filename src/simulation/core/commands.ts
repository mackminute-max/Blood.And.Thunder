import { commandSchema } from '../../configuration/commands.ts';
import type { SimCommand } from '../../configuration/commands.ts';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { CommandJournalEntry, CommandReceipt } from '../../contracts/ai.ts';
import type { MovementState, MovementEventInput } from '../../contracts/movement.ts';
import { copyJson, freezeDeep } from '../../shared/immutable.ts';
type CommandState = Pick<MovementState, 'tick' | 'phase' | 'ruStates' | 'commandCursor'>;
export function createCommandQueue(config: DeepReadonly<InitialConfiguration>) {
  const journal: CommandJournalEntry[] = []; const ids = new Set<string>();
  const pending: { command: SimCommand | null; rejected: string | null; entry: CommandJournalEntry }[] = [];
  let overflowRejections = 0;
  const submit = (input: unknown, state: DeepReadonly<Pick<CommandState, 'tick' | 'ruStates'>> & { readonly phase: string }, paused = false, origin: 'scripted' | 'live' = 'live'): CommandReceipt => {
    if (journal.length >= config.scenario.rules.maxCommandSubmissions) { overflowRejections++; return { accepted: false, reason: 'Command submission limit reached', effectiveTick: null }; }
    let owned: unknown = null; let error: string | null = null;
    try { const encoded = JSON.stringify(input, (_key, value: unknown) => { if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Nonfinite command value'); return value; }); if (!encoded || encoded.length > 16000) throw new Error('Command JSON exceeds 16000 characters'); owned = JSON.parse(encoded) as unknown; } catch { error = 'Invalid command schema, sign ID or registered field'; }
    const parsed = commandSchema.safeParse(owned); const command = parsed.success ? parsed.data : null;
    if (!command) error ??= 'Invalid command schema, sign ID or registered field';
    else if (ids.has(command.commandId)) error = 'Duplicate commandId';
    else if (['complete', 'error', 'halted'].includes(state.phase)) error = 'Simulation is terminal';
    else if (command.effectiveTick <= state.tick) error = 'effectiveTick must target an unprocessed tick';
    else if (command.effectiveTick > config.scenario.rules.maxTicks + config.scenario.rules.countdownTicks) error = 'Command exceeds race horizon';
    else if (!Object.hasOwn(state.ruStates, command.ruId)) error = 'Unknown RU';
    else if (command.type === 'raiseSign' && command.signId === 'attack' && config.scenario.rules.competitionStyle === 'pure') error = 'Attack sign is incompatible with Pure Racing';
    else if (command.type === 'raiseSign' && state.ruStates[command.ruId]!.pendingSign) error = 'A sign is already pending; activate or cancel it first';
    else if (command.type === 'raiseSign' && state.ruStates[command.ruId]!.signOpportunitiesRemaining === 0) error = 'No sign opportunities remaining';
    else if (command.type === 'developerOverride' && (command.source !== 'developer' || !paused || origin === 'live' && command.effectiveTick !== state.tick + 1)) error = 'Developer overrides require paused submission for the next tick';
    else if (command.type !== 'developerOverride' && !config.scenario.entries.find(entry => entry.id === command.ruId)!.isPlayer && !(command.source === 'developer' && config.scenario.rules.allowDeveloperSignCommands)) error = 'Sign target is not the controlled RU';
    const receipt: CommandReceipt = { accepted: error === null, reason: error ?? 'queued', effectiveTick: command?.effectiveTick ?? null };
    const entry: CommandJournalEntry = { submittedAtTick: state.tick, submittedAtPhase: state.phase, origin, paused, input: owned, receipt };
    journal.push(copyJson(entry));
    if (receipt.accepted && command) ids.add(command.commandId);
    pending.push({ command, rejected: error, entry });
    return freezeDeep(receipt);
  };
  return {
    submit,
    initialize(state: Parameters<typeof submit>[1]) { for (const command of config.scenario.scriptedCommands) submit(command, state, true, 'scripted'); },
    journal: () => freezeDeep(copyJson(journal)),
    summary: () => ({ overflowRejections, pendingCount: pending.length }),
    apply(state: Pick<CommandState, 'tick' | 'ruStates' | 'commandCursor'>, emit: (event: MovementEventInput) => void) {
      for (let index = 0; index < pending.length;) {
        const item = pending[index]!;
        if (!item.rejected && item.command && item.command.effectiveTick > state.tick) { index++; continue; }
        pending.splice(index, 1); state.commandCursor++;
        const command = item.command; const ru = command && Object.hasOwn(state.ruStates, command.ruId) ? state.ruStates[command.ruId] : undefined;
        let reason = item.rejected;
        if (!reason && (!ru || ru.status !== 'active')) reason = 'RU is not active';
        if (!reason && command?.type === 'raiseSign' && ru!.pendingSign) reason = 'A sign is already pending; activate or cancel it first';
        if (!reason && command?.type === 'raiseSign' && ru!.signOpportunitiesRemaining === 0) reason = 'No sign opportunities remaining';
        const base = { ruId: command?.ruId ?? '', fraction: 0 };
        if (reason || !command || !ru) { emit({ ...base, type: 'command_rejected', details: { command: item.entry.input, reason, submittedAtTick: item.entry.submittedAtTick, effectiveTick: state.tick } }); continue; }
        emit({ ...base, type: 'command_accepted', details: { command, effectiveTick: state.tick } });
        if (command.type === 'developerOverride') {
          const oldValue = command.field === 'teamFatigue' ? ru.teamFatigue : ru.derivedOverrides.maxSpeedMps ?? null;
          if (command.field === 'teamFatigue') ru.teamFatigue = command.value ?? 0;
          else if (command.value === null) delete ru.derivedOverrides.maxSpeedMps;
          else ru.derivedOverrides.maxSpeedMps = command.value;
          ru.aiMemory.reevaluate = true;
          emit({ ...base, type: 'developer_override', details: { commandId: command.commandId, field: command.field, oldValue, newValue: command.field === 'teamFatigue' ? ru.teamFatigue : ru.derivedOverrides.maxSpeedMps ?? null, source: command.source, effectiveTick: state.tick } });
        } else {
          const oldValue = ru.activeSignId;
          if (command.type === 'raiseSign') {
            ru.signOpportunitiesRemaining--;ru.signUsage.queued++;
            if(oldValue!==null)ru.signUsage.replacements++;
            ru.pendingSign={signId:command.signId,queuedAtTick:state.tick,commandId:command.commandId,source:command.source};
            emit({...base,type:'sign_queued',details:{...ru.pendingSign,oldValue,pendingSign:command.signId,opportunitiesRemaining:ru.signOpportunitiesRemaining,effectiveTick:state.tick}});
          } else if(command.type === 'cancelPendingSign') {
            const cancelled=ru.pendingSign;if(cancelled)ru.signUsage.cancelled++;ru.pendingSign=null;
            emit({...base,type:'sign_cancelled',details:{commandId:command.commandId,cancelled,refunded:false,opportunitiesRemaining:ru.signOpportunitiesRemaining,effectiveTick:state.tick}});
          } else {
            ru.activeSignId=null;ru.signUsage.lowered++;ru.aiMemory.reevaluate=true;
            emit({...base,type:'sign_lowered',details:{commandId:command.commandId,oldValue,newValue:null,pendingSign:ru.pendingSign,opportunitiesRemaining:ru.signOpportunitiesRemaining,effectiveTick:state.tick}});
          }
        }
      }
    },
  };
}
