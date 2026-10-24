import { RainAudio } from './rainAudio.js';
import { LAYERS } from './rainModel.js';
import { DEFAULT_WEATHER as DEFAULT_ENVIRONMENT, THUNDER_LAYERS, SURF_LAYERS } from './weatherModel.js';
import { REFERENCES } from './references.js';
import measurements from './referenceMetrics.json';
import './rain.css';

const root = document.querySelector('#ambient');
const titles = { rumble: 'Pressure', body: 'Body', mist: 'Mist', sheet: 'Sheet', hiss: 'Splash & air', drops: 'Near drops',
    thunderCrack: 'Thunder crack', thunderRoll: 'Rolling rumble', thunderEcho: 'Thunder echoes', waveSurge: 'Approach / surge', waveBreak: 'Breaking crest', waveWash: 'Retreat / backwash' };
const descriptions = { rumble: 'Shared bass · 30–95 Hz', body: 'Soft overlapping puffs · dulled low-mid body', mist: 'Gentle distant wash · 1.2 kHz', sheet: 'Rain sheet · 3.5 kHz', hiss: 'Bright splatter · deeper frying texture', drops: 'Subdued patter · rounded, damped impacts' };
Object.assign(descriptions, { thunderCrack: 'Brief pressure fronts · dull initial strike', thunderRoll: 'Deep bass roll · gradual falling tail', thunderEcho: 'Damped stereo reflections · decaying tail',
    waveSurge: 'Gathering water · rising energy', waveBreak: 'Full wave energy · broad crest', waveWash: 'Continuous water · long, soft decay' });
const sliders = [['rainIntensity', 'Rain intensity', 'Sparse drizzle → dense downpour'], ['windChaos', 'Wind chaos', 'Still air → stronger weather fluctuations'],
    ['indoorFilter', 'Shelter', 'Open air → deep indoors'], ['correlation', 'Temporal coupling', 'Stationary rate → shared gusts & drop clusters'],
    ['impactTexture', 'Impact texture', 'Smooth wash → granular patter & frying-pan splatter']];
const thunderSliders = [['thunderActivity', 'Thunder activity', 'No new events → frequent rolls'], ['thunderDistance', 'Thunder distance', 'Close crack → softened distant roll'],
    ['thunderPower', 'Thunder weight', 'Gentle roll → heavier pressure'], ['thunderDecay', 'Rumble & echo length', 'Short fall-off → lingering reverberation']];
const surfSliders = [['surfLevel', 'Surf activity', 'No new waves → full shoreline'], ['waveSize', 'Wave size', 'Small breakers → heavy collapse'],
    ['wavePace', 'Wave pace', 'Long swells → frequent breakers'], ['waveFoam', 'Retreat length', 'Brief fall-off → lingering returning water']];
