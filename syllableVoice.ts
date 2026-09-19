import { SYLLABLES, SYLLABLE_AUDIO, SYLLABLE_MAX_MS } from './syllableAudio';

/*
 * Playing the spoken syllables, at a chosen speed.
 *
 * Decoded once and held, not decoded per trial: decoding is asynchronous, and a
 * stimulus arriving after its own trial has ended is worse than one that never
 * played — the response window has already closed on it. The stretched copies
 * are built the same way, when the rate changes rather than when a trial fires.
 */

/** Slowest and fastest the speech may be played, as a multiple of the render. */
export const SYLLABLE_RATE_MIN = 0.5;
export const SYLLABLE_RATE_MAX = 1.6;

export const clampSyllableRate = (rate: number) =>
  Math.min(SYLLABLE_RATE_MAX, Math.max(SYLLABLE_RATE_MIN, rate || 1));

let ctx: AudioContext | null = null;
/** As decoded, at the rate the clips were rendered. */
const sourceBuffers: (AudioBuffer | null)[] = [];
/** What actually gets played: `sourceBuffers` stretched to `playbackRate`. */
let playBuffers: (AudioBuffer | null)[] = [];
let playbackRate = 1;
/** The rate `playBuffers` was built at, or null when they need rebuilding. */
let stretchedRate: number | null = null;
let playing: AudioBufferSourceNode | null = null;

/*
 * Time-stretched rather than resampled.
 *
 * Playing the buffer faster is one line — `source.playbackRate` — but it drags
 * the pitch along with it, and at the ends of the range that stops being a
 * speed control and becomes a different voice: a growl at 0.5, a chipmunk at
 * 1.6. Worse, pitch is already a channel here. The tone is a pitch
 * discrimination, and a speed setting that also transposes the speech would
 * quietly change what the two audio channels have in common.
 *
 * So: SOLA. Cut the clip into overlapping frames, lay them down at a different
 * spacing than they were taken at, and cross-fade the overlaps, nudging each
 * frame by up to a few milliseconds to whichever alignment correlates best with
 * what is already written. Periods land on periods, so the pitch survives; only
 * the number of them changes. A handful of milliseconds per clip, spent when
 * the rate is set rather than when a trial fires.
 */
function timeStretch(buffer: AudioBuffer, speed: number): AudioBuffer {
  if (!ctx || Math.abs(speed - 1) < 0.01) return buffer;

  const rate = buffer.sampleRate;
  const input = buffer.getChannelData(0);
  const frame = Math.round(rate * 0.04);      // 40 ms: long enough to hold a pitch period
  const hop = frame >> 1;                     // half-frame overlap, so every sample is faded once
  const search = Math.round(rate * 0.006);    // ±6 ms of alignment freedom
  if (input.length < frame * 2) return buffer;

  const out = new Float32Array(Math.ceil(input.length / speed) + frame);
  out.set(input.subarray(0, frame), 0);
  let written = frame;

  const analysisHop = Math.round(hop * speed);
  for (let m = 1; ; m++) {
    const ideal = m * analysisHop;
    const synth = m * hop;
    if (synth + frame > out.length) break;

    /* Best alignment: the shift whose overlap correlates most with the output
       written so far. Normalised, or loud frames win on volume alone. Coarse
       pass then a fine one around the winner — a full search at every shift is
       four times the arithmetic for a sample or two of difference. */
    let bestShift = 0;
    let bestScore = -Infinity;
    const score = (shift: number) => {
      const start = ideal + shift;
      if (start < 0 || start + frame > input.length) return -Infinity;
      let dot = 0;
      let energy = 0;
      for (let i = 0; i < hop; i += 2) {
        const s = input[start + i];
        dot += out[synth + i] * s;
        energy += s * s;
      }
      return dot / Math.sqrt(energy + 1e-9);
    };
    for (let shift = -search; shift <= search; shift += 4) {
      const sc = score(shift);
      if (sc > bestScore) { bestScore = sc; bestShift = shift; }
    }
    for (let shift = bestShift - 3; shift <= bestShift + 3; shift++) {
      const sc = score(shift);
      if (sc > bestScore) { bestScore = sc; bestShift = shift; }
    }

    const start = ideal + bestShift;
    if (start < 0 || start + frame > input.length) break;
    for (let i = 0; i < hop; i++) {
      const w = i / hop;
      out[synth + i] = out[synth + i] * (1 - w) + input[start + i] * w;
    }
    for (let i = hop; i < frame; i++) out[synth + i] = input[start + i];
    written = synth + frame;
  }

  const stretched = ctx.createBuffer(1, written, rate);
  stretched.copyToChannel(out.subarray(0, written), 0);
  return stretched;
}

function restretch() {
  if (!ctx || stretchedRate === playbackRate) return;
  playBuffers = sourceBuffers.map(b => (b ? timeStretch(b, playbackRate) : null));
  stretchedRate = playbackRate;
}

/** Decode the set, and stretch it, before any trial asks for it. */
export async function primeSyllables(rate?: number) {
  if (rate !== undefined) playbackRate = clampSyllableRate(rate);
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* awaits a gesture */ } }

  await Promise.all(SYLLABLES.map(async (name, i) => {
    if (sourceBuffers[i]) return;
    stretchedRate = null;  // something new to stretch
    const b64 = SYLLABLE_AUDIO[name];
    if (!b64) return;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    try { sourceBuffers[i] = await ctx!.decodeAudioData(bytes.buffer); } catch (e) { sourceBuffers[i] = null; }
  }));

  restretch();
}

/** Cheap while the rate is unchanged, so callers may set it whenever. */
export function setSyllableRate(rate: number) {
  playbackRate = clampSyllableRate(rate);
  restretch();
}

export function playSyllable(index: number) {
  if (!ctx) return;
  restretch();
  const buf = playBuffers[index];
  if (!buf) return;
  if (ctx.state === 'suspended') ctx.resume();

  /* One voice at a time. Slow speech under a short interval can still be
     talking when the next trial opens, and two syllables overlapping is a
     trial whose stimulus cannot be named. */
  if (playing) { try { playing.stop(); } catch (e) { /* already finished */ } }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.9;
  src.connect(g).connect(ctx.destination);
  src.onended = () => { if (playing === src) playing = null; };
  src.start();
  playing = src;
}

/** How long the longest syllable runs at a given speed, in ms. */
export const syllableMaxMs = (rate: number) =>
  Math.round(SYLLABLE_MAX_MS / clampSyllableRate(rate));

/** For the settings screen: decode if needed, then say one, at this rate. */
export async function previewSyllable(rate: number, index?: number) {
  await primeSyllables(rate);
  playSyllable(index ?? Math.floor(Math.random() * SYLLABLES.length));
}
