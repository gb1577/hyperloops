import { PRESETS } from '../scenes/presets';
import type { TrackId } from './tracks';

/**
 * The run timeline. Music is built from 8-bar sections (12 s each) of any track (see tracks.ts).
 * A level lasts `preset.bars` bars and plays its `preset.music` playlist of sections back to back.
 * Run time t → which loop / scene / which track and where in it.
 */
export const SECTION_LEN = 12; // seconds = 8 bars @ 160 BPM

export const SCENE_LENS = PRESETS.map((p) => (p.bars / 8) * SECTION_LEN);
export const SCENE_STARTS = SCENE_LENS.map((_, i) => SCENE_LENS.slice(0, i).reduce((a, b) => a + b, 0));
export const LOOP_LEN = SCENE_LENS.reduce((a, b) => a + b, 0);

export interface Place {
  loop: number;
  scene: number;
  sceneTime: number;
  sceneLen: number;
  /** position in the reference song (seconds) — used to sync the reference video */
  songTime: number;
  /** what is actually playing: which track, and where in it (seconds) */
  track: TrackId;
  trackTime: number;
}

export function locate(t: number): Place {
  const loop = Math.floor(Math.max(0, t) / LOOP_LEN);
  const lt = Math.max(0, t) - loop * LOOP_LEN;
  let scene = SCENE_LENS.length - 1;
  for (let i = 0; i < SCENE_LENS.length; i++) {
    if (lt < SCENE_STARTS[i] + SCENE_LENS[i]) {
      scene = i;
      break;
    }
  }
  const sceneTime = lt - SCENE_STARTS[scene];
  const into = sceneTime % SECTION_LEN;
  const list = PRESETS[scene].music;
  const entry = list?.length ? list[Math.floor(sceneTime / SECTION_LEN) % list.length] : { track: 'ref' as const, section: scene };
  return {
    loop,
    scene,
    sceneTime,
    sceneLen: SCENE_LENS[scene],
    songTime: scene * SECTION_LEN + into,
    track: entry.track,
    trackTime: entry.section * SECTION_LEN + into,
  };
}

/** run time at which a scene starts (in the given loop) */
export function sceneStart(scene: number, loop = 0): number {
  return loop * LOOP_LEN + SCENE_STARTS[scene];
}
