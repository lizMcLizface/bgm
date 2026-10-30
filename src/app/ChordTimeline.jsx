// Scrolling view of the generator's plan (drawn by timelineDraw.js) with a
// fixed playhead. Drawn on a canvas each animation frame straight from
// Generator.getPlan()/position(); React only re-renders when the chord
// under the playhead changes (for the text readout).
//
// The box keeps one shape (21:9, with all five voices showing): a voice that
// isn't playing leaves its slot empty in the strip instead of the box
// shrinking, and the canvas takes whatever height the box has.

import React, { useEffect, useRef, useState } from 'react';
import { drawTimeline, chordBlocks, chordRegions, MIN_HEIGHT } from './timelineDraw';
import { explainBar } from './rulebook/explain';
import { RULES } from './rulebook/model';
import { PAGE_IDS } from './rulebook/navigation';
import { scaleById, scaleSemitones } from './theory';
import Piano, { noteName } from '../labs/Piano';
import MiniFretboard, { INSTRUMENTS, anchorStrings, stringLetter, windowOctave, nearestPosition, chordLayout, windowDots, pickPlaying } from './MiniFretboard';
import { CloseIcon, SwordIcon } from './icons';
import HeroView from './HeroView';
import { emitQuest } from './quests/questBus';
import { resolvePatternOptions } from './patternDefaults';
import { DEFAULT_KEY_OCTAVES } from './Tracks';
import './chordExplanation.css';

const cssVar = (style, name) => style.getPropertyValue(name).trim();

export const timelineColors = (element) => {
    const style = getComputedStyle(element);
    return {
        text: cssVar(style, '--gen-text'),
        muted: cssVar(style, '--gen-muted'),
        border: cssVar(style, '--gen-border'),
        surface: cssVar(style, '--gen-bg'),
        panel: cssVar(style, '--gen-surface'),
        accent: cssVar(style, '--gen-accent'),
        accentText: cssVar(style, '--gen-accent-text'),
        pad: cssVar(style, '--gen-role-pad'),
        bass: cssVar(style, '--gen-role-bass'),
        lead: cssVar(style, '--gen-role-lead'),
        counter: cssVar(style, '--gen-role-counter'),
        perc: cssVar(style, '--gen-role-perc'),
    };
};

// The chord under the playhead and the next few distinct ones after it.
function readout(gen, pos) {
    const plan = gen.getPlan();
    const blocks = chordBlocks(plan, gen.beatsPerBar);
    const index = blocks.findIndex((b) => pos >= b.start && pos < b.end);
    if (index < 0) return null;
    const bar = plan.find((b) => b.bar === Math.floor(pos / gen.beatsPerBar));
    return {
        current: blocks[index].chord,
        next: blocks.slice(index + 1, index + 4).map((b) => b.chord),
        key: blocks[index].chord.keyName,
        keys: keyboards(gen, plan, bar?.bar ?? 0),
        bpm: bar ? Math.round(bar.bpm) : null,
        section: bar ? gen.sectionReadout?.(bar.bar) ?? null : null,
    };
}

// What the keyboard row shows: the key, and the chord now and the next distinct ones, each with its bar's scale.
function keyboards(gen, plan, bar) {
    const spot = (record) => {
        const tonic = record.music?.tonic ?? gen.settings.tonic, mode = record.music?.mode ?? gen.settings.mode;
        return { bar: record.bar, chord: record.chord, tonic, mode, scale: scaleSemitones(scaleById(mode).intervals).map((n) => (n + tonic) % 12) };
    };
    const upcoming = [];
    for (const record of plan.filter((r) => r.bar >= bar)) {
        if (!upcoming.length || upcoming.at(-1).chord.name !== record.chord.name) upcoming.push(spot(record));
        if (upcoming.length === 4) break;
    }
    return upcoming;
}

const SECTION_NAMES = { intro: 'Intro', build: 'Build', full: 'Full', breakdown: 'Breakdown' };
const sectionName = (type) => SECTION_NAMES[type] ?? 'Next part';

