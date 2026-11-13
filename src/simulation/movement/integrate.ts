import { clamp } from '../entities/derive.ts';
/** A.2 trapezoidal travel approximation; the current speed is integrated once/tick. */
export function integrateSpeed(v0: number, target: number, acceleration: number, braking: number, maxSpeed: number, dt: number) {
  if (![v0, target, acceleration, braking, maxSpeed, dt].every(Number.isFinite) || v0 < 0 || target < 0 || acceleration < 0 || braking < 0 || maxSpeed < 0 || dt <= 0) throw new Error('Invalid speed integration inputs');
  const speedMps = clamp(v0 + clamp(target - v0, -braking * dt, acceleration * dt), 0, maxSpeed);
  const travelMeters = (v0 + speedMps) / 2 * dt;
  if (!Number.isFinite(travelMeters)) throw new Error('Nonfinite travel budget');
  return { speedMps, travelMeters };
}
