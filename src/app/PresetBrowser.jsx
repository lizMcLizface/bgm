import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SCENES, SCENE_CATEGORIES, MINE, sceneSettings } from './scenes';
import { userScenes } from './setupStore';
import { TONIC_NAMES, scaleById } from './theory';
import { DRUM_STYLES } from './percussion';
import { AMBIENCE_LAYERS } from './engine/ambience';
import { METERS } from './meter';

// The top row's preset browser (scenes.js): a button that opens a window
// over the page with the presets as a grid of cards, sorted into categories
// with a search box, and - along the bottom - what to do with your own:
// save the current setup, copy it as JSON (every setting and every synth
// parameter of every voice), download it, or paste / open one.
//
// Everything that touches the generator comes in through props, so this
// only draws: `current` is the preset last picked, `onPick(scene)` loads
// one, `actions` is { save(name), copy(), download(), load(text), remove(name) }
// - each returning a message to show (or a promise of one). A pick says what
// to apply: everything, the composition only (shift-click) or the sounds
// only (ctrl / cmd-click), or what the buttons in the header are set to.

const ALL = 'all';
const APPLY = [
    ['all', 'Everything', 'Key, feel, drums, ambience and the sounds'],
    ['composition', 'Composition', 'Everything but the sounds (shift-click)'],
    ['voices', 'Sounds', 'Only the sounds of the voices (ctrl-click)'],
];

// "D Aeolian · 92 BPM · 4/4", the drums and the ambience a preset has.
function summary(scene) {
    const s = sceneSettings(scene, 1);
    const key = `${TONIC_NAMES[s.tonic].split('/')[0]} ${scaleById(s.mode).name}`;
    const meter = s.meter === '4/4' ? '' : ` · ${METERS[s.meter].label.split(' ')[0]}`;
    const layers = Object.entries(s.ambience).filter(([, level]) => level > 0).map(([id]) => AMBIENCE_LAYERS[id].toLowerCase());
    return {
        line: s.playMusic ? `${key} · ${s.bpm} BPM${meter}` : 'No music',
        chips: [
            ...(s.playMusic && s.drums.style !== 'off' ? [DRUM_STYLES[s.drums.style]] : []),
            ...layers,
        ],
    };
}

const matches = (scene, query) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = [scene.name, scene.blurb, ...(scene.tags || [])].join(' ').toLowerCase();
    return words.every((word) => haystack.includes(word));
};

const Card = ({ scene, active, onPick, onRemove }) => {
    const { line, chips } = useMemo(() => summary(scene), [scene]);
    return (
        <li className={`gen-pb-card${active ? ' is-active' : ''}`}>
            <button type="button" className="gen-pb-pick" onClick={(e) => onPick(scene, e)} aria-current={active ? 'true' : undefined}
                title="Click: apply as set above. Shift-click: composition only. Ctrl-click: sounds only.">
                <strong>{scene.name}</strong>
                {scene.blurb && <span className="gen-pb-blurb">{scene.blurb}</span>}
                <span className="gen-pb-meta">{line}</span>
                {chips.length > 0 && <span className="gen-pb-chips">{chips.map((chip) => <span key={chip}>{chip}</span>)}</span>}
            </button>
            {onRemove && (
                <button type="button" className="gen-pb-remove" onClick={() => onRemove(scene.name)}
                    aria-label={`Delete ${scene.name}`} title="Delete this preset">×</button>
            )}
        </li>
    );
};

