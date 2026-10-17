# HYPERLOOPS — Game Design & Tech Plan (v0.1)

> Source of truth for the look: `ref/hyperloops-01-game.mp4` (2016, After Effects).
> Visual storyboard: `docs/storyboard/index.html`.

## 1. Pitch

**Fly a shard of light through a living low-poly world, toward the sun, on the beat.**
Graze the spikes to charge up, shatter them with on-beat pulses, and dive through the
Hyperloop gate at the end of every 8 bars into the next world. One song = one loop.
Survive the loop and it starts again faster, remixed, hungrier.

Genre: rhythm graze-runner (*Race the Sun* × *Thumper* × *Rez*).

## 2. Defaults assumed (change any of these)

| Question | Default chosen | Why |
|---|---|---|
| Platform | Browser first (desktop + mobile), wrap for Steam/mobile stores later | Zero install, instant sharing of scores/daily seed |
| Controls | Mouse/keyboard/gamepad + touch (one thumb steers, other taps fire) | Same design scales down to phone |
| Feel | Easy to flow, hard to master (score chase on top) | Widest audience, still deep |
| Music | Designed **Track mode** (hand-authored to a song) + **Endless mode** (procedural, stems) | Track mode = tight like the video; Endless = replayability |

## 3. Core loop (moment to moment)

```
 steer low  ──►  GRAZE spikes  ──►  Flux charges  ──►  PULSE (fire) on the beat
     ▲                                                       │
     └──── combo ↑ → music layers + bloom ↑ ◄── shatter ◄────┘
                  hit → layers drop, world desaturates, combo resets
```

- **Steer**: glider moves on a 2D plane (left/right + up/down) while the world streams at it.
  Low altitude = more danger and more score (the camera hugs the peaks like the video).
- **Graze**: passing within a small radius of a spike without touching = `+Flux`, `+combo`.
  Sound: a rising shimmer. Visual: spark trail on the glider.
- **Hit**: shield cracks (3 cracks per loop on Normal, 1 on Hardcore). Music layers drop out,
  palette washes toward grey for 2 beats. Restart is < 1 second.
