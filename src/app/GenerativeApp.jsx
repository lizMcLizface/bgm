import React, { useEffect, useMemo, useRef, useState } from 'react';
import Generator, { ROLES, PERC_ROLE } from './Generator';
import { DRUM_STYLES, DRUM_KITS, DRUMS, DRUM_LABELS, DRUM_PARAMS, randomDrums } from './percussion';
import { SCALE_FAMILIES, TONIC_NAMES, CHORD_COLOURS, scaleById } from './theory';
import ChordTimeline from './ChordTimeline';
import { RoleButtons, TrackStrip, useLivePlay, DRUM_KEY_HINT } from './Tracks';
import { defaultSettings, shareFromLocation, sharePath, shareUrl, newSeed } from './settings';
import SynthEditor from './editor/SynthEditor';
import PresetPicker from './editor/PresetPicker';
import PROGRESSIONS, { PROGRESSION_LENGTHS, progressionsOfLength } from './progressions';
import {
    PAD_STYLES, BASS_STYLES, PULSE_PATTERNS, ARP_PATTERNS, CHORD_DIRECTIONS, styleShares, OCTAVE_LIMITS, OCTAVE_WANDER, COUNTER_MODES, SECTION_MODES, SECTION_LENGTHS,
    PEDAL_MODES, SPREADS, LEAD_SCALES, LEAD_ENDINGS,
} from './arranger';
import { DRIFT_MODES, BPM_LIMITS } from './conductor';
import { METERS } from './meter';
import {
    RANDOM_LEVELS, RANDOM_LEVEL_HINTS, randomKey, randomProgression, randomConductor, randomVoices, randomField, randomRelativeKey, relativeKeys, randomPreset, randomLength,
    randomArrangement, randomStyleWeights, randomRole, progressionLength, progressionForLength, randomAmbience, randomAmbienceShape,
    randomPadMotion, randomSwing, randomColour,
} from './randomize';
import Backdrop, { backdropSupported, BACKDROP_DEFAULTS, shuffleColours } from './Backdrop';
import { MasterVolume, SettingsMenu, AudioMenu, VisualMenu } from './AudioStatus';
import { SleepTimer, Recorder } from './Playback';
import { sceneSettings, sceneGroup, buildSetup, parseSetup, sceneBySlug, sceneSlug, presetFromSearch, introFromSearch, SCENES, SCENE_CATEGORIES } from './scenes';
import PresetBrowser from './PresetBrowser';
import { saveUserScene, deleteUserScene, isUserScene } from './setupStore';
import { ROLE_PRESETS } from './presets';
import { setupMediaSession, updateMediaSession } from './mediaSession';
import { AMBIENCE_LAYERS, LAYER_PARAMS } from './engine/ambience';
import { COMMON_PARAMS } from './engine/ambienceSynth';
import {
    DiceIcon, RotateIcon, SparkIcon, PlayIcon, PauseIcon, ToStartIcon, BarBackIcon, BarForwardIcon, ProgressionBackIcon, ProgressionForwardIcon, LoopIcon, MusicIcon, AmbienceIcon, ChevronUpIcon, ChevronDownIcon, TimelineIcon,
} from './icons';
import { newSoundSeed } from './soundGen';
import { soundFrom, SOUND_KINDS, GENERATOR_V2 } from './soundGenV2';
import { levelPreset } from './engine/loudness';
import { addGeneratedPreset, addSetupPreset, findPreset, generatedInfo } from './editor/presetStore';
import PRESET_DEFAULTS from './engine/presetDefaults';
import { readPref, writePref } from './prefs';
import { seedToPhrase, phraseToSeed } from './phrase';
import { WANDER_ROLES, WANDER_LIMITS, WANDER_MODES, AMBIENCE_WANDER_LIMITS } from './engine/wander';
import Tour, { tourSeen } from './Tour';
import { STAGES, STAGE_KEY, LAST_STAGE } from './tourSteps';

