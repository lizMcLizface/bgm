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
import Piano from '../labs/Piano';
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
        bpm: bar ? Math.round(bar.bpm) : null,
    };
}

const sameReadout = (a, b) =>
    a && b && a.current.name === b.current.name && a.current.numeral === b.current.numeral
    && a.next.map((c) => c.name).join() === b.next.map((c) => c.name).join()
    && a.key === b.key && a.bpm === b.bpm;

// One octave above a chord: its tones marked, the bar's scale underlined, coloured from the chord's root.
const ChordPiano = React.memo(({ chord, record, fallback }) => {
    const tonic = record?.music?.tonic ?? fallback.tonic, mode = record?.music?.mode ?? fallback.mode;
    const scale = scaleSemitones(scaleById(mode).intervals).map((n) => (n + tonic) % 12);
    return <Piano mini low={60} high={71} scale={scale} chord={chord.pitchClasses} root={chord.pitchClasses[0] ?? tonic} label={`Chord ${chord.name}`} />;
});

// `tracks`: the role strip (Tracks.jsx) shown left of the canvas; its
// colour swatches double as the legend. `pianos`: a mini piano above each chord.
const ChordTimeline = ({ generator, tracks, onExploreRule, pianos = false }) => {
    const canvasRef = useRef(null);
    const [now, setNow] = useState(null);
    const rootRef = useRef(null), buttons = useRef(new Map()), keyboards = useRef(new Map()), hideTimer = useRef(null), targetsRef = useRef([]), restoringFocus = useRef(false);
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
                const keyboard = keyboards.current.get(region.key);
                if (keyboard) { keyboard.style.left = region.left + 'px'; keyboard.style.width = region.width + 'px'; keyboard.style.opacity = region.end <= pos ? 0.45 : 1; }
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
                    </>
                )}
            </div>
            <div className={`gen-timeline-body${tracks ? '' : ' is-no-tracks'}`}>
                {tracks}
                <div className={`gen-timeline-roll${pianos ? ' has-pianos' : ''}`}>
                    {pianos && (
                        <div className="gen-timeline-pianos" aria-hidden="true">
                            {targets.map((target) => (
                                <div key={target.key} className="gen-timeline-piano" ref={(el) => { if (el) keyboards.current.set(target.key, el); else keyboards.current.delete(target.key); }}
                                    style={{ left: target.left, width: target.width }}>
                                    <ChordPiano chord={target.chord} record={target.record} fallback={generator.settings} />
                                </div>
                            ))}
                        </div>
                    )}
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
    );
};

export default ChordTimeline;
