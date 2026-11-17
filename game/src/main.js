// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// 3D renderer and the 2D HUD paint what is there. The game moves between
// its screens: title, play, pause, wasted, busted, mission failed,
// mission complete, and the ending.
//
// The sim runs in 2D (x, y). The camera is third-person 3D, so WASD is
// rotated into world space by the camera yaw before it reaches the sim:
// W always walks away from the camera, D always walks to its right.
// Driving stays car-relative (W = forward, A/D = steer) and is not
// rotated. The mouse aims through the centre of the screen (raycast onto
// the ground plane), so with pointer lock the crosshair is the aim.
//
// ?seed=N fixes the city. ?shot=start|chase|drive|mission (with &seed=N)
// stages that scene instead of running the loop, paints it, and sets
// window.__shotReady for a screenshot.
import { STEP, CAM3D } from './config.js';
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

const gameCanvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(gameCanvas);
const hud = createHud(hudCanvas);
// Test hooks: lets automated play-tests read the live state and hold the camera.
window.__game = game;
window.__renderer = renderer;

function announce(message) {
  status.textContent = message;
  game.state.announced = message;
}

function runShot(name) {
  const scene = stageShot(name, game);
  const state = game.state;
  const cam = scene.camYaw === undefined ? null : { yaw: scene.camYaw, pitch: CAM3D.pitch };
  if (scene.aimWorld) state.player.muzzle = 0.06;
  // Paint twice: the first paint settles the camera, the second is the frame.
  renderer.draw(state, scene.screen, cam);
  hud.draw(state, scene.screen, { mouse: { x: 0, y: 0, down: false } }, state.uiButtons);
  renderer.draw(state, scene.screen, cam);
  hud.draw(state, scene.screen, { mouse: { x: 0, y: 0, down: false } }, state.uiButtons);
  window.__shotReady = true;
  announce(`Screenshot scene ${name} ready.`);
}

function runGame() {
  const input = createInput(gameCanvas, { wantsLock: () => game.state.screen === 'play' });
  let accumulator = 0;
  let last = performance.now();
  let lastScreen = game.state.screen;

  // WASD rotated into world space by the camera yaw. camYaw 0 = camera
  // south of the player looking north, so forward is (0, -1) and right
  // is (1, 0). Driving keys are passed through raw (car-relative).
  function viewInput() {
    const yaw = input.camYaw;
    const fx = -Math.sin(yaw);
    const fy = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const ry = -Math.sin(yaw);
    return {
      get mouse() { return input.mouse; },
      get up() { return input.up; },
      get down() { return input.down; },
      get left() { return input.left; },
      get right() { return input.right; },
      get run() { return input.run; },
      get brake() { return input.brake; },
      moveX() {
        const mx = input.moveX();
        const my = input.moveY();
        return fx * -my + rx * mx;
      },
      moveY() {
        const mx = input.moveX();
        const my = input.moveY();
        return fy * -my + ry * mx;
      },
      takeActions() { return input.takeActions(); },
      takeClick() { return input.takeClick(); },
    };
  }

  // When the mouse has been idle a while and the driver is not holding
  // the camera, ease it back behind the player (or the car) so W always
  // means "away from me".
  function autoFollow(dt) {
    if (input.camLocked || input.pointerLocked) return;
    if (performance.now() - input.lastMouseMove < CAM3D.followDelay * 1000) return;
    const state = game.state;
    const p = state.player;
    const heading = p.inCar && p.car ? p.car.angle : p.angle;
    const want = Math.atan2(-Math.cos(heading), -Math.sin(heading));
    let diff = want - input.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    input.setCamYaw(input.camYaw + diff * Math.min(1, dt * 1.5), false, false);
    input.setCamPitch(input.camPitch + (CAM3D.pitch - input.camPitch) * Math.min(1, dt * 1.5));
  }

  function step(now) {
    const state = game.state;
    const aim = renderer.aimPoint();
    game.update(viewInput(), STEP, aim);
    autoFollow(STEP);
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
        const aim = renderer.aimPoint();
        game.update(viewInput(), STEP, aim);
        accumulator -= STEP;
        if (state.screen === 'play') {
          accumulator = 0;
          break;
        }
      }
    }
    renderer.draw(state, state.screen, { yaw: input.camYaw, pitch: input.camPitch });
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
