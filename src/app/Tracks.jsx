// Per-role mute / solo / keyboard-arm controls (a DAW-style track strip
// beside the timeline, and the same buttons in each role panel), plus
// playing the armed role live: from the computer keyboard always, from MIDI
// only after "Connect MIDI" (requesting MIDI access prompts for permission,
// so it is never done on page load).

import React, { useEffect, useRef, useState } from 'react';
import { DiceIcon, PencilIcon, SparkIcon } from './icons';

// Physical key positions (KeyboardEvent.code), so QWERTZ/AZERTY work too:
// the home row is the white keys, the row above the black keys.
const KEY_OFFSETS = {
    KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
    KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};
export const DEFAULT_KEY_OCTAVES = { pad: 4, bass: 2, lead: 5 };
const OCTAVE_RANGE = [0, 7];

const isTyping = (target) => target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) && target.type !== 'range' && target.type !== 'checkbox';

/**
 * M / S / ⌨ toggles for one role, ✎ to edit its sound and - when given
 * onRandom / onGenerate - a random preset or a newly generated sound.
 */
export const RoleButtons = ({ role, label, mix, armed, onMix, onArm, onEdit, onRandom, onGenerate, generating }) => (
    <div className="gen-rolebuttons" role="group" aria-label={`${label} controls`}>
        <button type="button" className={mix.mute ? 'is-on is-mute' : ''} aria-pressed={mix.mute}
            title="Mute" onClick={() => onMix(role, { mute: !mix.mute })}>M</button>
        <button type="button" className={mix.solo ? 'is-on is-solo' : ''} aria-pressed={mix.solo}
            title="Solo" onClick={() => onMix(role, { solo: !mix.solo })}>S</button>
        <button type="button" className={armed ? 'is-on is-arm' : ''} aria-pressed={armed}
            title="Play this voice with the keyboard / MIDI" onClick={() => onArm(armed ? null : role)}>⌨</button>
        <button type="button" title="Edit sound" aria-label={`Edit ${label} sound`} onClick={() => onEdit(role)}><PencilIcon /></button>
        {onRandom && (
            <button type="button" title="Random preset" aria-label={`Random ${label} preset`} onClick={() => onRandom(role)}><DiceIcon /></button>
        )}
        {onGenerate && (
            <button type="button" title="Generate a new sound" aria-label={`Generate a new ${label} sound`}
                disabled={generating} onClick={() => onGenerate(role)}><SparkIcon /></button>
        )}
    </div>
);

/**
 * Plays the armed role from the computer keyboard (and MIDI once
 * connected). Z / X shift the octave.
 * @returns {{ octave: number, connectMidi: function, midiStatus: string }}
 */
export function useLivePlay(generator, armed) {
    const [octaves, setOctaves] = useState(DEFAULT_KEY_OCTAVES);
    const [midiStatus, setMidiStatus] = useState('');
    const state = useRef({ armed, octaves, held: new Map() });
    state.current.armed = armed;
    state.current.octaves = octaves;

    const releaseAll = () => {
        state.current.held.forEach(({ role, id }) => generator.liveNoteOff(role, id));
        state.current.held.clear();
    };

    // Re-arming (or disarming) lets go of anything still held.
    useEffect(() => releaseAll, [armed]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!armed) return undefined;
        const down = (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
            if (e.code === 'KeyZ' || e.code === 'KeyX') {
                const step = e.code === 'KeyZ' ? -1 : 1;
                setOctaves((o) => ({ ...o, [armed]: Math.max(OCTAVE_RANGE[0], Math.min(OCTAVE_RANGE[1], o[armed] + step)) }));
                e.preventDefault();
                return;
            }
            const offset = KEY_OFFSETS[e.code];
            if (offset === undefined || state.current.held.has(e.code)) return;
            e.preventDefault();
            const midi = 12 * (state.current.octaves[armed] + 1) + offset;
            state.current.held.set(e.code, { role: armed, id: generator.liveNoteOn(armed, midi, 0.8) });
        };
        const up = (e) => {
            const held = state.current.held.get(e.code);
            if (!held) return;
            generator.liveNoteOff(held.role, held.id);
            state.current.held.delete(e.code);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', releaseAll);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', releaseAll);
        };
    }, [armed, generator]); // eslint-disable-line react-hooks/exhaustive-deps

    const connectMidi = async () => {
        if (!navigator.requestMIDIAccess) {
            setMidiStatus('MIDI is not supported in this browser');
            return;
        }
        try {
            const access = await navigator.requestMIDIAccess();
            const onMessage = ({ data }) => {
                const [status, note, velocity] = data;
                const command = status & 0xf0;
                const key = `midi-${note}`;
                const role = state.current.armed;
                if (command === 0x90 && velocity > 0) {
                    if (!role || state.current.held.has(key)) return;
                    state.current.held.set(key, { role, id: generator.liveNoteOn(role, note, velocity / 127) });
                } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
                    const held = state.current.held.get(key);
                    if (!held) return;
                    generator.liveNoteOff(held.role, held.id);
                    state.current.held.delete(key);
                }
            };
            const attach = () => {
                const inputs = [...access.inputs.values()];
                inputs.forEach((input) => { input.onmidimessage = onMessage; });
                setMidiStatus(inputs.length ? `MIDI: ${inputs.map((i) => i.name).join(', ')}` : 'MIDI connected - no devices found');
            };
            access.onstatechange = attach;
            attach();
        } catch (err) {
            setMidiStatus('MIDI access was denied');
        }
    };

    return { octave: armed ? octaves[armed] : null, connectMidi, midiStatus };
}

/** The strip beside the timeline: one row per role, then the keys hint. */
/** presets: role -> { name, edited } (shown beside the role's name). */
export const TrackStrip = ({ roles, presets, mix, armed, onMix, onArm, onEdit, onRandom, onGenerate, generating, live }) => (
    <div className="gen-tracks">
        {Object.entries(roles).map(([role, { label }]) => (
            <div key={role} className="gen-track">
                <span className="gen-track-name">
                    <i className={`gen-swatch gen-swatch-${role}`} />
                    {label.split(' / ')[0]}
                    {presets[role] && (
                        <span className="gen-track-preset" title={presets[role].name}>
                            {presets[role].name}{presets[role].edited ? ' (edited)' : ''}
                        </span>
                    )}
                </span>
                <RoleButtons role={role} label={label} mix={mix[role]} armed={armed === role} onMix={onMix} onArm={onArm} onEdit={onEdit}
                    onRandom={onRandom} onGenerate={onGenerate} generating={generating[role]} />
            </div>
        ))}
        <div className="gen-keys-hint">
            {armed
                ? <>Keys A–; play {roles[armed].label.split(' / ')[0].toLowerCase()}, Z/X octave (C{live.octave})</>
                : 'Arm ⌨ to play a voice with your keyboard'}
            <button type="button" className="gen-linkbutton" onClick={live.connectMidi}>Connect MIDI</button>
            {live.midiStatus && <span>{live.midiStatus}</span>}
        </div>
    </div>
);
