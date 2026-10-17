import * as THREE from 'three/webgpu';
import { BeatClock, SCENE_LEN } from './core/beatclock';
import { World } from './render/world';
import { PRESETS } from './scenes/presets';
import { Hud } from './ui/hud';
const audioUrl = `${import.meta.env.BASE_URL}audio/hyperloops-ref.m4a`;

async function boot() {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  await renderer.init();
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  const hud = new Hud(backend);
  hud.root.prepend(renderer.domElement);

  const world = new World(renderer);
  const clock = new BeatClock(audioUrl);

  // ?t=SECONDS freezes time (deterministic stills for look-dev comparison)
  const params = new URLSearchParams(location.search);
  let frozen: number | undefined = params.has('t') ? Number(params.get('t')) : undefined;

  const seekScene = (i: number) => {
    const n = PRESETS.length;
    const idx = ((i % n) + n) % n;
    if (frozen !== undefined) frozen = idx * SCENE_LEN + 2;
    else clock.seek(idx * SCENE_LEN + 0.02);
  };

  hud.onStart(() => {
    if (frozen === undefined) void clock.start();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      clock.toggle();
    } else if (e.code === 'ArrowRight') seekScene(world.sceneIndex + 1);
    else if (e.code === 'ArrowLeft') seekScene(world.sceneIndex - 1);
    else if (/^Digit\d$/.test(e.code)) seekScene((Number(e.code.slice(5)) + 9) % 10);
    else if (e.code === 'KeyV') hud.cycleRef();
    else if (e.code === 'KeyH') hud.toggle();
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    world.resize(window.innerWidth, window.innerHeight);
  });
  world.resize(window.innerWidth, window.innerHeight);

  // debug handle for tooling
  (window as unknown as { hl: object }).hl = {
    world,
    clock,
    hud,
    presets: PRESETS,
    setTime: (t: number | undefined) => (frozen = t),
  };

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const info = clock.update(frozen);
    world.update(info, clock.bass);
    world.post.render();
    hud.syncRef(info.time, clock.playing && frozen === undefined);
    const idx = world.sceneIndex;
    hud.update(info, PRESETS[idx].name, idx + 1, PRESETS.length, dt);
  });
}

void boot();
