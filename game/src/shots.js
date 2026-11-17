// The screenshot scenes behind ?shot=start|chase|drive|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot, so the frame is what real play
// looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { isRoad, nearestRoad } from './city.js';
import { makeCar, spawnCopCar, spawnTrafficCar, updateWorld } from './entities.js';
import { startMission } from './missions.js';

const SAMPLE = STEP;

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// An input the autopilot can drive: the same shape createInput returns.
function makeAutoInput() {
  let mx = 0;
  let my = 0;
  const input = {
    mouse: { x: 0, y: 0, down: false, clicked: false },
    up: false, down: false, left: false, right: false, run: false, brake: false,
    moveX() { return mx; },
    moveY() { return my; },
    takeActions() { return 0; },
    takeClick() { return false; },
    setMove(x, y) { mx = x; my = y; },
  };
  return input;
}

// The road centreline nearest the car on one axis — the autopilot commits
// to a single road and follows it, so it never turns onto a crossing road
// at an intersection and drives into a block.
function nearestRoadOnAxis(state, axis) {
  const roads = state.city.roads;
  const v = axis === 'v' ? state.player.car.x : state.player.car.y;
  let best = roads[0];
  for (const c of roads) {
    if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  }
  return best;
}

// Drive along the road the car is on, steering back to its centreline.
// If the car gets wedged (speed near zero for a while), back it out.
function driveAutopilot(state, input) {
  const car = state.player.car;
  if (!car) return;
  if (Math.abs(car.speed) < 25) input._stuck = (input._stuck || 0) + 1;
  else input._stuck = 0;
  if (input._stuck > 45 && !input._reverseT) input._reverseT = 40;
  if (input._reverseT > 0) {
    input._reverseT -= 1;
    input.up = false;
    input.down = true;
    input.left = false;
    input.right = false;
    input.brake = false;
    input.setMove(0, 0);
    return;
  }
  if (!input._axis) input._axis = nearestRoad(car.x, car.y).axis;
  const roadVal = nearestRoadOnAxis(state, input._axis);
  let tx;
  let ty;
  if (input._axis === 'v') {
    let dir = Math.sin(car.angle) >= 0 ? 1 : -1;
    if (car.y > 2600) dir = -1;
    if (car.y < 200) dir = 1;
    tx = roadVal + dir * 32;
    ty = car.y + dir * 360;
  } else {
    let dir = Math.cos(car.angle) >= 0 ? 1 : -1;
    if (car.x > 3000) dir = -1;
    if (car.x < 200) dir = 1;
    tx = car.x + dir * 360;
    ty = roadVal + dir * 32;
  }
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, want);
  input.up = true;
  input.down = false;
  input.left = diff < -0.07;
  input.right = diff > 0.07;
  // Off the road (a corner cut too wide), slow down so the car can steer
  // back onto the asphalt instead of grinding along a building.
  input.brake = (Math.abs(diff) > 1.1 && Math.abs(car.speed) > 320)
    || (!isRoad(car.x, car.y) && Math.abs(car.speed) > 200);
  input.setMove(0, 0);
}

// Walk at the nearest living thug and shoot at them.
function fightAutopilot(state, input) {
  let target = null;
  let best = Infinity;
  for (const thug of state.thugs) {
    if (thug.state === 'down') continue;
    const d = Math.hypot(thug.x - state.player.x, thug.y - state.player.y);
    if (d < best) {
      best = d;
      target = thug;
    }
  }
  if (!target) return null;
  const p = state.player;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  if (best > 240) input.setMove(dx / len, dy / len);
  else input.setMove(0, 0);
  input.mouse.down = best < 420;
  return { x: target.x, y: target.y };
}

function putPlayerInCar(state, x, y, angle, color, vclass, speed) {
  const car = makeCar(x, y, angle, { color, kind: 'player', vclass }, state.random);
  car.speed = speed;
  state.cars.push(car);
  state.player.inCar = true;
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
  return car;
}

/**
 * Set the game to the named scene and return the screen to draw over it
 * (plus an optional world point for the crosshair).
 */