const allSliders = [...sliders, ...thunderSliders, ...surfSliders];
const sliderMarkup = ([key, title, hint]) => `<label class="control" for="${key}"><span>${title}<output id="${key}-value">${Math.round(DEFAULT_ENVIRONMENT[key] * 100)}%</output></span><input id="${key}" type="range" min="0" max="1" step=".01" value="${DEFAULT_ENVIRONMENT[key]}"><small>${hint}</small></label>`;
const layerMarkup = id => `<div class="layer"><div><strong>${titles[id]}</strong><small>${descriptions[id]}</small></div><label><span class="sr-only">${titles[id]} level</span><input data-layer="${id}" type="range" min="0" max="1.5" step=".01" value="1"></label><button data-solo="${id}" aria-pressed="false">Solo</button></div>`;
root.innerHTML = `
<header><a href="/">← calmbgm</a><span class="eyebrow">AMBIENT / EXPERIMENT 01</span></header>
<section class="intro"><div><p class="eyebrow">A FIELD OF SMALL EVENTS</p><h1>Make the weather.</h1>
<p class="lede">Shape the patter of rain, a thunder roll across the sky, or a wave gathering and breaking on the shore. Every scene unfolds from small, synthetic events.</p></div>
<div class="transport"><button id="play" class="primary">Play weather</button><button id="stop" disabled>Stop</button><label>Output <input id="volume" aria-label="Output volume" type="range" min="0" max="1" step=".01" value=".65"></label><p id="status" role="status">Ready · synthesized live, without recordings.</p></div></section>
<section class="weather-view" aria-label="Live weather activity"><canvas id="scope" aria-label="Recent waveform and recent rain impact rate"></canvas><div class="view-caption"><span>LIVE / WEATHER & IMPACTS</span><span id="stats">Waiting for weather</span></div><div id="event-stats" class="event-caption">Thunder quiet · Shore quiet</div></section>
<div class="workbench"><section class="panel"><div class="section-title"><h2>01 / Environment</h2><span>LIVE CONTROLS</span></div>
<div class="presets" aria-label="Weather presets">${['Drizzle', 'Open rain', 'Tin roof', 'Inside storm', 'Thunderstorm', 'Shoreline', 'Coastal storm'].map(n => `<button data-preset="${n}">${n}</button>`).join('')}</div>
${sliders.map(sliderMarkup).join('')}
<div class="two-controls"><label>Impact surface<select id="surface">${['mixed', 'leaves', 'glass', 'concrete', 'tin', 'puddle'].map(n => `<option value="${n}">${n[0].toUpperCase() + n.slice(1)}</option>`).join('')}</select></label>
<label>Repeatable seed<input id="seed" type="number" min="1" max="4294967295" step="1" value="731"><small>Applied on the next Play.</small></label></div></section>
<section class="panel"><div class="section-title"><h2>02 / Listen in layers</h2><button id="reset-layers">Reset mix</button></div><p class="hint">Solo a layer to hear its role. Levels and solos respond during playback.</p>
${LAYERS.map(layerMarkup).join('')}
<p class="hint footnote">Low pressure stays centred. The wash uses independent stereo noise; each near drop gets its own position.</p></section></div>
<div class="workbench weather-events"><section class="panel"><div class="section-title"><h2>03 / Thunder events</h2><span id="thunder-phase" role="status">Quiet</span></div>
<p class="hint">A brief pressure strike followed by a deep, slowly rolling body and damped echoes. Distance broadens the initial front.</p>
<div class="event-actions"><button data-trigger="thunder">Hear one thunder</button><button data-solo="thunder" aria-pressed="false">Solo thunder</button></div>
${thunderSliders.map(sliderMarkup).join('')}${THUNDER_LAYERS.map(layerMarkup).join('')}
<p class="hint footnote">Hear one isolates the event. Activity zero stops new automatic events; existing tails finish naturally. Source shape guides the next event and echo length also responds live.</p></section>
<section class="panel"><div class="section-title"><h2>04 / Breaking waves</h2><span id="surf-phase" role="status">Quiet</span></div>
<p class="hint">One continuous water sound gathers, breaks and recedes. The stages overlap gradually and share the same texture.</p>
<div class="event-actions"><button data-trigger="surf">Hear one wave</button><button data-solo="surf" aria-pressed="false">Solo surf</button></div>
${surfSliders.map(sliderMarkup).join('')}${SURF_LAYERS.map(layerMarkup).join('')}
<p class="hint footnote">Hear one isolates the event; a scene preset restores the full mix. Activity zero stops new waves and lets the wash recede.</p></section></div>
<section class="panel reference-panel"><div class="section-title"><h2>05 / Reference listening</h2><select id="family" aria-label="Reference family"><option value="rain">Rain Noise</option><option value="tin">Tin Roof Rain</option></select></div>
<p class="hint">The supplied WAVs map to different perceptual roles. Audition the source, the earlier band synth, then the new live layer. Each selection stops the other player.</p>
<p id="reference-status" role="status">Checking for local analysis files…</p><audio id="reference-player" controls preload="none"></audio>
<div class="table-scroll"><table><thead><tr><th>Source stem</th><th>Role / proposed generator</th><th>Envelope CV<small>ref / previous</small></th><th>Listen</th></tr></thead><tbody id="references"></tbody></table></div>
<details><summary>What these measurements mean</summary><p>The reference and previous WAVs were already RMS matched by the earlier render script. Envelope CV measures variation of stereo RMS in 20 ms windows. It describes dynamics, not similarity by itself. The report also measures envelope autocorrelation at 0.1, 0.5 and 2 seconds, crest factor and stereo correlation. Several source excerpts contain pronounced fades: their raw slow correlation includes those fades and should not be attributed entirely to weather. A similar spectrum, CV or autocorrelation does not establish a perceptual match.</p><p>Reference roles are interpretations of the supplied files and their analysis notes. Multiple layers contribute to a stem; these are listening guides, not exact physical identifications. The live layer is a broader generator, not a frequency-isolated reconstruction. Source and previous WAVs share an RMS target; the live generator retains its own level and is not loudness matched to them.</p></details></section>
<section class="notes"><h2>What is being modelled?</h2><p>A multiscale random weather signal changes the noise envelopes and the arrival rate of nearby impacts together. Conditional on that evolving rate, drop arrivals are Poisson; over longer periods they form clusters. Set temporal coupling to zero for a stationary-rate comparison.</p><p>Each nearby impact combines a short noise strike, a dull body puff and delayed splash fragments. Dense, overlapping micro-impacts give the body and air their own patter, with brief patches of splatter inside the slower weather. Impact texture blends these into a smoother wash. Materials colour broad noise bursts; their resonances are heavily damped.</p><p>Everything in the live generator is mathematical. These are acoustic approximations, not a fluid simulation. Reference recordings are local listening aids and are excluded from the public build. This lab leaves the main music app’s ambient bed unchanged.</p></section>
<footer>PROCEDURAL SOUND / NO LOOPS / NO TRAINING <a href="/">Back to the music ↗</a></footer>`;

