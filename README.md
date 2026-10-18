# HYPERLOOPS

A rhythm graze-runner built from a 2016 After Effects video (`ref/hyperloops-01-game.mp4`).
Design and plan: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) · Storyboard: [docs/storyboard/index.html](docs/storyboard/index.html)

## Run

**Play without a server:** run `npm run build` once, then double-click `dist/index.html`.
It's a single self-contained file (code, styles and all music inlined, ~12 MB) that works straight from disk.

**Develop:**

```bash
npm install
npm run dev        # http://localhost:5173
```

Three.js r186 `WebGPURenderer` (falls back to WebGL2 automatically) + TSL post-processing, Vite, TypeScript.

## What's playable

Fly a light-shard through the 10 scenes of the reference video, on the beat (160 BPM).

- **Steer** with the mouse, WASD / arrow keys, a gamepad, or touch-drag.
- **Crystal spikes** erupt on the beat. A glowing ring on the ground warns one beat ahead.
  Patterns change every bar: walls with one gap, slaloms, spikes aimed at you, scatter.
- **Graze** (fly close past a spike without touching it) for +100 × multiplier.
- **Gold shards** sit in risky spots (in the gaps, next to spikes). Collect them for points, with a rising chime.
- **Skim** low over the ground for a score and Flux trickle.
- **3 shields.** A hit cracks one, muffles the music and drains the colour. Losing all three
  restarts the current level instantly.
- Each level is 32 bars (~48 s). The Wire Cave and Wire Night are 16. Each level plays a playlist of 8-bar sections
  from three tracks (the 2016 soundtrack plus hyperloops-02 and -03), all on one 160 BPM grid.
  See `src/core/tracks.ts` and each preset's `music`.

Pick **EASY** (5 shields, fewer spikes, wider gaps, no aimed spikes) or **HARD** on the start screen.
The game remembers your last choice, and Enter starts it.

| Key | Action |
|---|---|
| Esc | pause / resume |
| M | mute / unmute |

**Dev mode:** type `loops` on the keyboard (or open with `?dev`) to unlock these, and type it again to lock:

| Key | Action |
|---|---|
| [ / ] · 1–9, 0 | previous / next level · jump to level 1–10 |
| I | invincible |
| J | lane-snapping control prototype |
| F | lock-on firing experiment |
| V | reference video: off → picture-in-picture → 50/50 wipe |
| H | debug HUD |

URL flags: `?mute` starts silent. `?t=SECONDS` freezes time for look-dev stills.
In the console, `hl.presets` holds the live scene presets. Edit one, then call `hl.world.reapply()`.

## Layout

```
src/core/beatclock.ts   music engine + master clock: sections scheduled on the Web Audio clock
src/core/timeline.ts    run time → loop / scene / which track section is playing
src/core/tracks.ts      the music tracks and how they were prepared (trim / tempo-match)
src/assets/audio/       the game-ready tracks (Opus), bundled into the build
src/core/noise.ts       hash / value noise / fbm / ridged (world-grid keyed, seamless chunks)
src/render/terrain.ts   streaming flat-shaded chunks: floor, ceiling, tube
src/render/sky.ts       gradient dome + sun halo (TSL)
src/render/lines.ts     scanlines, lasers, scribbles
src/render/post.ts      bloom, vignette, white-flash, fade, grain (TSL RenderPipeline)
src/render/world.ts     scene switching, camera path, music reactivity, transitions
src/scenes/presets.ts   the 10 scenes as data (look, flight corridor, hazard patterns)
src/game/game.ts        game loop: scoring, shields, restart, hints
src/game/glider.ts      player ship, trail, inertial steering
src/game/hazards.ts     beat-scheduled spike patterns, shards, collisions, shatter
src/game/weapon.ts      lock-on firing experiment (F): beat-judged release, beams
src/game/lanes.ts       lane-snapping control prototype (L)
src/game/input.ts       keyboard / mouse / gamepad / touch
src/game/sfx.ts, fx.ts  synthesized sounds, spark particles
src/ui/gamehud.ts       score, multiplier, flux, shields, banners
```
