// Opens the /synths/ hub in headless Chrome and checks it renders every card, with the Iowa one among them. No unit test imports the page, and
// one stray apostrophe in a card takes the whole hub down. Needs a dev server: node tools/smokeSynthsHome.mjs [origin]
import puppeteer from 'puppeteer-core';

const origin = process.argv[2] ?? 'http://localhost:5173';
const browser = await puppeteer.launch({ executablePath: process.env.SYNTH_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(origin + '/synths/', { waitUntil: 'networkidle0' });
    const text = await page.evaluate(() => document.body.innerText), iowa = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => /iowa\/?$/.test(a.getAttribute('href') ?? ''))?.getAttribute('href'));
    console.log('Iowa card:', /Iowa instruments/.test(text), 'link:', iowa);
    console.log('errors:', errors.length ? errors : 'none');
    if (errors.length || !iowa) process.exitCode = 1;
} finally {
    await browser.close();
}
