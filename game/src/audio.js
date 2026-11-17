// Every sound is synthesized with WebAudio — no audio files, no network.
// A bassline groove loops under the game; effects are short oscillator and
// noise bursts. Everything is guarded: if the browser has no audio, the
// game plays silent and never throws.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.15;
      musicBus.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime + (when || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      // A sound that cannot start is never worth crashing the game over.
    }
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq || 1200;
      const g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
    } catch {
      // See tone().
    }
  }

  // A slow sunset groove in D minor: bassline with a syncopated kick feel.
  // The scheduler runs on a timer and books notes a little ahead of time.
  const BASS = [73.42, 0, 73.42, 87.31, 0, 73.42, 65.41, 0, 73.42, 0, 110, 87.31, 0, 98, 0, 65.41];
  const HAT = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1];
  const STAB = [293.66, 0, 0, 0, 349.23, 0, 0, 0, 293.66, 0, 0, 0, 261.63, 0, 0, 0];

  function scheduleMusic() {
    if (!ctx || muted) return;
    const stepDur = 60 / 116 / 2;
    const note = BASS[musicStep % BASS.length];
    if (note) tone(note, stepDur * 1.8, 'triangle', 0.5, 0, note * 0.99);
    if (HAT[musicStep % HAT.length]) noiseBurst(0.03, 0.05, 6000);
    const stab = STAB[musicStep % STAB.length];
    if (stab && musicStep % 16 >= 8) tone(stab, stepDur * 1.4, 'sawtooth', 0.05);
    if (musicStep % 8 === 0) tone(146.83, 0.12, 'sine', 0.35, 0, 55);
    musicStep += 1;
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = window.setInterval(scheduleMusic, (60 / 116 / 2) * 1000);
  }

  function stopMusic() {
    if (musicTimer) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function startSiren() {
    if (!ctx || sirenOsc) return;
    try {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.8;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 190;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.045;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    } catch {
      sirenOsc = null;
    }
  }

  function stopSiren() {
    if (sirenOsc) {
      try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* already stopped */ }
      sirenOsc = null;
      sirenLfo = null;
    }
  }

  function startEngine() {
    if (!ctx || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    } catch {
      engineOsc = null;
    }
  }

  function setEngine(speed01, on) {
    if (!engineOsc || !ctx) return;
    const target = on && !muted ? 0.05 + speed01 * 0.06 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.1);
  }

  return {
    ensure,
    startMusic,
    stopMusic,
    startSiren,
    stopSiren,
    startEngine,
    setEngine,
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
      if (muted) { stopSiren(); stopMusic(); }
      else if (ctx) startMusic();
    },
    click() { tone(660, 0.06, 'square', 0.12); },
    punch() { noiseBurst(0.09, 0.4, 500); tone(120, 0.09, 'sine', 0.3, 0, 60); },
    shot() { noiseBurst(0.12, 0.5, 2600); tone(220, 0.08, 'square', 0.18, 0, 70); },
    pickup() { tone(880, 0.09, 'sine', 0.22); tone(1318, 0.14, 'sine', 0.2, 0.08); },
    cash() { tone(988, 0.08, 'triangle', 0.22); tone(1319, 0.08, 'triangle', 0.22, 0.07); tone(1760, 0.16, 'triangle', 0.22, 0.14); },
    explosion() { noiseBurst(0.7, 0.6, 700); tone(90, 0.6, 'sine', 0.5, 0, 30); },
    crash() { noiseBurst(0.18, 0.35, 900); },
    sirenBlip() { tone(880, 0.12, 'sine', 0.14, 0, 660); tone(660, 0.12, 'sine', 0.14, 0.12, 880); },
    jingle() {
      const seq = [587, 740, 880, 1175];
      seq.forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, i * 0.11));
    },
    fail() {
      const seq = [440, 370, 294];
      seq.forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.14, i * 0.16));
    },
  };
}
