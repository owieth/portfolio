/**
 * Sound effects, synthesised with the Web Audio API so the app ships no audio
 * files. Everything is off unless the user turns sound on.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Fills a buffer with white noise that fades out over its length. */
function rusche(ac: AudioContext, dauer: number): AudioBuffer {
  const buffer = ac.createBuffer(
    1,
    Math.floor(ac.sampleRate * dauer),
    ac.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * fade * fade;
  }
  return buffer;
}

/** A tiny click — one notch of the band being pulled tighter. */
function ratsch() {
  const ac = audio();
  if (!ac) return;

  const src = ac.createBufferSource();
  src.buffer = rusche(ac, 0.02);

  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2200;

  const gain = ac.createGain();
  gain.gain.value = 0.16;

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
}

export interface ZiehTon {
  /** Called on every pointer move with the current force, 0–1. */
  update(chraft: number): void;
  stop(): void;
}

/**
 * The sound of aiming: a tension tone that climbs as the band is pulled
 * tighter, with a ratchet click every notch. Held open for the whole drag, so
 * the caller must always `stop()` it — including when the drag is cancelled.
 */
export function startZieh(): ZiehTon | null {
  const ac = audio();
  if (!ac) return null;

  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 90;

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 640;
  filter.Q.value = 1.1;

  const gain = ac.createGain();
  gain.gain.value = 0;

  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start();

  let letschtiStufe = -1;
  let gstoppt = false;

  return {
    update(chraft) {
      if (gstoppt) return;
      const c = Math.min(Math.max(chraft, 0), 1);
      const now = ac.currentTime;
      osc.frequency.setTargetAtTime(92 + c * 250, now, 0.03);
      gain.gain.setTargetAtTime(0.018 + c * 0.05, now, 0.05);

      const stufe = Math.floor(c * 12);
      if (stufe !== letschtiStufe) {
        letschtiStufe = stufe;
        ratsch();
      }
    },
    stop() {
      if (gstoppt) return;
      gstoppt = true;
      const now = ac.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.02);
      osc.stop(now + 0.14);
    },
  };
}

/**
 * The release: air over the flight, louder the harder it was thrown. A shanked
 * throw gets a wobbling descending whistle for the tumble.
 */
export function whoosh(chraft: number, chnorz = false) {
  const ac = audio();
  if (!ac) return;

  const now = ac.currentTime;
  const dauer = chnorz ? 0.9 : 0.26;

  const src = ac.createBufferSource();
  src.buffer = rusche(ac, dauer);

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.6;
  filter.frequency.setValueAtTime(500 + chraft * 500, now);
  filter.frequency.exponentialRampToValueAtTime(220, now + dauer);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.1 + chraft * 0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dauer);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();

  if (!chnorz) return;

  // Tumbling: a descending tone with the pitch wobbling as it spins.
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(760, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + dauer);

  const lfo = ac.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 7.5;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 90;
  lfo.connect(lfoGain).connect(osc.frequency);

  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.07, now);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dauer);

  osc.connect(oscGain).connect(ac.destination);
  osc.start(now);
  lfo.start(now);
  osc.stop(now + dauer);
  lfo.stop(now + dauer);
}

/** Short noise burst with a fast decay — the dart hitting the paper. */
export function thwack() {
  const ac = audio();
  if (!ac) return;

  const src = ac.createBufferSource();
  src.buffer = rusche(ac, 0.13);

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.8;

  const gain = ac.createGain();
  gain.gain.value = 0.5;

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
}

/** Two detuned square waves — a passable Chueglogge for a bullseye. */
export function chueglogge() {
  const ac = audio();
  if (!ac) return;

  const now = ac.currentTime;
  for (const [freq, delay] of [
    [540, 0],
    [810, 0.008],
    [1290, 0.014],
  ] as const) {
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.09, now + delay + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.1);

    osc.connect(gain).connect(ac.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 1.2);
  }
}

/** Descending blip for a dart that left the country. */
export function dernaebe() {
  const ac = audio();
  if (!ac) return;

  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.28);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.14, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.32);
}
