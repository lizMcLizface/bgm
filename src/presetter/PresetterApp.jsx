// /tools/presetter/: listen to the presets with the real page (in a frame: timeline, instruments, control panel), keep what was changed on
// each and a verdict and a note, and dump them to a file to bake into the library (tools/applyPresetChanges.mjs). Development only:
// the page's dev hook (GenerativeApp window.__bgm) is what loads a preset and reads it back, and this page is left out of the public build.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SCENE_BROWSE_ORDER, SCENE_CATEGORIES, normalizeScene, sceneVoiceSpec } from '../app/scenes';
import { voiceLayers } from '../app/arranger';
import { applyChange, describeChange, leafPaths } from './changes';
import { diffSetup } from './diff';
import { STATUSES, loadStore, saveStore, update, saveChange, dump, mergeDump, entryOf } from './store';
import { rowsFor, ago, neighbour, SORTS } from './table';
import { JUDGEMENTS, feel, texture, styles, instruments, median, levelClass, detail } from './judgements';

const SCENES = SCENE_BROWSE_ORDER.map(({ scene }) => scene);
const CATEGORY_LABEL = Object.fromEntries(SCENE_CATEGORIES.map((c) => [c.id, c.label]));
const LAYER_LABEL = { combined: 'One voice', pad: 'Pad', rhythm: 'Rhythm', split: 'Both' };
const MEDIAN_LUFS = median(Object.values(JUDGEMENTS).map((j) => j.lufs));
const nameOf = (spec) => (typeof spec === 'string' ? spec : spec?.name ?? '');

