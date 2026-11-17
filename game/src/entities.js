// Everyone who moves in Coral Bay: the player on foot and behind the wheel,
// traffic that follows the roads, pedestrians on the sidewalks, police cars
// and foot cops that chase a wanted player, taxi fares, plus bullets,
// pickups and the particles that sell a crash. No drawing here — only
// rules and motion.
import { CAR, CAR_COLORS, COUNTS, PED_SHIRTS, PLAYER, VEHICLE_CLASS, WORLD } from './config.js';
import { isRoad, isWater, nearestRoad } from './city.js';

export const EVENT_CRIME = 1;
export const EVENT_CAR_STOLEN = 2;
export const EVENT_PLAYER_HURT = 4;
export const EVENT_COP_KILLED = 8;
export const EVENT_PICKUP = 16;
export const EVENT_EXPLOSION = 32;
export const EVENT_PED_DOWN = 64;
export const EVENT_FARE = 128;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

let nextCarId = 1;

export function makeCar(x, y, angle, options, random) {
  const opts = options || {};
  const vclass = opts.vclass || (opts.kind === 'cop' ? 'sedan' : random.pick(['sedan', 'sedan', 'coupe', 'truck']));
  const tuning = VEHICLE_CLASS[vclass];
  return {
    id: nextCarId,
    x, y, angle,
    speed: 0,
    color: opts.color || random.pick(CAR_COLORS),
    hp: tuning.hp,
    maxHp: tuning.hp,
    vclass,
    kind: opts.kind || 'traffic',
    driver: opts.kind === 'traffic',
    routeAxis: 'h',
    routeDir: 1,
    lane: 0,
    cruise: random.range(150, 230),
    turnCooldown: 0,
    dead: false,
    smoke: false,
    brake: false,
  };
}

export function makePed(x, y, random) {
  return {
    x, y,
    angle: random.range(0, Math.PI * 2),
    speed: random.range(45, 75),
    shirt: random.pick(PED_SHIRTS),
    state: 'walk',
    hp: 30,
    vx: 0, vy: 0,
    axis: random.chance(0.5) ? 'v' : 'h',
    dir: random.chance(0.5) ? 1 : -1,
    changeIn: random.range(2, 8),
    fleeX: 0, fleeY: 0,
    downAt: null,
  };
}

export function makePickup(x, y, kind, amount) {
  return { x, y, kind, amount, phase: Math.random() * Math.PI * 2 };
}

export function addParticles(state, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.4), max: life,
      color, size: size * (0.6 + Math.random() * 0.8),
    });
  }
  if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
}

function explodeAt(state, x, y, big) {
  addParticles(state, x, y, big ? 26 : 12, '#ff9a2e', big ? 260 : 160, 0.7, 5);
  addParticles(state, x, y, big ? 16 : 8, '#5a5a5a', 90, 1.4, 8);
  addParticles(state, x, y, 8, '#ffd94d', 320, 0.35, 4);
  state.shake = Math.max(state.shake, big ? 14 : 7);
}

function knockDown(person, state) {
  person.state = 'down';
  person.hp = 0;
  person.downAt = state.time;
}

export function explodeCar(state, car) {
  if (car.dead) return EVENT_EXPLOSION;
  car.dead = true;
  car.speed = 0;
  state.pendingEvents = (state.pendingEvents || 0) | EVENT_EXPLOSION;
  explodeAt(state, car.x, car.y, true);
  const p = state.player;
  if (p.inCar && p.car === car) {
    p.inCar = false;
    p.car = null;
    p.x = car.x + 40;
    p.y = car.y;
    hurtPlayer(state, 30);
  }
  // The blast hurts anyone standing close.
  for (const ped of state.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, car.x, car.y) < 90) knockDown(ped, state);
  }
  for (const cop of state.cops) {
    if (cop.state !== 'down' && dist(cop.x, cop.y, car.x, car.y) < 90) knockDown(cop, state);
  }
  return EVENT_EXPLOSION;
}

export function hurtPlayer(state, amount) {
  const p = state.player;
  if (p.hp <= 0) return 0;
  p.hp = Math.max(0, p.hp - amount);
  p.lastHurt = state.time;
  state.shake = Math.max(state.shake, 5);
  return EVENT_PLAYER_HURT;
}

// --- Spawning ---------------------------------------------------------------

