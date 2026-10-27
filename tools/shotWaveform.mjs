// Screenshots the waveform view of the A/B panel on /synths/strings/ (needs a dev server):
// node tools/shotWaveform.mjs out.png [patch=Long] [pitch=60] [strength=80] [ms=120] [leaveOut=1] [phase=random|pulse|minimum] [startMs=0] [origin]
import puppeteer from 'puppeteer-core';
const [out, patch = 'Long', pitch = '60', strength = '80', ms = '120', leaveOut = '1', phase = 'random', start = '0', origin = 'http://localhost:5173'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 1400 });
await page.evaluateOnNewDocument((ms, lo, ph, st, p) => localStorage.setItem('synths:strings', JSON.stringify({ abWaveMs: +ms, abWaveStart: +st, abLeaveOut: lo !== '0', tunings: { [p.toLowerCase()]: { phase: ph } } })), ms, leaveOut, phase, start, patch);
await page.goto(origin + '/synths/strings/', { waitUntil: 'networkidle0' });
await page.click('.wake'); await page.waitForFunction(() => !document.querySelector('.wake'));
await page.evaluate((l) => [...document.querySelectorAll('nav.presets button')].find((b) => b.textContent === l).click(), patch);
const abPanel = await page.evaluateHandle(() => [...document.querySelectorAll('section.group')].find((x) => x.querySelector('h3')?.textContent.startsWith('A/B')));
const selects = await abPanel.asElement().$$('select');   // the panel's own: Note, Strength, ... await selects[0].select(pitch); await selects[1].select(strength);
await page.waitForSelector('figure.spectrogram canvas', { timeout: 15000 }); await new Promise((r) => setTimeout(r, 900));
const fig = await page.evaluateHandle(() => document.querySelector('figure.spectrogram'));
await fig.asElement().screenshot({ path: out }); await browser.close(); console.log('wrote', out);