const PresetBrowser = ({ current, onPick, actions }) => {
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState(ALL);
    const [query, setQuery] = useState('');
    const [name, setName] = useState('');
    const [apply, setApply] = useState('all');
    const [pasting, setPasting] = useState(false);
    const [pasted, setPasted] = useState('');
    const [message, setMessage] = useState('');
    const [version, setVersion] = useState(0);
    const trigger = useRef(null);
    const search = useRef(null);
    const file = useRef(null);
    const timer = useRef(0);

    const say = async (result) => {
        const text = await result;
        setMessage(text || '');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setMessage(''), 5000);
    };
    useEffect(() => () => clearTimeout(timer.current), []);

    const close = () => {
        setOpen(false);
        setApply('all');
        if (trigger.current) trigger.current.focus();
    };

    useEffect(() => {
        if (!open) return undefined;
        const key = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            }
        };
        document.addEventListener('keydown', key);
        if (search.current) search.current.focus({ preventScroll: true });
        return () => document.removeEventListener('keydown', key);
    }, [open]);

    // Yours are read when the window is open and again after a save or delete.
    const mine = useMemo(() => (open ? userScenes() : []), [open, version]); // eslint-disable-line react-hooks/exhaustive-deps
    const categories = useMemo(
        () => [...SCENE_CATEGORIES, ...(mine.length ? [MINE] : [])],
        [mine.length],
    );
    const scenes = useMemo(() => [...mine, ...SCENES].map((scene) => ({ scene, id: scene.category })), [mine]);
    const shown = scenes.filter(({ scene, id }) => (category === ALL || id === category) && (!query || matches(scene, query)));
    const count = (id) => scenes.filter((entry) => entry.id === id).length;
    // With "All", the cards go in category order under their headings.
    const sections = (category === ALL && !query ? categories : [categories.find((c) => c.id === category) || categories[0]])
        .map((c) => ({ ...c, items: shown.filter(({ id }) => id === c.id).map(({ scene }) => scene) }))
        .filter(({ items }) => items.length);
    const flat = category === ALL && query ? [{ id: ALL, label: 'Matches', blurb: '', items: shown.map(({ scene }) => scene) }].filter(({ items }) => items.length) : sections;

    const pick = (scene, e) => {
        const parts = e && e.shiftKey ? 'composition' : e && (e.ctrlKey || e.metaKey) ? 'voices' : apply;
        onPick(scene, { parts });
        close();
    };
    const save = async (e) => {
        e.preventDefault();
        const text = await actions.save(name.trim());
        if (text && !text.startsWith('Could not')) {
            setName('');
            setVersion((v) => v + 1);
        }
        say(text);
    };
    const remove = (sceneName) => {
        if (!window.confirm(`Delete your preset "${sceneName}"?`)) return;
        actions.remove(sceneName);
        setVersion((v) => v + 1);
        say(`Deleted "${sceneName}"`);
    };
    const load = async (text) => {
        const result = await actions.load(text);
        if (result && result.ok) {
            setPasted('');
            setPasting(false);
            close();
        }
        say(result && result.message);
    };
    const openFile = async (e) => {
        const chosen = e.target.files[0];
        e.target.value = '';
        if (chosen) load(await chosen.text());
    };

    return (
        <div className="gen-scene">
            <button ref={trigger} type="button" className="gen-scene-button" aria-haspopup="dialog" aria-expanded={open}
                onClick={() => setOpen(!open)} title="Start from a preset: key, scale, feel, drums, ambience and sounds together">
                <span className="gen-scene-label">Presets</span>
                <span className="gen-scene-name">{current || 'Pick one…'}</span>
                <span aria-hidden="true">▾</span>
            </button>
            {open && (
                <div className="gen-pb-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
                    <div className="gen-pb" role="dialog" aria-modal="true" aria-label="Presets">
                        <div className="gen-pb-head">
                            <h2>Presets</h2>
                            <input ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search: rain, fast, zelda…" aria-label="Search presets" />
                            <button type="button" className="gen-pb-close" onClick={close} aria-label="Close">×</button>
                            <div className="gen-pb-apply" role="group" aria-label="What a click applies">
                                <span>Apply</span>
                                {APPLY.map(([id, label, hint]) => (
                                    <button key={id} type="button" className={apply === id ? 'is-active' : ''} aria-pressed={apply === id}
                                        title={hint} onClick={() => setApply(id)}>{label}</button>
                                ))}
                                <small>Shift-click: composition only · Ctrl-click: sounds only. Sounds change at the next bar.</small>
                            </div>
                        </div>
                        <div className="gen-pb-body">
                            <nav className="gen-pb-cats" aria-label="Categories">
                                {[{ id: ALL, label: 'All', blurb: 'Every preset' }, ...categories].map((c) => (
                                    <button key={c.id} type="button" className={category === c.id ? 'is-active' : ''} aria-pressed={category === c.id}
                                        title={c.blurb} onClick={() => setCategory(c.id)}>
                                        {c.label} <small>{c.id === ALL ? scenes.length : count(c.id)}</small>
                                    </button>
                                ))}
                            </nav>
                            <div className="gen-pb-scroll">
                                {flat.length === 0 && <p className="gen-pb-empty">Nothing matches &ldquo;{query}&rdquo;.</p>}
                                {flat.map((section) => (
                                    <section key={section.id}>
                                        {(category === ALL || query) && <h3>{section.label}{section.blurb && <small> {section.blurb}</small>}</h3>}
                                        {category !== ALL && !query && section.blurb && <p className="gen-pb-blurb-line">{section.blurb}</p>}
                                        <ul className="gen-pb-grid">
                                            {section.items.map((scene) => (
                                                <Card key={`${scene.category}/${scene.name}`} scene={scene} active={scene.name === current}
                                                    onPick={pick} onRemove={scene.category === MINE.id ? remove : null} />
                                            ))}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        </div>
                        <div className="gen-pb-foot">
                            <form className="gen-pb-save" onSubmit={save}>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                                    placeholder="Name this setup…" aria-label="Name for the preset to save" />
                                <button type="submit" disabled={!name.trim()} title="Keep the current setup - settings and every voice's sound - in this browser">Save current</button>
                            </form>
                            <span className="gen-pb-actions">
                                <button type="button" onClick={() => say(actions.copy())} title="Copy the whole setup as JSON, every synth parameter included">Copy setup</button>
                                <button type="button" onClick={() => say(actions.download())}>Download .json</button>
                                <button type="button" aria-expanded={pasting} onClick={() => setPasting(!pasting)}>Paste / open…</button>
                            </span>
                            <span className="gen-pb-message" role="status">{message}</span>
                            {pasting && (
                                <div className="gen-pb-paste">
                                    <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} spellCheck={false}
                                        placeholder="Paste a setup (JSON) here" aria-label="Setup JSON" />
                                    <span>
                                        <button type="button" disabled={!pasted.trim()} onClick={() => load(pasted)}>Load</button>
                                        <button type="button" onClick={() => file.current.click()}>Open a file…</button>
                                    </span>
                                    <input ref={file} type="file" accept="application/json,.json" hidden onChange={openFile} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PresetBrowser;
