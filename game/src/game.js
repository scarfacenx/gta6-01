// The game itself: state, screens, the wanted system, police response,
// taxi fares, mission flow, saving, and the per-frame glue between input,
// the world, the missions and the sound. The rules live in entities.js and
// missions.js; this file decides what happens next.
import { COUNTS, DAY_LENGTH, PLAYER, SAVE_KEY, SCREENS, VEHICLE_CLASS, WANTED } from './config.js';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { createRandom } from './random.js';
import {
  EVENT_CAR_STOLEN,
  EVENT_COP_KILLED,
  EVENT_CRIME,
  EVENT_EXPLOSION,
  EVENT_FARE,
  EVENT_PLAYER_HURT,
  spawnCopCar,
  spawnFare,
  spawnFootCop,
  spawnParkedCar,
  spawnPed,
  spawnPickup,
  spawnTrafficCar,
  tryEnterCar,
  updateFares,
  updateWorld,
} from './entities.js';
import { EVENT_MISSION_DONE, EVENT_MISSION_STEP, MISSIONS, missionObjective, startMission, updateMission } from './missions.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_WEAPON1, ACTION_WEAPON2 } from './input.js';

function freshPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    hp: PLAYER.health,
    speed: 0,
    moving: false,
    inCar: false,
    car: null,
    weapon: 'fists',
    ammo: 0,
    hasPistol: false,
    lastHurt: -100,
    punchTimer: 0,
    punchAnim: 0,
    shootTimer: 0,
    muzzle: 0,
  };
}

