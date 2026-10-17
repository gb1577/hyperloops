import type { ScenePreset } from './types';
import type { SectionRef, TrackId } from '../core/tracks';

const S = (track: TrackId, section: number): SectionRef => ({ track, section });

/**
 * The 10 scenes of the 2016 reference video, one per 12s (8 bars @160 BPM).
 * Colours were sampled by eye from ref/hyperloops-01-game.mp4 stills (docs/storyboard/frames).
 */
const basePost = {
  bloom: 0.6,
  bloomRadius: 0.45,
  threshold: 1.0,
  exposure: 0.9,
  vignette: 0.75,
  vignetteColor: '#000000',
  grain: 0.03,
  pump: 0.35,
};

const baseCam = {
  fov: 62,
  speed: 26,
  height: 7,
  pitch: 0.02,
  roll: 0,
  rollSwing: 0.03,
  rollPeriodBars: 4,
  sway: 2,
};

export const PRESETS: ScenePreset[] = [
  // 1 · Sepia Peaks — warm brown faceted mountains, giant warm sun bloom
  {
    name: 'Sepia Peaks',
    bars: 32,
    music: [S('ref', 0), S('t2', 0), S('t2', 1), S('t2', 2)],
    sky: { top: '#4a342e', horizon: '#cfae8c', ground: '#a07c64', sun: '#fff0b8', sunDir: [0, 0.16, -1], sunIntensity: 2.4, halo: 1.0 },
    fog: { color: '#e6c9a0', density: 0.006 },
    light: { color: '#fff0dc', intensity: 3, dir: [-0.5, 0.7, 0.3], hemiSky: '#fff2dc', hemiGround: '#2a1820', hemi: 0.6 },
    layers: [
      {
        kind: 'floor', colorLow: '#3d2a2a', colorHigh: '#f2d4ca', size: 140, base: 0, cell: 6, amp: 12, freq: [0.05, 0.05],
        sharp: 1.3, ridged: true, spikeChance: 0.3, spikeHeight: 16, jitter: 0.45, clearance: [3, 16, 0.3], shadeJitter: 0.14,
      },
    ],
    camera: { ...baseCam, height: 9, pitch: 0.06, sway: 1.2 },
    post: { ...basePost, vignetteColor: '#2a1916', vignette: 0.85 },
    play: { halfWidth: 9, down: 6, up: 5 },
    hazards: { patterns: ['scatter', 'slalom', 'aimed', 'wall'], perBeat: 0.9, radius: [1.4, 2.2], place: 'floor', spread: 0.9, color: '#ffd9c2' },
    transition: 'cut',
  },

  // 2 · Jade Spires — thin green crystal spikes, horizontal white scanlines
  {
    name: 'Jade Spires',
    bars: 32,
    music: [S('ref', 1), S('t3', 0), S('t3', 1), S('t3', 2)],
    sky: { top: '#5c7a6a', horizon: '#a8c8b4', ground: '#88a894', sun: '#ffffff', sunDir: [0.12, 0.2, -1], sunIntensity: 2.4, halo: 1.0 },
    fog: { color: '#c8e6d2', density: 0.007 },
    light: { color: '#f2fff4', intensity: 3, dir: [-0.5, 0.7, 0.3], hemiSky: '#e6fff0', hemiGround: '#0c2016', hemi: 0.6 },
    layers: [
      {
        kind: 'floor', colorLow: '#122a1c', colorHigh: '#c6f2d2', size: 120, base: 0, cell: 2.4, amp: 3, freq: [0.05, 0.05],
        sharp: 1.2, spikeChance: 0.24, spikeHeight: 15, jitter: 0.35, clearance: [2, 10, 0.2], shadeJitter: 0.18,
      },
    ],
    camera: { ...baseCam, height: 7, pitch: 0.08, sway: 1.5 },
    lines: { scan: { count: 7, color: '#ffffff', opacity: 0.9 } },
    post: { ...basePost, vignetteColor: '#13241b', vignette: 0.7 },
    play: { halfWidth: 8, down: 5, up: 5 },
    hazards: { patterns: ['wall', 'scatter', 'slalom', 'aimed'], perBeat: 1.25, radius: [1.0, 1.6], place: 'floor', spread: 0.9, color: '#b8ffd0' },
    transition: 'cut',
  },

  // 3 · Violet Tunnel — purple low-poly cave flying toward a blinding exit, laser streaks
  {
    name: 'Violet Tunnel',
    bars: 32,
    music: [S('ref', 2), S('t2', 3), S('t2', 4), S('t2', 5)],
    sky: { top: '#ffffff', horizon: '#ffffff', ground: '#ffffff', sun: '#ffffff', sunDir: [0, 0, -1], sunIntensity: 3, halo: 0.9 },
    fog: { color: '#f0eaff', density: 0.015 },
    light: { color: '#f0e8ff', intensity: 2.6, dir: [-0.3, 0.5, 0.6], hemiSky: '#d8ccff', hemiGround: '#20184a', hemi: 0.7 },
    layers: [
      {
        kind: 'tube', colorLow: '#262050', colorHigh: '#b5a6f2', size: 16, base: 0, cell: 3, amp: 7, freq: [0.25, 0.05],
        sharp: 1.4, spikeChance: 0.25, spikeHeight: 5, jitter: 0.45, minRadius: 8.5, shadeJitter: 0.2,
      },
    ],
    camera: { ...baseCam, height: 0, pitch: 0, rollSwing: 0.12, rollPeriodBars: 8, sway: 1.2, speed: 30 },
    lines: { lasers: { count: 10, color: '#ffffff', opacity: 0.95, thickness: 0.08, mode: 'radial' } },
    post: { ...basePost, vignetteColor: '#140f38', vignette: 0.9, bloom: 0.8, threshold: 0.9 },
    play: { halfWidth: 7, down: 7, up: 7 },
    hazards: { patterns: ['wall', 'scatter', 'slalom', 'aimed'], perBeat: 1, radius: [1.2, 1.8], place: 'wall', color: '#cfc2ff' },
    transition: 'cut',
  },

  // 4 · Ice Shards — teal/steel chaos, crossing white beams (the drop)
  {
    name: 'Ice Shards',
    bars: 32,
    music: [S('ref', 3), S('t3', 3), S('t3', 4), S('ref', 3)],
    sky: { top: '#c9dcdc', horizon: '#e4f0ef', ground: '#c9dcdc', sun: '#ffffff', sunDir: [0.05, 0.05, -1], sunIntensity: 1.5, halo: 0.35 },
    fog: { color: '#dcebea', density: 0.017 },
    light: { color: '#f0ffff', intensity: 3.4, dir: [0.5, 0.5, 0.4], hemiSky: '#e0f4f4', hemiGround: '#28404a', hemi: 1.1 },
    layers: [
      {
        kind: 'tube', colorLow: '#1c3440', colorHigh: '#d4eef0', size: 12, base: 0, cell: 4, cellZ: 6, amp: 6, freq: [0.4, 0.04],
        sharp: 1.0, spikeChance: 0.35, spikeHeight: 8, jitter: 0.7, minRadius: 7.5, shadeJitter: 0.3,
      },
    ],
    camera: { ...baseCam, height: 0, rollSwing: 0.35, rollPeriodBars: 4, sway: 2, speed: 34, fov: 70 },
    lines: { lasers: { count: 14, color: '#ffffff', opacity: 1, thickness: 0.12, mode: 'cross' } },
    post: { ...basePost, vignetteColor: '#050b10', vignette: 0.7, pump: 0.35, bloom: 0.55, bloomRadius: 0.5 },
    play: { halfWidth: 6, down: 6, up: 6 },
    hazards: { patterns: ['wall', 'aimed', 'scatter', 'slalom'], perBeat: 1.5, radius: [1.0, 1.5], place: 'wall', color: '#c8ffff' },
    transition: 'flash',
  },

  // 5 · Wire Cave — a meandering wireframe cave dissolving into white light, long black lines crossing
  {
    name: 'Wire Cave',
    bars: 16,
    music: [S('ref', 4), S('t3', 5)],
    sky: { top: '#7c7a9a', horizon: '#b4b2cc', ground: '#7c7a9a', sun: '#ffffff', sunDir: [0.1, 0.05, -1], sunIntensity: 0.9, halo: 0.08 },
    fog: { color: '#f2f0fa', density: 0, near: 30, far: 150 },
    light: { color: '#ffffff', intensity: 1, dir: [0, 1, 0], hemiSky: '#ffffff', hemiGround: '#888899', hemi: 1 },
    layers: [
      {
        kind: 'tube', colorLow: '#1e2636', colorHigh: '#3c4a5e', size: 13, base: 0, cell: 2.6, cellZ: 3.2, amp: 6, freq: [0.18, 0.06],
        sharp: 1.1, spikeChance: 0.2, spikeHeight: 3, jitter: 0.9, wireframe: true, opacity: 0.6, wander: 7, minRadius: 8,
      },
      {
        kind: 'tube', colorLow: '#3a4458', colorHigh: '#5a6478', size: 24, base: 0, cell: 4, cellZ: 5, amp: 9, freq: [0.12, 0.05],
        sharp: 1.2, spikeChance: 0.15, spikeHeight: 4, jitter: 0.9, wireframe: true, opacity: 0.28, wander: 7, minRadius: 14, seed: 5,
      },
    ],
    camera: { ...baseCam, height: 0, pitch: 0, rollSwing: 0.25, rollPeriodBars: 8, sway: 0.4, speed: 22 },
    lines: {
      lasers: { count: 8, color: '#06060c', opacity: 1, thickness: 0.1, mode: 'cross' },
    },
    post: { ...basePost, vignetteColor: '#262440', vignette: 1.0, pump: 0.12 },
    play: { halfWidth: 5, down: 5, up: 5 },
    hazards: { patterns: ['scatter', 'slalom'], perBeat: 0.6, shards: 3, radius: [0.9, 1.3], place: 'wall', color: '#e9e6ff' },
    endGlow: { distance: 120, radius: 15, intensity: 2.2 },
    transition: 'cut',
  },

  // 6 · Amethyst Ridge — purple terrain under a white sky, banking horizon
  {
    name: 'Amethyst Ridge',
    bars: 32,
    music: [S('ref', 5), S('t2', 6), S('t2', 7), S('t2', 8)],
    sky: { top: '#ffffff', horizon: '#ffe6ff', ground: '#c8a8f0', sun: '#ffd8ff', sunDir: [-0.2, 0.25, -1], sunIntensity: 1.6, halo: 0.6 },
    fog: { color: '#f4e4ff', density: 0.0018 },
    light: { color: '#ffffff', intensity: 1.6, dir: [-0.4, 0.8, 0.3], hemiSky: '#d0c0ff', hemiGround: '#120c40', hemi: 0.35 },
    layers: [
      {
        kind: 'floor', colorLow: '#1a1250', colorHigh: '#8a78e6', size: 140, base: 0, cell: 5, amp: 16, freq: [0.02, 0.03],
        sharp: 1.3, spikeChance: 0.15, spikeHeight: 6, jitter: 0.45, clearance: [2, 20, 0.35], shadeJitter: 0.15,
      },
    ],
    camera: { ...baseCam, height: 13, pitch: -0.06, roll: 0.1, rollSwing: 0.22, rollPeriodBars: 2, sway: 4 },
    post: { ...basePost, vignetteColor: '#2c1e70', vignette: 0.45 },
    play: { halfWidth: 10, down: 9, up: 5 },
    hazards: { patterns: ['slalom', 'wall', 'scatter', 'aimed'], perBeat: 1, radius: [1.5, 2.3], place: 'floor', spread: 0.9, color: '#c9bcff' },
    transition: 'cut',
  },

  // 7 · Rose Canyon — pink floor and ceiling, yellow core light
  {
    name: 'Rose Canyon',
    bars: 32,
    music: [S('ref', 6), S('t3', 6), S('t3', 7), S('ref', 6)],
    sky: { top: '#fff2d0', horizon: '#fff8c0', ground: '#fff2d0', sun: '#fff6b0', sunDir: [0, 0.02, -1], sunIntensity: 3.5, halo: 1.5 },
    fog: { color: '#fff0d8', density: 0.014 },
    light: { color: '#fff4e8', intensity: 2.8, dir: [-0.3, 0.6, 0.5], hemiSky: '#ffd0e4', hemiGround: '#8a2858', hemi: 1.2 },
    layers: [
      {
        kind: 'floor', colorLow: '#9a2a5e', colorHigh: '#ffd0e4', size: 110, base: -6, cell: 4, amp: 7, freq: [0.05, 0.05],
        sharp: 1.4, spikeChance: 0.22, spikeHeight: 7, jitter: 0.45, clearance: [3, 16, 0.3], shadeJitter: 0.16,
      },
      {
        kind: 'ceiling', colorLow: '#7a2050', colorHigh: '#f8b8d8', size: 110, base: 14, cell: 4, amp: 7, freq: [0.05, 0.05],
        sharp: 1.4, spikeChance: 0.22, spikeHeight: 7, jitter: 0.45, clearance: [3, 16, 0.3], shadeJitter: 0.16, seed: 7,
      },
    ],
    camera: { ...baseCam, height: 9, pitch: 0, sway: 2, speed: 28 },
    post: { ...basePost, vignetteColor: '#5a1438', vignette: 0.55 },
    play: { halfWidth: 9, down: 6.5, up: 7 },
    hazards: { patterns: ['scatter', 'wall', 'aimed', 'slalom'], perBeat: 1.25, radius: [1.2, 1.9], place: 'both', spread: 0.9, color: '#ffc8e2' },
    transition: 'cut',
  },

  // 8 · Solar Shear — orange shards streaking sideways (second drop, top speed)
  {
    name: 'Solar Shear',
    bars: 32,
    music: [S('ref', 7), S('t2', 9), S('t2', 10), S('ref', 7)],
    sky: { top: '#fffbe6', horizon: '#ffffff', ground: '#fff6d0', sun: '#ffffff', sunDir: [0, 0, -1], sunIntensity: 1.6, halo: 0.5 },
    fog: { color: '#fffae8', density: 0.016 },
    light: { color: '#fff6e0', intensity: 3.4, dir: [0.5, 0.5, 0.4], hemiSky: '#fff0b0', hemiGround: '#d06018', hemi: 1.5 },
    layers: [
      {
        kind: 'tube', colorLow: '#f08028', colorHigh: '#fff4b0', size: 15, base: 0, cell: 3, cellZ: 12, amp: 5, freq: [0.6, 0.02],
        sharp: 1.0, spikeChance: 0.4, spikeHeight: 9, jitter: 0.35, minRadius: 8.5, sideWeight: 0.85, shadeJitter: 0.22,
      },
    ],
    camera: { ...baseCam, height: 0, rollSwing: 0.06, sway: 2, speed: 44, fov: 72 },
    post: { ...basePost, vignetteColor: '#ffffff', vignette: 0.25, pump: 0.4, bloom: 0.55, bloomRadius: 0.5 },
    play: { halfWidth: 7, down: 7, up: 7 },
    hazards: { patterns: ['aimed', 'wall', 'slalom', 'wall'], perBeat: 1.5, radius: [1.0, 1.5], place: 'wall', color: '#fff0b0' },
    transition: 'cut',
  },

  // 9 · Peach Dusk — peach mountains, setting sun, vignette closes in
  {
    name: 'Peach Dusk',
    bars: 32,
    music: [S('ref', 8), S('t2', 11), S('ref', 8), S('t2', 11)],
    sky: { top: '#d07868', horizon: '#f0c8a0', ground: '#d8a888', sun: '#fff6c0', sunDir: [0, 0.22, -1], sunIntensity: 2.3, halo: 1.0 },
    fog: { color: '#f8d4b0', density: 0.004 },
    light: { color: '#fff0d8', intensity: 3, dir: [-0.5, 0.7, 0.3], hemiSky: '#ffe0c8', hemiGround: '#5a2a24', hemi: 0.7 },
    layers: [
      {
        kind: 'floor', colorLow: '#a05a48', colorHigh: '#fff0e0', size: 150, base: 0, cell: 5, amp: 14, freq: [0.03, 0.03],
        sharp: 1.5, ridged: true, spikeChance: 0.14, spikeHeight: 7, jitter: 0.45, clearance: [3, 26, 0.2], shadeJitter: 0.12,
      },
    ],
    camera: { ...baseCam, height: 9, pitch: 0.12, speed: 20 },
    post: { ...basePost, vignetteColor: '#3a0c1c', vignette: 0.6 },
    play: { halfWidth: 10, down: 6, up: 5 },
    hazards: { patterns: ['scatter', 'slalom', 'scatter', 'aimed'], perBeat: 0.75, radius: [1.4, 2.2], place: 'floor', spread: 0.9, color: '#ffe2cc' },
    transition: 'cut',
    fadeOut: 0.9,
  },

  // 10 · Wire Night — black/teal sky, glowing wireframe terrain over white haze
  {
    name: 'Wire Night',
    bars: 16,
    music: [S('t2', 8), S('ref', 9)],
    sky: { top: '#000208', horizon: '#0c3c3a', ground: '#a9bfb9', sun: '#3a8c84', sunDir: [0, 0.05, -1], sunIntensity: 0.15, halo: 0.3 },
    fog: { color: '#0c3634', density: 0.006 },
    light: { color: '#ffffff', intensity: 1, dir: [0, 1, 0], hemiSky: '#ffffff', hemiGround: '#ffffff', hemi: 1 },
    layers: [
      {
        kind: 'floor', colorLow: '#5fb8aa', colorHigh: '#e4fff8', size: 160, base: 0, cell: 4, amp: 14, freq: [0.03, 0.03],
        sharp: 1.6, spikeChance: 0.1, spikeHeight: 5, jitter: 0.5, clearance: [8, 45, 0.05], wireframe: true,
      },
    ],
    camera: { ...baseCam, height: 6, pitch: 0.07, speed: 14, sway: 0.5 },
    post: {
      ...basePost, vignetteColor: '#000000', vignette: 0.6, bloom: 0.7, threshold: 0.9, grain: 0.05,
      haze: { color: '#e6efec', amount: 0.8, height: 0.38 },
    },
    play: { halfWidth: 10, down: 4, up: 4 },
    hazards: { patterns: ['scatter', 'wall', 'slalom', 'aimed'], perBeat: 1, radius: [1.2, 1.8], place: 'floor', spread: 0.9, color: '#a8fff0' },
    transition: 'cut',
    fadeOut: 1,
  },
];
