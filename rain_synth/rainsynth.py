"""Endless procedural rain: 10 bands of noise + sparse drop impulses, no loops.

Each band is excitation (noise wash + Poisson impulses with heavy-tailed
amplitudes, slow random level drift, tunable L/R correlation) pushed through a
stateful band-pass filter, so audio is generated block by block forever.

    python rainsynth.py render out.wav --preset presets.json --name rain --seconds 120
    python rainsynth.py play --name tin          (needs `pip install sounddevice`)
"""
import argparse
import json
import numpy as np
import soundfile as sf
from scipy.signal import butter, lfilter, sosfilt, sosfilt_zi

SR = 44100


class Band:
    def __init__(self, p, rng, sr=SR):
        self.p, self.rng, self.sr = p, rng, sr
        lo, hi = p["lo"], min(p["hi"], sr * 0.45)
        self.sos = butter(p.get("order", 2), [lo, hi], btype="band", fs=sr, output="sos")
        zi = sosfilt_zi(self.sos) * 0.0
        self.zi = [zi.copy(), zi.copy()]
        # one-pole low-pass on noise gives the slow level drift
        self.a = float(np.exp(-2 * np.pi * p.get("mod_hz", 0.3) / sr))
        self.drift_state = np.zeros(1)

    def _drift(self, n):
        d = self.p["depth"]
        if d <= 0:
            return np.ones(n)
        w = self.rng.standard_normal(n) * np.sqrt(1 - self.a**2)
        out, self.drift_state = lfilter([1.0], [1.0, -self.a], w, zi=self.drift_state)
        return np.exp(d * out - 0.5 * d * d)

    def _excite(self, n):
        p, r = self.p, self.rng
        wash = r.standard_normal(n) * (1 - p["imp"])
        hits = r.random(n) < p["dens"] / self.sr
        amp = np.exp(p["sigma"] * r.standard_normal(n)) * r.choice([-1.0, 1.0], n)
        imp = hits * amp * p["imp"] * np.sqrt(self.sr / max(p["dens"], 1.0))
        return wash + imp

    def process(self, n):
        rho = self.p["rho"]
        common = self._excite(n)
        chans = []
        for c in range(2):
            e = np.sqrt(rho) * common + np.sqrt(1 - rho) * self._excite(n)
            y, self.zi[c] = sosfilt(self.sos, e, zi=self.zi[c])
            chans.append(y)
        return np.stack(chans, 1) * self._drift(n)[:, None] * self.p["gain"]


class RainSynth:
    """Infinite stereo generator. `levels` are 0..1 per band (the 'sliders')."""

    def __init__(self, bands, levels=None, seed=None, sr=SR):
        rng = np.random.default_rng(seed)
        self.bands = [Band(b, np.random.default_rng(rng.integers(1 << 62)), sr) for b in bands]
        self.levels = np.array(levels if levels is not None else [0.3] * len(bands), float)
        self.sr = sr

    def process(self, n):
        out = np.zeros((n, 2))
        for lv, b in zip(self.levels, self.bands):
            y = b.process(n)  # always run so filter state and drift keep evolving
            out += lv * y
        return out


def load(path, name):
    d = json.load(open(path))[name]
    return d["bands"], d["levels"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["render", "play"])
    ap.add_argument("out", nargs="?")
    ap.add_argument("--preset", default="presets.json")
    ap.add_argument("--name", default="rain")
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--gain", type=float, default=3.0)
    a = ap.parse_args()
    bands, levels = load(a.preset, a.name)
    syn = RainSynth(bands, levels, a.seed)
    if a.mode == "render":
        n = int(a.seconds * SR)
        with sf.SoundFile(a.out, "w", SR, 2, "PCM_16") as f:
            for i in range(0, n, 4096):
                f.write(np.tanh(a.gain * syn.process(min(4096, n - i))))
    else:
        import sounddevice as sd

        def cb(out, frames, t, s):
            out[:] = np.tanh(a.gain * syn.process(frames))

        with sd.OutputStream(samplerate=SR, channels=2, callback=cb):
            input("Playing - press Enter to stop\n")


if __name__ == "__main__":
    main()
