// Opens /synths/strings/ in headless Chrome, starts audio, plays a note on every patch and reports errors and the
// render times the page shows. Needs a dev server: node tools/smokeStringsPage.mjs [origin]
import puppeteer from 'puppeteer-core';
const origin = process.argv[2] ?? 'http://localhost:5190';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(origin + '/synths/strings/', { waitUntil: 'networkidle0' });
await page.click('.wake');
await page.waitForFunction(() => !document.querySelector('.wake'), { timeout: 10000 });
for (const label of ['Long', 'Live', 'Short', 'Pizzicato']) {
    await page.evaluate((l) => [...document.querySelectorAll('nav.presets button')].find((b) => b.textContent === l).click(), label);
    for (const key of ['a', 'g']) { await page.keyboard.down(key); await new Promise((r) => setTimeout(r, 500)); await page.keyboard.up(key); }
    await new Promise((r) => setTimeout(r, 400));
    const text = await page.evaluate(() => [...document.querySelectorAll('p.hint')].map((p) => p.textContent).find((t) => t.startsWith('Last note')));
    console.log(label.padEnd(10), text);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
