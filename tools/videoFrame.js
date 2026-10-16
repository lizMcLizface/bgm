// Draws the page's timeline panel (chord readout, the voices, the scrolling
// piano roll with its playhead) as video frames, from the plan the page
// returns (src/app/engine/render.js planTimeline). The roll itself is
// src/app/timelineDraw.js - the very code the page draws with - so a frame
// looks like the live view. Frames are drawn with node-canvas at a fixed
// 1400x600 (21:9) layout, scaled to the output size.

import { createCanvas } from '@napi-rs/canvas';
import { drawTimeline, chordBlocks } from '../src/app/timelineDraw.js';
import { ambienceDrift } from '../src/app/engine/ambience.js';

export const LAYOUT = { width: 1400, height: 600 };
const PAD = 16;
const READOUT = 40;
const STRIP = 175;
const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
// The strip's slots, as on the page: a voice that is absent leaves its slot empty.
const SLOTS = ['lead', 'counter', 'pad', 'bass', 'perc'];
const LABELS = { lead: 'Lead', counter: 'Second lead', pad: 'Rhythm', bass: 'Bass', perc: 'Percussion' };

const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
};

/**
 * @param {object} options
 * @param {object[]} options.bars - planTimeline's bars
 * @param {number} options.beatsPerBar
 * @param {object} options.meter - the meter ({ units, groups })
 * @param {object} options.mix - role -> { mute, solo }
 * @param {object} options.roles - the roles that play, role -> sound name (null for the drums)
 * @param {object} options.colors - the page's palette
 * @param {number} [options.outWidth] - the video's width (the height follows, 21:9)
 */
export function createFrameRenderer({ bars, beatsPerBar, meter, mix, roles, colors, outWidth = 1680 }) {
    const scale = outWidth / LAYOUT.width;
    const outHeight = Math.round(LAYOUT.height * scale);
    const canvas = createCanvas(outWidth, outHeight);
    const ctx = canvas.getContext('2d');
    const plan = bars.map((bar) => ({ ...bar, state: { phrase: { section: bar.section } } }));
    const view = { beatsPerBar, meter, loop: null, roles: mix };
    const rollWidth = LAYOUT.width - PAD * 2 - STRIP - 12;
    const rollHeight = LAYOUT.height - PAD - READOUT - 12;
    const rollX = PAD + STRIP + 12;
    const rollY = PAD / 2 + READOUT;
    let cursor = 0; // bar index of the last frame (time only moves forward)

    const barAt = (time) => {
        while (cursor + 1 < bars.length && bars[cursor + 1].start <= time) cursor++;
        return cursor;
    };

    const text = (value, x, y, { size = 13, weight = 400, fill = colors.text, baseline = 'middle' } = {}) => {
        ctx.font = `${weight} ${size}px ${FONT}`;
        ctx.fillStyle = fill;
        ctx.textBaseline = baseline;
        ctx.fillText(value, x, y);
        return ctx.measureText(value).width;
    };

    // The voices strip: a box per voice in its slot.
    const strip = () => {
        const slot = (rollHeight - 4 * 8) / 5;
        SLOTS.forEach((role, i) => {
            if (!(role in roles)) return;
            const boxHeight = 56;
            const y = rollY + i * (slot + 8) + (slot - boxHeight) / 2;
            roundRect(ctx, PAD, y, STRIP, boxHeight, 6);
            ctx.fillStyle = colors.surface;
            ctx.fill();
            ctx.strokeStyle = colors.border;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = colors[role];
            roundRect(ctx, PAD + 10, y + 13, 10, 10, 2);
            ctx.fill();
            const width = text(LABELS[role], PAD + 28, y + 18, { size: 14, weight: 500 });
            if (roles[role]) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(PAD + 28 + width + 6, y, STRIP - 38 - width - 6, boxHeight);
                ctx.clip();
                text(`· ${roles[role]}`, PAD + 28 + width + 6, y + 19, { size: 12, fill: colors.muted });
                ctx.restore();
            }
            const muted = mix[role] && mix[role].mute;
            text(muted ? 'muted' : '', PAD + 10, y + 42, { size: 12, fill: colors.muted });
        });
    };

    // The line above: the chord now, the key and tempo, and what comes next.
    const readout = (index, pos) => {
        const window = plan.slice(Math.max(0, index - 1), index + 40);
        const blocks = chordBlocks(window, beatsPerBar);
        const at = blocks.findIndex((b) => pos >= b.start && pos < b.end);
        if (at < 0) return;
        const bar = plan[index];
        let x = PAD;
        x += text(blocks[at].chord.name, x, PAD / 2 + 14, { size: 22, weight: 700 }) + 6;
        x += text(blocks[at].chord.numeral, x, PAD / 2 + 16, { size: 14, fill: colors.muted }) + 22;
        x += text(`${blocks[at].chord.keyName}${bar ? ` · ${Math.round(bar.bpm)} BPM` : ''}`, x, PAD / 2 + 16, { size: 14, fill: colors.muted }) + 22;
        const next = blocks.slice(at + 1, at + 4).map((b) => b.chord.name);
        if (next.length) text(`then ${next.join(' → ')}`, x, PAD / 2 + 16, { size: 14, fill: colors.muted });
    };

    return {
        width: outWidth,
        height: outHeight,
        /** Draws the frame at `time` seconds; returns its RGBA pixels. */
        frame(time) {
            const index = barAt(time);
            const bar = bars[index];
            const pos = bar.bar * beatsPerBar + ((time - bar.start) / bar.seconds) * bar.units;
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            ctx.fillStyle = colors.panel;
            ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);
            readout(index, pos);
            strip();
            ctx.save();
            ctx.translate(rollX, rollY);
            ctx.beginPath();
            ctx.rect(0, 0, rollWidth, rollHeight);
            ctx.clip();
            drawTimeline(ctx, rollWidth, rollHeight, { ...view, plan: plan.slice(Math.max(0, index - 2), index + 10) }, pos, colors);
            // drawTimeline clears its area first: the panel colour goes behind what it drew
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = colors.panel;
            ctx.fillRect(0, 0, rollWidth, rollHeight);
            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();
            return canvas.data();
        },
    };
}

