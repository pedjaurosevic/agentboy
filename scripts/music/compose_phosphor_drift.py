#!/usr/bin/env python3
"""Compose "Phosphor Drift" (v2, cassette edition) — agentboy's built-in tune.

Cozy slice-of-life lofi in D major (the same key as the chassis SFX, so the
blips and the music read as one world), played back off an imaginary tape:
the piece opens with the cassette going into the deck and the PLAY key, a
gentle tape hiss runs under everything, a brushed jazz kit keeps a lazy
swing, and at the end the transport clunks to STOP and the hiss dies with
it. Under that: brown-noise rain, vinyl crackle, warm rhodes-ish maj7
comping, soft triangle bass, and a quiet chip lead.

Deterministic — same file out every run. Renders a WAV; encode with:
  ffmpeg -i phosphor-drift.wav -codec:a libmp3lame -b:a 128k phosphor-drift.mp3
"""

import wave

import numpy as np

SR = 44100
BPM = 84
BEAT = 60.0 / BPM
BAR = 4 * BEAT
TOTAL_BARS = 52            # intro 4 | A1 8 | A2 8 | B 8 | A3 8 | B2 8 | outro 8
DUR = TOTAL_BARS * BAR
SWING = 0.10 * BEAT        # off-beat 8ths land late — lazy afternoon feel

# The mechanical theatre outside the music: cassette in, PLAY, ..., STOP.
LEAD_IN = 1.9              # seconds of deck noises before bar 0
STOP_AT = LEAD_IN + DUR + 0.7
TAIL = 1.6                 # room after the STOP clunk

OUT = "phosphor-drift.wav"  # written to the current directory

rng = np.random.default_rng(20260705)

L = np.zeros(int((LEAD_IN + DUR + 0.7 + TAIL) * SR))
R = np.zeros_like(L)


def f(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n, a=0.01, d=0.08, s=0.6, r=0.12):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.minimum(t / max(a, 1e-4), 1.0)
    e = np.where(t > a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)), e)
    rel = np.clip((dur - t) / max(r, 1e-4), 0, 1)
    return e * rel


def add(sig, t0, pan=0.0, vol=1.0):
    i = int(t0 * SR)
    j = min(i + len(sig), len(L))
    if j <= i:
        return
    s = sig[: j - i] * vol
    L[i:j] += s * (1 - max(pan, 0))
    R[i:j] += s * (1 + min(pan, 0))


def swing(beat_pos: float) -> float:
    """Delay off-beat 8ths (x.5) a touch."""
    return SWING if abs(beat_pos % 1 - 0.5) < 0.01 else 0.0


def rhodes(t0, midi, dur, vol=0.05, pan=0.0):
    """Warm keys: sine + soft 2nd/3rd harmonics + slow tremolo."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    w = 2 * np.pi * f(midi)
    sig = (np.sin(w * t) + 0.35 * np.sin(2 * w * t) + 0.12 * np.sin(3 * w * t))
    trem = 1 + 0.12 * np.sin(2 * np.pi * 3.7 * t)
    add(sig * trem * env(n, 0.006, 0.35, 0.35, 0.25), t0, pan, vol)


def tri_note(t0, midi, dur, vol=0.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = 2 * np.abs(2 * ((f(midi) * t) % 1.0) - 1) - 1
    add(sig * env(n, 0.008, 0.2, 0.5, 0.1), t0, 0.0, vol)


def chip(t0, midi, dur, vol=0.05, pan=-0.08):
    """The quiet chip lead: 50% pulse with vibrato, heavily mellowed."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = f(midi)
    vib = np.sin(2 * np.pi * 4.6 * t) * 5 / 1200
    ph = np.cumsum(freq * (2 ** vib)) / SR
    raw = np.where((ph % 1.0) < 0.5, 1.0, -1.0)
    # one-pole lowpass to file the corners off the square
    alpha = 0.25
    sm = np.empty_like(raw)
    acc = 0.0
    for i in range(len(raw)):  # short notes; fine
        acc += alpha * (raw[i] - acc)
        sm[i] = acc
    add(sm * env(n, 0.015, 0.18, 0.5, 0.15), t0, pan, vol)


# ---- the brushed jazz kit ----------------------------------------------------
def ride_tick(t0, vol=0.012, pan=0.35, freq=5200, dur=0.045):
    """A brush tip touching the ride — a breath of banded noise."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = rng.standard_normal(n) * np.sin(2 * np.pi * freq * t)
    add(sig * env(n, 0.002, 0.018, 0.0, 0.02), t0, pan, vol)


def sweep(t0, dur, vol=0.008, pan=-0.25):
    """The brush stirring the snare head: long, low, hushed noise swish
    with a slow bell-shaped swell — the sound that makes it read as jazz."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    white = rng.standard_normal(n)
    # crude pink-ish tilt: average pairs to soften the top
    soft = np.convolve(white, np.ones(6) / 6, mode="same")
    bell = np.sin(np.pi * np.clip(t / (n / SR), 0, 1))
    add(soft * bell, t0, pan, vol)


