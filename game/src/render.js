// Drawing only: the world's state and the current screen in, pixels out.
// The camera follows the player across the 3200-unit city; buildings get a
// fake-height offset so the flat top-down map still reads as a city. No
// rules here — render never changes state.
import { PALETTE, WORLD } from './config.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, w: 0, h: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    // A tighter view than a full-city zoom: people, cars and the action
    // read at a glance, which matters most on a small screenshot.
    view.scale = Math.max(0.7, Math.min(canvas.width / 1200, canvas.height / 760));
    view.w = canvas.width;
    view.h = canvas.height;
  }

  const fonts = new Map();
  function font(size, weight) {
    const key = `${weight || 400}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || 400} ${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, weight) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function inView(x, y, margin) {
    const m = margin || 80;
    return x > view.x - m && x < view.x + view.w / view.scale + m
      && y > view.y - m && y < view.y + view.h / view.scale + m;
  }

  function updateCamera(state) {
    const p = state.player;
    const vw = view.w / view.scale;
    const vh = view.h / view.scale;
    let cx = p.x - vw / 2;
    let cy = p.y - vh / 2;
    cx = Math.max(0, Math.min(WORLD.size - vw, cx));
    cy = Math.max(0, Math.min(WORLD.size - vh, cy));
    if (vw >= WORLD.size) cx = (WORLD.size - vw) / 2;
    if (vh >= WORLD.size) cy = (WORLD.size - vh) / 2;
    state.camera.x = cx;
    state.camera.y = cy;
    view.x = cx;
    view.y = cy;
  }

  function drawGround(state) {
    const city = state.city;
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(view.x - 20, view.y - 20, view.w / view.scale + 40, view.h / view.scale + 40);
    // Beach and sea along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, WORLD.beachY, WORLD.size, WORLD.waterY - WORLD.beachY);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WORLD.waterY, WORLD.size, WORLD.size - WORLD.waterY);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.size; x += 260) {
      ctx.fillRect(x + ((state.time * 12) % 260), WORLD.waterY + 30, 90, 5);
      ctx.fillRect(x + 130 - ((state.time * 12) % 260), WORLD.waterY + 70, 70, 4);
    }
    // Parks.
    for (const park of city.parks) {
      if (!inView(park.x + park.w / 2, park.y + park.h / 2, 100)) continue;
      ctx.fillStyle = PALETTE.grassDark;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(park.x + 4, park.y + 4, park.w - 8, park.h - 8);
    }
    // Parking lots.
    for (const lot of city.lots) {
      if (!inView(lot.x + lot.w / 2, lot.y + lot.h / 2, 100)) continue;
      ctx.fillStyle = '#54575c';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let x = lot.x + 24; x < lot.x + lot.w - 10; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, lot.y + 8);
        ctx.lineTo(x, lot.y + 34);
        ctx.stroke();
      }
    }
    // Roads: asphalt strips, then centre dashes and crosswalks.
    ctx.fillStyle = PALETTE.asphalt;
    const half = WORLD.roadWidth / 2;
    for (const c of city.roads) {
      ctx.fillRect(c - half, 0, WORLD.roadWidth, WORLD.size);
      ctx.fillRect(0, c - half, WORLD.size, WORLD.roadWidth);
    }
    ctx.fillStyle = PALETTE.curb;
    for (const c of city.roads) {
      ctx.fillRect(c - half, 0, 3, WORLD.size);
      ctx.fillRect(c + half - 3, 0, 3, WORLD.size);
      ctx.fillRect(0, c - half, WORLD.size, 3);
      ctx.fillRect(0, c + half - 3, WORLD.size, 3);
    }
    ctx.fillStyle = PALETTE.asphaltLine;
    for (const c of city.roads) {
      for (let t = 40; t < WORLD.size; t += 90) {
        ctx.fillRect(c - 3, t, 6, 44);
        ctx.fillRect(t, c - 3, 44, 6);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const cx of city.roads) {
      for (const cy of city.roads) {
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(cx + i * 18 - 6, cy - half + 8, 12, 22);
          ctx.fillRect(cx + i * 18 - 6, cy + half - 30, 12, 22);
        }
      }
    }
  }

  function drawBuildings(state) {
    for (const b of state.city.buildings) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
      const lift = b.hgt * 0.45;
      // Fake height: the south-east face, then the roof.
      ctx.fillStyle = PALETTE.buildingSide;
      ctx.fillRect(b.x + 6, b.y + lift * 0.5, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y - lift * 0.5, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x + 8, b.y - lift * 0.5 + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = PALETTE.glass;
      const cols = Math.max(1, Math.floor(b.w / 46));
      const rows = Math.max(1, Math.floor(b.h / 46));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          ctx.fillRect(b.x + 14 + i * 44, b.y - lift * 0.5 + 14 + j * 44, 22, 16);
        }
      }
      if (b.name) {
        ctx.font = font(15, 700);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.textAlign = 'center';
        ctx.fillText(b.name, b.x + b.w / 2, b.y - lift * 0.5 + b.h / 2 + 5);
      }
    }
  }

  function drawPalms(state) {
    for (const palm of state.city.palms) {
      if (!inView(palm.x, palm.y, 40)) continue;
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(palm.x - 2, palm.y - 4, 4, 12);
      ctx.fillStyle = '#2f7a33';
      ctx.beginPath();
      ctx.arc(palm.x, palm.y - 6, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f9a44';
      ctx.beginPath();
      ctx.arc(palm.x - 4, palm.y - 9, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const um of state.city.umbrellas) {
      if (!inView(um.x, um.y, 40)) continue;
      ctx.fillStyle = '#e8e4da';
      ctx.fillRect(um.x - 1, um.y, 2, 10);
      ctx.fillStyle = um.color;
      ctx.beginPath();
      ctx.arc(um.x, um.y - 2, 12, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      if (!inView(pk.x, pk.y, 40)) continue;
      const bob = Math.sin(pk.phase) * 3;
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#1d7a3a';
        ctx.beginPath();
        ctx.arc(pk.x, pk.y + bob, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d8f5c8';
        ctx.font = font(15, 800);
        ctx.textAlign = 'center';
        ctx.fillText('$', pk.x, pk.y + bob + 5);
      } else if (pk.kind === 'health') {
        ctx.fillStyle = '#f2f2f2';
        ctx.beginPath();
        ctx.arc(pk.x, pk.y + bob, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d83a2e';
        ctx.fillRect(pk.x - 3, pk.y + bob - 8, 6, 16);
        ctx.fillRect(pk.x - 8, pk.y + bob - 3, 16, 6);
      } else {
        ctx.fillStyle = '#e8b62a';
        ctx.fillRect(pk.x - 10, pk.y + bob - 8, 20, 16);
        ctx.fillStyle = '#3a3f45';
        ctx.font = font(10, 800);
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', pk.x, pk.y + bob + 4);
      }
    }
  }

  function drawMarker(state, marker, label, color) {
    if (!marker) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.12;
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color || 'rgba(255,180,0,0.9)';
    ctx.fillRect(-13 * pulse, -13 * pulse, 26 * pulse, 26 * pulse);
    ctx.fillStyle = '#7a5200';
    ctx.fillRect(-6 * pulse, -6 * pulse, 12 * pulse, 12 * pulse);
    ctx.restore();
    ctx.font = font(14, 700);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(label || '', marker.x, marker.y - 26);
    // A light beam so the marker reads from far away.
    ctx.fillStyle = 'rgba(255,180,0,0.12)';
    ctx.fillRect(marker.x - 4, marker.y - 220, 8, 220);
  }

  function drawCar(state, car) {
    if (!inView(car.x, car.y, 90)) return;
    const isTruck = car.vclass === 'truck';
    const halfLen = isTruck ? 31 : 24;
    const halfWid = 12;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Night headlights: a soft beam ahead of the car.
    const night = state.timeOfDay >= 0.8 || state.timeOfDay < 0.06;
    if (night && !car.dead) {
      ctx.fillStyle = 'rgba(255,233,168,0.10)';
      ctx.beginPath();
      ctx.moveTo(halfLen, -10);
      ctx.lineTo(halfLen + 120, -34);
      ctx.lineTo(halfLen + 120, 34);
      ctx.lineTo(halfLen, 10);
      ctx.closePath();
      ctx.fill();
    }
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 5, halfLen + 2, halfWid + 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (car.dead) {
      ctx.fillStyle = '#26221f';
      roundRect(-halfLen, -halfWid, halfLen * 2, halfWid * 2, 6);
      ctx.fill();
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(-10, -8, 20, 16);
      ctx.restore();
      return;
    }
    const isCop = car.kind === 'cop';
    const isTaxi = car.vclass === 'taxi';
    ctx.fillStyle = isCop ? '#e8e8e8' : car.color;
    roundRect(-halfLen, -halfWid, halfLen * 2, halfWid * 2, 7);
    ctx.fill();
    if (isCop) {
      ctx.fillStyle = '#1e2a38';
      ctx.fillRect(-6, -halfWid, 12, halfWid * 2);
    }
    if (isTaxi) {
      ctx.fillStyle = '#22262b';
      for (let i = -2; i <= 2; i += 1) ctx.fillRect(i * 9 - 4, -halfWid, 8, 5);
    }
    // Roof and glass.
    ctx.fillStyle = isCop ? '#d8d8d8' : 'rgba(0,0,0,0.25)';
    roundRect(-8, -9, isTruck ? 30 : 18, 18, 4);
    ctx.fill();
    ctx.fillStyle = PALETTE.glass;
    ctx.fillRect(halfLen - 16, -8, 6, 16);
    // Headlights and taillights (brakes glow brighter).
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(halfLen - 2, -9, 3, 5);
    ctx.fillRect(halfLen - 2, 4, 3, 5);
    ctx.fillStyle = car.brake ? '#ff2e1f' : '#ff5a4d';
    ctx.fillRect(-halfLen - 1, -9, 3, 5);
    ctx.fillRect(-halfLen - 1, 4, 3, 5);
    if (isCop) {
      const flash = Math.floor(state.time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#3f8cff';
      ctx.fillRect(-12, -halfWid - 1, 8, 4);
      ctx.fillStyle = flash ? '#3f8cff' : '#ff3b30';
      ctx.fillRect(4, -halfWid - 1, 8, 4);
    }
    if (car.kind === 'player') {
      ctx.strokeStyle = PALETTE.accent;
      ctx.lineWidth = 2.5;
      roundRect(-halfLen, -halfWid, halfLen * 2, halfWid * 2, 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPerson(state, x, y, angle, shirt, opts) {
    if (!inView(x, y, 40)) return;
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (o.down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(angle);
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (o.cap) {
      ctx.fillStyle = '#1e2a38';
      ctx.beginPath();
      ctx.arc(4, 0, 6.5, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    if (o.gun) {
      ctx.fillStyle = '#22262b';
      ctx.fillRect(8, -2, 10, 4);
    }
    if (o.punch) {
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(16, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o.muzzle) {
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.arc(20, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o.fare) {
      // A waving fare: a yellow "$" bubble above their head.
      ctx.rotate(-angle);
      ctx.fillStyle = '#f5c518';
      ctx.beginPath();
      ctx.arc(0, -24, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = font(11, 800);
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, -20);
    }
    ctx.restore();
  }

  function drawBullets(state) {
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The day's light: dawn gold, midday clear, dusk orange, night blue.
  function drawDayTint(state) {
    const t = state.timeOfDay;
    let tint = null;
    if (t < 0.18) tint = `rgba(255, 170, 70, ${0.14 - t * 0.4})`;
    else if (t > 0.62 && t < 0.8) tint = `rgba(255, 110, 40, ${0.1 + (t - 0.62) * 0.3})`;
    else if (t >= 0.8) tint = `rgba(24, 34, 84, ${(t - 0.8) * 1.1})`;
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(view.x - 20, view.y - 20, view.w / view.scale + 40, view.h / view.scale + 40);
    }
  }

  // An arrow at the screen edge pointing at an off-screen marker.
  function drawOffscreenArrow(state, marker, color) {
    if (!marker) return;
    const vw = view.w / view.scale;
    const vh = view.h / view.scale;
    const mx = marker.x;
    const my = marker.y;
    if (mx > view.x + 60 && mx < view.x + vw - 60 && my > view.y + 60 && my < view.y + vh - 60) return;
    const cx = view.x + vw / 2;
    const cy = view.y + vh / 2;
    const a = Math.atan2(my - cy, mx - cx);
    const ex = cx + Math.cos(a) * (vw / 2 - 46);
    const ey = cy + Math.sin(a) * (vh / 2 - 46);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.fillStyle = color || PALETTE.accent;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw(state, screen) {
    updateCamera(state);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, -view.x * view.scale + shakeX * view.scale, -view.y * view.scale + shakeY * view.scale);

    drawGround(state);
    drawBuildings(state);
    drawPalms(state);
    drawPickups(state);

    // Mission marker, if the current step has one; fare markers in green.
    if (state.missionMarker) drawMarker(state, state.missionMarker, state.missionMarkerLabel);
    for (const fare of state.fares) {
      if (fare.state === 'waiting') drawMarker(state, { x: fare.x, y: fare.y }, `$${fare.pay} fare`, 'rgba(55,224,160,0.9)');
      else if (fare.state === 'riding') drawMarker(state, { x: fare.destX, y: fare.destY }, 'Drop-off', 'rgba(55,224,160,0.9)');
    }

    for (const car of state.cars) drawCar(state, car);
    for (const ped of state.peds) {
      drawPerson(state, ped.x, ped.y, ped.angle, ped.shirt, { down: ped.state === 'down', fare: ped.state === 'fare' });
    }
    for (const cop of state.cops) {
      drawPerson(state, cop.x, cop.y, cop.angle, '#2a4a7a', { down: cop.state === 'down', cap: true, muzzle: cop.muzzle > 0 });
    }
    for (const thug of state.thugs) {
      drawPerson(state, thug.x, thug.y, thug.angle, '#7a2e2e', { down: thug.state === 'down', gun: true });
    }
    const p = state.player;
    if (!p.inCar) {
      drawPerson(state, p.x, p.y, p.angle, '#1f8a70', {
        punch: p.punchAnim > 0,
        muzzle: p.muzzle > 0,
      });
    }
    drawBullets(state);
    drawParticles(state);
    drawDayTint(state);
    drawOffscreenArrow(state, state.missionMarker);
    if (state.faresRiding) drawOffscreenArrow(state, { x: state.faresRiding.destX, y: state.faresRiding.destY }, PALETTE.accent2);
    if (state.passenger) {
      text('MIA', p.x - 20, p.y - 30, 12, '#fff', 'center', 700);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    get view() { return view; },
    screenToWorld(sx, sy) {
      const ratio = window.devicePixelRatio || 1;
      return {
        x: view.x + (sx * ratio) / view.scale,
        y: view.y + (sy * ratio) / view.scale,
      };
    },
  };
}
