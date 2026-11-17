// The keyboard and mouse state between the page and the game. One input
// instance per session; the game reads it every frame, never stores it.
//
// Bindings match the 2D game exactly: WASD/arrows move and drive, Space
// is the handbrake, E enters a car, Enter confirms, P/Esc pauses, M
// mutes, 1/2 switch weapons. One-shot presses are queued as bit flags
// and taken once by the loop, so a press between two frames is never
// lost and never counted twice.
//
// Third-person camera: with pointer lock, mouse movement turns the
// camera around the player; without lock the mouse aims with the cursor.
// The camera eases back behind the player or car when the mouse has been
// idle — main.js does that easing. The sim stays 2D; main.js rotates
// the movement keys into world space using camYaw.
//
// Test hooks: window.__input exposes setCamYaw(yaw, locked) so an
// automated driver can hold the camera still and keep WASD world-mapped.
import { CAM3D } from './config.js';

export const ACTION_ENTER = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_WEAPON1 = 8;
export const ACTION_WEAPON2 = 16;
export const ACTION_CONFIRM = 32;

const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  brake: ['Space'],
  enter: ['KeyE'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  confirm: ['Enter'],
};

const HELD = ['up', 'down', 'left', 'right', 'brake'];
const ONE_SHOT = [
  ['enter', ACTION_ENTER],
  ['pause', ACTION_PAUSE],
  ['mute', ACTION_MUTE],
  ['weapon1', ACTION_WEAPON1],
  ['weapon2', ACTION_WEAPON2],
  ['confirm', ACTION_CONFIRM],
];
const PREVENT = new Set([
  ...BINDINGS.up, ...BINDINGS.down, ...BINDINGS.left, ...BINDINGS.right,
  ...BINDINGS.brake, ...BINDINGS.confirm,
]);

export function createInput(canvas, opts = {}) {
  const keys = new Set();
  let actions = 0;
  let click = false;
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false, clicked: false };
  let camYaw = 0;
  let camPitch = CAM3D.pitch;
  let camLocked = false; // driver holds the camera: no mouse orbit, no auto-follow
  let lastMouseMove = 0;
  let locked = false;

  function isBound(name, code) {
    return BINDINGS[name].includes(code);
  }
  function hasAny(name) {
    return BINDINGS[name].some((code) => keys.has(code));
  }
  function requestLock() {
    if (locked) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) {
      // Pointer lock is a nicety; the game stays playable without it.
    }
  }

  function onKeyDown(e) {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    for (const [name, flag] of ONE_SHOT) {
      if (isBound(name, e.code)) {
        actions |= flag;
        break;
      }
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (locked) {
      if (!camLocked) {
        camYaw -= (e.movementX || 0) * 0.0028;
        camPitch += (e.movementY || 0) * 0.0022;
        if (camPitch < CAM3D.pitchMin) camPitch = CAM3D.pitchMin;
        if (camPitch > CAM3D.pitchMax) camPitch = CAM3D.pitchMax;
      }
      lastMouseMove = performance.now();
      mouse.x = window.innerWidth / 2;
      mouse.y = window.innerHeight / 2;
    } else {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    mouse.down = true;
    if (locked) {
      mouse.x = window.innerWidth / 2;
      mouse.y = window.innerHeight / 2;
    } else {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      click = true;
    }
    if (opts.wantsLock && opts.wantsLock()) requestLock();
  }
  function onMouseUp(e) {
    if (e.button !== 0) return;
    mouse.down = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked) mouse.down = false;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const input = {
    get mouse() {
      return mouse;
    },
    get up() {
      return hasAny('up');
    },
    get down() {
      return hasAny('down');
    },
    get left() {
      return hasAny('left');
    },
    get right() {
      return hasAny('right');
    },
    get run() {
      return hasAny('run');
    },
    get brake() {
      return hasAny('brake');
    },
    get camYaw() {
      return camYaw;
    },
    get camPitch() {
      return camPitch;
    },
    get camLocked() {
      return camLocked;
    },
    get pointerLocked() {
      return locked;
    },
    get lastMouseMove() {
      return lastMouseMove;
    },
    /** -1..1 on each axis from WASD / arrows. */
    moveX() {
      return (hasAny('right') ? 1 : 0) - (hasAny('left') ? 1 : 0);
    },
    moveY() {
      return (hasAny('down') ? 1 : 0) - (hasAny('up') ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClick() {
      const taken = click;
      click = false;
      return taken;
    },
    setCamYaw(yaw, lockIt, touch = true) {
      camYaw = yaw;
      camLocked = !!lockIt;
      // The driver holding the camera counts as mouse activity; the
      // auto-follow easing passes touch=false so it does not block itself.
      if (touch) lastMouseMove = performance.now();
    },
    setCamPitch(value) {
      camPitch = Math.max(CAM3D.pitchMin, Math.min(CAM3D.pitchMax, value));
    },
    unlockCam() {
      camLocked = false;
    },
    requestLock,
  };
  window.__input = input;
  return input;
}
