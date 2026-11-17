// The story: five missions for Danny Cole, an ex-getaway driver back in
// Coral Bay and in debt to Vera Kline. Each mission is a list of steps; a
// step is done when its condition holds (reach a marker, steal a car,
// defeat the crew, survive the heat). The module owns nothing but the
// definitions and the step machine — the game owns the state.
import { spawnThug } from './entities.js';

export const EVENT_MISSION_STEP = 1;
export const EVENT_MISSION_DONE = 2;

export const MISSIONS = [
  {
    id: 'clean-ride',
    title: 'Clean Ride',
    briefing: 'Vera needs a clean ride. Steal any car and bring it to Kline Motors.',
    reward: 400,
    steps: [
      { type: 'steal', label: 'Steal a car — press E next to one' },
      { type: 'driveTo', place: 'garage', label: 'Deliver it to Kline Motors' },
    ],
    onComplete(state) {
      state.player.hasPistol = true;
      state.player.ammo += 24;
      state.player.weapon = 'pistol';
    },
  },
  {
    id: 'pick-up-mia',
    title: 'Pick Up Mia',
    briefing: 'Mia is waiting at The Coral Bar. Pick her up, lose the cops, get her home.',
    reward: 600,
    steps: [
      { type: 'goto', place: 'bar', label: 'Go to The Coral Bar' },
      { type: 'pickup', place: 'bar', label: 'Pick up Mia (get in a car first)' },
      { type: 'deliver', place: 'safehouse', label: 'Get Mia to Marina Court — lose the cops' },
    ],
    onStart(state) {
      state.passenger = false;
    },
  },
  {
    id: 'dockside-debt',
    title: 'Dockside Debt',
    briefing: 'The dock crew owes Vera. Settle it at the harbor and bring back the package.',
    reward: 900,
    steps: [
      { type: 'goto', place: 'docks', label: 'Go to Harbor Docks' },
      { type: 'defeat', label: 'Deal with the dock crew' },
      { type: 'grab', place: 'docks', label: 'Grab the package' },
      { type: 'deliver', place: 'bar', label: 'Bring the package to The Coral Bar' },
    ],
    onStart(state) {
      const m = state.city.landmarks.docks.marker;
      state.thugs.length = 0;
      spawnThug(state, m.x - 120, m.y - 60);
      spawnThug(state, m.x + 100, m.y - 90);
      spawnThug(state, m.x - 60, m.y + 110);
      spawnThug(state, m.x + 140, m.y + 80);
    },
    onComplete(state) {
      state.player.ammo += 36;
    },
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    briefing: 'Coral Bay Savings, midday. Grab the cash and vanish before the heat finds you.',
    reward: 1500,
    steps: [
      { type: 'goto', place: 'bank', label: 'Get to Coral Bay Savings' },
      { type: 'grab', place: 'bank', label: 'Grab the cash — hold the spot', seconds: 3 },
      { type: 'deliver', place: 'safehouse', label: 'Escape to Marina Court (3 stars)' },
    ],
    onStart(state) {
      state.missionGrab = 0;
    },
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    briefing: 'Every cop in Coral Bay is on you. Survive the heat, then disappear.',
    reward: 2500,
    steps: [
      { type: 'survive', seconds: 90, label: 'Survive the 4-star heat' },
      { type: 'deliver', place: 'safehouse', label: 'Reach Marina Court' },
    ],
    onStart(state) {
      state.wanted = 4;
      state.lastCrimeAt = state.time;
    },
  },
];

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) return false;
  state.missionIndex = index;
  state.mission = { id: def.id, def, step: 0, timer: 0, grab: 0, done: false };
  if (def.onStart) def.onStart(state);
  state.toast = `${def.title} — ${def.briefing}`;
  state.toastTimer = 6;
  return true;
}

function markerOf(state, place) {
  return state.city.landmarks[place].marker;
}

function near(state, place, range) {
  const m = markerOf(state, place);
  const p = state.player;
  return Math.hypot(p.x - m.x, p.y - m.y) < range;
}

