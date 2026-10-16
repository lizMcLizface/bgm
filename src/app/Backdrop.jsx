// Optional soft cloudy background (⚙ menu, off by default): a WebGL2 fragment
// shader draws slowly drifting layers of fractal noise behind the page, and
// every note the generator books sends a soft pulse of light through it.
//
//  - A pulse sits at its pitch (left to right, the voice nudging it up or
//    down, plus a little randomness), takes its colour from the note's place
//    in the key (fifths are neighbours) and its brightness from the velocity.
//    Consecutive lead notes are joined by a fading line (melody trails).
//  - The key (or a chosen palette) sets the base colour; the tempo and how
//    busy the preset is set the drift speed.
//  - The chord's style tints the picture, slowly (chords change too fast to
//    react to one by one): major warm and bright, minor cool and soft,
//    suspended hazy, diminished / augmented / sevenths more contrasty.
//  - The section (intro, build, full, breakdown) opens or closes the picture.
//  - An analyser on the master bus gives the loudness, the optional spectrum
//    (a ring or radial bars), and pulses for the ambience when
//    no notes are being played.
//
// Everything is eased, so changes glide.

import React, { useEffect, useRef } from 'react';
import { intensity } from './intensity';
import { masterBus } from '../audio/bus';

const MAX_PULSES = 32;
const MAX_SEGMENTS = 16;
const BANDS = 64;

// What the ⚙ menu can change (kept in the browser, not in share links).
export const BACKDROP_DEFAULTS = {
    palette: 'key',    // key: follow the music's key; or one of PALETTES
    circle: false,     // the circle visualizer (only drawn while the interface is hidden)
    spectrum: 'ring',  // its style: ring, bars
    trails: true,      // lines joining consecutive lead notes
    layers: 2,         // depth layers of cloud, 1..3
    hueShift: 0,       // degrees added to the base colour
    spread: 40,        // degrees between the cloud colours
    size: 1,           // cloud size: bigger = broader, fewer clouds
    detail: 5,         // noise octaves
    definition: 0,     // 0 = soft and misty .. 1 = crisp edges
    speed: 1,          // drift speed multiplier
    glow: 1,           // light pulse brightness multiplier
};
export const BACKDROP_LIMITS = {
    layers: [1, 3, 1], spread: [10, 90, 1], size: [0.4, 3, 0.05], detail: [2, 6, 1], definition: [0, 1, 0.05], speed: [0.2, 3, 0.05], glow: [0, 2, 0.05],
};
// A fixed hue (the key only nudges it), saturation, and a multiple of the colour spread.
export const PALETTES = {
    key: { label: 'Follow the key' },
    aurora: { label: 'Aurora', hue: 160, sat: 0.55, spread: 1.3 },
    ember: { label: 'Ember', hue: 18, sat: 0.62, spread: 0.7 },
    deepsea: { label: 'Deep sea', hue: 210, sat: 0.5, spread: 0.8 },
    dusk: { label: 'Dusk', hue: 300, sat: 0.45, spread: 1.4 },
    mono: { label: 'Monochrome', hue: 220, sat: 0.08, spread: 0.4 },
};
export const SPECTRA = { ring: 'Ring', bars: 'Radial bars' };
// A new look: another base colour and a different spread between the colours.
export const shuffleColours = (options) => ({ ...options, hueShift: Math.round(Math.random() * 360), spread: Math.round(20 + Math.random() * 60) });

const VERTEX = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uEnergy;
uniform vec3 uBg, uC1, uC2, uC3;
uniform float uStrength, uScale, uDef, uLayers, uCloud, uRScale;
uniform vec2 uCentre;              // the circle's centre (0..1 of the screen) and a size factor
uniform int uOct;
uniform vec4 uP[${MAX_PULSES}];    // x, y (0..1 of the screen), age (0..1), brightness
uniform vec4 uPC[${MAX_PULSES}];   // colour rgb, radius
uniform vec4 uS[${MAX_SEGMENTS}];  // trail from (x, y) to (z, w)
uniform vec4 uSC[${MAX_SEGMENTS}]; // colour rgb, brightness
uniform float uSpec[${BANDS}];
uniform int uSpecMode;             // 0 off, 1 ring, 2 radial bars
uniform vec3 uSA, uSB;             // spectrum colours, left and right
out vec4 outColor;

vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
// 2D gradient (Perlin-style) noise.
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
               mix(dot(hash(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 6; i++) { if (i >= uOct) break; v += a * noise(p); p = r * p * 2.0 + 17.0; a *= 0.5; }
    return v;
}
// Clouds: a steady slide in one direction, with a slow cross-fade between two
// samples so the shapes change without churning.
float clouds(vec2 uv, float t) {
    vec2 dir = vec2(0.9, 0.25);
    float x = fbm(uv + dir * t);
    float y = fbm(uv * 1.15 + vec2(11.3, 4.1) + dir * t * 0.7);
    return mix(x, y, 0.5 + 0.5 * sin(t * 0.35));
}
float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    return length(pa - ba * h);
}
void main() {
    float aspect = uRes.x / uRes.y;
    vec2 screen = gl_FragCoord.xy / uRes;
    vec2 uv = vec2(screen.x * aspect, screen.y) * uScale;
    float t = uTime;
    vec3 outRgb = uBg;
    float field = 0.0;
    if (uCloud > 0.5) {
        float lo = -0.5 + 0.4 * uDef, hi = 0.6 - 0.4 * uDef;
        // Depth: the main layer, a broad slow one behind it, a fine quick one in front.
        // The layers only decide how much cloud there is; the colour is one smooth gradient.
        float wB = clamp(uLayers - 1.0, 0.0, 1.0), wN = clamp(uLayers - 2.0, 0.0, 1.0);
        float a = smoothstep(lo, hi, clouds(uv, t));
        float b = 0.0, nm = 0.0;
        if (wB > 0.0) b = smoothstep(lo + 0.15, hi - 0.1, clouds(uv * 0.55 + 3.0, t * 0.5));
        if (wN > 0.0) nm = smoothstep(lo + 0.25, hi + 0.05, fbm(uv * 1.8 + vec2(3.7, 9.2) + vec2(0.9, 0.25) * t * 1.7));
        field = (a + 0.6 * b * wB + 0.35 * nm * wN) / (1.0 + 0.6 * wB + 0.35 * wN);
        // Gradient position: across the screen, bent a little by a very slow, very broad noise.
        float g = clamp(0.5 + 0.8 * (screen.x - 0.5) + 0.4 * (screen.y - 0.5) + 0.9 * noise(uv * 0.3 + vec2(t * 0.15, -t * 0.08)), 0.0, 1.0);
        vec3 col = g < 0.5 ? mix(uC1, uC2, g * 2.0) : mix(uC2, uC3, g * 2.0 - 1.0);
        float amount = uStrength * (0.8 + 0.4 * uEnergy);
        outRgb = mix(uBg, col, clamp(amount * (0.35 + 0.9 * field), 0.0, 1.0));
    }

    // Light travels through the cloud: brighter where it is dense.
    float medium = 0.35 + 1.1 * field;
    vec3 light = vec3(0.0);
    for (int i = 0; i < ${MAX_PULSES}; i++) {
        vec4 p = uP[i];
        if (p.w <= 0.0) continue;
        vec2 d = (screen - p.xy) * vec2(aspect, 1.0);
        float radius = uPC[i].w * (0.55 + 0.9 * p.z);            // blooms outward as it fades
        float fall = exp(-dot(d, d) / (radius * radius));
        float life = (1.0 - p.z) * smoothstep(0.0, 0.08, p.z);     // quick rise, slow fade
        light += uPC[i].rgb * (p.w * life * fall * medium);
    }
    for (int i = 0; i < ${MAX_SEGMENTS}; i++) {
        vec4 c = uSC[i];
        if (c.w <= 0.0) continue;
        float d = segmentDistance(screen * vec2(aspect, 1.0), uS[i].xy * vec2(aspect, 1.0), uS[i].zw * vec2(aspect, 1.0));
        light += c.rgb * (c.w * (exp(-d * d / 0.00006) * 0.7 + exp(-d * d / 0.0015) * 0.3) * medium);
    }
    // The spectrum as a circle (centred in the space below the timeline, if there is one), mirrored left and right so it closes without a seam and turning slowly.
    if (uSpecMode > 0) {
        vec2 q = (screen - uCentre) * vec2(aspect, 1.0) / uRScale;
        float r = length(q);
        float u = fract(atan(q.y, q.x) / 6.2831853 + 0.5 + t * 0.12);
        float m = abs(u * 2.0 - 1.0);
        float fx = m * float(${BANDS - 1});
        int i0 = int(floor(fx));
        int i1 = min(i0 + 1, ${BANDS - 1});
        float f = fract(fx);
        float R = 0.2;
        vec3 sc = mix(mix(uSA, uSB, m), vec3(1.0), 0.75); // mostly white, with a hint of the palette
        float centre = 0.0;
        for (int k = 0; k < 8; k++) centre += uSpec[k];
        centre /= 8.0;
        if (uSpecMode == 1) {
            float v = mix(uSpec[i0], uSpec[i1], f * f * (3.0 - 2.0 * f));
            float rr = R + v * 0.13;
            float d = abs(r - rr);
            float line = exp(-d * d / 0.000006) + 0.1 * exp(-d * d / 0.0004);
            float guide = exp(-(r - R - 0.14) * (r - R - 0.14) / 0.000004) * 0.3;
            light += sc * (line * 1.1 + guide);
        } else {
            float v = uSpec[i0];
            float len = 0.01 + v * 0.14;
            float mask = smoothstep(0.0, 0.25, f) * smoothstep(1.0, 0.75, f);
            float body = smoothstep(R - 0.004, R, r) * smoothstep(R + len + 0.004, R + len, r);
            light += sc * (body * mask * 0.95 + exp(-(r - R - len) * (r - R - len) / 0.00015) * mask * v * 0.15);
        }
        // A soft orb at the centre that swells with the bass.
        light += mix(mix(uSA, uSB, 0.5), vec3(1.0), 0.75) * (exp(-r * r / (0.0006 + 0.0012 * centre)) * (0.2 + 0.7 * centre));
    }
    outRgb += light * 0.9;
    // Dither against banding in slow dark gradients.
    float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    outColor = vec4(outRgb + d / 255.0, 1.0);
}`;

const SCALE = 0.5; // render at 50% and let the browser upscale: the clouds are soft anyway
const FRAME_MS = 1000 / 30;

const hsl = (hue, s, l) => {
    const h = ((hue % 360) + 360) % 360;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)];
};

const parseColour = (text, fallback) => {
    const m = /^#([0-9a-f]{6})$/i.exec((text || '').trim());
    if (!m) return fallback;
    const n = parseInt(m[1], 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
// How each voice looks: its vertical band (0 bottom..1 top), how widely it
// scatters, size, brightness, and how long the glow lasts (ms, and a
// multiple of the note's own length).
const ROLE_LOOK = {
    bass: { y: 0.2, spread: 0.2, radius: 0.34, gain: 0.7, min: 2500, max: 6000, hold: 1.2 },
    pad: { y: 0.5, spread: 0.5, radius: 0.3, gain: 0.55, min: 3000, max: 8000, hold: 1.0 },
    lead: { y: 0.72, spread: 0.45, radius: 0.13, gain: 1.0, min: 1500, max: 4500, hold: 1.4 },
    counter: { y: 0.62, spread: 0.45, radius: 0.16, gain: 0.85, min: 1500, max: 4500, hold: 1.4 },
    perc: { y: 0.35, spread: 0.7, radius: 0.08, gain: 0.8, min: 700, max: 1400, hold: 2 },
};
// Each section's effect on the picture: energy, cloud size (zoom), brightness, colour spread.
const SECTION_LOOK = {
    intro: { energy: 0.6, zoom: 1.15, bright: 0.8, spread: 0.8 },
    build: { energy: 0.85, zoom: 1.0, bright: 0.95, spread: 1.0 },
    full: { energy: 1.1, zoom: 0.92, bright: 1.1, spread: 1.15 },
    breakdown: { energy: 0.55, zoom: 1.2, bright: 0.85, spread: 0.85 },
};
const NEUTRAL_SECTION = { energy: 1, zoom: 1, bright: 1, spread: 1 };
const MINOR_LIKE = /minor|aeolian|dorian|phrygian|locrian/i;
const ease = (from, to, k) => from + (to - from) * k;
const easeHue = (from, to, k) => from + ((((to - from) % 360) + 540) % 360 - 180) * k;

// A chord's look from its symbol: warmth (major +, minor -), tension
// (diminished, augmented, sevenths) and haze (suspended, added notes).
export function chordStyle(name) {
    const body = String(name || '').replace(/^[A-G][#b♯♭]?/, '');
    const minor = /^m(?!aj)/.test(body);
    const dim = /°|dim/.test(body);
    const aug = /\+|aug/.test(body);
    const sus = /sus/.test(body);
    const extended = /7|9|11|13|add|6/.test(body);
    return {
        warm: dim ? -0.6 : minor ? -1 : sus ? 0 : 1,
        tension: clamp01((dim || aug ? 1 : 0) + (extended ? 0.35 : 0)),
        haze: clamp01((sus ? 1 : 0) + (extended ? 0.3 : 0)),
    };
}

function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
}

// Checked once: every probe would otherwise leave another WebGL context behind.
let supported = null;
export const backdropSupported = () => {
    if (supported === null) {
        try {
            const probe = document.createElement('canvas').getContext('webgl2');
            supported = !!probe;
            if (probe) probe.getExtension('WEBGL_lose_context')?.loseContext();
        } catch (e) {
            supported = false;
        }
    }
    return supported;
};

const Backdrop = ({ generator, options = BACKDROP_DEFAULTS, clouds = true }) => {
    const canvasRef = useRef(null);
    const optionsRef = useRef(options);
    optionsRef.current = { ...BACKDROP_DEFAULTS, ...options };
    const cloudsRef = useRef(clouds);
    cloudsRef.current = clouds;

    useEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
        if (!gl) return undefined;
        const program = gl.createProgram();
        try {
            gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
            gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        } catch (e) {
            console.warn('Backdrop shader failed', e);
            return undefined;
        }
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(program, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const u = (name) => gl.getUniformLocation(program, name);
        const uni = {
            res: u('uRes'), time: u('uTime'), energy: u('uEnergy'), bg: u('uBg'), c1: u('uC1'), c2: u('uC2'), c3: u('uC3'),
            strength: u('uStrength'), scale: u('uScale'), def: u('uDef'), oct: u('uOct'), layers: u('uLayers'), cloud: u('uCloud'), centre: u('uCentre'), rscale: u('uRScale'),
            p: u('uP'), pc: u('uPC'), seg: u('uS'), segc: u('uSC'), spec: u('uSpec'), specMode: u('uSpecMode'), sa: u('uSA'), sb: u('uSB'),
        };

        // The master bus, tapped: loudness for the picture and the bands for the spectrum.
        const analyser = generator.AC.createAnalyser();
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0.7;
        analyser.minDecibels = -85;
        analyser.maxDecibels = -25;
        masterBus.connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);
        const hzPerBin = generator.AC.sampleRate / analyser.fftSize;
        const bandRange = Array.from({ length: BANDS }, (_, i) => {
            const from = Math.floor(40 * Math.pow(14000 / 40, i / BANDS) / hzPerBin);
            const to = Math.ceil(40 * Math.pow(14000 / 40, (i + 1) / BANDS) / hzPerBin);
            return [from, Math.max(from + 1, to)];
        });
        const spec = new Float32Array(BANDS);

        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const resize = () => {
            canvas.width = Math.max(2, Math.round(window.innerWidth * SCALE));
            canvas.height = Math.max(2, Math.round(window.innerHeight * SCALE));
            gl.viewport(0, 0, canvas.width, canvas.height);
        };
        window.addEventListener('resize', resize);
        resize();

        // Eased state the shader reads, and the targets it moves toward.
        const s = {
            hue: 210, sat: 0.5, speed: 0.04, energy: 0.2, loud: 0, time: Math.random() * 100,
            warm: 0, tension: 0, haze: 0, section: { ...NEUTRAL_SECTION },
        };
        let target = { hue: 210, sat: 0.5, energy: 0.2, speed: 0.04, spreadMul: 1, style: { warm: 0, tension: 0, haze: 0 }, section: NEUTRAL_SECTION };
        let bg = [0.08, 0.09, 0.1];
        let dark = true;
        let tonic = 0;
        let frame = 0;
        let last = 0;
        let lastRead = -1e9;
        let nextAmbient = 0;
        const place = { y: 0.5, size: 1 }; // the circle: centre height (0 bottom .. 1 top) and size, eased
        let cloudsShown = null;
        let lastLead = null; // where the last lead note's pulse sat: the melody trail starts there
        const pulses = []; // { x, y, born, life, bright, rgb, radius }, born in requestAnimationFrame ms
        const segments = []; // { x0, y0, x1, y1, born, life, bright, rgb }
        let cursor = generator.AC.currentTime; // notes booked up to this audio time are already shown
        const pArray = new Float32Array(MAX_PULSES * 4);
        const pcArray = new Float32Array(MAX_PULSES * 4);
        const sArray = new Float32Array(MAX_SEGMENTS * 4);
        const scArray = new Float32Array(MAX_SEGMENTS * 4);

        const readMusic = (now) => {
            if (now - lastRead < 400) return;
            lastRead = now;
            const o = optionsRef.current;
            const style = getComputedStyle(document.documentElement);
            bg = parseColour(style.getPropertyValue('--gen-bg'), bg);
            dark = bg[0] + bg[1] + bg[2] < 1.5;
            try {
                const playing = generator.anyRunning;
                const heard = generator.nowPlaying();
                tonic = heard.tonic;
                const busy = intensity({ ...generator.settings, bpm: heard.bpm });
                const minor = MINOR_LIKE.test(String(heard.mode));
                const palette = PALETTES[o.palette];
                // The chord and section under the playhead.
                const bar = Math.floor(generator.position() / generator.beatsPerBar);
                const planned = generator.getPlan().find((b) => b.bar === bar);
                const sectionType = planned && planned.state && planned.state.phrase && planned.state.phrase.section && planned.state.phrase.section.type;
                target = {
                    hue: palette && palette.hue !== undefined
                        ? palette.hue + (heard.tonic - 6) * 3 // the key only nudges a fixed palette
                        : ((heard.tonic * 30 + (minor ? 215 : 20)) % 360 + 360) % 360, // the circle of semitones; minor leans cool
                    sat: palette && palette.sat !== undefined ? palette.sat : (minor ? 0.42 : 0.55),
                    spreadMul: palette && palette.spread ? palette.spread : 1,
                    energy: playing ? Math.max(busy, 0.2) : 0.05,
                    // Cloud speed: tempo and busyness, slow even at the top end.
                    speed: (0.025 + 0.06 * ((heard.bpm - 50) / 110) + 0.07 * busy) * (playing ? 1 : 0.4),
                    style: planned ? chordStyle(planned.chord.name) : { warm: 0, tension: 0, haze: 0 },
                    section: SECTION_LOOK[sectionType] || NEUTRAL_SECTION,
                };
            } catch (e) { /* no plan yet: keep the last targets */ }
        };

        // The analyser's bands, smoothed (quick to rise, slow to fall), and the overall loudness.
        const readSpectrum = () => {
            analyser.getByteFrequencyData(bins);
            let total = 0;
            for (let i = 0; i < BANDS; i++) {
                const [from, to] = bandRange[i];
                let sum = 0;
                for (let k = from; k < to; k++) sum += bins[k];
                // Music falls off towards the treble: tilt it up so the right side moves too.
                const level = clamp01((sum / (to - from) / 255 - 0.25) * 1.5 * (0.75 + 0.7 * (i / (BANDS - 1))));
                spec[i] += (level - spec[i]) * (level > spec[i] ? 0.6 : 0.12);
                total += spec[i];
            }
            return total / BANDS;
        };

        const addPulse = (now, pulse) => {
            if (pulses.length >= MAX_PULSES) pulses.shift();
            pulses.push({ born: now, ...pulse });
        };

        // Turns the notes booked since the last frame (audio-clock times) into pulses.
        const spawnPulses = (now) => {
            const o = optionsRef.current;
            const log = generator.noteLog || [];
            const clock = generator.AC.currentTime;
            let made = 0;
            for (const note of log) {
                if (note.time <= cursor || note.time > clock) continue;
                if (made >= (reduced ? 2 : 6)) break;
                made += 1;
                const look = ROLE_LOOK[note.role] || ROLE_LOOK.pad;
                const pc = (((note.midi % 12) - tonic) + 12) % 12;
                // Position: pitch across the width (C2..C7), the voice's band up or down, and some chance.
                const pitch = clamp01((note.midi - 36) / 60);
                const x = clamp01(0.06 + 0.88 * pitch + (Math.random() - 0.5) * 0.14);
                const y = clamp01(look.y + (Math.random() - 0.5) * look.spread);
                // Colour: the base hue plus the note's step round the circle of fifths (fifths = neighbours).
                const fifths = (pc * 7) % 12;
                const rgb = hsl(s.hue + o.hueShift + (fifths - 3) * 14, 0.75, (dark ? 0.5 : 0.62) + 0.12 * pitch);
                const velocity = Math.max(0.15, Math.min(1, note.velocity ?? 0.6));
                const bright = (dark ? 0.55 : 0.4) * look.gain * o.glow * (0.25 + 0.75 * velocity);
                addPulse(now, {
                    x, y, rgb, bright,
                    life: Math.max(look.min, Math.min(look.max, note.length * 1000 * look.hold)),
                    radius: look.radius * (0.8 + 0.5 * velocity),
                });
                if (note.role === 'lead') {
                    // A melody trail: a line from the last lead note to this one.
                    if (o.trails && lastLead && now - lastLead.born < 2500) {
                        if (segments.length >= MAX_SEGMENTS) segments.shift();
                        segments.push({ x0: lastLead.x, y0: lastLead.y, x1: x, y1: y, born: now, life: 2200, rgb, bright: 0.45 * o.glow * (0.4 + 0.6 * velocity) });
                    }
                    lastLead = { x, y, born: now };
                }
            }
            cursor = Math.max(cursor, clock);
        };

        // With no notes (ambience alone), the sound's own spectrum sets where the light goes.
        const ambientPulses = (now, loud) => {
            if (generator.isRunning || !generator.ambienceRunning || now < nextAmbient || loud < 0.02) return;
            nextAmbient = now + 1200 + Math.random() * 1800;
            const o = optionsRef.current;
            let total = 0;
            for (let i = 0; i < BANDS; i++) total += spec[i];
            if (total <= 0) return;
            let pick = Math.random() * total;
            let band = 0;
            for (; band < BANDS - 1; band++) {
                pick -= spec[band];
                if (pick <= 0) break;
            }
            const x = clamp01((band + 0.5) / BANDS + (Math.random() - 0.5) * 0.08);
            addPulse(now, {
                x, y: 0.15 + Math.random() * 0.7, life: 3500 + Math.random() * 3000, radius: 0.22 + Math.random() * 0.1,
                rgb: hsl(s.hue + o.hueShift + (x - 0.5) * 120, 0.7, dark ? 0.5 : 0.62),
                bright: (dark ? 0.5 : 0.36) * o.glow * (0.3 + spec[band]),
            });
        };

        // The circle goes in the space below the timeline when that is showing, else in the middle.
        const circlePlace = () => {
            const timeline = document.querySelector('.gen-timeline');
            const rect = timeline && timeline.getBoundingClientRect();
            if (!rect || !rect.width || !rect.height || rect.bottom <= 0) return { y: 0.5, size: 1 };
            const space = Math.max(0.3, (window.innerHeight - rect.bottom) / window.innerHeight);
            return { y: space / 2, size: Math.min(1, space / 0.8) };
        };

        const draw = (now) => {
            const o = optionsRef.current;
            const withClouds = cloudsRef.current;
            frame = requestAnimationFrame(draw);
            if (document.hidden || now - last < FRAME_MS) return;
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            if (withClouds !== cloudsShown) {
                cloudsShown = withClouds;
                if (withClouds) document.documentElement.dataset.backdrop = 'on';
                else delete document.documentElement.dataset.backdrop;
            }
            const where = circlePlace();
            const moveK = 1 - Math.exp(-dt * 6);
            place.y = ease(place.y, where.y, moveK);
            place.size = ease(place.size, where.size, moveK);
            readMusic(now);
            const level = readSpectrum();
            const k = 1 - Math.exp(-dt * 0.8); // ~1.2 s time constant
            const slow = 1 - Math.exp(-dt / 3); // chords and sections: an average over a few seconds
            s.hue = easeHue(s.hue, target.hue, k);
            s.sat = ease(s.sat, target.sat, k);
            s.energy = ease(s.energy, target.energy, k);
            s.loud = ease(s.loud, level, 1 - Math.exp(-dt * 2));
            s.speed = ease(s.speed, target.speed, 1 - Math.exp(-dt * 0.5));
            s.warm = ease(s.warm, target.style.warm, slow);
            s.tension = ease(s.tension, target.style.tension, slow);
            s.haze = ease(s.haze, target.style.haze, slow);
            Object.keys(s.section).forEach((key) => { s.section[key] = ease(s.section[key], target.section[key], slow); });
            s.time += dt * s.speed * o.speed * (reduced ? 0.3 : 1);

            for (let i = pulses.length - 1; i >= 0; i--) if (now - pulses[i].born > pulses[i].life) pulses.splice(i, 1);
            for (let i = segments.length - 1; i >= 0; i--) if (now - segments[i].born > segments[i].life) segments.splice(i, 1);
            if (withClouds) {
                spawnPulses(now);
                ambientPulses(now, s.loud);
            } else {
                pulses.length = 0;
                segments.length = 0;
                cursor = generator.AC.currentTime;
            }
            pArray.fill(0);
            pcArray.fill(0);
            sArray.fill(0);
            scArray.fill(0);
            pulses.forEach((p, i) => {
                pArray.set([p.x, p.y, (now - p.born) / p.life, p.bright], i * 4);
                pcArray.set([...p.rgb, p.radius], i * 4);
            });
            segments.forEach((g, i) => {
                const age = (now - g.born) / g.life;
                sArray.set([g.x0, g.y0, g.x1, g.y1], i * 4);
                scArray.set([...g.rgb, g.bright * (1 - age) * Math.min(1, age * 12)], i * 4);
            });

            // The picture: base look, then the chord's style and the section on top.
            const energy = clamp01(s.energy * s.section.energy + 0.5 * s.loud);
            const hue = s.hue + o.hueShift + 15 * s.warm;
            const sat = clamp01(s.sat + 0.06 * s.warm);
            const spread = o.spread * target.spreadMul * (1 + 0.4 * s.tension) * s.section.spread * (0.85 + 0.5 * energy);
            const lift = 0.03 * s.warm;
            const l = (dark ? [0.22, 0.34, 0.5] : [0.8, 0.72, 0.64]).map((x) => x + lift);
            gl.uniform2f(uni.res, canvas.width, canvas.height);
            gl.uniform1f(uni.time, s.time);
            gl.uniform1f(uni.energy, energy);
            gl.uniform4fv(uni.p, pArray);
            gl.uniform4fv(uni.pc, pcArray);
            gl.uniform4fv(uni.seg, sArray);
            gl.uniform4fv(uni.segc, scArray);
            gl.uniform3fv(uni.bg, bg);
            gl.uniform3fv(uni.c1, hsl(hue, sat, l[0]));
            gl.uniform3fv(uni.c2, hsl(hue + spread, sat, l[1]));
            gl.uniform3fv(uni.c3, hsl(hue - spread * 1.3, sat * 0.9, l[2]));
            gl.uniform1f(uni.strength, (dark ? 0.85 : 0.7) * s.section.bright);
            gl.uniform1f(uni.scale, 1.3 / (o.size * s.section.zoom * (1 + 0.15 * s.haze)));
            gl.uniform1f(uni.def, clamp01(o.definition + 0.25 * s.tension - 0.2 * s.haze));
            gl.uniform1i(uni.oct, Math.round(o.detail));
            gl.uniform1f(uni.layers, o.layers);
            gl.uniform1f(uni.cloud, withClouds ? 1 : 0);
            gl.uniform2f(uni.centre, 0.5, place.y);
            gl.uniform1f(uni.rscale, place.size);
            gl.uniform1fv(uni.spec, spec);
            gl.uniform1i(uni.specMode, !o.circle ? 0 : o.spectrum === 'bars' ? 2 : 1);
            gl.uniform3fv(uni.sa, hsl(hue + spread * 0.5, 0.7, dark ? 0.52 : 0.6));
            gl.uniform3fv(uni.sb, hsl(hue - spread * 0.8, 0.7, dark ? 0.55 : 0.6));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        frame = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
            delete document.documentElement.dataset.backdrop;
            try { masterBus.disconnect(analyser); } catch (e) { /* already gone */ }
            // No loseContext() here: React's dev double-mount reuses this canvas and its context.
        };
    }, [generator]);

    return <canvas ref={canvasRef} className="gen-backdrop" aria-hidden="true" />;
};

export default Backdrop;
