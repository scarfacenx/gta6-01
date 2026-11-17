// Keyboard and pointer input. Held keys give movement and driving axes;
// one-shot presses (enter a car, pause, mute, switch weapon) are queued as
// bit flags and taken once by the loop, so a press between two frames is
// never lost and never counted twice.
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

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function isBound(name, code) {
    return BINDINGS[name].includes(code);
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (HELD.some((name) => isBound(name, event.code))) event.preventDefault();
      return;
    }
    keys.add(event.code);
    for (const [name, flag] of ONE_SHOT) {
      if (isBound(name, event.code)) {
        actions |= flag;
        break;
      }
    }
    if (HELD.some((name) => isBound(name, event.code))) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });

  function trackPointer(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }
  canvas.addEventListener('pointermove', trackPointer);
  canvas.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    mouse.down = true;
    mouse.clicked = true;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function hasAny(name) {
    return BINDINGS[name].some((code) => keys.has(code));
  }

  return {
    mouse,
    /** -1..1 on each axis from WASD / arrows. */
    moveX() { return (hasAny('right') ? 1 : 0) - (hasAny('left') ? 1 : 0); },
    moveY() { return (hasAny('down') ? 1 : 0) - (hasAny('up') ? 1 : 0); },
    get up() { return hasAny('up'); },
    get down() { return hasAny('down'); },
    get left() { return hasAny('left'); },
    get right() { return hasAny('right'); },
    get run() { return hasAny('run'); },
    get brake() { return hasAny('brake'); },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClick() {
      const clicked = mouse.clicked;
      mouse.clicked = false;
      return clicked;
    },
  };
}