export function createGame(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const audio = createAudio();

  const state = {
    city,
    random,
    time: 0,
    timeOfDay: 0.08,
    cash: 150,
    wanted: 0,
    lastCrimeAt: -1000,
    wantedTimer: 0,
    bustTimer: 0,
    screen: SCREENS.TITLE,
    missionIndex: 0,
    mission: null,
    missionMarker: null,
    missionMarkerLabel: '',
    passenger: false,
    fares: [],
    faresRiding: null,
    player: freshPlayer(400, 2160),
    cars: [],
    peds: [],
    cops: [],
    thugs: [],
    bullets: [],
    pickups: [],
    particles: [],
    camera: { x: 0, y: 0 },
    shake: 0,
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, cashEarned: 0, faresDone: 0 },
    toast: '',
    toastTimer: 0,
    nearCar: false,
    nearFare: false,
    lastLoss: 0,
    lastMissionTitle: '',
    lastMissionReward: 0,
    hasSave: false,
    showHow: false,
    uiButtons: [],
    pendingEvents: 0,
    pickupEvent: null,
    saveTimer: 0,
    missionWasActive: false,
    copSpawnTimer: 0,
    announced: '',
  };

  function populate() {
    state.cars.length = 0;
    state.peds.length = 0;
    state.cops.length = 0;
    state.thugs.length = 0;
    state.bullets.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.fares.length = 0;
    state.faresRiding = null;
    for (let i = 0; i < COUNTS.traffic; i += 1) {
      if (i < 10) spawnParkedCar(state);
      else spawnTrafficCar(state);
    }
    for (let i = 0; i < COUNTS.peds; i += 1) spawnPed(state);
    for (let i = 0; i < 8; i += 1) spawnPickup(state, 'cash', 50 + Math.floor(random() * 100));
    for (let i = 0; i < 2; i += 1) spawnPickup(state, 'health', 0);
    for (let i = 0; i < 2; i += 1) spawnPickup(state, 'ammo', 0);
    for (let i = 0; i < COUNTS.maxFares; i += 1) spawnFare(state);
  }

  function resetRun() {
    state.time = 0;
    state.timeOfDay = 0.08;
    state.cash = 150;
    state.wanted = 0;
    state.lastCrimeAt = -1000;
    state.wantedTimer = 0;
    state.bustTimer = 0;
    state.missionIndex = 0;
    state.mission = null;
    state.passenger = false;
    state.player = freshPlayer(400, 2160);
    state.stats = { kills: 0, carsStolen: 0, missionsDone: 0, cashEarned: 0, faresDone: 0 };
    state.toast = '';
    state.toastTimer = 0;
    populate();
  }

  function readSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        cash: state.cash,
        missionIndex: state.missionIndex,
        hp: Math.max(1, Math.round(state.player.hp)),
        hasPistol: state.player.hasPistol,
        ammo: state.player.ammo,
        weapon: state.player.weapon,
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        stats: state.stats,
        timeOfDay: state.timeOfDay,
      }));
      state.hasSave = true;
    } catch {
      // Storage can be off: the save then lasts this visit only.
    }
  }

  function applySave(save) {
    state.cash = save.cash;
    state.missionIndex = Math.min(save.missionIndex, MISSIONS.length);
    state.player.hp = save.hp;
    state.player.hasPistol = !!save.hasPistol;
    state.player.ammo = save.ammo || 0;
    state.player.weapon = save.weapon || 'fists';
    state.player.x = save.x;
    state.player.y = save.y;
    state.stats = save.stats || state.stats;
    if (state.stats.faresDone === undefined) state.stats.faresDone = 0;
    state.timeOfDay = save.timeOfDay || 0.08;
    state.mission = null;
    state.toast = state.missionIndex < MISSIONS.length
      ? `Welcome back. Press Enter to start: ${MISSIONS[state.missionIndex].title}`
      : 'Welcome back. Free roam — Coral Bay is yours.';
    state.toastTimer = 6;
  }

  function newGame() {
    resetRun();
    state.screen = SCREENS.PLAY;
    audio.ensure();
    audio.startMusic();
    audio.startEngine();
    startMission(state, 0);
  }

  function continueGame() {
    const save = readSave();
    if (!save) {
      newGame();
      return;
    }
    resetRun();
    applySave(save);
    state.screen = SCREENS.PLAY;
    audio.ensure();
    audio.startMusic();
    audio.startEngine();
  }

  function toTitle() {
    state.screen = SCREENS.TITLE;
    state.hasSave = !!readSave();
    audio.stopSiren();
    audio.setEngine(0, false);
  }

  function loseCash(frac, minLoss) {
    const loss = Math.min(state.cash, Math.max(minLoss, Math.floor(state.cash * frac)));
    state.cash -= loss;
    state.lastLoss = loss;
    return loss;
  }

  function respawn(place) {
    const m = city.landmarks[place].marker;
    const p = state.player;
    p.x = m.x;
    p.y = m.y;
    p.hp = PLAYER.health;
    p.inCar = false;
    p.car = null;
    p.lastHurt = state.time;
    state.wanted = 0;
    state.bustTimer = 0;
    state.cops.length = 0;
    state.cars = state.cars.filter((c) => c.kind !== 'cop');
    state.bullets.length = 0;
    audio.stopSiren();
  }

  function wasted() {
    state.missionWasActive = !!state.mission && !state.mission.done;
    loseCash(0.1, 100);
    state.screen = SCREENS.WASTED;
    audio.fail();
    audio.stopSiren();
    audio.setEngine(0, false);
  }

  function busted() {
    state.missionWasActive = !!state.mission && !state.mission.done;
    loseCash(0.1, 200);
    state.screen = SCREENS.BUSTED;
    audio.fail();
    audio.stopSiren();
    audio.setEngine(0, false);
  }

  function updateWanted(dt) {
    if (state.wanted === 0) return;
    if (state.time - state.lastCrimeAt < WANTED.decayDelay) {
      state.wantedTimer = 0;
      return;
    }
    // Cool down only when no cop can see the player.
    let seen = false;
    for (const cop of state.cops) {
      if (cop.state !== 'down' && Math.hypot(cop.x - state.player.x, cop.y - state.player.y) < 420) { seen = true; break; }
    }
    if (!seen) {
      for (const car of state.cars) {
        if (car.kind === 'cop' && !car.dead && Math.hypot(car.x - state.player.x, car.y - state.player.y) < 420) { seen = true; break; }
      }
    }
    if (seen) {
      state.wantedTimer = 0;
      return;
    }
    state.wantedTimer += dt;
    if (state.wantedTimer >= WANTED.decayEvery) {
      state.wantedTimer = 0;
      state.wanted -= 1;
      if (state.wanted === 0) {
        state.cops.length = 0;
        state.cars = state.cars.filter((c) => c.kind !== 'cop');
        state.toast = 'You lost the cops.';
        state.toastTimer = 3;
        audio.stopSiren();
      }
    }
  }

  function updatePolice(dt) {
    if (state.wanted === 0) return;
    state.copSpawnTimer -= dt;
    const copCars = state.cars.filter((c) => c.kind === 'cop' && !c.dead).length;
    const wantCars = Math.min(state.wanted, COUNTS.maxCopCars);
    if (copCars < wantCars && state.copSpawnTimer <= 0) {
      state.copSpawnTimer = 1.6;
      if (spawnCopCar(state)) audio.sirenBlip();
    }
    const footCops = state.cops.filter((c) => c.state !== 'down').length;
    const wantCops = state.wanted >= 2 ? Math.min(state.wanted - 1, COUNTS.maxFootCops) : 0;
    if (footCops < wantCops && state.copSpawnTimer <= 0) {
      state.copSpawnTimer = 2.5;
      spawnFootCop(state);
    }
    if (state.wanted > 0) audio.startSiren();
  }

  function updateBust(dt) {
    const p = state.player;
    if (p.inCar || state.wanted === 0 || p.hp <= 0) {
      state.bustTimer = 0;
      return;
    }
    let near = false;
    for (const cop of state.cops) {
      if (cop.state !== 'down' && Math.hypot(cop.x - p.x, cop.y - p.y) < WANTED.bustRange) { near = true; break; }
    }
    if (near) {
      state.bustTimer += dt;
      if (state.bustTimer >= WANTED.bustSeconds) busted();
    } else {
      state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
    }
  }

  function handleEvents(events) {
    if (events & EVENT_CRIME) {
      state.wanted = Math.min(WANTED.max, state.wanted + 1);
      state.lastCrimeAt = state.time;
      state.wantedTimer = 0;
    }
    if (events & EVENT_COP_KILLED) {
      state.wanted = Math.min(WANTED.max, state.wanted + 1);
      state.lastCrimeAt = state.time;
      state.stats.kills += 1;
    }
    if (events & EVENT_CAR_STOLEN) {
      state.toast = 'Car stolen — the heat is on.';
      state.toastTimer = 3;
    }
    if (events & EVENT_EXPLOSION) audio.explosion();
    if (events & EVENT_PLAYER_HURT) audio.punch();
    if (events & EVENT_FARE) audio.cash();
    if (state.pickupEvent) {
      const kind = state.pickupEvent;
      state.pickupEvent = null;
      if (kind === 'cash') audio.cash();
      else audio.pickup();
    }
  }

  function updatePlay(input, dt, aim, actions) {
    state.time += dt;
    state.timeOfDay = (state.timeOfDay + dt / DAY_LENGTH) % 1;
    if (state.toastTimer > 0) state.toastTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 34);

    // The actions were already taken by update() — taking them again here
    // would read an empty set and swallow every one-shot press in play.
    if (actions & ACTION_PAUSE) {
      state.screen = SCREENS.PAUSE;
      saveGame();
      return;
    }
    if (actions & ACTION_MUTE) audio.setMuted(!audio.muted);
    if (actions & ACTION_WEAPON1) state.player.weapon = 'fists';
    if (actions & ACTION_WEAPON2 && state.player.hasPistol) state.player.weapon = 'pistol';
    if (actions & ACTION_ENTER) {
      const before = state.player.inCar;
      const events = tryEnterCar(state);
      if (events) handleEvents(events);
      if (!before && state.player.inCar) audio.click();
    }
    if (actions & ACTION_CONFIRM && !state.mission && state.missionIndex < MISSIONS.length) {
      startMission(state, state.missionIndex);
      audio.jingle();
    }

    const events = updateWorld(state, input, dt, aim, false);
    handleEvents(events);
    handleEvents(updateFares(state, dt));

    // Missions advance; a finished one pauses the action for its panel.
    const mEvents = updateMission(state, dt);
    if (mEvents & EVENT_MISSION_DONE) {
      state.lastMissionTitle = state.mission.def.title;
      state.lastMissionReward = state.mission.def.reward;
      state.missionIndex += 1;
      state.mission = null;
      audio.jingle();
      saveGame();
      state.screen = state.missionIndex >= MISSIONS.length ? SCREENS.ENDING : SCREENS.COMPLETE;
      audio.stopSiren();
      audio.setEngine(0, false);
      return;
    }
    if (mEvents & EVENT_MISSION_STEP) audio.pickup();

    const obj = missionObjective(state);
    state.missionMarker = obj.marker;
    state.missionMarkerLabel = obj.markerName;

    updateWanted(dt);
    updatePolice(dt);
    updateBust(dt);

    // The hint under the crosshair: is there a car to steal nearby?
    state.nearCar = false;
    state.nearFare = false;
    if (!state.player.inCar) {
      for (const car of state.cars) {
        if (!car.dead && car.kind !== 'cop' && Math.hypot(car.x - state.player.x, car.y - state.player.y) < 62) {
          state.nearCar = true;
          break;
        }
      }
    } else {
      for (const fare of state.fares) {
        if (fare.state === 'waiting' && Math.hypot(fare.x - state.player.x, fare.y - state.player.y) < 90) {
          state.nearFare = true;
          break;
        }
      }
    }

    // Engine hum follows the car; sirens follow the wanted level.
    if (state.player.inCar && state.player.car) {
      const top = VEHICLE_CLASS[state.player.car.vclass].maxSpeed;
      audio.setEngine(Math.abs(state.player.car.speed) / top, true);
    } else {
      audio.setEngine(0, false);
    }

    if (state.player.hp <= 0) {
      wasted();
      return;
    }
    state.saveTimer += dt;
    if (state.saveTimer > 15) {
      state.saveTimer = 0;
      saveGame();
    }
  }

  function update(input, dt, aim) {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) audio.setMuted(!audio.muted);
    if (state.screen === SCREENS.TITLE) {
      if (actions & ACTION_CONFIRM) {
        if (state.hasSave) continueGame();
        else newGame();
        return;
      }
      if (input.takeClick()) {
        const mx = input.mouse.x;
        const my = input.mouse.y;
        for (const b of state.uiButtons) {
          if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
            audio.ensure();
            audio.click();
            if (b.id === 'new') newGame();
            else if (b.id === 'continue') continueGame();
            else if (b.id === 'how') state.showHow = !state.showHow;
            return;
          }
        }
      }
      // The title screen plays the city behind it: traffic and pedestrians
      // keep moving, but nothing can touch the player yet.
      state.time += dt;
      state.timeOfDay = (state.timeOfDay + dt / DAY_LENGTH) % 1;
      updateWorld(state, input, dt, aim, true);
      return;
    }
    if (state.screen === SCREENS.PLAY) {
      updatePlay(input, dt, aim, actions);
      return;
    }
    if (state.screen === SCREENS.PAUSE) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM) || input.takeClick()) {
        state.screen = SCREENS.PLAY;
      }
      return;
    }
    if (state.screen === SCREENS.WASTED || state.screen === SCREENS.BUSTED) {
      if (actions & ACTION_CONFIRM) {
        const wasBusted = state.screen === SCREENS.BUSTED;
        respawn(wasBusted ? 'policeStation' : 'hospital');
        if (state.missionWasActive) {
          state.missionWasActive = false;
          state.screen = SCREENS.FAILED;
        } else {
          state.screen = SCREENS.PLAY;
        }
      }
      return;
    }
    if (state.screen === SCREENS.FAILED) {
      if (actions & ACTION_CONFIRM) {
        startMission(state, state.missionIndex);
        state.screen = SCREENS.PLAY;
      }
      return;
    }
    if (state.screen === SCREENS.COMPLETE) {
      if (actions & ACTION_CONFIRM) state.screen = SCREENS.PLAY;
      return;
    }
    if (state.screen === SCREENS.ENDING) {
      if (actions & ACTION_CONFIRM) state.screen = SCREENS.PLAY;
    }
  }

  // First paint needs a populated city even before New Game is pressed.
  populate();
  state.hasSave = !!readSave();

  return {
    state,
    audio,
    newGame,
    continueGame,
    toTitle,
    saveGame,
    update,
    // Test and screenshot helpers.
    _resetRun: resetRun,
    _populate: populate,
  };
}