const sameReadout = (a, b) =>
    a && b && a.current.name === b.current.name && a.current.numeral === b.current.numeral
    && a.next.map((c) => c.name).join() === b.next.map((c) => c.name).join()
    && a.key === b.key && a.bpm === b.bpm
    && a.keys.map((k) => k.bar + k.chord.name + k.tonic + k.mode).join() === b.keys.map((k) => k.bar + k.chord.name + k.tonic + k.mode).join()
    && JSON.stringify(a.section) === JSON.stringify(b.section);

// The notes sounding now, per voice. The voices are named for what they play: the lead, a second lead
// (the counter-melody), the rhythm (the pad's chords) and the bass.
export const VOICES = [['lead', 'Lead', 'l'], ['counter', 'Second lead', 'c'], ['pad', 'Rhythm', 'p'], ['bass', 'Bass', 'b']];
// Tracking: a note stays fully visible for HOLD_SECONDS after it ends, then goes grey (white, on the piano) and fades out over the rest of FADE_SECONDS.
const HOLD_SECONDS = 0.15;
const FADE_SECONDS = 1.1;
const GREY = '#8c929c';
// How long before it sounds a note starts to appear.
const AHEAD_SECONDS = 1.2;
function usePlayed(generator, enabled, track, rootRef) {
    const [played, setPlayed] = useState(null);
    useEffect(() => {
        if (!enabled) { setPlayed(null); return undefined; }
        let last = '', shown = false;
        const registers = {}, heard = new Map();
        const tick = () => {
            // paused: what was last heard stays on the boards
            if (!generator.isRunning && shown) return;
            const now = generator.AC.currentTime, roles = {};
            // where each voice lives: the middle of its recent notes, moved only when it has really shifted
            for (const [role] of VOICES) {
                const midis = generator.noteLog.filter((n) => n.role === role).map((n) => n.midi).sort((a, b) => a - b);
                if (!midis.length) continue;
                const middle = midis[Math.floor(midis.length / 2)];
                if (registers[role] === undefined || Math.abs(middle - registers[role]) >= 5) registers[role] = middle;
            }
            for (const n of generator.noteLog) {
                if (n.role !== 'perc' && n.time <= now && now < n.time + n.length && !roles[n.role]?.includes(n.midi)) (roles[n.role] ??= []).push(n.midi);
            }
            // notes that have stopped sounding but not yet faded away, with how long ago (in fifths of a second)
            const fading = [];
            for (const role in roles) for (const midi of roles[role]) heard.set(role + ':' + midi, now);
            for (const [key, at] of heard) {
                const age = now - at;
                if (!track || age > FADE_SECONDS) { heard.delete(key); continue; }
                if (age > 0.05) fading.push({ role: key.split(':')[0], midi: Number(key.split(':')[1]), age: Math.round(age * 5) / 5 });
            }
            // notes already booked that have yet to sound, and how close each is to its cue (0 far, 1 now), in tenths
            const upcoming = [];
            if (track) for (const n of generator.noteLog) {
                if (n.role === 'perc' || n.time <= now) continue;
                const grow = Math.round(Math.max(0, Math.min(1, 1 - (n.time - now) / AHEAD_SECONDS)) * 10) / 10, same = upcoming.find((u) => u.role === n.role && u.midi === n.midi);
                if (!same) upcoming.push({ role: n.role, midi: n.midi, grow }); else same.grow = Math.max(same.grow, grow);
            }
            const sig = JSON.stringify([roles, registers, fading, upcoming]);
            if (sig === last) return;
            last = sig; shown = true;
            const colors = timelineColors(rootRef.current);
            setPlayed({ roles, fading, upcoming, registers: { ...registers }, colors: Object.fromEntries(VOICES.map(([role]) => [role, colors[role]])) });
        };
        tick();
        const id = setInterval(tick, 100);
        return () => clearInterval(id);
    }, [generator, enabled, track]);
    return played ?? { roles: {}, fading: [], upcoming: [], registers: {}, colors: {} };
}

// How a note that has stopped looks `age` seconds on: unchanged for a moment, then greying and fading away.
const fadeLook = (age) => {
    const t = Math.max(0, Math.min(1, (age - HOLD_SECONDS) / (FADE_SECONDS - HOLD_SECONDS)));
    return { grey: t, opacity: 1 - 0.88 * t };
};
const greyed = (color, grey) => (grey <= 0 ? color : `color-mix(in srgb, ${color} ${Math.round((1 - grey) * 100)}%, ${GREY})`);

