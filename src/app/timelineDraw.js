// The timeline's drawing: a chord lane (past, current, upcoming) over a
// piano roll of every planned note, coloured by role, a strip of drum ticks
// under it, a fixed playhead and a marker wherever the key changes. Pure
// canvas calls over plain data, so the page draws it each animation frame
// (ChordTimeline.jsx) and the command-line renderer (tools/render.js)
// draws the same frames into a video.

import { groupStarts } from './meter';
import { SECTIONS } from './arranger';

const BARS_BEHIND = 1;
const BARS_AHEAD = 6;
const LANE_HEIGHT = 46;
const GAP = 8;
// The drums have a strip of their own under the roll, a row per drum (percussion.js DRUMS: 14),
// so their ticks never sit on the bass's notes.
const DRUM_ROWS = 14;
const DRUM_ROW = 3.2;
const PERC_HEIGHT = Math.ceil(DRUM_ROWS * DRUM_ROW) + 6;
// The piano roll takes what the lane and the drums' strip leave.
export const MIN_HEIGHT = LANE_HEIGHT + GAP + 120 + GAP + PERC_HEIGHT;
// Pitch window of the roll (MIDI): the arranger's bass floor .. lead ceiling.
const MIDI_LOW = 29;
const MIDI_HIGH = 93;

// Consecutive bars belonging to one chord occurrence -> one block.
export function chordBlocks(plan, beatsPerBar) {
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

/**
 * Draws the timeline: `view` is { plan, beatsPerBar, meter, loop, roles }
 * (what Generator.getPlan() and friends give; `roles`: role -> { mute, solo }),
 * `pos` the playhead in beats, `color` the palette by name (text, muted,
 * border, surface, accent, accentText and each role).
 */
export function drawTimeline(ctx, width, height, view, pos, color) {
    // A hidden canvas has no size; with no width the beat loops below never reach the edge.
    if (!(width > 0 && height > 0)) return;
    const { beatsPerBar, plan } = view;
    const rollHeight = height - LANE_HEIGHT - GAP - GAP - PERC_HEIGHT;
    const pxPerBeat = width / ((BARS_BEHIND + BARS_AHEAD) * beatsPerBar);
    const playheadX = BARS_BEHIND * beatsPerBar * pxPerBeat;
    const x = (beat) => playheadX + (beat - pos) * pxPerBeat;
    const rollTop = LANE_HEIGHT + GAP;
    const percTop = rollTop + rollHeight + GAP;
    const y = (midi) => rollTop + rollHeight - ((midi - MIDI_LOW) / (MIDI_HIGH - MIDI_LOW)) * rollHeight;
    const noteHeight = Math.max(2, rollHeight / (MIDI_HIGH - MIDI_LOW) - 1);

    ctx.clearRect(0, 0, width, height);

    // a faint line over the drums' strip
    ctx.strokeStyle = color.border;
    ctx.beginPath();
    ctx.moveTo(0, percTop - GAP / 2 + 0.5);
    ctx.lineTo(width, percTop - GAP / 2 + 0.5);
    ctx.stroke();

    // A loop: its bars shaded.
    if (view.loop) {
        const left = x(view.loop.from * beatsPerBar);
        const right = x((view.loop.to + 1) * beatsPerBar);
        ctx.fillStyle = color.accent;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(left, 0, right - left, height);
        ctx.globalAlpha = 1;
    }

    // Bar and beat grid.
    // Beat-group starts (5/4 = 3+2, ...) get a stronger line than units.
    const groupLines = groupStarts(view.meter);
    const firstBeat = Math.floor(pos - BARS_BEHIND * beatsPerBar);
    for (let beat = firstBeat; x(beat) <= width; beat++) {
        const inBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
        const isBar = inBar === 0;
        const isGroup = groupLines.includes(inBar);
        ctx.strokeStyle = color.border;
        ctx.globalAlpha = isBar ? 1 : isGroup ? 0.75 : 0.35;
        ctx.beginPath();
        ctx.moveTo(Math.round(x(beat)) + 0.5, isBar ? 0 : rollTop);
        ctx.lineTo(Math.round(x(beat)) + 0.5, height);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

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
        ctx.lineTo(Math.round(at) + 0.5, height);
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
        if (!section || section.start !== bar || (i > 0 && plan[i - 1].state.phrase.section && plan[i - 1].state.phrase.section.start === section.start)) return;
        const at = x(bar * beatsPerBar);
        if (at < -80 || at > width) return;
        ctx.fillStyle = color.muted;
        ctx.fillText(SECTIONS[section.type].label.toUpperCase(), Math.max(at, 0) + 4, height - 3);
    });
    ctx.textBaseline = 'middle';

    // Muted (or not soloed) roles are drawn faintly.
    const anySolo = Object.values(view.roles).some((r) => r.solo);
    const audible = Object.fromEntries(Object.entries(view.roles).map(([role, r]) => [role, anySolo ? r.solo : !r.mute]));

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
                // drum hits: short ticks in the strip under the roll, one row per drum;
                // a swish (drum 5) as long as it sounds
                roundRect(ctx, left, percTop + 3 + (DRUM_ROWS - 1 - e.midi) * DRUM_ROW, e.midi === 5 ? w : 3, 2.5, 1);
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
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.lineWidth = 1;
}