export function stageShot(name, game) {
  const state = game.state;
  game._resetRun();
  // Mid-morning light: the screenshots should show the city, not the
  // dawn. Live play still starts at 0.08 as the sim sets it.
  state.timeOfDay = 0.3;

  if (name === 'start') {
    state.screen = 'title';
    const dummy = makeAutoInput();
    for (let i = 0; i < 300; i += 1) {
      state.time += SAMPLE;
      updateWorld(state, dummy, SAMPLE, { x: state.player.x, y: state.player.y }, true);
    }
    return { screen: 'title' };
  }

  if (name === 'chase') {
    state.screen = 'play';
    const car = putPlayerInCar(state, 1632, 2300, -Math.PI / 2, '#d83a2e', 'coupe', 430);
    startMission(state, 1);
    state.mission.step = 2;
    state.passenger = true;
    state.wanted = 3;
    state.lastCrimeAt = state.time;
    spawnCopCar(state);
    spawnCopCar(state);
    spawnCopCar(state);
    spawnTrafficCar(state);
    spawnTrafficCar(state);
    const input = makeAutoInput();
    for (let i = 0; i < 420; i += 1) {
      driveAutopilot(state, input);
      if (car.hp < 70) car.hp = car.maxHp;
      game.update(input, SAMPLE, { x: state.player.x, y: state.player.y });
      if (state.screen !== 'play') break;
    }
    // Camera behind the car, looking along its heading, angled a little
    // to the side so the car's flank (not just its rear) reads in frame.
    return { screen: 'play', camYaw: Math.atan2(-Math.cos(car.angle), -Math.sin(car.angle)) + 0.4 };
  }

  if (name === 'drive') {
    state.screen = 'play';
    // One long straight run south down the 1200 avenue — no U-turn, so the
    // car is still mid-drive on the road when the frame is taken.
    const car = putPlayerInCar(state, 1232, 500, Math.PI / 2, '#2e7fd8', 'sedan', 300);
    startMission(state, 0);
    state.mission.step = 1;
    spawnTrafficCar(state);
    spawnTrafficCar(state);
    const input = makeAutoInput();
    for (let i = 0; i < 240; i += 1) {
      driveAutopilot(state, input);
      if (car.hp < 70) car.hp = car.maxHp;
      game.update(input, SAMPLE, { x: state.player.x, y: state.player.y });
      if (state.screen !== 'play') break;
    }
    return { screen: 'play', camYaw: Math.atan2(-Math.cos(car.angle), -Math.sin(car.angle)) + 0.4 };
  }

  // mission: a firefight at the docks. The fight is staged on the 2400
  // avenue, west of the docks, where the camera can centre on the player:
  // at the marker itself the camera clamps against the map's east edge and
  // the player ends up hard right in the frame. Everyone stands ON the
  // road — in 3D a fighter teleported inside a building block is hidden
  // behind its walls, so the spots must be open ground, not just near it.
  state.screen = 'play';
  startMission(state, 2);
  state.mission.step = 1;
  const dock = state.city.landmarks.docks.marker;
  const fightSpots = [
    { x: 2420, y: 1380 },
    { x: 2440, y: 1560 },
    { x: 2380, y: 1320 },
    { x: 2460, y: 1480 },
  ];
  state.thugs.forEach((thug, i) => {
    const spot = fightSpots[i % fightSpots.length];
    thug.x = spot.x;
    thug.y = spot.y;
  });
  state.player.x = 2360;
  state.player.y = 1520;
  state.player.hasPistol = true;
  state.player.ammo = 120;
  state.player.weapon = 'pistol';
  const input = makeAutoInput();
  let aim = { x: dock.x, y: dock.y };
  // Fewer steps than the drive scenes: the frame should catch the fight
  // still in progress — thugs shooting, muzzle flashes — not the aftermath.
  // Short enough that the player is still west of the docks, so the camera
  // is not clamped hard against the map's east edge.
  for (let i = 0; i < 90; i += 1) {
    const next = fightAutopilot(state, input);
    if (next) {
      aim = next;
    } else {
      // No thug left standing: walk to the marker to grab the package.
      const dx = dock.x - state.player.x;
      const dy = dock.y - state.player.y;
      const len = Math.hypot(dx, dy) || 1;
      input.setMove(dx / len, dy / len);
      input.mouse.down = false;
    }
    if (state.player.hp < 60) state.player.hp = 100;
    game.update(input, SAMPLE, aim);
    if (state.screen !== 'play') break;
  }
  // The staging is a real firefight, so the player usually took a hit
  // moments before the frame — clear the hurt vignette, or the whole
  // shot comes out red. (Staging only; live play is untouched.)
  state.player.lastHurt = -100;
  // Camera behind the player, looking at the thug he is shooting at,
  // angled a little to the side so the player reads in frame. Closer
  // than the normal foot camera: this shot showcases the character.
  const dx = aim.x - state.player.x;
  const dy = aim.y - state.player.y;
  return { screen: 'play', aimWorld: aim, camYaw: Math.atan2(-dx, -dy) + 0.4, camDist: 175 };
}
