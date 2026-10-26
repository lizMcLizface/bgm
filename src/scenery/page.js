// Prototype viewer for procedural pixel scenery: biome, seed and time of day,
// with an optional day cycle. State lives in the URL hash so scenes can be shared.
import { BIOMES, createScene } from './biomes.js';
import { frameSize } from './catalog.js';
import { WEATHER } from './weather.js';
import { seasonName } from './seasons.js';

const FPS = 15;
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

const state = { biome: 'lake', seed: 1, hour: BIOMES.lake.hour, weather: 'auto', year: 1.2, cycle: false, dayMinutes: 4, yearCycle: false, yearMinutes: 20, frame: 'window' };
// The scene's shape: the window's (as the page builds it), 16:9, or a phone held upright.
const FRAMES = { window: () => innerWidth / Math.max(1, innerHeight), wide: () => 16 / 9, phone: () => 412 / 915 };
let scene, image, pixels, last = 0, elapsed = 0, prev = performance.now(), renderMs = 0, shown = null;

function readHash() {
    const [biome, seed, hour, weather, year, frame] = location.hash.slice(1).split('/');
    if (FRAMES[frame]) state.frame = frame;
    if (year && !isNaN(+year)) state.year = ((+year % 4) + 4) % 4;
    state.weather = WEATHER[weather] ? weather : 'auto';
    if (BIOMES[biome]) state.biome = biome;
    if (seed && !isNaN(+seed)) state.seed = +seed;
    state.hour = hour && !isNaN(+hour) ? +hour : BIOMES[state.biome].hour;
}

function writeHash() {
    history.replaceState(null, '', `#${state.biome}/${state.seed}/${state.hour.toFixed(1)}/${state.weather}/${state.year.toFixed(2)}/${state.frame}`);
}

function rebuild() {
    scene = createScene(state.biome, state.seed, state.weather, state.year, ...frameSize(FRAMES[state.frame]()));
    canvas.classList.toggle('phone', state.frame === 'phone');
    canvas.width = scene.W;
    canvas.height = scene.H;
    image = ctx.createImageData(scene.W, scene.H);
    pixels = new Uint32Array(image.data.buffer);
    document.querySelectorAll('[data-biome]').forEach(b => b.classList.toggle('on', b.dataset.biome === state.biome));
    $('seed').value = state.seed;
    $('weather').value = state.weather;
    $('frame').value = state.frame;
    shown = null;
    draw();
    writeHash();
}

function clock(h) {
    const m = Math.floor(((h % 24) + 24) % 24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function draw() {
    const t0 = performance.now();
    scene.year = state.year;
    scene.render(elapsed, state.hour, pixels);
    ctx.putImageData(image, 0, 0);
    renderMs = renderMs * 0.9 + (performance.now() - t0) * 0.1;
    $('hour').value = state.hour;
    $('clock').textContent = clock(state.hour);
    $('year').value = state.year;
    $('season').textContent = seasonName(state.year);
    const wx = scene.wx, now = wx && (wx.prev ? `${WEATHER[wx.prev]} → ${WEATHER[wx.cur]}` : WEATHER[wx.cur]);
    if (now !== shown) { shown = now; $('weather').options[0].textContent = `Changing (${now})`; }
}

function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.25, (now - prev) / 1000);
    prev = now;
    elapsed += dt;
    if (state.cycle) state.hour = (state.hour + dt * 24 / (state.dayMinutes * 60)) % 24;
    if (state.yearCycle) state.year = (state.year + dt * 4 / (state.yearMinutes * 60)) % 4;
    if (now - last < 1000 / FPS) return;
    last = now;
    draw();
    $('perf').textContent = `${renderMs.toFixed(1)} ms/frame · ${scene.W}×${scene.H} · ${scene.defs.length} colours`;
}

function buildUi() {
    const row = $('biomes');
    for (const [key, b] of Object.entries(BIOMES)) {
        const btn = document.createElement('button');
        btn.textContent = b.name;
        if (b.draft) { btn.classList.add('draft'); btn.title = 'New, in review'; }
        btn.dataset.biome = key;
        btn.onclick = () => { state.biome = key; if (!state.cycle) state.hour = b.hour; rebuild(); };
        row.append(btn);
    }
    const wx = $('weather');
    wx.append(new Option('Auto', 'auto'), ...Object.entries(WEATHER).map(([k, name]) => new Option(name, k)));
    // Weather fades in place; the landscape is not rebuilt.
    wx.onchange = e => { state.weather = e.target.value; scene.wx?.set(state.weather); writeHash(); };
    $('frame').onchange = e => { state.frame = e.target.value; rebuild(); };
    $('nextWeather').onclick = () => {
        const w = scene.wx;
        if (!w) return;
        if (state.weather !== 'auto') { state.weather = 'auto'; $('weather').value = 'auto'; writeHash(); }
        w.changing = true;
        w.go(w.pickNext(), 15);
        w.next = w.now + 90 + Math.random() * 150;
    };
    $('new').onclick = () => { state.seed = Math.floor(Math.random() * 1e6); rebuild(); };
    $('seed').onchange = e => { state.seed = Math.floor(+e.target.value) || 0; rebuild(); };
    $('hour').oninput = e => { state.hour = +e.target.value; draw(); writeHash(); };
    $('cycle').onchange = e => { state.cycle = e.target.checked; };
    $('speed').onchange = e => { state.dayMinutes = +e.target.value; };
    $('year').oninput = e => { state.year = +e.target.value; draw(); writeHash(); };
    $('yearCycle').onchange = e => { state.yearCycle = e.target.checked; };
    $('yearSpeed').onchange = e => { state.yearMinutes = +e.target.value; };
    $('hide').onclick = () => document.body.classList.toggle('bare');
    addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        const keys = Object.keys(BIOMES), i = keys.indexOf(state.biome);
        if (e.key === 'h') document.body.classList.toggle('bare');
        else if (e.key === ' ') { e.preventDefault(); $('new').click(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            state.biome = keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
            if (!state.cycle) state.hour = BIOMES[state.biome].hour;
            rebuild();
        }
    });
    addEventListener('hashchange', () => { readHash(); rebuild(); });
}

readHash();
buildUi();
rebuild();
requestAnimationFrame(tick);
