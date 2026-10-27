// How long the page takes to have every key ready, and how long it freezes while doing so (longest gap between animation frames).
// Needs a dev server: node tools/timeStringsWarm.mjs [patch=Long] [origin=http://localhost:5173]
import puppeteer from 'puppeteer-core';
const [patch = 'Long', origin = 'http://localhost:5173'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(origin + '/synths/strings/', { waitUntil: 'networkidle0' });
await page.evaluate(() => { window.__gap = 0; let last = performance.now(); const tick = (now) => { window.__gap = Math.max(window.__gap, now - last); last = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
await page.click('.wake'); await page.waitForFunction(() => !document.querySelector('.wake'), { timeout: 10000 });
await page.evaluate((l) => [...document.querySelectorAll('nav.presets button')].find((b) => b.textContent === l).click(), patch);
const started = Date.now();
await new Promise((r) => setTimeout(r, 600));
await page.waitForFunction(() => ![...document.querySelectorAll('span.hint')].some((s) => s.textContent.startsWith('Preparing')), { timeout: 120000 });
console.log(`${patch}: all keys ready ${((Date.now() - started) / 1000).toFixed(1)} s after the patch was chosen; longest frame gap ${Math.round(await page.evaluate(() => window.__gap))} ms; errors: ${errors.length ? errors : 'none'}`);
await browser.close();
