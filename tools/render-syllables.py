#!/usr/bin/env python3
"""
Re-render syllableAudio.ts.

Run this, not a hand edit, whenever the syllable set or the rendering changes:

    python3 tools/render-syllables.py

Needs flite (with its CMU slt voice) and lame on PATH; both are permissively
licensed and both run locally, so nothing is fetched and no third-party
recording is redistributed. On Debian/Ubuntu: apt-get install flite lame.

The syllables are synthesised from phones, not spelled words, so the set is a
designed inventory rather than a list someone thought of: every onset meets
every vowel, and the coda follows from the pair. See INVENTORY below.

What it does beyond calling flite: trims the silence flite pads each utterance
with, fades 5 ms at each end so the clip cannot click, and matches the clips to
one another in loudness. The last one matters more than it sounds — a set where
one item is quieter is a set where that item is *harder to identify* for a
reason that has nothing to do with memory, and the whole channel is supposed to
be an identity judgement at equal audibility.
"""

import base64
import math
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

# The inventory: seven onsets, seven vowels, seven codas, each chosen as far
# from its neighbours in the set as the English phoneme space allows — stops at
# three places, a nasal, a liquid, two fricatives; the vowels at the corners and
# edges of the vowel space rather than clustered in it.
ONSETS = [("b", "b"), ("t", "t"), ("k", "k"), ("f", "f"), ("sh", "sh"), ("m", "m"), ("l", "l")]
VOWELS = [("aa", "ah"), ("iy", "ee"), ("uw", "oo"), ("eh", "eh"), ("ow", "oh"), ("ay", "ai"), ("er", "ur")]
CODAS = [("p", "p"), ("t", "t"), ("k", "k"), ("s", "ss"), ("n", "n"), ("ng", "ng"), ("l", "l")]
K = len(ONSETS)


def inventory():
    """Every onset x vowel, with the coda fixed by the pair: 49 syllables of
    which no two differ in only one sound.

    The coda is (onset + vowel) mod 7 rather than free. Free would give 343
    syllables and put minimal pairs all through them — bahp and baht differing
    by one phoneme at the very end, which is a discrimination test, not a memory
    one. Tying it to the other two makes every pair of syllables differ in at
    least two of the three sounds, the same property the old hand-picked set
    had, now guaranteed by construction rather than by checking.

    Emitted along the diagonals, so consecutive entries differ in all three
    sounds and any leading slice of the list is a spread of the whole inventory
    rather than seven syllables that all start with b — which is what the
    variety setting takes.
    """
    out = []
    for d in range(K):
        for i in range(K):
            j = (i + d) % K
            onset, vowel, coda = ONSETS[i], VOWELS[j], CODAS[(i + j) % K]
            out.append((
                onset[1] + vowel[1] + coda[1],                     # how it is spelled
                f"pau {onset[0]} {vowel[0]} {coda[0]} pau",        # how it is said
            ))
    return out


SYLLABLES = inventory()

VOICE = "slt"
# Flite's own rate is brisk to the point of clipped. This is the "slightly
# longer" baseline the speed control then moves around at playback time.
DURATION_STRETCH = 1.15
SILENCE_FLOOR = 0.02   # fraction of peak that still counts as silence
LEAD_MS = 12           # kept either side of the trimmed speech
FADE_MS = 5
TARGET_RMS = 0.14      # common loudness for every clip
PEAK_CEILING = 0.95
# kbps, mono 16 kHz. Measured against the un-encoded clips, 48 buys about a
# decibel over 32 and costs 60% more bytes, and the whole set is inlined into
# the bundle — so 32, and the size of the inventory goes into syllables.
BITRATE = 32

OUT = Path(__file__).resolve().parent.parent / "syllableAudio.ts"


