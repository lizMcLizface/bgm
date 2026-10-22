// The sound window: ✎ on a voice opens its sound here, over the page like the preset picker.
// Each melodic voice plays the generator's own synth (its presets, on the touch panel's faders),
// DIY Poly or DIY FM, or one of the classic synths (their sounds and full panels); the
// percussion plays one of the generator's kits or a drum machine and its kits. Instrument and
// Effects split each sound's own controls. Lazy-loaded: the page loads none of the synths until
// the window first opens.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import PresetPicker from './PresetPicker';
import { presetGroups, findPreset, saveUserPreset, deleteUserPreset, isUserPreset, exportPreset, importPresetFile } from './presetStore';
import { ROLE_CATEGORY } from '../presets';
import NativePanel from './NativePanel';
import { PERCUSSION_VOICES } from '../percussionVoices';
import { SYNTHS } from '../../synths/models';
import SoundPicker, { soundList, nextSound } from '../../synths/ui/SoundPicker';
import { VoicePanel } from '../../synths/ui/VoicePanel';
import RackPanel from '../../synths/effects/RackPanel';
import { Fader } from '../../synths/ui/controls';
import { BUS_ROLES } from '../engine/bus';
import { readPerformance } from '../../audio/performance';
import { usePerfMode } from '../../audio/PerfModeButton';
import { cleanRack, rackForPatch, instrumentSpaceKeys, splitRackEdits } from '../../synths/effects/params';
import { CLASSICS, DRUM_MACHINES, roleSound, percussionSound } from '../../synths/ensemble/state';
import { DIY_SYNTHS, matchedLevel, soundSource } from '../../synths/ensemble/sources';
import { updateDiy } from '../engine/diySource';
// a sound reaches the page with its track-strip label and its link reference, so the page needs none of the synths
import { described, describedMachine } from './soundRefs';
import synthsCss from '../../synths/synths.css?inline';
import '../../synths/ensemble/ensemble.css';
import './soundWindow.css';

// The synth pages' stylesheet is written for a page of its own (:root, html, body, every button);
// nested under the window it styles the embedded panels and nothing else.
const SCOPED_CSS = `.sound-window-synth{${synthsCss.replace(/:root\s*\{/g, '&{').replace(/html,\s*body\s*\{/g, '&{')}}`;
function useScopedSynthCss() {
    useEffect(() => {
        const style = document.createElement('style');
        style.dataset.soundWindow = '';
        style.textContent = SCOPED_CSS;
        document.head.append(style);
        return () => style.remove();
    }, []);
}

const machineLabel = (synth) => `${SYNTHS[synth].name} drum machine`;
const isDiy = (sound) => DIY_SYNTHS.includes(sound?.synth);
const sendSpec = (key, label) => ({ key, label, min: 0, max: 1, default: 0, unit: '%', curve: 'lin' });

