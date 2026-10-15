// Scrolling view of the generator's plan: a chord lane (past, current,
// upcoming) over a piano roll of every planned note, coloured by role, with
// a fixed playhead, and a marker wherever the Conductor changes key. Drawn
// on a canvas each animation frame straight from
// Generator.getPlan()/position(); React only re-renders when the chord
// under the playhead changes (for the text readout).

import React, { useEffect, useRef, useState } from 'react';
import { groupStarts } from './meter';
import { SECTIONS } from './arranger';

const BARS_BEHIND = 1;
const BARS_AHEAD = 6;
const LANE_HEIGHT = 46;
const ROLL_HEIGHT = 180;
const GAP = 8;
const HEIGHT = LANE_HEIGHT + GAP + ROLL_HEIGHT;
// Pitch window of the roll (MIDI): the arranger's bass floor .. lead ceiling.
const MIDI_LOW = 29;
const MIDI_HIGH = 93;

const cssVar = (style, name) => style.getPropertyValue(name).trim();

// Consecutive bars belonging to one chord occurrence -> one block.
function chordBlocks(plan, beatsPerBar) {
    const blocks = [];
    plan.forEach(({ bar, chord, chordStart }) => {
        const last = blocks[blocks.length - 1];
        if (!chordStart && last && last.endBar === bar) {
            last.endBar = bar + 1;
        } else {
            blocks.push({ chord, startBar: bar, endBar: bar + 1 });
        }
    });
    return blocks.map((b) => ({ ...b, start: b.startBar * beatsPerBar, end: b.endBar * beatsPerBar }));
}

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function draw(ctx, width, gen, pos) {
    const style = getComputedStyle(ctx.canvas);
    const color = {
        text: cssVar(style, '--gen-text'),
        muted: cssVar(style, '--gen-muted'),
        border: cssVar(style, '--gen-border'),
        surface: cssVar(style, '--gen-bg'),
        accent: cssVar(style, '--gen-accent'),
        accentText: cssVar(style, '--gen-accent-text'),
        pad: cssVar(style, '--gen-role-pad'),
        bass: cssVar(style, '--gen-role-bass'),
        lead: cssVar(style, '--gen-role-lead'),
        counter: cssVar(style, '--gen-role-counter'),
        perc: cssVar(style, '--gen-role-perc'),
    };
    const beatsPerBar = gen.beatsPerBar;
    const pxPerBeat = width / ((BARS_BEHIND + BARS_AHEAD) * beatsPerBar);
    const playheadX = BARS_BEHIND * beatsPerBar * pxPerBeat;
    const x = (beat) => playheadX + (beat - pos) * pxPerBeat;
    const rollTop = LANE_HEIGHT + GAP;
    const y = (midi) => rollTop + ROLL_HEIGHT - ((midi - MIDI_LOW) / (MIDI_HIGH - MIDI_LOW)) * ROLL_HEIGHT;
    const noteHeight = Math.max(2, ROLL_HEIGHT / (MIDI_HIGH - MIDI_LOW) - 1);

    ctx.clearRect(0, 0, width, HEIGHT);

    // A loop: its bars shaded.
    if (gen.loop) {
        const left = x(gen.loop.from * beatsPerBar);
        const right = x((gen.loop.to + 1) * beatsPerBar);
        ctx.fillStyle = color.accent;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(left, 0, right - left, HEIGHT);
        ctx.globalAlpha = 1;
    }

    // Bar and beat grid.
    // Beat-group starts (5/4 = 3+2, ...) get a stronger line than units.
    const groupLines = groupStarts(gen.meter);
    const firstBeat = Math.floor(pos - BARS_BEHIND * beatsPerBar);
    for (let beat = firstBeat; x(beat) <= width; beat++) {
        const inBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
        const isBar = inBar === 0;
        const isGroup = groupLines.includes(inBar);
        ctx.strokeStyle = color.border;
        ctx.globalAlpha = isBar ? 1 : isGroup ? 0.75 : 0.35;
        ctx.beginPath();
        ctx.moveTo(Math.round(x(beat)) + 0.5, isBar ? 0 : rollTop);
        ctx.lineTo(Math.round(x(beat)) + 0.5, HEIGHT);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const plan = gen.getPlan();

    // Chord lane.
    ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    chordBlocks(plan, beatsPerBar).forEach(({ chord, start, end }) => {
        const left = x(start) + 2;
        const w = x(end) - x(start) - 4;
        if (left > width || left + w < 0) return;
        const isCurrent = pos >= start && pos < end;
        const isPast = end <= pos;
        ctx.globalAlpha = isPast ? 0.45 : 1;
        roundRect(ctx, left, 2, w, LANE_HEIGHT - 4, 6);
        ctx.fillStyle = isCurrent ? color.accent : color.surface;
        ctx.fill();
        ctx.strokeStyle = isCurrent ? color.accent : color.border;
        ctx.stroke();

        ctx.save();
        ctx.clip();
        const textX = Math.max(left, 0) + 10;
        ctx.fillStyle = isCurrent ? color.accentText : color.text;
        ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillText(chord.name, textX, LANE_HEIGHT / 2);
        const nameWidth = ctx.measureText(chord.name).width;
        ctx.font = '13px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = isCurrent ? color.accentText : color.muted;
        ctx.fillText(chord.numeral, textX + nameWidth + 6, LANE_HEIGHT / 2 + 1);
        ctx.restore();
    });
    ctx.globalAlpha = 1;

    // Key changes: a line through the roll and the new key's name.
    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    plan.forEach(({ bar, chord }, i) => {
        if (i === 0 || plan[i - 1].chord.keyName === chord.keyName) return;
        const at = x(bar * beatsPerBar);
        if (at < 0 || at > width) return;
        ctx.strokeStyle = color.accent;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(at) + 0.5, rollTop);
        ctx.lineTo(Math.round(at) + 0.5, HEIGHT);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color.accent;
        ctx.fillText(`→ ${chord.keyName}`, at + 4, rollTop + 2);
    });

    // Sections: their name where each begins, along the roll's foot.
    ctx.textBaseline = 'bottom';
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
    plan.forEach(({ bar, state }, i) => {
        const section = state.phrase.section;
        if (!section || section.start !== bar || (i > 0 && plan[i - 1].state.phrase.section === section)) return;
        const at = x(bar * beatsPerBar);
        if (at < -80 || at > width) return;
        ctx.fillStyle = color.muted;
        ctx.fillText(SECTIONS[section.type].label.toUpperCase(), Math.max(at, 0) + 4, HEIGHT - 3);
    });
    ctx.textBaseline = 'middle';

    // Muted (or not soloed) roles are drawn faintly.
    const anySolo = Object.values(gen.roles).some((r) => r.solo);
    const audible = Object.fromEntries(Object.entries(gen.roles).map(([role, r]) => [role, anySolo ? r.solo : !r.mute]));

    // Piano roll.
    plan.forEach(({ bar, events }) => {
        events.forEach((e) => {
            const start = bar * beatsPerBar + e.beat;
            const end = start + e.length;
            const left = x(start);
            const w = Math.max(2, x(end) - left);
            if (left > width || left + w < 0) return;
            const sounding = pos >= start && pos < end;
            ctx.fillStyle = color[e.role] || color.muted;
            const level = end <= pos ? 0.3 : sounding ? 1 : 0.6;
            ctx.globalAlpha = audible[e.role] === false ? level * 0.2 : level;
            if (e.role === 'perc') {
                // drum hits: short ticks along the bottom, one row per drum;
                // a swish (drum 5) as long as it sounds
                roundRect(ctx, left, rollTop + ROLL_HEIGHT - 3 - e.midi * 3, e.midi === 5 ? w : 3, 2.5, 1);
            } else {
                roundRect(ctx, left, y(e.midi) - noteHeight / 2, w, noteHeight, 2);
            }
            ctx.fill();
        });
    });
    ctx.globalAlpha = 1;

    // Playhead.
    ctx.strokeStyle = color.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, HEIGHT);
    ctx.stroke();
    ctx.lineWidth = 1;
}

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
        let frame = 0;
        let last = null;

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            width = canvas.clientWidth;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(HEIGHT * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();

        const loop = () => {
            const pos = generator.position();
            draw(ctx, width, generator, pos);
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
                <canvas ref={canvasRef} className="gen-timeline-canvas" style={{ height: HEIGHT }} />
            </div>
        </section>
    );
};

export default ChordTimeline;
