"""Render notes on the installed VST3 synths, headlessly, for matching our synth engines.

    vsthost.py render job.json result.json     render every case of a job
    vsthost.py catalog plugin out.json         parameters, ranges and program names

Job: {"sampleRate": 48000, "outDir": "...", "plugins": {"<key>": {"cases": [Case, ...]}}}
Case: {"name": "...", "program": "<name>" | null,
       "params": {"<vst param>": number | {"norm": 0..1} | "<enum text>"},
       "notes": [{"note": 60, "velocity": 100, "start": 0, "duration": 1}],
       "seconds": 3, "readback": false}

Numbers are in the plugin's own units (the range printed by `catalog`); {"norm": x} is the raw
0..1 position, which is the only way to set an enum without knowing its text.
Every case starts from the parameter state the plugin had at load, then applies program, then params.
The plugins print to stdout, so results only go to the result file (the log goes to stderr).
Run with the venv in .tmp/vst (uv venv .tmp/vst/venv; uv pip install pedalboard numpy mido).
"""
import json, os, sys, time
import numpy as np

VST3 = 'C:/Program Files/Common Files/VST3/'
# Inner binaries, because pedalboard cannot scan some bundle folders.
PLUGINS = {
    'dexed': VST3 + 'Dexed.vst3/Contents/x86_64-win/Dexed.vst3',
    'obxd': VST3 + 'OB-Xd 3.vst3/Contents/x86_64-win/OB-Xd 3.vst3',
    'unstable': VST3 + 'UNSTABLE.vst3',
    'eightyeight': VST3 + 'EightyEight.vst3',
    'deepjupiter': VST3 + 'Deep Jupiter.vst3',
}


# UNSTABLE and EightyEight start a phantom note 60 on their first block (even with no MIDI at all, -13 dB and -19 dB RMS)
# and never release it unless a note-off for 60 arrives. That phantom was the "two voices per note" seen earlier, and it
# put a stray sustained C4 under every render at any other note. A note-off for 60 at t=0 removes it; a case can keep
# the phantom with "phantom": true.
PHANTOM_NOTE_OFF = {'unstable': 60, 'eightyeight': 60}


class Quiet:
    """Silences the plugins' own stdout/stderr chatter at file-descriptor level."""
    def __enter__(self):
        sys.stdout.flush(); sys.stderr.flush()
        self.saved = [os.dup(1), os.dup(2)]
        self.null = os.open(os.devnull, os.O_WRONLY)
        os.dup2(self.null, 1); os.dup2(self.null, 2)
    def __exit__(self, *a):
        os.dup2(self.saved[0], 1); os.dup2(self.saved[1], 2)
        for fd in self.saved + [self.null]: os.close(fd)


def load(key):
    from pedalboard import load_plugin
    with Quiet():
        return load_plugin(PLUGINS[key])


def native(p):
    """Native-unit value of a parameter, or its enum text."""
    try:
        v = p.valid_values
    except Exception:
        v = None
    if p.min_value is None or p.max_value is None:
        return {'text': str(p.string_value) if hasattr(p, 'string_value') else None, 'norm': p.raw_value}
    return p.min_value + p.raw_value * (p.max_value - p.min_value) if not isinstance(p.min_value, bool) else bool(round(p.raw_value))


def set_param(plugin, name, value):
    p = plugin.parameters[name]
    if isinstance(value, dict):
        p.raw_value = float(value['norm'])
    elif isinstance(value, str):
        p.string_value = value
    elif isinstance(value, bool):
        p.raw_value = 1.0 if value else 0.0
    elif p.min_value is None or isinstance(p.min_value, bool):
        p.raw_value = float(value)
    else:
        span = p.max_value - p.min_value
        p.raw_value = min(1.0, max(0.0, (float(value) - p.min_value) / span)) if span else 0.0


def snapshot(plugin):
    return {k: p.raw_value for k, p in plugin.parameters.items() if k not in ('program', 'bypass')}


def run_case(plugin, base, case, sr, key=None):
    from mido import Message
    plugin.reset()
    with Quiet():
        for k, v in base.items():
            plugin.parameters[k].raw_value = v
        if case.get('program') is not None:
            plugin.program = case['program']
        for k, v in (case.get('params') or {}).items():
            set_param(plugin, k, v)
    notes = case.get('notes') or [{'note': 60, 'velocity': 100, 'start': 0, 'duration': 1}]
    events = []
    if key in PHANTOM_NOTE_OFF and not case.get('phantom'):
        events.append(Message('note_off', note=PHANTOM_NOTE_OFF[key], velocity=0, time=0.0))
    for n in notes:
        events.append(Message('note_on', note=int(n['note']), velocity=int(n.get('velocity', 100)), time=float(n.get('start', 0)) + 0.001))
        events.append(Message('note_off', note=int(n['note']), velocity=0, time=float(n.get('start', 0)) + float(n['duration']) + 0.001))
    seconds = float(case.get('seconds', 3))
    with Quiet():
        audio = plugin(events, seconds, sr, 2)
        audio = np.asarray(audio, dtype=np.float32)
    out = {'peak': float(np.abs(audio).max()), 'rms': float(np.sqrt((audio.astype(np.float64) ** 2).mean()))}
    if case.get('readback'):
        out['values'] = {k: (native(p) if k != 'program' else None) for k, p in plugin.parameters.items() if k not in ('program', 'bypass')}
    return audio, out


def write_wav(path, audio, sr):
    from pedalboard.io import AudioFile
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with AudioFile(path, 'w', sr, audio.shape[0], 32) as f:
        f.write(audio)


def render(job_path, result_path):
    job = json.load(open(job_path))
    sr = int(job.get('sampleRate', 48000))
    result = {}
    for key, spec in job['plugins'].items():
        t = time.time()
        plugin = load(key)
        print(f'{key}: loaded in {time.time() - t:.1f}s', file=sys.stderr)
        base = snapshot(plugin)
        result[key] = {}
        for case in spec['cases']:
            audio, info = run_case(plugin, base, case, sr, key)
            path = os.path.join(job['outDir'], key, case['name'] + '.wav').replace('\\', '/')
            write_wav(path, audio, sr)
            info['wav'] = path
            result[key][case['name']] = info
            print(f"  {case['name']}: peak {info['peak']:.3f} rms {info['rms']:.4f}", file=sys.stderr)
        del plugin
    json.dump(result, open(result_path, 'w'))


def catalog(key, out_path):
    plugin = load(key)
    info = {}
    for k, p in plugin.parameters.items():
        valid = None
        try:
            valid = list(p.valid_values) if p.valid_values is not None else None
        except Exception:
            pass
        info[k] = {'norm': p.raw_value, 'min': p.min_value, 'max': p.max_value, 'step': p.step_size,
                   'label': getattr(p, 'label', None), 'values': valid}
    json.dump(info, open(out_path, 'w'), indent=1, default=str)
    print(f'{key}: {len(info)} parameters', file=sys.stderr)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'render':
        render(sys.argv[2], sys.argv[3])
    elif cmd == 'catalog':
        catalog(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