// The notes to draw for some voices: those sounding now and, when tracking, those fading and (`ahead`) those about to sound.
// `fade` is how far a fading note has gone (0 to 1); `grow` how close a coming one is to its cue.
const heardNotes = (played, voices, track, ahead = false) => [
    ...voices.flatMap((role) => (played.roles[role] ?? []).map((midi) => ({ role, midi, base: played.colors[role], colors: [played.colors[role]], opacity: 1, fade: 0 }))),
    ...(track ? played.fading.filter((n) => voices.includes(n.role)).map((n) => {
        const { grey, opacity } = fadeLook(n.age);
        return { role: n.role, midi: n.midi, base: played.colors[n.role], colors: [greyed(played.colors[n.role], grey)], opacity, fade: grey };
    }) : []),
    ...(ahead ? played.upcoming.filter((n) => voices.includes(n.role)).map((n) => ({ role: n.role, midi: n.midi, base: played.colors[n.role], colors: [played.colors[n.role]], opacity: 1, ahead: true, grow: n.grow })) : []),
];

// A piano key: the voice's colour while it sounds, then fading to the white of the key; a note about to sound
// fills the key from the bottom up. When voices overlap on a key it is striped.
const KEY_WHITE = '#e7e7e3';
const pianoColors = (played, voices, track) => {
    const byPc = {};
    for (const note of heardNotes(played, voices, track, track)) (byPc[((note.midi % 12) + 12) % 12] ??= []).push(note);
    return Object.fromEntries(Object.entries(byPc).map(([pc, notes]) => {
        // sounding beats coming beats fading: a key about to be played again drops its afterglow
        const sounding = notes.filter((n) => !n.ahead && n.fade === 0), coming = notes.filter((n) => n.ahead);
        if (!sounding.length && coming.length) return [pc, { color: coming[0].base, ahead: Math.max(0.08, ...coming.map((n) => n.grow)) }];
        const now = sounding.length ? sounding : notes.filter((n) => !n.ahead), perRole = new Map();
        for (const n of now) if (!perRole.has(n.role) || n.fade < perRole.get(n.role).fade) perRole.set(n.role, n);
        const colors = [...perRole.values()].map((n) => (n.fade > 0 ? `color-mix(in srgb, ${n.base} ${Math.round((1 - n.fade) * 100)}%, ${KEY_WHITE})` : n.base));
        return [pc, colors.length === 1 ? colors[0] : `linear-gradient(180deg, ${colors.map((c, i) => `${c} ${100 * i / colors.length}% ${100 * (i + 1) / colors.length}%`).join(', ')})`];
    }));
};

// Under the playhead, one block per instrument so they can be compared: the first panel shows the scale
// (or the notes being played, in the voices' colours), then the chord now and the next three. Fixed in place;
// the chords only change when the chord under the playhead does.
const KeyRow = ({ title, keys, board, tools, live, onClose, onHero }) => {
    const [first] = keys;
    return (
        <section className="gen-chord-keys" aria-label={`${title}: key and chords`}>
            <header className="gen-chord-keys-head">
                <button type="button" className="gen-chord-keys-close" aria-label={`Close the ${title} pattern`} title="Close" onClick={onClose}><CloseIcon /></button>
                <h4>{title}</h4>
                <button type="button" className="gen-chord-keys-close gen-hero-open" aria-label={`Open the ${title} hero view`} title="Hero view: the notes coming at you, game-style" onClick={onHero}><SwordIcon /></button>
                <div className="gen-chord-keys-tools">{tools}</div>
            </header>
            <article>
                <small>{live ? 'Playing now' : 'Selected key'}</small>
                <h3>{noteName(60 + first.tonic).replace('4', '')} · {scaleById(first.mode).name}</h3>
                {board(first, false, live)}
            </article>
            {keys.map((k, i) => (
                <article key={k.bar}>
                    <small>{i === 0 ? 'Now' : `Next · bar ${k.bar + 1}`}</small>
                    <h3>{k.chord.name}</h3>
                    {board(k, true)}
                </article>
            ))}
        </section>
    );
};