const clockText = (seconds) => {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The video of an ambience-only render: the same panel, with a bar per layer
 * that rises and falls with the slow wander (the very paths the audio follows),
 * and the time. `ambience` is { name, layers: [{ label, level, id }], wander }.
 */
export function createAmbienceFrameRenderer({ ambience, colors, outWidth = 1680 }) {
    const scale = outWidth / LAYOUT.width;
    const outHeight = Math.round(LAYOUT.height * scale);
    const canvas = createCanvas(outWidth, outHeight);
    const ctx = canvas.getContext('2d');
    const drift = ambienceDrift(ambience.wander);
    const palette = [colors.counter, colors.pad, colors.lead, colors.bass, colors.perc, colors.accent];
    const text = (value, x, y, { size = 14, weight = 400, fill = colors.text, align = 'left' } = {}) => {
        ctx.font = `${weight} ${size}px ${FONT}`;
        ctx.fillStyle = fill;
        ctx.textBaseline = 'middle';
        ctx.textAlign = align;
        ctx.fillText(value, x, y);
    };
    const rowHeight = Math.min(90, (LAYOUT.height - 70 - PAD) / Math.max(1, ambience.layers.length));
    const top = 50 + (LAYOUT.height - 50 - PAD - rowHeight * ambience.layers.length) / 2; // the rows centred under the title
    return {
        width: outWidth,
        height: outHeight,
        frame(time) {
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            ctx.fillStyle = colors.panel;
            ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);
            const nameWidth = (() => { text(ambience.name, PAD, PAD / 2 + 14, { size: 22, weight: 700 }); return ctx.measureText(ambience.name).width; })();
            text('Ambience', PAD + nameWidth + 16, PAD / 2 + 16, { fill: colors.muted });
            text(clockText(time), LAYOUT.width - PAD, PAD / 2 + 16, { fill: colors.muted, align: 'right' });
            const whole = drift.total(time);
            ambience.layers.forEach((layer, i) => {
                const y = top + i * rowHeight;
                const trackX = PAD + 190;
                const trackWidth = LAYOUT.width - trackX - PAD;
                const h = Math.min(26, rowHeight * 0.4);
                ctx.fillStyle = palette[i % palette.length];
                roundRect(ctx, PAD, y + rowHeight / 2 - 5, 10, 10, 2);
                ctx.fill();
                text(layer.label, PAD + 22, y + rowHeight / 2, { size: 16, weight: 500 });
                roundRect(ctx, trackX, y + rowHeight / 2 - h / 2, trackWidth, h, 6);
                ctx.fillStyle = colors.surface;
                ctx.fill();
                ctx.strokeStyle = colors.border;
                ctx.stroke();
                const level = Math.max(0, Math.min(1, layer.level * drift.layer(layer.id, time) * whole));
                ctx.fillStyle = palette[i % palette.length];
                ctx.globalAlpha = 0.85;
                roundRect(ctx, trackX, y + rowHeight / 2 - h / 2, Math.max(h, trackWidth * level), h, 6);
                ctx.fill();
                ctx.globalAlpha = 1;
            });
            return canvas.data();
        },
    };
}