def hat_foot(t0, vol=0.010):
    """Hi-hat closed with the foot on 2 and 4 — short dark 'chick'."""
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    sig = rng.standard_normal(n) * np.sin(2 * np.pi * 6800 * t)
    add(sig * env(n, 0.001, 0.012, 0.0, 0.012), t0, -0.15, vol)


def thump(t0, vol=0.05):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    freq = 65 * np.exp(-t * 9) + 45
    sig = np.sin(2 * np.pi * np.cumsum(freq) / SR)
    add(sig * env(n, 0.002, 0.05, 0.2, 0.05), t0, 0.0, vol)


def jazz_bar(t_bar, energy=1.0):
    """One bar of brushed swing: ride 'ding ding-a ding ding-a', feathered
    kick on 1 and 3, hat on 2 and 4, sweeps stirring underneath. energy
    scales the chatter, not the pulse."""
    # sweeps: two half-bar stirs, alternating direction
    sweep(t_bar, 2 * BEAT, vol=0.0065 * energy, pan=-0.3)
    sweep(t_bar + 2 * BEAT, 2 * BEAT, vol=0.0055 * energy, pan=-0.18)
    # ride pattern with the skip note swung
    for beat in (0, 1, 2, 3):
        ride_tick(t_bar + beat * BEAT, vol=0.011 * energy * (1.25 if beat in (0, 2) else 1.0))
        if beat in (1, 3):
            ride_tick(t_bar + (beat + 0.5) * BEAT + SWING, vol=0.007 * energy, freq=4600, dur=0.035)
    # feathered kick, barely there
    thump(t_bar, vol=0.030 * energy)
    thump(t_bar + 2 * BEAT, vol=0.022 * energy)
    hat_foot(t_bar + 1 * BEAT, vol=0.009 * energy)
    hat_foot(t_bar + 3 * BEAT, vol=0.010 * energy)
    # the occasional lazy ghost accent — deterministic mischief
    if rng.uniform() < 0.35 * energy:
        ride_tick(t_bar + (2.5 * BEAT) + SWING, vol=0.006 * energy, freq=3400, dur=0.05)


def drums(start_bar, n_bars, energy=1.0):
    for bar in range(start_bar, start_bar + n_bars):
        jazz_bar(bars(bar) + LEAD_IN, energy)


# ---- cassette transport ------------------------------------------------------
def clunk(t0, freq=130, dur=0.05, vol=0.09):
    """Low mechanical body knock."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    sweep_f = freq * np.exp(-t * 26) + 55
    sig = np.sin(2 * np.pi * np.cumsum(sweep_f) / SR)
    add(sig * env(n, 0.001, 0.02, 0.1, 0.02), t0, 0.0, vol)


def snap(t0, lo=1400, hi=5200, dur=0.012, vol=0.05, pan=0.0):
    """Plastic latch snap: a pinch of banded noise."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    band = np.sin(2 * np.pi * lo * t) + 0.6 * np.sin(2 * np.pi * hi * t)
    sig = rng.standard_normal(n) * band
    add(sig * env(n, 0.0008, 0.004, 0.0, 0.004), t0, pan, vol)


def cassette_insert():
    """The whole ritual: door open, tape slides in, door shut, PLAY engages,
    the motor hums up and the hiss rises with it."""
    # door popped open: bright little latch
    snap(0.15, lo=2600, hi=6400, dur=0.010, vol=0.035, pan=-0.2)
    # tape sliding into the well: soft plastic friction
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    slide = np.convolve(rng.standard_normal(n), np.ones(9) / 9, mode="same")
    add(slide * np.sin(np.pi * t / t[-1]), 0.42, pan=-0.1, vol=0.018)
    clunk(0.62, freq=95, vol=0.05)                      # seated in the well
    # door shut: firmer snap + body knock together
    snap(0.95, lo=1700, hi=4400, dur=0.014, vol=0.055)
    clunk(0.96, freq=140, vol=0.075)
    # PLAY: the deep key latch — the loudest event of the ritual
    snap(1.45, lo=1100, hi=3200, dur=0.02, vol=0.075, pan=0.1)
    clunk(1.46, freq=170, dur=0.07, vol=0.13)
    clunk(1.52, freq=80, dur=0.09, vol=0.07)            # spring settling
    # motor hum swelling in under the first bars
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    hum = np.sin(2 * np.pi * 50 * t) + 0.4 * np.sin(2 * np.pi * 100 * t)
    add(hum * np.minimum(t / 0.9, 1.0) * np.exp(-t * 0.8), 1.5, 0.0, 0.012)