// One Generator for the page's lifetime; StrictMode's double-mount must
// not build a second set of instruments.
// Settings (and built-in presets) come from a share link when the page was
// opened with one.
// Generated sounds in a link are recreated (and levelled) after mount.
let generator = null;
let linkedSounds = [];
let linkedPhrase = null;
// A link to a built-in preset, ?preset=rainy-day-chickens-inside: the page opens on it (a new piece
// each visit, or the one a phrase= names). Settings in the link win over it.
let linkedScene = null;
const getGenerator = () => {
    if (!generator) {
        const share = shareFromLocation(window.location);
        const query = new URLSearchParams(window.location.search);
        const hasSettings = ['m', 'v', 'a', 's'].some((key) => query.has(key)) || window.location.hash.includes('s=');
        linkedScene = hasSettings ? null : sceneBySlug(presetFromSearch(window.location.search));
        if (linkedScene) {
            const phrase = new URLSearchParams(window.location.search).get('phrase');
            const seed = phrase ? phraseToSeed(phrase) : null;
            generator = new Generator(sceneSettings(linkedScene, seed === null ? undefined : seed));
            if (phrase && seed !== null) linkedPhrase = phrase;
            if (sceneGroup(linkedScene) !== 'ambience') {
                Object.entries(linkedScene.voices).forEach(([role, voice]) => {
                    if (typeof voice === 'string') generator.loadRolePreset(role, voice);
                });
            }
        } else {
            generator = new Generator(share ? share.settings : defaultSettings());
        }
        if (share && share.phrase) linkedPhrase = share.phrase;
        if (share) {
            Object.entries(share.presets).forEach(([role, preset]) => {
                if (preset.generated) linkedSounds.push({ target: role, info: preset.generated });
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
// While a built-in preset is playing as it is, the address is just that preset's name
// (?preset=...), a link anyone can read; once anything is changed it is the settings.
// With the short intro on, the address says so too (intro=short), so a link carries it.
const withIntro = (path, shortIntro) => (shortIntro ? `${path}${path.includes('?') ? '&' : '?'}intro=short` : path);
function useSettingsInUrl(settings, presets, presetSlug, shortIntro) {
    useEffect(() => {
        const id = setTimeout(() => {
            window.history.replaceState(null, '', withIntro(presetSlug
                ? `${window.location.pathname}?preset=${presetSlug}`
                : sharePath(settings, presets, window.location, { seed: false }), shortIntro));
        }, 300);
        return () => clearTimeout(id);
    }, [settings, presets, presetSlug, shortIntro]);
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
        <section className={`gen-panel ${className}`} data-tour={id}>
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
                <select value={level} title={RANDOM_LEVEL_HINTS[level]} onChange={(e) => setLevel(e.target.value)}>
                    {Object.entries(RANDOM_LEVELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </label>
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
            {button('Back to the start of this progression, or the one before (Shift + ←)', <ProgressionBackIcon />, act(() => gen.step('progression', -1)), atStart)}
            {button('Back to the start of this chord, or the one before (←)', <BarBackIcon />, act(() => gen.step('chord', -1)), atStart)}
            <button type="button" className="gen-play" onClick={onToggle} title={`${anyOn ? 'Pause' : 'Play'} (Space)`} aria-label={anyOn ? 'Pause' : 'Play'}>
                {anyOn ? <PauseIcon /> : <PlayIcon />}
            </button>
            {button('Forward one chord (→)', <BarForwardIcon />, act(() => gen.step('chord', 1)))}
            {button('Forward one progression (Shift + →)', <ProgressionForwardIcon />, act(() => gen.step('progression', 1)))}
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
const Field = ({ label, onRandom, onRelative, onGenerate, generating, wide, children }) => (
    <label className={`gen-field${wide ? ' gen-field-wide' : ''}`}>
        <span>{label}</span>
        {onRandom ? (
            <span className="gen-field-row">
                {children}
                <button type="button" className="gen-dice" title="Randomize this" aria-label={`Random ${label}`}
                    onClick={(e) => { e.preventDefault(); onRandom(); }}><DiceIcon /></button>
                {onRelative && (
                    <button type="button" className="gen-dice" title="Same notes, a different key and scale (C major to A minor, D Dorian ...)"
                        aria-label="Same notes, different key and scale" onClick={(e) => { e.preventDefault(); onRelative(); }}><RotateIcon /></button>
                )}
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
const StyleWeights = ({ title, styles, weights, onChange, onRandom, disabled }) => {
    const shares = styleShares(weights);
    return (
        <fieldset className="gen-weights" disabled={disabled}>
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

// Above the voices: new sounds for every voice at once, sharing one
// character - at random, or from a phrase (the same words, the same
// sounds). A random set shows its own three-word phrase.
const SOUND_SEEDS = { count: 3, limit: 2 ** 24 };
const SoundsBar = ({ onGenerate, generating }) => {
    const [text, setText] = useState('');
    const make = (ensemble, phrase) => {
        setText(phrase);
        onGenerate(ensemble);
    };
    const random = () => {
        const ensemble = newSoundSeed();
        make(ensemble, seedToPhrase(ensemble, SOUND_SEEDS.count));
    };
    const fromPhrase = (e) => {
        e.preventDefault();
        const ensemble = phraseToSeed(text, SOUND_SEEDS);
        if (ensemble !== null) make(ensemble, text);
    };
    return (
        <section className="gen-sounds">
            <span className="gen-randomize-title">Sounds</span>
            <button type="button" className="gen-new-sounds" onClick={random} disabled={generating}
                title="New sounds for every voice, made to go together">
                <SparkIcon /> New sounds
            </button>
            <form className="gen-phrase" onSubmit={fromPhrase}>
                <input type="text" value={text} spellCheck="false" autoComplete="off" placeholder="or type a phrase, e.g. velvet midnight"
                    onChange={(e) => setText(e.target.value)} aria-label="Phrase to make the sounds from" />
                <button type="submit" disabled={generating || phraseToSeed(text, SOUND_SEEDS) === null}>Make these sounds</button>
            </form>
            <small className="gen-random-hint">
                Every voice gets a new sound, all sharing one character. The same phrase always makes the same sounds.
            </small>
        </section>
    );
};

// The ambient bed (engine/ambience.js): on / off (as beside Play), a volume
// for the whole bed against the music, and a slider per layer to balance
// them; under More options, the shape of each layer that is turned up.
const AmbiencePanel = ({ levels, shape, volume, on, wander, onChange, onShape, onVolume, onWander, onToggle, onRandom }) => {
    const active = Object.entries(AMBIENCE_LAYERS).filter(([id]) => levels[id] > 0);
    const more = active.length
        ? active.map(([id, label]) => <LayerShape key={id} id={id} label={label} shape={shape[id]} onChange={(s) => onShape({ ...shape, [id]: s })} />)
        : <p className="gen-hint">Turn a layer up to shape it: intensity, distance, direction and more.</p>;
    const setWander = (patch) => onWander({ ...wander, ...patch });
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
        <Field label="Level drift">
            <select value={wander.mode} onChange={(e) => setWander({ mode: e.target.value })}
                title="How the bed's level slowly moves: smooth waves, or a random walk that stays within its limits">
                {Object.entries(WANDER_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
        </Field>
        <Field label={`Whole bed ± ${pct(wander.total)}`}>
            <input type="range" {...AMBIENCE_WANDER_LIMITS.total} value={wander.total} onChange={(e) => setWander({ total: Number(e.target.value) })} />
        </Field>
        <Field label={`Each layer ± ${pct(wander.layers)}`}>
            <input type="range" {...AMBIENCE_WANDER_LIMITS.layers} value={wander.layers} onChange={(e) => setWander({ layers: Number(e.target.value) })} />
        </Field>
        <Field label={`Drift round takes ${wander.period < 90 ? `${wander.period} s` : `${(wander.period / 60).toFixed(1)} min`}`}>
            <input type="range" {...AMBIENCE_WANDER_LIMITS.period} value={wander.period} onChange={(e) => setWander({ period: Number(e.target.value) })} />
        </Field>
    </Panel>
    );
};

const PART_TITLE = 'Turn this part on or off. Turning it on also starts playing.';

// Space plays / stops - unless typing, or on a control Space presses itself.
const spaceTarget = (target) => target && (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(target.tagName) || target.isContentEditable);
// Typing targets only: [ and ] still work with a button focused (the preset browser's trigger is one).
const typingTarget = (target) => target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable);

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

const pct = (v) => `${Math.round(v * 100)}%`;

// The pad's playing (arranger.js): its styles' shares, the patterns each
// style picks from, and how it moves - all per phrase. A style's patterns
// are greyed out while that style never plays.
const PadPlaying = ({ settings, update, level }) => {
    const motion = settings.padMotion;
    const setMotion = (key, value) => update('padMotion', { ...motion, [key]: value });
    return (
        <>
            <StyleWeights title="Styles" styles={PAD_STYLES} weights={settings.padWeights}
                onChange={(w) => update('padWeights', w)} onRandom={() => update('padWeights', randomStyleWeights('pad', level))} />
            <StyleWeights title="Pulse patterns" styles={PULSE_PATTERNS} weights={settings.pulseWeights}
                disabled={styleShares(settings.padWeights).pulse === 0}
                onChange={(w) => update('pulseWeights', w)} onRandom={() => update('pulseWeights', randomStyleWeights('pulse', level))} />
            <StyleWeights title="Arpeggio patterns" styles={ARP_PATTERNS} weights={settings.arpWeights}
                disabled={styleShares(settings.padWeights).arpeggio === 0}
                onChange={(w) => update('arpWeights', w)} onRandom={() => update('arpWeights', randomStyleWeights('arpeggio', level))} />
            <StyleWeights title="Rolled and stacked chords" styles={CHORD_DIRECTIONS} weights={settings.directionWeights}
                disabled={styleShares(settings.padWeights).rolled + styleShares(settings.padWeights).stacked === 0}
                onChange={(w) => update('directionWeights', w)} onRandom={() => update('directionWeights', randomStyleWeights('direction', level))} />
            <fieldset className="gen-weights">
                <legend>
                    Movement
                    <DiceButton label="movement" className="gen-legend-dice" onClick={() => update('padMotion', randomPadMotion(level))} />
                </legend>
                <Field label={`Register lean per phrase · ${pct(motion.lean)}`}>
                    <input type="range" min="0" max="1" step="0.05" value={motion.lean}
                        title="How often the chords move a little lower or higher in the register (inversions; 0: always the middle)"
                        onChange={(e) => setMotion('lean', Number(e.target.value))} />
                </Field>
                <Field label={`Fast arpeggios · ${pct(motion.fast)}`}>
                    <input type="range" min="0" max="1" step="0.05" value={motion.fast}
                        title="Chance an arpeggio phrase runs twice as fast while the lead rests (not in 6/8)"
                        onChange={(e) => setMotion('fast', Number(e.target.value))} />
                </Field>
                <Field label={`Phrase swell · ±${pct(motion.swell)}`}>
                    <input type="range" min="0" max="0.2" step="0.01" value={motion.swell}
                        title="How much the level rises toward each phrase's third bar and settles after"
                        onChange={(e) => setMotion('swell', Number(e.target.value))} />
                </Field>
            </fieldset>
        </>
    );
};

// Colour: an extra layer of mood over the key and progression - chords that
// are suspended, borrowed or spread wide, a held bass note, and how the lead
// moves and ends. Each is off or neutral by default.
const percent = (v) => `${Math.round(v * 100)}%`;
const ColourPanel = ({ settings, update, onRandom }) => {
    const { chordColour: colour, pedal } = settings;
    return (
        <Panel id="colour" title="Colour" onRandom={onRandom}>
            <div className="gen-row">
                <Field label="Chord colour">
                    <select value={colour.mode} onChange={(e) => update('chordColour', { ...colour, mode: e.target.value })}>
                        {Object.entries(CHORD_COLOURS).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
                    </select>
                </Field>
                <Field label={colour.mode === 'plain' ? 'Colour on: none' : `Colour on ${percent(colour.amount)} of chords`}>
                    <input type="range" min="0" max="1" step="0.05" value={colour.amount} disabled={colour.mode === 'plain'}
                        title="Which chords is set by the seed, so a new variation colours different ones"
                        onChange={(e) => update('chordColour', { ...colour, amount: Number(e.target.value) })} />
                </Field>
                <Field label={settings.chordBorrow ? `Borrowed chords on ${percent(settings.chordBorrow)}` : 'Borrowed chords: none'}>
                    <input type="range" min="0" max="1" step="0.05" value={settings.chordBorrow}
                        title="Chords from the parallel mode: the major IV or V in a minor key, the minor iv or flat VI / VII in a major one"
                        onChange={(e) => update('chordBorrow', Number(e.target.value))} />
                </Field>
                <Field label="Pad voicing">
                    <select value={settings.chordSpread} onChange={(e) => update('chordSpread', e.target.value)}>
                        {Object.entries(SPREADS).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
                    </select>
                </Field>
            </div>
            <div className="gen-row">
                <Field label="Bass pedal note">
                    <select value={pedal.mode} onChange={(e) => update('pedal', { ...pedal, mode: e.target.value })}>
                        {Object.entries(PEDAL_MODES).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
                    </select>
                </Field>
                <Field label={pedal.mode === 'off' ? 'Pedal in: none' : `Pedal in ${percent(pedal.amount)} of phrases`}>
                    <input type="range" min="0" max="1" step="0.05" value={pedal.amount} disabled={pedal.mode === 'off'}
                        title="The bass holds the key's tonic (or fifth) through the phrase while the chords move above it"
                        onChange={(e) => update('pedal', { ...pedal, amount: Number(e.target.value) })} />
                </Field>
                <Field label="Lead notes">
                    <select value={settings.leadScale} onChange={(e) => update('leadScale', e.target.value)}>
                        {Object.entries(LEAD_SCALES).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
                    </select>
                </Field>
                <Field label={`Lead leaps: ${settings.leadLeaps < 0.4 ? 'stepwise' : settings.leadLeaps > 0.6 ? 'leapy' : 'as drawn'}`}>
                    <input type="range" min="0" max="1" step="0.05" value={settings.leadLeaps}
                        onChange={(e) => update('leadLeaps', Number(e.target.value))} />
                </Field>
                <Field label={settings.leadRepeat ? `Lead repeats its tune ${percent(settings.leadRepeat)}` : 'Lead repeats its tune: never'}>
                    <input type="range" min="0" max="1" step="0.05" value={settings.leadRepeat}
                        title="How often a phrase with lead plays the previous phrase's tune again"
                        onChange={(e) => update('leadRepeat', Number(e.target.value))} />
                </Field>
                <Field label="Phrase endings">
                    <select value={settings.leadEnding} onChange={(e) => update('leadEnding', e.target.value)}>
                        {Object.entries(LEAD_ENDINGS).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
                    </select>
                </Field>
            </div>
        </Panel>
    );
};

// Feel (Generator.humanize, meter.js swingEvents): swing up front, the
// per-note looseness under More options.
const FeelPanel = ({ humanize, swing, update, onRandomHumanize, onRandom }) => (
    <Panel id="feel" title="Feel" onRandom={onRandom} more={(
        <fieldset className="gen-weights">
            <legend>
                Looseness (random, normally distributed per note)
                <DiceButton label="looseness" className="gen-legend-dice" onClick={onRandomHumanize} />
            </legend>
            <Field label={`Timing ± ${humanize.timing} ms`}>
                <input type="range" min="0" max="40" step="1" value={humanize.timing}
                    onChange={(e) => update('humanize', { ...humanize, timing: Number(e.target.value) })} />
            </Field>
            <Field label={`Velocity ± ${Math.round(humanize.velocity * 100)}%`}>
                <input type="range" min="0" max="0.25" step="0.01" value={humanize.velocity}
                    onChange={(e) => update('humanize', { ...humanize, velocity: Number(e.target.value) })} />
            </Field>
            <Field label={`Pitch ± ${humanize.detune} cents`}>
                <input type="range" min="0" max="15" step="0.5" value={humanize.detune}
                    onChange={(e) => update('humanize', { ...humanize, detune: Number(e.target.value) })} />
            </Field>
        </fieldset>
    )}>
        <Field label={swing ? `Swing ${Math.round(swing * 100)}%` : 'Swing: straight'}>
            <input type="range" min="0" max="0.6" step="0.05" value={swing}
                title="Notes on the second half of a beat come late, toward a triplet (not in 6/8)"
                onChange={(e) => update('swing', Number(e.target.value))} />
        </Field>
    </Panel>
);

// Wander (engine/wander.js): each voice's pan, volume, filter and pitch
// drift on slow waves, a minute or so a round, instead of jumping at
// progression changes. The pan range is shared; each voice has a switch.
const WANDER_LABELS = { lead: 'Lead', counter: 'Second lead', pad: 'Rhythm / pad', bass: 'Bass / support', perc: 'Percussion' };
const panText = (v) => (Math.abs(v) < 0.025 ? 'centre' : `${v < 0 ? 'left' : 'right'} ${Math.round(Math.abs(v) * 100)}%`);
const WanderPanel = ({ wander, shown, update }) => {
    const set = (patch) => update('wander', { ...wander, ...patch });
    const { pan } = wander;
    return (
        <Panel id="wander" title="Wander">
            <Field label="Kind of drift">
                <select value={wander.mode} onChange={(e) => set({ mode: e.target.value })}
                    title="Smooth waves go out and back; a random walk wanders up and down by chance, normally spread around the centre and never past the limits">
                    {Object.entries(WANDER_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </Field>
            <Field label={`Round takes ${wander.period < 90 ? `${wander.period} s` : `${(wander.period / 60).toFixed(1)} min`}`}>
                <input type="range" {...WANDER_LIMITS.period} value={wander.period}
                    title="Roughly how long a voice takes to drift out and back; each voice and each kind of drift runs a little differently"
                    onChange={(e) => set({ period: Number(e.target.value) })} />
            </Field>
            <Field label={`Pan from ${panText(pan.min)}`}>
                <input type="range" min={-1} max={1} step={WANDER_LIMITS.pan.step} value={pan.min}
                    onChange={(e) => { const min = Number(e.target.value); set({ pan: { min, max: Math.max(min, pan.max) } }); }} />
            </Field>
            <Field label={`Pan to ${panText(pan.max)}`}>
                <input type="range" min={-1} max={1} step={WANDER_LIMITS.pan.step} value={pan.max}
                    onChange={(e) => { const max = Number(e.target.value); set({ pan: { min: Math.min(max, pan.min), max } }); }} />
            </Field>
            <Field label={`Volume ± ${pct(wander.volume)}`}>
                <input type="range" {...WANDER_LIMITS.volume} value={wander.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
            </Field>
            <Field label={`Filter ± ${wander.filter.toFixed(2)} octaves`}>
                <input type="range" {...WANDER_LIMITS.filter} value={wander.filter} onChange={(e) => set({ filter: Number(e.target.value) })} />
            </Field>
            <Field label={`Pitch ± ${wander.pitch} cents`}>
                <input type="range" {...WANDER_LIMITS.pitch} value={wander.pitch} onChange={(e) => set({ pitch: Number(e.target.value) })} />
            </Field>
            <fieldset className="gen-weights">
                <legend>Voices that wander</legend>
                {WANDER_ROLES.filter((role) => shown.includes(role)).map((role) => (
                    <label key={role} className="gen-check">
                        <input type="checkbox" checked={wander.voices[role]}
                            onChange={(e) => set({ voices: { ...wander.voices, [role]: e.target.checked } })} />
                        {WANDER_LABELS[role]}
                    </label>
                ))}
            </fieldset>
        </Panel>
    );
};

// Percussion (percussion.js, engine/drumKit.js): what plays - style,
// activity, variation - and its level; under More options the room and
// each drum's sound (on, level, tone, length).
const DRUM_VALUE = { level: pct, tone: (v) => (v === 0 ? 'neutral' : v < 0 ? `darker ${Math.round(-v * 100)}%` : `brighter ${Math.round(v * 100)}%`), decay: (v) => `${v.toFixed(2)}x` };
const PercussionPanel = ({ drums, kit, volume, mix, armed, onArm, onDrums, onKit, onVolume, onMix, onAudition }) => {
    const on = drums.style !== 'off';
    const setDrum = (name, patch) => onKit({ ...kit, [name]: { ...kit[name], ...patch } });
    const more = (
        <>
            <Field label={`Room ${pct(kit.room)}`}>
                <input type="range" min="0" max="0.5" step="0.05" value={kit.room} onChange={(e) => onKit({ ...kit, room: Number(e.target.value) })} />
            </Field>
            {DRUMS.map((name) => (
                <fieldset key={name} className="gen-weights gen-drum">
                    <legend>
                        <label className="gen-check">
                            <input type="checkbox" checked={kit[name].on} onChange={(e) => setDrum(name, { on: e.target.checked })} />
                            {DRUM_LABELS[name]}
                        </label>
                    </legend>
                    {Object.entries(DRUM_PARAMS).map(([key, { min, max, step, label }]) => (
                        <Field key={key} label={`${label} ${DRUM_VALUE[key](kit[name][key])}`}>
                            <input type="range" min={min} max={max} step={step} value={kit[name][key]} disabled={!kit[name].on}
                                onChange={(e) => setDrum(name, { [key]: Number(e.target.value) })} />
                        </Field>
                    ))}
                </fieldset>
            ))}
        </>
    );
    return (
        <Panel
            id="percussion"
            title="Percussion"
            className="gen-panel-role gen-role-perc"
            heading={(
                <>
                    <i className="gen-swatch gen-swatch-perc" />
                    Percussion
                    <RoleButtons role="perc" label="Percussion" mix={mix} armed={armed} onMix={onMix} onArm={onArm} />
                </>
            )}
            onRandom={() => onDrums(randomDrums())}
            more={more}
        >
            <Field label="Style">
                <select value={drums.style} title="Soft synthesised percussion; sections bring it in and out"
                    onChange={(e) => onDrums({ ...drums, style: e.target.value })}>
                    {Object.entries(DRUM_STYLES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </Field>
            <Field label="Kit">
                <select value={drums.kit || 'felt'} title="Felt and brushes, or a snare, a punchy kick and a bright hat in their places"
                    onChange={(e) => onDrums({ ...drums, kit: e.target.value })}>
                    {Object.entries(DRUM_KITS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </Field>
            <Field label={`Volume ${pct(volume)}`}>
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => onVolume(Number(e.target.value))} />
            </Field>
            <Field label={`Activity ${pct(drums.activity)}`}>
                <input type="range" min="0" max="1" step="0.05" value={drums.activity} disabled={!on}
                    title="Ghost notes, extra kicks and fills" onChange={(e) => onDrums({ ...drums, activity: Number(e.target.value) })} />
            </Field>
            <Field label={`Variation ${pct(drums.variation)}`}>
                <input type="range" min="0" max="1" step="0.05" value={drums.variation} disabled={!on}
                    title="How much the grooves change from phrase to phrase and the hits from one to the next (0: the same every bar)"
                    onChange={(e) => onDrums({ ...drums, variation: Number(e.target.value) })} />
            </Field>
            <Field label={`Sprinkle ${pct(drums.sprinkle)}`}>
                <input type="range" min="0" max="1" step="0.05" value={drums.sprinkle} disabled={!on}
                    title="Crashes where sections begin, and now and then a bell, ride or tom pickup, scattered over any groove"
                    onChange={(e) => onDrums({ ...drums, sprinkle: Number(e.target.value) })} />
            </Field>
            <div className="gen-field">
                <button type="button" className="gen-keys-button" onClick={onAudition}>Hear the kit</button>
                {armed && <small>Keys {DRUM_KEY_HINT}</small>}
            </div>
        </Panel>
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
    // The kind of sound ✦ makes per role ('any': the seed decides).
    const [soundKinds, setSoundKinds] = useState(() => Object.fromEntries(Object.keys(ROLES).map((role) => [role, 'any'])));
    const [randomLevel, setRandomLevel] = useState('reason');
    const [editorRole, setEditorRole] = useState(Object.keys(ROLES)[0]);
    const [mix, setMix] = useState(() => Object.fromEntries([...Object.keys(ROLES), 'perc'].map((role) => [role, { mute: gen.roles[role].mute, solo: false }])));
    const [armed, setArmed] = useState(null);
    // Which voice's sound picker is open (null: none).
    const [pickerRole, setPickerRole] = useState(null);
    // Opening a voice's picker arms the keyboard for it (so the sounds can be tried by playing),
    // and closing it puts the arming back as it was.
    const armedBefore = useRef(null);
    const choosePicker = (role) => {
        if (role && pickerRole === null) armedBefore.current = armed;
        if (role) setArmed(role);
        else if (pickerRole !== null) setArmed(armedBefore.current);
        setPickerRole(role);
    };
    const live = useLivePlay(gen, armed);
    // mutes are settings (kept in the address bar and links), solo isn't
    const changeMix = (role, patch) => {
        gen.setRoleMix(role, patch);
        setMix((m) => ({ ...m, [role]: { ...m[role], ...patch } }));
        if (patch.mute !== undefined) setSettings((s) => ({ ...s, muted: { ...gen.settings.muted } }));
    };
    const [editorOpen, setEditorOpen] = useState(false);
    // The guided tour opens by itself on a first visit (shared links too), and from the ⚙ menu.
    // Opened by itself it starts on a prompt that dims the page; from the menu it goes straight to the steps.
    const [tourOpen, setTourOpen] = useState(false);
    const [tourPrompt, setTourPrompt] = useState(false);
    // The page unlocks a set of features at a time (STAGES); a browser with no stored stage starts at the basics.
    const [stage, setStage] = useState(() => {
        const stored = readPref(STAGE_KEY, null);
        if (Number.isInteger(stored) && stored >= 0 && stored <= LAST_STAGE) return stored;
        return 0;
    });
    useEffect(() => writePref(STAGE_KEY, stage), [stage]);
    const has = (needed) => stage >= needed;
    // The tour covers the stages from..to; the first-visit prompt and a restart cover only the first.
    const [tourRange, setTourRange] = useState({ from: 0, to: 0, id: 0 });
    const openTour = (prompt = false, range = { from: 0, to: stage }) => {
        setTourPrompt(prompt);
        setTourRange((r) => ({ ...range, id: r.id + 1 }));
        setTourOpen(true);
    };
    // Unlock the next set of features and show what they are (after they have rendered, so there is something to frame).
    const unlockNext = () => {
        const next = Math.min(LAST_STAGE, stage + 1);
        setTourOpen(false);
        setStage(next);
        setTimeout(() => openTour(false, { from: next, to: next }), 0);
    };
    const startOver = () => {
        setStage(0);
        setTimeout(() => openTour(false, { from: 0, to: 0 }), 0);
    };
    const [helpOpen, setHelpOpen] = useState(false);
    useEffect(() => {
        if (tourSeen()) return undefined;
        const timer = setTimeout(() => openTour(true, { from: 0, to: 0 }), 800);
        return () => clearTimeout(timer);
    }, []);
    const editorRef = useRef(null);
    const editSound = (role) => {
        setEditorRole(role);
        setEditorOpen(true);
        requestAnimationFrame(() => editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    const now = useNowPlaying(gen, running, settings);
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
    // The scene last picked (shown in the top row until something changes).
    const [scene, setScene] = useState(linkedScene ? linkedScene.name : '');
    // the built-in preset the page is on (by slug), so its address can be its name
    const sceneSlugRef = useRef(linkedScene ? { name: linkedScene.name, slug: sceneSlug(linkedScene.name) } : null);
    const presetSlug = scene && sceneSlugRef.current && sceneSlugRef.current.name === scene && !Object.values(roles).some((r) => r.edited)
        ? sceneSlugRef.current.slug : '';
    // The short intro (Generator.setQuickIntro): on from a link's intro=short (this visit only), else as last chosen here.
    const [shortIntro, setShortIntroState] = useState(() => {
        const linked = introFromSearch(window.location.search);
        return linked === null ? readPref('bgm-short-intro', false) === true : linked;
    });
    const setShortIntro = (on) => {
        setShortIntroState(on);
        writePref('bgm-short-intro', on);
    };
    useEffect(() => {
        gen.setQuickIntro(shortIntro);
    }, [shortIntro]); // eslint-disable-line react-hooks/exhaustive-deps
    useSettingsInUrl(settings, linkPresets, presetSlug, shortIntro);
    const [sleepLeft, setSleepLeft] = useState(null);
    const loadSettings = (next) => {
        gen.setMany(next);
        setSettings({ ...gen.settings });
        // a new variation is still the same preset
        if (!(Object.keys(next).length === 1 && 'seed' in next)) setScene('');
    };
    const keepCurrent = () => {
        gen.keepCurrent();
        setSettings({ ...gen.settings });
    };
    const update = (key, value) => {
        gen.set(key, value);
        setSettings((s) => ({ ...s, [key]: value }));
        setScene('');
    };
    const patchRole = (role, patch) => setRoles((r) => ({ ...r, [role]: { ...r[role], ...patch } }));
    const setVolume = (role, volume) => {
        gen.setRoleVolume(role, volume);
        setSettings((s) => ({ ...s, volumes: { ...gen.settings.volumes } }));
    };
    const presetLoaded = (role, presetName) => patchRole(role, { presetName, edited: false });
    const loadPreset = (role, name) => {
        setScene('');
        if (gen.loadRolePreset(role, name)) presetLoaded(role, name);
    };
    const relativeKey = () => loadSettings(randomRelativeKey(gen.settings));
    const randomizeField = (key) => loadSettings(randomField(key, gen.settings, randomLevel));
    const chords = progressionLength(settings.progression);
    const randomizePreset = (role) => loadPreset(role, randomPreset(role, roles[role].presetName, randomLevel));
    // A procedural sound (soundGenV2.js soundFrom) - info: { role, seed } for
    // one voice, { role, ensemble } for a voice of an ensemble (+ version and
    // kind for v2) - levelled to its role's default loudness, onto `target`.
    const loadGeneratedSound = async (target, info) => {
        setGenerating((g) => ({ ...g, [target]: true }));
        try {
            const { name, preset, kind } = soundFrom(info);
            // a v2 sound's link names the kind it turned out as
            const made = info.version === GENERATOR_V2 && info.seed !== undefined ? { ...info, kind } : info;
            addGeneratedPreset(name, await levelPreset(preset, info.role), made);
            loadPreset(target, name);
        } finally {
            setGenerating((g) => ({ ...g, [target]: false }));
        }
    };
    const generateForRole = (role) => loadGeneratedSound(role, { role, seed: newSoundSeed(), kind: soundKinds[role], version: GENERATOR_V2 });
    // New sounds for every voice at once, with a shared character.
    const generateAll = (ensemble) => {
        Object.keys(ROLES).forEach((role) => loadGeneratedSound(role, { role, ensemble, version: GENERATOR_V2 }));
    };
    useEffect(() => {
        const sounds = linkedSounds;
        linkedSounds = [];
        sounds.forEach(({ target, info }) => loadGeneratedSound(target, info));
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
        if (all) patch = { ...patch, ...randomColour(level) };
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
    // A preset (scene): its settings (a new seed) and sounds. While playing,
    // the music moves there from the next bar, and what plays follows the
    // preset - music, ambience or both. An ambience-only preset leaves the
    // sounds as they are. A pasted setup (`exact`) keeps its own seed, and
    // sounds that came inside it (`unsaved`) are marked edited until saved.
    // Sounds arrive at the next bar line, with the composition that goes with them.
    // Smoothly (the ⚙ menu, on by default) the whole change waits for the next chord, and the
    // sounds then glide over that chord instead of switching.
    const [smoothPresets, setSmoothPresets] = useStoredFlag('bgm-smooth-presets', true);
    const [backdropOn, setBackdropOn] = useStoredFlag('bgm-backdrop', false);
    const [storedBackdropOptions, setBackdropOptions] = useStoredFlag('bgm-backdrop-options', BACKDROP_DEFAULTS);
    const backdropOptions = { ...BACKDROP_DEFAULTS, ...storedBackdropOptions };
    // Hides everything but the transport and the timeline (⚙ menu); Esc or the corner button brings it back.
    const [zen, setZen] = useState(false);
    // In that view the timeline can be folded away too (ignored while the interface shows).
    const [timelineHidden, setTimelineHidden] = useState(false);
    const bare = zen && timelineHidden;
    // The circle is only for the hidden-interface view.
    const circleShown = zen && backdropOptions.circle;
    useEffect(() => {
        if (!zen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setZen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [zen]);
    const loadPresetAt = (role, name, morph) => gen.loadRolePresetAtBar(role, name, undefined, () => presetLoaded(role, name), { morph });
    const loadSceneVoice = (role, spec, sceneName, unsaved, morph) => {
        if (typeof spec === 'string') {
            loadPresetAt(role, findPreset(spec) ? spec : ROLE_PRESETS[role], morph);
            return;
        }
        if (!spec) {
            loadPresetAt(role, ROLE_PRESETS[role], morph);
            return;
        }
        // a sound carried in full: the library's own if it is that exactly, else a copy of its own
        const existing = findPreset(spec.name);
        const full = { ...PRESET_DEFAULTS, ...spec.synth };
        const known = existing && Object.entries({ ...PRESET_DEFAULTS, ...existing }).every(([key, value]) => full[key] === value);
        if (known) {
            loadPresetAt(role, spec.name, morph);
            return;
        }
        const label = existing ? `${spec.name} (${sceneName})` : spec.name;
        addSetupPreset(label, spec.synth);
        gen.loadRolePresetAtBar(role, label, spec.synth, () => {
            if (unsaved) gen.roles[role].edited = true;
            patchRole(role, { presetName: label, edited: unsaved });
        }, { morph });
    };
    // `parts`: 'all', 'composition' (everything but the sounds and the mix) or 'voices' (the sounds only).
    const applyScene = (picked, options = {}) => {
        if (!picked) return;
        if (!(smoothPresets && gen.isRunning && picked.settings.playMusic !== false)) {
            applySceneNow(picked, options, false);
            return;
        }
        // (the name shows at once; the music follows at the next chord)
        if ((options.parts || 'all') === 'all') setScene(picked.name);
        gen.atNextChord(() => applySceneNow(picked, options, true));
    };
    const applySceneNow = (picked, { exact = false, unsaved = false, parts = 'all' }, morph) => {
        const playing = gen.anyRunning;
        if (parts !== 'voices') {
            const next = sceneSettings(picked, exact && Number.isInteger(picked.settings.seed) ? picked.settings.seed : undefined);
            loadSettings(parts === 'composition' ? { ...next, volumes: gen.settings.volumes, muted: gen.settings.muted } : next);
        }
        if (parts !== 'composition' && sceneGroup(picked) !== 'ambience') {
            Object.keys(ROLES).forEach((role) => loadSceneVoice(role, picked.voices[role], picked.name, unsaved, morph));
        }
        if (parts === 'voices') {
            setScene('');
            return;
        }
        const next = gen.settings;
        setMix((m) => Object.fromEntries(Object.entries(m).map(([role, v]) => [role, { ...v, mute: gen.roles[role].mute }])));
        if (playing) {
            if (next.playAmbience && !gen.ambienceRunning) startPart('playAmbience');
            if (!next.playAmbience && gen.ambienceRunning) gen.stopAmbience();
            if (next.playMusic && !gen.isRunning) startPart('playMusic');
            if (!next.playMusic && gen.isRunning) gen.stop();
        }
        // only the whole of a built-in preset is a preset link
        sceneSlugRef.current = parts === 'all' && SCENES.includes(picked) ? { name: picked.name, slug: sceneSlug(picked.name) } : null;
        setScene(parts === 'all' ? picked.name : '');
    };
    // The page as a setup: every setting and, per voice, its name and every synth parameter.
    const captureSetup = (info) => buildSetup({
        settings: gen.settings,
        voices: Object.fromEntries(Object.keys(ROLE_PRESETS).map((role) => [role, { name: gen.roles[role].presetName, synth: gen.getRolePreset(role) }])),
    }, info);
    const setupActions = {
        save: (name) => {
            if (!name) return 'Give it a name first';
            if (isUserScene(name) && !window.confirm(`Replace your preset "${name}"?`)) return '';
            if (!saveUserScene(captureSetup({ name }))) return 'Could not save (browser storage unavailable) - use Copy setup instead';
            setScene(name);
            return `Saved "${name}" under Mine`;
        },
        copy: async () => {
            const json = JSON.stringify(captureSetup({ name: scene || 'My setup' }), null, 2);
            try {
                await navigator.clipboard.writeText(json);
                return 'Copied. Paste it back in with "Paste / open…", or into src/library/scenes.json.';
            } catch (e) {
                return 'Could not copy - use Download .json instead';
            }
        },
        download: () => {
            const name = scene || 'My setup';
            const blob = new Blob([JSON.stringify(captureSetup({ name }), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'bgm-setup'}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return `Downloaded ${link.download}`;
        },
        remove: deleteUserScene,
        load: (text) => {
            try {
                const loaded = parseSetup(text);
                applyScene(loaded, { exact: true, unsaved: true });
                return { ok: true, message: `Loaded "${loaded.name}"` };
            } catch (e) {
                return { ok: false, message: e.message };
            }
        },
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
    // Next / previous built-in preset in the browser's order ([ and ] keys).
    const stepPreset = (dir) => {
        const rank = (s) => SCENE_CATEGORIES.findIndex((c) => c.id === s.category);
        const ordered = SCENES.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(({ s }) => s);
        const at = ordered.findIndex((s) => s.name === scene);
        const next = at < 0 ? (dir > 0 ? 0 : ordered.length - 1) : (at + dir + ordered.length) % ordered.length;
        applyScene(ordered[next]);
    };
    const handlers = useRef({});
    // Move around the piece from the keyboard: a chord / a progression back or on.
    const move = async (unit, dir) => {
        await gen.step(unit, dir);
        setNow((n) => n + 1);
    };
    handlers.current = { play, stop, toggle, newVariation, previousVariation, stepPreset, move };
    useEffect(() => {
        setupMediaSession({
            play: () => handlers.current.play(),
            stop: () => handlers.current.stop(),
            next: () => handlers.current.newVariation(),
            previous: () => handlers.current.previousVariation(),
        });
        const onKey = (e) => {
            // A window over the page (the preset browser, the sound picker) has its own keys.
            if (document.querySelector('.gen-pb-backdrop') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
            if ((e.key === '[' || e.key === ']') && !typingTarget(e.target)) {
                e.preventDefault();
                handlers.current.stepPreset(e.key === ']' ? 1 : -1);
                return;
            }
            // Arrows: a chord back / on, with Shift a progression - unless a field is using the arrows.
            if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !typingTarget(e.target) && !(e.target && e.target.type === 'range')) {
                e.preventDefault();
                handlers.current.move(e.shiftKey ? 'progression' : 'chord', e.key === 'ArrowRight' ? 1 : -1);
                return;
            }
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
    // ... and the drums' track while they play
    const drumsOn = settings.drums.style !== 'off';
    const shownTracks = drumsOn ? { ...shownRoles, ...PERC_ROLE } : shownRoles;

    return (
        <main className={`gen${zen ? ' gen-zen' : ''}${bare ? ' gen-zen-bare' : ''}`}>
            {(backdropOn || circleShown) && backdropSupported() && <Backdrop generator={gen} options={{ ...backdropOptions, circle: circleShown }} clouds={backdropOn} />}

            <header className="gen-header">
                <h1 aria-label="calmbgm - calm procedural music" title="calmbgm - calm procedural music">calm<b>bgm</b></h1>
                <div className="gen-header-controls">
                <Transport gen={gen} anyOn={anyOn} onToggle={toggle} onChange={() => setTick((n) => n + 1)} />
                {has(1) && <div className="gen-parts" role="group" aria-label="What Play plays">
                    <button type="button" className={`gen-part gen-part-icon${settings.playMusic ? ' is-on' : ''}`} aria-pressed={settings.playMusic}
                        aria-label="Music" onClick={() => togglePart('playMusic')} title={`Music. ${PART_TITLE}`}><MusicIcon /></button>
                    <button type="button" className={`gen-part gen-part-icon${settings.playAmbience ? ' is-on' : ''}`} aria-pressed={settings.playAmbience}
                        aria-label="Ambience" onClick={() => togglePart('playAmbience')} title={`Ambience. ${PART_TITLE}`}><AmbienceIcon /></button>
                </div>}
                </div>
                <div className="gen-header-end">
                <PresetBrowser current={scene} onPick={applyScene} actions={setupActions} />
                {sleepLeft && <span className="gen-sleep gen-sleep-left" role="timer" title="Sleep timer (in the ⚙ menu)">Sleep {sleepLeft}</span>}
                {stage < LAST_STAGE && (
                    <button type="button" className="gen-unlock" onClick={unlockNext}
                        title={`Unlock the next set of features and be shown around them: ${STAGES[stage + 1].name}`}>
                        + {STAGES[stage + 1].name}
                    </button>
                )}
                <div className="gen-header-tools">
                    <button type="button" className="gen-help" onClick={() => setHelpOpen(true)} title="Quick reference: hover the parts of the page to see what they do"
                        aria-label="Quick reference">?</button>
                    <MasterVolume />
                    <VisualMenu backdrop={backdropSupported() ? { value: backdropOn, onChange: setBackdropOn, options: backdropOptions, onOptions: setBackdropOptions, onShuffle: () => setBackdropOptions(shuffleColours(backdropOptions)) } : null} />
                    <AudioMenu generator={gen} onReload={reloadKeepingSettings} />
                    <SettingsMenu midi={{ connect: live.connectMidi, status: live.midiStatus }} link={() => withIntro(shareUrl(gen.settings, linkPresets), shortIntro)} saving={saving} onStartOver={startOver} smooth={{ value: smoothPresets, onChange: setSmoothPresets }} intro={{ value: shortIntro, onChange: setShortIntro }} onTour={() => openTour(false)}
                        phrase={<PhraseField seed={settings.seed} edited={gen.editedSinceStart} onApply={playPhrase} onRoll={newVariation} initial={linkedPhrase} />}>
                        <SleepTimer generator={gen} running={anyOn} onLeft={setSleepLeft} />
                        <Recorder generator={gen} fileName={fileName} onProgress={setSaving} />
                    </SettingsMenu>
                    {zen && (
                        <button type="button" className="gen-help gen-hide" aria-pressed={timelineHidden} onClick={() => setTimelineHidden(!timelineHidden)}
                            aria-label={timelineHidden ? 'Show the timeline' : 'Hide the timeline'} title={timelineHidden ? 'Show the timeline again' : 'Hide the timeline too'}>
                            <TimelineIcon />
                        </button>
                    )}
                    <button type="button" className="gen-help gen-hide" onClick={() => setZen(!zen)} aria-label={zen ? 'Show the interface' : 'Hide the interface'}
                        title={zen ? 'Show the whole page again (Esc)' : 'Hide everything but the play controls and the timeline (Esc brings it back)'}>
                        {zen ? <ChevronDownIcon /> : <ChevronUpIcon />}
                    </button>
                </div>
                </div>
            </header>


            <ChordTimeline
                generator={gen}
                tracks={<TrackStrip roles={shownTracks} presets={Object.fromEntries(Object.entries(roles).map(([role, { presetName, edited }]) => [role, { name: presetName, edited }]))} mix={mix} armed={armed} onMix={changeMix} onArm={setArmed} onEdit={has(3) ? editSound : undefined}
                    onRandom={randomizePreset} onGenerate={has(3) ? generateForRole : undefined} onPick={choosePicker} generating={generating} live={live} />}
            />

            {has(7) && <Randomizer level={randomLevel} onLevel={setRandomLevel} onRandomize={randomize} onNewVariation={newVariation} />}

            {has(2) && <Panel id="music" title="Music" onRandom={() => randomize('music')}>
                <div className="gen-row" data-tour="music-key">
                    <Field label="Key" onRandom={() => randomizeField('tonic')}>
                        <select value={settings.tonic} onChange={(e) => update('tonic', Number(e.target.value))}>
                            {TONIC_NAMES.map((name, pc) => <option key={name} value={pc}>{name}</option>)}
                        </select>
                    </Field>
                    <Field label="Scale / mode" onRandom={() => randomizeField('mode')}
                        onRelative={relativeKeys(settings.tonic, settings.mode).length ? relativeKey : undefined}>
                        <select value={settings.mode} onChange={(e) => update('mode', e.target.value)}>
                            {SCALE_FAMILIES.map(({ family, modes }) => (
                                <optgroup key={family} label={family}>
                                    {modes.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </Field>
                </div>
                <div className="gen-row" data-tour="music-progression">
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
                <div className="gen-row" data-tour="music-tempo">
                    <Field label="Time signature" onRandom={() => randomizeField('meter')}>
                        <select value={settings.meter} onChange={(e) => update('meter', e.target.value)}>
                            {Object.entries(METERS).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                    </Field>
                    <Field label={`Tempo ${settings.bpm} BPM${METERS[settings.meter].unitsPerBeat > 1 ? ' (♩.)' : ''}`} onRandom={() => randomizeField('bpm')}>
                        <input type="range" min={BPM_LIMITS[0]} max={BPM_LIMITS[1]} value={settings.bpm}
                            onChange={(e) => update('bpm', Number(e.target.value))} />
                    </Field>
                </div>
                <NowPlaying now={now} settings={settings} onKeep={keepCurrent} />
            </Panel>}

            {has(6) && <ColourPanel settings={settings} update={update} onRandom={() => loadSettings(randomColour(randomLevel))} />}

            {has(5) && <Evolution drift={settings.drift} home={{ tonic: settings.tonic, mode: settings.mode }} onChange={(drift) => update('drift', drift)}
                onRandom={() => randomize('conductor')} />}

            {has(4) && <Panel id="arrangement" title="Arrangement" onRandom={() => randomize('arrangement')} more={(
                <>
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
                </>
            )}>
                <Field label={`Lead busyness ${Math.round(settings.leadDensity * 100)}%`}>
                    <input type="range" min="0" max="1" step="0.05" value={settings.leadDensity}
                        onChange={(e) => update('leadDensity', Number(e.target.value))} />
                </Field>
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
                <label className="gen-check" title="Intros and breakdowns sound darker, Full opens up">
                    <input type="checkbox" checked={settings.sectionTone} disabled={settings.sections.mode === 'off'}
                        onChange={(e) => update('sectionTone', e.target.checked)} />
                    Sections change the tone
                </label>
            </Panel>}

            {has(6) && <FeelPanel humanize={settings.humanize} swing={settings.swing} update={update}
                onRandomHumanize={() => update('humanize', randomArrangement(gen.settings, randomLevel).humanize)}
                onRandom={() => {
                    update('humanize', randomArrangement(gen.settings, randomLevel).humanize);
                    update('swing', randomSwing(randomLevel));
                }} />}

            {has(6) && <WanderPanel wander={settings.wander} update={update}
                shown={[...Object.keys(shownRoles), ...(drumsOn ? ['perc'] : [])]} />}

            {has(1) && <AmbiencePanel levels={settings.ambience} shape={settings.ambienceShape} onShape={(s) => update('ambienceShape', s)}
                volume={settings.ambienceVolume} on={settings.playAmbience}
                wander={settings.ambienceWander} onWander={(w) => update('ambienceWander', w)}
                onChange={changeAmbience} onVolume={(v) => update('ambienceVolume', v)} onToggle={() => togglePart('playAmbience')}
                onRandom={() => randomize('ambience')} />}

            {has(3) && <SoundsBar onGenerate={generateAll} generating={Object.values(generating).some(Boolean)} />}

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
                            <RoleButtons role={role} label={label} mix={mix[role]} armed={armed === role} onMix={changeMix} onArm={setArmed} onEdit={has(3) ? editSound : undefined} />
                        </>
                    )}
                    onRandom={() => randomizeRole(role)}
                    more={!has(3) ? undefined : (
                        <>
                            <VoiceControls role={role} voice={settings.voices[role]}
                                onChange={(voice) => update('voices', { ...settings.voices, [role]: voice })} />
                            {role === 'pad' && (
                                <>
                                    <Field label="Chord notes">
                                        <select value={settings.padNotes} onChange={(e) => update('padNotes', Number(e.target.value))}>
                                            {Object.entries(PAD_NOTES).map(([n, text]) => <option key={n} value={n}>{text}</option>)}
                                        </select>
                                    </Field>
                                    <PadPlaying settings={settings} update={update} level={randomLevel} />
                                </>
                            )}
                            {role === 'bass' && (
                                <StyleWeights title="Styles" styles={BASS_STYLES} weights={settings.bassWeights}
                                    onChange={(w) => update('bassWeights', w)} onRandom={() => update('bassWeights', randomStyleWeights('bass', randomLevel))} />
                            )}
                        </>
                    )}
                >
                    <Field label="Preset" onRandom={() => randomizePreset(role)} onGenerate={has(3) ? () => generateForRole(role) : undefined} generating={generating[role]} wide>
                        <PresetPicker value={roles[role].presetName} edited={roles[role].edited} onChange={(name) => loadPreset(role, name)} role={role}
                            open={pickerRole === role} onOpenChange={(open) => choosePicker(open ? role : null)} />
                    </Field>
                    {has(3) && (
                        <Field label="Kind of new sound">
                            <select value={soundKinds[role]} title="What the ✦ button makes for this voice"
                                onChange={(e) => setSoundKinds((k) => ({ ...k, [role]: e.target.value }))}>
                                <option value="any">Any kind</option>
                                {Object.entries(SOUND_KINDS[role]).map(([kind, text]) => <option key={kind} value={kind}>{text}</option>)}
                            </select>
                        </Field>
                    )}
                    <Field label={`Volume ${Math.round(settings.volumes[role] * 100)}%`}>
                        <input type="range" min="0" max="1" step="0.01" value={settings.volumes[role]}
                            onChange={(e) => setVolume(role, Number(e.target.value))} />
                    </Field>
                </Panel>
            ))}

            {has(3) && <PercussionPanel drums={settings.drums} kit={settings.drumKit} volume={settings.volumes.perc} mix={mix.perc}
                armed={armed === 'perc'} onArm={setArmed}
                onDrums={(drums) => update('drums', drums)} onKit={(kit) => update('drumKit', kit)}
                onVolume={(v) => setVolume('perc', v)} onMix={changeMix} onAudition={() => gen.audition('perc')} />}

            {has(3) && <SynthEditor
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
            />}

            {tourOpen && <Tour key={tourRange.id} prompt={tourPrompt} fromStage={tourRange.from} toStage={tourRange.to}
                onUnlockAll={() => setStage(LAST_STAGE)} onClose={() => setTourOpen(false)} />}
            {helpOpen && <Tour reference onClose={() => setHelpOpen(false)} />}

            <footer className="gen-footer">
                <p className="gen-footer-links">
                    <a href="https://github.com/lizMcLizface/bgm" target="_blank" rel="noopener noreferrer">Source code on GitHub</a>
                    <span>MIT licence</span>
                    <span>Made by lizMcLizface</span>
                </p>
                <dl className="gen-footer-notes">
                    <div>
                        <dt>No AI</dt>
                        <dd>Music, voices and ambience are procedural: rules plus random numbers, synthesised live in your browser. No samples or recordings.</dd>
                    </div>
                    <div>
                        <dt>Free to use</dt>
                        <dd>No rights are claimed on anything you play, record or save here. A credit (calmbgm.com) is welcome, never required.</dd>
                    </div>
                    <div>
                        <dt>Private</dt>
                        <dd>No accounts, cookies, ads or tracking. Preferences stay in your browser; share links only hold the music settings. Hosted on GitHub Pages.</dd>
                    </div>
                    <div>
                        <dt>As is</dt>
                        <dd>No warranty of any kind. Mind your volume, especially on headphones.</dd>
                    </div>
                </dl>
            </footer>
        </main>
    );
};

export default GenerativeApp;