export default function SoundWindow({ generator: gen, role, roles, onRole, voice, light, percussion, bus, onBus, onPerformance, onNativePreset, onNativeImport, onNativeEdited, onExternal, onPercussionKit, onMachine, onClose }) {
    useScopedSynthCss();
    const [tab, setTab] = useState('instrument');
    const [full, setFull] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [preset, setPreset] = useState(() => (role === 'perc' || role === 'bus' ? null : gen.getRolePreset(role)));
    const operation = useRef(0);
    const dialog = useRef(null);
    const fileInput = useRef(null);
    const [, setStoreVersion] = useState(0);
    // the sound browsers open here, inside the synth pages' (scoped) styles and above this window
    const [browserHost, setBrowserHost] = useState(null);
    const isPerc = role === 'perc';
    const isBus = role === 'bus'; // the shared effects bus, not a voice
    const perfOn = usePerfMode();
    const external = !isPerc && voice?.external; // a classic or DIY sound, else the generator's own synth
    const synth = external && SYNTHS[external.synth];
    const machine = isPerc && percussion.machine;

    // the generator's own synth: re-read when the role or its preset changes from outside
    useEffect(() => { if (!isPerc && !isBus && !external) setPreset(gen.getRolePreset(role)); }, [gen, role, voice?.presetName, external, isPerc, isBus]);
    useEffect(() => { setMessage(''); }, [role]);
    useEffect(() => { dialog.current?.focus({ preventScroll: true }); }, []);
    useEffect(() => {
        // (the preset picker's own window, open above this one, takes Escape first)
        const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.gen-vb')) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // One sound change at a time; a later one wins and an error puts nothing in its place.
    const run = async (work) => {
        const revision = ++operation.current;
        setBusy(true); setMessage('');
        try { await work(() => revision === operation.current); }
        catch (error) { if (revision === operation.current) setMessage(error.message); }
        finally { if (revision === operation.current) setBusy(false); }
    };
    // A classic or DIY sound onto the role, at the role's loudness unless it has been matched already.
    const playSound = (sound) => run(async (current) => {
        if (!sound.matched) sound = { ...sound, level: await matchedLevel(sound, role), matched: true };
        if (!current()) return;
        await gen.setRoleSource(role, soundSource(sound, role, light));
        if (current()) onExternal(role, described(sound));
    });
    const chooseInstrument = (id) => {
        if (id === 'calmbgm') { onNativePreset(role, voice.presetName); onExternal(role, null); return; }
        playSound(roleSound(id, role));
    };
    // The arrow keys, as on the synth pages: ← → the previous / next sound, ↑ ↓ the first sound of
    // the previous / next category; through the voice's own list (a synth's sounds, the preset
    // picker's groups, or the kits followed by each drum machine's).
    const step = (dir, jump) => {
        if (busy || isBus) return;
        if (external) {
            const next = nextSound(soundList(synth, synth.presets, []), external.name, external.category, dir, jump);
            if (next) playSound({ ...external, ...next, values: next.values, level: 1, matched: false });
            return;
        }
        const list = isPerc
            ? { categories: [{ id: 'kits' }, ...DRUM_MACHINES.map((id) => ({ id }))],
                sounds: [...Object.values(PERCUSSION_VOICES).map((v) => ({ name: v.id, cat: 'kits' })), ...DRUM_MACHINES.flatMap((id) => SYNTHS[id].presets.map((p) => ({ name: `${id}:${p.name}`, cat: id })))] }
            : (() => { const groups = presetGroups(ROLE_CATEGORY[role]); return { categories: groups.map(({ group }) => ({ id: group })), sounds: groups.flatMap(({ group, presets }) => Object.keys(presets).map((name) => ({ name, cat: group }))) }; })();
        const current = isPerc ? (machine ? `${machine.synth}:${machine.name}` : percussion.kit) : voice.presetName;
        const next = nextSound(list, current, undefined, dir, jump);
        if (!next) return;
        if (isPerc) choosePercussion(next.name); else onNativePreset(role, next.name);
    };
    const hotkeys = useRef(step);
    hotkeys.current = step;
    useEffect(() => {
        const ARROWS = { ArrowLeft: [-1, false], ArrowRight: [1, false], ArrowUp: [-1, true], ArrowDown: [1, true] };
        const onKey = (e) => {
            const arrow = ARROWS[e.key];
            if (!arrow || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            // a focused fader, menu or field keeps its arrows; a sound browser open above has its own
            if (e.target.closest?.('input, select, textarea, [role=slider], [contenteditable]') || document.querySelector('.sp, .gen-vb')) return;
            e.preventDefault();
            hotkeys.current(...arrow);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    // Edits to a classic or DIY sound, heard at once.
    const editSound = useCallback((next) => {
        onExternal(role, described(next));
        const inst = gen.roles[role].instrument;
        if (isDiy(next)) updateDiy(inst, soundSource(next, role, light).diy);
        else inst.setValues?.(next.values);
    }, [role, gen, light, onExternal]);
    const editValues = useCallback((values) => editSound({ ...external, values }), [external, editSound]);
    const chooseLibrary = useCallback((p) => playSound({ ...external, name: p.name, category: 'library', values: p.values, level: 1, matched: false }), [external]); // eslint-disable-line react-hooks/exhaustive-deps
    const matchLevel = () => run(async (current) => {
        const level = await matchedLevel({ ...external, matched: false }, role);
        if (!current()) return;
        const next = { ...external, level, matched: true };
        onExternal(role, described(next));
        const inst = gen.roles[role].instrument;
        if (isDiy(next)) updateDiy(inst, soundSource(next, role, light).diy);
        else if (inst.preset?.classics) { inst.preset.masterVolume = level; inst.output.gain.setTargetAtTime(level, inst.AC.currentTime, 0.03); }
        setMessage('Sound level matched.');
    });
    const editNative = useCallback((changes) => {
        if (!changes.length) return;
        for (const [key, value] of changes) gen.setRoleParam(role, key, value);
        setPreset((p) => ({ ...p, ...Object.fromEntries(changes) }));
        onNativeEdited(role); // every edit: the page's link follows the sound
    }, [gen, role, onNativeEdited]);

    // The generator's own synth: keep, restore, share and remove presets (the old editor's header).
    const flash = (text) => setMessage(text);
    const saveAs = () => {
        const name = window.prompt('Save preset as', voice.edited ? `${voice.presetName} (edit)` : voice.presetName);
        if (!name || (isUserPreset(name) && !window.confirm(`Replace your preset "${name}"?`))) return;
        if (!saveUserPreset(name, gen.getRolePreset(role))) { flash('Could not save (browser storage unavailable) - use Export instead'); return; }
        onNativePreset(role, name);
        setStoreVersion((v) => v + 1);
        flash(`Saved "${name}"`);
    };
    const remove = () => {
        if (!window.confirm(`Delete your preset "${voice.presetName}"?`)) return;
        deleteUserPreset(voice.presetName);
        setStoreVersion((v) => v + 1);
        flash(`Deleted "${voice.presetName}" (the sound stays loaded)`);
    };
    const importFile = async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            const { name, preset } = await importPresetFile(file);
            onNativeImport(role, name, preset);
            flash(`Imported "${name}" - Save as to keep it in the list`);
        } catch (err) { flash(`Import failed: ${err.message}`); }
    };

    // Percussion: a kit of the generator's, or a drum machine playing its pads.
    const choosePercussion = (id) => run(async (current) => {
        if (PERCUSSION_VOICES[id]) {
            if (gen.roles.perc.machine) { await gen.setPercussionSource(null); onMachine(null); }
            if (current()) await onPercussionKit(id);
            return;
        }
        const [synthId, name] = id.split(':');
        const sound = { ...percussionSound(synthId, name || (machine?.synth === synthId ? machine.name : undefined)), rack: machine?.synth === synthId ? machine.rack : cleanRack() };
        await gen.setPercussionSource({ classics: { synth: sound.synth, name: `${SYNTHS[sound.synth].name} · ${sound.name}`, values: sound.values, rack: sound.rack, light }, masterVolume: 1 });
        if (current()) onMachine(describedMachine(sound));
    });

    const editRack = (changes) => {
        if (machine) {
            const rack = { ...machine.rack, ...changes };
            onMachine(describedMachine({ ...machine, rack }));
            gen.roles.perc.instrument.setRack?.(rack);
            return;
        }
        const { native, extra } = splitRackEdits(synth, changes), next = { ...external, values: { ...external.values, ...native }, rack: { ...external.rack, ...extra } };
        editSound(next);
        if (!isDiy(next)) gen.roles[role].instrument.setRack?.(rackForPatch(synth, next.values, next.rack));
    };
    const rack = machine ? machine.rack : external ? rackForPatch(synth, external.values, external.rack) : null;
    const audition = () => gen.audition(role).catch((error) => setMessage(error.message));

    const send = (id, value) => onBus({ ...bus, sends: { ...bus.sends, [id]: value } });
    const performance = readPerformance();
    const title = isBus ? 'Effects every voice can send to' : isPerc ? (machine ? machineLabel(machine.synth) : `${PERCUSSION_VOICES[percussion.kit]?.name ?? 'Kit'} kit`) : external ? synth.name : 'calmbgm synth';
    return (
        <div className="gen-pb-backdrop sound-window-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div ref={dialog} tabIndex={-1} className="gen-pb sound-window" role="dialog" aria-modal="true" aria-busy={busy} aria-label={`${roles[role].label} sound`}>
                <div className="gen-pb-head sound-window-head">
                    <h2><small>{roles[role].label}</small> {title}</h2>
                    <nav className="ensemble-role-tabs" aria-label="Voice">
                        {Object.entries(roles).map(([id, { label }]) => (
                            <button key={id} type="button" className={'role-' + id} aria-pressed={id === role} onClick={() => onRole(id)}>{label}</button>
                        ))}
                    </nav>
                    <button type="button" className="gen-pb-close" onClick={onClose} aria-label="Close">×</button>
                </div>
                {!isBus && <div className="sound-window-tools">
                    {isPerc ? (
                        <label>Source
                            <select aria-label="Percussion source" disabled={busy} value={machine ? `${machine.synth}:` : percussion.kit} onChange={(e) => choosePercussion(e.target.value)}>
                                <optgroup label="calmbgm kits">
                                    {Object.values(PERCUSSION_VOICES).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </optgroup>
                                <optgroup label="Drum machines">
                                    {DRUM_MACHINES.map((id) => <option key={id} value={`${id}:`}>{machineLabel(id)}</option>)}
                                </optgroup>
                            </select>
                        </label>
                    ) : (
                        <>
                            <label>Instrument
                                <select aria-label="Instrument" disabled={busy} value={external ? external.synth : 'calmbgm'} onChange={(e) => chooseInstrument(e.target.value)}>
                                    <option value="calmbgm">calmbgm synth</option>
                                    <optgroup label="DIY">
                                        {DIY_SYNTHS.map((id) => <option key={id} value={id}>{SYNTHS[id].name} · {SYNTHS[id].subtitle}</option>)}
                                    </optgroup>
                                    <optgroup label="Classics">
                                        {CLASSICS.map((id) => <option key={id} value={id}>{SYNTHS[id].name} · {SYNTHS[id].subtitle}</option>)}
                                    </optgroup>
                                </select>
                            </label>
                            {!external && <PresetPicker value={voice.presetName} edited={voice.edited} onChange={(name) => onNativePreset(role, name)} role={role} disabled={busy} />}
                        </>
                    )}
                    <div className="sound-window-tabs" role="group" aria-label="Controls">
                        <button type="button" aria-pressed={tab === 'instrument'} onClick={() => setTab('instrument')}>Instrument</button>
                        <button type="button" aria-pressed={tab === 'effects'} onClick={() => setTab('effects')}>Effects</button>
                    </div>
                    <button type="button" disabled={busy} onClick={audition}>Audition</button>
                    {external && <button type="button" disabled={busy} onClick={matchLevel}>Match level</button>}
                    {!isPerc && !external && (
                        <div className="sound-window-tabs" role="group" aria-label="Preset">
                            <button type="button" onClick={saveAs}>Save as…</button>
                            <button type="button" onClick={() => onNativePreset(role, voice.presetName)} disabled={!voice.edited || !findPreset(voice.presetName)}>Revert</button>
                            <button type="button" onClick={() => exportPreset(voice.presetName, gen.getRolePreset(role))}>Export</button>
                            <button type="button" onClick={() => fileInput.current.click()}>Import</button>
                            {isUserPreset(voice.presetName) && <button type="button" onClick={remove}>Delete</button>}
                            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
                        </div>
                    )}
                    {external && !isDiy(external) && tab === 'instrument' && <button type="button" aria-pressed={full} onClick={() => setFull(!full)}>{full ? 'Fit panel' : 'Full size'}</button>}
                    <span className="sound-window-status" role="status">{busy ? 'Loading…' : message}</span>
                </div>}
                {(external || machine) && (
                    <div className="sound-window-synth"><nav className="presets sound-window-sounds" aria-label="Sounds" title="← → sound · ↑ ↓ category">
                        {external
                            ? <SoundPicker synth={synth} presets={synth.presets} mine={[]} current={external.name} currentCategory={external.category} container={browserHost} choose={(p) => playSound({ ...external, ...p, values: p.values, level: 1, matched: false })} />
                            : <SoundPicker synth={SYNTHS[machine.synth]} presets={SYNTHS[machine.synth].presets} mine={[]} current={machine.name} currentCategory={machine.category} container={browserHost} choose={(p) => choosePercussion(`${machine.synth}:${p.name}`)} />}
                    </nav></div>
                )}
                <div className="sound-window-body sound-window-synth">
                    {isBus && (
                        <>
                            <div className="sound-window-bus">
                                <section className="group" style={{ '--n': BUS_ROLES.length }}>
                                    <h3>Sends</h3>
                                    <div className="group-controls">{BUS_ROLES.map((id) => <Fader key={id} spec={sendSpec(id, roles[id].label)} value={bus.sends[id] ?? 0} onChange={send} tone="teal" />)}</div>
                                </section>
                                <section className="group sound-window-perf">
                                    <h3>Performance</h3>
                                    <label className="lab-check"><input type="checkbox" checked={perfOn || performance.sharedReverb} disabled={perfOn} onChange={(e) => onPerformance({ sharedReverb: e.target.checked })} /> Share matching reverbs</label>
                                    <label>Reverb quality <select value={performance.reverb} onChange={(e) => onPerformance({ reverb: e.target.value })}><option value="full">Full</option><option value="light">Light</option></select></label>
                                    <p className="hint">Each voice keeps its own reverb; voices whose rooms match can share one, which saves CPU on phones. Changing these reloads the page (your settings are kept).</p>
                                </section>
                            </div>
                            <RackPanel values={bus.rack} onChange={(changes) => onBus({ ...bus, rack: { ...bus.rack, ...changes } })}
                                tools={<button type="button" onClick={() => gen.busRack?.clear()}>Clear tails</button>} />
                        </>
                    )}
                    {isPerc && !machine && (
                        <p className="sound-window-note">
                            {tab === 'effects' ? 'The kit’s room and each drum’s level and tone are in the Percussion panel.' : 'This kit is the generator’s own: choose another above, or a drum machine to play the same grooves on its pads.'}
                            {' '}<button type="button" onClick={() => { onClose(); document.querySelector('[data-tour="percussion"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Show the Percussion panel</button>
                        </p>
                    )}
                    {machine && tab === 'instrument' && (
                        <p className="sound-window-note">The {machineLabel(machine.synth)} plays the generator’s grooves, each drum on one of its pads. Choose its kit above; its echo and room are under Effects.</p>
                    )}
                    {(external || machine) && tab === 'effects' && (
                        <RackPanel values={rack} onChange={editRack}
                            instrumentSpecs={external ? instrumentSpaceKeys(synth).map((k) => ({ ...synth.params.BY_KEY[k], key: 'instrument.' + k })) : []}
                            tools={<button type="button" onClick={() => gen.roles[role].instrument.flushTails?.()}>Clear tails</button>} />
                    )}
                    {external && tab === 'instrument' && (
                        <VoicePanel id={external.synth} role={role} values={external.values} onChange={editValues} choose={chooseLibrary} current={external.name} full={full} />
                    )}
                    {!isPerc && !isBus && !external && preset && (
                        <NativePanel preset={preset} part={tab} polyphony={gen.getRolePolyphony(role)} engine={gen.getRoleEngine?.(role)} onChange={editNative} />
                    )}
                </div>
                <div ref={setBrowserHost} className="sound-window-synth sound-window-browsers" />
            </div>
        </div>
    );
}
