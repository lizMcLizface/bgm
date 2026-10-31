"""Judges rendered audio: loudness, spectrum, density and silence, plus zero-shot mood / genre / instrument
tags from LAION-CLAP (open weights, transformers 4.x) and Essentia's trained classifiers (tools/judgeEssentia.py). Run with the venv in .tmp/judge-venv:

    .tmp/judge-venv/Scripts/python.exe tools/judgeAudio.py renders/*.mp3 [--json out.json] [--top 4]
    ... --no-clap / --no-essentia   skip one tagger
    ... --prompt "muddy low end" --prompt "harsh high frequencies"   extra free-text probes

Scores are relative: CLAP was trained on recordings, so compare presets and before/after, not absolute values.
Each CLAP group is a softmax over its labels (so a group's scores sum to 1); "probes" are raw cosine similarity.
"""
import argparse, json, sys, warnings
from pathlib import Path

import librosa
import numpy as np
import pyloudnorm
import soundfile as sf
import torch
from transformers import ClapModel, ClapProcessor

warnings.filterwarnings('ignore')
MODEL = 'laion/clap-htsat-unfused'  # larger_clap_music does not discriminate under transformers (logit scales ~0); this one does
GROUPS = {
    'mood': ['calm', 'peaceful', 'relaxing', 'dreamy', 'warm and cozy', 'melancholy', 'sad', 'nostalgic', 'mysterious',
             'dark and ominous', 'tense', 'eerie', 'hopeful', 'uplifting', 'happy', 'energetic', 'aggressive', 'epic'],
    'genre': ['ambient', 'lofi hip hop', 'jazz', 'classical', 'cinematic score', 'folk', 'house', 'techno', 'trance',
              'synthwave', 'drum and bass', 'hip hop', 'rock', 'new age', 'chiptune', 'drone', 'minimalism', 'world music'],
    'instrument': ['piano', 'electric piano', 'strings', 'synth pad', 'synth lead', 'bass', 'drums', 'guitar', 'organ',
                   'bells and mallets', 'brass', 'woodwinds', 'choir', 'sub bass', 'arpeggiated synth', 'noise and texture'],
    'quality': ['a polished professional music production', 'an amateur sounding mix', 'a muddy mix', 'a harsh and shrill mix',
                'a thin and weak mix', 'a clean balanced mix', 'a distorted clipped mix', 'a monotonous repetitive loop',
                'a varied evolving piece of music', 'random notes without musical structure', 'a coherent melody over chords'],
}
SR = 48000


def technical(y, sr):
    """Loudness, dynamics, spectrum balance, density, silence: no model, just measurements."""
    mono = y.mean(axis=0) if y.ndim > 1 else y
    stereo = np.stack([mono, mono]) if y.ndim == 1 or y.shape[0] == 1 else y
    meter = pyloudnorm.Meter(sr)
    block = stereo.T
    lufs = meter.integrated_loudness(block)
    # short-term loudness (3 s windows, 1 s hop) -> loudness range and quiet stretches
    st = [meter.integrated_loudness(block[i:i + 3 * sr]) for i in range(0, max(1, block.shape[0] - 3 * sr), sr)]
    st = np.array([s for s in st if np.isfinite(s)]) if st else np.array([lufs])
    spec = np.abs(librosa.stft(mono, n_fft=4096, hop_length=2048)) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
    total = spec.sum() + 1e-12
    bands = {n: float(spec[(freqs >= lo) & (freqs < hi)].sum() / total)
             for n, lo, hi in [('sub<60', 0, 60), ('low60-250', 60, 250), ('mid250-2k', 250, 2000), ('high2k-6k', 2000, 6000), ('air>6k', 6000, 1e9)]}
    onsets = librosa.onset.onset_detect(y=mono, sr=sr, units='time')
    rms = librosa.feature.rms(y=mono, frame_length=4096, hop_length=2048)[0]
    rms_db = 20 * np.log10(rms + 1e-9)
    tempo = float(np.atleast_1d(librosa.feature.tempo(y=mono, sr=sr))[0])
    corr = float(np.corrcoef(stereo[0], stereo[1])[0, 1]) if y.ndim > 1 and np.std(stereo[0]) > 0 and np.std(stereo[1]) > 0 else 1.0
    return {
        'seconds': round(len(mono) / sr, 1),
        'lufs': round(float(lufs), 1),
        'loudness_range_db': round(float(np.percentile(st, 95) - np.percentile(st, 10)), 1),
        'quietest_3s_lufs': round(float(st.min()), 1),
        'peak_db': round(float(20 * np.log10(np.abs(stereo).max() + 1e-9)), 1),
        'crest_db': round(float(20 * np.log10(np.abs(mono).max() / (np.sqrt((mono ** 2).mean()) + 1e-9))), 1),
        'centroid_hz': round(float(librosa.feature.spectral_centroid(S=np.sqrt(spec), sr=sr).mean()), 0),
        'bands': {k: round(v, 3) for k, v in bands.items()},
        'onsets_per_s': round(len(onsets) / (len(mono) / sr), 2),
        'tempo_bpm_guess': round(tempo),
        'near_silent_fraction': round(float((rms_db < -60).mean()), 3),
        'stereo_correlation': round(corr, 2),
    }