// Advance the active mission one step. Returns EVENT_MISSION_* flags.
export function updateMission(state, dt) {
  const mission = state.mission;
  if (!mission || mission.done) return 0;
  const step = mission.def.steps[mission.step];
  if (!step) return 0;
  const p = state.player;
  let advanced = false;

  switch (step.type) {
    case 'steal':
      advanced = p.inCar;
      break;
    case 'goto':
      advanced = near(state, step.place, 80);
      break;
    case 'driveTo':
      advanced = p.inCar && near(state, step.place, 90);
      break;
    case 'pickup':
      if (near(state, step.place, 90) && p.inCar) {
        state.passenger = true;
        state.wanted = Math.max(state.wanted, 2);
        state.lastCrimeAt = state.time;
        state.toast = 'Mia is in the car. Lose the cops!';
        state.toastTimer = 4;
        advanced = true;
      }
      break;
    case 'defeat':
      advanced = state.thugs.filter((t) => t.state !== 'down').length === 0;
      break;
    case 'grab': {
      const need = step.seconds || 2;
      if (near(state, step.place, 70)) {
        mission.grab += dt;
        if (mission.grab >= need) {
          mission.grab = 0;
          if (mission.def.id === 'the-big-score') {
            state.wanted = Math.max(state.wanted, 3);
            state.lastCrimeAt = state.time;
            state.cash += 800;
            state.stats.cashEarned += 800;
            state.toast = 'Cash grabbed! Get out of here!';
            state.toastTimer = 4;
          } else {
            state.toast = 'Package secured.';
            state.toastTimer = 3;
          }
          advanced = true;
        }
      } else {
        mission.grab = Math.max(0, mission.grab - dt);
      }
      break;
    }
    case 'survive':
      if (state.wanted >= 3) mission.timer += dt;
      if (mission.timer >= step.seconds) advanced = true;
      break;
    case 'deliver':
      if (near(state, step.place, 90)) {
        state.passenger = false;
        advanced = true;
      }
      break;
    default:
      break;
  }

  if (!advanced) return 0;
  mission.step += 1;
  if (mission.step >= mission.def.steps.length) {
    mission.done = true;
    state.cash += mission.def.reward;
    state.stats.cashEarned += mission.def.reward;
    state.stats.missionsDone += 1;
    if (mission.def.onComplete) mission.def.onComplete(state);
    state.toast = `${mission.def.title} complete — $${mission.def.reward} earned.`;
    state.toastTimer = 5;
    return EVENT_MISSION_DONE;
  }
  return EVENT_MISSION_STEP;
}

// What the HUD shows for the active step: its label, how far the marker is,
// and the marker's own name — no lookup back through the landmarks needed.
export function missionObjective(state) {
  const mission = state.mission;
  if (!mission || mission.done) {
    if (state.missionIndex >= MISSIONS.length) {
      return { label: 'All missions done — Coral Bay is yours.', dist: 0, marker: null, markerName: '' };
    }
    return { label: 'Press Enter to start the next mission.', dist: 0, marker: null, markerName: '' };
  }
  const step = mission.def.steps[mission.step];
  let label = `${mission.def.title}: ${step.label}`;
  let marker = null;
  let markerName = '';
  let dist = 0;
  if (step.type === 'defeat') {
    const left = state.thugs.filter((t) => t.state !== 'down').length;
    label = `${mission.def.title}: Deal with the dock crew (${left} left)`;
  } else if (step.type === 'grab' && mission.grab > 0) {
    const need = step.seconds || 2;
    label = `${mission.def.title}: Grab it — hold on (${Math.ceil(need - mission.grab)}s)`;
  } else if (step.type === 'survive') {
    const left = Math.max(0, step.seconds - mission.timer);
    label = `${mission.def.title}: Survive the heat — ${Math.ceil(left)}s (wanted ${state.wanted}★)`;
  }
  if (step.place) {
    marker = markerOf(state, step.place);
    markerName = state.city.landmarks[step.place].name;
    dist = Math.round(Math.hypot(state.player.x - marker.x, state.player.y - marker.y));
  }
  return { label, dist, marker, markerName };
}
