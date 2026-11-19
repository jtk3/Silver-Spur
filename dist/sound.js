'use strict';
const SpurSound = (() => {
  let context, master, noise;
  let enabled = true;
  try { enabled = localStorage.getItem('silver-spur-audio') !== 'off'; } catch {}
  function wake() {
    if (!enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!context && Audio) {
        context = new Audio();
        master = context.createGain(); master.gain.value = 0.36; master.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.095), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (context && context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Sound is optional on devices without Web Audio. */ }
  }
  function tick(at, freq, length, amp, type = 'sine', slide = 1) {
    if (!context || !enabled) return;
    const start = context.currentTime + at;
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, start);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(amp, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain); gain.connect(master); osc.start(start); osc.stop(start + length + 0.015);
  }
  function card(index) {
    if (!enabled || !context) return;
    const offset = 0.068 * index, start = context.currentTime + offset;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.setValueAtTime(2850, start);
    filter.frequency.exponentialRampToValueAtTime(750, start + 0.08); filter.Q.value = 0.85;
    gain.gain.setValueAtTime(0.001, start); gain.gain.exponentialRampToValueAtTime(0.3, start+0.009);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
    source.connect(filter); filter.connect(gain); gain.connect(master); source.start(start);
    tick(offset + 0.045, 650 + 23 * index, 0.034, 0.10, 'triangle', 0.6);
  }
  function hold(on) { tick(0, on ? 660 : 470, 0.085, 0.15, 'triangle', on ? 1.18 : 0.78); }
  function win(tier) {
    const notes = tier === 1 ? [587, 784] : tier === 2 ? [523, 659, 784, 1047] : [523,659,784,1047,1175,1319,1568,2093];
    notes.forEach((hz, i) => {
      const onset = i * (tier === 3 ? 0.095 : 0.11);
      tick(onset, hz, 0.32, 0.21); tick(onset, hz * 2.005, 0.13, 0.075);
    });
  }
  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem('silver-spur-audio', enabled ? 'on' : 'off'); } catch {}
    if (enabled) { wake(); if (master) master.gain.value = 0.36; hold(true); }
    else if (master) master.gain.value = 0;
    return enabled;
  }
  return { wake, toggle, card, hold, win, get enabled() { return enabled; } };
})();
