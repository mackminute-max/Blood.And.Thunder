import type { MovementDiagnostic } from '../../contracts/movement.ts';
import type { RaceScenario } from '../../configuration/schemas.ts';
const severity = { trace: 0, info: 1, warning: 2, error: 3 };
/** Sampling is diagnostic-only: no mechanics, authoritative events or RNG draws are skipped. */
export function createDiagnostics(settings: RaceScenario['diagnostics'], tick: number): MovementDiagnostic[] {
  const rows: MovementDiagnostic[] = [];
  const append = rows.push.bind(rows);
  Object.defineProperty(rows, 'push', { value: (...items: MovementDiagnostic[]) => {
    for (const item of items) if (severity[item.level] >= severity[settings.level] && (item.level !== 'trace' || tick % settings.traceEveryTicks === 0)) append(item);
    return rows.length;
  }, enumerable: false });
  return rows;
}
/** Avoid building expensive trace details when tracing is disabled/sampled out. */
export function traceDiagnostic(rows: MovementDiagnostic[], build: () => MovementDiagnostic) {
  if (traceEnabled.get(rows) !== false) rows.push(build());
}
const traceEnabled = new WeakMap<MovementDiagnostic[], boolean>();
export function diagnosticBuffer(settings: RaceScenario['diagnostics'], tick: number) {
  const rows = createDiagnostics(settings, tick);
  traceEnabled.set(rows, settings.level === 'trace' && tick % settings.traceEveryTicks === 0);
  return rows;
}
