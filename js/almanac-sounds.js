// Tiny WebAudio sound engine. No external assets, just a quiet wooden / paper-y feel.
(function () {
  let ctx = null;
  let enabled = true;
  let volume = 0.35;

  const init = () => {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return null; }
    return ctx;
  };

  const env = (g, t0, attack, hold, release, peak) => {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  };

  const tone = (freq, dur, type, vol, attack = 0.005, release = 0.08) => {
    const c = init();
    if (!c || !enabled) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 4200;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(f); f.connect(g); g.connect(c.destination);
    env(g, t, attack, dur, release, vol * volume);
    o.start(t);
    o.stop(t + attack + dur + release + 0.05);
  };

  const noiseTap = (dur, vol, fcHi = 3200) => {
    const c = init();
    if (!c || !enabled) return;
    const t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.05);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = fcHi;
    f.Q.value = 1.4;
    const g = c.createGain();
    src.connect(f); f.connect(g); g.connect(c.destination);
    env(g, t, 0.002, dur, 0.04, vol * volume);
    src.start(t);
    src.stop(t + 0.2);
  };

  const Sounds = {
    setEnabled(v) { enabled = !!v; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); },
    resume() {
      const c = init();
      if (c && c.state === "suspended") c.resume();
    },
    // Soft "tick" — checking a box
    check() {
      noiseTap(0.01, 0.6, 2800);
      tone(880, 0.04, "sine", 0.18, 0.002, 0.09);
      setTimeout(() => tone(1320, 0.05, "sine", 0.10, 0.002, 0.12), 28);
    },
    // Uncheck — slightly lower
    uncheck() {
      noiseTap(0.008, 0.45, 1800);
      tone(560, 0.04, "sine", 0.12, 0.002, 0.08);
    },
    // Add — paper rustle
    add() {
      noiseTap(0.02, 0.7, 1400);
    },
    // Drop — soft thud
    drop() {
      tone(140, 0.05, "sine", 0.22, 0.002, 0.12);
      noiseTap(0.015, 0.35, 800);
    },
    // Pickup — small bloop
    pickup() {
      tone(660, 0.03, "sine", 0.14, 0.002, 0.06);
    },
    // Delete — descending
    del() {
      tone(620, 0.05, "triangle", 0.12, 0.002, 0.08);
      setTimeout(() => tone(420, 0.06, "triangle", 0.08, 0.002, 0.1), 35);
    },
    // Open panel
    open() {
      tone(520, 0.05, "sine", 0.10, 0.004, 0.1);
      setTimeout(() => tone(780, 0.06, "sine", 0.08, 0.004, 0.12), 30);
    },
    // Close
    close() {
      tone(780, 0.04, "sine", 0.08, 0.004, 0.09);
      setTimeout(() => tone(520, 0.05, "sine", 0.07, 0.004, 0.1), 26);
    },
    // Complete day — small chime
    chime() {
      const c = init();
      if (!c || !enabled) return;
      [523.25, 659.25, 783.99].forEach((f, i) =>
        setTimeout(() => tone(f, 0.18, "sine", 0.14, 0.005, 0.25), i * 80)
      );
    },
  };

  window.Sounds = Sounds;
})();
