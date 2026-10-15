import React, { useEffect, useMemo, useRef, useState } from 'react';
import Generator, { ROLES } from './Generator';
import { SCALE_FAMILIES, TONIC_NAMES } from './theory';
import ChordTimeline from './ChordTimeline';
import { RoleButtons, TrackStrip, useLivePlay } from './Tracks';
import { defaultSettings, shareFromLocation, sharePath, shareUrl, newSeed } from './settings';
import SynthEditor from './editor/SynthEditor';
import PresetPicker from './editor/PresetPicker';
import PROGRESSIONS, { PROGRESSION_LENGTHS, progressionsOfLength } from './progressions';
import { PAD_STYLES, BASS_STYLES, styleShares, OCTAVE_LIMITS, OCTAVE_WANDER } from './arranger';
import { DRIFT_MODES } from './conductor';
import { METERS } from './meter';
import {
    RANDOM_LEVELS, randomKey, randomProgression, randomConductor, randomVoices, randomField, randomPreset, randomLength,
    randomArrangement, randomStyleWeights, randomRole, progressionLength, progressionForLength,
} from './randomize';
import { MasterVolume, AudioMeter, SettingsMenu } from './AudioStatus';
import { DiceIcon, SparkIcon } from './icons';
import { generateSound, newSoundSeed } from './soundGen';
import { levelPreset } from './engine/loudness';
import { addGeneratedPreset, generatedInfo } from './editor/presetStore';
import { readPref, writePref } from './prefs';

// One Generator for the page's lifetime; StrictMode's double-mount must
// not build a second set of instruments.
// Settings (and built-in presets) come from a share link when the page was
// opened with one.
// Generated sounds in a link are recreated (and levelled) after mount.
let generator = null;
let linkedSounds = [];
const getGenerator = () => {
    if (!generator) {
        const share = shareFromLocation(window.location);
        generator = new Generator(share ? share.settings : defaultSettings());
        if (share) {
            Object.entries(share.presets).forEach(([role, preset]) => {
                if (preset.generated) linkedSounds.push({ target: role, madeFor: preset.generated.role, seed: preset.generated.seed });
                else generator.loadRolePreset(role, preset);
            });
        }
    }
    // Dev server only: lets browser scripts drive it (e.g. preset loudness checks).
    if (import.meta.env.DEV) window.__generator = generator;
    return generator;
};

// Keeps the address bar a valid share link for the current settings.
function useSettingsInUrl(settings, presets) {
    useEffect(() => {
        const id = setTimeout(() => {
            window.history.replaceState(null, '', sharePath(settings, presets));
        }, 300);
        return () => clearTimeout(id);
    }, [settings, presets]);
}

// New variation / copy link, next to Play.
const ShareTools = ({ settings, presets, onLoad }) => {
    const [message, setMessage] = useState('');
    const flash = (text) => {
        setMessage(text);
        setTimeout(() => setMessage(''), 2500);
    };
    const copy = async () => {
        const url = shareUrl(settings, presets);
        try {
            await navigator.clipboard.writeText(url);
            flash('Link copied');
        } catch (e) {
            window.prompt('Copy this link', url);
        }
    };
    return (
        <div className="gen-share">
            <button type="button" onClick={() => onLoad({ ...settings, seed: newSeed() })} title="Same settings, different random choices">
                New variation
            </button>
            <button type="button" onClick={copy}>Copy link</button>
            <span className="gen-editor-message" role="status">{message}</span>
        </div>
    );
};

const RANDOM_TARGETS = [
    ['all', 'Everything'],
    ['key', 'Key & scale'],
    ['progression', 'Progression'],
    ['arrangement', 'Arrangement'],
    ['conductor', 'Evolution'],
    ['voices', 'Voices'],
];

// A remembered open/closed state (per browser).
function useStoredFlag(key, initial) {
    const [value, setValue] = useState(() => readPref(key, initial));
    const set = (next) => {
        setValue(next);
        writePref(key, next);
    };
    return [value, set];
}

