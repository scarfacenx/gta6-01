// Coral Bay: the map itself. A grid of avenues every 400 units, blocks of
// buildings, parks and parking lots between them, a beach and the sea along
// the south edge, and the harbor on the east. Everything the game needs to
// know about the ground lives here: what is road, what is water, what a car
// or a person bumps into, and where each story landmark stands.
import { PALETTE, WORLD } from './config.js';

const ROADS = [400, 800, 1200, 1600, 2000, 2400, 2800];

export function isRoad(x, y) {
  if (x < 0 || y < 0 || x > WORLD.size || y > WORLD.size) return false;
  const half = WORLD.roadWidth / 2;
  for (const c of ROADS) {
    if (Math.abs(x - c) < half || Math.abs(y - c) < half) return true;
  }
  return false;
}

export function isWater(x, y) {
  return y > WORLD.waterY && x >= 0 && x <= WORLD.size;
}

export function isBeach(x, y) {
  return y > WORLD.beachY && y <= WORLD.waterY;
}

// The road centreline nearest a point: which axis it runs on and its value.
export function nearestRoad(x, y) {
  let bestV = ROADS[0];
  let bestH = ROADS[0];
  for (const c of ROADS) {
    if (Math.abs(x - c) < Math.abs(x - bestV)) bestV = c;
    if (Math.abs(y - c) < Math.abs(y - bestH)) bestH = c;
  }
  return Math.abs(x - bestV) < Math.abs(y - bestH)
    ? { axis: 'v', value: bestV }
    : { axis: 'h', value: bestH };
}

export function districtAt(x, y) {
  if (y > WORLD.beachY) return 'Coral Beach';
  if (x > 2600) return 'Harbor Docks';
  if (x >= 1200 && x <= 2000 && y >= 1200 && y <= 2000) return 'Downtown';
  if (y < 800) return 'North Hills';
  if (x < 800) return 'Old Town';
  return 'Coral Bay';
}

// Landmarks the story walks through: a building to draw plus a marker spot
// on the road in front of it, where missions point. Every landmark sits
// fully inside one city block (between the avenues), never on a road —
// a building on a road would block the very streets cars drive on.
const LANDMARKS = {
  garage: { name: 'Kline Motors', x: 2500, y: 520, w: 190, h: 120, marker: { x: 2400, y: 640 }, color: '#8c5d6e' },
  bar: { name: 'The Coral Bar', x: 900, y: 900, w: 170, h: 110, marker: { x: 800, y: 950 }, color: '#5d7a8c' },
  safehouse: { name: 'Marina Court', x: 520, y: 2500, w: 180, h: 120, marker: { x: 400, y: 2560 }, color: '#6e7d5a' },
  bank: { name: 'Coral Bay Savings', x: 1300, y: 920, w: 200, h: 140, marker: { x: 1200, y: 990 }, color: '#946b3f' },
  hospital: { name: 'Marina General', x: 2100, y: 2500, w: 210, h: 150, marker: { x: 2000, y: 2570 }, color: '#a07a4a' },
  policeStation: { name: 'CBPD Central', x: 1700, y: 520, w: 200, h: 130, marker: { x: 1600, y: 585 }, color: '#4f6b7a' },
  docks: { name: 'Harbor Docks', x: 2900, y: 1320, w: 170, h: 190, marker: { x: 2800, y: 1415 }, color: '#7a6a58' },
  tower: { name: 'Coral Tower', x: 1300, y: 1300, w: 200, h: 200, marker: { x: 1200, y: 1400 }, color: '#b0563a' },
};

export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const palms = [];
  const lots = [];
  const umbrellas = [];

  // Landmark buildings first, so no random block ever lands on one.
  for (const key of Object.keys(LANDMARKS)) {
    const lm = LANDMARKS[key];
    buildings.push({
      x: lm.x, y: lm.y, w: lm.w, h: lm.h, color: lm.color,
      hgt: key === 'tower' ? 90 : 42, name: lm.name, landmark: key,
    });
  }

  function overlapsLandmark(x, y, w, h) {
    for (const b of buildings) {
      if (x < b.x + b.w + 30 && x + w + 30 > b.x && y < b.y + b.h + 30 && y + h + 30 > b.y) return true;
    }
    return false;
  }

  // Every cell of the grid is a block: buildings, a park, or a parking lot.
  const half = WORLD.roadWidth / 2;
  for (let gx = 0; gx < ROADS.length; gx += 1) {
    for (let gy = 0; gy < ROADS.length; gy += 1) {
      const x0 = ROADS[gx] + half + 12;
      const y0 = ROADS[gy] + half + 12;
      const x1 = (gx + 1 < ROADS.length ? ROADS[gx + 1] : WORLD.size) - half - 12;
      const y1 = (gy + 1 < ROADS.length ? ROADS[gy + 1] : WORLD.beachY) - half - 12;
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 60 || bh < 60) continue;
      const roll = random();
      if (roll < 0.16) {
        parks.push({ x: x0, y: y0, w: bw, h: bh });
        for (let i = 0; i < 5; i += 1) {
          palms.push({ x: random.range(x0 + 20, x1 - 20), y: random.range(y0 + 20, y1 - 20) });
        }
        continue;
      }
      if (roll < 0.26) {
        lots.push({ x: x0, y: y0, w: bw, h: bh });
        continue;
      }
      const cols = random.chance(0.5) ? 2 : 1;
      const rows = random.chance(0.5) ? 2 : 1;
      const cw = bw / cols;
      const ch = bh / rows;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const bx = x0 + cx * cw + 6;
          const by = y0 + cy * ch + 6;
          const bwid = cw - 16;
          const bhgt = ch - 16;
          if (bwid < 50 || bhgt < 50) continue;
          if (overlapsLandmark(bx, by, bwid, bhgt)) continue;
          buildings.push({
            x: bx, y: by, w: bwid, h: bhgt,
            color: random.pick(PALETTE.buildingRoof),
            hgt: random.int(20, 58),
            name: '',
          });
        }
      }
    }
  }

  // Palm trees along the beach and a few on the avenues; umbrellas on the sand.
  for (let x = 120; x < WORLD.size; x += 130) {
    palms.push({ x: x + random.range(-30, 30), y: random.range(WORLD.beachY + 30, WORLD.waterY - 20) });
    if (random.chance(0.5)) {
      umbrellas.push({
        x: x + random.range(-40, 40),
        y: random.range(WORLD.beachY + 40, WORLD.waterY - 30),
        color: random.pick(['#d83a2e', '#e8b62a', '#2e7fd8', '#3fae6a']),
      });
    }
  }
  for (const c of ROADS) {
    for (let t = 200; t < WORLD.size - 200; t += 520) {
      if (random.chance(0.4)) palms.push({ x: c + WORLD.roadWidth / 2 + 22, y: t });
    }
  }

  // Collision: a circle of radius r at (x, y) against every building.
  function buildingHit(x, y, r) {
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }

  function clampInside(x, y, r) {
    return {
      x: Math.max(r, Math.min(WORLD.size - r, x)),
      y: Math.max(r, Math.min(WORLD.size - r, y)),
    };
  }

  return {
    roads: ROADS.slice(),
    buildings,
    parks,
    palms,
    lots,
    umbrellas,
    landmarks: LANDMARKS,
    buildingHit,
    clampInside,
  };
}
