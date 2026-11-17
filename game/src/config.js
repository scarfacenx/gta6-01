// CORAL HEAT — every number the game balances on, in one place.
// Tuning lives here so a balance tweak never means hunting through the sim.
export const STEP = 1 / 60;
export const SAVE_KEY = 'coral-heat-save-v1';

export const WORLD = {
  size: 3200,
  roadEvery: 400,
  roadWidth: 150,
  beachY: 2900,
  waterY: 3050,
};

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSE: 'pause',
  WASTED: 'wasted',
  BUSTED: 'busted',
  FAILED: 'failed',
  COMPLETE: 'complete',
  ENDING: 'ending',
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 275,
  health: 100,
  punchDamage: 14,
  punchRange: 38,
  punchArc: 1.25,
  pistolDamage: 34,
  pistolRange: 430,
  pistolRate: 0.22,
  regenDelay: 8,
  regenRate: 3,
};

// Vehicle classes: a coupe is quick and fragile, a sedan is the middle of
// the road, a truck is slow but shrugs off damage, a taxi pays the bills.
export const VEHICLE_CLASS = {
  coupe: { accel: 520, reverseAccel: 300, maxSpeed: 640, maxReverse: 200, turnRate: 2.9, hp: 80, label: 'Coupe' },
  sedan: { accel: 430, reverseAccel: 280, maxSpeed: 580, maxReverse: 190, turnRate: 2.7, hp: 100, label: 'Sedan' },
  truck: { accel: 340, reverseAccel: 240, maxSpeed: 470, maxReverse: 160, turnRate: 2.1, hp: 170, label: 'Truck' },
  taxi: { accel: 430, reverseAccel: 280, maxSpeed: 580, maxReverse: 190, turnRate: 2.7, hp: 100, label: 'Taxi' },
};

export const CAR = {
  length: 48,
  width: 24,
  grip: 0.94,
  handbrakeGrip: 0.4,
  ramDamage: 26,
};

export const WANTED = {
  max: 5,
  decayDelay: 15,
  decayEvery: 9,
  bustSeconds: 1.5,
  bustRange: 30,
};

export const COUNTS = {
  traffic: 26,
  peds: 48,
  pickups: 12,
  maxCopCars: 5,
  maxFootCops: 4,
  maxFares: 2,
};

export const DAY_LENGTH = 360;

export const PALETTE = {
  grass: '#54914e',
  grassDark: '#488244',
  sidewalk: '#9a9a92',
  asphalt: '#40434a',
  asphaltLine: '#d8c95a',
  curb: '#c9c9bd',
  sand: '#e2cc92',
  water: '#2f83ad',
  waterDeep: '#276f94',
  buildingRoof: ['#b0563a', '#7a6a58', '#5d7a8c', '#8c5d6e', '#6e7d5a', '#946b3f', '#4f6b7a', '#a07a4a'],
  buildingSide: '#2e2a26',
  glass: '#a5cddc',
  minimapBg: 'rgba(12, 16, 22, 0.82)',
  hudPanel: 'rgba(10, 14, 20, 0.72)',
  accent: '#ffb400',
  accent2: '#37e0a0',
  danger: '#ff4d4d',
  police: '#3f8cff',
  star: '#ffd94d',
  taxi: '#f5c518',
};

// Paint jobs the city spawns with — bright, sun-soaked, none of them a
// real manufacturer's colour name.
export const CAR_COLORS = [
  '#d83a2e', '#2e7fd8', '#e8b62a', '#3fae6a', '#e8e4da', '#7a4fd0',
  '#e06a1e', '#22262b', '#c23a6e', '#4fc3c9', '#8a9a2e', '#b8b0a4',
];

export const PED_SHIRTS = [
  '#e8e4da', '#d83a2e', '#2e7fd8', '#e8b62a', '#3fae6a', '#7a4fd0',
  '#e06a1e', '#c23a6e', '#4fc3c9', '#f2f2f2', '#3a3f45', '#9a6b3f',
];
