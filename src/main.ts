import * as THREE from 'three/webgpu';
import { BeatClock } from './core/beatclock';
import { sceneStart } from './core/timeline';
import { World } from './render/world';
import { PRESETS } from './scenes/presets';
import { Hud } from './ui/hud';
import { GameHud } from './ui/gamehud';
import { Game } from './game/game';
import { Input } from './game/input';
import { loadDifficulty, saveDifficulty } from './game/difficulty';


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
  const clock = new BeatClock();
  const gameHud = new GameHud(hud.root);
  const input = new Input(renderer.domElement);
  const game = new Game(world, clock, gameHud, input);

  // ?t=SECONDS freezes time (deterministic stills for look-dev comparison)
  const params = new URLSearchParams(location.search);
  let frozen: number | undefined = params.has('t') ? Number(params.get('t')) : undefined;
  // ?mute starts silent (testing); M toggles
  if (params.has('mute')) clock.setMuted(true);
  // ?transitions previews only the level ends: hyperloop, clear card, warp (hits are off)
  const transitions = params.has('transitions');

  const seekScene = (i: number) => {
    const n = PRESETS.length;
    const idx = ((i % n) + n) % n;
    if (frozen !== undefined) frozen = sceneStart(idx) + 2;
    else {
      clock.seek(sceneStart(idx) + 0.02);
      game.onSeek(sceneStart(idx) + 0.02);
    }
  };

  // dev mode: level jumps and debug toggles. Off for players; type "loops" (or open with ?dev) to unlock.
  let dev = params.has('dev');
  let typed = '';
  const modeText = () =>
    gameHud.mode([game.difficulty.toUpperCase(), dev ? 'DEV' : '', game.god ? 'INVINCIBLE' : ''].filter(Boolean).join(' · '));

  gameHud.show(false);
  hud.onStart(loadDifficulty(), (d) => {
    if (frozen !== undefined) return;
    saveDifficulty(d);
    void clock.start();
    world.clarity = 1;
    game.start(d);
    if (transitions) game.god = true;
    // ?level=N starts the run at level N (1-based), e.g. ?level=11 for Neon Dusk
    const level = Number(params.get('level'));
    if (level >= 1 && level <= PRESETS.length) seekScene(level - 1);
    gameHud.showFlux(game.firing);
    gameHud.show(true);
    modeText();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key.length === 1) {
      typed = (typed + e.key.toLowerCase()).slice(-5);
      if (typed === 'loops') {
        dev = !dev;
        typed = '';
        gameHud.banner(dev ? 'DEV MODE ON' : 'DEV MODE OFF', 1200, 'hint');
        modeText();
      }
    }
    if (e.code === 'Escape') clock.toggle();
    else if (e.code === 'KeyM') clock.setMuted(!clock.isMuted);
    if (!dev) return;
    if (e.code === 'BracketRight') seekScene(world.sceneIndex + 1);
    else if (e.code === 'BracketLeft') seekScene(world.sceneIndex - 1);
    else if (/^Digit\d$/.test(e.code)) seekScene((Number(e.code.slice(5)) + 9) % 10);
    else if (e.code === 'KeyV') hud.cycleRef();
    else if (e.code === 'KeyH') hud.toggle();
    else if (e.code === 'KeyJ') game.setLaneMode(!game.laneMode, clock.time);
    else if (e.code === 'KeyF') game.setFiring(!game.firing);
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

  // title screen: a silent flythrough of the levels behind the menu, glow pulled halfway back
  let attract = sceneStart(1) + 4;
  world.clarity = 0.6;

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (game.state === 'title' && frozen === undefined) {
      attract += dt;
      const info = clock.update(attract);
      world.update(info, 0, undefined);
      world.post.render();
      return;
    }
    let info = clock.update(frozen);
    // ?transitions: skip each level to just before its hyperloop
    if (transitions && game.state === 'play' && info.sceneTime > 4 && info.sceneLen - info.sceneTime > 9) {
      const at = info.time + (info.sceneLen - info.sceneTime) - 8;
      clock.seek(at);
      game.onSeek(at);
      info = clock.update(frozen);
    }
    const focus = frozen === undefined ? game.update(info, dt) : undefined;
    world.update(info, clock.bass, focus);
    world.post.render();
    hud.syncRef(info.songTime, clock.playing && frozen === undefined);
    const idx = world.sceneIndex;
    hud.update(info, PRESETS[idx].name, idx + 1, PRESETS.length, dt);
  });
}

void boot();
