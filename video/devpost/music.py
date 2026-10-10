"""A soft music bed for the Devpost video, synthesized from sines and noise (no samples, no licence).

    python3 -I video/devpost/music.py ~/Downloads/agora-plus-devpost

Reads audio/timing.json and writes audio/music.wav (48 kHz stereo). 96 BPM in D major:
a pad from the start, an arpeggio from the wordmark, a soft kick and bass for the feature
scenes, and a bell on every scene cut so the cuts land on the music.
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48_000
root = Path(sys.argv[1]).expanduser()
timing = json.loads((root / "audio" / "timing.json").read_text())
BEAT = timing["beat"]
BAR = BEAT * 4
cues = timing["cues"]
DUR = timing["duration"]
N = int((DUR + 3.0) * SR)
rng = np.random.default_rng(7)

left = np.zeros(N)
right = np.zeros(N)
wet_l = np.zeros(N)
wet_r = np.zeros(N)

freq = lambda m: 440.0 * 2 ** ((m - 69) / 12)
# Two bars per chord: Dmaj9, Bm7, Gmaj7, A7sus then A7.
CHORDS = [
    [50, 54, 57, 61, 64],
    [47, 50, 54, 57, 62],
    [43, 47, 50, 54, 59],
    [45, 50, 52, 55, 57],
]
ROOTS = [38, 35, 31, 33]


def chord_at(t: float) -> int:
    return int(t // (BAR * 2)) % len(CHORDS)


def add(buf_l, buf_r, start: float, sig: np.ndarray, gain: float, pan: float = 0.5):
    i = int(start * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    seg = sig[: j - i] * gain
    buf_l[i:j] += seg * np.cos(pan * np.pi / 2)
    buf_r[i:j] += seg * np.sin(pan * np.pi / 2)


def level(t: float) -> dict:
    """How much of each part plays at time t."""
    c = cues
    return {
        "arp": 0.0 if t < c[1] else (0.55 if t >= c[9] else 1.0),
        "groove": 1.0 if c[2] - BEAT * 0.01 <= t < c[9] else 0.0,
        "shaker": 1.0 if c[4] <= t < c[8] else 0.0,
    }


# ---- pad: detuned sines per chord tone, slow swell, overlapping release ----
seg_len = BAR * 2
for k in range(int(DUR // seg_len) + 2):
    t0 = k * seg_len
    if t0 >= DUR + 1:
        break
    notes = CHORDS[k % len(CHORDS)]
    length = seg_len + 1.6
    t = np.arange(int(length * SR)) / SR
    env = np.minimum(1, t / 0.9) * np.clip((length - t) / 1.6, 0, 1)
    for idx, m in enumerate(notes):
        f = freq(m)
        vib = 0.0025 * np.sin(2 * np.pi * (0.18 + idx * 0.03) * t)
        sig = (np.sin(2 * np.pi * f * t * (1 + vib)) + 0.6 * np.sin(2 * np.pi * f * 1.004 * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t)) * env
        pan = 0.3 + 0.4 * (idx / (len(notes) - 1))
        add(left, right, t0, sig, 0.022, pan)
        add(wet_l, wet_r, t0, sig, 0.02, pan)

# ---- arpeggio: an eighth-note pluck through the chord, an octave or two up ----
eighth = BEAT / 2
pattern = [0, 2, 3, 4, 3, 2, 1, 2]
t_note = np.arange(int(1.1 * SR)) / SR
for n in range(int(DUR / eighth) + 1):
    t0 = n * eighth
    amount = level(t0)["arp"]
    if amount == 0:
        continue
    notes = CHORDS[chord_at(t0)]
    m = notes[pattern[n % len(pattern)]] + 12
    f = freq(m)
    env = np.minimum(1, t_note / 0.004)
    sig = (np.sin(2 * np.pi * f * t_note) * np.exp(-t_note / 0.30) + 0.3 * np.sin(2 * np.pi * 2 * f * t_note) * np.exp(-t_note / 0.12)) * env
    accent = 1.0 if n % 2 == 0 else 0.72
    pan = 0.32 if n % 2 == 0 else 0.68
    add(left, right, t0, sig, 0.05 * amount * accent, pan)
    add(wet_l, wet_r, t0, sig, 0.05 * amount * accent, pan)

# ---- bass and a soft kick on beats one and three ----
t_hit = np.arange(int(0.9 * SR)) / SR
kick_phase = 2 * np.pi * np.cumsum(48 + 72 * np.exp(-t_hit / 0.035)) / SR
kick = np.sin(kick_phase) * np.exp(-t_hit / 0.17)
for n in range(int(DUR / (BEAT * 2)) + 1):
    t0 = n * BEAT * 2
    if level(t0)["groove"] == 0:
        continue
    add(left, right, t0, kick, 0.20)
    f = freq(ROOTS[chord_at(t0)])
    bass = (np.sin(2 * np.pi * f * t_hit) + 0.22 * np.sin(2 * np.pi * 2 * f * t_hit)) * np.exp(-t_hit / 0.55) * np.minimum(1, t_hit / 0.01)
    add(left, right, t0, bass, 0.11)

# ---- shaker on the off-beat eighths ----
t_sh = np.arange(int(0.12 * SR)) / SR
for n in range(int(DUR / eighth) + 1):
    t0 = n * eighth
    if n % 2 == 0 or level(t0)["shaker"] == 0:
        continue
    noise = rng.standard_normal(len(t_sh))
    # Differencing takes the low end out; a short average takes the top off, so it brushes rather than clicks.
    bright = np.convolve(np.diff(noise, prepend=0), np.ones(4) / 4, mode='same') * np.exp(-t_sh / 0.025) * np.minimum(1, t_sh / 0.004)
    add(left, right, t0, bright, 0.008, 0.62 if n % 4 == 1 else 0.38)

# ---- a bell on every scene cut ----
t_bell = np.arange(int(2.6 * SR)) / SR
for i, c in enumerate(cues):
    notes = CHORDS[chord_at(c)]
    f = freq(notes[-1] + 12)
    bell = (np.sin(2 * np.pi * f * t_bell) * np.exp(-t_bell / 1.5)
            + 0.35 * np.sin(2 * np.pi * f * 2.76 * t_bell) * np.exp(-t_bell / 0.7)
            + 0.12 * np.sin(2 * np.pi * f * 5.4 * t_bell) * np.exp(-t_bell / 0.35)) * np.minimum(1, t_bell / 0.003)
    gain = 0.07 if i in (0, 1, 9) else 0.045
    add(left, right, c, bell, gain, 0.5)
    add(wet_l, wet_r, c, bell, gain * 1.2, 0.5)

# ---- the last chord rings out ----
t_end = np.arange(int(4.5 * SR)) / SR
end_at = DUR - 3.2
for idx, m in enumerate(CHORDS[0]):
    f = freq(m + 12)
    sig = np.sin(2 * np.pi * f * t_end) * np.exp(-t_end / 1.8) * np.minimum(1, t_end / 0.01)
    add(left, right, end_at, sig, 0.03, 0.3 + 0.1 * idx)
    add(wet_l, wet_r, end_at, sig, 0.04, 0.3 + 0.1 * idx)

# ---- room: convolve the wet send with a decaying noise impulse ----
def reverb(x: np.ndarray, seed: int) -> np.ndarray:
    ir_len = int(2.4 * SR)
    t = np.arange(ir_len) / SR
    ir = np.random.default_rng(seed).standard_normal(ir_len) * np.exp(-t / 0.55)
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + ir_len)))
    out = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return out

mix_l = left + 0.55 * reverb(wet_l, 1)
mix_r = right + 0.55 * reverb(wet_r, 2)

# Fade in, fade out, then peak at -3 dBFS. Loudness is set later with the voice.
t_all = np.arange(N) / SR
fade = np.minimum(1, t_all / 1.2) * np.clip((DUR + 1.0 - t_all) / 3.4, 0, 1)
mix = np.stack([mix_l * fade, mix_r * fade], axis=1)[: int(DUR * SR)]
mix *= 10 ** (-3 / 20) / max(1e-9, np.max(np.abs(mix)))
pcm = (mix * 32767).astype(np.int16)
out = root / "audio" / "music.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {out} ({DUR:.1f} s)")
