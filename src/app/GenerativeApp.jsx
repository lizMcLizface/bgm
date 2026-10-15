import React, { useEffect, useMemo, useRef, useState } from 'react';
import Generator, { ROLES } from './Generator';
import { SCALE_FAMILIES, TONIC_NAMES, scaleById } from './theory';
import ChordTimeline from './ChordTimeline';
import { RoleButtons, TrackStrip, useLivePlay } from './Tracks';
import { defaultSettings, shareFromLocation, sharePath, shareUrl, newSeed } from './settings';
import SynthEditor from './editor/SynthEditor';
import PresetPicker from './editor/PresetPicker';
import PROGRESSIONS, { PROGRESSION_LENGTHS, progressionsOfLength } from './progressions';
import {
    PAD_STYLES, BASS_STYLES, styleShares, OCTAVE_LIMITS, OCTAVE_WANDER, COUNTER_MODES, SECTION_MODES, SECTION_LENGTHS,
} from './arranger';
import { DRIFT_MODES } from './conductor';
import { METERS } from './meter';
import {
    RANDOM_LEVELS, RANDOM_LEVEL_HINTS, randomKey, randomProgression, randomConductor, randomVoices, randomField, randomPreset, randomLength,
    randomArrangement, randomStyleWeights, randomRole, progressionLength, progressionForLength, randomAmbience, randomAmbienceShape,
} from './randomize';
import { MasterVolume, SettingsMenu } from './AudioStatus';
import { SleepTimer, Recorder } from './Playback';
import { setupMediaSession, updateMediaSession } from './mediaSession';
import { AMBIENCE_LAYERS, LAYER_PARAMS } from './engine/ambience';
import { COMMON_PARAMS } from './engine/ambienceSynth';
import {
    DiceIcon, SparkIcon, PlayIcon, PauseIcon, ToStartIcon, BarBackIcon, BarForwardIcon, ProgressionBackIcon, ProgressionForwardIcon, LoopIcon,
} from './icons';
import { generateSound, newSoundSeed } from './soundGen';
import { levelPreset } from './engine/loudness';
import { addGeneratedPreset, generatedInfo } from './editor/presetStore';
import { readPref, writePref } from './prefs';
import { seedToPhrase, phraseToSeed } from './phrase';

// One Generator for the page's lifetime; StrictMode's double-mount must
// not build a second set of instruments.
// Settings (and built-in presets) come from a share link when the page was
// opened with one.
// Generated sounds in a link are recreated (and levelled) after mount.
let generator = null;
let linkedSounds = [];
let linkedPhrase = null;
const getGenerator = () => {
    if (!generator) {
        const share = shareFromLocation(window.location);
        generator = new Generator(share ? share.settings : defaultSettings());
        if (share && share.phrase) linkedPhrase = share.phrase;
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

// Dev server: a hot update re-runs this module and builds a new Generator;
// the old one would keep playing (the same piece, offset) with nothing
// left to stop it. Silence and unplug it first.
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (!generator) return;
        generator.stopAll();
        generator.output.disconnect();
        generator.ambienceOut.disconnect();
    });
}

// Keeps the current settings in the address bar - all but the seed: a
// reload keeps them and makes a new piece; Copy link pins the piece.
function useSettingsInUrl(settings, presets) {
    useEffect(() => {
        const id = setTimeout(() => {
            window.history.replaceState(null, '', sharePath(settings, presets, window.location, { seed: false }));
        }, 300);
        return () => clearTimeout(id);
    }, [settings, presets]);
}

// The seed as a pass-phrase (phrase.js): shows the current seed's words;
// typing other words (or any text) and pressing Enter plays that phrase's
// piece from the start. `edited`: settings changed mid-piece, so what
// plays differs from the phrase's piece until it starts over.
const PhraseField = ({ seed, edited, onApply, onRoll, initial }) => {
    const [text, setText] = useState(() => (initial && phraseToSeed(initial) === seed ? initial : seedToPhrase(seed)));
    // a seed from elsewhere (New variation, a link): show its words -
    // unless what was typed stands for it
    useEffect(() => {
        setText((current) => (phraseToSeed(current) === seed ? current : seedToPhrase(seed)));
    }, [seed]);
    const pending = phraseToSeed(text) !== seed;
    const apply = (e) => {
        e.preventDefault();
        const next = phraseToSeed(text);
        if (next === null) setText(seedToPhrase(seed));
        else onApply(next);
    };
    return (
        <section className="gen-menu-section">
            <h3>Phrase</h3>
            <form className="gen-phrase" onSubmit={apply}>
                <input type="text" value={text} spellCheck="false" autoComplete="off" onChange={(e) => setText(e.target.value)}
                    aria-label="Phrase the piece is made from" />
                {pending && <button type="submit">Play this phrase</button>}
                <button type="button" className="gen-dice" onClick={onRoll} title="A new random phrase (⏮ then plays its piece from the start)"
                    aria-label="New random phrase"><DiceIcon /></button>
            </form>
            <small>
                The music is made from this phrase: the same phrase and settings always play the same piece.
                Type any words and press Enter to hear what they make. A new visit or a reload starts with a
                random phrase; a copied link keeps it.
                {!pending && edited ? ' Settings changed while it played - ⏮ plays it from the start again.' : ''}
            </small>
        </section>
    );
};

