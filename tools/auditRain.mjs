import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin = process.env.RAIN_LAB_URL ?? 'http://127.0.0.1:5179';
const publicMode = process.argv.includes('--public');
const out = `.tmp/rain-audit/${publicMode ? 'public' : 'local'}`; await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.SYNTH_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-sandbox', '--mute-audio'], defaultViewport: { width: 1380, height: 1000 } });
const report = { origin, publicMode, errors: [], cancelled: [], requests: [] };
try {
    const page = await browser.newPage();
    page.on('pageerror', e => report.errors.push(String(e)));
    page.on('requestfailed', r => {
        const message = `${r.url()}: ${r.failure()?.errorText}`;
        // Switching audio sources intentionally cancels the previous streaming request.
        if (r.url().includes('/local-rain/') && r.failure()?.errorText === 'net::ERR_ABORTED') report.cancelled.push(message);
        else report.errors.push(message);
    });
    page.on('request', r => report.requests.push(r.url()));
    await page.evaluateOnNewDocument(() => {
        window.__rainContexts = []; window.__rainNodes = [];
        const Context = window.AudioContext, Worklet = window.AudioWorkletNode;
        window.AudioContext = class extends Context { constructor(...args) { super(...args); window.__rainContexts.push(this); } };
        window.AudioWorkletNode = class extends Worklet { constructor(...args) { super(...args); window.__rainNodes.push(this); } };
    });
    await page.goto(origin + '/ambient');
    await page.waitForSelector('#play');
    if (!publicMode) await page.waitForSelector('[data-file="rain_band7_ref.wav"]:not([disabled])');
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Playing'));
    await page.waitForFunction(() => document.querySelector('#stats').textContent.includes('total'));
    // Meter the actual worklet output. This observes all six streams before the indoor bus.
    report.digital = await page.evaluate(async () => {
        const c = __rainContexts.at(-1), node = __rainNodes.at(-1), analysers = [];
        for (let i = 0; i < 6; i++) { const a = c.createAnalyser(); a.fftSize = 2048; node.connect(a, i); analysers.push(a); }
        await new Promise(resolve => setTimeout(resolve, 500));
        return analysers.map((a, i) => {
            const data = new Float32Array(2048); a.getFloatTimeDomainData(data); node.disconnect(a, i);
            let peak = 0, energy = 0; for (const x of data) { peak = Math.max(peak, Math.abs(x)); energy += x * x; }
            return { layer: i, peak, rms: Math.sqrt(energy / data.length) };
        });
    });
    assert(report.digital.every(m => m.rms > 1e-6 && m.peak < 1));
    for (const surface of ['mixed', 'leaves', 'glass', 'concrete', 'tin', 'puddle']) {
        await page.select('#surface', surface);
        await page.evaluate(() => { const e = document.querySelector('#rainIntensity'); e.value = .9; e.dispatchEvent(new Event('input')); });
    }
    await page.click('[data-solo="drops"]');
    assert.equal(await page.$eval('[data-solo="drops"]', e => e.getAttribute('aria-pressed')), 'true');
    await page.click('#reset-layers');
    await page.click('[data-preset="Inside storm"]');
    assert.equal(await page.$eval('#surface', e => e.value), 'mixed');
    assert.equal(await page.$eval('#indoorFilter', e => e.value), '0.78');
    await page.click('[data-preset="Open rain"]');
    assert.equal(await page.$eval('#thunderActivity', e => e.value), '0');
    assert.equal(await page.$eval('#surfLevel', e => e.value), '0');
    await page.click('[data-trigger="thunder"]');
    assert.equal(await page.$eval('[data-solo="thunder"]', e => e.getAttribute('aria-pressed')), 'true');
    await page.click('[data-trigger="surf"]');
    assert.equal(await page.$eval('[data-solo="surf"]', e => e.getAttribute('aria-pressed')), 'true');
    await page.waitForFunction(() => document.querySelector('#thunder-phase').textContent.includes('1 event')
        && document.querySelector('#surf-phase').textContent.includes('1 wave'));
    // Follow all stages through one complete breaking crest. These source meters
    // observe the actual worklet, independent of which mixer component is soloed.
    report.weatherDigital = await page.evaluate(async () => {
        const node = __rainNodes.at(-1), c = __rainContexts.at(-1), data = new Float32Array(2048);
        const meters = Array.from({ length: 6 }, (_, j) => {
            const analyser = c.createAnalyser(); analyser.fftSize = 2048; node.connect(analyser, j + 6);
            return { analyser, layer: j + 6, energy: 0, peak: 0, samples: 0 };
        });
        for (let round = 0; round < 65; round++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            for (const m of meters) {
                m.analyser.getFloatTimeDomainData(data);
                for (const x of data) { m.energy += x * x; m.peak = Math.max(m.peak, Math.abs(x)); m.samples++; }
            }
        }
        return meters.map(m => { node.disconnect(m.analyser, m.layer); return { layer: m.layer, peak: m.peak, rms: Math.sqrt(m.energy / m.samples) }; });
    });
    assert(report.weatherDigital.every(m => m.rms > 1e-6 && m.peak < 1));
    await page.click('[data-solo="thunder"]');
    assert.equal(await page.$eval('[data-solo="thunder"]', e => e.getAttribute('aria-pressed')), 'true');
    await page.click('[data-solo="surf"]');
    assert.equal(await page.$eval('[data-solo="thunder"]', e => e.getAttribute('aria-pressed')), 'false');
    await page.click('#reset-layers');
    await page.click('[data-preset="Shoreline"]');
    assert.equal(await page.$eval('#rainIntensity', e => e.value), '0');
    assert.equal(await page.$eval('#surfLevel', e => e.value), '0.8');
    await page.click('[data-preset="Thunderstorm"]');
    assert.equal(await page.$eval('#thunderActivity', e => e.value), '0.65');
    assert(await page.$$eval('[data-solo]', buttons => buttons.every(b => b.getAttribute('aria-pressed') === 'false')));
    await page.click('[data-preset="Coastal storm"]');
    assert.equal(await page.$eval('#surfLevel', e => e.value), '0.9');
    assert.equal(await page.$eval('#thunderActivity', e => e.value), '0.45');
    await page.click('[data-preset="Open rain"]');
    assert.equal(await page.$eval('#impactTexture', e => e.value), '0.9');
    await page.evaluate(() => {
        const e = document.querySelector('#impactTexture'); e.value = 0; e.dispatchEvent(new Event('input'));
    });
    assert.equal(await page.$eval('#impactTexture-value', e => e.value), '0%');
    await page.evaluate(() => {
        const e = document.querySelector('#impactTexture'); e.value = 1; e.dispatchEvent(new Event('input'));
    });
    assert.equal(await page.$eval('#impactTexture-value', e => e.value), '100%');
    await page.click('[data-preset="Open rain"]');
    await page.screenshot({ path: out + '/desktop.png', fullPage: true });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: out + '/mobile.png', fullPage: true });
    if (!publicMode) {
        await page.click('[data-file="rain_band7_ref.wav"]');
        await page.waitForFunction(() => __rainContexts.at(-1).state === 'closed' && !document.querySelector('audio').paused);
        await page.click('[data-file="rain_band7_synth.wav"]');
        await page.waitForFunction(() => document.querySelector('audio').currentSrc.includes('synth.wav') && !document.querySelector('audio').paused);
        await page.select('#family', 'tin');
        await page.click('[data-new="drops"][data-material="tin"]');
        await page.waitForFunction(() => __rainContexts.at(-1).state === 'running');
        assert.equal(await page.$eval('#surface', e => e.value), 'tin');
        assert(await page.$eval('audio', e => e.paused));
        assert.equal(await page.evaluate(async () => (await fetch('/local-rain/bands/not-a-reference.wav')).status), 404);
    }
    // Repeated clicks while the module is loading must not leave a context running.
    await page.evaluate(() => { document.querySelector('#stop').click(); document.querySelector('#play').click(); document.querySelector('#stop').click(); });
    await page.waitForFunction(() => __rainContexts.every(c => c.state === 'closed'));
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Playing'));
    await page.click('#stop');
    await page.waitForFunction(() => __rainContexts.every(c => c.state === 'closed'));
    // Both preview buttons may be pressed while the worklet module is loading.
    await page.evaluate(() => { document.querySelector('[data-trigger="thunder"]').click(); document.querySelector('[data-trigger="surf"]').click(); });
    await page.waitForFunction(() => document.querySelector('#thunder-phase').textContent.includes('1 event')
        && document.querySelector('#surf-phase').textContent.includes('1 wave'));
    await page.click('#stop');
    await page.waitForFunction(() => __rainContexts.every(c => c.state === 'closed'));
    assert.equal(report.errors.length, 0, report.errors.join('\n'));
    assert(report.requests.every(url => url.startsWith('data:') || new URL(url).origin === origin), 'Unexpected external dependency');
    if (publicMode) assert(!report.requests.some(url => url.includes('/local-rain/')), 'Public page requested local recordings');
    report.passed = true;
    console.log(JSON.stringify({ passed: true, digital: report.digital, weatherDigital: report.weatherDigital, screenshots: out }, null, 2));
} catch (error) { report.failure = String(error); console.error(error); process.exitCode = 1; }
finally { await fs.writeFile(out + '/report.json', JSON.stringify(report, null, 2)); await browser.close(); }