def render(phones: str, wav_path: Path) -> None:
    """Synthesised from phones (-p), not from spelling: these are not words, and
    flite's letter-to-sound rules would have to guess at them."""
    subprocess.run(
        ["flite", "-voice", VOICE, "--setf", f"duration_stretch={DURATION_STRETCH}",
         "-p", phones, "-o", str(wav_path)],
        check=True,
    )


def read_wav(path: Path):
    with wave.open(str(path)) as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2, "expected 16-bit mono"
        rate = w.getframerate()
        raw = w.readframes(w.getnframes())
    samples = list(struct.unpack(f"<{len(raw) // 2}h", raw))
    return rate, [s / 32768.0 for s in samples]


def write_wav(path: Path, rate: int, samples) -> None:
    clipped = [max(-1.0, min(1.0, s)) for s in samples]
    raw = struct.pack(f"<{len(clipped)}h", *[int(round(s * 32767)) for s in clipped])
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(raw)


def trim(samples, rate):
    peak = max((abs(s) for s in samples), default=0.0)
    if peak == 0:
        return samples
    floor = peak * SILENCE_FLOOR
    first = next(i for i, s in enumerate(samples) if abs(s) >= floor)
    last = len(samples) - next(i for i, s in enumerate(reversed(samples)) if abs(s) >= floor)
    lead = int(rate * LEAD_MS / 1000)
    return samples[max(0, first - lead):min(len(samples), last + lead)]


def fade(samples, rate):
    n = min(int(rate * FADE_MS / 1000), len(samples) // 2)
    for i in range(n):
        g = i / n
        samples[i] *= g
        samples[-1 - i] *= g
    return samples


def level(samples):
    rms = math.sqrt(sum(s * s for s in samples) / len(samples)) if samples else 0.0
    if rms == 0:
        return samples
    gain = TARGET_RMS / rms
    peak = max(abs(s) for s in samples) * gain
    if peak > PEAK_CEILING:
        gain *= PEAK_CEILING / peak
    return [s * gain for s in samples]


def main() -> int:
    clips = {}
    longest_ms = 0
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for name, phones in SYLLABLES:
            wav, clean, mp3 = tmp / f"{name}.wav", tmp / f"{name}.clean.wav", tmp / f"{name}.mp3"
            render(phones, wav)
            rate, samples = read_wav(wav)
            samples = level(fade(trim(samples, rate), rate))
            write_wav(clean, rate, samples)
            subprocess.run(
                ["lame", "-m", "m", "-b", str(BITRATE), "-q", "2", "--quiet", str(clean), str(mp3)],
                check=True,
            )
            clips[name] = base64.b64encode(mp3.read_bytes()).decode("ascii")
            longest_ms = max(longest_ms, round(1000 * len(samples) / rate))
            print(f"  {name:<8} {len(samples) / rate:.2f}s  {mp3.stat().st_size / 1024:.1f}KB",
                  file=sys.stderr)

    header = OUT.read_text().split("export const SYLLABLES")[0]
    body = [header.rstrip("\n"), ""]
    names = [name for name, _ in SYLLABLES]
    body.append("export const SYLLABLES = [")
    for i in range(0, len(names), 7):
        body.append("  " + ", ".join(f'"{w}"' for w in names[i:i + 7]) + ",")
    body.append("] as const;")
    body.append("")
    body.append("export type Syllable = typeof SYLLABLES[number];")
    body.append("")
    body.append("/* The longest clip in the set, for callers sizing a trial around the speech.")
    body.append("   Rendered length; the decoder adds a few ms of its own at the front. */")
    body.append(f"export const SYLLABLE_MAX_MS = {longest_ms};")
    body.append("")
    body.append("export const SYLLABLE_AUDIO: Record<string, string> = {")
    for name, _ in SYLLABLES:
        body.append(f'  {name}: "{clips[name]}",')
    body.append("};")
    OUT.write_text("\n".join(body) + "\n")
    total = sum(len(v) for v in clips.values()) / 1024
    print(f"wrote {OUT} ({total:.0f}KB of base64)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
