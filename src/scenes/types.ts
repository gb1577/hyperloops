export type Hex = string;

export interface TerrainLayerSpec {
  kind: 'floor' | 'ceiling' | 'tube';
  /** face colour at low displacement / at peaks */
  colorLow: Hex;
  colorHigh: Hex;
  /** floor/ceiling: half width; tube: radius */
  size: number;
  /** floor: y of the base plane; ceiling: y of the roof */
  base: number;
  /** grid cell size across / along travel */
  cell: number;
  cellZ?: number;
  /** broad noise displacement */
  amp: number;
  freq: [number, number];
  /** >1 sharpens peaks */
  sharp: number;
  ridged?: boolean;
  /** probability per vertex of an extra spike and its max height */
  spikeChance: number;
  spikeHeight: number;
  /** random xy/z vertex jitter as fraction of cell */
  jitter: number;
  /** floor/ceiling: keep the flight path open. [inner, outer, minFactor] in units of |x| */
  clearance?: [number, number, number];
  /** tube: weight displacement toward the sides (0 = uniform, 1 = only left/right walls) */
  sideWeight?: number;
  /** per-face random brightness variation */
  shadeJitter?: number;
  wireframe?: boolean;
  /** wireframe line opacity */
  opacity?: number;
  /** tube: walls never come closer to the centre line than this */
  minRadius?: number;
  /** tube: how far the cave centre meanders sideways (the camera follows it) */
  wander?: number;
  seed?: number;
}

export interface ScenePreset {
  name: string;
  /** level length in bars; the scene's 8-bar music section repeats to fill it */
  bars: number;
  sky: {
    top: Hex;
    horizon: Hex;
    ground: Hex;
    sun: Hex;
    /** direction from camera to sun (camera looks down -z) */
    sunDir: [number, number, number];
    sunIntensity: number;
    /** 0..1 width of the big halo */
    halo: number;
  };
  /** exponential fog by default; set near/far for linear fog that leaves the foreground crisp */
  fog: { color: Hex; density: number; near?: number; far?: number };
  light: { color: Hex; intensity: number; dir: [number, number, number]; hemiSky: Hex; hemiGround: Hex; hemi: number };
  layers: TerrainLayerSpec[];
  camera: {
    fov: number;
    speed: number;
    height: number;
    pitch: number; // radians, + looks up
    roll: number; // static roll radians
    rollSwing: number; // amplitude radians
    rollPeriodBars: number;
    sway: number; // lateral drift amplitude
  };
  lines?: {
    scan?: { count: number; color: Hex; opacity: number };
    lasers?: { count: number; color: Hex; opacity: number; thickness: number; mode: 'radial' | 'cross' };
  };
  post: {
    bloom: number;
    bloomRadius: number;
    threshold: number;
    exposure: number;
    vignette: number;
    vignetteColor: Hex;
    grain: number;
    /** how strongly the kick pumps bloom/sun */
    pump: number;
    /** soft haze rising from the bottom of the frame; height is a fraction of screen height */
    haze?: { color: Hex; amount: number; height: number };
  };
  /**
   * Where the glider may fly, relative to the path point at the scene's flight height.
   * Floor/ceiling scenes: halfWidth sideways, down/up vertically. Tube scenes: halfWidth is a radius.
   */
  play: { halfWidth: number; down: number; up: number };
  /** beat-scheduled spikes; omitted = a breather scene */
  hazards?: {
    /** which bar patterns this scene draws from (one per bar, chosen by the bar number) */
    patterns: Array<'scatter' | 'wall' | 'slalom' | 'aimed'>;
    /** spikes per beat in scatter bars */
    perBeat: number;
    /** light shards per bar on top of the ones placed by patterns */
    shards?: number;
    radius: [number, number];
    /** floor / ceiling / both (floor+ceiling) / wall (tube) */
    place: 'floor' | 'ceiling' | 'both' | 'wall';
    /** fraction of the play width spikes are scattered across (floor scenes) */
    spread?: number;
    color: Hex;
  };
  transition: 'flash' | 'cut';
  /** ramp vignette/fade to black across the scene (0..1 at end) */
  fadeOut?: number;
}