// Tracking follows one voice: a note about to play appears, fills in when it sounds, holds, then fades away.
const TrackButton = ({ track, single, onChange }) => (
    <button type="button" aria-pressed={track && single} disabled={!single} onClick={() => onChange({ track: !track })}
        title={single ? 'Track the notes: one about to play builds up before it sounds, then it fades away after' : 'Tracking needs a single voice: show just one'}>Track</button>
);

// What the first panel shows, as one group: the scale or the notes being played, and, for the latter, how they are marked.
const PlayingOptions = ({ name, mode, exact, track, single, onChange }) => (
    <div className="gen-anchor" role="group" aria-label={`${name}: first panel`}>
        <span>Visualize</span>
        <div className="gen-joined">
            {[['scale', 'Scale'], ['played', 'Playing']].map(([id, text]) => (
                <button key={id} type="button" aria-pressed={mode === id} title={id === 'scale' ? 'Show the scale' : "Show the notes as they are played, in each voice's colour"} onClick={() => onChange({ mode: id })}>{text}</button>
            ))}
            {mode === 'played' && exact !== undefined && (
                <button type="button" aria-pressed={exact} title="Mark only the fret that sounds the exact pitch; off marks the note name in any octave" onClick={() => onChange({ exact: !exact })}>Exact pitch</button>
            )}
            {mode === 'played' && <TrackButton track={track} single={single} onChange={onChange} />}
        </div>
    </div>
);

// Which voices the Playing panel follows; each keeps its colour so several can sound at once and still be told apart.
const VoiceToggle = ({ name, voices, onChange }) => (
    <div className="gen-anchor gen-voices" role="group" aria-label={`${name}: voices to show`}>
        <span>Show</span>
        {VOICES.map(([role, text]) => (
            <button key={role} type="button" aria-pressed={voices.includes(role)} title={`${voices.includes(role) ? 'Stop showing' : 'Show'} the ${text.toLowerCase()}`}
                onClick={() => onChange({ voices: voices.includes(role) ? voices.filter((v) => v !== role) : VOICES.map(([r]) => r).filter((r) => r === role || voices.includes(r)) })}>
                <i style={{ background: `var(--gen-role-${role})` }} />{text}
            </button>
        ))}
    </div>
);

// Which string the scale pattern hangs off: the root's fret on it is where the window starts.
const AnchorToggle = ({ instrument, anchor, onChange, marks = {} }) => {
    const { strings } = INSTRUMENTS[instrument];
    return (
        <div className="gen-anchor" role="group" aria-label={`${INSTRUMENTS[instrument].name} pattern: root on string`}>
            <span>Root on</span>
            {anchorStrings(strings).map((index) => (
                <button key={index} type="button" aria-pressed={anchor === index} title={marks[index] ? `Where the ${marks[index].map((m) => m.name).join(' and ')} play${marks[index].length > 1 ? '' : 's'} most${marks[index].some((m) => m.up) ? ' (an octave up the neck: shift the window 12 frets)' : ''}` : undefined}
                    onClick={() => onChange({ anchor: index })}>
                    {stringLetter(strings, index)}
                    {marks[index] && <span className="gen-mark">{marks[index].map((m) => <i key={m.role} style={{ background: m.color }} />)}</span>}
                </button>
            ))}
        </div>
    );
};

// Tracking only works for a block that shows a single voice.
const isTracking = (id, options) => !!options[id]?.track && (options[id].voices ?? defaultVoices(id)).length === 1;

// Each instrument starts on the voice that lives in its range.
const defaultVoices = (instrument) => resolvePatternOptions()[instrument].voices;
// Where a voice sits before it has played anything: the middle of its octave on the computer keyboard.
const fallbackRegister = (role) => (DEFAULT_KEY_OCTAVES[role] + 1) * 12 + 5;