export function spawnTrafficCar(state, nearX, nearY) {
  const { city, random } = state;
  const road = random.pick(city.roads);
  const axis = random.chance(0.5) ? 'v' : 'h';
  let x;
  let y;
  if (axis === 'v') {
    x = road + (random.chance(0.5) ? -32 : 32);
    y = random.range(150, WORLD.size - 150);
  } else {
    x = random.range(150, WORLD.size - 150);
    y = road + (random.chance(0.5) ? -32 : 32);
  }
  if (nearX !== undefined && dist(x, y, nearX, nearY) < 500) return null;
  const vclass = random.chance(0.12) ? 'taxi' : null;
  const car = makeCar(x, y, 0, { kind: 'traffic', vclass }, random);
  if (vclass === 'taxi') car.color = '#f5c518';
  car.routeAxis = axis;
  car.routeDir = random.chance(0.5) ? 1 : -1;
  car.angle = axis === 'v' ? (car.routeDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.routeDir > 0 ? 0 : Math.PI);
  car.lane = random.chance(0.5) ? -32 : 32;
  car.speed = car.cruise;
  state.cars.push(car);
  return car;
}

export function spawnParkedCar(state) {
  const { city, random } = state;
  let x;
  let y;
  let angle;
  if (city.lots.length > 0 && random.chance(0.6)) {
    const lot = random.pick(city.lots);
    x = random.range(lot.x + 30, lot.x + lot.w - 30);
    y = random.range(lot.y + 30, lot.y + lot.h - 30);
    angle = random.chance(0.5) ? 0 : Math.PI / 2;
  } else {
    const road = random.pick(city.roads);
    const along = random.range(200, WORLD.size - 200);
    const side = random.chance(0.5) ? 1 : -1;
    if (random.chance(0.5)) {
      x = road + side * (WORLD.roadWidth / 2 - 14);
      y = along;
      angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = along;
      y = road + side * (WORLD.roadWidth / 2 - 14);
      angle = side > 0 ? 0 : Math.PI;
    }
  }
  if (city.buildingHit(x, y, 30)) return null;
  const car = makeCar(x, y, angle, { kind: 'parked' }, random);
  state.cars.push(car);
  return car;
}

export function spawnPed(state, nearX, nearY) {
  const { city, random } = state;
  const road = random.pick(city.roads);
  const axis = random.chance(0.5) ? 'v' : 'h';
  const off = (WORLD.roadWidth / 2 + 16) * (random.chance(0.5) ? 1 : -1);
  let x;
  let y;
  if (axis === 'v') {
    x = road + off;
    y = random.range(150, WORLD.beachY - 100);
  } else {
    x = random.range(150, WORLD.size - 150);
    y = road + off;
  }
  if (nearX !== undefined && dist(x, y, nearX, nearY) < 260) return null;
  if (city.buildingHit(x, y, 14) || isWater(x, y)) return null;
  const ped = makePed(x, y, random);
  ped.axis = axis;
  state.peds.push(ped);
  return ped;
}

export function spawnPickup(state, kind, amount) {
  const { city, random } = state;
  for (let tries = 0; tries < 12; tries += 1) {
    const x = random.range(200, WORLD.size - 200);
    const y = random.range(200, WORLD.beachY - 100);
    if (!isRoad(x, y) && !city.buildingHit(x, y, 20) && !isWater(x, y)) {
      state.pickups.push(makePickup(x, y, kind, amount));
      return;
    }
  }
}

export function spawnCopCar(state) {
  const { city, random, player } = state;
  // Start on the road nearest the player, a good chase distance away,
  // pointed along that road toward the player.
  const road = nearestRoad(player.x, player.y);
  let x = player.x;
  let y = player.y;
  if (road.axis === 'v') {
    x = road.value + 32;
    y = clamp(player.y + (random.chance(0.5) ? 720 : -720), 120, WORLD.beachY - 120);
  } else {
    y = road.value + 32;
    x = clamp(player.x + (random.chance(0.5) ? 720 : -720), 120, WORLD.size - 120);
  }
  if (city.buildingHit(x, y, 30)) return null;
  const car = makeCar(x, y, Math.atan2(player.y - y, player.x - x), { kind: 'cop', color: '#1e2a38' }, random);
  car.speed = 300;
  car.cruise = 430;
  state.cars.push(car);
  return car;
}

export function spawnFootCop(state) {
  const { player, random } = state;
  const a = random.range(0, Math.PI * 2);
  const x = clamp(player.x + Math.cos(a) * random.range(280, 420), 60, WORLD.size - 60);
  const y = clamp(player.y + Math.sin(a) * random.range(280, 420), 60, WORLD.beachY - 60);
  const cop = { x, y, angle: 0, hp: 50, shootTimer: random.range(0.5, 1.5), state: 'chase', speed: 200, muzzle: 0, downAt: null };
  state.cops.push(cop);
  return cop;
}

