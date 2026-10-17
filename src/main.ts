import * as THREE from 'three/webgpu';
import { BeatClock } from './core/beatclock';
import { sceneStart } from './core/timeline';
import { World } from './render/world';
import { PRESETS } from './scenes/presets';
import { Hud } from './ui/hud';
import { GameHud } from './ui/gamehud';
import { Game } from './game/game';
import { Input } from './game/input';
const audioUrl = `${import.meta.env.BASE_URL}audio/hyperloops-ref.ogg`;

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
  const gameHud = new GameHud(hud.root);
  const input = new Input(renderer.domElement);
  const game = new Game(world, clock, gameHud, input);

  // ?t=SECONDS freezes time (deterministic stills for look-dev comparison)
  const params = new URLSearchParams(location.search);
  let frozen: number | undefined = params.has('t') ? Number(params.get('t')) : undefined;
  // ?mute starts silent (testing); M toggles
  if (params.has('mute')) clock.setMuted(true);

  const seekScene = (i: number) => {
    const n = PRESETS.length;
    const idx = ((i % n) + n) % n;
    if (frozen !== undefined) frozen = sceneStart(idx) + 2;
    else {
      clock.seek(sceneStart(idx) + 0.02);
      game.onSeek(sceneStart(idx) + 0.02);
    }
  };

  gameHud.show(false);
  hud.onStart(() => {
    if (frozen !== undefined) return;
    void clock.start();
    game.start();
    gameHud.show(true);
  });

  const modeText = () => gameHud.mode(game.god ? 'INVINCIBLE' : '');
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') clock.toggle();
    else if (e.code === 'BracketRight') seekScene(world.sceneIndex + 1);
    else if (e.code === 'BracketLeft') seekScene(world.sceneIndex - 1);
    else if (/^Digit\d$/.test(e.code)) seekScene((Number(e.code.slice(5)) + 9) % 10);
    else if (e.code === 'KeyV') hud.cycleRef();
    else if (e.code === 'KeyH') hud.toggle();
    else if (e.code === 'KeyM') clock.setMuted(!clock.isMuted);
    else if (e.code === 'KeyI') {
      game.god = !game.god;
      modeText();
    }
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
    game,
    presets: PRESETS,
    setTime: (t: number | undefined) => (frozen = t),
  };

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const info = clock.update(frozen);
    const focus = frozen === undefined ? game.update(info, dt) : undefined;
    world.update(info, clock.bass, focus);
    world.post.render();
    hud.syncRef(info.songTime, clock.playing && frozen === undefined);
    const idx = world.sceneIndex;
    hud.update(info, PRESETS[idx].name, idx + 1, PRESETS.length, dt);
  });
}

void boot();
