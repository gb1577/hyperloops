import type { LevelMusic } from '../core/tracks';

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
  /**
   * glowing lines on the terrain, brightest high up. ridges (default): only the sharp creases of the upper
   * mountains · all: every facet edge everywhere, for black wireframe-and-fill worlds
   */
  ridgeGlow?: { color: Hex; intensity: number; mode?: 'ridges' | 'all' };
  /** tube: walls never come closer to the centre line than this */
  minRadius?: number;
  /** tube: how far the cave centre meanders sideways (the camera follows it) */
  wander?: number;
  seed?: number;
}

export interface ScenePreset {
  name: string;
  /** level length in bars (multiple of 8) */
  bars: number;
  /** the level's single music track and where in it to start; default: the original track from this scene's section */
  music?: LevelMusic;
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
    /** halo falloff exponent: lower = wider, softer, rounder glow (default 6) */
    haloPower?: number;
    /** strength of the tighter ring around the sun (default 0.8; lower = no visible edge) */
    ring?: number;
    /** how high above the horizon the sky reaches its top colour (default 0.4; higher = softer gradient) */
    gradient?: number;
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
    /** share of spikes that are dark obsidian: cannot be shot, must be dodged (default 0.25) */
    obsidian?: number;
    /** fraction of the play width spikes are scattered across (floor scenes) */
    spread?: number;
    color: Hex;
    /** crystal: lit glowing cones (default) · wire: dark cones drawn as glowing wireframe, like wire terrain */
    style?: 'crystal' | 'wire';
  };
  /** painterly extras: mist banks in the valleys */
  atmosphere?: {
    /** height range is in world y; opacity scales every puff */
    mist?: { color: Hex; opacity: number; height: [number, number] };
  };
  /** a hard disc of light at the far end of a tunnel that hides where it stops */
  endGlow?: { distance: number; radius: number; intensity: number };
  transition: 'flash' | 'cut';
  /** ramp vignette/fade to black across the scene (0..1 at end) */
  fadeOut?: number;
}
