import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin = process.env.WEATHER_URL ?? 'http://127.0.0.1:5179';
const publicMode = process.argv.includes('--public');
const out = `.tmp/main-weather-audit/${publicMode ? 'public' : 'local'}`;
await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.SYNTH_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-sandbox', '--mute-audio'], defaultViewport: { width: 1380, height: 1000 } });
const report = { origin, publicMode, errors: [], requests: [] };
try {
    const page = await browser.newPage();
    page.on('pageerror', e => report.errors.push(String(e)));
    page.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') report.errors.push(`${r.url()}: ${r.failure()?.errorText}`); });
    page.on('request', r => report.requests.push(r.url()));
    await page.evaluateOnNewDocument(() => {
        localStorage.setItem('bgm-stage-v2', '7'); localStorage.setItem('bgm-tour-v2', 'true'); localStorage.setItem('bgm-backdrop', 'false');
        window.__weatherContexts = []; window.__weatherNodes = []; window.__weatherErrors = [];
        const Context = window.AudioContext, Worklet = window.AudioWorkletNode;
        window.AudioContext = class extends Context { constructor(...args) { super(...args); __weatherContexts.push(this); } };
        window.AudioWorkletNode = class extends Worklet { constructor(...args) {
            super(...args); if (args[1] === 'main-weather-bed') { __weatherNodes.push(this); this.addEventListener('processorerror', () => __weatherErrors.push('processorerror')); }
        } };
    });
    await page.goto(origin + '/?preset=open-rain&wasm=0&mediaHelper=0');
    await page.waitForSelector('select[aria-label="Rain preset"]');
    await page.click('.gen-play');
    await page.waitForFunction(() => __weatherNodes.length > 0);
    await page.select('select[aria-label="Rain preset"]', 'roof');
    await page.select('select[aria-label="Thunder preset"]', 'distant');
    await page.select('select[aria-label="Waves preset"]', 'gentle');
    assert.equal(await page.$eval('select[aria-label="Thunder preset"]', e => e.value), 'distant');
    assert.equal(await page.$eval('select[aria-label="Waves preset"]', e => e.value), 'gentle');
    if (!publicMode) {
        report.settings = await page.evaluate(() => ({ levels: __generator.settings.ambience, shape: __generator.settings.ambienceShape, music: __generator.settings.playMusic }));
        assert.equal(report.settings.music, false);
        assert.equal(report.settings.shape.rain.surface, 'tin');
        assert.equal(report.settings.shape.thunder.distance, .75);
        assert.equal(report.settings.shape.waves.size, .3);
        assert.equal(report.settings.levels.rain, .55);
        assert.equal(report.settings.levels.thunder, .55);
        assert.equal(report.settings.levels.waves, .75);
    }
    report.digital = await page.evaluate(async () => {
        const node = __weatherNodes.at(-1), c = __weatherContexts.at(-1), data = new Float32Array(2048);
        const meters = Array.from({ length: 3 }, (_, i) => { const a = c.createAnalyser(); a.fftSize = 2048; node.connect(a, i); return { a, i, energy: 0, peak: 0, count: 0 }; });
        for (let k = 0; k < 65; k++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            for (const m of meters) { m.a.getFloatTimeDomainData(data); for (const x of data) { m.energy += x*x; m.peak = Math.max(m.peak, Math.abs(x)); m.count++; } }
        }
        return meters.map(m => { node.disconnect(m.a, m.i); return { source: m.i, rms: Math.sqrt(m.energy/m.count), peak: m.peak }; });
    });
    assert(report.digital.every(m => m.rms > 1e-6 && m.peak < 1));
    assert.equal(await page.evaluate(() => __weatherNodes.length), 1, 'Changing presets keeps the live processor');
    await page.$eval('[aria-label="Rain source"] details', e => { e.open = true; });
    const previousUrl = page.url();
    await page.select('select[aria-label="Rain surface"]', 'leaves');
    await page.waitForFunction(previous => location.href !== previous && location.search.includes('a='), {}, previousUrl);
    const panel = await page.$('[data-tour="ambience"]');
    assert(await page.$eval('.gen-weather-sources', e => e.getBoundingClientRect().width > 900), 'Source cards span the desktop panel');
    // Keep the sticky transport outside the panel capture.
    await page.addStyleTag({ content: '.gen-header { visibility: hidden !important; }' });
    await panel.screenshot({ path: `${out}/desktop.png` });
    await page.setViewport({ width: 390, height: 844 });
    await panel.screenshot({ path: `${out}/mobile.png` });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No mobile overflow');
    await page.reload();
    await page.waitForSelector('select[aria-label="Rain preset"]');
    assert.equal(await page.$eval('select[aria-label="Rain surface"]', e => e.value), 'leaves');
    if (!publicMode) {
        await page.waitForFunction(() => !!window.__generator);
        report.restored = await page.evaluate(() => ({ levels: __generator.settings.ambience, shape: __generator.settings.ambienceShape }));
        assert.equal(report.restored.shape.rain.surface, 'leaves');
        assert.equal(report.restored.shape.thunder.distance, .75);
        assert.equal(report.restored.shape.waves.size, .3);
        report.export = await page.evaluate(async () => {
            const { renderPcm } = await import('/src/app/engine/render.js');
            const chunks = [];
            const result = await renderPcm(__generator, 66, { onChunk(pcm) {
                let energy = 0, peak = 0; for (const x of pcm) { energy += x*x; peak = Math.max(peak, Math.abs(x)); }
                chunks.push({ samples: pcm.length, rms: Math.sqrt(energy/pcm.length), peak });
            } });
            return { ...result, chunks };
        });
        assert.equal(report.export.frames, report.export.sampleRate * 66);
        assert.equal(report.export.chunks.length, 2);
        assert(report.export.chunks.every(c => c.rms > 1 && c.peak < 32767));
    }
    await page.click('.gen-play');
    await page.waitForFunction(() => __weatherNodes.length > 0);
    await page.click('.gen-play');
    await new Promise(resolve => setTimeout(resolve, 700));
    if (!publicMode) assert(await page.evaluate(() => !__generator.ambience.weatherRoute.node && !__generator.ambienceRunning));
    assert.deepEqual(await page.evaluate(() => __weatherErrors), []);
    assert.deepEqual(report.errors, []);
    assert(!report.requests.some(url => /local-rain|rain_synth|\.wav(?:\?|$)/.test(url)), 'Main weather uses no audio assets');
    console.log(JSON.stringify({ ...report, requests: report.requests.length }, null, 2));
} finally {
    await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
    await browser.close();
}
