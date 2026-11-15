// Procedural sound only: every effect is synthesised with WebAudio, no audio
// files, no network. The context is created on the first user gesture (or the
// first shot in demo mode); when the browser refuses audio, everything is a no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { enabled = false; return null; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
    } catch (error) {
      enabled = false;
      return null;
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function noiseBuffer(seconds) {
    const c = ctx;
    const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, type = 'lowpass', frequency = 1200, gain = 0.5, decay = 0.12 }) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const source = c.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = c.createGain();
    const now = c.currentTime;
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + decay);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  function tone({ frequency, endFrequency = null, duration = 0.1, type = 'square', gain = 0.2 }) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = type;
    const now = c.currentTime;
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
    const amp = c.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // weapon: 'p9' | 'smg' | 'rifle' | 'sniper'
  function shot(weapon) {
    if (weapon === 'sniper') {
      burst({ duration: 0.28, frequency: 900, gain: 0.8, decay: 0.26 });
      tone({ frequency: 220, endFrequency: 55, duration: 0.22, type: 'sawtooth', gain: 0.35 });
    } else if (weapon === 'rifle') {
      burst({ duration: 0.16, frequency: 1500, gain: 0.55, decay: 0.13 });
      tone({ frequency: 180, endFrequency: 70, duration: 0.1, type: 'square', gain: 0.22 });
    } else if (weapon === 'smg') {
      burst({ duration: 0.1, frequency: 1900, gain: 0.4, decay: 0.08 });
      tone({ frequency: 240, endFrequency: 90, duration: 0.07, type: 'square', gain: 0.16 });
    } else {
      burst({ duration: 0.12, frequency: 1400, gain: 0.45, decay: 0.1 });
      tone({ frequency: 200, endFrequency: 80, duration: 0.08, type: 'square', gain: 0.18 });
    }
  }

  function dryClick() {
    tone({ frequency: 1400, duration: 0.03, type: 'square', gain: 0.12 });
  }

  function reload() {
    tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.1 });
    setTimeout(() => tone({ frequency: 1200, duration: 0.04, type: 'square', gain: 0.1 }), 350);
  }

  function hit(killed) {
    tone({ frequency: killed ? 1560 : 1180, duration: 0.06, type: 'sine', gain: 0.25 });
    if (killed) setTimeout(() => tone({ frequency: 1960, duration: 0.09, type: 'sine', gain: 0.22 }), 70);
  }

  function hurt() {
    tone({ frequency: 140, endFrequency: 60, duration: 0.18, type: 'sawtooth', gain: 0.3 });
  }

  function plantBeep(done) {
    tone({ frequency: done ? 880 : 660, duration: done ? 0.18 : 0.07, type: 'sine', gain: 0.2 });
  }

  function explosion() {
    burst({ duration: 0.9, frequency: 500, gain: 1.0, decay: 0.85 });
    tone({ frequency: 90, endFrequency: 28, duration: 0.8, type: 'sine', gain: 0.5 });
  }

  function horn(win) {
    const notes = win ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((frequency, index) => {
      setTimeout(() => tone({ frequency, duration: 0.28, type: 'triangle', gain: 0.22 }), index * 130);
    });
  }

  function roundStart() {
    tone({ frequency: 440, duration: 0.12, type: 'triangle', gain: 0.2 });
    setTimeout(() => tone({ frequency: 660, duration: 0.16, type: 'triangle', gain: 0.2 }), 140);
  }

  function grenadeThrow() {
    burst({ duration: 0.08, frequency: 2500, gain: 0.15, decay: 0.06 });
  }

  function bounce() {
    tone({ frequency: 300, endFrequency: 180, duration: 0.05, type: 'sine', gain: 0.12 });
  }

  return {
    unlock,
    shot,
    dryClick,
    reload,
    hit,
    hurt,
    plantBeep,
    explosion,
    horn,
    roundStart,
    grenadeThrow,
    bounce,
    setEnabled(value) { enabled = value; },
  };
}