@torch.no_grad()
def load_clap(device):
    model = ClapModel.from_pretrained(MODEL).to(device).eval()
    return model, ClapProcessor.from_pretrained(MODEL)


@torch.no_grad()
def embed_text(model, proc, texts, device):
    t = proc(text=texts, return_tensors='pt', padding=True).to(device)
    e = model.get_text_features(**t)
    e = e.pooler_output if hasattr(e, 'pooler_output') else e
    return torch.nn.functional.normalize(e, dim=-1)


@torch.no_grad()
def embed_audio(model, proc, y, sr, device, clip=10, max_clips=60):
    mono = librosa.resample(y.mean(axis=0) if y.ndim > 1 else y, orig_sr=sr, target_sr=SR)
    n = clip * SR
    starts = list(range(0, max(1, len(mono) - n + 1), n))
    if len(starts) > max_clips:
        starts = [starts[int(i)] for i in np.linspace(0, len(starts) - 1, max_clips)]
    clips = [mono[s:s + n] for s in starts]
    out = []
    for i in range(0, len(clips), 8):
        a = proc(audio=clips[i:i + 8], sampling_rate=SR, return_tensors='pt').to(device)
        e = model.get_audio_features(**a)
        out.append(e.pooler_output if hasattr(e, 'pooler_output') else e)
    return torch.nn.functional.normalize(torch.cat(out), dim=-1)  # (clips, dim)


def tag(audio_e, text_e, labels, scale, top):
    sim = audio_e @ text_e.T  # clips x labels
    p = torch.softmax(sim * scale, dim=-1).mean(0).cpu().numpy()
    order = np.argsort(-p)[:top]
    return {labels[i]: round(float(p[i]), 3) for i in order}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--json')
    ap.add_argument('--top', type=int, default=4)
    ap.add_argument('--prompt', action='append', default=[])
    ap.add_argument('--no-clap', action='store_true')
    ap.add_argument('--no-essentia', action='store_true')
    args = ap.parse_args()
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = proc = None
    if not args.no_clap:
        model, proc = load_clap(device)
        scale = float(model.logit_scale_a.exp()); scale = scale if scale > 10 else 100.0  # the converted checkpoint loads ~1; LAION trained to ~100
        texts = {g: embed_text(model, proc, [f'This is a recording of {l} music.' if g in ('mood', 'genre') else f'This music features {l}.' if g == 'instrument' else f'This music sounds like {l}.' for l in labels], device) for g, labels in GROUPS.items()}
        probes = embed_text(model, proc, args.prompt, device) if args.prompt else None
    ess = None
    if not args.no_essentia:
        from judgeEssentia import Essentia
        ess = Essentia()
    results = {}
    for f in args.files:
        y, sr = sf.read(f, always_2d=True)
        y = y.T.astype(np.float32)
        r = {'technical': technical(y, sr)}
        if model:
            a = embed_audio(model, proc, y, sr, device)
            r['clap'] = {g: tag(a, texts[g], GROUPS[g], scale, args.top) for g in GROUPS}
            if probes is not None:
                s = (a @ probes.T).mean(0).cpu().numpy()
                r['probes'] = {p: round(float(v), 3) for p, v in zip(args.prompt, s)}
            # how much the music changes across the render: mean cosine distance of clips from their centroid
            c = torch.nn.functional.normalize(a.mean(0, keepdim=True), dim=-1)
            r['clap_variation'] = round(float(1 - (a @ c.T).mean()), 4)
        if ess:
            r['essentia'] = ess.analyse(y, sr, args.top)
        results[Path(f).stem] = r
        t = r['technical']
        print(f"\n== {Path(f).stem}  {t['seconds']}s  {t['lufs']} LUFS  range {t['loudness_range_db']} dB  peak {t['peak_db']}  centroid {t['centroid_hz']:.0f} Hz  {t['onsets_per_s']} onsets/s  silent {t['near_silent_fraction']:.0%}")
        print('   bands ' + '  '.join(f'{k} {v:.0%}' for k, v in t['bands'].items()))
        for g, v in r.get('clap', {}).items():
            print(f'   {g:10s} ' + ', '.join(f'{k} {s:.2f}' for k, s in v.items()))
        for g, v in r.get('essentia', {}).items():
            print(f'   ess {g:22s} ' + ', '.join(f'{k} {s:.2f}' for k, s in v.items()))
        if 'probes' in r:
            print('   probes     ' + ', '.join(f'{k} {s:.3f}' for k, s in r['probes'].items()))
        if 'clap_variation' in r:
            print(f"   variation  {r['clap_variation']}")
    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=1))


if __name__ == '__main__':
    sys.exit(main())
