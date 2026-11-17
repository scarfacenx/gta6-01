// Drawing only: the world's state and the current screen in, pixels out.
// The simulation still runs in 2D (x, y) coordinates; this renderer shows
// it in third-person 3D. Mapping: sim (x, y) -> three (x, 0, y). A sim
// angle theta (atan2 in xy) faces three (cos theta, 0, sin theta), so a
// mesh built facing +X uses rotation.y = -theta. No rules here — render
// never changes state.
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WORLD, CAM3D } from './config.js';

const TEX_SIZE = 1024;

// Deterministic little RNG for textures (visual only, but stable).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// The whole 2D map painted once onto a texture: grass, parks, lots, beach,
// sea, roads with dashes and crosswalks. The 3D city sits on top of it.
function buildGroundTexture(city) {
  const S = TEX_SIZE / WORLD.size;
  const cv = document.createElement('canvas');
  cv.width = TEX_SIZE;
  cv.height = TEX_SIZE;
  const g = cv.getContext('2d');
  g.scale(S, S);
  g.fillStyle = PALETTE.grass;
  g.fillRect(0, 0, WORLD.size, WORLD.size);
  for (const park of city.parks) {
    g.fillStyle = PALETTE.grassDark;
    g.fillRect(park.x, park.y, park.w, park.h);
  }
  for (const lot of city.lots) {
    g.fillStyle = '#54575c';
    g.fillRect(lot.x, lot.y, lot.w, lot.h);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let x = lot.x + 24; x < lot.x + lot.w - 10; x += 34) {
      g.beginPath();
      g.moveTo(x, lot.y + 8);
      g.lineTo(x, lot.y + 34);
      g.stroke();
    }
  }
  g.fillStyle = PALETTE.sand;
  g.fillRect(0, WORLD.beachY, WORLD.size, WORLD.waterY - WORLD.beachY);
  g.fillStyle = PALETTE.water;
  g.fillRect(0, WORLD.waterY, WORLD.size, WORLD.size - WORLD.waterY);
  const half = WORLD.roadWidth / 2;
  g.fillStyle = PALETTE.asphalt;
  for (const c of city.roads) {
    g.fillRect(c - half, 0, WORLD.roadWidth, WORLD.size);
    g.fillRect(0, c - half, WORLD.size, WORLD.roadWidth);
  }
  g.fillStyle = PALETTE.curb;
  for (const c of city.roads) {
    g.fillRect(c - half, 0, 3, WORLD.size);
    g.fillRect(c + half - 3, 0, 3, WORLD.size);
    g.fillRect(0, c - half, WORLD.size, 3);
    g.fillRect(0, c + half - 3, WORLD.size, 3);
  }
  g.fillStyle = PALETTE.asphaltLine;
  for (const c of city.roads) {
    for (let t = 40; t < WORLD.size; t += 90) {
      g.fillRect(c - 3, t, 6, 44);
      g.fillRect(t, c - 3, 44, 6);
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const cx of city.roads) {
    for (const cy of city.roads) {
      for (let i = -3; i <= 3; i += 1) {
        g.fillRect(cx + i * 18 - 6, cy - half + 8, 12, 22);
        g.fillRect(cx + i * 18 - 6, cy + half - 30, 12, 22);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// One facade texture for every building: pale walls, a grid of windows,
// a few lit ones. Instance colours tint it per building.
function buildFacadeTexture() {
  const rnd = mulberry32(187);
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#d9dde0';
  g.fillRect(0, 0, 128, 128);
  for (let x = 10; x < 118; x += 24) {
    for (let y = 12; y < 118; y += 26) {
      g.fillStyle = rnd() < 0.12 ? '#ffd94d' : '#3a4a5a';
      g.fillRect(x, y, 14, 16);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(10,14,20,0.55)';
  roundRectPath(g, 8, 8, 240, 48, 12);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = '700 25px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(230, 58, 1);
  return sp;
}

// A soft round dot for the muzzle flash.
function makeFlashTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,170,1)');
  grad.addColorStop(0.4, 'rgba(255,200,60,0.9)');
  grad.addColorStop(1, 'rgba(255,150,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Day sky keyframes: [timeOfDay, sky, fog, hemi, sun, sunColour].
const SKY_KEYS = [
  [0.0, '#0b1230', '#0d152e', 0.22, 0.12, '#93a7ff'],
  [0.06, '#3a4a7a', '#4a5878', 0.35, 0.3, '#ffb070'],
  [0.18, '#8fc0e0', '#a8c8dc', 0.85, 1.25, '#fff2d8'],
  [0.62, '#8fc0e0', '#a8c8dc', 0.85, 1.25, '#fff2d8'],
  [0.72, '#e08a4a', '#d89a6a', 0.6, 0.9, '#ff9a50'],
  [0.8, '#2a2a55', '#232348', 0.3, 0.2, '#8a90c0'],
  [1.0, '#0b1230', '#0d152e', 0.22, 0.12, '#93a7ff'],
];

function skyFor(t) {
  let a = SKY_KEYS[0];
  let b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i += 1) {
    if (t >= SKY_KEYS[i][0] && t <= SKY_KEYS[i + 1][0]) {
      a = SKY_KEYS[i];
      b = SKY_KEYS[i + 1];
      break;
    }
  }
  const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  const lerp = (u, v) => u + (v - u) * f;
  const ca = new THREE.Color(a[1]);
  const cb = new THREE.Color(b[1]);
  const fa = new THREE.Color(a[2]);
  const fb = new THREE.Color(b[2]);
  const sa = new THREE.Color(a[5]);
  const sb = new THREE.Color(b[5]);
  return {
    sky: ca.lerp(cb, f),
    fog: fa.lerp(fb, f),
    hemi: lerp(a[3], b[3]),
    sun: lerp(a[4], b[4]),
    sunColor: sa.lerp(sb, f),
  };
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fc0e0');
  scene.fog = new THREE.Fog(new THREE.Color('#a8c8dc'), 900, 3800);
  const camera = new THREE.PerspectiveCamera(CAM3D.fov, 1, 1, 7000);

  const hemi = new THREE.HemisphereLight('#bfd8ee', '#3d5a3a', 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2d8', 1.25);
  sun.position.set(2400, 1400, 2400);
  scene.add(sun);

  // Shared geometry and materials: one box, one sphere, a few colours.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const headGeo = new THREE.SphereGeometry(1, 10, 8);
  const matCache = new Map();
  function lambert(color) {
    if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
    return matCache.get(color);
  }
  const darkMat = lambert('#22262b');
  const skinMat = lambert('#e8b98a');
  const glassMat = lambert('#a5cddc');
  const whiteMat = lambert('#f2f2f2');
  const trunkMat = lambert('#6b4a2a');
  const leafMat = lambert('#2f7a33');
  const copBlueMat = lambert('#2a4a7a');
  const copDarkMat = lambert('#1e2a38');

  // The static city is built once, from the first state that arrives.
  let cityBuilt = null;
  let waterMesh = null;
  let labelSprites = [];
  const flashTex = makeFlashTexture();

  function buildStaticCity(city) {
    const groundTex = buildGroundTexture(city);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, WORLD.size),
      new THREE.MeshLambertMaterial({ map: groundTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD.size / 2, 0, WORLD.size / 2);
    scene.add(ground);

    // A translucent sheet over the sea so it shimmers.
    waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size, WORLD.size - WORLD.waterY),
      new THREE.MeshBasicMaterial({ color: '#2f83ad', transparent: true, opacity: 0.5, depthWrite: false }),
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(WORLD.size / 2, 1.5, (WORLD.waterY + WORLD.size) / 2);
    waterMesh.renderOrder = 1;
    scene.add(waterMesh);

    // Buildings: one instanced box, tinted per building, facade texture.
    const facadeTex = buildFacadeTexture();
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    const bMat = new THREE.MeshLambertMaterial({ map: facadeTex });
    const inst = new THREE.InstancedMesh(bGeo, bMat, city.buildings.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    city.buildings.forEach((b, i) => {
      pos.set(b.x + b.w / 2, b.hgt / 2, b.y + b.h / 2);
      scl.set(b.w, b.hgt, b.h);
      m.compose(pos, q, scl);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.set(b.color));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst);

    // Landmark name boards floating over their roofs. They hide when the
    // camera gets close: a board 230 units wide fills the screen from 150
    // units away and clips across the frame.
    labelSprites = [];
    for (const key of Object.keys(city.landmarks)) {
      const lm = city.landmarks[key];
      const b = city.buildings.find((bb) => bb.landmark === key);
      const sp = makeLabelSprite(lm.name);
      sp.position.set(lm.x + lm.w / 2, (b ? b.hgt : 42) + 42, lm.y + lm.h / 2);
      scene.add(sp);
      labelSprites.push(sp);
    }

    // Palms: instanced trunks and crowns.
    if (city.palms.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(2, 3.2, 26, 6);
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, city.palms.length);
      const crownGeo = new THREE.IcosahedronGeometry(11, 0);
      const crowns = new THREE.InstancedMesh(crownGeo, leafMat, city.palms.length);
      city.palms.forEach((palm, i) => {
        pos.set(palm.x, 13, palm.y);
        scl.set(1, 1, 1);
        m.compose(pos, q, scl);
        trunks.setMatrixAt(i, m);
        pos.set(palm.x, 30, palm.y);
        scl.set(1, 0.62, 1);
        m.compose(pos, q, scl);
        crowns.setMatrixAt(i, m);
      });
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      scene.add(trunks);
      scene.add(crowns);
    }

    // Beach umbrellas: instanced cones.
    if (city.umbrellas.length > 0) {
      const umGeo = new THREE.ConeGeometry(13, 7, 8);
      const ums = new THREE.InstancedMesh(umGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), city.umbrellas.length);
      city.umbrellas.forEach((um, i) => {
        pos.set(um.x, 12, um.y);
        scl.set(1, 1, 1);
        m.compose(pos, q, scl);
        ums.setMatrixAt(i, m);
        ums.setColorAt(i, col.set(um.color));
      });
      ums.instanceMatrix.needsUpdate = true;
      if (ums.instanceColor) ums.instanceColor.needsUpdate = true;
      scene.add(ums);
    }
    cityBuilt = city;
  }

  // --- Dynamic object pools, keyed by the sim object itself. ---
  // (Cars all carry id 1 in the sim — a quirk — so object identity is the
  // only safe key. Dead or gone objects are pruned every frame.)

  const carPool = new Map();
  const personPool = new Map();
  const pickupPool = new Map();
  const bulletPool = [];
  for (let i = 0; i < 48; i += 1) {
    const b = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: '#ffe9a8' }));
    b.scale.set(10, 2, 2);
    b.visible = false;
    scene.add(b);
    bulletPool.push(b);
  }

  // Particles: one THREE.Points with a small shader for per-point alpha.
  const MAX_PARTICLES = 400;
  const particleGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  const pAlpha = new Float32Array(MAX_PARTICLES);
  const pSize = new Float32Array(MAX_PARTICLES);
  pPos.fill(0);
  for (let i = 0; i < MAX_PARTICLES; i += 1) pPos[i * 3 + 1] = -100;
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  particleGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1));
  particleGeo.setAttribute('psize', new THREE.BufferAttribute(pSize, 1));
  const particleMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float alpha;
      attribute float psize;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = psize * (260.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        if (dot(d, d) > 0.25) discard;
        gl_FragColor = vec4(vColor, vAlpha);
      }`,
    vertexColors: true,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.frustumCulled = false;
  scene.add(particles);

  // Mission marker: a beam, a spinning diamond, a ring on the ground.
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#ffd94d', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 230, 10, 1, true), beamMat);
  markerBeam.renderOrder = 2;
  markerBeam.visible = false;
  scene.add(markerBeam);
  const markerGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(14),
    new THREE.MeshBasicMaterial({ color: '#ffd94d' }),
  );
  markerGem.visible = false;
  scene.add(markerGem);
  const markerRing = new THREE.Mesh(
    new THREE.RingGeometry(20, 28, 24),
    new THREE.MeshBasicMaterial({ color: '#ffd94d', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  markerRing.rotation.x = -Math.PI / 2;
  markerRing.renderOrder = 2;
  markerRing.visible = false;
  scene.add(markerRing);

  // Fare markers: small green diamonds over waiting passengers.
  const fareGems = [];
  for (let i = 0; i < 2; i += 1) {
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(10),
      new THREE.MeshBasicMaterial({ color: '#37e0a0' }),
    );
    gem.visible = false;
    scene.add(gem);
    fareGems.push(gem);
  }

  // Muzzle flash: one sprite, moved to whoever fired last.
  const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  muzzle.scale.set(30, 30, 1);
  muzzle.visible = false;
  scene.add(muzzle);

  // Headlight: a spotlight plus a faint cone, on the player's car at night.
  const headlight = new THREE.SpotLight('#ffe9a8', 0, 520, 0.52, 0.55, 1.2);
  const headTarget = new THREE.Object3D();
  scene.add(headTarget);
  headlight.target = headTarget;
  scene.add(headlight);
  const beamCone = new THREE.Mesh(
    new THREE.ConeGeometry(70, 260, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beamCone.renderOrder = 2;
  beamCone.visible = false;
  scene.add(beamCone);

  function buildCarMesh(car) {
    const group = new THREE.Group();
    const len = car.vclass === 'truck' ? 62 : 48;
    const wid = car.vclass === 'truck' ? 26 : 24;
    const bodyMat = lambert(car.color);
    const body = new THREE.Mesh(unitBox, bodyMat);
    body.scale.set(len, 9, wid);
    body.position.y = 6;
    group.add(body);
    const cabin = new THREE.Mesh(unitBox, car.vclass === 'truck' ? darkMat : glassMat);
    cabin.scale.set(car.vclass === 'truck' ? 12 : len * 0.42, 7, wid - 6);
    cabin.position.set(car.vclass === 'truck' ? len / 2 - 10 : -2, 13.5, 0);
    group.add(cabin);
    const wheelGeo = unitBox;
    for (const [wx, wz] of [[len * 0.32, wid / 2 - 1], [len * 0.32, -wid / 2 + 1], [-len * 0.32, wid / 2 - 1], [-len * 0.32, -wid / 2 + 1]]) {
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.scale.set(9, 9, 4);
      wheel.position.set(wx, 4.5, wz);
      group.add(wheel);
    }
    for (const wz of [wid / 2 - 7, -wid / 2 + 7]) {
      const hl = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: '#ffe9a8' }));
      hl.scale.set(2, 3, 5);
      hl.position.set(len / 2 + 0.5, 6, wz);
      group.add(hl);
      const tl = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
      tl.scale.set(2, 3, 5);
      tl.position.set(-len / 2 - 0.5, 6, wz);
      group.add(tl);
    }
    let barL = null;
    let barR = null;
    if (car.kind === 'cop') {
      const bar = new THREE.Mesh(unitBox, darkMat);
      bar.scale.set(14, 3, 8);
      bar.position.set(-2, 18, 0);
      group.add(bar);
      barL = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
      barL.scale.set(6, 3, 8);
      barL.position.set(-2, 19.5, -4);
      group.add(barL);
      barR = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: '#3b82ff' }));
      barR.scale.set(6, 3, 8);
      barR.position.set(-2, 19.5, 4);
      group.add(barR);
    }
    if (car.vclass === 'taxi') {
      const sign = new THREE.Mesh(unitBox, lambert('#ffd94d'));
      sign.scale.set(10, 4, 6);
      sign.position.set(-2, 18, 0);
      group.add(sign);
    }
    if (car.kind === 'player') {
      const beacon = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: '#ffd94d' }));
      beacon.scale.set(6, 3, 6);
      beacon.position.set(-2, 18, 0);
      group.add(beacon);
    }
    scene.add(group);
    return { group, body, bodyMat, barL, barR };
  }

  function buildPersonMesh(shirtColor, opts) {
    const group = new THREE.Group();
    const shirtMat = lambert(shirtColor);
    const body = new THREE.Mesh(unitBox, shirtMat);
    body.scale.set(9, 15, 7);
    body.position.y = 15;
    group.add(body);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.scale.set(5.2, 5.2, 5.2);
    head.position.y = 26;
    group.add(head);
    for (const z of [5, -5]) {
      const arm = new THREE.Mesh(unitBox, shirtMat);
      arm.scale.set(3, 11, 3);
      arm.position.set(0, 15, z);
      group.add(arm);
    }
    for (const z of [4, -4]) {
      const leg = new THREE.Mesh(unitBox, darkMat);
      leg.scale.set(4, 9, 3);
      leg.position.set(0, 4.5, z);
      group.add(leg);
    }
    let gun = null;
    if (opts.gun) {
      gun = new THREE.Mesh(unitBox, darkMat);
      gun.scale.set(11, 2.5, 2.5);
      gun.position.set(8, 16, 0);
      group.add(gun);
    }
    if (opts.cap) {
      const cap = new THREE.Mesh(unitBox, copDarkMat);
      cap.scale.set(9, 3, 9);
      cap.position.y = 30;
      group.add(cap);
    }
    scene.add(group);
    return { group, gun };
  }

  function buildPickupMesh(kind) {
    const color = kind === 'cash' ? '#37e0a0' : kind === 'health' ? '#f2f2f2' : '#e8b62a';
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(10),
      new THREE.MeshBasicMaterial({ color }),
    );
    scene.add(mesh);
    return mesh;
  }

  const tmpColor = new THREE.Color();
  function syncCars(state, time) {
    const alive = new Set(state.cars);
    for (const [car, rec] of carPool) {
      if (!alive.has(car)) {
        scene.remove(rec.group);
        carPool.delete(car);
      }
    }
    const flash = Math.floor(time * 6) % 2 === 0;
    for (const car of state.cars) {
      let rec = carPool.get(car);
      if (!rec) {
        rec = buildCarMesh(car);
        carPool.set(car, rec);
      }
      rec.group.position.set(car.x, 0, car.y);
      rec.group.rotation.set(0, -car.angle, car.dead ? 0.07 : 0);
      rec.group.visible = true;
      if (car.dead) {
        rec.body.material = darkMat;
      } else if (rec.body.material !== rec.bodyMat) {
        rec.body.material = rec.bodyMat;
      }
      if (rec.barL) {
        rec.barL.material.color.set(flash ? '#ff3b30' : '#571512');
        rec.barR.material.color.set(flash ? '#1a2f4d' : '#3b82ff');
      }
    }
  }

  function syncPerson(obj, kind, time, phase) {
    let rec = personPool.get(obj);
    if (!rec) {
      if (kind === 'player') rec = buildPersonMesh('#1f8a70', { gun: true });
      else if (kind === 'cop') rec = buildPersonMesh('#2a4a7a', { gun: true, cap: true });
      else if (kind === 'thug') rec = buildPersonMesh('#7a2a2a', { gun: true });
      else rec = buildPersonMesh(obj.shirt || '#c8a24a', { gun: false });
      personPool.set(obj, rec);
    }
    const down = obj.state === 'down' || obj.hp <= 0;
    const bob = down ? 0 : Math.abs(Math.sin(time * 9 + phase)) * 1.6;
    rec.group.position.set(obj.x, down ? 3 : bob, obj.y);
    rec.group.rotation.set(0, -obj.angle, down ? Math.PI / 2 : 0);
    rec.group.visible = true;
    if (rec.gun) rec.gun.visible = kind === 'player' ? obj.weapon === 'pistol' : !down;
    return rec;
  }

  function syncPeople(state, time) {
    const alive = new Set();
    alive.add(state.player);
    for (const p of state.peds) alive.add(p);
    for (const c of state.cops) alive.add(c);
    for (const t of state.thugs) alive.add(t);
    for (const [obj, rec] of personPool) {
      if (!alive.has(obj)) {
        scene.remove(rec.group);
        personPool.delete(obj);
      }
    }
    const p = state.player;
    if (!p.inCar) {
      const rec = syncPerson(p, 'player', time, 0);
      if (rec.gun) rec.gun.visible = p.weapon === 'pistol';
    }
    state.peds.forEach((ped, i) => syncPerson(ped, 'ped', time, i * 1.7));
    state.cops.forEach((cop, i) => syncPerson(cop, 'cop', time, i * 2.3));
    state.thugs.forEach((thug, i) => syncPerson(thug, 'thug', time, i * 2.9));
  }

  function syncBullets(state) {
    state.bullets.forEach((b, i) => {
      if (i >= bulletPool.length) return;
      const mesh = bulletPool[i];
      mesh.position.set(b.x, 14, b.y);
      mesh.rotation.y = -Math.atan2(b.vy, b.vx);
      mesh.visible = true;
    });
    for (let i = state.bullets.length; i < bulletPool.length; i += 1) {
      bulletPool[i].visible = false;
    }
  }

  function syncParticles(state) {
    const list = state.particles;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const pt = list[i];
      if (pt) {
        pPos[i * 3] = pt.x;
        pPos[i * 3 + 1] = 10 + (pt.life / pt.max) * 26;
        pPos[i * 3 + 2] = pt.y;
        tmpColor.set(pt.color);
        pCol[i * 3] = tmpColor.r;
        pCol[i * 3 + 1] = tmpColor.g;
        pCol[i * 3 + 2] = tmpColor.b;
        pAlpha[i] = Math.max(0, pt.life / pt.max);
        pSize[i] = pt.size * 3;
      } else {
        pPos[i * 3 + 1] = -100;
        pAlpha[i] = 0;
      }
    }
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.color.needsUpdate = true;
    particleGeo.attributes.alpha.needsUpdate = true;
    particleGeo.attributes.psize.needsUpdate = true;
  }

  function syncPickups(state, time) {
    const alive = new Set(state.pickups);
    for (const [pk, mesh] of pickupPool) {
      if (!alive.has(pk)) {
        scene.remove(mesh);
        pickupPool.delete(pk);
      }
    }
    for (const pk of state.pickups) {
      let mesh = pickupPool.get(pk);
      if (!mesh) {
        mesh = buildPickupMesh(pk.kind);
        pickupPool.set(pk, mesh);
      }
      mesh.position.set(pk.x, 12 + Math.sin(time * 3 + pk.phase) * 4, pk.y);
      mesh.rotation.y = time * 2 + pk.phase;
      mesh.visible = true;
    }
  }

  function syncMarkers(state, time) {
    const m = state.missionMarker;
    const show = !!m && (state.screen === 'play');
    markerBeam.visible = show;
    markerGem.visible = show;
    markerRing.visible = show;
    if (show) {
      markerBeam.position.set(m.x, 115, m.y);
      markerGem.position.set(m.x, 34 + Math.sin(time * 3) * 6, m.y);
      markerGem.rotation.y = time * 2;
      markerRing.position.set(m.x, 2, m.y);
      markerRing.scale.setScalar(1 + Math.sin(time * 3) * 0.08);
    }
    let fi = 0;
    for (const ped of state.peds) {
      if (ped.state === 'fare' && fi < fareGems.length) {
        const gem = fareGems[fi];
        fi += 1;
        gem.position.set(ped.x, 44 + Math.sin(time * 4 + fi) * 5, ped.y);
        gem.rotation.y = time * 3;
        gem.visible = true;
      }
    }
    for (; fi < fareGems.length; fi += 1) fareGems[fi].visible = false;
  }

  function syncMuzzle(state) {
    let src = null;
    const p = state.player;
    if (!p.inCar && p.muzzle > 0) src = p;
    if (!src) {
      for (const cop of state.cops) {
        if (cop.muzzle > 0) { src = cop; break; }
      }
    }
    if (!src) {
      for (const thug of state.thugs) {
        if (thug.muzzle > 0) { src = thug; break; }
      }
    }
    if (!src) {
      muzzle.visible = false;
      return;
    }
    muzzle.position.set(
      src.x + Math.cos(src.angle) * 26,
      18,
      src.y + Math.sin(src.angle) * 26,
    );
    muzzle.visible = true;
  }

  function syncHeadlight(state) {
    const p = state.player;
    const night = state.timeOfDay >= 0.8 || state.timeOfDay < 0.06;
    const on = p.inCar && p.car && night && !p.car.dead;
    headlight.intensity = on ? 90 : 0;
    beamCone.visible = !!on;
    if (on) {
      const car = p.car;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      headlight.position.set(car.x + fx * 20, 10, car.y + fy * 20);
      headTarget.position.set(car.x + fx * 320, 2, car.y + fy * 320);
      beamCone.position.set(car.x + fx * 150, 8, car.y + fy * 150);
      // Cone tip (+Y) points back at the car, base opening forward.
      beamCone.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-fx, 0, -fy),
      );
    }
  }

  // --- Camera. ---
  // camYaw: 0 = the camera sits south of the target, looking north (-y).
  // Camera offset = (sin yaw, cos yaw) * distance behind the target.
  const camPos = new THREE.Vector3(1600, 900, 3200);
  const camTarget = new THREE.Vector3(1600, 0, 1600);
  let camSnapped = false;
  let lastScreen = null;

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();

  function updateCamera(state, screen, cam) {
    const p = state.player;
    let desired = null;
    let look = null;
    if (screen === 'title') {
      const yaw = state.time * 0.05;
      const dist = 1350;
      desired = new THREE.Vector3(
        1600 + Math.sin(yaw) * dist,
        780,
        1600 + Math.cos(yaw) * dist,
      );
      look = new THREE.Vector3(1600, 0, 1600);
    } else {
      const inCar = p.inCar && p.car;
      const tx = inCar ? p.car.x : p.x;
      const ty = inCar ? p.car.y : p.y;
      const heading = inCar ? p.car.angle : p.angle;
      const yaw = cam ? cam.yaw : 0;
      const pitch = cam ? cam.pitch : CAM3D.pitch;
      const dist = inCar ? CAM3D.carDist : CAM3D.footDist;
      const flat = dist * Math.cos(pitch);
      const height = dist * Math.sin(pitch);
      desired = new THREE.Vector3(
        tx + Math.sin(yaw) * flat,
        height + 12,
        ty + Math.cos(yaw) * flat,
      );
      look = new THREE.Vector3(
        tx - Math.sin(yaw) * 40 + Math.cos(heading) * 30,
        16,
        ty - Math.cos(yaw) * 40 + Math.sin(heading) * 30,
      );
    }
    const jump = camPos.distanceTo(desired);
    if (!camSnapped || screen !== lastScreen || jump > 900) {
      camPos.copy(desired);
      // Snap the look target too: if only the position snaps, the camera
      // looks back at wherever it was pointing and the subject is behind it.
      camTarget.copy(look);
      camSnapped = true;
    } else {
      camPos.lerp(desired, 0.22);
      camTarget.lerp(look, 0.3);
    }
    if (state.shake > 0.5) {
      camPos.x += (Math.random() - 0.5) * state.shake * 0.5;
      camPos.y += (Math.random() - 0.5) * state.shake * 0.4;
    }
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    lastScreen = screen;
    state.camera.x = camTarget.x;
    state.camera.y = camTarget.z;
  }

  function updateSky(state) {
    const sky = skyFor(state.timeOfDay);
    scene.background.copy(sky.sky);
    scene.fog.color.copy(sky.fog);
    hemi.intensity = sky.hemi;
    sun.intensity = sky.sun;
    sun.color.copy(sky.sunColor);
    const el = Math.sin(state.timeOfDay * Math.PI * 2) * 0.8;
    sun.position.set(1600 + Math.cos(state.timeOfDay * Math.PI * 2) * 1400, 400 + el * 900, 1600 + 900);
    if (waterMesh) waterMesh.material.opacity = 0.45 + Math.sin(state.time * 0.8) * 0.07;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(ratio);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    view.w = w;
    view.h = h;
  }
  window.addEventListener('resize', resize);

  const view = { x: 0, y: 0, scale: 1, w: window.innerWidth, h: window.innerHeight };

  function draw(state, screen, cam) {
    if (!cityBuilt) buildStaticCity(state.city);
    resize();
    updateSky(state);
    updateCamera(state, screen, cam);
    for (const sp of labelSprites) {
      sp.visible = camPos.distanceTo(sp.position) > 420;
    }
    syncCars(state, state.time);
    syncPeople(state, state.time);
    syncBullets(state);
    syncParticles(state);
    syncPickups(state, state.time);
    syncMarkers(state, state.time);
    syncMuzzle(state);
    syncHeadlight(state);
    renderer.render(scene, camera);
  }

  function screenToWorld(sx, sy) {
    ndc.set((sx / view.w) * 2 - 1, -(sy / view.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
    if (!hit) return { x: camTarget.x, y: camTarget.z };
    return { x: hitPoint.x, y: hitPoint.z };
  }

  function aimPoint() {
    return screenToWorld(view.w / 2, view.h / 2);
  }

  // Project a 2D world point to CSS pixels on screen.
  function project(wx, wy) {
    tmpVec.set(wx, 0, wy).project(camera);
    return {
      x: (tmpVec.x + 1) / 2 * view.w,
      y: (1 - tmpVec.y) / 2 * view.h,
    };
  }

  resize();

  return { draw, view, screenToWorld, aimPoint, project };
}
