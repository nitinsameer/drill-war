// Small procedural Web Audio engine for Drill War.
// One shared context, a master gain driven by the in-game sound toggle,
// plus two continuous layers: the drill motor and the tunnel rumble.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

type Layer = { gain: GainNode; stop: () => void };
let engineLayer: Layer | null = null;
let rumbleLayer: Layer | null = null;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(audio: AudioContext) {
  const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
  if (master && ctx) master.gain.setTargetAtTime(value ? 1 : 0, ctx.currentTime, 0.05);
  if (value) ensure();
}

export function unlockAudio() {
  ensure();
}

/** Gritty motor tone that plays while the drill bit is cutting rock. */
function startEngine() {
  const audio = ensure();
  if (!audio || !master || engineLayer) return;
  const gain = audio.createGain();
  gain.gain.value = 0;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 620;
  filter.Q.value = 1.6;
  const saw = audio.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.value = 74;
  const sub = audio.createOscillator();
  sub.type = "square";
  sub.frequency.value = 37;
  const grit = audio.createBufferSource();
  grit.buffer = noiseBuffer(audio);
  grit.loop = true;
  const gritGain = audio.createGain();
  gritGain.gain.value = 0.35;
  saw.connect(filter);
  sub.connect(filter);
  grit.connect(gritGain).connect(filter);
  filter.connect(gain).connect(master);
  saw.start();
  sub.start();
  grit.start();
  engineLayer = {
    gain,
    stop: () => { saw.stop(); sub.stop(); grit.stop(); gain.disconnect(); },
  };
}

/** Low cave rumble that swells with movement. */
function startRumble() {
  const audio = ensure();
  if (!audio || !master || rumbleLayer) return;
  const gain = audio.createGain();
  gain.gain.value = 0;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 130;
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer(audio);
  source.loop = true;
  source.connect(filter).connect(gain).connect(master);
  source.start();
  rumbleLayer = { gain, stop: () => { source.stop(); gain.disconnect(); } };
}

export function startDrillLoop() {
  startEngine();
  startRumble();
}

export function stopDrillLoop() {
  engineLayer?.stop();
  rumbleLayer?.stop();
  engineLayer = null;
  rumbleLayer = null;
}

/**
 * intensity 0..1 — how hard the rig is digging, drives motor volume/pitch.
 * motion 0..1 — how fast it is travelling, drives the tunnel rumble.
 */
export function setDrillIntensity(intensity: number, motion: number) {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (engineLayer) engineLayer.gain.gain.setTargetAtTime(0.06 * intensity, now, 0.08);
  if (rumbleLayer) rumbleLayer.gain.gain.setTargetAtTime(0.12 * motion, now, 0.12);
}

export function playTone(frequency: number, duration = 0.12, type: OscillatorType = "square", volume = 0.12) {
  const audio = ensure();
  if (!audio || !master) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audio.currentTime);
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  osc.connect(gain).connect(master);
  osc.start();
  osc.stop(audio.currentTime + duration + 0.02);
}

export const sfx = {
  click: () => playTone(520, 0.08, "square", 0.08),
  star: () => playTone(880, 0.1, "triangle", 0.1),
  gem: () => { playTone(660, 0.1, "triangle", 0.1); setTimeout(() => playTone(1320, 0.14, "triangle", 0.09), 70); },
  bomb: () => playTone(90, 0.35, "sawtooth", 0.16),
  power: () => playTone(1040, 0.16, "sine", 0.1),
  countdown: () => playTone(440, 0.14, "square", 0.1),
  start: () => playTone(880, 0.3, "square", 0.12),
};
