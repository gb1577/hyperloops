# HYPERLOOPS

A rhythm graze-runner built from a 2016 After Effects video (`ref/hyperloops-01-game.mp4`).
Design and plan: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) · Storyboard: [docs/storyboard/index.html](docs/storyboard/index.html)

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Three.js r186 `WebGPURenderer` (falls back to WebGL2 automatically) + TSL post-processing, Vite, TypeScript.

## What's playable (M1)

Fly a light-shard through the 10 scenes of the reference video, on the beat (160 BPM).

- **Steer** with the mouse, WASD / arrow keys, a gamepad, or touch-drag.
- **Crystal spikes** erupt on the beat. A glowing ring on the ground warns one beat ahead.
  Patterns change every bar: walls with one gap, slaloms, spikes aimed at you, scatter.
- **Graze** (fly close past a spike without touching it) for +100 × multiplier.
- **Gold shards** sit in risky spots (in the gaps, next to spikes). Collect them for points, with a rising chime.
- **Skim** low over the ground for a score and Flux trickle.
- **Flux** fills from grazing, shards and skimming. It will be the ammo for firing (M2).
- **3 shields.** A hit cracks one, muffles the music and drains the colour. Losing all three
  restarts the current level instantly.
- Each level is 32 bars (~48 s, its 8-bar music section repeated seamlessly). The Wire Cave breather is 16 bars, the Wire Night outro 8.

| Key | Action |
|---|---|
| click | start (audio needs a user gesture) |
| Esc | pause / resume |
| M | mute / unmute |
| [ / ] | previous / next scene |
| 1–9, 0 | jump to scene 1–10 |
| I | invincible (dev) |
| V | reference video: off → picture-in-picture → 50/50 wipe |
| H | debug HUD |

URL flags: `?mute` starts silent. `?t=SECONDS` freezes time for look-dev stills.
In the console, `hl.presets` holds the live scene presets. Edit one, then call `hl.world.reapply()`.

## Layout

```
src/core/beatclock.ts   music engine + master clock: sections scheduled on the Web Audio clock
src/core/timeline.ts    run time → loop / scene / song position (scene lengths in bars)
src/core/noise.ts       hash / value noise / fbm / ridged (world-grid keyed, seamless chunks)
src/render/terrain.ts   streaming flat-shaded chunks: floor, ceiling, tube
src/render/sky.ts       gradient dome + sun halo (TSL)
src/render/lines.ts     scanlines, lasers, scribbles
src/render/post.ts      bloom, vignette, white-flash, fade, grain (TSL RenderPipeline)
src/render/world.ts     scene switching, camera path, music reactivity, transitions
src/scenes/presets.ts   the 10 scenes as data (look, flight corridor, hazard patterns)
src/game/game.ts        game loop: scoring, shields, restart, hints
src/game/glider.ts      player ship, trail, inertial steering
src/game/hazards.ts     beat-scheduled spike patterns, shards, collisions
src/game/input.ts       keyboard / mouse / gamepad / touch
src/game/sfx.ts, fx.ts  synthesized sounds, spark particles
src/ui/gamehud.ts       score, multiplier, flux, shields, banners
```