- **Hyperloop gate**: last bar of every scene, a ring of light at the vanishing point. Fly through →
  white-out flash (exactly the video's transitions) → next scene. Missing it is legal but costs the
  scene bonus.

## 4. The firing mechanic (your idea) — yes, with rules

Shooting is great: it gives the player agency against the wall of spikes and it is the most
satisfying "juice" moment. The risk is that free unlimited shooting kills the graze/risk loop
(why fly close if you can just blast everything?). So shooting **spends what grazing earns**:

1. **Flux is ammo.** Grazing charges Flux; each pulse costs Flux. Brave flying = more firepower.
2. **Lock-on, release on the beat (Rez style).** Hold fire → reticle sweeps and locks up to 4
   spikes ahead. Release → pulse fires. Release *on the beat* = PERFECT (spikes shatter into
   light shards, ×2 score, a musical stinger plays in key). Off-beat = weak shot, half the targets.
   Works on mobile (hold/release one button) and adds a rhythm skill without a separate rhythm lane.
3. **Not everything can be shot.**
   - *Crystal spikes* (bright, translucent faces) → shatterable.
   - *Obsidian spikes* (dark, matte) → must be dodged.
   - *Laser lines / scanlines* (scenes 2, 3, 4, 8) → must be dodged.
   This keeps steering mandatory and lets every scene mix "shoot this, dodge that".
4. **Shards are rewards.** Shattered spikes burst into shards that fly toward the glider and
   refill a little Flux if you stay near them → shooting pulls you into risky lines again.
5. **Overdrive.** Full Flux bar + 8 perfect pulses in a row → 1 bar of Overdrive: auto-shatter,
   max bloom, full music mix. The peak "screenshot moment".

## 5. Level structure — the 10 scenes from the video

In the video each scene is 8 bars (12 s). In the game a level repeats its 8-bar music section seamlessly:
32 bars (~48 s) per level, 16 for the Wire Cave breather, 8 for the Wire Night outro (~6.5 min per loop).
Dying restarts the current level.
Every scene keeps its look and adds **one** signature mechanic.

| # | Scene | Look (from video) | Gameplay signature | Music role |
|---|---|---|---|---|
| 1 | Sepia Peaks | warm brown low-poly mountains, giant sun bloom | Tutorial: steer, graze. Sparse obsidian peaks | intro pad, kick only |
| 2 | Jade Spires | green crystal spikes, horizontal white scanlines | Spikes **erupt on the beat**; first shootable crystals; scanlines = duck/hop walls | hats + bass enter |
| 3 | Violet Tunnel | purple cave, blinding exit, laser streaks | **Tunnel mode**: steer = rotate around the wall; laser streaks sweep | build, risers |
| 4 | Ice Shards | teal/steel shard chaos, white beams | Dense crystal field, **lock-on showcase**, drop | DROP — full mix |
| 5 | Wire Cave | white glow, meandering wireframe cave, long black lines crossing | **Breather/bonus**: no hazards; chase light motes down the wire cave; refill shield | breakdown, filtered |
| 6 | Amethyst Ridge | purple terrain, banking horizon | Horizon **rolls** with the music; terrain waves; ride the slopes | groove returns |
| 7 | Rose Canyon | pink floor *and* ceiling, yellow core | **Squeeze**: stalactites drop on beats, height control matters | second build |
| 8 | Solar Shear | orange shards streaking sideways | **Cross-traffic**: shards fly horizontally, thread the gaps; top speed | second drop, peak |
| 9 | Peach Dusk | peach mountains, sun setting, vignette closes | Cool-down; **cash-in** multiplier gate | outro melody |
| 10 | Wire Night | black/teal sky, wireframe terrain, white fog | **Results flyover** → "LOOP 2" lights up, world rebuilds faster | fade / loop seam |

**Loop 2+**: +12% speed per loop, scenes reshuffle (except 1 and 10), new spike patterns,
music swaps to a remix stem set. Endless mode generates scenes from the same 10 presets plus
new ones (palette + terrain recipe + hazard set = a new world).

## 6. Retention (the "one more run" layer)

- Instant restart, no menus between runs.
- **Daily Loop**: one seed per day, same for everyone, leaderboard + ghost of the #1 run.
- **Scene mastery**: 3 stars per scene (no-hit, all perfect pulses, graze target).
- Unlocks by skill only: new scenes beyond the original 10, glider shapes, trail colors, music remixes.
- End screen always shows the nearest goal ("142 pts to unlock Ice Shards remix").
- Personal-best ghost always flies with you.

## 7. Tech decision: web engine, Blender only as a tool

**Engine: Three.js (r17x) with `WebGPURenderer` + TSL shaders, auto-fallback to WebGL2.**
TypeScript + Vite. No Blender runtime.

Why not Blender as the engine: Blender has no maintained game runtime (BGE was removed; UPBGE
is niche), and the video's look is almost entirely *procedural*, made from noise terrain, flat
shading, one light and a lot of bloom. That is cheaper and more flexible to generate in code than to model.
Code-generated worlds are also what makes Endless mode and daily seeds possible.

**Where Blender is used:**
- The glider model, gate rings, and a few hero set-pieces (exported as `.glb`, meshopt-compressed).
- Optional look-dev stills to test palettes before coding them.

**Rendering recipe (per scene = one JSON preset):**
- *Terrain*: chunked strips streaming toward the camera; heightfield from layered simplex noise
  + ridged noise; **non-indexed geometry** so each triangle gets its own normal = the faceted look.
- *Spikes*: `InstancedMesh` of jittered cones/tetrahedra (thousands, one draw call); eruption
  animated in the vertex shader from a per-instance "spawn beat".
- *Light*: one directional "sun" + hemisphere fill; color ramp per scene.
- *Sky/sun*: full-screen gradient shader + sun disc.
- *Post*: bloom (huge, the video's signature) → light vignette → slight chromatic aberration
  → film grain → white-flash transition node.
- *Lines*: scanlines/laser streaks/scribbles as instanced thin quads with additive blend.
- *Fog*: exponential, tinted per scene, so geometry melts into the light.

**Audio:** Web Audio API. A sample-accurate beat clock (look-ahead scheduler) is the master
clock: spawns, eruptions, gate timing, and "perfect" windows all read from it. Music as
stems (drums/bass/pads/lead/fx), mixed live from combo state. New music ≈ the reference:
~160 BPM (half-time feel), airy pads, glassy plucks, sub bass, built to 8-bar blocks.

**Project layout (planned):**
```
src/
  core/      beatclock.ts, input.ts, loop.ts, rng.ts
  render/    renderer.ts, post.ts, sky.ts, terrain.ts, spikes.ts, lines.ts
  scenes/    presets/*.json (palette, noise, hazards, lines, camera roll)
  game/      glider.ts, graze.ts, pulse.ts, gates.ts, score.ts
  audio/     mixer.ts, stems.ts, sfx.ts
  ui/        hud.ts, menus.ts
assets/      glider.glb, stems/*.ogg
```

## 8. Milestones

| M | Goal | Done when |
|---|---|---|
| **M0 Look-dev** | All 10 scenes rendered as a flythrough synced to the reference video's audio | Side-by-side with the video reads as "the same film" |
| **M1 Core feel** | Glider, collisions, graze, eruptions on beat, instant restart | 2 scenes are fun with no score UI |
| **M2 Pulse** | Flux economy, lock-on, perfect/weak shots, shatter FX, gates + flash transitions | Shooting feels great *and* grazing still matters |
| **M3 Music** | Original track + stems, adaptive mixing, stingers in key | Playing well audibly sounds better |
| **M4 Loop & meta** | Loop 2+, scoring, stars, daily seed, local leaderboard + ghosts | "One more run" playtest test passes |
| **M5 Platforms** | Touch controls, mobile perf tiers, online leaderboard, PWA | 60 fps on a mid-range phone |

## 9. Open questions

- Glider identity: abstract light shard, or a sleek craft? (storyboard assumes a light shard)
- Should a hit end the run (pure arcade) or crack a shield (default above)?
- Do you want a story/meta-theme (e.g. "chasing the sun across dying worlds") or pure abstraction?
