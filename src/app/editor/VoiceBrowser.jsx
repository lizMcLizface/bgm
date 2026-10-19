import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {PERCUSSION_VOICES,percussionPads} from '../percussionVoices';
import { presetGroups } from './presetStore';
import { voiceTraits } from './voiceTraits';
import PresetBadges from '../PresetBadges';
import { ROLE_CATEGORY } from '../presets';
import { useScrollLock } from '../scrollLock';

// The voice picker: a window like the preset browser's, with the sounds in
// blocks by kind (Pads, Bass, Leads, ... then your own), a search box and a
// card for each sound saying in a few words what it is like. Every sound is
// listed, opened at the block the voice's sound is in; the kinds on the left
// jump to a block. Picking a sound
// makes it the voice's right away and leaves the window open, since trying
// one after another is the usual use; while it is open the arrow keys (and
// [ and ]) move to the next / previous sound in the list shown, Escape closes.
//
// Everything that touches the generator comes in through props: `value` is
// the voice's sound, `onChange(name)` loads one.

const BLURBS = {
    'Drum kits': 'Whole percussion voices: rhythm remains a separate composition choice',
    Pads: 'Sustained chords: strings, choirs, haze',
    Bass: 'Low notes: round, sub and plucked',
    Leads: 'Melodies: flutes, bells, whistles, brass',
    'Keys & plucks': 'Struck and plucked: pianos, harps, mallets',
    Textures: 'Odd and atmospheric sounds',
    unCAGED: 'From the synth page',
    'unCAGED custom': 'Saved on the synth page',
    Mine: 'Saved from this page',
    'From setups': 'Came with a setup you opened',
    Generated: 'Made this visit',
};
const ROLE_NAMES = { perc:'percussion', pad: 'rhythm / pad', bass: 'bass / support', lead: 'lead', counter: 'second lead' };

const matches = (name, group, traits, query) => {
    const haystack = [name, traits.label, group, traits.wave, ...traits.chips, ...traits.space,traits.wasm?'new wasm only':''].join(' ').toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
};

const Card = ({ name, traits, active, edited, onPick, busy }) => (
    <li className={`gen-pb-card${active ? ' is-active' : ''}`}>
        <button type="button" className="gen-pb-pick" data-preset={name} disabled={busy} onClick={() => onPick(name)} aria-current={active ? 'true' : undefined}>
            <strong>{traits.label??name}</strong>
            <PresetBadges isNew={traits.wasm} wasm={traits.wasm}/>
            <span className="gen-pb-meta">{traits.wave}{active && edited ? ' · edited' : ''}</span>
            <span className="gen-pb-chips">{traits.chips.map((chip) => <span key={chip}>{chip}</span>)}</span>
        </button>
    </li>
);

