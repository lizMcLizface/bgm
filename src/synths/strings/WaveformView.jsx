import React, { useEffect, useRef } from 'react';

const W = 960, left = 52, right = 8;

/** Level of x in dB (RMS over `window` samples, every `hop`), from sample 0 to `count`. */
function levelDb(x, count, window, hop) {
    const out = [];
    for (let i = 0; i + window <= count; i += hop) { let s = 0; for (let k = 0; k < window; k++) s += x[i + k] * x[i + k]; out.push(10 * Math.log10(s / window + 1e-14)); }
    return out;
}

/**
 * The start of a note as a waveform: the original above the model on one vertical scale, then both short-time levels (dB, RMS over 2 ms)
 * on one plot, so how a note ramps up (or does not) can be compared directly. `ms` is how much of the start to show.
 */
export default function WaveformView({ original, model, rate, ms = 200, startMs = 0 }) {
    const canvas = useRef(null);
    useEffect(() => {
        const el = canvas.current;
        if (!el || !original || !model) return;
        const skip = Math.round(startMs / 1000 * rate);
        original = original.subarray(skip); model = model.subarray(skip);
        const count = Math.min(Math.round(ms / 1000 * rate), original.length, model.length), H = 520, plot = W - left - right, g = el.getContext('2d');
        el.width = W; el.height = H;
        g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
        let peak = 1e-9;
        for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(original[i]), Math.abs(model[i]));
        const row = (y0, h, x, colour, label) => {
            g.fillStyle = '#ddd'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(label, left + 4, y0 + 12);
            g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(left, y0 + h / 2); g.lineTo(left + plot, y0 + h / 2); g.stroke();
            g.strokeStyle = colour; g.lineWidth = 1; g.beginPath();
            // one min and max per pixel column, so every peak shows however many samples there are
            for (let px = 0; px < plot; px++) {
                const a = Math.floor(px * count / plot), b = Math.max(a + 1, Math.floor((px + 1) * count / plot));
                let lo = Infinity, hi = -Infinity;
                for (let i = a; i < b && i < count; i++) { lo = Math.min(lo, x[i]); hi = Math.max(hi, x[i]); }
                g.moveTo(left + px + .5, y0 + h / 2 - hi / peak * h / 2); g.lineTo(left + px + .5, y0 + h / 2 - lo / peak * h / 2);
            }
            g.stroke();
        };
        row(4, 150, original, '#f6a35c', 'Original');
        row(160, 150, model, '#7fb8ff', 'Model');
        // levels
        const window = Math.max(8, Math.round(.002 * rate)), hop = Math.max(1, Math.round(.0005 * rate)), a = levelDb(original, count, window, hop), b = levelDb(model, count, window, hop);
        const top = Math.max(...a, ...b), bottom = top - 70, y0 = 330, h = 160, ys = (v) => y0 + h - Math.max(0, Math.min(1, (v - bottom) / (top - bottom))) * h;
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.fillStyle = '#ddd'; g.textAlign = 'right';
        for (let d = 0; d <= 60; d += 20) { const y = ys(top - d); g.beginPath(); g.moveTo(left, y); g.lineTo(left + plot, y); g.stroke(); g.fillText((-d) + ' dB', left - 4, y + 4); }
        const line = (v, colour) => { g.strokeStyle = colour; g.lineWidth = 1.5; g.beginPath(); v.forEach((d, i) => { const x = left + i * hop / count * plot; if (i) g.lineTo(x, ys(d)); else g.moveTo(x, ys(d)); }); g.stroke(); };
        line(a, '#f6a35c'); line(b, '#7fb8ff');
        g.fillStyle = '#ddd'; g.textAlign = 'left'; g.fillText('Level, 2 ms RMS (dB re the loudest of the two; orange original, blue model)', left + 4, y0 - 4);
        g.textAlign = 'center';
        const step = ms <= 60 ? 10 : ms <= 150 ? 25 : ms <= 300 ? 50 : 100;
        for (let t = 0; t <= ms; t += step) g.fillText((startMs + t) + ' ms', left + t / ms * plot, H - 8);
    }, [original, model, rate, ms, startMs]);
    return <figure className="spectrogram"><figcaption>Waveform at the start of the note</figcaption><canvas ref={canvas} style={{ width: '100%', height: 'auto', display: 'block' }} /></figure>;
}
