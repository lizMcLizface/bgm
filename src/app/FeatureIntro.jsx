// A short explanation shown the first time a menu or window is opened, in the tour's style: a floating card
// beside the menu, with a frame round the part it is about and a Got it button. It stays gone afterwards (per
// browser). Several can follow each other in one menu: `ids` lists the ones that apply now, in order, and the
// first one not yet seen shows (so choosing Landscape or Fluid in the Look menu explains that one's options).
//
// New features get one by adding an entry to INTROS and putting <FeatureIntro ids={[...]} /> in the menu.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readPref, writePref } from './prefs';
import './quests/quests.css';

export const INTROS_KEY = 'bgm-intros-v1';

/** `target` is the part to frame (default: the whole menu). */
export const INTROS = {
    'look-menu': {
        title: 'Look',
        target: '[data-intro="look-background"]',
        text: 'Theme is light, dark or following your device. Background is what moves behind the page: None keeps it plain and is lightest on the processor, Landscape is a pixel scene that follows the clock and the preset, and Fluid is flowing colour shaped by the notes (it unlocks as you go).',
    },
    'look-landscape': {
        title: 'Landscape options',
        target: '[data-intro="look-landscape"]',
        text: 'Each preset brings its own landscape, weather and hour; untick "Preset picks the landscape" to keep yours. The two ticks below let the time of day and the seasons keep moving on their own, and unticked they hold still. Kind is the place, Weather the sky, Time of day how fast the day passes (or fix an hour) and Season how the year turns. The dice builds a new landscape of the same kind.',
    },
    'look-fluid': {
        title: 'Fluid options',
        target: '[data-intro="look-fluid"]',
        text: 'The notes stir the flow and the harmony colours it. Colours and Shuffle colours set the palette. Flow look changes how the flow is drawn, Quality trades detail for speed on slower machines, Jet direction sets where the notes push from and Trail lifetime how long colour lingers. Clear flow empties the screen, and the finer settings are further down.',
    },
    'key-input': {
        title: 'Playing a voice yourself',
        text: 'The ⌨ button on a voice lets you play it over the music. Tap these keys, or use the computer keyboard (the A S D F row are the white keys, W E T Y U the black ones, Z and X change octave) or a MIDI keyboard. Your notes sound with the voice you chose, in its sound, so try it on the lead, then the rhythm, then the bass.',
    },
    'voice-picker': {
        title: 'Choosing a sound',
        target: '.gen-vb .gen-pb-head input[type="search"]',
        text: 'This is every sound the page has, a lot of it. You do not need all of it: search by a word like soft, dark or bell, or follow the next few steps to narrow it down. The dice on each voice picks a good sound without opening this list at all.',
    },
    'voice-picker-kinds': {
        title: 'Kinds of sound',
        target: '.gen-vb [aria-label="Kinds of sound"]',
        text: 'The sounds are in blocks by kind: pads, bass, leads, keys and plucks, textures and so on, with how many are in each. Click one to jump to its block. The list opens at the block that holds the current sound.',
    },
    'voice-picker-filters': {
        title: 'Kind of instrument',
        target: '.gen-vb .gen-pb-families:not(.gen-pb-bases)',
        text: 'These buttons filter by the kind of instrument: strings, brass, woodwind, choir, organ and more. Press one to show only that kind, and again to clear it.',
    },
    'voice-picker-backend': {
        title: 'What a sound is built on',
        target: '.gen-vb .gen-pb-bases',
        text: 'Every sound is made by one of a few engines: the calm polyphonic synth, the FM synth, the piano model, the plucked-string model, plain Web Audio or a classic synth. This filters by engine, and each card says which one it uses. You can ignore it, but it explains why two similar-sounding cards can feel so different.',
    },
    'voice-picker-phrases': {
        title: 'Hear it in context',
        target: '.gen-vb .gen-pb-phrases',
        text: 'The buttons 1 to 5 under a card play a short phrase on that sound: a bass line, a slow bass, a chord, an arpeggio or a lead melody, over the key and chords you are playing in. Clicking the card itself puts the sound on the voice. Try a few before settling.',
    },
    'options-menu': {
        title: 'Options',
        text: 'Copy a link to exactly what you hear, or one that also carries how the page looks. Set a sleep timer, save the music as an audio file, connect a MIDI keyboard, or repeat the tour. Start over returns to only the basics.',
    },
    'audio-menu': {
        title: 'Audio',
        text: 'The speaker shows how hard the sound engine is working. If the sound crackles or drops out, raise the buffer size or lighten the reverb here; that trades a little delay for steadier sound.',
    },
    'preset-list': {
        title: 'Presets',
        text: 'Each preset is a whole soundscape - key, feel, drums, sounds and landscape. Browse by category or search, and click one to hear it at the next chord. Setups you save yourself are kept under Mine.',
    },
};

