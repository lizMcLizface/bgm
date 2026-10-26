// Procedural pixel landscape behind the page (src/scenery), the alternative to the fluid
// background. By default a day passes in 4 minutes and a season in an hour, starting from
// the real time and date; either can instead follow the clock / calendar or hold still.
// The weather fades in place. The scenery code is loaded only when this background is picked.
import React, { useEffect, useRef, useState } from 'react';
import { frameSize } from '../scenery/catalog.js';

// time: 'cycle' | 'clock' | 'fixed' (at `hour`); season: 'cycle' | 'calendar' | 'fixed' (at `year`).
export const SCENERY_DEFAULTS = { biome: 'lake', seed: 1, weather: 'auto', time: 'cycle', hour: 15, season: 'cycle', year: 1.2,
    // follow: a musical preset brings its own landscape (src/scenery/presetScenes.js); moveTime / moveSeason
    // say whether the day and the year then keep passing; a new epoch restarts them from `hour` and `year`.
    follow: true, moveTime: true, moveSeason: true, epoch: 0,
    // hours / seasons: the preset's window for the passing day / year ([from, to]), or null.
    hours: null, seasons: null,
    // look: choices the preset pins in its landscape (the icy cavern, the garden's lanterns), or null.
    look: null };
export const DAY_MINUTES = 4, SEASON_MINUTES = 60;

// Hours since midnight, local time.
export const clockHour = (d = new Date()) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

// Time of year for seasons.js (0 spring .. 3 winter) from the date, northern hemisphere:
// spring starts in March, summer in June, autumn in September, winter in December.
export function calendarYear(d = new Date()) {
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const months = (d.getMonth() - 2 + 12) % 12 + (d.getDate() - 1) / days;
    return months / 3;
}

// A preset can keep the day or the year inside a window [from, to] on a circle of `period`
// (24 hours, 4 seasons), wrapping past midnight or the turn of the year when to < from.
const spanOf = ([a, b], period) => ((b - a) % period + period) % period;

// A passing time that swings back and forth across the window instead of leaving it.
export function swing(t, win, period) {
    if (!win) return ((t % period) + period) % period;
    const span = spanOf(win, period);
    if (!span) return win[0];
    const p = (((t - win[0]) % (2 * span)) + 2 * span) % (2 * span);
    return (win[0] + (p < span ? p : 2 * span - p)) % period;
}

// A time (from the clock or calendar) held to the window's nearer edge when it falls outside.
export function keepWithin(t, win, period) {
    if (!win) return t;
    const span = spanOf(win, period), d = ((t - win[0]) % period + period) % period;
    if (d <= span) return t;
    return d - span < period - d ? win[1] : win[0];
}

const FPS = 15;

// The window's shape, coarse enough that resizing does not keep rebuilding the scene.
const shapeOf = () => {
    const a = window.innerWidth / Math.max(1, window.innerHeight);
    return a >= 1.5 ? 1.5 : Math.round(a * 10) / 10;
};

const SceneryBackdrop = ({ options = SCENERY_DEFAULTS, light = false }) => {
    const canvasRef = useRef(null), sceneRef = useRef(null), optionsRef = useRef(options);
    // Where the passing day and year started, kept across landscape changes.
    const start = useRef(null);
    start.current ||= { at: performance.now(), hour: options.epoch ? options.hour : clockHour(), year: options.epoch ? options.year : calendarYear(), epoch: options.epoch ?? SCENERY_DEFAULTS.epoch };
    const o = { ...SCENERY_DEFAULTS, ...options };
    if (start.current.epoch !== o.epoch) {
        start.current = { at: performance.now(), hour: o.epoch ? o.hour : start.current.hour, year: o.epoch ? o.year : start.current.year, epoch: o.epoch };
    }
    optionsRef.current = o;
    const [shape, setShape] = useState(shapeOf);

    useEffect(() => {
        document.documentElement.dataset.backdrop = 'pixels';
        const resize = () => setShape(shapeOf());
        window.addEventListener('resize', resize);
        return () => { delete document.documentElement.dataset.backdrop; window.removeEventListener('resize', resize); };
    }, []);

    useEffect(() => {
        let frame = 0, cancelled = false, last = 0, prev = 0, elapsed = 0;
        const canvas = canvasRef.current, ctx = canvas.getContext('2d');
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        import('../scenery/biomes.js').then(({ createScene }) => {
            if (cancelled) return;
            const now = optionsRef.current;
            const timeOf = (p, t) => {
                const s = (t - start.current.at) / 1000;
                return {
                    hour: p.time === 'clock' ? keepWithin(clockHour(), p.hours, 24) : p.time === 'fixed' ? p.hour : swing(start.current.hour + s * 24 / (DAY_MINUTES * 60), p.hours, 24),
                    year: p.season === 'calendar' ? keepWithin(calendarYear(), p.seasons, 4) : p.season === 'fixed' ? p.year : swing(start.current.year + s / (SEASON_MINUTES * 60), p.seasons, 4),
                };
            };
            const scene = sceneRef.current = createScene(now.biome, now.seed, now.weather, timeOf(now, performance.now()).year, ...frameSize(shape), now.look);
            canvas.width = scene.W; canvas.height = scene.H;
            const image = ctx.createImageData(scene.W, scene.H), pixels = new Uint32Array(image.data.buffer);
            const draw = (t) => {
                frame = requestAnimationFrame(draw);
                const dt = prev ? Math.min(0.25, (t - prev) / 1000) : 0;
                prev = t;
                if (document.hidden) return;
                // Reduced motion: the scene still relights and its weather still turns, but only once a second.
                const fps = reduced.matches ? 1 : light ? 10 : FPS;
                elapsed += reduced.matches ? 0 : dt;
                if (t - last < 1000 / fps) return;
                last = t;
                const { hour, year } = timeOf(optionsRef.current, t);
                scene.year = year;
                scene.render(reduced.matches ? t / 1000 : elapsed, hour, pixels);
                ctx.putImageData(image, 0, 0);
            };
            frame = requestAnimationFrame(draw);
        }).catch((e) => console.warn('Scenery:', e));
        return () => { cancelled = true; cancelAnimationFrame(frame); sceneRef.current = null; };
    }, [o.biome, o.seed, JSON.stringify(o.look), light, shape]); // eslint-disable-line react-hooks/exhaustive-deps

    // Weather fades to the new choice without rebuilding the landscape.
    useEffect(() => { sceneRef.current?.wx?.set(o.weather); }, [o.weather]);

    return <canvas ref={canvasRef} className="gen-backdrop gen-backdrop-pixels" aria-hidden="true" />;
};
export default SceneryBackdrop;