def cassette_stop():
    """STOP at the end: the key clunks, the hiss dies on the same sample —
    that hard cut is the signature of a real deck."""
    snap(STOP_AT, lo=1300, hi=3600, dur=0.016, vol=0.065, pan=0.05)
    clunk(STOP_AT + 0.008, freq=160, dur=0.08, vol=0.12)
    clunk(STOP_AT + 0.09, freq=75, dur=0.1, vol=0.06)


def tape_hiss():
    """Gentle high-tilted noise from PLAY to STOP, with a whisper of wow &
    flutter in its level. Cut dead at the STOP clunk."""
    start = 1.5
    n = int((STOP_AT - start) * SR)
    t = np.arange(n) / SR
    white = rng.standard_normal(n)
    hiss = white - np.concatenate([[0], white[:-1]]) * 0.55   # tilt toward the top
    flutter = 1 + 0.10 * np.sin(2 * np.pi * 0.6 * t) + 0.05 * np.sin(2 * np.pi * 7.3 * t)
    ramp = np.minimum(t / 0.5, 1.0)
    ramp[-int(0.004 * SR):] = 0.0                              # dead cut at STOP
    add(hiss * flutter * ramp, start, pan=0.05, vol=0.0055)


# ---- ambient bed -------------------------------------------------------------
def brown_noise_bed():
    n = len(L)
    white = rng.standard_normal(n)
    brown = np.cumsum(white)
    brown -= np.linspace(brown[0], brown[-1], n)     # detrend so it stays centered
    brown /= np.abs(brown).max()
    t = np.arange(n) / SR
    # slow breathing swell, like rain pressing against the window
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * t / 19.0)
    fade = np.minimum(np.clip(t - LEAD_IN, 0, None) / 6.0, 1.0) * np.clip((LEAD_IN + DUR - t) / 8.0, 0, 1)
    add(brown * lfo * fade, 0, pan=0.0, vol=0.030)
    # a second, slightly different bed hard-panned the other way for width
    white2 = rng.standard_normal(n)
    brown2 = np.cumsum(white2)
    brown2 -= np.linspace(brown2[0], brown2[-1], n)
    brown2 /= np.abs(brown2).max()
    sigL = brown * lfo * fade * 0.5 + brown2 * lfo * fade * 0.5
    add(sigL, 0, pan=0.6, vol=0.012)


def vinyl_crackle():
    total = int(DUR)
    for _ in range(total * 2):  # ~2 pops per second, mostly tiny
        t0 = rng.uniform(LEAD_IN + 0.5, LEAD_IN + DUR - 2)
        n = int(rng.uniform(0.002, 0.008) * SR)
        pop = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.0015 * SR))
        add(pop, t0, pan=float(rng.uniform(-0.7, 0.7)), vol=float(rng.uniform(0.004, 0.014)))


# ---- harmony -----------------------------------------------------------------
D, E, Fs, G, A, B, Cs = 62, 64, 66, 67, 69, 71, 73
CHORDS = {
    "Dmaj7": [D - 24, A - 12, D, Fs, A, Cs],
    "Bm7":   [B - 36 + 12, Fs - 12, B - 12, D, Fs, A],
    "Gmaj7": [G - 36 + 12, D - 12, G - 12, B - 12, D, Fs],
    "A7":    [A - 36 + 12, E - 12, A - 12, Cs, E, G],
}
A_PROG = ["Dmaj7", "Bm7", "Gmaj7", "A7"]
B_PROG = ["Gmaj7", "A7", "Bm7", "A7"]

SEC = {"intro": 0, "A1": 4, "A2": 12, "B": 20, "A3": 28, "B2": 36, "outro": 44}
bars = lambda b: b * BAR  # noqa: E731


def comp(start_bar, prog, vol=0.042):
    """Rhodes stabs on the and-of-2 and beat 4 — classic lazy comping."""
    for ci, name in enumerate(prog):
        c = CHORDS[name]
        base = bars(start_bar + 2 * ci) + LEAD_IN
        for bar_off in (0, 1):
            t_bar = base + bar_off * BAR
            for beat_pos, voicing, v in [(1.5, c[2:5], vol), (3.0, c[3:6], vol * 0.8)]:
                t0 = t_bar + beat_pos * BEAT + swing(beat_pos)
                for k, m in enumerate(voicing):
                    rhodes(t0 + 0.012 * k, m, 1.5 * BEAT, vol=v, pan=(k - 1) * 0.25)


def bass(start_bar, prog):
    for ci, name in enumerate(prog):
        root = CHORDS[name][0] + 12
        base = bars(start_bar + 2 * ci) + LEAD_IN
        for bar_off in (0, 1):
            t_bar = base + bar_off * BAR
            tri_note(t_bar, root, 1.6 * BEAT, vol=0.11)
            tri_note(t_bar + 2.5 * BEAT + SWING, root + (7 if bar_off else 0), 1.1 * BEAT, vol=0.085)