const FretboardRow = ({ instrument, keys, options, onOptions, played, onClose, onHero }) => {
    const octaves = useRef({});
    const { name, strings } = INSTRUMENTS[instrument];
    const anchors = anchorStrings(strings), anchor = anchors.includes(options?.anchor) ? options.anchor : anchors[0], mode = options?.mode ?? 'scale';
    const voices = options?.voices ?? defaultVoices(instrument), exact = options?.exact ?? true, single = voices.length === 1, track = !!options?.track && single;
    // Where each followed voice sits on the neck (marked on the "Root on" buttons), and, when exact, the register the chords are drawn in.
    const marks = {}, registers = [];
    if (mode === 'played') for (const role of voices) {
        const register = played.registers[role] ?? fallbackRegister(role);
        registers.push(register);
        const spot = nearestPosition(strings, keys[0].tonic, register);
        (marks[spot.anchor] ??= []).push({ role, name: VOICES.find(([r]) => r === role)[1], color: played.colors[role], up: spot.up });
    }
    // The window follows the root string; whether it sits at the low or the high octave of the neck follows where the voices play.
    const spotKey = anchor + ':' + keys[0].tonic;
    const shift = mode === 'played' && registers.length ? (octaves.current[spotKey] = windowOctave(strings, anchor, keys[0].tonic, registers.reduce((a, b) => a + b, 0) / registers.length, octaves.current[spotKey] ?? 0)) : 0;
    // The Playing board: the sounding notes of the followed voices, placed against the chord now (see pickPlaying).
    let lit;
    if (mode === 'played') {
        const notes = heardNotes(played, voices, track, track);
        const now = chordLayout(strings, anchor, keys[0].tonic, keys[0].chord.pitchClasses, { shape: instrument === 'guitar', shift });
        // positions are the same frets whichever window shows them; the pool is the chord board's highlighted dots
        const { dots } = windowDots(strings, anchor, keys[0].tonic, shift);
        const pool = new Set(dots.filter((d) => [...now.held].some((h) => h.string === d.string && h.fret === d.fret)));
        lit = pickPlaying(strings, dots, pool, notes, exact);
    }
    return (
        <KeyRow title={`${name} · ${strings.length} strings`} keys={keys} onClose={onClose} onHero={onHero} live={mode === 'played'}
            tools={<>
                <AnchorToggle instrument={instrument} anchor={anchor} onChange={onOptions} marks={marks} />
                <PlayingOptions name={name} mode={mode} exact={exact} track={!!options?.track} single={single} onChange={onOptions} />
                {mode === 'played' && <VoiceToggle name={name} voices={voices} onChange={onOptions} />}
            </>}
            board={(k, withChord, live) => (
                <MiniFretboard instrument={instrument} anchor={anchor} tonic={k.tonic} scale={k.scale} lit={live ? lit : undefined} shift={shift}
                    chord={withChord ? k.chord.pitchClasses : undefined} chordRoot={k.chord.pitchClasses[0] ?? k.tonic} shape={instrument === 'guitar'}
                    label={withChord ? `${name} pattern for ${k.chord.name}` : live ? `${name} pattern of the notes playing` : `${name} pattern for the selected scale`} />
            )} />
    );
};

const ChordKeys = ({ keys, patterns, onPattern, options, onOptions, played, onHero }) => (
    <>
        {patterns.piano && <KeyRow title="Piano" keys={keys} onClose={() => onPattern('piano', false)} onHero={() => onHero('piano')} live={options.piano?.mode === 'played'}
            tools={<>
                <PlayingOptions name="Piano" mode={options.piano?.mode ?? 'scale'} track={!!options.piano?.track} single={(options.piano?.voices ?? defaultVoices('piano')).length === 1} onChange={(patch) => onOptions('piano', patch)} />
                {options.piano?.mode === 'played' && <VoiceToggle name="Piano" voices={options.piano.voices ?? defaultVoices('piano')} onChange={(patch) => onOptions('piano', patch)} />}
            </>}
            board={(k, withChord, live) => (
                <Piano mini low={60} high={71} scale={k.scale} chord={withChord ? k.chord.pitchClasses : undefined} colors={live ? pianoColors(played, options.piano.voices ?? defaultVoices('piano'), isTracking('piano', options)) : undefined}
                    active={live ? Object.keys(pianoColors(played, options.piano.voices ?? defaultVoices('piano'), isTracking('piano', options))).map((pc) => 60 + Number(pc)) : undefined}
                    root={withChord ? k.chord.pitchClasses[0] ?? k.tonic : k.tonic} label={withChord ? `Chord ${k.chord.name}` : live ? 'Notes playing' : 'Notes of the selected scale'} />
            )} />}
        {patterns.guitar && <FretboardRow instrument="guitar" keys={keys} options={options.guitar} played={played} onOptions={(patch) => onOptions('guitar', patch)} onClose={() => onPattern('guitar', false)} onHero={() => onHero('guitar')} />}
        {patterns.bass && <FretboardRow instrument="bass" keys={keys} options={options.bass} played={played} onOptions={(patch) => onOptions('bass', patch)} onClose={() => onPattern('bass', false)} onHero={() => onHero('bass')} />}
    </>
);

