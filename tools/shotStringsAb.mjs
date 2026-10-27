// Screenshots the A/B spectrogram panel of /synths/strings/ for a patch, pitch and strength (needs a dev server):
// node tools/shotStringsAb.mjs out.png [patch=Long] [pitch=48] [strength=80] [origin]
import puppeteer from 'puppeteer-core';
const [out, patch = 'Long', pitch = '48', strength = '80', origin = 'http://localhost:5173'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(), errors = [];
await page.setViewport({ width: 1100, height: 1400 });
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(origin + '/synths/strings/', { waitUntil: 'networkidle0' });
await page.click('.wake'); await page.waitForFunction(() => !document.querySelector('.wake'));
await page.evaluate((l) => [...document.querySelectorAll('nav.presets button')].find((b) => b.textContent === l).click(), patch);
const abPanel = await page.evaluateHandle(() => [...document.querySelectorAll('section.group')].find((x) => x.querySelector('h3')?.textContent.startsWith('A/B')));
const selects = await abPanel.asElement().$$('select');   // the panel's own: Note, Strength, ...
await selects[0].select(pitch); await selects[1].select(strength);
await page.waitForSelector('figure.spectrogram canvas', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 800));
const panel = await page.evaluateHandle(() => [...document.querySelectorAll('section.group')].find((s) => s.querySelector('h3')?.textContent.startsWith('A/B')));
await panel.asElement().screenshot({ path: out });
console.log('table:', await page.evaluate(() => [...document.querySelectorAll('table.levels tr')].map((r) => [...r.children].map((c) => c.textContent).join(' | ')).join('\n')));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
