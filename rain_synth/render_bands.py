"""Render every band solo, loudness-matched to its reference stem, for A/B listening.

    python render_bands.py [reference_dir] [out_dir]
Writes <out>/<preset>_band<N>_synth.wav and <preset>_band<N>_ref.wav (15 s each).
"""
import os
import sys
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from rainsynth import RainSynth, SR, load

REF = sys.argv[1] if len(sys.argv) > 1 else "reference"
OUT = sys.argv[2] if len(sys.argv) > 2 else "bands"
SECS = 15
os.makedirs(OUT, exist_ok=True)

for name in ("rain", "tin"):
    bands, _ = load("presets.json", name)
    for i in range(10):
        lv = [0.0] * 10
        lv[i] = 1.0
        syn = RainSynth(bands, lv, seed=i)
        y = np.concatenate([syn.process(4096) for _ in range(SECS * SR // 4096)])
        ref, sr = sf.read(f"{REF}/{name}{i}a.ogg")
        ref = ref[: SECS * sr]
        if sr != SR:
            ref = resample_poly(ref, SR, sr, axis=0)
        # match both to a common, comfortable level
        target = 0.018
        y *= target / y.std()
        ref *= target / ref.std()
        sf.write(f"{OUT}/{name}_band{i}_synth.wav", np.clip(y, -1, 1), SR)
        sf.write(f"{OUT}/{name}_band{i}_ref.wav", np.clip(ref, -1, 1), SR)
        print(name, i, "peak synth/ref", abs(y).max().round(2), abs(ref).max().round(2))