const RANDOM_TARGETS = [
    ['all', 'Everything'],
    ['key', 'Key & scale'],
    ['progression', 'Progression'],
    ['arrangement', 'Arrangement'],
    ['conductor', 'Evolution'],
    ['voices', 'Voices'],
    ['ambience', 'Ambience'],
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
// The phrase and New variation, then the randomize buttons with how
// random they are (a setting, so a select - not more buttons).
const Randomizer = ({ level, onLevel: setLevel, onRandomize, onNewVariation }) => (
    <section className="gen-randomize">
        <div className="gen-randomize-row">
            <span className="gen-randomize-title">Randomize</span>
            <button type="button" onClick={onNewVariation} title="Same settings, a new phrase - so different random choices (media key: next track)">
                New variation
            </button>
            {RANDOM_TARGETS.map(([target, label]) => (
                <button key={target} type="button" onClick={() => onRandomize(target, level)}>{label}</button>
            ))}
            <label className="gen-random-level">
                <span>How</span>
                <select value={level} onChange={(e) => setLevel(e.target.value)} aria-describedby="gen-random-hint">
                    {Object.entries(RANDOM_LEVELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </label>
            <small id="gen-random-hint" className="gen-random-hint">{RANDOM_LEVEL_HINTS[level]}</small>
        </div>
    </section>
);

const LOOP_NEXT = { off: 'chord', chord: 'progression', progression: 'off' };
const LOOP_LABELS = { off: 'Loop', chord: 'Loop: chord', progression: 'Loop: progression' };

// Play / pause and moving around the piece: to the start, a progression
// or a chord back / on, and looping the chord or progression playing.
const Transport = ({ gen, anyOn, onToggle, onChange }) => {
    const act = (fn) => async () => {
        await fn();
        onChange();
    };
    const atStart = gen.hereBar <= gen.earliestBar && !gen.isRunning;
    const loop = gen.loop ? gen.loop.mode : 'off';
    const button = (label, icon, onClick, disabled = false) => (
        <button type="button" className="gen-icon-button" title={label} aria-label={label} onClick={onClick} disabled={disabled}>{icon}</button>
    );
    return (
        <div className="gen-transport" role="toolbar" aria-label="Playback">
            {button('Back to the start', <ToStartIcon />, act(() => gen.rewind()), atStart && gen.hereBar === 0)}
            {button('Back to the start of this progression, or the one before', <ProgressionBackIcon />, act(() => gen.step('progression', -1)), atStart)}
            {button('Back to the start of this chord, or the one before', <BarBackIcon />, act(() => gen.step('chord', -1)), atStart)}
            <button type="button" className="gen-play" onClick={onToggle} title={`${anyOn ? 'Pause' : 'Play'} (Space)`} aria-label={anyOn ? 'Pause' : 'Play'}>
                {anyOn ? <PauseIcon /> : <PlayIcon />}
            </button>
            {button('Forward one chord', <BarForwardIcon />, act(() => gen.step('chord', 1)))}
            {button('Forward one progression', <ProgressionForwardIcon />, act(() => gen.step('progression', 1)))}
            <button type="button" className={`gen-icon-button gen-loop${loop !== 'off' ? ' is-on' : ''}`} aria-pressed={loop !== 'off'}
                title="Loop the chord playing, then the whole progression, then off" onClick={act(() => gen.setLoop(LOOP_NEXT[loop]))}>
                <LoopIcon />{loop !== 'off' && <span>{loop}</span>}
                <span className="gen-visually-hidden">{LOOP_LABELS[loop]}</span>
            </button>
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

const panLabel = (v) => (Math.abs(v) < 0.05 ? 'centre' : `${v < 0 ? 'left' : 'right'} ${Math.round(Math.abs(v) * 100)}%`);
// What the common params are called on layers where another word fits.
const COMMON_LABELS = { wind: { pan: 'Direction' }, thunder: { pan: 'Direction', width: 'Spread' } };

// One layer's shape: its own params (re-rendered: steps of 0.1), then
// distance, pan and width (live).
const LayerShape = ({ id, label, shape, onChange }) => {
    const set = (key, value) => onChange({ ...shape, [key]: value });
    const names = COMMON_LABELS[id] || {};
    return (
        <fieldset className="gen-weights">
            <legend>{label}</legend>
            {Object.entries(LAYER_PARAMS[id]).map(([key, spec]) => (
                <Field key={key} label={`${spec.label} ${Math.round(shape[key] * 100)}%`}>
                    <input type="range" min="0" max="1" step={spec.render ? 0.1 : 0.05} value={shape[key]} onChange={(e) => set(key, Number(e.target.value))} />
                </Field>
            ))}
            {Object.entries(COMMON_PARAMS).map(([key, spec]) => (
                <Field key={key} label={`${names[key] || spec.label} ${key === 'pan' ? panLabel(shape.pan) : `${Math.round(shape[key] * 100)}%`}`}>
                    <input type="range" min={spec.min} max={spec.max} step={key === 'distance' ? 0.05 : 0.1} value={shape[key]} onChange={(e) => set(key, Number(e.target.value))} />
                </Field>
            ))}
        </fieldset>
    );
};

// The ambient bed (engine/ambience.js): on / off (as beside Play), a volume
// for the whole bed against the music, and a slider per layer to balance
// them; under More options, the shape of each layer that is turned up.
const AmbiencePanel = ({ levels, shape, volume, on, onChange, onShape, onVolume, onToggle, onRandom }) => {
    const active = Object.entries(AMBIENCE_LAYERS).filter(([id]) => levels[id] > 0);
    const more = active.length
        ? active.map(([id, label]) => <LayerShape key={id} id={id} label={label} shape={shape[id]} onChange={(s) => onShape({ ...shape, [id]: s })} />)
        : <p className="gen-hint">Turn a layer up to shape it: intensity, distance, direction and more.</p>;
    return (
    <Panel id="ambience" title="Ambience" onRandom={onRandom} more={more} heading={(
        <>
            Ambience
            <button type="button" className={`gen-part${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onToggle}
                title={PART_TITLE}>{on ? 'On' : 'Off'}</button>
        </>
    )}>
        <Field label={`Ambience volume ${Math.round(volume * 100)}%`}>
            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => onVolume(Number(e.target.value))} />
        </Field>
        <div className="gen-ambience">
            {Object.entries(AMBIENCE_LAYERS).map(([id, label]) => (
                <Field key={id} label={`${label} ${levels[id] > 0 ? `${Math.round(levels[id] * 100)}%` : '· off'}`}>
                    <input type="range" min="0" max="1" step="0.05" value={levels[id]}
                        onChange={(e) => onChange({ ...levels, [id]: Number(e.target.value) })} />
                </Field>
            ))}
        </div>
    </Panel>
    );
};

const PART_TITLE = 'Turn this part on or off. Turning it on also starts playing.';

// Space plays / stops - unless typing, or on a control Space presses itself.
const spaceTarget = (target) => target && (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(target.tagName) || target.isContentEditable);

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
    // music / ambience playing (each can play alone)
    const [running, setRunning] = useState(gen.isRunning);
    const [ambienceOn, setAmbienceOn] = useState(gen.ambienceRunning);
    const anyOn = running || ambienceOn;
    const [paused, setPaused] = useState(false);
    const [, setTick] = useState(0);
    const [saving, setSaving] = useState(null);
    const [settings, setSettings] = useState({ ...gen.settings });
    const [roles, setRoles] = useState(() =>
        Object.fromEntries(Object.keys(ROLES).map((role) => [role, { presetName: gen.roles[role].presetName, edited: false }]))
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
    useEffect(() => {
        const sync = () => {
            setRunning(gen.isRunning);
            setAmbienceOn(gen.ambienceRunning);
            setPaused(gen.paused);
            setTick((n) => n + 1);
        };
        sync(); // after a hot update the state may describe the old generator
        return gen.onRunningChange(sync);
    }, [gen]);
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
        setSettings((s) => ({ ...s, volumes: { ...gen.settings.volumes } }));
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
        if (target === 'ambience') {
            update('ambienceShape', randomAmbienceShape(level));
            changeAmbience(randomAmbience(level));
            return;
        }
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
    const mediaTitle = () => {
        const n = gen.nowPlaying();
        return { title: `${n.keyName} · ${n.bpm} BPM`, artist: 'bgm' };
    };
    // Media controls start inside the click (iOS needs that), before the
    // generator's await.
    const begin = (start) => {
        updateMediaSession({ playing: true, ...mediaTitle() });
        return start();
    };
    // Which parts play is a setting (in the link): playMusic, playAmbience.
    // Play starts those; Stop stops everything and keeps them. While
    // anything plays they follow what is playing, so the link describes
    // what you hear.
    const startPart = (key) => begin(() => (key === 'playMusic' ? gen.start() : gen.startAmbience()));
    const play = () => {
        const { playMusic, playAmbience } = gen.settings;
        if (!playMusic && !playAmbience) update('playMusic', true);
        begin(() => Promise.all([
            (playMusic || !playAmbience) && gen.start(),
            playAmbience && gen.startAmbience(),
        ]));
    };
    const stop = () => gen.stopAll();
    const toggle = () => (gen.anyRunning ? stop() : play());
    // Switching a part off stops it (all off: paused). Switching one on
    // starts it - and, when nothing was playing, everything that is on.
    const setPart = (key, on) => {
        const partRunning = key === 'playMusic' ? gen.isRunning : gen.ambienceRunning;
        if (!on && partRunning) (key === 'playMusic' ? gen.stop() : gen.stopAmbience());
        update(key, on);
        if (on && !partRunning) {
            if (gen.anyRunning) startPart(key);
            else play();
        }
    };
    const togglePart = (key) => setPart(key, !gen.settings[key]);
    // Turning a layer up switches the ambience on - alone, when nothing
    // was playing, so it can be heard without the music.
    const changeAmbience = (levels) => {
        update('ambience', levels);
        if (!Object.values(levels).some((v) => v > 0) || gen.ambienceRunning) return;
        if (!gen.anyRunning) loadSettings({ playMusic: false, playAmbience: true });
        else update('playAmbience', true);
        startPart('playAmbience');
    };
    // New variation, and back through earlier ones (media keys: next / previous track).
    const seeds = useRef([]);
    const newVariation = () => {
        seeds.current.push(gen.settings.seed);
        loadSettings({ seed: newSeed() });
    };
    // A phrase's piece, from its start.
    const playPhrase = (seed) => {
        loadSettings({ seed });
        gen.rewind();
    };
    const previousVariation = () => {
        if (seeds.current.length) loadSettings({ seed: seeds.current.pop() });
    };
    const handlers = useRef({});
    handlers.current = { play, stop, toggle, newVariation, previousVariation };
    useEffect(() => {
        setupMediaSession({
            play: () => handlers.current.play(),
            stop: () => handlers.current.stop(),
            next: () => handlers.current.newVariation(),
            previous: () => handlers.current.previousVariation(),
        });
        const onKey = (e) => {
            if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || spaceTarget(e.target)) return;
            e.preventDefault();
            handlers.current.toggle();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => {
        updateMediaSession({ playing: anyOn, ...mediaTitle() });
    }, [anyOn, now]); // eslint-disable-line react-hooks/exhaustive-deps
    const fileName = (minutes) => {
        const key = `${TONIC_NAMES[settings.tonic]} ${scaleById(settings.mode).name}`;
        const slug = key.toLowerCase().replace(/♯|#/g, 's').replace(/♭/g, 'b').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `bgm-${slug}-${settings.bpm}bpm-${minutes}min.wav`;
    };
    // The second lead's panel and track show only while it plays.
    const shownRoles = Object.fromEntries(Object.entries(ROLES).filter(([role]) => role !== 'counter' || settings.counter.mode !== 'off'));

    return (
        <main className="gen">
            <header className="gen-header">
                <h1>bgm <span>calm procedural music</span></h1>
                <Transport gen={gen} anyOn={anyOn} onToggle={toggle} onChange={() => setTick((n) => n + 1)} />
                <div className="gen-parts" role="group" aria-label="What Play plays">
                    <button type="button" className={`gen-part${settings.playMusic ? ' is-on' : ''}`} aria-pressed={settings.playMusic}
                        onClick={() => togglePart('playMusic')} title={PART_TITLE}>Music</button>
                    <button type="button" className={`gen-part${settings.playAmbience ? ' is-on' : ''}`} aria-pressed={settings.playAmbience}
                        onClick={() => togglePart('playAmbience')} title={PART_TITLE}>Ambience</button>
                </div>
                <SleepTimer generator={gen} running={anyOn} />
                <div className="gen-header-tools">
                    <MasterVolume />
                    <SettingsMenu generator={gen} onReload={reloadKeepingSettings} link={() => shareUrl(gen.settings, linkPresets)} saving={saving}
                        phrase={<PhraseField seed={settings.seed} edited={gen.editedSinceStart} onApply={playPhrase} onRoll={newVariation} initial={linkedPhrase} />}>
                        <Recorder generator={gen} fileName={fileName} onProgress={setSaving} />
                    </SettingsMenu>
                </div>
            </header>


            <ChordTimeline
                generator={gen}
                tracks={<TrackStrip roles={shownRoles} presets={Object.fromEntries(Object.entries(roles).map(([role, { presetName, edited }]) => [role, { name: presetName, edited }]))} mix={mix} armed={armed} onMix={changeMix} onArm={setArmed} onEdit={editSound}
                    onRandom={randomizePreset} onGenerate={generateForRole} generating={generating} live={live} />}
            />

            <Randomizer level={randomLevel} onLevel={setRandomLevel} onRandomize={randomize} onNewVariation={newVariation} />

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
                    <Field label="Section length">
                        <select value={settings.sections.phrases} disabled={settings.sections.mode === 'off'}
                            onChange={(e) => update('sections', { ...settings.sections, phrases: Number(e.target.value) })}>
                            {SECTION_LENGTHS.map((n) => <option key={n} value={n}>{n} phrases ({n * 4} bars)</option>)}
                        </select>
                    </Field>
                    {['answer', 'line'].includes(settings.counter.mode) && (
                        <Field label={`Second lead ${settings.counter.mode === 'answer' ? 'answers' : 'activity'} ${Math.round(settings.counter.activity * 100)}%`}>
                            <input type="range" min="0" max="1" step="0.05" value={settings.counter.activity}
                                onChange={(e) => update('counter', { ...settings.counter, activity: Number(e.target.value) })} />
                        </Field>
                    )}
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
                <Field label="Second lead">
                    <select value={settings.counter.mode} onChange={(e) => update('counter', { ...settings.counter, mode: e.target.value })}>
                        {Object.entries(COUNTER_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                </Field>
                <Field label="Sections">
                    <select value={settings.sections.mode} title="Intro, build, full and breakdown: voices come and go every few phrases"
                        onChange={(e) => update('sections', { ...settings.sections, mode: e.target.value })}>
                        {Object.entries(SECTION_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                </Field>
                <label className="gen-check">
                    <input type="checkbox" checked={settings.thinPadUnderLead}
                        onChange={(e) => update('thinPadUnderLead', e.target.checked)} />
                    Thin the pad under the lead
                </label>
            </Panel>

            <AmbiencePanel levels={settings.ambience} shape={settings.ambienceShape} onShape={(s) => update('ambienceShape', s)}
                volume={settings.ambienceVolume} on={settings.playAmbience}
                onChange={changeAmbience} onVolume={(v) => update('ambienceVolume', v)} onToggle={() => togglePart('playAmbience')}
                onRandom={() => randomize('ambience')} />

            {Object.entries(shownRoles).map(([role, { label }]) => (
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
                    <Field label={`Volume ${Math.round(settings.volumes[role] * 100)}%`}>
                        <input type="range" min="0" max="1" step="0.01" value={settings.volumes[role]}
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

            <footer className="gen-footer">
                <p>
                    <a href="https://github.com/lizMcLizface/bgm" target="_blank" rel="noopener noreferrer">Source code on GitHub</a>
                    {' · '}MIT licence · made by lizMcLizface
                </p>
                <p>
                    The music is yours: it is generated, so no rights are claimed on anything you play, record or
                    save here - use it however you like, in videos, streams or anything else. A credit
                    (calmbgm.com) is appreciated, never required.
                </p>
                <p>
                    Every sound is synthesised live in your browser with the Web Audio API - no samples or
                    recordings, rain and thunder included.
                </p>
                <p>
                    No accounts, cookies, ads or analytics. Your preferences (volume, theme, buffer size, sleep
                    timer) and any sounds you save stay in this browser&apos;s local storage; a share link carries
                    the music settings in its address. The site is hosted on GitHub Pages, which keeps the usual
                    server logs.
                </p>
                <p>
                    Provided as is, without warranty of any kind. Mind your volume, especially with headphones.
                </p>
            </footer>
        </main>
    );
};

export default GenerativeApp;
