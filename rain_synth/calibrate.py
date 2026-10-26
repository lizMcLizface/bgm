"""Fit synth band parameters to the reference stems and report how close they are.

    python calibrate.py <dir with rainNa.ogg / tinNa.ogg> 
"""
import itertools
import json
import sys
import numpy as np
import soundfile as sf
from scipy.signal import welch
from rainsynth import Band, RainSynth, SR

D = sys.argv[1] if len(sys.argv) > 1 else "."
TH_OCT = 2.0 ** (1 / 3)


def stats(x, sr):
    m = x.mean(1)
    f, p = welch(m, sr, nperseg=8192)
    cum = np.cumsum(p) / p.sum()
    q = lambda v: float(f[np.searchsorted(cum, v)])
    k = sr // 20
    e = np.convolve(np.abs(m), np.ones(k) / k, "valid")[::k]
    return dict(
        rms=float(np.sqrt((m**2).mean())),
        kurt=float(((m - m.mean()) ** 4).mean() / m.var() ** 2),
        cv=float(e.std() / e.mean()),
        rho=float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]),
        f05=q(0.05), f50=q(0.5), f95=q(0.95), f=f, p=p,
    )


def third_oct(f, p, centres):
    out = []
    for c in centres:
        s = (f >= c / 2 ** (1 / 6)) & (f < c * 2 ** (1 / 6))
        out.append(10 * np.log10(p[s].mean() + 1e-20) if s.any() else np.nan)
    return np.array(out)


def render(params, secs, seed=0):
    b = Band(params, np.random.default_rng(seed))
    return np.concatenate([b.process(4096) for _ in range(int(secs * SR / 4096))])


def fit_band(t):
    base = dict(lo=t["f05"] * 0.9, hi=t["f95"] * 1.1, order=2, rho=float(np.clip(t["rho"], 0, 0.95)),
                gain=1.0, dens=100.0, sigma=1.0, imp=0.0, depth=0.0)
    best = None
    for dens, imp, depth, sigma in itertools.product([30, 100, 400, 1500, 5000], [0, .3, .6, .85, .97],
                                                      [0, .1, .2, .3, .45, .6, 1.0], [0.4, 0.8, 1.2]):
        if imp == 0 and (dens != 30 or sigma != 0.4):
            continue
        p = dict(base, dens=dens, imp=imp, depth=depth, sigma=sigma)
        s = stats(render(p, 6), SR)
        err = abs(np.log(s["kurt"] / t["kurt"])) + 1.5 * abs(np.log(s["cv"] / t["cv"]))
        if best is None or err < best[0]:
            best = (err, p, s)
    err, p, s = best
    p["gain"] = t["rms"] / s["rms"]
    return p


def main():
    presets = {}
    for name in ("rain", "tin"):
        bands, rows = [], []
        for i in range(10):
            x, sr = sf.read(f"{D}/{name}{i}a.ogg")
            t = stats(x, sr)
            p = fit_band(t)
            bands.append(p)
            s = stats(render(p, 20, seed=1), SR)
            centres = np.array([c for c in 2 ** (np.arange(3, 14.5, 1 / 3)) if c < sr / 2 * 0.9])
            ref, syn = third_oct(t["f"], t["p"], centres), third_oct(s["f"], s["p"], centres)
            # compare spectra over the region holding 90% of reference energy
            sel = (centres > t["f05"]) & (centres < t["f95"])
            spec_err = float(np.nanmean(np.abs((ref - syn)[sel] - np.nanmean((ref - syn)[sel]))))
            rows.append(f"{name}{i} kurt {t['kurt']:5.1f}/{s['kurt']:5.1f}  envCV {t['cv']:.2f}/{s['cv']:.2f}  "
                        f"rho {t['rho']:+.2f}/{s['rho']:+.2f}  imp={p['imp']:.2f} dens={p['dens']:.0f} "
                        f"depth={p['depth']:.1f}  spectral dev {spec_err:.1f} dB")
        print("\n".join(rows))
        presets[name] = dict(bands=bands, levels=[0.3] * 10)
    presets["tin"]["levels"] = [0.27, 0.27, 0.27, 0.29, 0.32, 0.36, 0.39, 0.36, 0.32, 0.29]
    json.dump(presets, open("presets.json", "w"), indent=1)


if __name__ == "__main__":
    main()