const $ = selector => root.querySelector(selector);
const status = text => { $('#status').textContent = text; };
const player = $('#reference-player');
let playing = false, revision = 0, latestStats = null, referenceFiles = new Set(), starting = null;
const engine = new RainAudio(data => { latestStats = data; }, error => { stop(); status(error.message); });
function stop() {
    ++revision; engine.stop(); playing = false; latestStats = null; starting = null;
    $('#play').disabled = false; $('#stop').disabled = true; $('#play').textContent = 'Play weather'; status('Stopped.');
}
async function play() {
    if (starting) return starting;
    const own = ++revision; player.pause(); player.removeAttribute('src'); player.load();
    $('#play').disabled = true; $('#stop').disabled = false; status('Starting weather…');
    const task = engine.start(Math.max(1, Math.floor(Number($('#seed').value) || 731)) >>> 0); starting = task;
    try {
        await task;
        if (own !== revision) return;
        playing = true; status('Playing · all controls respond live.'); $('#play').textContent = 'Playing';
    } catch (error) { if (own === revision) { stop(); status(`Could not start: ${error.message}`); } }
    finally { if (starting === task) starting = null; }
}
$('#play').addEventListener('click', () => void play());
$('#stop').addEventListener('click', () => { stop(); player.pause(); });
$('#volume').addEventListener('input', e => { engine.volume = Number(e.target.value); engine.update(); });
for (const [key] of allSliders) $(`#${key}`).addEventListener('input', e => {
    const value = Number(e.target.value); $(`#${key}-value`).value = `${Math.round(value * 100)}%`; engine.update({ [key]: value });
});
$('#surface').addEventListener('change', e => engine.update({ surfaceType: e.target.value }));
function refreshSolos() { root.querySelectorAll('[data-solo]').forEach(b => b.setAttribute('aria-pressed', String(engine.solo === b.dataset.solo))); }
root.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('input', () => { engine.levels[input.dataset.layer] = Number(input.value); engine.update(); }));
root.querySelectorAll('[data-solo]').forEach(button => button.addEventListener('click', () => {
    engine.solo = engine.solo === button.dataset.solo ? null : button.dataset.solo; refreshSolos(); engine.update();
}));
$('#reset-layers').addEventListener('click', () => {
    engine.solo = null; root.querySelectorAll('[data-layer]').forEach(input => { input.value = 1; engine.levels[input.dataset.layer] = 1; }); refreshSolos(); engine.update();
});
const presets = {
    Drizzle: { rainIntensity: .16, windChaos: .12, indoorFilter: 0, surfaceType: 'leaves', correlation: .8 },
    'Open rain': DEFAULT_ENVIRONMENT,
    'Tin roof': { rainIntensity: .62, windChaos: .35, indoorFilter: .12, surfaceType: 'tin', correlation: .85 },
    'Inside storm': { rainIntensity: .92, windChaos: .85, indoorFilter: .78, surfaceType: 'mixed', correlation: 1, thunderActivity: .55, thunderDistance: .8, thunderDecay: .8 },
    Thunderstorm: { rainIntensity: .7, windChaos: .7, correlation: .9, thunderActivity: .65, thunderDistance: .45, thunderPower: .7, thunderDecay: .75 },
    Shoreline: { rainIntensity: 0, windChaos: .2, surfLevel: .8, waveSize: .55, wavePace: .45, waveFoam: .65 },
    'Coastal storm': { rainIntensity: .5, windChaos: .85, correlation: 1, thunderActivity: .45, thunderPower: .75, thunderDistance: .7, thunderDecay: .85,
        surfLevel: .9, waveSize: .85, wavePace: .7, waveFoam: .8 },
};
root.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    engine.solo = null; refreshSolos();
    const e = { ...DEFAULT_ENVIRONMENT, ...presets[b.dataset.preset] }; engine.update(e);
    for (const [key] of allSliders) { $(`#${key}`).value = e[key]; $(`#${key}-value`).value = `${Math.round(e[key] * 100)}%`; }
    $('#surface').value = e.surfaceType;
}));
root.querySelectorAll('[data-trigger]').forEach(button => button.addEventListener('click', async () => {
    const group = button.dataset.trigger, layers = group === 'thunder' ? THUNDER_LAYERS : SURF_LAYERS;
    if (engine.solo !== group && !layers.includes(engine.solo)) { engine.solo = group; refreshSolos(); engine.update(); }
    if (!playing) await play();
    if (engine.node) { engine.trigger(group); status(group === 'thunder' ? 'Playing one thunder event · crack, roll and echoes.' : 'Playing one wave · approach, break and retreat.'); }
}));

