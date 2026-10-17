// Music-driven GPU fluid background. The optional spectrum shares the display pass.
import React, { useEffect, useRef, useState } from 'react';
import { intensity } from './intensity';
import { masterBus } from '../audio/bus';
import { createFluid } from './visuals/fluid';
export { SIM_RESOLUTIONS, DYE_RESOLUTIONS } from './visuals/fluid';
import { createMusicForces } from './visuals/musicForces';
import { createAmbientSources } from './visuals/ambientSources';
import { musicMood } from './visuals/musicColour';
import { FLUID_LOOKS } from './visuals/fluidLooks';
export { FLUID_LIMITS as BACKDROP_LIMITS } from './visuals/fluidLooks';

const BANDS = 64;
export const BACKDROP_DEFAULTS = {
    palette: 'key', circle: false, spectrum: 'ring', hueShift: 0, spread: 40, fullness: 0.45, jetDirection: 'exhaust', motionBalance: 0.5, balanceDrift: 0.15,
    ...FLUID_LOOKS.balanced.options, simResolution: 512, dyeResolution: 1024,
};
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
in vec2 p; void main(){gl_Position=vec4(p,0,1);}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uDye;
uniform vec2 uRes, uCentre;
uniform float uTime, uCloud, uRScale, uDark;
uniform float uSpec[64];
uniform int uSpecMode;
uniform vec3 uBg, uSA, uSB;
out vec4 outColor;
vec3 dyeAt(vec2 p){
 vec2 size=vec2(textureSize(uDye,0)),x=p*size-0.5,f=fract(x),a=(floor(x)+0.5)/size;
 return mix(mix(texture(uDye,a).rgb,texture(uDye,a+vec2(1,0)/size).rgb,f.x),
 mix(texture(uDye,a+vec2(0,1)/size).rgb,texture(uDye,a+1.0/size).rgb,f.x),f.y);
}
void main(){
    float aspect=uRes.x/uRes.y, t=uTime;
    vec2 screen=gl_FragCoord.xy/uRes;
    vec3 outRgb=uBg, light=vec3(0);
    if(uCloud>0.5){
        vec3 dye=dyeAt(screen);
        vec3 mapped=1.0-exp(-dye*1.8);
        float amount=max(mapped.r,max(mapped.g,mapped.b));
        outRgb=uDark>0.5 ? uBg+mapped*0.85 : mix(uBg,0.1+mapped*0.65,clamp(amount,0.0,0.8));
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

    outRgb+=light*0.9;
    float d=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5;
    outColor=vec4(outRgb+d/255.0,1);
}`;
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

const MINOR_LIKE = /minor|aeolian|dorian|phrygian|locrian/i;
const easeHue = (from, to, k) => from + ((((to - from) % 360) + 540) % 360 - 180) * k;

// The circle can still run on devices without floating-point fluid targets.
let supported = null;
export const backdropSupported = () => {
    if (supported === null) {
        try {
            const gl = document.createElement('canvas').getContext('webgl2');
            supported = !!gl;
            gl?.getExtension('WEBGL_lose_context')?.loseContext();
        } catch { supported = false; }
    }
    return supported;
};

const Backdrop = ({ generator, options = BACKDROP_DEFAULTS, clouds = true, resetKey = 0 }) => {
    const canvasRef = useRef(null), optionsRef = useRef(options), cloudsRef = useRef(clouds);
    const resetRef = useRef(resetKey); resetRef.current = resetKey;
    const [epoch, setEpoch] = useState(0), [error, setError] = useState('');
    optionsRef.current = { ...BACKDROP_DEFAULTS, ...options };
    cloudsRef.current = clouds;
    useEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
        if (!gl) return undefined;
        let frame = 0, lost = false, fluid = null, analyser = null, music = null, ambient = null;
        const emptyTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, emptyTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const shaders = [], program = gl.createProgram(), buffer = gl.createBuffer(), vao = gl.createVertexArray();
        const lose = (event) => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); setError('Fluid background paused: graphics context lost.'); };
        const restore = () => setEpoch((n) => n + 1);
        canvas.addEventListener('webglcontextlost', lose);
        canvas.addEventListener('webglcontextrestored', restore);
        const cleanup = () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
            canvas.removeEventListener('webglcontextlost', lose);
            canvas.removeEventListener('webglcontextrestored', restore);
            delete document.documentElement.dataset.backdrop;
            if (analyser) { try { masterBus.disconnect(analyser); } catch { /* already disconnected */ } }
            music?.dispose(); ambient?.dispose();
            // Context loss already destroyed its resources. Deleting those old handles
            // after restoration would generate INVALID_OPERATION in the new context.
            if (!lost) {
                fluid?.dispose(); gl.deleteTexture(emptyTexture);
                gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteVertexArray(vao);
                shaders.forEach((shader) => gl.deleteShader(shader));
            }
            if (import.meta.env.DEV && window.__fluid?.canvas === canvas) delete window.__fluid;
        };
        const resize = () => {
            // Display resolution and simulation resolution are independent.
            const scale = Math.min(window.devicePixelRatio || 1, 1.5, 2560 / Math.max(window.innerWidth, window.innerHeight));
            canvas.width = Math.max(2, Math.round(window.innerWidth * scale));
            canvas.height = Math.max(2, Math.round(window.innerHeight * scale));
        };
        try {
            for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
                const shader = gl.createShader(type); shaders.push(shader);
                gl.shaderSource(shader, source); gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
                gl.attachShader(program, shader);
            }
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
            gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(program, 'p');
            gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            resize(); window.addEventListener('resize', resize);
            try { fluid = createFluid(gl, canvas.width / canvas.height, optionsRef.current); setError(''); }
            catch (e) { setError('Fluid background unavailable: this graphics device needs floating-point WebGL2 targets.'); console.warn('Fluid:', e); }
            music = createMusicForces(generator);
            ambient = createAmbientSources(generator);
            analyser = generator.AC.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.75;
            analyser.minDecibels = -85; analyser.maxDecibels = -25; masterBus.connect(analyser);
            const bins = new Uint8Array(analyser.frequencyBinCount), spec = new Float32Array(BANDS);
            const hz = generator.AC.sampleRate / analyser.fftSize;
            const bands = Array.from({ length: BANDS }, (_, i) => [Math.floor(40 * (14000 / 40) ** (i / BANDS) / hz), Math.ceil(40 * (14000 / 40) ** ((i + 1) / BANDS) / hz)]);
            const uniforms = Object.fromEntries(['uDye','uRes','uCentre','uTime','uCloud','uRScale','uDark','uSpec','uSpecMode','uBg','uSA','uSB'].map((key) => [key, gl.getUniformLocation(program, key)]));
            let last = 0, accumulator = 0, hue = 210, lastRead = -Infinity, targetHue = 210, busy = 0.2;
            let bg = [0.08, 0.09, 0.1], dark = true, draws = 0, lastEmitters = 0;
            let mood = musicMood({}, null), targetMood = mood;
            const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            const stats = { frames: 0, emitters: 0, steps: 0, clears: 0 };
            let lastReset = resetRef.current;
            if (import.meta.env.DEV) window.__fluid = { gl, fluid, music, ambient, canvas, stats };
            const draw = (now) => {
                if (lost) return;
                frame = requestAnimationFrame(draw);
                if (document.hidden) { last = now; accumulator = 0; return; }
                const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
                if (dt < 1 / 120 && last) return;
                if (last && now - last > 1000) accumulator = 0; // Resume active notes, never replay elapsed simulation steps.
                last = now;
                const o = optionsRef.current, withFluid = cloudsRef.current && !!fluid;
                if (lastReset !== resetRef.current) {
                    fluid?.clear(); accumulator = 0; lastReset = resetRef.current; stats.clears++;
                }
                if (withFluid) document.documentElement.dataset.backdrop = 'on';
                else delete document.documentElement.dataset.backdrop;
                if (now - lastRead > 300) {
                    lastRead = now;
                    bg = parseColour(getComputedStyle(document.documentElement).getPropertyValue('--gen-bg'), bg);
                    dark = bg.reduce((a,b) => a+b, 0) < 1.5;
                    const heard = generator.nowPlaying(), palette = PALETTES[o.palette];
                    busy = intensity({ ...generator.settings, bpm: heard.bpm });
                    const bar = Math.floor(generator.position() / generator.beatsPerBar);
                    const planned = generator.getPlan().find((entry) => entry.bar === bar);
                    targetMood = musicMood(heard, planned, busy, palette);
                    targetHue = targetMood.hue;
                }
                const colourEase = 1 - Math.exp(-dt * 2.5);
                hue = easeHue(hue, targetHue, colourEase);
                mood = { ...targetMood,
                    saturation: mood.saturation + (targetMood.saturation - mood.saturation) * colourEase,
                    light: mood.light + (targetMood.light - mood.light) * colourEase,
                };
                analyser.getByteFrequencyData(bins);
                for (let i = 0; i < BANDS; i++) {
                    const [from, to] = bands[i]; let sum = 0;
                    for (let j = from; j < Math.min(to, bins.length); j++) sum += bins[j];
                    const value = sum / Math.max(1, to - from) / 255;
                    spec[i] += (value - spec[i]) * (value > spec[i] ? 0.6 : 0.12);
                }
                if (withFluid) {
                    accumulator += dt;
                    let substeps = 0;
                    while (accumulator >= 1 / 60 && substeps < 2) {
                        const clock = generator.AC.currentTime;
                        let emitters = music.sample(clock, { hue: hue + o.hueShift, spread: o.spread, mood, colour: hsl, size: o.size, speed: o.speed, jetDirection: o.jetDirection, motionBalance: o.motionBalance, balanceDrift: o.balanceDrift, intensity: busy, reduced: reducedQuery.matches, trails: o.trails });
                        const ambientEmitters = ambient.sample(clock, { colour: hsl, palette: PALETTES[o.palette],
                            hueShift: o.hueShift, reduced: reducedQuery.matches });
                        // Reserve room for audible ambient layers, including when music is playing.
                        emitters = [...emitters.slice(0, 32 - ambientEmitters.length), ...ambientEmitters];
                        stats.ambientEmitters = ambientEmitters.length;
                        lastEmitters = emitters.length;
                        fluid.step(1 / 60, emitters, { aspect: canvas.width / canvas.height, glow: o.glow,
                            energyCap: Math.max(0.000001, o.energyCap), dissipation: o.dissipation,
                            fullness: o.fullness,
                            vorticity: reducedQuery.matches ? 0 : o.vorticity, velocityDissipation: o.velocityDissipation, velocityDiffusion: o.velocityDiffusion, dyeDiffusion: o.dyeDiffusion,
                            simResolution: o.simResolution, dyeResolution: o.dyeResolution });
                        accumulator -= 1 / 60; substeps++;
                    }
                    if (substeps === 2) accumulator = Math.min(accumulator, 1 / 60);
                } else { music.clear(); accumulator = 0; }
                gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
                gl.useProgram(program); gl.bindVertexArray(vao); gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, fluid?.texture || emptyTexture); gl.uniform1i(uniforms.uDye, 0);
                gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
                gl.uniform1f(uniforms.uTime, now / 1000 * 0.04);
                gl.uniform1f(uniforms.uCloud, withFluid ? 1 : 0); gl.uniform1f(uniforms.uDark, dark ? 1 : 0);
                gl.uniform3fv(uniforms.uBg, bg);
                const rect = document.querySelector('.gen-timeline')?.getBoundingClientRect();
                const space = rect && rect.bottom > 0 ? Math.max(0.3, (window.innerHeight - rect.bottom) / window.innerHeight) : 1;
                gl.uniform2f(uniforms.uCentre, 0.5, space / 2); gl.uniform1f(uniforms.uRScale, Math.min(1, space / 0.8));
                gl.uniform1fv(uniforms.uSpec, spec); gl.uniform1i(uniforms.uSpecMode, o.circle ? (o.spectrum === 'bars' ? 2 : 1) : 0);
                gl.uniform3fv(uniforms.uSA, hsl(hue + o.hueShift + o.spread * 0.5, 0.7, 0.55));
                gl.uniform3fv(uniforms.uSB, hsl(hue + o.hueShift - o.spread * 0.8, 0.7, 0.55));
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                stats.frames = ++draws; stats.emitters = lastEmitters; stats.steps = fluid?.steps || 0;
                stats.mood = { hue, warmth: mood.warmth, tension: mood.tension, root: mood.root };
            };
            frame = requestAnimationFrame(draw);
        } catch (e) { setError('Unable to initialise the fluid background.'); console.warn('Backdrop:', e); }
        return cleanup;
    }, [generator, epoch]);
    return <><canvas ref={canvasRef} className="gen-backdrop" aria-hidden="true" />{clouds && error && <small role="status" style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 10 }}>{error}</small>}</>;
};
export default Backdrop;