const DiceButton = ({ label, onClick, className = '' }) => (
    <button type="button" className={`gen-dice ${className}`} title={`Randomize ${label.toLowerCase()}`} aria-label={`Random ${label}`}
        onClick={(e) => { e.preventDefault(); onClick(); }}><DiceIcon /></button>
);

// A settings panel: its title, a dice for everything in it (onRandom), the
// main controls, and - behind "More options", remembered per browser -
// the detailed ones.
const Panel = ({ id, title, heading, onRandom, more, className = '', children }) => {
    const [open, setOpen] = useStoredFlag(`bgm-more-${id}`, false);
    return (
        <section className={`gen-panel ${className}`}>
            <h2 className="gen-panel-title">
                {heading || title}
                {onRandom && <DiceButton label={title} onClick={onRandom} className="gen-panel-dice" />}
            </h2>
            {children}
            {more && (
                <>
                    <button type="button" className="gen-more" aria-expanded={open} onClick={() => setOpen(!open)}>
                        {open ? 'Fewer options ▴' : 'More options ▾'}
                    </button>
                    {open && more}
                </>
            )}
        </section>
    );
};

// Randomize buttons (randomize.js), with the level they - and the dice
// beside single fields - use.
const Randomizer = ({ level, onLevel: setLevel, onRandomize }) => {
    return (
        <div className="gen-randomize">
            <span className="gen-randomize-title">Randomize</span>
            <div className="gen-segmented" role="radiogroup" aria-label="How random">
                {Object.entries(RANDOM_LEVELS).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={level === id}
                        className={level === id ? 'is-on' : ''} onClick={() => setLevel(id)}>
                        {label}
                    </button>
                ))}
            </div>
            {RANDOM_TARGETS.map(([target, label]) => (
                <button key={target} type="button" onClick={() => onRandomize(target, level)}>{label}</button>
            ))}
        </div>
    );
};

// A labelled control; with onRandom, a dice button beside it (and with
// onGenerate, a "new sound" button).
const Field = ({ label, onRandom, onGenerate, generating, wide, children }) => (
    <label className={`gen-field${wide ? ' gen-field-wide' : ''}`}>
        <span>{label}</span>
        {onRandom ? (
            <span className="gen-field-row">
                {children}
                <button type="button" className="gen-dice" title="Randomize this" aria-label={`Random ${label}`}
                    onClick={(e) => { e.preventDefault(); onRandom(); }}><DiceIcon /></button>
                {onGenerate && (
                    <button type="button" className="gen-dice" title="Generate a new sound" aria-label={`Generate a new ${label.toLowerCase()}`}
                        disabled={generating} onClick={(e) => { e.preventDefault(); onGenerate(); }}><SparkIcon /></button>
                )}
            </span>
        ) : children}
    </label>
);

// One slider per style; the label shows the style's resulting share of
// phrases. Setting every other style to 0 makes one style "always".
const StyleWeights = ({ title, styles, weights, onChange, onRandom }) => {
    const shares = styleShares(weights);
    return (
        <fieldset className="gen-weights">
            <legend>{title}{onRandom && <DiceButton label={title} onClick={onRandom} className="gen-legend-dice" />}</legend>
            {Object.entries(styles).map(([id, label]) => (
                <Field key={id} label={`${label} · ${Math.round(shares[id] * 100)}%`}>
                    <input type="range" min="0" max="100" step="5" value={weights[id]}
                        onChange={(e) => onChange({ ...weights, [id]: Number(e.target.value) })} />
                </Field>
            ))}
        </fieldset>
    );
};

const CHANCES = [
    ['keyChance', 'Key change'],
    ['modeChance', 'Mode change'],
    ['progressionChance', 'Progression change'],
    ['tempoChance', 'Tempo change'],
];

