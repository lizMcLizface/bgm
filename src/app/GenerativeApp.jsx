import VoiceBrowser from './editor/VoiceBrowser';
import PercussionPresetPicker from './PercussionPresetPicker';
import {percussionVoice,percussionPads,percussionEdited,percussionKeyHint} from './percussionVoices';
import {percussionFromSearch,withPercussion} from '../audio/percussionChoice';
import {mediaHelperFromSearch,withMediaHelper} from '../audio/mediaHelperChoice';
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Generator, { ROLES, PERC_ROLE } from './Generator';
import { DRUM_STYLES, DRUM_PARAMS, randomDrums } from './percussion';
import { SCALE_FAMILIES, TONIC_NAMES, scaleById } from './theory';
import ChordTimeline from './ChordTimeline';
import Rulebook from './rulebook/Rulebook';
import GroupCard from './rulebook/GroupCard';
import { GROUPS, groupValue } from './rulebook/groups';
import { RULES } from './rulebook/model';
import { readBook, inheritBook, withPresetBook, withBook, applyBook, baselineChoice, withoutSettings } from './rulebook/session';
let initialBook = readBook(window.location.search);
import { RoleButtons, TrackStrip, useLivePlay, DRUM_KEY_HINT } from './Tracks';
import { defaultSettings, shareFromLocation, sharePath, shareUrl, newSeed } from './settings';
// The sound window brings the DIY and classic synths with it: loaded on the first ✎.
const SoundWindow = lazy(() => import('./editor/SoundWindow'));
const SOUND_ROLES = { ...ROLES, ...PERC_ROLE, bus: { label: 'Shared bus' } };
import PresetPicker from './editor/PresetPicker';
import PROGRESSIONS, { PROGRESSION_LENGTHS, progressionsOfLength, progressionFamily } from './progressions';
import {
    PAD_STYLES, BASS_STYLES, PULSE_PATTERNS, ARP_PATTERNS, CHORD_DIRECTIONS, styleShares, OCTAVE_LIMITS, OCTAVE_WANDER, SECTION_LENGTHS,
} from './arranger';
import { DRIFT_MODES, BPM_LIMITS } from './conductor';
import { METERS } from './meter';
import {
    RANDOM_LEVELS, RANDOM_LEVEL_HINTS, randomKey, randomProgression, randomConductor, randomVoices, randomField, randomRelativeKey, relativeKeys, randomPreset, randomLength,
    randomArrangement, randomStyleWeights, randomRole, progressionLength, progressionForLength, randomAmbience, randomAmbienceShape,
    randomPadMotion, randomColour,
} from './randomize';
import Backdrop, { backdropSupported, BACKDROP_DEFAULTS, shuffleColours } from './Backdrop';
import { MasterVolume, SettingsMenu, AudioMenu, VisualMenu } from './AudioStatus';
import { SleepTimer, Recorder } from './Playback';
import { sceneSettings, sceneSoundSettings, sceneGroup, stepBuiltinSceneEntry, buildSetup, parseSetup, sceneBySlug, sceneSlug, presetFromSearch, introFromSearch, SCENES, SCENE_CATEGORIES } from './scenes';
import PresetBrowser from './PresetBrowser';
import FeelPad from './FeelPad';
import ListeningTimer from './ListeningTimer';
import { saveUserScene, deleteUserScene, isUserScene } from './setupStore';
import { ROLE_PRESETS } from './presets';
import { setupMediaSession, updateMediaSession } from './mediaSession';
import { AMBIENCE_LAYERS, LAYER_PARAMS } from './engine/ambience';
import { COMMON_PARAMS } from './engine/ambienceSynth';
import { WEATHER_SOURCES } from './engine/weatherBedModel';
import { WEATHER_PRESETS, weatherPresetPatch, matchingWeatherPreset } from './weatherPresets';
import {
    DiceIcon, RotateIcon, SparkIcon, PlayIcon, PauseIcon, ToStartIcon, BarBackIcon, BarForwardIcon, ProgressionBackIcon, ProgressionForwardIcon, LoopIcon, MusicIcon, AmbienceIcon, ChevronUpIcon, ChevronDownIcon, TimelineIcon,
} from './icons';
import { newSoundSeed } from './soundGen';
import { SOUND_KINDS, GENERATOR_V2 } from './soundGenV2';
import { GENERATOR_V3, soundContext } from './soundGenV3';
import { prepareSound } from './engine/prepareSound';
import {usePerfMode} from '../audio/PerfModeButton';
import {readPerfChoice,setPerfChoice,withPerf} from '../audio/perfMode';
import WasmOptions,{useAudioEngine} from './WasmOptions';
import {engineFromSearch,withAudioEngine} from './audioEngineChoice';
import {simdFromSearch,withSimd,bankFromSearch,withFMBank} from '../audio/simdChoice';
import { addGeneratedPreset, addSetupPreset, findPreset, generatedInfo } from './editor/presetStore';
import { presetEdit, presetFromEdit } from './editor/presetEdits';
import PRESET_DEFAULTS from './engine/presetDefaults';
import { readPref, writePref } from './prefs';
import { readPerformance, writePerformance } from '../audio/performance';
import { seedToPhrase, phraseToSeed } from './phrase';
import { WANDER_ROLES, WANDER_LIMITS, WANDER_MODES, AMBIENCE_WANDER_LIMITS } from './engine/wander';
import Tour, { tourSeen } from './Tour';
import { STAGES, STAGE_KEY, LAST_STAGE } from './tourSteps';
import { generationFromSearch, withGeneration } from './generation';

