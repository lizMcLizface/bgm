// Drives the A/B panel of /synths/strings/ in headless Chrome and prints what it announces. Needs a dev server:
// node tools/smokeStringsAb.mjs [origin]
import puppeteer from 'puppeteer-core';
const origin = process.argv[2] ?? 'http://localhost:5173';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(origin + '/synths/strings/', { waitUntil: 'networkidle0' });
await page.click('.wake'); await page.waitForFunction(() => !document.querySelector('.wake'));
for (const patch of ['Long', 'Pizzicato']) {
    await page.evaluate((l) => [...document.querySelectorAll('nav.presets button')].find((b) => b.textContent === l).click(), patch);
    for (const label of ['Original → Model', 'Model', 'Original']) {
        await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent === t).click(), label);
        const seen = new Set();
        for (let i = 0; i < 24; i++) { await new Promise((r) => setTimeout(r, 400)); const s = await page.evaluate(() => document.querySelector('.row strong')?.textContent); if (s) seen.add(s); }
        console.log(patch.padEnd(10), label.padEnd(18), '->', [...seen].join(' | ') || '(nothing)');
    }
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