const CARD_WIDTH = 300;
const GAP = 12;
const seen = () => readPref(INTROS_KEY, {}) || {};
const rect = (el) => {
    if (!el) return null;
    const { left, top, width, height } = el.getBoundingClientRect();
    return width > 0 && height > 0 ? { left, top, width, height } : null;
};

// Beside the menu where there is room (left first, the menus hang from the right), else docked to the bottom.
function place(menu, target, height) {
    const top = Math.min(Math.max(8, (target ?? menu).top), Math.max(8, window.innerHeight - height - 8));
    if (menu.left - GAP - CARD_WIDTH >= 8) return { left: menu.left - GAP - CARD_WIDTH, top, width: CARD_WIDTH };
    if (menu.left + menu.width + GAP + CARD_WIDTH <= window.innerWidth - 8) return { left: menu.left + menu.width + GAP, top, width: CARD_WIDTH };
    return { left: 12, bottom: 12, width: Math.min(CARD_WIDTH + 100, window.innerWidth - 24) };
}

/** @param {{ids: string[]|string}} props - keys of INTROS that apply now, in the order to show them */
export default function FeatureIntro({ ids }) {
    const list = Array.isArray(ids) ? ids : [ids];
    const marker = useRef(null);
    const card = useRef(null);
    const [gone, setGone] = useState(seen);
    const [open, setOpen] = useState(false);
    const [layout, setLayout] = useState(null);
    const [missing, setMissing] = useState([]);
    // the steps still to show: not seen, and with something on the page to frame
    const todo = list.filter((id) => INTROS[id] && gone[id] !== true && !missing.includes(id));
    const current = todo[0];
    const intro = current && INTROS[current];
    const remaining = todo.length;
    const total = list.filter((id) => INTROS[id] && !missing.includes(id)).length;
    const position = total - remaining + 1;

    // Open while the menu (a <details>) is open, or while the window it sits in exists.
    useEffect(() => {
        const details = marker.current?.closest('details');
        if (!details) { setOpen(true); return undefined; }
        const sync = () => setOpen(details.open);
        sync();
        details.addEventListener('toggle', sync);
        return () => details.removeEventListener('toggle', sync);
    }, []);

    // Follow the menu and the part framed (the menu moves with the page and its content changes).
    useEffect(() => {
        if (!open || !intro) { setLayout(null); return undefined; }
        const panel = marker.current?.closest('.gen-settings-menu, [role="dialog"]');
        // a part further down a scrolling list is brought into view first
        const part = intro.target && document.querySelector(intro.target);
        if (part && part.scrollIntoView) part.scrollIntoView({ block: 'nearest' });
        let frame;
        const measure = () => {
            const menu = rect(panel);
            const found = intro.target ? document.querySelector(intro.target) : panel;
            // a step whose part is not on the page (a filter that this voice does not have) is skipped
            if (intro.target && !found && panel) { setMissing((old) => (old.includes(current) ? old : [...old, current])); frame = requestAnimationFrame(measure); return; }
            const target = rect(found);
            if (menu && target) {
                const height = card.current ? card.current.offsetHeight : 160;
                const next = { frame: target, card: place(menu, target, height) };
                setLayout((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
            } else setLayout(null);
            frame = requestAnimationFrame(measure);
        };
        measure();
        return () => cancelAnimationFrame(frame);
    }, [open, intro, current]);

    const dismiss = () => {
        setLayout(null);
        writePref(INTROS_KEY, { ...seen(), [current]: true });
        setGone((old) => ({ ...old, [current]: true }));
    };
    const host = typeof document !== 'undefined' ? document.querySelector('main.gen') : null;
    return (
        <>
            <i hidden ref={marker} />
            {layout && intro && host && createPortal(
                <>
                    <div className="gen-intro-frame" style={{ left: layout.frame.left - 4, top: layout.frame.top - 4, width: layout.frame.width + 8, height: layout.frame.height + 8 }} />
                    {/* a click here is not a click outside the menu, which would close it */}
                    <div ref={card} className="gen-intro-card" style={layout.card} role="note" onPointerDown={(e) => e.stopPropagation()}>
                        {list.length > 1 && <small className="gen-intro-count">{position} of {total}</small>}
                        <strong>{intro.title}</strong>
                        <p>{intro.text}</p>
                        <button type="button" onClick={dismiss}>{remaining > 1 ? 'Next' : 'Got it'}</button>
                    </div>
                </>,
                host,
            )}
        </>
    );
}