LEAD_A = [
    (0, 74, 1.5), (2, 76, 0.5), (2.5, 78, 1.5), (5, 81, 2.0),
    (8, 78, 1.0), (9.5, 76, 0.5), (10, 74, 2.5),
    (16, 81, 1.5), (18, 83, 0.5), (18.5, 81, 1.0), (20, 78, 2.0),
    (24, 76, 1.0), (25.5, 78, 0.5), (26, 74, 3.5),
]
LEAD_B = [
    (0, 78, 1.0), (1.5, 81, 0.5), (2, 83, 2.0), (5, 81, 1.5),
    (8, 78, 1.0), (9.5, 76, 0.5), (10, 78, 1.0), (11.5, 74, 2.0),
    (16, 76, 1.0), (17.5, 78, 0.5), (18, 81, 2.0), (21, 83, 1.5),
    (24, 81, 1.0), (25.5, 78, 0.5), (26, 76, 1.0), (27.5, 74, 2.5),
]


def lead(start_bar, phrases, vol=0.05, oct_up=0):
    for (beat, m, dur) in phrases:
        t0 = bars(start_bar) + beat * BEAT + swing(beat) + LEAD_IN
        chip(t0, m + oct_up, dur * BEAT, vol=vol)
        # single soft echo, panned the other way
        chip(t0 + 3 * BEAT / 2 * 0.5, m + oct_up, dur * BEAT * 0.8, vol=vol * 0.22, pan=0.5)


# ---- arrangement ---------------------------------------------------------------
cassette_insert()
tape_hiss()
brown_noise_bed()
vinyl_crackle()

# Intro (no boot motif any more — the deck was the overture): the room warms
# up with a first chord over the rain
for k, m in enumerate(CHORDS["Dmaj7"][2:6]):
    rhodes(LEAD_IN + bars(1) + 0.03 * k, m, 2.5 * BEAT, vol=0.04, pan=(k - 1.5) * 0.25)
tri_note(LEAD_IN + bars(1), 38, 3.0 * BEAT, vol=0.1)
for k, m in enumerate(CHORDS["Gmaj7"][2:6]):
    rhodes(LEAD_IN + bars(3) + 0.03 * k, m, 2.5 * BEAT, vol=0.034, pan=(k - 1.5) * 0.22)

comp(SEC["A1"], A_PROG)
bass(SEC["A1"], A_PROG)
drums(SEC["A1"], 8, energy=0.55)          # brushes tip-toe in

comp(SEC["A2"], A_PROG)
bass(SEC["A2"], A_PROG)
drums(SEC["A2"], 8, energy=0.9)
lead(SEC["A2"], LEAD_A)

comp(SEC["B"], B_PROG, vol=0.048)
bass(SEC["B"], B_PROG)
drums(SEC["B"], 8, energy=1.1)            # the kit leans in
lead(SEC["B"], LEAD_B, vol=0.055)

comp(SEC["A3"], A_PROG)
bass(SEC["A3"], A_PROG)
drums(SEC["A3"], 8, energy=0.9)
lead(SEC["A3"], LEAD_A, vol=0.035)
lead(SEC["A3"], LEAD_A, vol=0.028, oct_up=12)

# B2: the brushes get their moment — chatter up, keys thin out
comp(SEC["B2"], B_PROG, vol=0.036)
bass(SEC["B2"], B_PROG)
drums(SEC["B2"], 8, energy=1.35)
lead(SEC["B2"], LEAD_B, vol=0.03, oct_up=12)

# Outro: keys and bass thin out, a last downward answer, rain remains
comp(SEC["outro"], ["Dmaj7", "Gmaj7"], vol=0.035)
drums(SEC["outro"], 4, energy=0.45)       # brushes bow out halfway through
tri_note(LEAD_IN + bars(SEC["outro"]), 50, 3.5 * BEAT, vol=0.09)
tri_note(LEAD_IN + bars(SEC["outro"] + 2), 43, 3.5 * BEAT, vol=0.085)
tri_note(LEAD_IN + bars(SEC["outro"] + 4), 38, 6.0 * BEAT, vol=0.08)
for (beat, m, dur) in [(16, 74, .35), (16.5, 69, .35), (17, 66, .35), (17.5, 62, 3.0)]:
    chip(LEAD_IN + bars(SEC["outro"]) + beat * BEAT, m, dur * BEAT, vol=0.045)

cassette_stop()

# ---- master --------------------------------------------------------------------
mix = np.stack([L, R])
mix = np.tanh(mix * 1.2) * 0.9
peak = np.abs(mix).max()
mix = mix / peak * 0.9

with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype(np.int16).tobytes())

print(f"wrote {OUT}  ({len(L)/SR:.1f}s)")
