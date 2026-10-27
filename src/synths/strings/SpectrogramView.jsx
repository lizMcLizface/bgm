import React, { useEffect, useRef } from 'react';
import { heat, delta } from '../../app/engine/stringModel/spectrogram';

/** A spectrogram on a canvas: time left to right, frequency upward (0 at the bottom), with ticks. kind 'heat' colours level, 'delta' a difference. */
export default function SpectrogramView({ spec, kind = 'heat', top = 0, range = 80, title }) {
    const canvas = useRef(null);
    useEffect(() => {
        const el = canvas.current;
        if (!el || !spec) return;
        const W = 960, H = 240, left = 44, bottom = 18, w = W - left - 6, h = H - bottom - 6;
        el.width = W; el.height = H;
        const g = el.getContext('2d'), image = new ImageData(spec.frames, spec.bins), colour = kind === 'delta' ? (v) => delta(v, range) : (v) => heat(v, top, range);
        for (let f = 0; f < spec.frames; f++) for (let k = 0; k < spec.bins; k++) {
            const [r, gr, b] = colour(spec.data[f * spec.bins + k]), o = ((spec.bins - 1 - k) * spec.frames + f) * 4;
            image.data[o] = r; image.data[o + 1] = gr; image.data[o + 2] = b; image.data[o + 3] = 255;
        }
        const small = document.createElement('canvas'); small.width = spec.frames; small.height = spec.bins;
        small.getContext('2d').putImageData(image, 0, 0);
        g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
        g.imageSmoothingEnabled = false; g.drawImage(small, left, 6, w, h);
        g.fillStyle = '#ddd'; g.strokeStyle = 'rgba(255,255,255,.25)'; g.font = '11px system-ui, sans-serif';
        const maxHz = spec.bins * spec.hz, seconds = spec.frames * spec.hop / spec.rate, stepHz = maxHz > 6000 ? 2000 : maxHz > 2500 ? 1000 : 500;
        g.textAlign = 'right';
        for (let f = 0; f <= maxHz; f += stepHz) { const y = 6 + h - f / maxHz * h; g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), left - 4, y + 4); g.beginPath(); g.moveTo(left, y); g.lineTo(left + w, y); g.stroke(); }
        g.textAlign = 'center';
        for (let t = 0; t <= seconds; t += 1) { const x = left + t / seconds * w; g.fillText(t + ' s', x, H - 4); }
    }, [spec, kind, top, range]);
    return <figure className="spectrogram"><figcaption>{title}</figcaption><canvas ref={canvas} style={{ width: '100%', height: 'auto', display: 'block' }} /></figure>;
}
