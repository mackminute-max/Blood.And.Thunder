import Phaser from 'phaser';
import type { DeepReadonly, InitialConfiguration } from '../../contracts/initialization.ts';
import type { ViewFrame } from '../race/model.ts';
import { VIEW, tilePoint, visualPath, samplePath } from './geometry.ts';
export interface ViewerUpdate { config: DeepReadonly<InitialConfiguration>; frame: ViewFrame; previous: ViewFrame | null; durationMs: number; selectedId: string | null; follow: boolean }
/** All coordinates and tween clocks are presentation only. No engine reference is retained. */
export function startViewer(onSelect: (id: string) => void) {
  let latest: ViewerUpdate | null = null; let scene: Phaser.Scene | null = null; let graphics: Phaser.GameObjects.Graphics | null = null; let started = 0;
  const labels: Phaser.GameObjects.Text[] = []; const hitTargets = new Map<string, Phaser.GameObjects.Zone>();
  let renderedKey = ''; let paths = new Map<string, ReturnType<typeof visualPath>>();
  const draw = (now: number) => {
    if (!scene || !graphics || !latest) return;
    scene.scale.updateBounds();
    const { config, frame, selectedId, follow } = latest;
    const track = config.content.tracks.find(track => track.id === config.scenario.trackId)!;
    const key = `${config.scenario.seed}:${frame.stateHash}:${latest.durationMs}:${follow}:${selectedId}`;
    if (key !== renderedKey) {
      renderedKey = key; started = now;
      paths = new Map(Object.keys(frame.state.ruStates).map(id => [id, visualPath(track, id, latest!.previous, frame)]));
      for (const label of labels) label.destroy(); labels.length = 0;
      for (const target of hitTargets.values()) target.destroy(); hitTargets.clear();
      for (const entry of config.scenario.entries) {
        const ru = frame.state.ruStates[entry.id]!;
        if (ru.wreckRemoved) continue;
        const target = scene.add.zone(0, 0, 24, 24).setInteractive({ useHandCursor: true }); target.on('pointerdown', () => onSelect(entry.id)); hitTargets.set(entry.id, target);
        labels.push(scene.add.text(0, 0, entry.name, { fontSize: '12px', color: entry.isPlayer ? '#ffe18a' : '#f2f5f7', backgroundColor: '#17232b' }).setData('ruId', entry.id));
      }
      document.getElementById('viewer')!.dataset.cameraMode = follow ? 'follow' : 'full';
      document.getElementById('viewer')!.dataset.tick = String(frame.state.tick);
      document.getElementById('viewer')!.dataset.markerCount = String(hitTargets.size);
      document.getElementById('viewer')!.dataset.hazardCount = String(frame.state.hazards.length);
    }
    const alpha = latest.durationMs > 0 ? Math.min(1, (now - started) / latest.durationMs) : 1;
    graphics.clear();
    for (const segment of track.segments) for (const lane of segment.lanes) {
      const p = tilePoint(track, { segmentId: segment.id, lane: lane.index }); const q = tilePoint(track, lane.next);
      graphics.lineStyle(VIEW.laneWidth - 2, segment.kind === 'corner' ? 0x47523d : 0x404a50, 1); graphics.lineBetween(p.x, p.y, q.x, q.y);
      if (segment.startFinishBoundary) { graphics.lineStyle(3, 0xe9dca5); graphics.lineBetween(p.x - 6, p.y, p.x + 6, p.y); }
    }
    for (const hazard of frame.state.hazards) {
      const p = tilePoint(track, hazard.tile, .5); graphics.fillStyle(hazard.type === 'track_roughness' ? 0x917249 : hazard.type === 'animal_crossing' ? 0xdc8fe0 : 0xef952e, .9); graphics.fillRect(p.x - 6, p.y - 6, 12, 12);
    }
    const visiblePositions: Record<string, { x: number; y: number; segmentId: string; lane: number; progress: number; status: string }> = {};
    const ids = Object.keys(frame.state.ruStates).sort();
    for (const [index, id] of ids.entries()) {
      const ru = frame.state.ruStates[id]!; if (ru.wreckRemoved) continue;
      const p = samplePath(paths.get(id)!, alpha); const entry = config.scenario.entries.find(entry => entry.id === id)!;
      const color = entry.isPlayer ? 0xffd86b : [0x63c7da, 0xec917b, 0xb6cf77, 0xb18fdb, 0xebbb83][index % 5]!;
      graphics.fillStyle(ru.status === 'disabled' ? 0x7b7b7b : color); graphics.fillCircle(p.x, p.y, entry.isPlayer ? 8 : 6);
      if (ru.status !== 'active') { graphics.lineStyle(2, 0xffffff); graphics.lineBetween(p.x - 5, p.y - 5, p.x + 5, p.y + 5); }
      if (id === selectedId) { graphics.lineStyle(2, 0xffffff); graphics.strokeCircle(p.x, p.y, 12); }
      hitTargets.get(id)?.setPosition(p.x, p.y);
      labels.find(label => label.getData('ruId') === id)?.setPosition(p.x + 9, p.y - 17);
      visiblePositions[id] = { ...p, segmentId: ru.tile.segmentId, lane: ru.tile.lane, progress: ru.progressInSegment, status: ru.status };
    }
    // Confirmed event cues for the latest tick; an attempt never draws a hit burst.
    for (const event of frame.events) if (event.type === 'attack_hit' || event.type === 'contact') {
      const from = visiblePositions[event.ruId]; const targetId = String(event.details.targetRuId ?? event.details.targetId ?? ''); const to = visiblePositions[targetId];
      if (from && to) { graphics.lineStyle(event.type === 'attack_hit' ? 3 : 2, event.type === 'attack_hit' ? 0xf7e993 : 0xef8f65, .8); graphics.lineBetween(from.x, from.y, to.x, to.y); }
    }
    const camera = scene.cameras.main;
    const selected = selectedId ? visiblePositions[selectedId] : undefined;
    camera.setZoom(follow && selected ? 1.65 : 1); camera.centerOn(follow && selected ? selected.x : VIEW.centerX, follow && selected ? selected.y : VIEW.centerY);
    document.getElementById('viewer')!.dataset.positions = JSON.stringify(visiblePositions);
    document.getElementById('viewer')!.dataset.interpolating = String(alpha < 1);
  };
  const ready = (value: Phaser.Scene) => { scene = value; graphics = value.add.graphics(); document.documentElement.dataset.viewerReady = 'true'; };
  const game = new Phaser.Game({ type: Phaser.CANVAS, width: VIEW.width, height: VIEW.height, parent: 'viewer', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, backgroundColor: '#17252c', banner: false, audio: { noAudio: true }, scene: { create() { ready(this); }, update(time: number) { draw(time); } } });
  return { game, update(update: ViewerUpdate) { latest = update; renderedKey = ''; }, clear() { latest = null; graphics?.clear(); for (const label of labels) label.destroy(); labels.length = 0; for (const target of hitTargets.values()) target.destroy(); hitTargets.clear(); document.getElementById('viewer')!.dataset.markerCount = '0'; document.getElementById('viewer')!.dataset.positions = '{}'; } };
}
