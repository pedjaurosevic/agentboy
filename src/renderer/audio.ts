// Game Boy-style audio engine for chassis buttons.
// Uses the Web Audio API to play short melodies and blips without any
// external files. All preset sounds are derived from the built-in tune
// "Phosphor Drift" (cozy lofi in D major, 84 BPM, composed in scripts/music/): the scale below
// is D-major pentatonic and the default waveform is a soft triangle, so the
// chassis blips feel like fragments of the song.

// D-major pentatonic: D4, E4, F#4, A4, B4 (+ D5 as PENTA[5])
const PENTA = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33];

let ctx: AudioContext | null = null;
let muted = true;

// ---- Built-in music (Phosphor Drift) — independent of the SFX mute ------
let music: HTMLAudioElement | null = null;

/** Play/pause the built-in tune. Returns true when now playing. */
export function toggleMusic(): boolean {
  if (!music) {
    music = new Audio("assets/music/phosphor-drift.mp3");
    music.loop = true;
    // Background listening level — the tape should sit UNDER the work,
    // not on top of it (user-tuned: 20%).
    music.volume = 0.2;
  }
  if (music.paused) {
    void music.play();
    return true;
  }
  music.pause();
  return false;
}
export function isMusicPlaying(): boolean {
  return !!music && !music.paused;
}

/** Mute/unmute all sound effects. Everything else keeps working. */
export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}
export function setMuted(on: boolean) {
  muted = on;
}
export function isMuted(): boolean {
  return muted;
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Play a single square-wave note with a simple ADSR envelope. */
function playNote(
  freq: number,
  duration: number,
  startTime: number,
  volume = 0.12
) {
  if (muted) return; // SFX off — single gate for every preset sound
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = "triangle"; // soft, like the tune — square was too buzzy next to it
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.012); // gentle attack
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // release

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

/** Success: rising D-F#-A-D' arpeggio — the tonic chord of the tune. */
export function playSuccessTone() {
  playMelody([
    [PENTA[0], 0.09],
    [PENTA[2], 0.09],
    [PENTA[3], 0.09],
    [PENTA[5], 0.16],
  ], 0.055);
}

/** Error: soft low D→C# sine sag — a gentle "wrong note", not a buzzer. */
export function playErrorTone() {
  if (muted) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(PENTA[0] / 2, c.currentTime); // D3
  osc.frequency.linearRampToValueAtTime(138.59, c.currentTime + 0.28); // C#3

  gain.gain.setValueAtTime(0.09, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.3);
}

/** Play a short blip — one note, fast decay. */
export function playBlip(freq: number, duration = 0.08, volume = 0.1) {
  playNote(freq, duration, getCtx().currentTime, volume);
}

type Note = [freq: number, dur: number];

/** Play a melody: a sequence of [freq, duration] notes. */
export function playMelody(notes: Note[], volume = 0.1) {
  const c = getCtx();
  let t = c.currentTime + 0.02;  // tiny lead-in
  for (const [freq, dur] of notes) {
    playNote(freq, dur, t, volume);
    t += dur + 0.012;            // small gap between notes
  }
}

// ---- Preset sounds -------------------------------------------------------

/** A-button: ascending pentatonic flourish (D-E-F#-A-B). */
export function playAMelody() {
  playMelody([
    [PENTA[0], 0.1],
    [PENTA[1], 0.1],
    [PENTA[2], 0.12],
    [PENTA[3], 0.12],
    [PENTA[4], 0.2],
  ], 0.07);
}

/** B-button: descending pentatonic flourish (B-A-F#-E-D). */
export function playBMelody() {
  playMelody([
    [PENTA[4], 0.1],
    [PENTA[3], 0.1],
    [PENTA[2], 0.12],
    [PENTA[1], 0.12],
    [PENTA[0], 0.2],
  ], 0.07);
}

/** Select: short rising double-blip (E→F#). */
export function playSelectSound() {
  playBlip(PENTA[1], 0.06, 0.08);
  setTimeout(() => playBlip(PENTA[2], 0.08, 0.08), 70);
}

/** Start: short descending double-blip (lower register, A3→D3-ish). */
export function playStartSound() {
  playBlip(PENTA[3] / 2, 0.06, 0.09);
  setTimeout(() => playBlip(PENTA[0] / 2, 0.07, 0.09), 60);
}

/** D-pad direction blip — a faint high F# tick. */
export function playDpadBlip() {
  playBlip(PENTA[2] * 2, 0.025, 0.035);
}

/** Typing tick: a whisper-quiet key tap, throttled so key repeat can't
    turn it into a drumroll. Alternates between two pentatonic pitches so
    fast typing shimmers a little instead of machine-gunning one note. */
let lastTick = 0;
let tickFlip = false;
export function playTypeTick() {
  const now = performance.now();
  if (now - lastTick < 45) return;
  lastTick = now;
  tickFlip = !tickFlip;
  playBlip((tickFlip ? PENTA[4] : PENTA[5]) * 2, 0.018, 0.022);
}

// ---- Ninja movement SFX (very quiet, noise-based) ------------------------

interface NoiseOpts {
  duration: number;
  volume: number;
  freq: number;
  freqEnd?: number; // sweep the filter to this frequency over the duration
  type?: BiquadFilterType; // default "lowpass"
  q?: number;
}

/** Play a short filtered white-noise burst (footsteps, whooshes, puffs). */
function playNoise(o: NoiseOpts) {
  if (muted) return;
  const c = getCtx();
  const t0 = c.currentTime;
  const len = Math.max(1, Math.ceil(c.sampleRate * o.duration));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = o.type ?? "lowpass";
  filt.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd != null) filt.frequency.linearRampToValueAtTime(o.freqEnd, t0 + o.duration);
  filt.Q.value = o.q ?? 0.7;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(o.volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + o.duration);

  src.connect(filt);
  filt.connect(gain);
  gain.connect(c.destination);
  src.start(t0);
  src.stop(t0 + o.duration + 0.02);
}

/** Walk: soft muffled foot-tap. */
export function playWalkStep() {
  playNoise({ duration: 0.05, volume: 0.025, freq: 300, type: "lowpass" });
}

/** Run: a touch sharper and louder than a walk step. */
export function playRunStep() {
  playNoise({ duration: 0.06, volume: 0.04, freq: 450, type: "lowpass" });
}

/** Jump: quick rising airy whoosh. */
export function playJumpWhoosh() {
  playNoise({ duration: 0.16, volume: 0.04, freq: 300, freqEnd: 950, type: "bandpass", q: 0.9 });
}

/** Fall: descending wind whoosh. */
export function playFallWhoosh() {
  playNoise({ duration: 0.32, volume: 0.035, freq: 850, freqEnd: 220, type: "bandpass", q: 0.8 });
}

/** Smoke bomb thrown: short fizzing rise. */
export function playBombThrow() {
  playNoise({ duration: 0.12, volume: 0.045, freq: 400, freqEnd: 1300, type: "bandpass", q: 1.2 });
}

/** Smoke bomb pop: soft "poof" of smoke. */
export function playBombPop() {
  playNoise({ duration: 0.26, volume: 0.06, freq: 240, freqEnd: 110, type: "lowpass" });
}

/** Levitate: faint ethereal rising chime (square waves, DMG-flavored). */
export function playLevitate() {
  playMelody([
    [880, 0.12],
    [1174.7, 0.12],
    [1568, 0.2],
  ], 0.022);
}
