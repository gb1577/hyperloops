import { PRESETS } from '../scenes/presets';

/**
 * The run timeline. The reference song is 10 sections of 8 bars (12 s each), one per scene.
 * In the game a scene lasts `preset.bars` bars, so its 8-bar section is repeated (seamlessly, see Music).
 * Run time t → which loop / scene / where in the song.
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
  /** position in the reference song (seconds) */
  songTime: number;
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
  return { loop, scene, sceneTime, sceneLen: SCENE_LENS[scene], songTime: scene * SECTION_LEN + (sceneTime % SECTION_LEN) };
}

/** run time at which a scene starts (in the given loop) */
export function sceneStart(scene: number, loop = 0): number {
  return loop * LOOP_LEN + SCENE_STARTS[scene];
}
