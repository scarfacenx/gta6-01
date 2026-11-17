// The HUD and the screens: cash, health, wanted stars, the mission banner,
// the minimap, contextual hints, the speedometer, and the title / pause /
// wasted / busted / mission-complete panels. Drawn in screen space over the
// world. Buttons on the title screen report their rectangles so the loop
// can click them.
import { PALETTE, WORLD } from './config.js';
import { districtAt } from './city.js';
import { MISSIONS, missionObjective } from './missions.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace';

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  const fonts = new Map();
  function font(size, weight, mono) {
    const key = `${weight || 400}:${size}:${mono ? 'm' : 's'}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || 400} ${size}px ${mono ? MONO : FONT}`);
    return fonts.get(key);
  }
  function text(value, x, y, size, color, align, weight, mono) {
    ctx.font = font(size, weight, mono);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function star(x, y, filled, size) {
    ctx.font = font(size, 400);
    ctx.fillStyle = filled ? PALETTE.star : 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'center';
    ctx.fillText(filled ? '★' : '☆', x, y);
  }

  function drawMinimap(state) {
    const size = 184;
    const ratio = window.devicePixelRatio || 1;
    const x0 = canvas.width / ratio - size - 16;
    const y0 = canvas.height / ratio - size - 34;
    const s = size / WORLD.size;
    panel(x0 - 6, y0 - 6, size + 12, size + 12);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    ctx.fillStyle = '#2e5d33';
    ctx.fillRect(x0, y0, size, size);
    // Sea and beach.
    ctx.fillStyle = '#e0c98f';
    ctx.fillRect(x0, y0 + WORLD.beachY * s, size, (WORLD.waterY - WORLD.beachY) * s);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(x0, y0 + WORLD.waterY * s, size, size);
    // Roads.
    ctx.strokeStyle = '#3c3f45';
    ctx.lineWidth = 5;
    for (const c of state.city.roads) {
      ctx.beginPath();
      ctx.moveTo(x0 + c * s, y0);
      ctx.lineTo(x0 + c * s, y0 + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0 + c * s);
      ctx.lineTo(x0 + size, y0 + c * s);
      ctx.stroke();
    }
    // Landmarks.
    ctx.fillStyle = '#ffb400';
    for (const key of Object.keys(state.city.landmarks)) {
      const lm = state.city.landmarks[key];
      ctx.beginPath();
      ctx.arc(x0 + lm.marker.x * s, y0 + lm.marker.y * s, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mission marker.
    if (state.missionMarker) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.arc(x0 + state.missionMarker.x * s, y0 + state.missionMarker.y * s, pulse + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Taxi fares waiting.
    ctx.fillStyle = '#37e0a0';
    for (const fare of state.fares) {
      if (fare.state !== 'waiting') continue;
      ctx.beginPath();
      ctx.arc(x0 + fare.x * s, y0 + fare.y * s, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Thugs, cops, cop cars.
    ctx.fillStyle = '#ff4d4d';
    for (const t of state.thugs) {
      if (t.state === 'down') continue;
      ctx.fillRect(x0 + t.x * s - 2, y0 + t.y * s - 2, 4, 4);
    }
    ctx.fillStyle = '#3f8cff';
    for (const cop of state.cops) {
      if (cop.state === 'down') continue;
      ctx.fillRect(x0 + cop.x * s - 2, y0 + cop.y * s - 2, 4, 4);
    }
    for (const car of state.cars) {
      if (car.kind !== 'cop' || car.dead) continue;
      ctx.beginPath();
      ctx.arc(x0 + car.x * s, y0 + car.y * s, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player, an arrow that turns with them.
    const p = state.player;
    ctx.save();
    ctx.translate(x0 + p.x * s, y0 + p.y * s);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('CORAL BAY', x0 + 4, y0 + size + 15, 11, 'rgba(255,255,255,0.75)', 'left', 600);
    text(districtAt(p.x, p.y), x0 + size - 4, y0 + size + 15, 11, 'rgba(255,255,255,0.75)', 'right', 600);
  }

  function drawTopHud(state) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const p = state.player;
    // Cash + health, top left.
    panel(14, 14, 218, 74);
    text(`$${state.cash.toLocaleString('en-US')}`, 28, 44, 26, '#fff', 'left', 800, true);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.roundRect(28, 56, 190, 10, 5);
    ctx.fill();
    ctx.fillStyle = p.hp > 35 ? '#37e0a0' : '#ff4d4d';
    ctx.beginPath();
    ctx.roundRect(28, 56, 190 * Math.max(0, p.hp / 100), 10, 5);
    ctx.fill();
    text(p.weapon === 'pistol' ? `PISTOL  ${p.ammo}` : 'FISTS', 28, 82, 13, 'rgba(255,255,255,0.8)', 'left', 700, true);
    // Wanted stars, top right.
    panel(w - 218, 14, 204, 56);
    const flash = state.wanted > 0 && Math.floor(state.time * 2) % 2 === 0;
    text('WANTED', w - 204, 34, 13, flash ? '#ff4d4d' : 'rgba(255,255,255,0.7)', 'left', 800);
    for (let i = 0; i < 5; i += 1) star(w - 182 + i * 26, 54, i < state.wanted, 24);
    // Mission banner, top centre.
    const obj = missionObjective(state);
    const bw = 560;
    panel(w / 2 - bw / 2, 14, bw, 62);
    text(obj.label, w / 2, 40, 16, '#fff', 'center', 700);
    const sub = obj.dist > 0 ? `${obj.dist}m to target` : (state.mission && !state.mission.done ? 'Follow the yellow marker' : 'Free roam — cause some trouble');
    text(sub, w / 2, 62, 13, PALETTE.accent, 'center', 600);
    // Toast under the banner.
    if (state.toastTimer > 0 && state.toast) {
      ctx.globalAlpha = Math.min(1, state.toastTimer);
      text(state.toast, w / 2, 108, 16, '#fff', 'center', 600);
      ctx.globalAlpha = 1;
    }
  }

  function drawHints(state, input) {
    const h = canvas.height / (window.devicePixelRatio || 1);
    const p = state.player;
    let hint = '';
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.car ? p.car.speed : 0) * 0.12);
      text(`${mph} mph`, 28, h - 64, 30, '#fff', 'left', 800, true);
      if (p.car) {
        // Car condition bar under the speed.
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.roundRect(28, h - 52, 120, 7, 3);
        ctx.fill();
        const frac = Math.max(0, p.car.hp / p.car.maxHp);
        ctx.fillStyle = frac > 0.4 ? '#37e0a0' : '#ff4d4d';
        ctx.beginPath();
        ctx.roundRect(28, h - 52, 120 * frac, 7, 3);
        ctx.fill();
        text('CAR', 154, h - 44, 11, 'rgba(255,255,255,0.7)', 'left', 700, true);
      }
      hint = 'W/S drive · A/D steer · SPACE handbrake · E exit car';
      if (state.nearFare) hint = 'Taxi fare nearby — drive close to pick them up';
      if (state.faresRiding) hint = `Fare riding — follow the green marker ($${state.faresRiding.pay})`;
    } else if (state.nearCar) {
      hint = 'E — steal this car';
    } else {
      hint = 'WASD move · SHIFT run · E enter car · LMB punch / shoot · 1/2 weapon';
    }
    text(hint, 28, h - 28, 14, 'rgba(255,255,255,0.85)', 'left', 600);
    if (!p.inCar && p.weapon === 'pistol') {
      // Crosshair at the mouse.
      const mx = input.mouse.x;
      const my = input.mouse.y;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx - 9, my);
      ctx.lineTo(mx + 9, my);
      ctx.moveTo(mx, my - 9);
      ctx.lineTo(mx, my + 9);
      ctx.stroke();
    }
  }

  function drawVignette(state) {
    const sinceHurt = state.time - state.player.lastHurt;
    if (sinceHurt < 0.6) {
      const a = (0.6 - sinceHurt) * 0.5;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(255,0,0,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (state.player.hp > 0 && state.player.hp <= 25) {
      const pulse = 0.1 + Math.sin(state.time * 5) * 0.05;
      ctx.fillStyle = `rgba(255,0,0,${pulse})`;
      ctx.fillRect(0, 0, canvas.width / (window.devicePixelRatio || 1), 6);
      ctx.fillRect(0, 0, 6, canvas.height / (window.devicePixelRatio || 1));
    }
  }

  function drawTitle(state, buttons) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    text('CORAL HEAT', cx, 168, 84, '#ffb400', 'center', 900);
    text('An original open-world crime story — Coral Bay', cx, 208, 20, '#fff', 'center', 500);
    text('Danny Cole is back, and Vera Kline owns his debt. Steal cars, lose the cops,', cx, 250, 16, 'rgba(255,255,255,0.8)', 'center', 500);
    text('run five missions, and take back the city — one hot wheel at a time.', cx, 274, 16, 'rgba(255,255,255,0.8)', 'center', 500);

    const bw = 300;
    const bh = 52;
    let by = 330;
    buttons.length = 0;
    const items = [
      { id: 'new', label: '▶  NEW GAME' },
      ...(state.hasSave ? [{ id: 'continue', label: '↻  CONTINUE' }] : []),
      { id: 'how', label: '?  HOW TO PLAY' },
    ];
    for (const item of items) {
      const bx = cx - bw / 2;
      ctx.fillStyle = item.id === 'new' ? '#ffb400' : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 10);
      ctx.fill();
      text(item.label, cx, by + 34, 19, item.id === 'new' ? '#1a1a1a' : '#fff', 'center', 800);
      buttons.push({ id: item.id, x: bx, y: by, w: bw, h: bh });
      by += bh + 14;
    }
    const stats = state.stats;
    text(
      `Missions done: ${stats.missionsDone}   ·   Cars stolen: ${stats.carsStolen}   ·   Fares: ${stats.faresDone}   ·   Cash earned: $${stats.cashEarned.toLocaleString('en-US')}`,
      cx, by + 30, 14, 'rgba(255,255,255,0.65)', 'center', 600, true,
    );
    if (state.showHow) {
      panel(cx - 330, h - 268, 660, 200);
      text('HOW TO PLAY', cx, h - 236, 18, '#ffb400', 'center', 800);
      const lines = [
        'WASD / arrows — move or drive · Mouse — aim · Left click — punch / shoot',
        'E — steal a car / get out · SHIFT — sprint · SPACE — handbrake',
        '1 / 2 — fists / pistol · P — pause · M — mute',
        'Crimes raise your wanted stars. Cops chase you — lose them to cool down.',
        'Follow the yellow marker. Green $ markers are taxi fares — drive up to earn.',
        'Finish all five missions to rule Coral Bay.',
      ];
      lines.forEach((line, i) => text(line, cx, h - 204 + i * 26, 14, 'rgba(255,255,255,0.85)', 'center', 500));
    }
    text('A 100% original game — no Rockstar content. All art and sound made in code.', cx, h - 24, 12, 'rgba(255,255,255,0.5)', 'center', 500);
  }

  function drawPanelScreen(title, lines, prompt, color) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.fillStyle = 'rgba(8, 10, 16, 0.66)';
    ctx.fillRect(0, 0, w, h);
    panel(w / 2 - 320, h / 2 - 130, 640, 260);
    text(title, w / 2, h / 2 - 62, 56, color || '#fff', 'center', 900);
    lines.forEach((line, i) => text(line, w / 2, h / 2 - 6 + i * 30, 18, 'rgba(255,255,255,0.85)', 'center', 500));
    text(prompt, w / 2, h / 2 + 96, 16, PALETTE.accent, 'center', 700);
  }

  function draw(state, screen, input, buttons) {
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (screen === 'title') {
      drawTitle(state, buttons);
      return;
    }
    drawTopHud(state);
    drawMinimap(state);
    drawHints(state, input);
    drawVignette(state);
    if (screen === 'pause') {
      drawPanelScreen('PAUSED', ['The city waits for no one — except right now.', `Cash $${state.cash.toLocaleString('en-US')} · Mission ${Math.min(state.missionIndex + 1, MISSIONS.length)} of ${MISSIONS.length}`], 'Press P or click to resume', '#fff');
    } else if (screen === 'wasted') {
      drawPanelScreen('WASTED', ['The medics scraped you off the asphalt.', `You lost $${state.lastLoss.toLocaleString('en-US')}.`], 'Press Enter to get back on your feet', '#ff4d4d');
    } else if (screen === 'busted') {
      drawPanelScreen('BUSTED', ['CBPD hauled you in. Vera posted bail.', `You lost $${state.lastLoss.toLocaleString('en-US')}.`], 'Press Enter to walk out', '#3f8cff');
    } else if (screen === 'failed') {
      drawPanelScreen('MISSION FAILED', ['Vera is not impressed. The job is still open.', ''], 'Press Enter to try again', '#ff4d4d');
    } else if (screen === 'complete') {
      drawPanelScreen('MISSION COMPLETE', [`${state.lastMissionTitle} — $${state.lastMissionReward.toLocaleString('en-US')} earned.`, state.missionIndex + 1 < MISSIONS.length ? `Next: ${MISSIONS[state.missionIndex + 1].title}` : 'That was the last one.'], 'Press Enter to continue', '#37e0a0');
    } else if (screen === 'ending') {
      drawPanelScreen('KING OF CORAL BAY', ['Five jobs. Zero witnesses who matter. Vera smiles.', `Final cash: $${state.cash.toLocaleString('en-US')} · Cars stolen: ${state.stats.carsStolen}`], 'Press Enter to keep playing free roam', '#ffb400');
    }
  }

  return { draw };
}
