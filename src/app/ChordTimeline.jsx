// Scrolling view of the generator's plan (drawn by timelineDraw.js) with a
// fixed playhead. Drawn on a canvas each animation frame straight from
// Generator.getPlan()/position(); React only re-renders when the chord
// under the playhead changes (for the text readout).
//
// The box keeps one shape (21:9, with all five voices showing): a voice that
// isn't playing leaves its slot empty in the strip instead of the box
// shrinking, and the canvas takes whatever height the box has.

import React, { useEffect, useRef, useState } from 'react';
import { drawTimeline, chordBlocks, MIN_HEIGHT } from './timelineDraw';

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

// `tracks`: the role strip (Tracks.jsx) shown left of the canvas; its
// colour swatches double as the legend.
const ChordTimeline = ({ generator, tracks }) => {
    const canvasRef = useRef(null);
    const [now, setNow] = useState(null);

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
            drawTimeline(ctx, width, height, {
                plan: generator.getPlan(), beatsPerBar: generator.beatsPerBar, meter: generator.meter, loop: generator.loop, roles: generator.roles,
            }, pos, timelineColors(canvas));
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
        <section className="gen-timeline">
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
            <div className="gen-timeline-body">
                {tracks}
                <canvas ref={canvasRef} className="gen-timeline-canvas" />
            </div>
        </section>
    );
};

export default ChordTimeline;