export function spawnThug(state, x, y) {
  const thug = { x, y, angle: 0, hp: 100, shootTimer: 1, state: 'fight', speed: 150, punchTimer: 0, downAt: null };
  state.thugs.push(thug);
  return thug;
}

// --- Taxi fares -------------------------------------------------------------

function roadsidePoint(state) {
  const { city, random } = state;
  const road = random.pick(city.roads);
  const axis = random.chance(0.5) ? 'v' : 'h';
  const off = (WORLD.roadWidth / 2 + 16) * (random.chance(0.5) ? 1 : -1);
  if (axis === 'v') return { x: road + off, y: random.range(200, WORLD.beachY - 200) };
  return { x: random.range(200, WORLD.size - 200), y: road + off };
}

export function spawnFare(state) {
  const { random } = state;
  const at = roadsidePoint(state);
  let dest = roadsidePoint(state);
  let guard = 0;
  while (dist(at.x, at.y, dest.x, dest.y) < 700 && guard < 10) {
    dest = roadsidePoint(state);
    guard += 1;
  }
  if (state.city.buildingHit(at.x, at.y, 14) || isWater(at.x, at.y)) return null;
  const ped = makePed(at.x, at.y, random);
  ped.state = 'fare';
  ped.shirt = '#f5c518';
  state.peds.push(ped);
  const pay = 80 + Math.round(dist(at.x, at.y, dest.x, dest.y) / 25);
  const fare = {
    x: at.x, y: at.y,
    destX: dest.x, destY: dest.y,
    pay, state: 'waiting', ped, timer: 120,
  };
  state.fares.push(fare);
  return fare;
}

export function updateFares(state, dt) {
  const p = state.player;
  let events = 0;
  for (const fare of state.fares) {
    if (fare.state === 'waiting') {
      fare.timer -= dt;
      if (fare.ped.state === 'down' || fare.timer <= 0) {
        fare.state = 'gone';
        continue;
      }
      if (p.inCar && dist(p.x, p.y, fare.x, fare.y) < 70) {
        fare.state = 'riding';
        state.faresRiding = fare;
        state.peds = state.peds.filter((pd) => pd !== fare.ped);
        state.toast = `Fare picked up — take them to the green marker ($${fare.pay}).`;
        state.toastTimer = 4;
      }
    } else if (fare.state === 'riding') {
      if (dist(p.x, p.y, fare.destX, fare.destY) < 80) {
        fare.state = 'done';
        state.faresRiding = null;
        state.cash += fare.pay;
        state.stats.cashEarned += fare.pay;
        state.stats.faresDone += 1;
        state.toast = `Fare complete — $${fare.pay} earned.`;
        state.toastTimer = 4;
        events |= EVENT_FARE;
      }
    }
  }
  state.fares = state.fares.filter((f) => f.state === 'waiting' || f.state === 'riding');
  return events;
}

// --- The player -------------------------------------------------------------

function moveWithCollision(state, body, dx, dy, radius) {
  const { city } = state;
  const nx = body.x + dx;
  if (!city.buildingHit(nx, body.y, radius) && !isWater(nx, body.y)) body.x = nx;
  const ny = body.y + dy;
  if (!city.buildingHit(body.x, ny, radius) && !isWater(body.x, ny)) body.y = ny;
  const clamped = city.clampInside(body.x, body.y, radius);
  body.x = clamped.x;
  body.y = clamped.y;
}

function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.dead || car.kind === 'cop') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function witnessed(state, x, y, range) {
  for (const ped of state.peds) {
    if (ped.state !== 'down' && ped.state !== 'fare' && dist(ped.x, ped.y, x, y) < range) return true;
  }
  for (const cop of state.cops) {
    if (cop.state !== 'down' && dist(cop.x, cop.y, x, y) < range) return true;
  }
  for (const car of state.cars) {
    if (car.kind === 'cop' && !car.dead && dist(car.x, car.y, x, y) < range) return true;
  }
  return false;
}

