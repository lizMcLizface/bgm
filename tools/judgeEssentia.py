"""Essentia's open mood / genre / instrument classifiers, run through onnxruntime (no essentia install needed:
essentia-tensorflow has no Windows wheel). Discogs-EffNet turns 16 kHz audio into 1280-d embeddings (and 400 Discogs
style activations); small heads on the embeddings give the tags. Models are fetched from essentia.upf.edu on first use
into .tmp/essentia-models. The mel front end reproduces Essentia's TensorflowInputMusiCNN settings
(area-normalised Hann, power spectrum - checked on cello / pad / thunder recordings: magnitude gave 'electronic' for all).
"""
import json, urllib.request
from pathlib import Path

import librosa
import numpy as np
import onnxruntime as ort
import scipy.signal

BASE = 'https://essentia.upf.edu/models'
DIR = Path(__file__).resolve().parent.parent / '.tmp' / 'essentia-models'
# head -> how to show it: 'binary' (first class vs the rest), 'single' (top class of a softmax), 'multi' (top-k of sigmoids)
HEADS = {
    'mood_happy': 'binary', 'mood_sad': 'binary', 'mood_relaxed': 'binary', 'mood_aggressive': 'binary', 'mood_party': 'binary',
    'mood_acoustic': 'binary', 'mood_electronic': 'binary', 'danceability': 'binary', 'voice_instrumental': 'binary',
    'tonal_atonal': 'binary', 'timbre': 'binary',
    'genre_rosamerica': 'single', 'genre_dortmund': 'single', 'genre_electronic': 'single',
    'mtg_jamendo_moodtheme': 'multi', 'mtg_jamendo_genre': 'multi', 'mtg_jamendo_instrument': 'multi',
}
SR, FRAME, HOP, BANDS, PATCH, PATCH_HOP = 16000, 512, 256, 96, 128, 64


def _fetch(name, url):
    path = DIR / name
    if not path.exists():
        DIR.mkdir(parents=True, exist_ok=True)
        print(f'fetching {url}')
        urllib.request.urlretrieve(url, path)
    return path


def _session(name, url):
    options = ort.SessionOptions()
    options.log_severity_level = 3
    return ort.InferenceSession(str(_fetch(name, url)), sess_options=options, providers=['CPUExecutionProvider'])  # small models; the GPU providers need cuDNN


class Essentia:
    def __init__(self):
        self.effnet = _session('discogs-effnet.onnx', f'{BASE}/feature-extractors/discogs-effnet/discogs-effnet-bsdynamic-1.onnx')
        meta = json.loads(_fetch('discogs-effnet.json', f'{BASE}/feature-extractors/discogs-effnet/discogs-effnet-bsdynamic-1.json').read_text())
        self.styles = meta['classes']
        self.heads = {}
        for h in HEADS:
            self.heads[h] = (_session(f'{h}.onnx', f'{BASE}/classification-heads/{h}/{h}-discogs-effnet-1.onnx'),
                             json.loads(_fetch(f'{h}.json', f'{BASE}/classification-heads/{h}/{h}-discogs-effnet-1.json').read_text())['classes'])
        self.mel = librosa.filters.mel(sr=SR, n_fft=FRAME, n_mels=BANDS, fmin=0, fmax=8000, htk=False, norm=None)  # slaney scale, unit-height triangles

    def patches(self, y, sr):
        mono = librosa.resample(y.mean(axis=0) if y.ndim > 1 else y, orig_sr=sr, target_sr=SR)
        window = scipy.signal.get_window('hann', FRAME)  # Essentia's Windowing normalises to area 1, times 2
        spec = np.abs(librosa.stft(mono, n_fft=FRAME, hop_length=HOP, window=window * 2 / window.sum(), center=False)) ** 2  # MelBands takes the power spectrum
        mel = np.log10(1 + 10000 * (self.mel @ spec)).T.astype(np.float32)  # frames x 96
        starts = range(0, max(1, mel.shape[0] - PATCH + 1), PATCH_HOP)
        return np.stack([mel[s:s + PATCH] for s in starts if mel[s:s + PATCH].shape[0] == PATCH])

    def analyse(self, y, sr, top=4, max_patches=1500):
        p = self.patches(y, sr)
        if len(p) > max_patches:
            p = p[np.linspace(0, len(p) - 1, max_patches).astype(int)]
        act, emb = [], []
        for i in range(0, len(p), 128):
            a, e = self.effnet.run(None, {'melspectrogram': p[i:i + 128]})
            act.append(a); emb.append(e)
        act, emb = np.concatenate(act), np.concatenate(emb)
        order = np.argsort(-act.mean(0))[:top]
        out = {'styles': {self.styles[i].replace('---', ' / '): round(float(act.mean(0)[i]), 3) for i in order}}
        for h, kind in HEADS.items():
            session, classes = self.heads[h]
            pred = session.run(None, {'embeddings': emb})[0].mean(0)
            if kind == 'binary':
                i = next((k for k, c in enumerate(classes) if not c.startswith(('non_', 'not_'))), 0)  # the positive class
                out[h] = {classes[i]: round(float(pred[i]), 2)}
            else:
                idx = np.argsort(-pred)[:top if kind == 'multi' else 2]
                out[h] = {classes[i]: round(float(pred[i]), 2) for i in idx}
        return out
