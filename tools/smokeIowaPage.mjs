// Opens /synths/iowa/ in headless Chrome, starts audio, plays every instrument through the page and measures what actually came out of it,
// and reports errors. Needs a dev server: node tools/smokeIowaPage.mjs [origin] [screenshot.png]
import puppeteer from 'puppeteer-core';

const origin = process.argv[2] ?? 'http://localhost:5173', shot = process.argv[3];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await puppeteer.launch({ executablePath: process.env.SYNTH_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
try {
    const page = await browser.newPage(), errors = [];
    await page.setViewport({ width: 1280, height: 1000 });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // Every AudioContext the page makes gets an analyser on its output, where this script can read it.
    await page.evaluateOnNewDocument(() => {
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function patched(target, ...rest) {
            if (target instanceof AudioDestinationNode) {
                const context = target.context;
                if (!context.tap) { context.tap = context.createAnalyser(); context.tap.fftSize = 1024; window.__tap = context.tap; }
                connect.call(this, context.tap);
            }
            return connect.call(this, target, ...rest);
        };
    });
    await page.goto(origin + '/synths/iowa/', { waitUntil: 'networkidle0' });
    await page.click('.wake');
    await page.waitForFunction(() => !document.querySelector('.wake'), { timeout: 20000 });
    // Room off: a reverb tail would read as sound before the next press has made any.
    await page.evaluate(() => {
        const slider = [...document.querySelectorAll('label')].find((l) => l.textContent.startsWith('Room')).querySelector('input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '0');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const names = await page.evaluate(() => [...document.querySelectorAll('section.group nav.presets button')].map((b) => b.textContent).filter((t) => !['pp', 'mf', 'ff', 'Model', 'Original recording'].includes(t)));
    const silent = [];
    for (const name of names) {
        await page.evaluate((label) => [...document.querySelectorAll('nav.presets button')].find((b) => b.textContent === label).click(), name);
        const loaded = await page.waitForFunction(() => /Plays \S+ to \S+\./.test(document.querySelector('.iowa')?.textContent ?? ''), { timeout: 8000 }).then(() => true, () => false);
        if (!loaded) { console.log(name, 'did not load:', await page.evaluate(() => [...document.querySelectorAll('p.hint')].map((p) => p.textContent).join(' | ').slice(0, 300)), errors.slice(-3)); silent.push(name); continue; }
        const range = await page.evaluate(() => /Plays (\S+) to (\S+)\./.exec(document.querySelector('.iowa').textContent)?.slice(1, 3).join('-'));
        // A key in the middle of the instrument's range and in view: the keys follow the instrument, but not always to its middle.
        const midi = await page.evaluate((text) => {
            const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'], at = (name) => NAMES.indexOf(name.slice(0, -1)) + 12 * (Number(name.slice(-1)) + 1);
            const [low, high] = text.split('-').map(at), keys = [...document.querySelectorAll('[data-note]')].map((k) => Number(k.dataset.note)), middle = (low + high) / 2;
            return keys.reduce((best, k) => (Math.abs(k - middle) < Math.abs(best - middle) ? k : best));
        }, range);
        const box = await page.evaluate((note) => { const r = document.querySelector(`[data-note="${note}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * .99 }; }, midi);     // the front edge of a key is full velocity, as the levels are set
        await page.mouse.move(box.x, box.y);
        await page.mouse.down();
        // How soon sound comes out of the page after the press, and how loud it gets over the next second, slow bows included.
        const heard = await page.evaluate(async () => {
            const a = window.__tap, data = new Float32Array(a.fftSize), started = performance.now();
            let first = null, top = -120;
            while (performance.now() - started < 1200) {
                a.getFloatTimeDomainData(data);
                const level = 10 * Math.log10(data.reduce((sum, v) => sum + v * v, 0) / data.length + 1e-12);
                if (first === null && level > -70) first = performance.now() - started;
                top = Math.max(top, level);
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
            return { first, top };
        });
        const level = heard.top;
        const message = await page.evaluate(() => [...document.querySelectorAll('p.hint')].map((p) => p.textContent).join(' '));
        await page.mouse.up();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => { const a = window.__tap, d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); return Math.max(...d.map(Math.abs)) < 1e-4; }, { timeout: 3000 }).catch(() => {});
        const outside = /outside this instrument/.test(message);
        if (level < -60 && !outside) silent.push(name);
        console.log(`${name.padEnd(28)} ${String(range).padEnd(12)} key ${midi}: top ${level.toFixed(1)} dB, sound after ${heard.first === null ? '-' : Math.round(heard.first) + ' ms'}${outside ? ' (outside range)' : ''}`);
    }
    if (shot) await page.screenshot({ path: shot });
    console.log(`${names.length} instruments; silent: ${silent.length ? silent.join(', ') : 'none'}`);
    console.log('errors:', errors.length ? errors : 'none');
} finally {
    await browser.close();
}
