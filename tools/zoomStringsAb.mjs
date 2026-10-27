// Zooms into the top part of the original and model spectrograms on /synths/strings/ (needs a dev server):
// node tools/zoomStringsAb.mjs out.png [patch=Long] [pitch=60] [strength=80] [fromSeconds=1] [toSeconds=3] [origin]
import puppeteer from 'puppeteer-core';
const flags = Object.fromEntries(process.argv.slice(2).map((a, i, all) => [a, all[i + 1]]).filter(([a]) => a.startsWith('--')).map(([a, v]) => [a.slice(2), +v]));
const [out, patch = 'Long', pitch = '60', strength = '80', from = '1', to = '3', origin = 'http://localhost:5173'] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
if (Object.keys(flags).length) await page.evaluateOnNewDocument((f, p) => { const { leaveOut, ...tuning } = f; localStorage.setItem('synths:strings', JSON.stringify({ tunings: { [p.toLowerCase()]: tuning }, ...(leaveOut === undefined ? {} : { abLeaveOut: leaveOut !== 0 }) })); }, flags, patch);   // --smear 0.7 --lineRatio 0.1 ...
await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 2 });
await page.goto(origin + '/synths/strings/', { waitUntil: 'networkidle0' });
await page.click('.wake'); await page.waitForFunction(() => !document.querySelector('.wake'));
await page.evaluate((l) => [...document.querySelectorAll('nav.presets button')].find((b) => b.textContent === l).click(), patch);
const abPanel = await page.evaluateHandle(() => [...document.querySelectorAll('section.group')].find((x) => x.querySelector('h3')?.textContent.startsWith('A/B')));
const selects = await abPanel.asElement().$$('select');   // the panel's own: Note, Strength, ... await selects[0].select(pitch); await selects[1].select(strength);
await page.waitForSelector('figure.spectrogram canvas', { timeout: 15000 }); await new Promise((r) => setTimeout(r, 800));
// draw the two canvases, cropped to the seconds asked and the top 40% (the highest harmonics), one above the other
const url = await page.evaluate((a, b, low, full) => {
    const figs = [...document.querySelectorAll('figure.spectrogram')], pick = (t) => figs.find((f) => f.querySelector('figcaption')?.textContent.startsWith(t)).querySelector('canvas'), [o, m] = [pick('Original'), pick('Model')], left = 44, w = o.width - left - 6, h = o.height - 24;
    const x0 = left + a / 6.2 * w, x1 = left + b / 6.2 * w, c = document.createElement('canvas'); const frac = full ? 1 : .4; c.width = (x1 - x0) * 3; c.height = (2 * h * frac + 8) * 3;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const y = low ? 6 + h * .6 : 6;
    g.drawImage(o, x0, y, x1 - x0, h * frac, 0, 0, c.width, h * frac * 3); g.drawImage(m, x0, y, x1 - x0, h * frac, 0, h * frac * 3 + 24, c.width, h * frac * 3);
    return c.toDataURL('image/png');
}, +from, +to, process.env.LOW === '1', process.env.FULL === '1');
import { writeFileSync } from 'node:fs';
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); await browser.close(); console.log('wrote', out);