const VoiceBrowser = ({ value, edited, onChange, onClose, role }) => {
    const groups = useMemo(() => {
        if(role==='perc')return [{group:'Drum kits',presets:Object.fromEntries(Object.values(PERCUSSION_VOICES).map(p=>[p.id,p]))}];
        const found = presetGroups(ROLE_CATEGORY[role]);
        const known = found.some(({ presets }) => value in presets);
        return known ? found : [{ group: 'Current', editable: false, presets: { [value]: {} } }, ...found];
    }, [role]); // eslint-disable-line react-hooks/exhaustive-deps
    useScrollLock();
    const home = (groups.find(({ presets }) => value in presets) || groups[0]).group;
    const [chapter, setChapter] = useState(home);
    const [query, setQuery] = useState('');
    const dialog = useRef(null);
    const scroller = useRef(null);

    const items = useMemo(() => groups.map(({ group, presets }) => ({
        group,
        cards: Object.entries(presets).map(([name, preset]) => ({ name, traits: role==='perc'?{label:preset.name,wave:preset.description,chips:percussionPads(preset.id).filter((_,i)=>[0,2,6].includes(i)).map(p=>p.label),space:[],wasm:preset.wasmOnly}:{...voiceTraits(preset),wasm:!!preset.wasmVoice} })),
    })), [groups]);
    const sections = items
        .map(({ group, cards }) => ({ group, cards: query ? cards.filter(({ name, traits }) => matches(name, group, traits, query)) : cards }))
        .filter(({ cards }) => cards.length);
    const shown = sections.flatMap(({ cards }) => cards.map(({ name }) => name));

    // Scrolls the list so a block's heading is at the top.
    const goTo = (group) => {
        const box = scroller.current;
        const heading = box && [...box.querySelectorAll('[data-group]')].find((el) => el.dataset.group === group);
        if (heading) box.scrollTop += heading.getBoundingClientRect().top - box.getBoundingClientRect().top - 4;
    };
    const queryRef = useRef('');
    queryRef.current = query;

    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    const pending=useRef(false);
    const pick=async name=>{
        if(pending.current)return;
        pending.current=true;setBusy(true);setError('');
        try{const loading=onChange(name);if(loading&&typeof loading.then==='function')await loading;}catch(e){setError(e.message||'Could not prepare this sound.');}
        finally{pending.current=false;setBusy(false);}
    };

    // The keyboard: next / previous sound in the list shown, picked on the spot.
    const step = (dir) => {
        if (!shown.length) return;
        const at = shown.indexOf(value);
        const next = at < 0 ? (dir > 0 ? 0 : shown.length - 1) : Math.max(0, Math.min(shown.length - 1, at + dir));
        if (shown[next] !== value) void pick(shown[next]);
    };
    const latest = useRef(null);
    latest.current = { step, onClose };
    useEffect(() => {
        const key = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // In the search box the keys that move its caret or type are left to it - once something is typed.
            const typing = e.target && e.target.tagName === 'INPUT' && queryRef.current !== '';
            let dir = { ArrowDown: 1, ArrowUp: -1 }[e.key] || 0;
            if (!dir && !typing) dir = { ArrowRight: 1, ArrowLeft: -1, ']': 1, '[': -1 }[e.key] || 0;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                latest.current.onClose();
            } else if (dir) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!e.repeat) latest.current.step(dir);
            }
        };
        document.addEventListener('keydown', key, true);
        // Focus stays out of the search box, so a voice armed for the keyboard keeps playing
        // while sounds are tried; click the box to search.
        if (dialog.current) dialog.current.focus({ preventScroll: true });
        return () => document.removeEventListener('keydown', key, true);
    }, []);

    // Opens at the block the sound is in; after that the keys keep the active card in view.
    useLayoutEffect(() => goTo(home), []); // eslint-disable-line react-hooks/exhaustive-deps
    const opened = useRef(false);
    useEffect(() => {
        if (!opened.current) {
            opened.current = true;
            return;
        }
        const active = scroller.current && scroller.current.querySelector('.is-active');
        if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    }, [value]);

    return (
        <div className="gen-pb-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div ref={dialog} tabIndex={-1} className="gen-pb gen-vb" role="dialog" aria-modal="true" aria-busy={busy} aria-label={`Choose a sound for the ${ROLE_NAMES[role] || role} voice`}>
                <div className="gen-pb-head">
                    <h2>Sound: {ROLE_NAMES[role] || role}</h2>
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder={role==='perc'?'Search: felt, crisp, 808, hand…':'Search: soft, dark, bell, harp…'} aria-label="Search sounds" />
                    <button type="button" className="gen-pb-close" onClick={onClose} aria-label="Close">×</button>
                    <small className="gen-vb-hint">Click to try a sound - the window stays open. ↑ ↓ ← → or [ ] step through the list, Esc closes. {role==='perc'?'Kit changes apply to upcoming hits.':'Sounds change at the next bar.'}</small>
                    {busy&&<small role="status">Preparing {role==='perc'?'drum kit':'sound'}…</small>}
                    {error&&<small role="alert">{error}</small>}
                </div>
                <div className="gen-pb-body">
                    <nav className="gen-pb-cats" aria-label="Kinds of sound">
                        {items.map(({ group, cards }) => (
                            <button key={group} type="button" className={chapter === group ? 'is-active' : ''} aria-pressed={chapter === group}
                                title={BLURBS[group]} onClick={() => { setChapter(group); goTo(group); }}>
                                {group} <small>{cards.length}</small>
                            </button>
                        ))}
                    </nav>
                    <div className="gen-pb-scroll" ref={scroller}>
                        {sections.length === 0 && <p className="gen-pb-empty">Nothing matches &ldquo;{query}&rdquo;.</p>}
                        {sections.map(({ group, cards }) => (
                            <section key={group} data-group={group}>
                                <h3>{group}{BLURBS[group] && <small> {BLURBS[group]}</small>}</h3>
                                <ul className="gen-pb-grid">
                                    {cards.map(({ name, traits }) => (
                                        <Card key={name} name={name} traits={traits} active={name === value} edited={edited} onPick={pick} busy={busy} />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoiceBrowser;