// How the music moves over time (conductor.js). Chances are per
// progression cycle; Off keeps everything at the settings above.
// Toggle chips for an exclusion list; the home entry is locked on.
const Chips = ({ legend, items, excluded, locked, onChange }) => (
    <fieldset className="gen-chips">
        <legend>{legend}</legend>
        {items.map(({ id, label }) => {
            const isLocked = id === locked;
            const on = isLocked || !excluded.includes(id);
            return (
                <button
                    key={id}
                    type="button"
                    className={on ? 'is-on' : ''}
                    aria-pressed={on}
                    disabled={isLocked}
                    title={isLocked ? 'Your setting - always allowed' : undefined}
                    onClick={() => onChange(on ? [...excluded, id] : excluded.filter((x) => x !== id))}
                >
                    {label}
                </button>
            );
        })}
    </fieldset>
);

// Allowed keys and modes apply to drift and to the key & scale dice, so
// they stay usable with drift off.
const Evolution = ({ drift, home, onChange, onRandom }) => {
    const set = (key, value) => onChange({ ...drift, [key]: value });
    const family = SCALE_FAMILIES.find((f) => f.modes.some((m) => m.id === home.mode));
    const chances = (
        <fieldset className="gen-weights" disabled={drift.mode === 'off'}>
            <legend>Chance per progression cycle</legend>
            {CHANCES.map(([key, label]) => (
                <Field key={key} label={`${label} · ${Math.round(drift[key] * 100)}%`}>
                    <input type="range" min="0" max="1" step="0.05" value={drift[key]}
                        onChange={(e) => set(key, Number(e.target.value))} />
                </Field>
            ))}
            {drift.mode === 'centered' && (
                <Field label={`Pull toward my settings · ${Math.round(drift.homePull * 100)}%`}>
                    <input type="range" min="0" max="1" step="0.05" value={drift.homePull}
                        onChange={(e) => set('homePull', Number(e.target.value))} />
                </Field>
            )}
            <Field label={`Tempo range ± ${drift.tempoRange} BPM`}>
                <input type="range" min="0" max="20" step="1" value={drift.tempoRange}
                    onChange={(e) => set('tempoRange', Number(e.target.value))} />
            </Field>
            <label className="gen-check">
                <input type="checkbox" checked={drift.pivot} onChange={(e) => set('pivot', e.target.checked)} />
                Prepare key changes with the new key's V chord
            </label>
        </fieldset>
    );
    return (
        <Panel id="evolution" title="Evolution" onRandom={onRandom} more={chances}>
            <Field label="Drift">
                <select value={drift.mode} onChange={(e) => set('mode', e.target.value)}>
                    {Object.entries(DRIFT_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </Field>
            <fieldset className="gen-weights">
                <legend>Allowed keys and modes (drift and the key &amp; scale dice)</legend>
                <Chips
                    legend="Keys"
                    items={TONIC_NAMES.map((label, pc) => ({ id: pc, label }))}
                    excluded={drift.excludedTonics}
                    locked={home.tonic}
                    onChange={(list) => set('excludedTonics', list)}
                />
                <Chips
                    legend={`Modes (${family.family} family)`}
                    items={family.modes.map(({ id, name }) => ({ id, label: name }))}
                    excluded={drift.excludedModes}
                    locked={home.mode}
                    onChange={(list) => set('excludedModes', list)}
                />
            </fieldset>
        </Panel>
    );
};

// What drift is playing right now, polled from the audible bar (and read
// again whenever the settings change, which re-plans while stopped).
function useNowPlaying(gen, running, settings) {
    const [now, setNow] = useState(() => gen.nowPlaying());
    useEffect(() => {
        const read = () => setNow((prev) => {
            const next = gen.nowPlaying();
            return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
        read();
        if (!running) return undefined;
        const id = setInterval(read, 300);
        return () => clearInterval(id);
    }, [gen, running, settings]);
    return now;
}

// "Now playing" line under the Music settings, shown while drift has moved
// away from them; differing parts are highlighted.
const NowPlaying = ({ now, settings, onKeep }) => {
    const keyDiffers = now.tonic !== settings.tonic || now.mode !== settings.mode;
    const progressionDiffers = now.progression !== settings.progression;
    const tempoDiffers = now.bpm !== settings.bpm;
    if (!keyDiffers && !progressionDiffers && !tempoDiffers) return null;
    const part = (differs, text) => <span className={differs ? 'gen-differs' : ''}>{text}</span>;
    return (
        <div className="gen-nowplaying" role="status">
            <span>Now playing:</span>
            {part(keyDiffers, now.keyName)}
            {part(progressionDiffers, PROGRESSIONS[now.progression].join(' – '))}
            {part(tempoDiffers, `${now.bpm} BPM`)}
            <button type="button" onClick={onKeep}>Keep this</button>
        </div>
    );
};

const octaveLabel = (o) => (o === 0 ? 'Default' : `${o > 0 ? '+' : '−'}${Math.abs(o)} octave${Math.abs(o) > 1 ? 's' : ''}`);
const PAD_NOTES = { 3: 'Triads (3)', 4: 'Sevenths (4)', 5: 'Ninths (5)' };

// Per-role register: home octave, and whether/how it wanders by phrase.
const VoiceControls = ({ role, voice, onChange }) => {
    const [lo, hi] = OCTAVE_LIMITS[role];
    const set = (key, value) => onChange({ ...voice, [key]: value });
    return (
        <>
            <Field label="Octave">
                <select value={voice.octave} onChange={(e) => set('octave', Number(e.target.value))}>
                    {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((o) => <option key={o} value={o}>{octaveLabel(o)}</option>)}
                </select>
            </Field>
            <Field label="Octave wander">
                <select value={voice.wander} onChange={(e) => set('wander', e.target.value)}>
                    {Object.entries(OCTAVE_WANDER).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </Field>
            {voice.wander !== 'off' && (
                <Field label={`Change chance per phrase · ${Math.round(voice.chance * 100)}%`}>
                    <input type="range" min="0" max="1" step="0.05" value={voice.chance}
                        onChange={(e) => set('chance', Number(e.target.value))} />
                </Field>
            )}
        </>
    );
};

const GenerativeApp = () => {
    const gen = useRef(getGenerator()).current;
    const [running, setRunning] = useState(gen.isRunning);
    const [settings, setSettings] = useState({ ...gen.settings });
    const [roles, setRoles] = useState(() =>
        Object.fromEntries(Object.entries(ROLES).map(([role, { volume }]) => [role, { presetName: gen.roles[role].presetName, edited: false, volume }]))
    );
    // What a link can carry: built-in presets as loaded (edits stay local).
    // Generated sounds travel as the role they were made for + their seed.
    const linkPresets = useMemo(
        () => Object.fromEntries(Object.entries(roles).map(([role, { presetName, edited }]) => {
            if (edited) return [role, null];
            const generated = generatedInfo(presetName);
            return [role, generated ? { generated } : presetName];
        })),
        [roles],
    );
    const [generating, setGenerating] = useState({});
    const [randomLevel, setRandomLevel] = useState('reason');
    const [editorRole, setEditorRole] = useState(Object.keys(ROLES)[0]);
    const [mix, setMix] = useState(() => Object.fromEntries(Object.keys(ROLES).map((role) => [role, { mute: false, solo: false }])));
    const [armed, setArmed] = useState(null);
    const live = useLivePlay(gen, armed);
    const changeMix = (role, patch) => {
        gen.setRoleMix(role, patch);
        setMix((m) => ({ ...m, [role]: { ...m[role], ...patch } }));
    };
    const [editorOpen, setEditorOpen] = useState(false);
    const editorRef = useRef(null);
    const editSound = (role) => {
        setEditorRole(role);
        setEditorOpen(true);
        requestAnimationFrame(() => editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    const now = useNowPlaying(gen, running, settings);
    useSettingsInUrl(settings, linkPresets);
    // Reload with the current settings in the address bar (buffer size).
    const reloadKeepingSettings = () => {
        const unsaved = Object.values(roles).some((r) => r.edited);
        if (unsaved && !window.confirm('Changing the buffer reloads the page. Settings are kept, unsaved sound edits are lost. Continue?')) return false;
        window.history.replaceState(null, '', sharePath(gen.settings, linkPresets));
        window.location.reload();
        return true;
    };
    const loadSettings = (next) => {
        gen.setMany(next);
        setSettings({ ...gen.settings });
    };
    const keepCurrent = () => {
        gen.keepCurrent();
        setSettings({ ...gen.settings });
    };
    const update = (key, value) => {
        gen.set(key, value);
        setSettings((s) => ({ ...s, [key]: value }));
    };
    const patchRole = (role, patch) => setRoles((r) => ({ ...r, [role]: { ...r[role], ...patch } }));
    const setVolume = (role, volume) => {
        gen.setRoleVolume(role, volume);
        patchRole(role, { volume });
    };
    const presetLoaded = (role, presetName) => patchRole(role, { presetName, edited: false });
    const loadPreset = (role, name) => {
        if (gen.loadRolePreset(role, name)) presetLoaded(role, name);
    };
    const randomizeField = (key) => loadSettings(randomField(key, gen.settings, randomLevel));
    const chords = progressionLength(settings.progression);
    const randomizePreset = (role) => loadPreset(role, randomPreset(role, roles[role].presetName, randomLevel));
    // A procedural sound (soundGen.js) made for `madeFor`, levelled to that
    // role's default loudness, onto `role`.
    const loadGeneratedSound = async (role, madeFor, seed) => {
        setGenerating((g) => ({ ...g, [role]: true }));
        try {
            const { name, preset } = generateSound(madeFor, seed);
            addGeneratedPreset(name, await levelPreset(preset, madeFor), { role: madeFor, seed });
            loadPreset(role, name);
        } finally {
            setGenerating((g) => ({ ...g, [role]: false }));
        }
    };
    const generateForRole = (role) => loadGeneratedSound(role, role, newSoundSeed());
    useEffect(() => {
        const sounds = linkedSounds;
        linkedSounds = [];
        sounds.forEach(({ target, madeFor, seed }) => loadGeneratedSound(target, madeFor, seed));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Within reason, key and progression are chosen to fit each other: alone,
    // each fits the other's current value; together, the key comes first.
    const randomize = (target, level = randomLevel) => {
        const current = gen.settings;
        const all = target === 'all';
        const music = all || target === 'music';
        let patch = {};
        if (music || target === 'key') patch = randomKey(current, level, Math.random, { matchProgression: !music });
        if (music || target === 'progression') patch = { ...patch, ...randomProgression({ ...current, ...patch }, level) };
        if (all || target === 'arrangement') patch = { ...patch, ...randomArrangement(current, level) };
        if (all || target === 'conductor') patch = { ...patch, ...randomConductor(current, level) };
        if (all || target === 'voices') {
            const names = Object.fromEntries(Object.entries(roles).map(([role, { presetName }]) => [role, presetName]));
            const voices = randomVoices(current, names, level);
            patch = { ...patch, ...voices.settings };
            Object.entries(voices.presets).forEach(([role, name]) => loadPreset(role, name));
        }
        loadSettings(patch);
    };
    const randomizeRole = (role) => {
        const { settings: patch, preset } = randomRole(role, gen.settings, roles[role].presetName, randomLevel);
        loadPreset(role, preset);
        loadSettings(patch);
    };
    const toggle = async () => {
        if (gen.isRunning) {
            gen.stop();
        } else {
            await gen.start();
        }
        setRunning(gen.isRunning);
    };

    return (
        <main className="gen">
            <header className="gen-header">
                <h1>bgm <span>calm procedural music</span></h1>
                <button className="gen-play" onClick={toggle}>{running ? 'Stop' : 'Play'}</button>
                <ShareTools settings={settings} presets={linkPresets} onLoad={loadSettings} />
                <div className="gen-header-tools">
                    <MasterVolume />
                    <AudioMeter />
                    <SettingsMenu generator={gen} onReload={reloadKeepingSettings} />
                </div>
            </header>

            <Randomizer level={randomLevel} onLevel={setRandomLevel} onRandomize={randomize} />

            <ChordTimeline
                generator={gen}
                tracks={<TrackStrip roles={ROLES} presets={Object.fromEntries(Object.entries(roles).map(([role, { presetName, edited }]) => [role, { name: presetName, edited }]))} mix={mix} armed={armed} onMix={changeMix} onArm={setArmed} onEdit={editSound}
                    onRandom={randomizePreset} onGenerate={generateForRole} generating={generating} live={live} />}
            />

            <Panel id="music" title="Music" onRandom={() => randomize('music')}>
                <div className="gen-row">
                    <Field label="Key" onRandom={() => randomizeField('tonic')}>
                        <select value={settings.tonic} onChange={(e) => update('tonic', Number(e.target.value))}>
                            {TONIC_NAMES.map((name, pc) => <option key={name} value={pc}>{name}</option>)}
                        </select>
                    </Field>
                    <Field label="Scale / mode" onRandom={() => randomizeField('mode')}>
                        <select value={settings.mode} onChange={(e) => update('mode', e.target.value)}>
                            {SCALE_FAMILIES.map(({ family, modes }) => (
                                <optgroup key={family} label={family}>
                                    {modes.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </Field>
                </div>
                <div className="gen-row">
                    <Field label="Chords" onRandom={() => loadSettings(randomLength(gen.settings, randomLevel))}>
                        <select value={chords} onChange={(e) => update('progression', progressionForLength(settings, Number(e.target.value)))}>
                            {PROGRESSION_LENGTHS.map((n) => <option key={n} value={n}>{n} chords</option>)}
                        </select>
                    </Field>
                    <Field label="Progression" onRandom={() => randomizeField('progression')} wide>
                        <select value={settings.progression} onChange={(e) => update('progression', Number(e.target.value))}>
                            {progressionsOfLength(chords).map((i) => <option key={i} value={i}>{PROGRESSIONS[i].join(' – ')}</option>)}
                        </select>
                    </Field>
                    <Field label="Bars per chord" onRandom={() => randomizeField('barsPerChord')}>
                        <select value={settings.barsPerChord} onChange={(e) => update('barsPerChord', Number(e.target.value))}>
                            {[1, 2, 4].map((n) => <option key={n}>{n}</option>)}
                        </select>
                    </Field>
                </div>
                <div className="gen-row">
                    <Field label="Time signature" onRandom={() => randomizeField('meter')}>
                        <select value={settings.meter} onChange={(e) => update('meter', e.target.value)}>
                            {Object.entries(METERS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                    </Field>
                    <Field label={`Tempo ${settings.bpm} BPM${METERS[settings.meter].unitsPerBeat > 1 ? ' (♩.)' : ''}`} onRandom={() => randomizeField('bpm')}>
                        <input type="range" min="50" max="110" value={settings.bpm}
                            onChange={(e) => update('bpm', Number(e.target.value))} />
                    </Field>
                </div>
                <NowPlaying now={now} settings={settings} onKeep={keepCurrent} />
            </Panel>

            <Evolution drift={settings.drift} home={{ tonic: settings.tonic, mode: settings.mode }} onChange={(drift) => update('drift', drift)}
                onRandom={() => randomize('conductor')} />

            <Panel id="arrangement" title="Arrangement" onRandom={() => randomize('arrangement')} more={(
                <>
                    <StyleWeights title="Rhythm / pad styles" styles={PAD_STYLES} weights={settings.padWeights}
                        onChange={(w) => update('padWeights', w)} onRandom={() => update('padWeights', randomStyleWeights('pad', randomLevel))} />
                    <StyleWeights title="Bass styles" styles={BASS_STYLES} weights={settings.bassWeights}
                        onChange={(w) => update('bassWeights', w)} onRandom={() => update('bassWeights', randomStyleWeights('bass', randomLevel))} />
                    <fieldset className="gen-weights">
                        <legend>
                            Feel (random, normally distributed per note)
                            <DiceButton label="feel" className="gen-legend-dice"
                                onClick={() => update('humanize', randomArrangement(gen.settings, randomLevel).humanize)} />
                        </legend>
                        <Field label={`Timing ± ${settings.humanize.timing} ms`}>
                            <input type="range" min="0" max="40" step="1" value={settings.humanize.timing}
                                onChange={(e) => update('humanize', { ...settings.humanize, timing: Number(e.target.value) })} />
                        </Field>
                        <Field label={`Velocity ± ${Math.round(settings.humanize.velocity * 100)}%`}>
                            <input type="range" min="0" max="0.25" step="0.01" value={settings.humanize.velocity}
                                onChange={(e) => update('humanize', { ...settings.humanize, velocity: Number(e.target.value) })} />
                        </Field>
                        <Field label={`Pitch ± ${settings.humanize.detune} cents`}>
                            <input type="range" min="0" max="15" step="0.5" value={settings.humanize.detune}
                                onChange={(e) => update('humanize', { ...settings.humanize, detune: Number(e.target.value) })} />
                        </Field>
                    </fieldset>
                </>
            )}>
                <Field label={`Lead activity ${Math.round(settings.leadActivity * 100)}%`}>
                    <input type="range" min="0" max="1" step="0.05" value={settings.leadActivity}
                        onChange={(e) => update('leadActivity', Number(e.target.value))} />
                </Field>
                <label className="gen-check">
                    <input type="checkbox" checked={settings.thinPadUnderLead}
                        onChange={(e) => update('thinPadUnderLead', e.target.checked)} />
                    Thin the pad under the lead
                </label>
            </Panel>

            {Object.entries(ROLES).map(([role, { label }]) => (
                <Panel
                    key={role}
                    id={`voice-${role}`}
                    title={label}
                    className={`gen-panel-role gen-role-${role}`}
                    heading={(
                        <>
                            <i className={`gen-swatch gen-swatch-${role}`} />
                            {label}
                            <RoleButtons role={role} label={label} mix={mix[role]} armed={armed === role} onMix={changeMix} onArm={setArmed} onEdit={editSound} />
                        </>
                    )}
                    onRandom={() => randomizeRole(role)}
                    more={(
                        <>
                            <VoiceControls role={role} voice={settings.voices[role]}
                                onChange={(voice) => update('voices', { ...settings.voices, [role]: voice })} />
                            {role === 'pad' && (
                                <Field label="Chord notes">
                                    <select value={settings.padNotes} onChange={(e) => update('padNotes', Number(e.target.value))}>
                                        {Object.entries(PAD_NOTES).map(([n, text]) => <option key={n} value={n}>{text}</option>)}
                                    </select>
                                </Field>
                            )}
                        </>
                    )}
                >
                    <Field label="Preset" onRandom={() => randomizePreset(role)} onGenerate={() => generateForRole(role)} generating={generating[role]} wide>
                        <PresetPicker value={roles[role].presetName} edited={roles[role].edited} onChange={(name) => loadPreset(role, name)} role={role} />
                    </Field>
                    <Field label={`Volume ${Math.round(roles[role].volume * 100)}%`}>
                        <input type="range" min="0" max="1" step="0.01" value={roles[role].volume}
                            onChange={(e) => setVolume(role, Number(e.target.value))} />
                    </Field>
                </Panel>
            ))}

            <SynthEditor
                generator={gen}
                roles={ROLES}
                role={editorRole}
                onRoleChange={setEditorRole}
                presetName={roles[editorRole].presetName}
                edited={roles[editorRole].edited}
                onPresetLoaded={presetLoaded}
                onEdited={(role) => patchRole(role, { edited: true })}
                open={editorOpen}
                onToggle={() => setEditorOpen((o) => !o)}
                sectionRef={editorRef}
            />
        </main>
    );
};

export default GenerativeApp;