function updatePlayerOnFoot(state, input, dt, aim) {
  const p = state.player;
  const mx = input.moveX();
  const my = input.moveY();
  const len = Math.hypot(mx, my) || 1;
  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const moving = mx !== 0 || my !== 0;
  if (moving) {
    moveWithCollision(state, p, (mx / len) * speed * dt, (my / len) * speed * dt, PLAYER.radius);
    p.angle = Math.atan2(my, mx);
    p.moving = true;
  } else {
    p.moving = false;
  }
  // Face the mouse when attacking or armed.
  if (p.weapon === 'pistol' || input.mouse.down) p.angle = Math.atan2(aim.y - p.y, aim.x - p.x);
  p.speed = moving ? speed : 0;

  if (p.punchTimer > 0) p.punchTimer -= dt;
  if (p.shootTimer > 0) p.shootTimer -= dt;

  // Punch: a short arc in front of the player.
  if (input.mouse.down && p.weapon === 'fists' && p.punchTimer <= 0) {
    p.punchTimer = 0.32;
    p.punchAnim = 0.18;
    let events = 0;
    const inArc = (tx, ty, range) => dist(p.x, p.y, tx, ty) < range
      && Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, tx, ty))) < PLAYER.punchArc;
    for (const ped of state.peds) {
      if (ped.state !== 'down' && inArc(ped.x, ped.y, PLAYER.punchRange + 12)) {
        knockDown(ped, state);
        events |= EVENT_CRIME | EVENT_PED_DOWN;
        addParticles(state, ped.x, ped.y, 6, '#e8e4da', 120, 0.4, 4);
      }
    }
    for (const cop of state.cops) {
      if (cop.state !== 'down' && inArc(cop.x, cop.y, PLAYER.punchRange + 12)) {
        cop.hp -= PLAYER.punchDamage * 2;
        if (cop.hp <= 0) {
          knockDown(cop, state);
          events |= EVENT_COP_KILLED;
        }
        events |= EVENT_CRIME;
      }
    }
    for (const thug of state.thugs) {
      if (thug.state !== 'down' && inArc(thug.x, thug.y, PLAYER.punchRange + 12)) {
        thug.hp -= PLAYER.punchDamage;
        if (thug.hp <= 0) knockDown(thug, state);
      }
    }
    return events;
  }

  // Pistol: hold the mouse to fire toward the cursor.
  if (input.mouse.down && p.weapon === 'pistol' && p.shootTimer <= 0 && p.ammo > 0) {
    p.shootTimer = PLAYER.pistolRate;
    p.ammo -= 1;
    p.muzzle = 0.06;
    const a = Math.atan2(aim.y - p.y, aim.x - p.x) + (Math.random() - 0.5) * 0.05;
    state.bullets.push({
      x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
      vx: Math.cos(a) * 900, vy: Math.sin(a) * 900,
      life: 0.6, from: 'player', damage: PLAYER.pistolDamage,
    });
    addParticles(state, p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, 3, '#ffd94d', 140, 0.15, 3);
    return EVENT_CRIME;
  }
  return 0;
}

