export type Difficulty = 'easy' | 'hard';

export interface DifficultySettings {
  /** multiplier on scatter spike density */
  density: number;
  /** multiplier on the gap left in floor walls */
  wallGap: number;
  /** tunnel walls: spikes either side of the blocked direction (hard 1 → 3 spikes, easy 0 → 1 spike) */
  tubeWallReach: number;
  /** spikes placed where the player is flying */
  aimed: boolean;
  shields: number;
  /** seconds of invulnerability after a hit */
  invuln: number;
  /** glider collision radius */
  radius: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultySettings> = {
  easy: { density: 0.55, wallGap: 1.7, tubeWallReach: 0, aimed: false, shields: 5, invuln: 2.0, radius: 0.4 },
  hard: { density: 1, wallGap: 1, tubeWallReach: 1, aimed: true, shields: 3, invuln: 1.4, radius: 0.5 },
};

const KEY = 'hyperloops.difficulty';

export function loadDifficulty(): Difficulty {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'easy' || v === 'hard' ? v : 'easy';
  } catch {
    return 'easy';
  }
}

export function saveDifficulty(d: Difficulty) {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* private mode etc. — not important */
  }
}