// `tracks`: the role strip (Tracks.jsx) shown left of the canvas; its
// colour swatches double as the legend. `patterns`: which of the piano / guitar / bass blocks show under the playhead.
const ChordTimeline = ({ generator, tracks, onExploreRule, patterns = {}, onPattern, options: chosen = {}, onOptions }) => {
    // what each block is set to, its defaults filled in
    const options = resolvePatternOptions(chosen);
    const canvasRef = useRef(null);
    const [now, setNow] = useState(null), [hero, setHero] = useState(null);
    const rootRef = useRef(null), buttons = useRef(new Map()), hideTimer = useRef(null), targetsRef = useRef([]), restoringFocus = useRef(false);
    const playing = (id) => patterns[id] && options[id]?.mode === 'played';
    const played = usePlayed(generator, ['piano', 'guitar', 'bass'].some(playing), ['piano', 'guitar', 'bass'].some((id) => playing(id) && isTracking(id, options)), rootRef);
    const [targets, setTargets] = useState([]), [selection, setSelection] = useState(null), [pinned, setPinned] = useState(false);
    const cancelHide = () => clearTimeout(hideTimer.current);
    const close = (restoreFocus = false) => {
        cancelHide(); setSelection(null); setPinned(false);
        if (restoreFocus) {
            restoringFocus.current = true;
            buttons.current.get(selection?.key)?.focus();
            restoringFocus.current = false;
        }
    };
    const dismissLater = () => {
        cancelHide();
        if (!pinned) hideTimer.current = setTimeout(() => setSelection(null), 180);
    };
    const inspect = (target, element, pin = false) => {
        cancelHide();
        if (pinned && !pin) return;
        const rect = element.getBoundingClientRect(), root = rootRef.current.getBoundingClientRect();
        setSelection({ ...target, left: rect.left - root.left, top: rect.bottom - root.top + 8 });
        if (pin) setPinned(true);
    };
    useEffect(() => () => clearTimeout(hideTimer.current), []);
    useEffect(() => {
        if (!selection) return;
        const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(true); } };
        const outside = e => { if (!rootRef.current?.contains(e.target) || !e.target.closest('.gen-chord-target, .gen-chord-popover')) close(); };
        document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', outside);
        return () => { document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside); };
    }, [selection]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let width = 0;
        let height = MIN_HEIGHT;
        let frame = 0;
        let last = null;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            width = canvas.clientWidth;
            height = Math.max(MIN_HEIGHT, canvas.clientHeight);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();

        const loop = () => {
            const pos = generator.position();
            const plan = generator.getPlan();
            drawTimeline(ctx, width, height, {
                plan, beatsPerBar: generator.beatsPerBar, meter: generator.meter, loop: generator.loop, roles: generator.roles,
            }, pos, timelineColors(canvas));
            const regions = chordRegions(plan, generator.beatsPerBar, width, pos);
            if (regions.length !== targetsRef.current.length || regions.some((r, i) => r.key !== targetsRef.current[i]?.key || r.record !== targetsRef.current[i]?.record)) {
                targetsRef.current = regions; setTargets(regions);
            }
            for (const region of regions) {
                const button = buttons.current.get(region.key);
                if (button) { button.style.left = region.left + 'px'; button.style.width = region.width + 'px'; }
            }
            const r = readout(generator, pos);
            if (!sameReadout(r, last)) {
                last = r;
                setNow(r);
            }
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [generator]);

    return (
        <>
        <section className="gen-timeline" ref={rootRef}>
            <div className="gen-timeline-readout" aria-live="polite">
                {now && (
                    <>
                        <span className="gen-now">
                            <strong>{now.current.name}</strong> <span>{now.current.numeral}</span>
                        </span>
                        <span className="gen-key">{now.key}{now.bpm ? ` · ${now.bpm} BPM` : ''}</span>
                        {now.next.length > 0 && (
                            <span className="gen-next">
                                then {now.next.map((c) => c.name).join(' → ')}
                            </span>
                        )}
                        {now.section && (
                            // the form: this section, what comes next and when; go on now, or hold it
                            <span className="gen-section">
                                <span>{sectionName(now.section.type)}{now.section.holding ? ' · held'
                                    : ` · ${sectionName(now.section.next)} in ${now.section.left} ${now.section.left === 1 ? 'bar' : 'bars'}`}</span>
                                <button type="button" disabled={now.section.holding} title="Go on to the next section at the next bar line"
                                    onClick={() => generator.nextSectionNow()}>Next now</button>
                                <button type="button" aria-pressed={now.section.holding} title="Keep playing this section until you let it go"
                                    onClick={() => generator.holdSection(!now.section.holding)}>Hold</button>
                            </span>
                        )}
                    </>
                )}
            </div>
            <div className={`gen-timeline-body${tracks ? '' : ' is-no-tracks'}`}>
                {tracks}
                <div className="gen-timeline-roll">
                    <div className="gen-timeline-stage">
                    <canvas ref={canvasRef} className="gen-timeline-canvas" />
                    <div className="gen-chord-targets" aria-label="Chord explanations">
                        {targets.map(target => <button key={target.key} ref={el => { if (el) buttons.current.set(target.key, el); else buttons.current.delete(target.key); }}
                            className="gen-chord-target" style={{ left: target.left, width: target.width, top: target.top, height: target.height }}
                            aria-label={`Explain ${target.chord.name}, ${target.endBar > target.startBar + 1 ? 'bars ' + (target.startBar + 1) + ' to ' + target.endBar : 'bar ' + (target.startBar + 1)}`}
                            aria-expanded={selection?.key === target.key} aria-controls={selection?.key === target.key ? 'gen-chord-explanation' : undefined}
                            onPointerEnter={e => { if (e.pointerType !== 'touch') inspect(target, e.currentTarget); }} onPointerLeave={dismissLater}
                            onFocus={e => { if (!restoringFocus.current) inspect(target, e.currentTarget); }} onBlur={dismissLater}
                            onClick={e => inspect(target, e.currentTarget, true)} />)}
                    </div>
                    </div>
                </div>
            </div>
            {selection && <aside id="gen-chord-explanation" className="gen-chord-popover" role="dialog" aria-label="Why this chord?"
                style={{ '--chord-left': selection.left + 'px', top: selection.top }} onPointerEnter={cancelHide} onPointerLeave={dismissLater} onFocusCapture={cancelHide} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) dismissLater(); }}>
                <header><div><strong>Why this chord?</strong><small>{pinned ? 'Selected slot' : 'Click a chord to keep this open'}</small></div><button aria-label="Close chord explanation" onClick={() => close(true)}>×</button></header>
                <h3>{selection.chord.name} <small>· {selection.endBar > selection.startBar + 1 ? `Bars ${selection.startBar + 1}–${selection.endBar}` : `Bar ${selection.startBar + 1}`}</small></h3>
                {explainBar(selection.record).map((reason, i) => <div className="gen-chord-reason" key={i}><strong>{reason.title}</strong><p>{reason.text}</p>
                    {onExploreRule && RULES.some(r => r.id === reason.rule && PAGE_IDS.includes(r.chapter)) && <button onClick={() => { onExploreRule(reason.rule); close(); }}>Explore this rule →</button>}
                </div>)}
            </aside>}
        </section>
        {(patterns.piano || patterns.guitar || patterns.bass) && now?.keys.length > 0 && <ChordKeys keys={now.keys} patterns={patterns} onPattern={onPattern} options={options} onOptions={onOptions} played={played} onHero={(id) => { if (hero !== id) emitQuest('hero', { id }); setHero(hero === id ? null : id); }} />}
        {hero && patterns[hero] && (
            <HeroView generator={generator} instrument={hero} voices={options[hero]?.voices ?? defaultVoices(hero)} onClose={() => setHero(null)}
                colorsOf={() => timelineColors(rootRef.current)}
                voiceToggle={<VoiceToggle name={hero} voices={options[hero]?.voices ?? defaultVoices(hero)} onChange={(patch) => onOptions(hero, patch)} />} />
        )}
        </>
    );
};

export default ChordTimeline;
