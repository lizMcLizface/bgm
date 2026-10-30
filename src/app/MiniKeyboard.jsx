// A small on-screen piano that plays the armed voice (the ⌨ button on a voice), for touch screens and for
// anyone without a MIDI keyboard. It is the same piano the timeline's pattern blocks draw (labs/Piano.jsx), so the
// keys of the scale are marked the same way; no chord is marked, since you are free to play any note.
// It sits over the bottom of the page; a note sounds while its key is held. The computer keyboard and MIDI keep
// working as before (useLivePlay in Tracks.jsx).

import React, { useEffect, useRef, useState } from 'react';
import Piano from '../labs/Piano';
import FeatureIntro from './FeatureIntro';
import { DEFAULT_KEY_OCTAVES, midiHeld } from './Tracks';
import { scaleById, scaleSemitones } from './theory';
import { emitQuest } from './quests/questBus';
import './quests/quests.css';

const SPAN = 16; // C up to the E an octave above: ten white keys
const RANGE = [0, 7];

/**
 * @param {object} props
 * @param {string} props.role - the armed voice ('lead', 'pad', 'bass' ...)
 * @param {string} props.label - its name, for the heading
 * @param {object} props.generator - liveNoteOn / liveNoteOff, and the settings (key and scale)
 * @param {function} props.onClose - disarm
 */
export default function MiniKeyboard({ role, label, generator, onClose }) {
    const [octave, setOctave] = useState(DEFAULT_KEY_OCTAVES[role] ?? 4);
    const held = useRef(new Map());
    useEffect(() => { setOctave(DEFAULT_KEY_OCTAVES[role] ?? 4); }, [role]);

    const { tonic, mode } = generator.settings;
    const scale = scaleSemitones(scaleById(mode).intervals).map((n) => (n + tonic) % 12);

    const stop = (pointer) => {
        const note = held.current.get(pointer);
        if (!note) return;
        generator.liveNoteOff(note.role, note.id);
        midiHeld.delete(note.midi);
        held.current.delete(pointer);
    };
    const start = (pointer, midi) => {
        stop(pointer);
        held.current.set(pointer, { role, id: generator.liveNoteOn(role, midi, 0.8), midi });
        midiHeld.add(midi);
        emitQuest('liveplay', { role });
    };
    // let go of everything when the voice changes or the keyboard goes
    useEffect(() => () => [...held.current.keys()].forEach(stop), [role]); // eslint-disable-line react-hooks/exhaustive-deps

    const low = 12 * (octave + 1);
    return (
        <div className="gen-minikeyboard" role="dialog" aria-label={`Play the ${label} on screen`}>
            <FeatureIntro ids="key-input" />
            <div className="gen-minikeyboard-head">
                <strong>Playing: {label}</strong>
                <span>
                    <button type="button" onClick={() => setOctave((o) => Math.max(RANGE[0], o - 1))} aria-label="Octave down" title="Lower (Z)">−</button>
                    <span aria-live="polite">Octave {octave}</span>
                    <button type="button" onClick={() => setOctave((o) => Math.min(RANGE[1], o + 1))} aria-label="Octave up" title="Higher (X)">+</button>
                    <button type="button" onClick={onClose} aria-label="Close the on-screen keys" title="Stop playing this voice">×</button>
                </span>
            </div>
            <Piano low={low} high={low + SPAN} scale={scale} root={tonic} onDown={start} onUp={stop} label={`${label} keys`} />
        </div>
    );
}