function download(file, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
const typing = (t) => t && (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable);

export default function PresetterApp() {
    const frame = useRef(null);
    const [store, setStore] = useState(() => loadStore());
    const [selected, setSelected] = useState('');
    const [ready, setReady] = useState(false);
    const [mine, setMine] = useState(true); // open a preset with the changes kept for it
    const [filter, setFilter] = useState({ query: '', category: '', status: '', changed: '', sort: '' });
    const [message, setMessage] = useState('');
    const [lastSaved, setLastSaved] = useState(null); // { name, paths, warnings }
    const [now, setNow] = useState(Date.now());

    useEffect(() => { saveStore(store); }, [store]);
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
    // the page in the frame has its hook once it has started
    useEffect(() => {
        const t = setInterval(() => { try { setReady(!!frame.current?.contentWindow?.__bgm); } catch { setReady(false); } }, 400);
        return () => clearInterval(t);
    }, []);
    const bgm = () => { try { return frame.current?.contentWindow?.__bgm ?? null; } catch { return null; } };

    const rows = useMemo(() => rowsFor(SCENES, store, { ...filter, judgements: JUDGEMENTS, now }), [store, filter, now]);
    const scene = SCENES.find((s) => s.name === selected) ?? null;
    const entry = entryOf(store, selected);

    const open = async (name, { original = false } = {}) => {
        const shipped = SCENES.find((s) => s.name === name), page = bgm();
        if (!shipped) return;
        setSelected(name); setLastSaved(null);
        if (!page) { setMessage('The page in the frame is not ready yet.'); return; }
        const change = entryOf(store, name).change;
        const picked = !original && mine && change ? normalizeScene(applyChange(shipped, change)) : shipped;
        setMessage(picked === shipped ? '' : `Opened with your changes (${describeChange(change)}).`);
        setStore((s) => update(s, name, { heardAt: Date.now() }));
        await page.applyScene(picked);
    };
    const step = (dir) => { const next = neighbour(rows, selected, dir); if (next) open(next.name); };

    const saveChanges = () => {
        const page = bgm();
        if (!page || !scene) return;
        const change = diffSetup(scene, page.capture());
        const paths = [...leafPaths(change.settings).map((p) => `setting ${p}`), ...Object.keys(change.voices ?? {}).map((r) => `${r} voice: ${nameOf(change.voices[r])}`),
            ...Object.entries(change.layerVoices ?? {}).map(([r, v]) => `${r} voice (layers): ${v}`), ...(change.rulebook ? ['rulebook'] : []), ...(change.percussion ? ['drums'] : [])];
        setStore((s) => saveChange(s, scene.name, change));
        setLastSaved({ name: scene.name, paths, warnings: change.warnings ?? [] });
        setMessage(paths.length ? `Kept ${paths.length} change${paths.length > 1 ? 's' : ''} for ${scene.name}.` : `${scene.name} is as the preset has it: nothing kept.`);
    };
    const discard = () => {
        if (!scene) return;
        setStore((s) => saveChange(s, scene.name, {}));
        setLastSaved(null);
        open(scene.name, { original: true });
        setMessage(`Dropped the changes kept for ${scene.name}.`);
    };

    useEffect(() => {
        const onKey = (e) => {
            if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); step(1); }
            if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); step(-1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });
    // keep the selected row in view as it steps
    useEffect(() => { document.querySelector('.ps-row.is-selected')?.scrollIntoView?.({ block: 'nearest' }); }, [selected]);

    const readFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            setStore((s) => mergeDump(s, JSON.parse(text)));
            setMessage(`Read ${file.name}.`);
        } catch (error) { setMessage(`Could not read ${file.name}: ${error.message}`); }
    };
    const exportFile = () => {
        const file = dump(store, SCENES.map((s) => s.name));
        download(file, `presetter-${stamp()}.json`);
        setMessage(`Dumped ${Object.keys(file.presets).length} presets. Bake them in with: node tools/applyPresetChanges.mjs <file>`);
    };
    const changedCount = Object.values(store.presets).filter((e) => e.change).length;
    const judged = Object.values(store.presets).filter((e) => e.status).length;

    return (
        <main className="ps">
            <iframe ref={frame} className="ps-frame" src="/" title="calmbgm" allow="autoplay; midi" />
            <div className="ps-side">
            <section className="ps-bar" aria-label="The preset in the frame">
                <div className="ps-now">
                    <strong>{scene ? scene.name : 'No preset opened yet'}</strong>
                    {scene && <span className="ps-muted">{CATEGORY_LABEL[scene.category] ?? scene.category} · {scene.blurb}</span>}
                    {!ready && <span className="ps-warn">waiting for the page in the frame (dev server only)</span>}
                </div>
                <div className="ps-actions">
                    <button type="button" onClick={() => step(-1)} disabled={!rows.length} title="Previous in the list (up arrow, k)">◀</button>
                    <button type="button" onClick={() => step(1)} disabled={!rows.length} title="Next in the list (down arrow, j)">▶</button>
                    <button type="button" className="ps-primary" onClick={saveChanges} disabled={!scene || !ready} title="Keep what differs from the preset now: settings, voices, rulebook">Keep my changes</button>
                    <button type="button" onClick={() => scene && open(scene.name, { original: true })} disabled={!scene}>Reload original</button>
                    <button type="button" onClick={() => scene && open(scene.name)} disabled={!scene || !entry.change}>Reload with mine</button>
                    <button type="button" onClick={discard} disabled={!scene || !entry.change}>Drop mine</button>
                    <label className="ps-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Open with my changes</label>
                </div>
                {message && <p className="ps-message" role="status">{message}</p>}
                {lastSaved && (lastSaved.paths.length > 0 || lastSaved.warnings.length > 0) && (
                    <details className="ps-detail" open>
                        <summary>{lastSaved.paths.length} kept for {lastSaved.name}{lastSaved.warnings.length ? `, ${lastSaved.warnings.length} not kept` : ''}</summary>
                        <ul>{lastSaved.paths.map((p) => <li key={p}>{p}</li>)}{lastSaved.warnings.map((w) => <li key={w} className="ps-warn">{w}</li>)}</ul>
                    </details>
                )}
            </section>

            <section className="ps-filters" aria-label="Filter the presets">
                <input type="search" placeholder="Find (name, blurb, note)" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} aria-label="Find" />
                <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })} aria-label="Category">
                    <option value="">All categories</option>
                    {SCENE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="Verdict">
                    <option value="">Any verdict</option>
                    <option value="unjudged">Not judged</option>
                    {Object.entries(STATUSES).filter(([k]) => k).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <select value={filter.changed} onChange={(e) => setFilter({ ...filter, changed: e.target.value })} aria-label="Changes">
                    <option value="">Changed or not</option>
                    <option value="yes">Has my changes</option>
                    <option value="recent">Changed in the last day</option>
                </select>
                <select value={filter.sort} onChange={(e) => setFilter({ ...filter, sort: e.target.value })} aria-label="Order" title="From the audio judgements (tools/judgeLibrary.mjs)">
                    {Object.entries(SORTS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <span className="ps-muted">{rows.length} of {SCENES.length} · {judged} judged · {changedCount} with changes</span>
                <span className="ps-spacer" />
                <button type="button" onClick={exportFile} disabled={!judged && !changedCount && !Object.keys(store.presets).length}>Dump to file</button>
                <label className="ps-file">Read a dump<input type="file" accept="application/json,.json" onChange={readFile} /></label>
            </section>

            <div className="ps-table-wrap">
                <table className="ps-table">
                    <thead>
                        <tr><th aria-label="Heard" /><th>Preset</th><th>Category</th><th>Layers</th><th>Pad / rhythm</th><th title="Integrated loudness of a render, LUFS">LUFS</th><th title="Essentia mood heads that are on, and what the sound is made of">Feel</th><th>Style</th><th>Verdict</th><th>My changes</th><th>Note</th></tr>
                    </thead>
                    <tbody>
                        {rows.map((s) => {
                            const e = entryOf(store, s.name), layers = voiceLayers(s.settings), j = JUDGEMENTS[s.name];
                            const recent = e.changedAt && now - e.changedAt < 24 * 3600 * 1000;
                            return (
                                <tr key={s.name} className={`ps-row${s.name === selected ? ' is-selected' : ''}${e.change ? ' has-change' : ''}${e.status ? ` is-${e.status}` : ''}`}
                                    onClick={(ev) => { if (!ev.target.closest('select,input,textarea,button')) open(s.name); }}>
                                    <td className="ps-dot" title={e.heardAt ? `Opened ${ago(e.heardAt, now)}` : 'Not opened yet'}>{e.heardAt ? '●' : '○'}</td>
                                    <td className="ps-name">{s.name}</td>
                                    <td className="ps-muted">{CATEGORY_LABEL[s.category] ?? s.category}</td>
                                    <td>{LAYER_LABEL[layers] ?? layers}{s.settings.layerFlow?.mode && s.settings.layerFlow.mode !== 'off' ? ' · flow' : ''}</td>
                                    <td className="ps-muted">{nameOf(sceneVoiceSpec(s, 'pad', layers))} / {nameOf(sceneVoiceSpec(s, 'rhythm', layers)) || '-'}</td>
                                    <td className={`ps-num ps-level-${levelClass(j?.lufs, MEDIAN_LUFS)}`} title={detail(j)}>{j ? j.lufs.toFixed(1) : ''}</td>
                                    <td className="ps-muted" title={detail(j)}>{j ? [feel(j), texture(j)].filter(Boolean).join(' · ') : ''}</td>
                                    <td className="ps-muted" title={detail(j)}>{j ? [styles(j, 2), instruments(j, 2)].filter(Boolean).join(' | ') : ''}</td>
                                    <td>
                                        <select value={e.status} onChange={(ev) => setStore((st) => update(st, s.name, { status: ev.target.value }))} aria-label={`Verdict for ${s.name}`}>
                                            {Object.entries(STATUSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                                        </select>
                                    </td>
                                    <td className={recent ? 'ps-recent' : ''}>{e.change ? <>{describeChange(e.change)} <span className="ps-muted">{ago(e.changedAt, now)}</span></> : ''}</td>
                                    <td><input type="text" className="ps-note" value={e.note} placeholder="note" onChange={(ev) => setStore((st) => update(st, s.name, { note: ev.target.value }))} aria-label={`Note for ${s.name}`} /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!rows.length && <p className="ps-muted ps-empty">No presets match.</p>}
            </div>
            </div>
        </main>
    );
}