function updatePlayerDriving(state, input, dt) {
  const p = state.player;
  const car = p.car;
  if (!car || car.dead) {
    p.inCar = false;
    p.car = null;
    return 0;
  }
  const tune = VEHICLE_CLASS[car.vclass];
  const forward = input.up ? 1 : 0;
  const reverse = input.down ? 1 : 0;
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  car.brake = input.brake;

  if (forward) car.speed += tune.accel * dt;
  else if (reverse) {
    if (car.speed > 20) car.speed -= tune.accel * 1.4 * dt;
    else car.speed -= tune.reverseAccel * dt;
  } else {
    car.speed -= car.speed * 1.6 * dt;
  }
  if (input.brake) {
    car.speed -= car.speed * 4.5 * dt;
    if (Math.abs(car.speed) > 120) {
      addParticles(state, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 2, '#b8b8b8', 60, 0.5, 4);
    }
  }
  car.speed = clamp(car.speed, -tune.maxReverse, tune.maxSpeed);
  if (Math.abs(car.speed) < 4 && !forward && !reverse) car.speed = 0;

  const grip = input.brake ? CAR.handbrakeGrip : CAR.grip;
  const turn = steer * tune.turnRate * clamp(Math.abs(car.speed) / 160, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += turn * dt * grip + turn * dt * (1 - grip) * 0.4;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (state.city.buildingHit(nx, ny, CAR.width / 2) || isWater(nx, ny)) {
    car.hp -= Math.abs(car.speed) * 0.09;
    car.speed *= -0.25;
    state.shake = Math.max(state.shake, 4);
    addParticles(state, car.x, car.y, 5, '#c9c9bd', 120, 0.4, 4);
    if (car.hp <= 0) return explodeCar(state, car);
  } else {
    car.x = nx;
    car.y = ny;
    const clamped = state.city.clampInside(car.x, car.y, CAR.width / 2);
    car.x = clamped.x;
    car.y = clamped.y;
  }

  // Running over a pedestrian is a crime, and it is felt.
  let events = 0;
  if (Math.abs(car.speed) > 120) {
    for (const ped of state.peds) {
      if (ped.state !== 'down' && dist(ped.x, ped.y, car.x, car.y) < 30) {
        knockDown(ped, state);
        events |= EVENT_CRIME | EVENT_PED_DOWN;
        addParticles(state, ped.x, ped.y, 8, '#e8e4da', 160, 0.5, 4);
        car.speed *= 0.9;
      }
    }
    for (const cop of state.cops) {
      if (cop.state !== 'down' && dist(cop.x, cop.y, car.x, car.y) < 30) {
        cop.hp -= 60;
        if (cop.hp <= 0) {
          knockDown(cop, state);
          events |= EVENT_COP_KILLED;
        }
        events |= EVENT_CRIME;
        car.speed *= 0.9;
      }
    }
    for (const thug of state.thugs) {
      if (thug.state !== 'down' && dist(thug.x, thug.y, car.x, car.y) < 30) {
        thug.hp -= 60;
        if (thug.hp <= 0) knockDown(thug, state);
      }
    }
  }

  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = Math.abs(car.speed);
  if (car.hp < 40) {
    car.smoke = true;
    if (Math.random() < dt * 6) addParticles(state, car.x, car.y - 10, 1, '#5a5a5a', 40, 0.9, 6);
  }
  return events;
}

function updatePlayer(state, input, dt, aim) {
  const p = state.player;
  if (p.punchAnim > 0) p.punchAnim -= dt;
  if (p.muzzle > 0) p.muzzle -= dt;
  if (p.hp > 0 && state.time - p.lastHurt > PLAYER.regenDelay) {
    p.hp = Math.min(PLAYER.health, p.hp + PLAYER.regenRate * dt);
  }
  if (p.inCar) return updatePlayerDriving(state, input, dt);
  return updatePlayerOnFoot(state, input, dt, aim);
}

// Entering and leaving cars.
export function tryEnterCar(state) {
  const p = state.player;
  if (p.inCar) {
    // Step out beside the car.
    const car = p.car;
    p.inCar = false;
    p.car = null;
    car.kind = 'parked';
    car.speed = 0;
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * 34;
    p.y = car.y + Math.sin(side) * 34;
    if (state.city.buildingHit(p.x, p.y, PLAYER.radius)) {
      p.x = car.x - Math.cos(side) * 34;
      p.y = car.y - Math.sin(side) * 34;
    }
    return 0;
  }
  const car = nearestCar(state, p.x, p.y, 62);
  if (!car) return 0;
  let events = 0;
  if (car.kind === 'traffic' && car.driver) {
    // Yank the driver out; they run off.
    car.driver = false;
    const driver = makePed(car.x + 30, car.y, state.random);
    driver.state = 'flee';
    driver.fleeX = p.x;
    driver.fleeY = p.y;
    state.peds.push(driver);
    events |= EVENT_CAR_STOLEN | EVENT_CRIME;
    state.stats.carsStolen += 1;
  } else if (witnessed(state, car.x, car.y, 320)) {
    events |= EVENT_CAR_STOLEN | EVENT_CRIME;
    state.stats.carsStolen += 1;
  }
  car.kind = 'player';
  p.inCar = true;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  return events;
}

// --- Traffic, pedestrians, police -------------------------------------------

function carHitsCar(a, b) {
  const d = dist(a.x, a.y, b.x, b.y);
  return d < 44 && d > 0.01;
}

function updateTrafficCar(state, car, dt) {
  if (car.dead) return;
  const p = state.player;
  // Slow down for the car ahead on the same road.
  let blocked = false;
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
    const side = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
    if (ahead > 0 && ahead < 78 && side < 30) {
      blocked = true;
      break;
    }
  }
  const target = blocked ? 0 : car.cruise;
  car.speed += clamp(target - car.speed, -300 * dt, 200 * dt);
  car.turnCooldown -= dt;

  // At an intersection, sometimes turn onto the crossing road.
  const atCross = car.routeAxis === 'v'
    ? Math.abs(car.y - Math.round(car.y / 400) * 400) < 22
    : Math.abs(car.x - Math.round(car.x / 400) * 400) < 22;
  if (atCross && car.turnCooldown <= 0 && state.random.chance(dt * 0.5)) {
    const cross = nearestRoad(car.x, car.y);
    if (cross.axis !== car.routeAxis) {
      car.routeAxis = cross.axis;
      car.routeDir = state.random.chance(0.5) ? 1 : -1;
      car.turnCooldown = 4;
    }
  }
  const desired = car.routeAxis === 'v'
    ? (car.routeDir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (car.routeDir > 0 ? 0 : Math.PI);
  car.angle += angleDiff(car.angle, desired) * Math.min(1, dt * 3);

  const laneTarget = car.routeAxis === 'v'
    ? (car.routeDir > 0 ? nearestRoad(car.x, car.y).value + 32 : nearestRoad(car.x, car.y).value - 32)
    : (car.routeDir > 0 ? nearestRoad(car.x, car.y).value - 32 : nearestRoad(car.x, car.y).value + 32);
  const laneErr = car.routeAxis === 'v' ? laneTarget - car.x : laneTarget - car.y;
  const steer = clamp(laneErr * 0.02, -0.5, 0.5);
  car.angle += steer * dt * 2;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const clamped = state.city.clampInside(car.x, car.y, 26);
  car.x = clamped.x;
  car.y = clamped.y;

  // Bump into the player's car.
  if (p.inCar && p.car && car !== p.car && carHitsCar(car, p.car)) {
    const push = angleTo(car.x, car.y, p.car.x, p.car.y);
    p.car.x += Math.cos(push) * 26 * dt * 10;
    p.car.y += Math.sin(push) * 26 * dt * 10;
    p.car.hp -= 2;
    car.speed *= 0.7;
    if (p.car.hp <= 0) explodeCar(state, p.car);
  }
  // Bump into another car: both slow down.
  for (const other of state.cars) {
    if (other === car || other.dead || other.kind === 'player') continue;
    if (carHitsCar(car, other)) {
      car.speed *= 0.6;
      other.speed *= 0.6;
    }
  }
  if (car.hp < 40 && Math.random() < dt * 4) {
    addParticles(state, car.x, car.y - 8, 1, '#5a5a5a', 30, 0.9, 6);
  }
}

function updateCopCar(state, car, dt) {
  if (car.dead) return;
  const p = state.player;
  const want = angleTo(car.x, car.y, p.x, p.y);
  const diff = angleDiff(car.angle, want);
  car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
  const d = dist(car.x, car.y, p.x, p.y);
  const target = d > 120 ? car.cruise * 1.5 : car.cruise * 0.7;
  car.speed += clamp(target - car.speed, -500 * dt, 420 * dt);
  car.speed = clamp(car.speed, -60, 620);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (state.city.buildingHit(nx, ny, 22) || isWater(nx, ny)) {
    car.speed *= -0.3;
    car.hp -= 6;
    if (car.hp <= 0) explodeCar(state, car);
  } else {
    car.x = nx;
    car.y = ny;
  }
  // Ram the player's car, or run the player down on foot.
  if (p.inCar && p.car && carHitsCar(car, p.car)) {
    p.car.hp -= CAR.ramDamage * dt * 3;
    car.hp -= 4 * dt * 3;
    const push = angleTo(car.x, car.y, p.car.x, p.car.y);
    p.car.x += Math.cos(push) * 60 * dt;
    p.car.y += Math.sin(push) * 60 * dt;
    state.shake = Math.max(state.shake, 3);
    if (p.car.hp <= 0) explodeCar(state, p.car);
    if (car.hp <= 0) explodeCar(state, car);
  } else if (!p.inCar && dist(car.x, car.y, p.x, p.y) < 34 && Math.abs(car.speed) > 60) {
    hurtPlayer(state, 18);
    const push = angleTo(car.x, car.y, p.x, p.y);
    p.x += Math.cos(push) * 30;
    p.y += Math.sin(push) * 30;
    car.speed *= 0.4;
  }
}

function updatePed(state, ped, dt) {
  if (ped.state === 'down') return;
  const p = state.player;
  // A fare waits at the curb, waving at passing cars.
  if (ped.state === 'fare') {
    ped.angle = Math.PI / 2 + Math.sin(state.time * 3) * 0.4;
    return;
  }
  if (ped.state === 'flee') {
    const a = angleTo(ped.fleeX, ped.fleeY, ped.x, ped.y);
    ped.x += Math.cos(a) * 190 * dt;
    ped.y += Math.sin(a) * 190 * dt;
    ped.angle = a;
    const clamped = state.city.clampInside(ped.x, ped.y, 12);
    ped.x = clamped.x;
    ped.y = clamped.y;
    if (dist(ped.x, ped.y, ped.fleeX, ped.fleeY) > 700) ped.state = 'walk';
    return;
  }
  // A gunshot or a car bearing down scares people off the street.
  const danger = state.bullets.length > 0 || (p.inCar && p.car && dist(ped.x, ped.y, p.x, p.y) < 130 && Math.abs(p.car.speed) > 200);
  if (danger && dist(ped.x, ped.y, p.x, p.y) < 320) {
    ped.state = 'flee';
    ped.fleeX = p.x;
    ped.fleeY = p.y;
    return;
  }
  ped.changeIn -= dt;
  if (ped.changeIn <= 0) {
    ped.changeIn = state.random.range(3, 9);
    if (state.random.chance(0.4)) ped.dir *= -1;
    if (state.random.chance(0.25)) ped.axis = ped.axis === 'v' ? 'h' : 'v';
  }
  const road = nearestRoad(ped.x, ped.y);
  const off = WORLD.roadWidth / 2 + 16;
  let tx;
  let ty;
  if (ped.axis === 'v') {
    tx = road.value + (ped.x > road.value ? off : -off);
    ty = ped.y + ped.dir * ped.speed * dt;
  } else {
    tx = ped.x + ped.dir * ped.speed * dt;
    ty = road.value + (ped.y > road.value ? off : -off);
  }
  if (!state.city.buildingHit(tx, ty, 12) && !isWater(tx, ty)) {
    ped.x = tx;
    ped.y = ty;
  } else {
    ped.dir *= -1;
  }
  ped.angle = ped.axis === 'v' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
}

function updateCop(state, cop, dt) {
  if (cop.state === 'down') return;
  const p = state.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  const a = angleTo(cop.x, cop.y, p.x, p.y);
  cop.angle = a;
  if (d > 46) {
    const sp = cop.speed * dt;
    const nx = cop.x + Math.cos(a) * sp;
    const ny = cop.y + Math.sin(a) * sp;
    if (!state.city.buildingHit(nx, ny, 12) && !isWater(nx, ny)) {
      cop.x = nx;
      cop.y = ny;
    }
  }
  // Cops open fire once the heat is on and they have a line on the player.
  cop.shootTimer -= dt;
  if (state.wanted >= 3 && d < 340 && cop.shootTimer <= 0 && !p.inCar) {
    cop.shootTimer = 0.9 + Math.random() * 0.7;
    const spread = (Math.random() - 0.5) * 0.22;
    const sa = a + spread;
    state.bullets.push({
      x: cop.x + Math.cos(sa) * 20, y: cop.y + Math.sin(sa) * 20,
      vx: Math.cos(sa) * 760, vy: Math.sin(sa) * 760,
      life: 0.6, from: 'cop', damage: 9,
    });
    cop.muzzle = 0.06;
  }
  if (cop.muzzle > 0) cop.muzzle -= dt;
}

function updateThug(state, thug, dt) {
  if (thug.state === 'down') return;
  const p = state.player;
  const d = dist(thug.x, thug.y, p.x, p.y);
  const a = angleTo(thug.x, thug.y, p.x, p.y);
  thug.angle = a;
  if (d > 260) {
    thug.x += Math.cos(a) * thug.speed * dt;
    thug.y += Math.sin(a) * thug.speed * dt;
  } else if (d < 60 && !p.inCar) {
    // Close in and swing.
    thug.punchTimer -= dt;
    if (thug.punchTimer <= 0) {
      thug.punchTimer = 0.8;
      hurtPlayer(state, 8);
    }
  }
  thug.shootTimer -= dt;
  if (d < 380 && thug.shootTimer <= 0) {
    thug.shootTimer = 1.1 + Math.random() * 0.8;
    const sa = a + (Math.random() - 0.5) * 0.3;
    state.bullets.push({
      x: thug.x + Math.cos(sa) * 20, y: thug.y + Math.sin(sa) * 20,
      vx: Math.cos(sa) * 700, vy: Math.sin(sa) * 700,
      life: 0.6, from: 'thug', damage: 7,
    });
  }
}

function updateBullets(state, dt) {
  const p = state.player;
  for (const b of state.bullets) {
    if (b.life <= 0) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (state.city.buildingHit(b.x, b.y, 2) || isWater(b.x, b.y)) {
      b.life = 0;
      addParticles(state, b.x, b.y, 3, '#c9c9bd', 90, 0.25, 3);
      continue;
    }
    if (b.from === 'player') {
      for (const ped of state.peds) {
        if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 16) {
          ped.hp -= b.damage;
          b.life = 0;
          if (ped.hp <= 0) {
            knockDown(ped, state);
            state.pendingEvents = (state.pendingEvents || 0) | EVENT_CRIME | EVENT_PED_DOWN;
          }
          addParticles(state, b.x, b.y, 4, '#c23a2e', 100, 0.3, 3);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const cop of state.cops) {
        if (cop.state !== 'down' && dist(b.x, b.y, cop.x, cop.y) < 16) {
          cop.hp -= b.damage;
          b.life = 0;
          if (cop.hp <= 0) {
            knockDown(cop, state);
            state.lastKillCop = state.time;
            state.pendingEvents = (state.pendingEvents || 0) | EVENT_COP_KILLED;
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const thug of state.thugs) {
        if (thug.state !== 'down' && dist(b.x, b.y, thug.x, thug.y) < 16) {
          thug.hp -= b.damage;
          b.life = 0;
          if (thug.hp <= 0) knockDown(thug, state);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of state.cars) {
        if (!car.dead && dist(b.x, b.y, car.x, car.y) < 26) {
          car.hp -= b.damage;
          b.life = 0;
          if (car.hp <= 0) explodeCar(state, car);
          break;
        }
      }
    } else if (dist(b.x, b.y, p.x, p.y) < 15 && !p.inCar && p.hp > 0) {
      b.life = 0;
      hurtPlayer(state, b.damage);
      addParticles(state, b.x, b.y, 4, '#c23a2e', 100, 0.3, 3);
    } else {
      for (const car of state.cars) {
        if (!car.dead && car.kind === 'player' && dist(b.x, b.y, car.x, car.y) < 26) {
          car.hp -= b.damage;
          b.life = 0;
          if (car.hp <= 0) explodeCar(state, car);
          break;
        }
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

function updatePickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    pk.phase += dt * 3;
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      pk.taken = true;
      if (pk.kind === 'cash') {
        state.cash += pk.amount;
        state.stats.cashEarned += pk.amount;
      } else if (pk.kind === 'health') {
        p.hp = Math.min(PLAYER.health, p.hp + 40);
      } else if (pk.kind === 'ammo') {
        p.ammo += 24;
      }
      addParticles(state, pk.x, pk.y, 10, '#37e0a0', 120, 0.5, 4);
      state.pickupEvent = pk.kind;
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);
}

function updateParticles(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.94;
    pt.vy *= 0.94;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
}

// --- One step of the whole world --------------------------------------------

/**
 * Advance every entity one fixed step. Returns the event flags of the step.
 * In attract mode (the title screen's living backdrop) the player stands
 * still and nothing can hurt them — only the city moves.
 */
export function updateWorld(state, input, dt, aim, attract) {
  let events = 0;
  if (!attract) events = updatePlayer(state, input, dt, aim);
  for (const car of state.cars) {
    if (car.kind === 'cop') updateCopCar(state, car, dt);
    else if (car.kind !== 'player') updateTrafficCar(state, car, dt);
  }
  // The player's own car is driven by updatePlayerDriving, not traffic.
  for (const ped of state.peds) updatePed(state, ped, dt);
  for (const cop of state.cops) updateCop(state, cop, dt);
  for (const thug of state.thugs) updateThug(state, thug, dt);
  updateBullets(state, dt);
  updatePickups(state, dt);
  updateParticles(state, dt);

  // Keep the streets full: respawn traffic and pedestrians that wandered off.
  state.cars = state.cars.filter((c) => !c.dead || c.kind === 'player');
  const aliveTraffic = state.cars.filter((c) => c.kind === 'traffic' || c.kind === 'parked').length;
  if (aliveTraffic < COUNTS.traffic && Math.random() < dt * 2) {
    if (Math.random() < 0.7) spawnTrafficCar(state, state.player.x, state.player.y);
    else spawnParkedCar(state);
  }
  const alivePeds = state.peds.filter((pd) => pd.state !== 'down').length;
  if (alivePeds < COUNTS.peds && Math.random() < dt * 3) {
    spawnPed(state, state.player.x, state.player.y);
  }
  // The dead are cleared away after a while (downAt is stamped the moment
  // someone goes down, so this actually removes them now).
  state.peds = state.peds.filter((pd) => pd.state !== 'down' || state.time - (pd.downAt ?? state.time) < 20);
  if (state.pickups.length < COUNTS.pickups && Math.random() < dt * 0.5) {
    const roll = Math.random();
    spawnPickup(state, roll < 0.6 ? 'cash' : roll < 0.8 ? 'health' : 'ammo', roll < 0.6 ? 50 + Math.floor(Math.random() * 100) : 0);
  }
  // Events raised from inside the world (a bullet kill, an explosion nobody
  // watched) ride along with the step's own flags.
  events |= state.pendingEvents || 0;
  state.pendingEvents = 0;
  return events;
}
