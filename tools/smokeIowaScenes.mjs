// Plays presets of the From Recordings category live in the real app, in headless Chrome, and reports what comes out and which instrument each role ended up on: a render
// goes through another path (offline, every note handed over at once), so it says nothing about notes booked ahead while playing. Needs a dev server.
//   node tools/smokeIowaScenes.mjs [origin] [seconds per preset]
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const origin = process.argv[2] ?? 'http://localhost:5173', seconds = Number(process.argv[3] ?? 8);
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const scenes = JSON.parse(readFileSync('src/library/scenes.json', 'utf8')).scenes.filter((s) => s.category === 'recordings' && !s.hidden);
const browser = await puppeteer.launch({ executablePath: process.env.SYNTH_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
let failed = 0;
try {
    for (const scene of scenes) {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.evaluateOnNewDocument(() => {
            localStorage.setItem('bgm-stage-v2', '7'); localStorage.setItem('bgm-tour-v2', 'true'); localStorage.setItem('bgm-backdrop', 'false');
        });
        await page.goto(`${origin}/?preset=${slug(scene.name)}&mediaHelper=0`, { waitUntil: 'networkidle2' });
        await page.waitForFunction((names) => names.every(([role, name]) => window.__generator?.roles[role]?.presetName === name) && !window.__generator.sourceLoads?.size, { timeout: 30000 }, Object.entries(scene.voices)).catch(() => errors.push('voices never loaded'));
        await page.waitForSelector('.gen-play', { timeout: 30000 });
        await page.waitForFunction(() => window.__bgm?.loadedName(), { timeout: 30000 });
        await page.click('.gen-play');
        await page.waitForFunction(() => window.__bgm.running(), { timeout: 30000 }).catch(() => errors.push('never started'));
        // each role's own output, so a silent instrument cannot hide behind the others
        const heard = await page.evaluate(async (ms) => {
            const g = window.__generator, data = new Float32Array(2048), meters = {}, end = performance.now() + ms, seen = {};
            for (const [role, r] of Object.entries(g.roles)) {
                if (role === 'perc') continue;
                const analyser = g.AC.createAnalyser();
                analyser.fftSize = 2048; r.tone.connect(analyser);
                meters[role] = { analyser, sum: 0, count: 0, top: 0, name: r.presetName, iowa: !!r.instrument.preset?.iowa };
            }
            while (performance.now() < end) {
                for (const m of Object.values(meters)) {
                    m.analyser.getFloatTimeDomainData(data);
                    for (const x of data) { m.sum += x * x; m.top = Math.max(m.top, Math.abs(x)); }
                    m.count += data.length;
                }
                for (const n of g.noteLog) seen[`${n.role}:${n.time}`] = n.role;
                await new Promise((resolve) => setTimeout(resolve, 40));
            }
            const notes = {};
            Object.values(seen).forEach((role) => { notes[role] = (notes[role] ?? 0) + 1; });
            return { state: g.AC.state, roles: Object.fromEntries(Object.entries(meters).map(([role, m]) => [role, { name: m.name, iowa: m.iowa, db: 10 * Math.log10(m.sum / Math.max(1, m.count) + 1e-12), top: 20 * Math.log10(m.top + 1e-6), notes: notes[role] ?? 0 }])) };
        }, seconds * 1000);
        const parts = Object.entries(scene.voices), wrong = parts.filter(([role, name]) => heard.roles[role]?.name !== name);
        // a role that booked notes and made no sound is the fault; one the composer left resting says nothing
        const dead = parts.filter(([role]) => heard.roles[role]?.notes > 0 && heard.roles[role].db < -70).map(([role]) => role), rested = parts.filter(([role]) => !heard.roles[role]?.notes).map(([role]) => role);
        if (dead.length || errors.length || wrong.length || heard.state !== 'running') failed++;
        console.log(`${scene.name.padEnd(32)} ${parts.map(([role]) => `${role} ${heard.roles[role].db.toFixed(0)} dB/${heard.roles[role].notes}n`).join('  ')}${rested.length ? `  (resting: ${rested.join(', ')})` : ''}${dead.length ? `  SILENT ${dead.join(', ')}` : ''}${wrong.length ? `  WRONG ${JSON.stringify(wrong)}` : ''}${errors.length ? `  errors: ${errors.slice(0, 2).join(' | ').slice(0, 220)}` : ''}`);
        await page.close();
    }
} finally {
    await browser.close();
}
console.log(failed ? `${failed} of ${scenes.length} presets failed` : `${scenes.length} presets played live on the instruments they name`);
process.exitCode = failed ? 1 : 0;