// One Generator for the page's lifetime; StrictMode's double-mount must
// not build a second set of instruments.
// Settings (and built-in presets) come from a share link when the page was
// opened with one.
// Generated sounds in a link are recreated (and levelled) after mount.
let generator = null;
let linkedSounds = [];
// Classic / DIY voices and a drum machine from a link or a linked preset: applied after mount (applyRef).
let linkedRefs = [];
let linkedPhrase = null;
// A link to a built-in preset, ?preset=rainy-day-chickens-inside: the page opens on it (a new piece
// each visit, or the one a phrase= names). Settings in the link win over it.
let linkedScene = null;
const getGenerator = () => {
    if (!generator) {
        const share = shareFromLocation(window.location);
        const query = new URLSearchParams(window.location.search);
        const hasSettings = ['m', 'v', 'a', 'x', 's'].some((key) => query.has(key)) || window.location.hash.includes('s=');
        linkedScene = hasSettings ? null : sceneBySlug(presetFromSearch(window.location.search));
        if (linkedScene) {
            const phrase = new URLSearchParams(window.location.search).get('phrase');
            const seed = phrase ? phraseToSeed(phrase) : null;
            generator = new Generator(sceneSettings(linkedScene, seed === null ? undefined : seed));
            if (phrase && seed !== null) linkedPhrase = phrase;
            if (sceneGroup(linkedScene) !== 'ambience') {
                Object.entries(linkedScene.voices).forEach(([role, voice]) => {
                    if (typeof voice === 'string') generator.loadRolePreset(role, voice);
                    else if (voice?.external) linkedRefs.push({ role, ref: voice.external });
                });
                if (linkedScene.percussion) linkedRefs.push({ role: 'perc', ref: linkedScene.percussion });
            }
        } else {
            generator = new Generator(share ? share.settings : defaultSettings());
        }
        generator.set('generation', generationFromSearch(window.location.search));
        generator.rulebookTrace = true;
        initialBook = withPresetBook(linkedScene?.rulebook, initialBook);
        applyBook(generator, initialBook);
        generator.reset();
        if (share && share.phrase) linkedPhrase = share.phrase;
        if (share) {
            Object.entries(share.presets).forEach(([role, preset]) => {
                if (preset.external || preset.machine) linkedRefs.push({ role, ref: preset.external ?? preset.machine });
                else if (preset.edit) { generator.loadRolePreset(role, preset.edit.name, presetFromEdit(preset.edit)); generator.roles[role].edited = true; }
                else if (preset.generated) linkedSounds.push({ target: role, info: preset.generated });
                else generator.loadRolePreset(role, preset);
            });
        }
    }
    if(new URLSearchParams(location.search).get('perc')==='808'){history.replaceState(null,'',withPercussion(location.pathname+location.search+location.hash,'wasm'));linkedScene=null;}
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
function useSettingsInUrl(settings, presets, presetSlug, shortIntro, generation, book, perfOn) {
    useEffect(() => {
        const id = setTimeout(() => {
            window.history.replaceState(null, '', withPercussion(withMediaHelper(withPerf(withFMBank(withSimd(withAudioEngine(withBook(withGeneration(withIntro(presetSlug
                ? `${window.location.pathname}?preset=${presetSlug}`
                : sharePath(settings, presets, window.location, { seed: false }), shortIntro), generation), book, presetSlug ? sceneBySlug(presetSlug)?.rulebook : undefined),engineFromSearch(window.location.search)),simdFromSearch(window.location.search)),bankFromSearch(window.location.search)),readPerfChoice()),mediaHelperFromSearch(window.location.search)),percussionFromSearch(window.location.search)));
        }, 300);
        return () => clearTimeout(id);
    }, [settings, presets, presetSlug, shortIntro, generation, book, perfOn]);
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
                <Field key={key} label={spec.options ? spec.label : `${spec.label} ${Math.round(shape[key] * 100)}%`}>
                    {spec.options ? <select aria-label={`${label} ${spec.label.toLowerCase()}`} value={shape[key]} onChange={e => set(key, e.target.value)}>
                        {spec.options.map(option => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}
                    </select> : <input aria-label={`${label} ${spec.label.toLowerCase()}`} type="range" min="0" max="1" step={spec.render ? 0.1 : 0.05} value={shape[key]} onChange={(e) => set(key, Number(e.target.value))} />}
                </Field>
            ))}
            {Object.entries(COMMON_PARAMS).map(([key, spec]) => (
                <Field key={key} label={`${names[key] || spec.label} ${key === 'pan' ? panLabel(shape.pan) : `${Math.round(shape[key] * 100)}%`}`}>
                    <input aria-label={`${label} ${(names[key] || spec.label).toLowerCase()}`} type="range" min={spec.min} max={spec.max} step={key === 'distance' ? 0.05 : 0.1} value={shape[key]} onChange={(e) => set(key, Number(e.target.value))} />
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
                Every voice gets a new sound, made to work together. In Latest, the character follows your preset and musical settings. Shared links keep the result.
            </small>
        </section>
    );
};

// The ambient bed (engine/ambience.js): on / off (as beside Play), a volume
// for the whole bed against the music, and independent weather source cards.
// More options holds the active wind, fire and vinyl shapes.
const AmbiencePanel = ({ levels, shape, volume, on, onChange, onShape, onVolume, onToggle, onRandom }) => {
    const active = Object.entries(AMBIENCE_LAYERS).filter(([id]) => levels[id] > 0 && !WEATHER_SOURCES.includes(id));
    const more = active.length
        ? active.map(([id, label]) => <LayerShape key={id} id={id} label={label} shape={shape[id]} onChange={(s) => onShape({ ...shape, [id]: s })} />)
        : null;
    return (
    <Panel id="ambience" title="Vibe" onRandom={onRandom} more={more} heading={(
        <>
            Vibe
            <button type="button" className={`gen-part${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onToggle}
                title={PART_TITLE}>{on ? 'On' : 'Off'}</button>
        </>
    )}>
        <Field label={`Ambience volume ${Math.round(volume * 100)}%`}>
            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => onVolume(Number(e.target.value))} />
        </Field>
        <p className="gen-hint">Build a weather bed. Each source has its own preset and settings; changes leave the other sources alone.</p>
        <div className="gen-weather-sources">
            {WEATHER_SOURCES.map(id => <section key={id} className="gen-weather-source" aria-label={`${AMBIENCE_LAYERS[id]} source`}>
                <h3>{AMBIENCE_LAYERS[id]}</h3>
                <Field label={`${AMBIENCE_LAYERS[id]} level ${Math.round(levels[id] * 100)}%`}>
                    <input aria-label={`${AMBIENCE_LAYERS[id]} level`} type="range" min="0" max="1" step="0.05" value={levels[id]}
                        onChange={e => onChange({ ...levels, [id]: Number(e.target.value) })} />
                </Field>
                <select aria-label={`${AMBIENCE_LAYERS[id]} preset`} value={matchingWeatherPreset(id, shape[id], levels[id])} onChange={e => {
                    const patch = weatherPresetPatch(id, e.target.value, shape, levels);
                    if (patch) { onShape(patch.ambienceShape); onChange(patch.ambience); }
                }}>
                    <option value="">Choose a {id === 'waves' ? 'wave' : id} preset…</option>
                    {WEATHER_PRESETS[id].map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </select>
                <details><summary>{AMBIENCE_LAYERS[id]} settings</summary>
                    <LayerShape id={id} label={AMBIENCE_LAYERS[id]} shape={shape[id]} onChange={s => onShape({ ...shape, [id]: s })} />
                </details>
            </section>)}
        </div>
        <div className="gen-ambience">
            {Object.entries(AMBIENCE_LAYERS).filter(([id]) => !WEATHER_SOURCES.includes(id)).map(([id, label]) => (
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
const PadPlaying = ({ settings, update, level, wrap = (id, children) => children }) => {
    const motion = settings.padMotion;
    const setMotion = (key, value) => update('padMotion', { ...motion, [key]: value });
    return (
        <>
            {wrap('pad-styles', <StyleWeights title="Styles" styles={PAD_STYLES} weights={settings.padWeights}
                onChange={(w) => update('padWeights', w)} onRandom={() => update('padWeights', randomStyleWeights('pad', level))} />)}
            {wrap('pad-pulses', <StyleWeights title="Pulse patterns" styles={PULSE_PATTERNS} weights={settings.pulseWeights}
                disabled={styleShares(settings.padWeights).pulse === 0}
                onChange={(w) => update('pulseWeights', w)} onRandom={() => update('pulseWeights', randomStyleWeights('pulse', level))} />)}
            {wrap('pad-arpeggios', <StyleWeights title="Arpeggio patterns" styles={ARP_PATTERNS} weights={settings.arpWeights}
                disabled={styleShares(settings.padWeights).arpeggio === 0}
                onChange={(w) => update('arpWeights', w)} onRandom={() => update('arpWeights', randomStyleWeights('arpeggio', level))} />)}
            {wrap('pad-directions', <StyleWeights title="Rolled and stacked chords" styles={CHORD_DIRECTIONS} weights={settings.directionWeights}
                disabled={styleShares(settings.padWeights).rolled + styleShares(settings.padWeights).stacked === 0}
                onChange={(w) => update('directionWeights', w)} onRandom={() => update('directionWeights', randomStyleWeights('direction', level))} />)}
            {wrap('pad-movement', <fieldset className="gen-weights">
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
            </fieldset>)}
        </>
    );
};

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
const PercussionPanel = ({ drums, kit, volume, mix, armed, onArm, onDrums, onKit, onVoice, voiceBusy, voiceOpen, onVoiceOpen, onVolume, onMix, onAudition }) => {
    const setDrum = (name, patch) => onKit({ ...kit, [name]: { ...kit[name], ...patch } });
    const more = (
        <>
            <Field label={`Room ${pct(kit.room)}`}>
                <input type="range" min="0" max="0.5" step="0.05" value={kit.room} onChange={(e) => onKit({ ...kit, room: Number(e.target.value) })} />
            </Field>
            {percussionPads(drums.kit).map(({name,label}) => (
                <fieldset key={name} className="gen-weights gen-drum">
                    <legend>
                        <label className="gen-check">
                            <input type="checkbox" checked={kit[name].on} onChange={(e) => setDrum(name, { on: e.target.checked })} />
                            {label}
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
            more={more}
        >
            <PercussionPresetPicker value={drums.kit} kit={kit} onChange={onVoice} disabled={voiceBusy} open={voiceOpen} onOpenChange={onVoiceOpen} />
            <Field label={`Volume ${pct(volume)}`}>
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => onVolume(Number(e.target.value))} />
            </Field>
            <div className="gen-field">
                <button type="button" className="gen-keys-button" onClick={onAudition}>Hear the kit</button>
                {armed && <small>Keys {percussionKeyHint(drums.kit)}</small>}
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
    const [ruleFocus, setRuleFocus] = useState(null);
    const prepareTourStep = useCallback(step => {
        if (step.rulePage) setRuleFocus(previous => ({ page: step.rulePage, revision: (previous?.revision ?? 0) + 1 }));
    }, []);
    const [book, setBookState] = useState(initialBook);
    const bookRef = useRef(book);
    const setBook = next => { bookRef.current = next; setBookState(next); };
    const clearBookSettings = patch => setBook(withoutSettings(bookRef.current, patch, gen.settings));
    const changeRule = (id, choice) => {
        const rule = RULES.find(r => r.id === id), previous = bookRef.current;
        const rules = { ...previous.rules }, baseline = { ...previous.baseline };
        if (choice) {
            if (rule.path && !baseline[id]) baseline[id] = baselineChoice(rule, gen.settings);
            rules[id] = choice;
        } else delete rules[id];
        // Restore the original value before dropping its saved baseline.
        const next = { ...previous, rules, baseline }, playing = gen.anyRunning;
        applyBook(gen, next);
        if (!choice) delete baseline[id];
        setBook({ ...previous, rules, baseline }); setSettings({ ...gen.settings });
        if (playing) {
            if (gen.settings.playMusic && !gen.isRunning) startPart('playMusic');
            if (!gen.settings.playMusic && gen.isRunning) gen.stop();
            if (gen.settings.playAmbience && !gen.ambienceRunning) startPart('playAmbience');
            if (!gen.settings.playAmbience && gen.ambienceRunning) gen.stopAmbience();
        }
    };
    const changeGroup = (id, value) => {
        const group = GROUPS.find(g => g.id === id), previous = bookRef.current;
        if (!group || value !== null && group.validate(value) === undefined) return;
        const groups = { ...previous.groups }, groupBaseline = { ...previous.groupBaseline };
        if (value !== null) {
            if (!Object.hasOwn(groupBaseline, id)) groupBaseline[id] = JSON.parse(JSON.stringify(groupValue(gen.settings, group.path)));
            groups[id] = group.validate(value);
        } else delete groups[id];
        applyBook(gen, { ...previous, groups, groupBaseline });
        if (value === null) delete groupBaseline[id];
        setBook({ ...previous, groups, groupBaseline }); setSettings({ ...gen.settings });
    };
    const updatePlaying = (key, value) => {
        const group = GROUPS.find(g => g.path === key);
        if (group) changeGroup(group.id, value);
    };
    const wrapGroup = (id, children) => <GroupCard id={id} settings={settings} book={book} onChange={changeGroup}>{children}</GroupCard>;
    const [roles, setRoles] = useState(() =>
        Object.fromEntries(Object.keys(ROLES).map((role) => [role, { presetName: gen.roles[role].presetName, edited: gen.roles[role].edited }]))
    );
    // the percussion's drum machine ({ synth, name, values, rack, label, ref }), or null for the kit
    const [percMachine, setPercMachine] = useState(null);
    const audioEngine = useAudioEngine(gen,{required:Object.values(roles).some(r=>!!findPreset(r.presetName)?.wasmVoice)});
    const perfOn=usePerfMode();
    const togglePerfMode=async next=>{
        const previous=readPerfChoice(),path=location.pathname+location.search+location.hash;
        setPerfChoice(next);
        if(!await audioEngine.choose('wasm',{remember:false})){setPerfChoice(previous);history.replaceState(null,'',path);throw Error('Could not prepare performance mode. The previous instruments are retained.');}
        history.replaceState(null,'',withPerf(withAudioEngine(location.pathname+location.search+location.hash,'wasm'),next));
    };

    // What a link can carry: built-in presets as loaded (edits stay local).
    // Generated sounds travel as the role they were made for + their seed.
    // Classic / DIY voices and a drum machine travel as references, an edited sound as its
    // preset's name and the values that differ (shareExtras.js); `soundEdits` counts edits.
    const [soundEdits, setSoundEdits] = useState(0);
    const linkPresets = useMemo(
        () => ({ ...Object.fromEntries(Object.entries(roles).map(([role, { presetName, edited, external }]) => {
            if (external) return [role, { external: external.ref }];
            if (edited) return [role, { edit: presetEdit(presetName, gen.getRolePreset(role)) }];
            const generated = generatedInfo(presetName);
            return [role, generated ? { generated } : presetName];
        })), ...(percMachine ? { perc: { machine: percMachine.ref } } : {}) }),
        [roles, percMachine, soundEdits], // eslint-disable-line react-hooks/exhaustive-deps
    );
    const [generating, setGenerating] = useState({});
    // The kind of sound ✦ makes per role ('any': the seed decides).
    const [soundKinds, setSoundKinds] = useState(() => Object.fromEntries(Object.keys(ROLES).map((role) => [role, 'any'])));
    const [randomLevel, setRandomLevel] = useState('reason');
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
        setRuleFocus(previous => ({ reset: true, revision: (previous?.revision ?? 0) + 1 }));
        setTimeout(() => openTour(false, { from: 0, to: 0 }), 0);
    };
    const [helpOpen, setHelpOpen] = useState(false);
    useEffect(() => {
        if (tourSeen()) return undefined;
        const timer = setTimeout(() => openTour(true, { from: 0, to: 0 }), 800);
        return () => clearTimeout(timer);
    }, []);
    // ✎ opens the voice's sound in the sound window; the percussion's too.
    const [soundRole, setSoundRole] = useState(null);
    // While it is open the keyboard and MIDI play the voice it shows (as the preset picker
    // does); closing it puts the arming back as it was.
    const soundArmedBefore = useRef(null);
    const editSound = (role) => {
        if (soundRole === null) soundArmedBefore.current = armed;
        if (role !== 'bus') setArmed(role); // (the bus is no voice to play)
        setSoundRole(role);
    };
    // the Performance choices shown with the bus (as the Audio menu's: they apply after a reload)
    const changePerformance = (patch) => {
        const previous = readPerformance();
        if (writePerformance(patch) && !reloadKeepingSettings()) writePerformance(previous);
    };
    const closeSound = useCallback(() => { setArmed(soundArmedBefore.current); setSoundRole(null); }, []);
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
        // (edited sounds travel in the address too, shareExtras.js)
        window.history.replaceState(null, '', withBook(sharePath(gen.settings, linkPresets), bookRef.current));
        window.location.reload();
        return true;
    };
    // The scene last picked (shown in the top row until something changes).
    const [scene, setScene] = useState(linkedScene ? linkedScene.name : '');
    const soundScene = useRef(linkedScene);
    const soundRequests = useRef({});
    const generationRequest = useRef(0);
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
    const [generationChoice, setGenerationChoice] = useState(gen.settings.generation);
    const chooseGeneration = async (value, push = true) => {
        const mode = value === 'legacy' ? 'legacy' : 'latest';
        setGenerationChoice(mode);
        if (push) window.history.pushState(null, '', withGeneration(window.location.href, mode));
        const request = ++generationRequest.current;
        setGenerating({});
        const candidates = Object.keys(ROLES).flatMap(role => {
            soundRequests.current[role] = (soundRequests.current[role] || 0) + 1;
            const r = gen.roles[role], info = generatedInfo(r.presetName);
            return !r.edited && info?.version === GENERATOR_V3 ? [{ role, info, name: r.presetName, preset: r.instrument.preset }] : [];
        });
        let prepared;
        try { prepared = await Promise.all(candidates.map(async c => ({ ...c, sound: await prepareSound(c.info, mode) }))); }
        catch (error) { if (request !== generationRequest.current) return; console.error('Could not rebuild generated sounds', error); setGenerationChoice(gen.settings.generation); window.history.replaceState(null, '', withGeneration(window.location.href, gen.settings.generation)); return; }
        if (request !== generationRequest.current) return;
        const waiting = gen.pendingChange;
        gen.atNextChord(() => {
            waiting?.();
            if (request !== generationRequest.current) return;
            gen.set('generation', mode);
            for (const c of prepared) {
                const r = gen.roles[c.role];
                if (r.edited || r.presetName !== c.name || r.instrument.preset !== c.preset) continue;
                addGeneratedPreset(c.sound.name, c.sound.preset, c.sound.info);
                gen.loadRolePreset(c.role, c.sound.name, c.sound.preset, gen.isRunning ? .25 : 0);
                presetLoaded(c.role, c.sound.name);
            }
            setSettings({ ...gen.settings });
        });
    };
    useEffect(() => {
        const pop = () => chooseGeneration(generationFromSearch(window.location.search), false);
        window.addEventListener('popstate', pop);
        return () => window.removeEventListener('popstate', pop);
    }, [gen]);
    useSettingsInUrl(settings, linkPresets, presetSlug, shortIntro, generationChoice, book, perfOn);
    const [sleepLeft, setSleepLeft] = useState(null);
    const loadSettings = (next) => {
        clearBookSettings(next);
        gen.setMany(next);
        setSettings({ ...gen.settings });
        // a new variation is still the same preset
        if (!(Object.keys(next).length === 1 && 'seed' in next)) setScene('');
    };
    const keepCurrent = () => {
        gen.keepCurrent();
        setSettings({ ...gen.settings });
    };
    // the feel pad: a place over the preset, so the preset's name stays
    const changeFeel = (feel) => {
        gen.set('feel', feel);
        setSettings((s) => ({ ...s, feel }));
    };
    const update = (key, value) => {
        clearBookSettings({ [key]: value });
        gen.set(key, value);
        setSettings((s) => ({ ...s, [key]: value }));
        setScene('');
    };
    const percussionChoice = useRef(null);
    const [percussionBusy,setPercussionBusy] = useState(false);
    const choosePercussionVoice = async id => {
        if(percussionChoice.current)return percussionChoice.current;
        setPercussionBusy(true);
        // a kit of the generator's own replaces a drum machine
        const loading=(async()=>{if(gen.roles.perc.machine){await gen.setPercussionSource(null);setPercMachine(null);}return gen.loadPercussionVoice(id);})();percussionChoice.current=loading;
        try {
            await loading;
            clearBookSettings({drums:gen.settings.drums,drumKit:gen.settings.drumKit});
            if(gen.percussionEngine==='wasm')history.replaceState(null,'',withPercussion(location.pathname+location.search+location.hash,'wasm'));
            setSettings({...gen.settings});setScene('');
        } finally {percussionChoice.current=null;setPercussionBusy(false);}
    };
    const editPercussionSound = () => editSound('perc');
    // A new preset name is the generator's own synth again (a classic or DIY sound is `external`).
    const patchRole = (role, patch) => setRoles((r) => ({ ...r, [role]: { ...r[role], ...('presetName' in patch ? { external: null } : {}), ...patch } }));
    const setExternal = useCallback((role, external) => setRoles((r) => ({ ...r, [role]: { ...r[role], external } })), []);
    const setVolume = (role, volume) => {
        gen.setRoleVolume(role, volume);
        setSettings((s) => ({ ...s, volumes: { ...gen.settings.volumes } }));
    };
    const presetLoaded = (role, presetName) => patchRole(role, { presetName, edited: false });
    const onNativeEdited = useCallback((role) => { setRoles((r) => (r[role].edited ? r : { ...r, [role]: { ...r[role], edited: true } })); setSoundEdits((n) => n + 1); }, []);
    // a preset file: loaded as it is, an edit until it is saved under a name
    // A classic / DIY sound or a drum machine from a link, setup or scene (soundRefs.js), level-matched
    // to its voice unless the reference carries a level.
    const applyRef = async (role, ref) => {
        const [{ soundFromRef, machineFromRef, described }, { soundSource, matchedLevel }] = await Promise.all([import('./editor/soundRefs'), import('../synths/ensemble/sources')]);
        if (role === 'perc') {
            const machine = machineFromRef(ref);
            await gen.setPercussionSource({ classics: { synth: machine.synth, name: machine.label, values: machine.values, rack: machine.rack, light: perfOn }, masterVolume: 1 });
            setPercMachine(machine);
            return;
        }
        let sound = soundFromRef(ref, role);
        if (!sound.matched) sound = described({ ...sound, level: await matchedLevel(sound, role), matched: true });
        await gen.setRoleSource(role, soundSource(sound, role, perfOn));
        setExternal(role, sound);
    };
    const applyRefs = (refs) => refs.forEach(({ role, ref }) => applyRef(role, ref).catch((error) => console.error(`Could not load the ${role} sound`, error)));
    const importPreset = (role, name, preset) => {
        gen.loadRolePreset(role, name, preset);
        gen.roles[role].edited = true;
        patchRole(role, { presetName: name, edited: true });
    };
    const loadPreset = (role, name) => {
        const info = generatedInfo(name);
        if (info?.version === GENERATOR_V3 && name.startsWith('Original ') !== (generationChoice === 'legacy')) {
            loadGeneratedSound(role, info);
            return;
        }
        setScene('');
        if (gen.loadRolePreset(role, name)) presetLoaded(role, name);
    };
    const relativeKey = () => loadSettings(randomRelativeKey(gen.settings));
    const randomizeField = (key) => loadSettings(randomField(key, gen.settings, randomLevel));
    const chords = progressionLength(settings.progression);
    const randomizePreset = (role) => loadPreset(role, randomPreset(role, roles[role].presetName, randomLevel));
    // A procedural sound: info retains recipe version and frozen v3 context.
    // { role, seed } for
    // one voice, { role, ensemble } for a voice of an ensemble (+ version and
    // kind for v2) - levelled to its role's default loudness, onto `target`.
    const loadGeneratedSound = async (target, info) => {
        setGenerating((g) => ({ ...g, [target]: true }));
        const request = soundRequests.current[target] = (soundRequests.current[target] || 0) + 1;
        const previous = gen.roles[target].instrument.preset;
        try {
            const sound = await prepareSound(info, generationChoice);
            if (soundRequests.current[target] !== request || gen.roles[target].instrument.preset !== previous) return;
            addGeneratedPreset(sound.name, sound.preset, sound.info);
            loadPreset(target, sound.name);
        } catch (error) {
            console.error('Could not generate sound', error);
        } finally {
            if (soundRequests.current[target] === request) setGenerating((g) => ({ ...g, [target]: false }));
        }
    };
    const generatedContext = (role) => {
        const context = soundContext(gen.settings, soundScene.current || { voices: Object.fromEntries(Object.keys(ROLES).map(r => [r, gen.roles[r].presetName])) }, role);
        const previous = generatedInfo(gen.roles[role].presetName);
        if (!soundScene.current && previous?.version === GENERATOR_V3) context.profile = previous.profile;
        return context;
    };
    const generateForRole = (role) => loadGeneratedSound(role, { role, seed: newSoundSeed(), kind: soundKinds[role],
        version: generationChoice === 'legacy' ? GENERATOR_V2 : GENERATOR_V3,
        ...(generationChoice === 'legacy' ? {} : generatedContext(role)) });
    // New sounds for every voice at once, with a shared character.
    const generateAll = (ensemble) => {
        Object.keys(ROLES).forEach((role) => loadGeneratedSound(role, { role, ensemble, version: generationChoice === 'legacy' ? GENERATOR_V2 : GENERATOR_V3,
            ...(generationChoice === 'legacy' ? {} : generatedContext(role)) }));
    };
    useEffect(() => {
        const sounds = linkedSounds, refs = linkedRefs;
        linkedSounds = []; linkedRefs = [];
        sounds.forEach(({ target, info }) => loadGeneratedSound(target, info));
        applyRefs(refs);
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
    // (smooth changes also pivot into a new key and glide to a new tempo, Generator.planHomeChange)
    useEffect(() => { gen.smoothChanges = smoothPresets; }, [gen, smoothPresets]);
    const [backdropOn, setBackdropOn] = useStoredFlag('bgm-backdrop', false);
    const [fluidReset, setFluidReset] = useState(0);
    const [storedBackdropOptions, setBackdropOptions] = useStoredFlag('bgm-backdrop-options', BACKDROP_DEFAULTS);
    const backdropOptions = { ...BACKDROP_DEFAULTS, ...storedBackdropOptions };
    // Hides everything but the transport and the timeline (⚙ menu); Esc or the corner button brings it back.
    const [zen, setZen] = useStoredFlag('bgm-hide-ui', false);
    // In that view the timeline can be folded away too (ignored while the interface shows).
    const [timelineHidden, setTimelineHidden] = useStoredFlag('bgm-hide-timeline', false);
    // a mini piano above each chord of the timeline (the Look menu)
    const [chordPianos, setChordPianos] = useStoredFlag('bgm-chord-pianos', false);
    const bare = zen && timelineHidden;
    useEffect(() => {
        if (!zen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setZen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [zen]);
    const loadPresetAt = async (role, name, morph) => {if(findPreset(name)?.wasmVoice&&gen.audioEngine!=='wasm'&&!await audioEngine.choose('wasm',{remember:false}))return;gen.loadRolePresetAtBar(role,name,undefined,()=>presetLoaded(role,name),{morph});};
    const loadSceneVoice = (role, spec, sceneName, unsaved, morph) => {
        if (spec?.external) { applyRefs([{ role, ref: spec.external }]); return; }
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
    const sceneBrowseCategory = useRef(null);
    // `parts`: 'all', 'composition' (everything but the sounds and the mix) or 'voices' (the sounds only).
    const applyScene = async (picked, options = {}) => {
        if (!picked) return;
        if(options.parts!=='composition'&&Object.values(picked.voices).some(v=>typeof v==='string'?findPreset(v)?.wasmVoice:v?.synth?.wasmVoice)&&gen.audioEngine!=='wasm'&&!await audioEngine.choose('wasm',{remember:false}))return;
        sceneBrowseCategory.current = options.browseCategory ?? picked.category;
        if (!(smoothPresets && gen.isRunning && picked.settings.playMusic !== false)) {
            applySceneNow(picked, options, false);
            return;
        }
        // (the name shows at once; the music follows at the next chord)
        if ((options.parts || 'all') === 'all') setScene(picked.name);
        gen.atNextChord(() => applySceneNow(picked, options, true));
    };
    const applySceneNow = (picked, { exact = false, unsaved = false, parts = 'all', preserveSeed = false }, morph) => {
        soundScene.current = picked;
        const playing = gen.anyRunning;
        if (parts !== 'voices') {
            setBook({ rules: {}, baseline: {} });
            applyBook(gen, bookRef.current);
            const next = sceneSettings(picked, exact && Number.isInteger(picked.settings.seed) ? picked.settings.seed : preserveSeed ? gen.settings.seed : undefined);
            next.generation = SCENES.includes(picked) || !picked.settings.generation ? generationChoice : next.generation;
            setGenerationChoice(next.generation);
            loadSettings(parts === 'composition' ? { ...next, volumes: gen.settings.volumes, muted: gen.settings.muted, ...sceneSoundSettings(gen.settings, next) } : next);
            const restoredBook = inheritBook(picked.rulebook);
            applyBook(gen, restoredBook);
            setBook(restoredBook);
            setSettings({ ...gen.settings });
        }
        if (parts !== 'composition' && sceneGroup(picked) !== 'ambience') {
            Object.keys(ROLES).forEach((role) => loadSceneVoice(role, picked.voices[role], picked.name, unsaved, morph));
            if (picked.percussion) applyRefs([{ role: 'perc', ref: picked.percussion }]);
            else if (gen.roles.perc.machine) { gen.setPercussionSource(null).catch((error) => console.error('Could not restore the kit', error)); setPercMachine(null); }
        }
        if (parts === 'voices') {
            const next=sceneSettings(picked,gen.settings.seed);
            const sounds=sceneSoundSettings(next,gen.settings);
            clearBookSettings(sounds);gen.setMany(sounds);setSettings({...gen.settings});
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
        rulebook: bookRef.current,
        voices: Object.fromEntries(Object.keys(ROLE_PRESETS).map((role) => [role, roles[role].external
            ? { name: roles[role].external.label, external: roles[role].external.ref }
            : { name: gen.roles[role].presetName, synth: gen.getRolePreset(role) }])),
        percussion: percMachine?.ref,
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
        const entry = stepBuiltinSceneEntry(scene, dir, sceneBrowseCategory.current);
        applyScene(entry.scene, {browseCategory:entry.category,preserveSeed:false});
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
        <main className={`gen${zen && !tourOpen && !helpOpen ? ' gen-zen' : ''}${bare && !tourOpen && !helpOpen ? ' gen-zen-bare' : ''}`}>
            {backdropOn && !perfOn && backdropSupported() && <Backdrop generator={gen} options={{ ...backdropOptions, circle: false }} clouds={backdropOn} resetKey={fluidReset} />}

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
                <ListeningTimer generator={gen} running={anyOn} />
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
                    <VisualMenu pianos={{ value: chordPianos, onChange: setChordPianos }} backdrop={backdropSupported() ? { value: backdropOn&&!perfOn, locked:perfOn, onChange: setBackdropOn, options: backdropOptions, onOptions: setBackdropOptions, onClear: () => setFluidReset((n) => n + 1), onShuffle: () => setBackdropOptions(shuffleColours(backdropOptions)) } : null} />
                    <AudioMenu generator={gen} onReload={reloadKeepingSettings}>
                        <WasmOptions engine={audioEngine} perf={{ onToggle: togglePerfMode }} />
                    </AudioMenu>
                    <SettingsMenu midi={{ connect: live.connectMidi, status: live.midiStatus }} link={() => withBook(withGeneration(withIntro(shareUrl(gen.settings, linkPresets), shortIntro), generationChoice), bookRef.current)} generation={{ value: generationChoice, onChange: chooseGeneration }} saving={saving} onStartOver={startOver} smooth={{ value: smoothPresets, onChange: setSmoothPresets }} intro={{ value: shortIntro, onChange: setShortIntro }} onTour={() => openTour(false)}
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
                generator={gen} pianos={chordPianos} onExploreRule={id => setRuleFocus(previous => ({ id, revision: (previous?.revision ?? 0) + 1 }))}
                tracks={has(1) ? <TrackStrip roles={shownTracks} presets={{...Object.fromEntries(Object.entries(roles).map(([role, { presetName, edited, external }]) => [role, { name: external?.label ?? presetName, edited }])),perc:percMachine?{name:percMachine.label,edited:false}:{name:percussionVoice(settings.drums.kit).name,edited:percussionEdited(settings.drums.kit,settings.drumKit)}}} mix={mix} armed={armed} onMix={changeMix} onArm={setArmed} onEdit={has(3) ? editSound : undefined}
                    onRandom={randomizePreset} onGenerate={has(3) ? generateForRole : undefined} onPick={choosePicker} onPickPercussion={()=>choosePicker('perc')} onEditPercussion={has(3)?editPercussionSound:undefined} percussionHint={percussionKeyHint(settings.drums.kit)} generating={generating} live={live} /> : null}
            />

            {has(2) && <Panel id="feel" title="Feel">
                <FeelPad feel={settings.feel} onChange={changeFeel} />
            </Panel>}

            <Rulebook generator={gen} settings={settings} book={book} onChoice={changeRule} preset={scene} stage={stage} focusRule={ruleFocus} pageControls={{
                melody: wrapGroup('lead-register', <VoiceControls role="lead" voice={settings.voices.lead} onChange={voice => changeGroup('lead-register', voice)} />),
                ensemble: wrapGroup('counter-register', <VoiceControls role="counter" voice={settings.voices.counter} onChange={voice => changeGroup('counter-register', voice)} />),
                pad: <>
                    {wrapGroup('pad-register', <VoiceControls role="pad" voice={settings.voices.pad} onChange={voice => changeGroup('pad-register', voice)} />)}
                    {wrapGroup('pad-size', <Field label="Chord notes"><select aria-label="Chord notes" value={settings.padNotes} onChange={e => changeGroup('pad-size', Number(e.target.value))}>{Object.entries(PAD_NOTES).map(([n, text]) => <option key={n} value={n}>{text}</option>)}</select></Field>)}
                    <PadPlaying settings={settings} update={updatePlaying} level={randomLevel} wrap={wrapGroup} />
                </>,
                bass: <>
                    {wrapGroup('bass-register', <VoiceControls role="bass" voice={settings.voices.bass} onChange={voice => changeGroup('bass-register', voice)} />)}
                    {wrapGroup('bass-styles', <StyleWeights title="Bass styles" styles={BASS_STYLES} weights={settings.bassWeights} onChange={weights => changeGroup('bass-styles', weights)} onRandom={() => changeGroup('bass-styles', randomStyleWeights('bass', randomLevel))} />)}
                </>,
                percussion: <button onClick={() => update('drums', randomDrums())}>Randomize percussion pattern</button>,
                form: wrapGroup('section-reference', <Field label="Section length reference"><select aria-label="Section length reference" value={settings.sections.phrases} disabled={settings.sections.mode === 'off'} onChange={e => changeGroup('section-reference', Number(e.target.value))}>{SECTION_LENGTHS.map(n => <option key={n} value={n}>{n} phrases ({n * 4} bars)</option>)}</select><small>Latest develops sections around this reference; musical phrases can span four or eight bars.</small></Field>),
                'ambient-dynamics': <>
                    {wrapGroup('ambient-drift-mode', <Field label="Level drift movement"><select aria-label="Level drift movement" value={settings.ambienceWander.mode} onChange={e => changeGroup('ambient-drift-mode', e.target.value)}>{Object.entries(WANDER_MODES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>)}
                    {wrapGroup('ambient-drift-period', <Field label={`Drift round takes ${settings.ambienceWander.period} s`}><input aria-label="Level drift period" type="range" {...AMBIENCE_WANDER_LIMITS.period} value={settings.ambienceWander.period} onChange={e => changeGroup('ambient-drift-period', Number(e.target.value))} /></Field>)}
                </>,
            }} />

            {has(7) && <Randomizer level={randomLevel} onLevel={setRandomLevel} onRandomize={randomize} onNewVariation={newVariation} />}

            {has(2) && <Panel id="music" title="Music" onRandom={() => randomize('music')}>
                <div className="gen-row" data-tour="music-key">
                    <Field label={settings.tonality.mode==='atonal'?'Pitch-set transposition':'Key'} onRandom={() => randomizeField('tonic')}>
                        <select value={settings.tonic} onChange={(e) => update('tonic', Number(e.target.value))}>
                            {TONIC_NAMES.map((name, pc) => <option key={name} value={pc}>{name}</option>)}
                        </select>
                    </Field>
                    <Field label="Scale / mode" onRandom={() => randomizeField('mode')}
                        onRelative={relativeKeys(settings.tonic, settings.mode).length ? relativeKey : undefined}>
                        <select disabled={settings.tonality.mode==='atonal'} value={settings.mode} onChange={(e) => update('mode', e.target.value)}>
                            {SCALE_FAMILIES.map(({ family, modes }) => (
                                <optgroup key={family} label={family}>
                                    {modes.map(({ id, name }) => <option key={id} value={id}>{settings.tonality.mode==='atonal'?'Chromatic · all twelve notes':name}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </Field>
                </div>
                <div className="gen-row">
                    <Field label="Tonality"><select aria-label="Tonality" value={settings.tonality.mode} onChange={e=>update('tonality',{...settings.tonality,mode:e.target.value})}>
                        <option value="tonal">Shared tonal centre</option><option value="atonal">Atonal · chromatic pitch sets</option><option value="bitonal">Bitonal · two tonal centres</option>
                    </select></Field>
                    {settings.tonality.mode==='bitonal'&&<Field label="Melody key offset"><select aria-label="Melody key offset" value={settings.tonality.separation} onChange={e=>update('tonality',{...settings.tonality,separation:Number(e.target.value)})}>
                        {Array.from({length:11},(_,i)=><option key={i+1} value={i+1}>{i+1} semitones above backing</option>)}
                    </select></Field>}
                </div>
                <div className="gen-row" data-tour="music-progression">
                    <Field label="Chords" onRandom={() => loadSettings(randomLength(gen.settings, randomLevel))}>
                        <select value={chords} onChange={(e) => update('progression', progressionForLength(settings, Number(e.target.value)))}>
                            {PROGRESSION_LENGTHS.map((n) => <option key={n} value={n}>{n} chords</option>)}
                        </select>
                    </Field>
                    <Field label={settings.tonality.mode==='atonal'?'Pitch-set cycle':'Progression'} onRandom={() => randomizeField('progression')} wide>
                        {settings.tonality.mode==='atonal'?<span>Chromatic sets · {chords} slots · no home chord</span>:<select value={settings.progression} onChange={(e) => update('progression', Number(e.target.value))}>
                            {[['tonal','Tonal progressions'],['unresolved','Unresolved · never the tonic'],['suspense','Suspense · leading-tone return']].map(([family,label])=><optgroup key={family} label={label}>
                                {progressionsOfLength(chords).filter(i=>progressionFamily(i)===family).map(i=><option key={i} value={i}>{PROGRESSIONS[i].join(' – ')}</option>)}
                            </optgroup>)}
                        </select>}
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

            {has(5) && <Evolution drift={settings.drift} home={{ tonic: settings.tonic, mode: settings.mode }} onChange={(drift) => update('drift', drift)}
                onRandom={() => randomize('conductor')} />}

            {has(6) && <WanderPanel wander={settings.wander} update={update}
                shown={[...Object.keys(shownRoles), ...(drumsOn ? ['perc'] : [])]} />}

            {has(1) && <AmbiencePanel levels={settings.ambience} shape={settings.ambienceShape} onShape={(s) => update('ambienceShape', s)}
                volume={settings.ambienceVolume} on={settings.playAmbience}
                onChange={changeAmbience} onVolume={(v) => update('ambienceVolume', v)} onToggle={() => togglePart('playAmbience')}
                onRandom={() => randomize('ambience')} />}

            {has(3) && <SoundsBar onGenerate={generateAll} generating={Object.values(generating).some(Boolean)} />}

            {has(1) && Object.entries(shownRoles).map(([role, { label }]) => (
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

                >
                    <Field label="Preset" onRandom={() => randomizePreset(role)} onGenerate={has(3) ? () => generateForRole(role) : undefined} generating={generating[role]} wide>
                        <PresetPicker value={roles[role].external?.label ?? roles[role].presetName} edited={roles[role].edited && !roles[role].external} onChange={(name) => loadPreset(role, name)} role={role}
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
                onVoice={choosePercussionVoice} voiceBusy={percussionBusy} voiceOpen={pickerRole==='perc'} onVoiceOpen={open=>choosePicker(open?'perc':null)} onDrums={(drums) => update('drums', drums)} onKit={(kit) => update('drumKit', kit)}
                onVolume={(v) => setVolume('perc', v)} onMix={changeMix} onAudition={() => gen.audition('perc')} />}

            {!has(3)&&pickerRole==='perc'&&<VoiceBrowser role="perc" value={settings.drums.kit} edited={percussionEdited(settings.drums.kit,settings.drumKit)} onChange={choosePercussionVoice} onClose={()=>choosePicker(null)}/>}

            {soundRole && (
                <Suspense fallback={null}>
                    <SoundWindow generator={gen} role={soundRole} roles={SOUND_ROLES} onRole={editSound} voice={roles[soundRole]} light={perfOn}
                        percussion={{ kit: settings.drums.kit, machine: percMachine }}
                        bus={settings.bus} onBus={(next) => update('bus', next)} onPerformance={changePerformance}
                        onNativePreset={loadPreset} onNativeImport={importPreset} onNativeEdited={onNativeEdited} onExternal={setExternal}
                        onPercussionKit={choosePercussionVoice} onMachine={setPercMachine} onClose={closeSound} />
                </Suspense>
            )}

            {tourOpen && <Tour key={tourRange.id} prompt={tourPrompt} fromStage={tourRange.from} toStage={tourRange.to}
                onUnlockAll={() => setStage(LAST_STAGE)} onStep={prepareTourStep} onClose={() => setTourOpen(false)} />}
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
