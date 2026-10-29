// The hero view: a floating window that plays the music out ahead of the playhead, game-style.
// Guitar and bass: a note highway after Rocksmith, the strings running left to right, the "now" bar on the left
// and the notes coming in from the right towards it, each a round fret number with a trail as long as it is held.
// The notes are re-fingered so the hand can actually play them (heroFingering.js). Piano: Synthesia-style,
// all 88 keys at the bottom with the notes falling onto them; keys held on a MIDI keyboard light up too.
// Drawn on a canvas every animation frame straight from the generator's plan; React only handles the window.

import React, { useEffect, useRef, useState } from 'react';
import { upcomingNotes } from './heroNotes';
import { NECKS, foldIntoNeck, fingerMoments } from './heroFingering';
import { midiHeld } from './Tracks';
import { CloseIcon, SwordIcon } from './icons';
import { readPref, writePref } from './prefs';
import './hero.css';

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const TITLES = { guitar: 'Guitar · 6 strings', bass: 'Bass · 4 strings', piano: 'Piano · 88 keys' };

// Black or white text, whichever reads on the colour.
const inkFor = (color) => {
    const m = /^#([0-9a-f]{6})$/i.exec(color ?? '');
    if (!m) return '#fff';
    const n = parseInt(m[1], 16), luminance = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return luminance > 0.6 ? '#10141a' : '#fff';
};

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

// ---- guitar and bass ---------------------------------------------------------------------------------------

const NOW_X = 96;