function renderReferences() {
    const family = $('#family').value;
    $('#references').innerHTML = REFERENCES.filter(r => r.family === family).map(r => {
        const m = measurements.find(m => m.file === r.reference), old = measurements.find(m => m.file === r.previous);
        return `<tr><td><strong>${r.family} / ${r.band}</strong><small>${r.reference}</small></td><td><strong>${r.title} → ${titles[r.layer]}</strong><small>${r.description}</small></td><td class="metric">${m?.envelopeCV.toFixed(2) ?? '—'} / ${old?.envelopeCV.toFixed(2) ?? '—'}</td><td class="listen"><button data-file="${r.reference}" ${referenceFiles.has(r.reference) ? '' : 'disabled'}>Reference</button><button data-file="${r.previous}" ${referenceFiles.has(r.previous) ? '' : 'disabled'}>Previous synth</button><button data-new="${r.layer}" data-material="${family === 'tin' ? 'tin' : 'mixed'}">Live ${titles[r.layer]}</button></td></tr>`;
    }).join('');
}
$('#family').addEventListener('change', () => { player.pause(); renderReferences(); });
$('#references').addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.file) {
        stop(); player.src = `/local-rain/bands/${encodeURIComponent(button.dataset.file)}`; player.volume = 1;
        $('#reference-status').textContent = `Listening: ${button.dataset.file} · supplied RMS-matched WAV`;
        try { await player.play(); } catch (error) { $('#reference-status').textContent = `Could not play reference: ${error.message}`; }
    } else {
        engine.solo = button.dataset.new; engine.update({ surfaceType: button.dataset.material });
        $('#surface').value = button.dataset.material; refreshSolos(); engine.update();
        if (!playing) await play(); else { player.pause(); status(`Playing live ${titles[engine.solo]} · ${engine.environment.surfaceType}`); }
    }
});
player.addEventListener('play', () => { if (engine.context) stop(); });
player.addEventListener('error', () => { $('#reference-status').textContent = 'Reference could not be loaded. Check that the local WAV still exists.'; });
renderReferences();
if (import.meta.env.MODE !== 'public') {
    fetch('/local-rain/index.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(index => {
        referenceFiles = new Set(index.files); renderReferences();
        $('#reference-status').textContent = referenceFiles.size ? 'Local reference files available. Source and previous-synth buttons play the supplied WAVs.' : 'No local reference WAVs found. Live generation is available.';
    }).catch(() => { $('#reference-status').textContent = 'Local reference audio is unavailable on this server. Live generation is available.'; });
} else $('#reference-status').textContent = 'Reference audio is available only on the local development server. Live generation is asset-free.';

const canvas = $('#scope'), ctx = canvas.getContext('2d'), waveform = new Float32Array(2048), history = [];
let lastPaint = 0;
function draw(now) {
    requestAnimationFrame(draw);
    if (document.hidden || now - lastPaint < 70) return; lastPaint = now;
    const width = canvas.clientWidth, height = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    if (engine.analyser) engine.analyser.getFloatTimeDomainData(waveform); else waveform.fill(0);
    ctx.strokeStyle = '#264e52'; ctx.lineWidth = 1;
    for (let y = 35; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.strokeStyle = '#93dfca'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < waveform.length; i++) { const x = i / (waveform.length - 1) * width, y = height * .43 - waveform[i] * height * 2.5; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
    history.push(latestStats?.rate ?? 0); if (history.length > 180) history.shift();
    ctx.strokeStyle = '#d3bd86'; ctx.lineWidth = 2; ctx.beginPath();
    history.forEach((rate, i) => { const x = width - (history.length - i) * width / 180, y = height - 18 - Math.min(1, rate / 230) * height * .27; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
    $('#stats').textContent = latestStats ? `${latestStats.rate.toFixed(0)} impacts/s · ${latestStats.active} active · ${latestStats.events} total${latestStats.dropped ? ` · ${latestStats.dropped} skipped` : ''}` : 'Waiting for weather';
    const thunder = latestStats?.thunder, surf = latestStats?.surf;
    $('#thunder-phase').textContent = thunder ? `${thunder.phase} · ${thunder.events} ${thunder.events === 1 ? 'event' : 'events'}` : 'Quiet';
    $('#surf-phase').textContent = surf ? `${surf.phase} · ${surf.events} ${surf.events === 1 ? 'wave' : 'waves'}` : 'Quiet';
    $('#event-stats').textContent = `Thunder ${thunder?.phase ?? 'quiet'} · Shore ${surf?.phase ?? 'quiet'}`;
}
requestAnimationFrame(draw);
window.addEventListener('pagehide', () => { stop(); player.pause(); });
