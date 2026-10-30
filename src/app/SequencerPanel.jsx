import { useState } from 'react';
import { BEATS, ARRANGEMENTS, arrangementFor } from '../synths/drums/beats';
import { KITS } from '../synths/drums/kits';
import { SYNTHS } from '../synths/models';
import { STAGE_NAMES, SEQ_MACHINES, LANES, MOVE_PARAMS, MOVE_MAX, SECTION_BARS, sequencerStages, stageForBar } from './sequencer';
import './sequencer.css';

const NEXT = { '.': 'x', x: 'f', f: '.' };
// the chord lane also holds the chord (h), stacks it a tone at a time (s) and arpeggiates it (a)
const NEXT_CHORD = { '.': 'x', x: 'f', f: 'h', h: 's', s: 'a', a: '.' };
const CATEGORIES = [...new Set(BEATS.map((b) => b.category))];

/**
 * The step sequencer as the percussion (sequencer.js): a beat or arrangement on a drum machine, its
 * eight stages editable step by step, and a stage for each chord of the progression.
 * @param {{ seq: object, chords: string[], onChange: (seq: object) => void, onMachine: (synth: string) => void }} props
 */
export default function SequencerPanel({ seq, chords, machine, onChange, onMachine }) {
    const [stage, setStage] = useState(1);
    const stages = sequencerStages(seq);
    const recipe = arrangementFor(seq.arrangement);
    // the drum machine actually loaded wins over the setting (it can be changed in the sound window too)
    const machineId = SEQ_MACHINES.includes(machine?.synth) ? machine.synth : seq.machine;
    const kit = KITS[machineId] ?? KITS.tr808;
    const kitSounds = SYNTHS[machineId]?.presets ?? [];
    const moves = seq.moves?.[stage] ?? [];
    const setMoves = (list) => {
        const next = { ...seq.moves, [stage]: list };
        if (!list.length) delete next[stage];
        onChange({ ...seq, moves: next });
    };
    const moveRange = (key) => MOVE_PARAMS[key];
    const rows = stages?.[stage]?.rows ?? {};
    const blank = '.'.repeat(16);

    const set = (patch) => onChange({ ...seq, ...patch });
    const choose = (id) => set({ arrangement: id, edits: {}, slots: [], on: id ? true : false });
    const setCell = (voice, step) => {
        const row = [...(rows[voice] ?? blank)];
        row[step] = (voice === 'pad' ? NEXT_CHORD : NEXT)[row[step]] ?? 'x';
        onChange({ ...seq, edits: { ...seq.edits, [stage]: { ...(seq.edits?.[stage] ?? {}), [voice]: row.join('') } } });
    };
    const sections = seq.sectionBars > 0;
    // the entries to choose a stage for: a chord each, or - with sections - a list of sections that repeats
    const entries = sections ? (seq.slots ?? []) : chords;
    const setSlot = (index, value) => {
        const slots = entries.map((_, i) => (i === index ? value : seq.slots?.[i] ?? -1));
        set({ slots: !sections && slots.every((v) => v === -1) ? [] : slots });
    };
    const edited = Object.keys(seq.edits ?? {}).length > 0;
    const chain = [0, 1, 2, 3].map((bar) => STAGE_NAMES[stageForBar({ ...seq, slots: [] }, { bar })]).join(', ');

    return (
        <section className="gen-panel gen-panel-role gen-role-perc seq-panel" data-tour="sequencer">
            <h2 className="gen-panel-title">
                <i className="gen-swatch gen-swatch-perc" />
                Step sequencer
            </h2>
            <label className="gen-check seq-on">
                <input type="checkbox" checked={!!seq.on} disabled={!seq.arrangement} onChange={(e) => set({ on: e.target.checked })} />
                Play the sequencer as the percussion
            </label>
            <label className="gen-field">
                <span>Machine</span>
                <select value={machineId} onChange={(e) => { set({ machine: e.target.value }); onMachine?.(e.target.value, 'Room'); }}>
                    {SEQ_MACHINES.map((id) => <option key={id} value={id}>{KITS[id].name}</option>)}
                </select>
            </label>
            <label className="gen-field">
                <span>Drum sound</span>
                <select aria-label="Drum sound" value={machine?.synth === machineId ? machine.name : ''} onChange={(e) => onMachine?.(machineId, e.target.value)}>
                    {machine?.synth !== machineId && <option value="">Load…</option>}
                    {kitSounds.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
            </label>
            <label className="gen-field">
                <span>Beat</span>
                <select value={seq.arrangement} onChange={(e) => { choose(e.target.value); if (e.target.value && machine?.synth !== machineId) onMachine?.(machineId, 'Room'); }}>
                    <option value="">None</option>
                    <optgroup label="Arrangements (eight stages)">
                        {ARRANGEMENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                    {CATEGORIES.map((category) => (
                        <optgroup key={category} label={category}>
                            {BEATS.filter((b) => b.category === category).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </optgroup>
                    ))}
                </select>
            </label>
            <label className="gen-check seq-on">
                <input type="checkbox" checked={!!seq.lanes} disabled={!seq.arrangement} onChange={(e) => set({ lanes: e.target.checked })} />
                Chord and bass lanes: tight stabs on steps instead of the pad and bass patterns
            </label>
            {seq.lanes && (
                <>
                    <label className="gen-field"><span>{`Stab length ${Math.round(seq.gate * 100)}% of a beat`}</span>
                        <input type="range" min="0.05" max="4" step="0.01" value={seq.gate} onChange={(e) => set({ gate: Number(e.target.value) })} /></label>
                    <label className="gen-field"><span>{`Variation ${Math.round((seq.variation ?? 0) * 100)}%: single notes, thinner bars, rests`}</span>
                        <input type="range" min="0" max="1" step="0.01" value={seq.variation ?? 0} onChange={(e) => set({ variation: Number(e.target.value) })} /></label>
                    <label className="gen-field"><span>{`Kick pump ${Math.round(seq.pump * 100)}%`}</span>
                        <input type="range" min="0" max="1" step="0.01" value={seq.pump} onChange={(e) => set({ pump: Number(e.target.value) })} /></label>
                </>
            )}
            {recipe && (
                <>
                    <div className="seq-stages" role="tablist" aria-label="Stage">
                        {STAGE_NAMES.map((name, i) => (
                            <button key={name} type="button" role="tab" aria-selected={stage === i} className={stage === i ? 'on' : ''} onClick={() => setStage(i)}>{name}</button>
                        ))}
                    </div>
                    <div className="seq-grid" role="grid" aria-label={`${STAGE_NAMES[stage]} pattern`}>
                        {kit.tracks.map(([key, short, long]) => (
                            <div className="seq-row" role="row" key={key}>
                                <span className="seq-name" title={long}>{short}</span>
                                {[...(rows[key] ?? blank)].map((cell, step) => (
                                    <button key={step} type="button" role="gridcell" aria-label={`${long} step ${step + 1}`}
                                        className={`seq-cell${cell === 'x' ? ' on' : cell === 'f' ? ' flam' : ''}${step % 4 === 0 ? ' beat' : ''}`} onClick={() => setCell(key, step)} />
                                ))}
                            </div>
                        ))}
                        <div className="seq-row" role="row">
                            <span className="seq-name" title="Accent">AC</span>
                            {[...(rows.A ?? blank)].map((cell, step) => (
                                <button key={step} type="button" role="gridcell" aria-label={`Accent step ${step + 1}`}
                                    className={`seq-cell${cell === 'x' ? ' on' : ''}${step % 4 === 0 ? ' beat' : ''}`} onClick={() => setCell('A', step)} />
                            ))}
                        </div>
                        {seq.lanes && LANES.map((lane) => (
                            <div className="seq-row seq-lane" role="row" key={lane}>
                                <span className="seq-name" title={lane === 'pad' ? 'Chords: stab, accent, held chord, stacked tones, arpeggio note' : 'Bass (accent: octave up)'}>{lane === 'pad' ? 'CHD' : 'BAS'}</span>
                                {[...(rows[lane] ?? blank)].map((cell, step) => (
                                    <button key={step} type="button" role="gridcell" aria-label={`${lane === 'pad' ? 'Chord' : 'Bass line'} step ${step + 1}`}
                                        className={`seq-cell${cell === 'x' ? ' on' : cell === 'f' ? ' flam' : cell === 'h' ? ' held' : cell === 's' ? ' stack' : cell === 'a' ? ' arp' : ''}${step % 4 === 0 ? ' beat' : ''}`} onClick={() => setCell(lane, step)} />
                                ))}
                            </div>
                        ))}
                    </div>
                    {edited && <button type="button" className="gen-keys-button" onClick={() => set({ edits: {} })}>Reset my edits</button>}
                    <label className="gen-check seq-on">
                        <input type="checkbox" checked={!!seq.fills} onChange={(e) => set({ fills: e.target.checked })} />
                        A fill every fourth bar (the Fill stage's drums)
                    </label>
                    <fieldset className="gen-weights seq-moves">
                        <legend>{`Effect moves while ${STAGE_NAMES[stage]} plays`}</legend>
                        {moves.map((move, i) => (
                            <div className="seq-move" key={i}>
                                <select aria-label="Effect" value={move.key} onChange={(e) => { const r = moveRange(e.target.value); setMoves(moves.map((m, j) => (j === i ? { key: e.target.value, from: r.min, to: r.max } : m))); }}>
                                    {Object.entries(MOVE_PARAMS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
                                </select>
                                {['from', 'to'].map((end) => (
                                    <label key={end}><span>{end === 'from' ? 'Start' : 'End'}</span>
                                        <input type="range" aria-label={`${end} ${MOVE_PARAMS[move.key].label}`} min={moveRange(move.key).min} max={moveRange(move.key).max} step={(moveRange(move.key).max - moveRange(move.key).min) / 100}
                                            value={move[end]} onChange={(e) => setMoves(moves.map((m, j) => (j === i ? { ...m, [end]: Number(e.target.value) } : m)))} /></label>
                                ))}
                                <button type="button" aria-label="Remove move" onClick={() => setMoves(moves.filter((_, j) => j !== i))}>×</button>
                            </div>
                        ))}
                        {moves.length < MOVE_MAX && (
                            <select aria-label="Add an effect move" value="" onChange={(e) => { const r = moveRange(e.target.value); if (r) setMoves([...moves, { key: e.target.value, from: r.min, to: r.max }]); }}>
                                <option value="">Add a move…</option>
                                {Object.entries(MOVE_PARAMS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                        )}
                        <small>Each runs from its start value on the chord's first bar to its end value on the last. Chords on a stage with no move use the normal bus.</small>
                    </fieldset>
                    <fieldset className="gen-weights seq-slots">
                        <legend>{sections ? `Stage for each ${seq.sectionBars}-bar section` : 'Stage for each chord'}</legend>
                        <label className="gen-field">
                            <span>Each stage lasts</span>
                            <select aria-label="Each stage lasts" value={seq.sectionBars ?? 0} onChange={(e) => set({ sectionBars: Number(e.target.value), slots: [] })}>
                                {SECTION_BARS.map((n) => <option key={n} value={n}>{n ? `${n} bars` : 'as long as its chord'}</option>)}
                            </select>
                        </label>
                        {entries.map((entry, i) => (
                            <label key={i} className="gen-field seq-slot">
                                <span>{sections ? `Section ${i + 1}` : entry}</span>
                                <select value={seq.slots?.[i] ?? -1} onChange={(e) => setSlot(i, Number(e.target.value))}>
                                    <option value={-1}>Follow the arrangement</option>
                                    {STAGE_NAMES.map((name, s) => <option key={name} value={s}>{name}</option>)}
                                </select>
                            </label>
                        ))}
                        {sections && (
                            <div className="seq-sections">
                                <button type="button" onClick={() => set({ slots: [...(seq.slots ?? []), -1].slice(0, 16) })}>Add a section</button>
                                {entries.length > 0 && <button type="button" onClick={() => set({ slots: entries.slice(0, -1) })}>Remove the last</button>}
                            </div>
                        )}
                        <small>{sections ? `Sections play in turn, then the list starts again. With none, the arrangement's own order runs, ${seq.sectionBars} bars a stage.` : `Chords set to Follow step through ${recipe.name} a stage per bar: ${chain} ...`}</small>
                    </fieldset>
                </>
            )}
        </section>
    );
}
