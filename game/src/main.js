// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer and HUD paint what is there. The game moves between its screens:
// title, play, pause, wasted, busted, mission failed, mission complete, and
// the ending.
//
// ?seed=N fixes the city. ?shot=start|chase|drive|mission (with &seed=N)
// stages that scene instead of running the loop, paints it, and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createInput } from './input.js';
import { createGame } from './game.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(canvas);
const hud = createHud(canvas);
// Test hook: lets automated play-tests read the live state.
window.__game = game;

function announce(message) {
  status.textContent = message;
  game.state.announced = message;
}

function runShot(name) {
  const scene = stageShot(name, game);
  const state = game.state;
  // Paint twice: the first paint settles the camera, the second is the frame.
  renderer.draw(state, scene.screen);
  hud.draw(state, scene.screen, { mouse: { x: 0, y: 0, down: false } }, state.uiButtons);
  if (scene.aimWorld) {
    const ratio = window.devicePixelRatio || 1;
    const view = renderer.view;
    const mx = (scene.aimWorld.x - view.x) * view.scale / ratio;
    const my = (scene.aimWorld.y - view.y) * view.scale / ratio;
    renderer.draw(state, scene.screen);
    hud.draw(state, scene.screen, { mouse: { x: mx, y: my, down: true } }, state.uiButtons);
  }
  window.__shotReady = true;
  announce(`Screenshot scene ${name} ready.`);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let lastScreen = game.state.screen;

  function step(now) {
    const state = game.state;
    // The mouse aims in world coordinates: convert the cursor through the camera.
    const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
    game.update(input, STEP, aim);
    if (state.screen !== lastScreen) {
      lastScreen = state.screen;
      const names = {
        title: 'Coral Heat. Press Enter or click New Game.',
        play: 'Playing.',
        pause: 'Paused.',
        wasted: 'Wasted.',
        busted: 'Busted.',
        failed: 'Mission failed.',
        complete: 'Mission complete.',
        ending: 'King of Coral Bay.',
      };
      announce(names[state.screen] || 'Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const state = game.state;
    if (state.screen === 'play') {
      while (accumulator >= STEP) {
        step(now);
        accumulator -= STEP;
        if (state.screen !== 'play') {
          accumulator = 0;
          break;
        }
      }
    } else {
      // Menus still tick (the title's city keeps moving) but in big steps.
      while (accumulator >= STEP) {
        const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
        game.update(input, STEP, aim);
        accumulator -= STEP;
        if (state.screen === 'play') {
          accumulator = 0;
          break;
        }
      }
    }
    renderer.draw(state, state.screen);
    hud.draw(state, state.screen, input, state.uiButtons);
  }

  // Leaving the tab pauses a running game rather than letting the cops catch
  // the player unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state.screen === 'play') {
      game.state.screen = 'pause';
      announce('Paused.');
    }
  });

  announce('Coral Heat. Press Enter or click New Game.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
