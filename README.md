# HYPERLOOPS

A rhythm graze-runner built from a 2016 After Effects video (`ref/hyperloops-01-game.mp4`).
Design and plan: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) · Storyboard: [docs/storyboard/index.html](docs/storyboard/index.html)

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Three.js r186 `WebGPURenderer` (falls back to WebGL2 automatically) + TSL post-processing, Vite, TypeScript.

## M0 look-dev: what's here

A beat-synced flythrough of the 10 reference scenes, driven by the reference soundtrack
(`public/audio/hyperloops-ref.m4a`, extracted from the video). 160 BPM, 8 bars (12 s) per scene.

| Key | Action |
|---|---|
| click | start (audio needs a user gesture) |
| Space | pause / resume |
| ← / → | previous / next scene |
| 1–9, 0 | jump to scene 1–10 |
| V | reference video: off → picture-in-picture → 50/50 wipe |
| H | toggle HUD |

`?t=SECONDS` freezes time at that moment for side-by-side stills, for example `/?t=42`.
In the console, `hl.presets` holds the live scene presets. Edit one, then call `hl.world.reapply()`.

## Layout

```
src/core/beatclock.ts   audio-driven master clock (beat, bar, kick envelope, bass level)
src/core/noise.ts       hash / value noise / fbm / ridged (world-grid keyed, seamless chunks)
src/render/terrain.ts   streaming flat-shaded chunks: floor, ceiling, tube
src/render/sky.ts       gradient dome + sun halo (TSL)
src/render/lines.ts     scanlines, lasers, scribbles
src/render/post.ts      bloom, vignette, white-flash, fade, grain (TSL RenderPipeline)
src/render/world.ts     scene switching, camera path, music reactivity, transitions
src/scenes/presets.ts   the 10 scenes as data
```