function drawHighway(ctx, w, h, { neck, notes, bars, look, colors }) {
    const count = neck.strings.length, top = 28, bottom = h - 28, gap = (bottom - top) / (count - 1);
    const y = (string) => bottom - string * gap, pps = (w - NOW_X - 28) / look;
    ctx.clearRect(0, 0, w, h);

    // bar and beat lines moving in with the music
    for (const bar of bars) {
        for (let t = bar.t, k = 0; t < bar.t + bar.sec - 1e-6; t += bar.beatSec, k++) {
            const x = NOW_X + t * pps;
            if (x < NOW_X || x > w) continue;
            ctx.strokeStyle = k === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.07)';
            ctx.lineWidth = k === 0 ? 1.5 : 1;
            ctx.beginPath(); ctx.moveTo(x, top - 12); ctx.lineTo(x, bottom + 12); ctx.stroke();
        }
    }

    // the strings, the thicker ones lower, with their names
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.font = '600 12px ui-monospace, monospace';
    neck.strings.forEach((open, string) => {
        ctx.strokeStyle = 'rgba(200,205,214,.55)'; ctx.lineWidth = 1 + (count - 1 - string) * 0.35;
        ctx.beginPath(); ctx.moveTo(34, y(string)); ctx.lineTo(w, y(string)); ctx.stroke();
        ctx.fillStyle = colors.muted; ctx.fillText(NAMES[open % 12].replace('♯', '#').replace('♭', 'b'), 16, y(string));
    });

    // trails first, so every head sits on top of them
    for (const n of notes) {
        const x0 = NOW_X + Math.max(n.t, 0) * pps, x1 = NOW_X + Math.min(Math.max(n.t + n.dur, 0), look) * pps;
        if (x1 - x0 < 4) continue;
        ctx.fillStyle = colors[n.role] ?? colors.muted;
        ctx.globalAlpha = (n.t <= 0 ? 0.75 : 0.42) * Math.min(1, (n.t + n.dur + 0.25) / 0.25);
        roundRect(ctx, x0, y(n.string) - 5, x1 - x0, 10, 5); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the "now" bar
    const glow = ctx.createLinearGradient(NOW_X - 14, 0, NOW_X + 14, 0);
    glow.addColorStop(0, 'rgba(255,255,255,0)'); glow.addColorStop(0.5, 'rgba(255,255,255,.28)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(NOW_X - 14, top - 18, 28, bottom - top + 36);
    ctx.strokeStyle = colors.text; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(NOW_X, top - 18); ctx.lineTo(NOW_X, bottom + 18); ctx.stroke();

    // a fixed slot on the bar for each string, always showing the fret of the next note on it: the number is
    // read here, still, and the note arrives into it on cue
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let string = 0; string < count; string++) {
        const next = notes.filter((n) => n.string === string && n.t + n.dur > 0).sort((a, b) => Math.max(a.t, 0) - Math.max(b.t, 0))[0];
        ctx.fillStyle = '#0d1117'; ctx.beginPath(); ctx.arc(NOW_X, y(string), 17, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(200,205,214,.28)'; ctx.lineWidth = 1.5; ctx.stroke();
        if (!next) continue;
        const color = colors[next.role] ?? colors.muted, playing = next.t <= 0, near = Math.max(0, Math.min(1, 1 - next.t / 1.5));
        ctx.globalAlpha = playing ? 1 : 0.35 + 0.65 * near;
        ctx.strokeStyle = color; ctx.lineWidth = playing ? 3 : 2; ctx.beginPath(); ctx.arc(NOW_X, y(string), 17, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = color; ctx.font = '800 17px ui-monospace, monospace'; ctx.fillText(String(next.fret), NOW_X, y(string) + 0.5);
        ctx.globalAlpha = 1;
    }

    // the notes: a round dot where it is due, pinned to the bar while it is held; the number on it is
    // small, the slot on the bar is for reading
    ctx.font = '700 12px ui-monospace, monospace';
    for (const n of [...notes].sort((a, b) => b.t - a.t)) {
        const playing = n.t <= 0 && n.t + n.dur > 0, color = colors[n.role] ?? colors.muted;
        const x = NOW_X + Math.max(n.t, 0) * pps;
        ctx.globalAlpha = Math.min(1, (n.t + n.dur + 0.25) / 0.25);
        if (playing) { ctx.fillStyle = color; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(x, y(n.string), 21, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        // a ring under a coming note grows as it travels, and is the size of the slot on the bar when the note gets there
        if (n.t > 0) {
            const grown = 4 + 13 * Math.max(0, Math.min(1, 1 - n.t / look));
            ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
            ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(x, y(n.string), grown, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha *= 0.3; ctx.fill(); ctx.globalAlpha = Math.min(1, (n.t + n.dur + 0.25) / 0.25);
        }
        ctx.fillStyle = color; ctx.strokeStyle = playing ? '#fff' : 'rgba(0,0,0,.45)'; ctx.lineWidth = playing ? 2.5 : 1.5;
        ctx.beginPath(); ctx.arc(x, y(n.string), playing ? 15 : 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = inkFor(color); ctx.fillText(String(n.fret), x, y(n.string) + 0.5);
        ctx.globalAlpha = 1;
    }
}

// Which string and fret each note is played at. Moments (a note, or a chord struck together) are fingered
// in order; once a moment has its shape it keeps it, so notes do not jump about as they scroll in.
function placeNotes(notes, neck, cache, hand) {
    const moments = new Map();
    for (const n of notes) {
        const id = `${n.bar}:${n.beat}`, moment = moments.get(id) ?? { id, time: n.t, end: n.t + n.dur, notes: [] };
        moment.end = Math.max(moment.end, n.t + n.dur);
        moment.notes.push({ ...n, folded: foldIntoNeck(n.midi, neck) });
        moments.set(id, moment);
    }
    const list = [...moments.values()].sort((a, b) => a.time - b.time);
    for (const moment of list) moment.pitches = [...new Set(moment.notes.map((n) => n.folded))].sort((a, b) => a - b);
    const signature = (moment) => moment.pitches.join(',');
    const first = list.findIndex((moment) => cache.get(moment.id)?.signature !== signature(moment));
    if (first >= 0) {
        const previous = list[first - 1] && cache.get(list[first - 1].id);
        const before = previous ? { shape: previous.shape, time: list[first - 1].time, end: list[first - 1].end } : hand.current;
        const shapes = fingerMoments(list.slice(first), neck, before);
        shapes.forEach((shape, i) => cache.set(list[first + i].id, { signature: signature(list[first + i]), shape }));
    }
    for (const moment of list) if (moment.time <= 0 && cache.has(moment.id)) hand.current = { shape: cache.get(moment.id).shape, time: moment.time, end: moment.end };
    if (cache.size > 160) { const live = new Set(list.map((m) => m.id)); for (const id of cache.keys()) if (!live.has(id)) cache.delete(id); }
    return list.flatMap((moment) => {
        const shape = cache.get(moment.id)?.shape ?? [];
        return moment.notes.flatMap((n) => {
            const position = shape.find((p) => p.midi === n.folded);
            return position ? [{ ...n, string: position.string, fret: position.fret }] : [];
        });
    });
}

// ---- piano -------------------------------------------------------------------------------------------------

const LOW = 21, HIGH = 108;
const isBlack = (midi) => [1, 3, 6, 8, 10].includes(midi % 12);

function pianoKeys(w) {
    const whites = [];
    for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) whites.push(m);
    const ww = w / whites.length, keys = new Map();
    whites.forEach((m, i) => keys.set(m, { x: i * ww, w: ww, black: false }));
    for (let m = LOW; m <= HIGH; m++) {
        if (!isBlack(m)) continue;
        const centre = (whites.indexOf(m - 1) + 1) * ww;
        keys.set(m, { x: centre - ww * 0.3, w: ww * 0.6, black: true });
    }
    return keys;
}

function drawPiano(ctx, w, h, { notes, bars, look, colors, held }) {
    const keysH = Math.min(104, Math.round(h * 0.28)), fall = h - keysH, pps = fall / look, keys = pianoKeys(w);
    const y = (t) => fall - t * pps;
    ctx.clearRect(0, 0, w, h);

    // octave stripes and the beat lines moving down onto the keys
    for (let m = LOW; m <= HIGH; m++) {
        if (m % 12 !== 0) continue;
        const key = keys.get(m);
        ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(key.x, 0, key.w * 7, fall);
    }
    for (const bar of bars) {
        for (let t = bar.t, k = 0; t < bar.t + bar.sec - 1e-6; t += bar.beatSec, k++) {
            if (t < 0 || t > look) continue;
            ctx.strokeStyle = k === 0 ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.06)';
            ctx.lineWidth = k === 0 ? 1.5 : 1;
            ctx.beginPath(); ctx.moveTo(0, y(t)); ctx.lineTo(w, y(t)); ctx.stroke();
        }
    }

    // the notes, falling; cut off where they reach the keys
    const sounding = new Map();
    for (const n of notes) {
        const key = keys.get(n.midi);
        if (!key) continue;
        const color = colors[n.role] ?? colors.muted, bottom = y(Math.max(n.t, 0)), topEdge = y(Math.min(n.t + n.dur, look));
        if (n.t <= 0 && n.t + n.dur > 0) sounding.set(n.midi, color);
        if (bottom - topEdge < 2) continue;
        const inset = key.black ? 1 : 1.5;
        ctx.globalAlpha = Math.min(1, (n.t + n.dur + 0.25) / 0.25) * (n.t <= 0 ? 1 : 0.88);
        ctx.fillStyle = color;
        roundRect(ctx, key.x + inset, topEdge, key.w - inset * 2, bottom - topEdge, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the keys, white then black, lit by what sounds and by what is held on a MIDI keyboard
    const paint = (midi, base) => {
        const key = keys.get(midi), lit = sounding.get(midi), pressed = held.has(midi);
        ctx.fillStyle = lit ?? (pressed ? colors.accent : base);
        ctx.fillRect(key.x + 0.5, fall, key.w - 1, key.black ? keysH * 0.62 : keysH);
        if (pressed && lit) { ctx.strokeStyle = colors.accent; ctx.lineWidth = 3; ctx.strokeRect(key.x + 2, fall + 2, key.w - 4, (key.black ? keysH * 0.62 : keysH) - 4); }
    };
    for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) paint(m, '#e7e7e3');
    ctx.strokeStyle = '#737b84'; ctx.lineWidth = 1;
    for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) { const key = keys.get(m); ctx.strokeRect(key.x + 0.5, fall + 0.5, key.w - 1, keysH - 1); }
    for (let m = LOW; m <= HIGH; m++) if (isBlack(m)) paint(m, '#20242b');
    // a mark on each C
    ctx.fillStyle = '#737b84'; ctx.font = '600 9px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let m = LOW; m <= HIGH; m++) if (m % 12 === 0) { const key = keys.get(m); ctx.fillText(`C${m / 12 - 1}`, key.x + key.w / 2, fall + keysH - 4); }
    ctx.strokeStyle = colors.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, fall); ctx.lineTo(w, fall); ctx.stroke();
}

// ---- the window --------------------------------------------------------------------------------------------

const HeroView = ({ generator, instrument, voices, voiceToggle, colorsOf, onClose }) => {
    const canvasRef = useRef(null), cache = useRef(new Map()), hand = useRef(null);
    const [look, setLook] = useState(() => Math.min(8, Math.max(1, Number(readPref('bgm-hero-look', 3)) || 3)));
    const [offset, setOffset] = useState({ x: 0, y: 0 }), drag = useRef(null);
    const changeLook = (value) => { setLook(value); writePref('bgm-hero-look', value); };

    useEffect(() => { cache.current.clear(); hand.current = null; }, [instrument, voices.join()]);

    useEffect(() => {
        const canvas = canvasRef.current, ctx = canvas.getContext('2d');
        let width = 0, height = 0, frame = 0;
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            width = canvas.clientWidth; height = canvas.clientHeight;
            canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas); resize();
        const loop = () => {
            const colors = colorsOf(), { notes, bars } = upcomingNotes(generator, voices, look);
            if (instrument === 'piano') drawPiano(ctx, width, height, { notes, bars, look, colors, held: midiHeld });
            else {
                const neck = NECKS[instrument];
                drawHighway(ctx, width, height, { neck, notes: placeNotes(notes, neck, cache.current, hand), bars, look, colors });
            }
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(frame); observer.disconnect(); };
    }, [generator, instrument, voices.join(), look]); // eslint-disable-line react-hooks/exhaustive-deps

    const startDrag = (e) => {
        if (e.target.closest('button, input, label, select')) return;
        drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const moveDrag = (e) => { if (drag.current) setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
    const endDrag = () => { drag.current = null; };

    return (
        <aside className={`gen-hero gen-hero-${instrument}`} style={{ transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)` }} role="dialog" aria-label={`Hero view: ${TITLES[instrument]}`}>
            <header onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                <SwordIcon />
                <strong>{TITLES[instrument]}</strong>
                <label className="gen-hero-look">Look ahead
                    <input type="range" min="1" max="8" step="0.5" value={look} onChange={(e) => changeLook(Number(e.target.value))} aria-label="Look ahead in seconds" />
                    <span>{look.toFixed(1)} s</span>
                </label>
                {voiceToggle}
                <button type="button" className="gen-hero-close" aria-label="Close the hero view" title="Close" onClick={onClose}><CloseIcon /></button>
            </header>
            <canvas ref={canvasRef} className="gen-hero-canvas" aria-hidden="true" />
        </aside>
    );
};

export default HeroView;
