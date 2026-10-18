import { PRESETS } from '../scenes/presets';
import { TRACKS, type TrackId } from './tracks';

/**
 * The run timeline. A level lasts `preset.bars` bars and plays ONE track (`preset.music`) from a chosen
 * 8-bar section (12 s) onward; the track never changes mid-level.
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
  const music = PRESETS[scene].music ?? { track: 'ref' as const, from: scene };
  const available = Math.max(1, TRACKS[music.track].sections - music.from);
  const section = music.from + (Math.floor(sceneTime / SECTION_LEN) % available);
  return {
    loop,
    scene,
    sceneTime,
    sceneLen: SCENE_LENS[scene],
    songTime: scene * SECTION_LEN + into,
    track: music.track,
    trackTime: section * SECTION_LEN + into,
  };
}

/** run time at which a scene starts (in the given loop) */
export function sceneStart(scene: number, loop = 0): number {
  return loop * LOOP_LEN + SCENE_STARTS[scene];
}
