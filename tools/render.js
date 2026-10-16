// Records a stretch of a preset - an hour, say - as an MP3 and an MP4 that shows
// the timeline with its playhead at 30 fps, for demo videos and uploads. One
// preset, several, or all of them, a few at a time.
//
//   npm run render -- --preset rainy-cafe --minutes 60
//   npm run render -- --all --minutes 10 --jobs 4
//   npm run render -- --link "https://calmbgm.com/?m=...&v=..." --minutes 10 --no-video
//   npm run render -- --list
//
// The sound is made by the page's own engine, so a headless Chrome renders
// it (tools/renderPage.js, through a Vite dev server this script starts) in
// one-minute chunks, faster than real time, and streams the samples into
// ffmpeg - never a WAV on disk. The video is drawn in a process of its own
// (tools/videoJob.js, node-canvas) from the same plan, and muxed with the
// audio at the end. Each running job has a browser and a video process, so
// several go in parallel. Needs Chrome (or Edge) and ffmpeg. Run through
// vite-node (see the npm script).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { findFfmpeg, startFfmpeg } from './ffmpeg.js';
import { Board, clock } from './board.js';
import { SCENES, SCENE_CATEGORIES, sceneSlug } from '../src/app/scenes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITE_NODE = path.join(ROOT, 'node_modules', 'vite-node', 'vite-node.mjs');
const DEFAULT_JOBS = Math.min(4, Math.max(1, Math.floor(os.cpus().length / 3)));

const HELP = `Usage: npm run render -- [options]

What to play (one of):
  --preset <name,...>  built-in presets, by name or slug, comma separated (--list shows them)
  --all                every built-in preset (--category <id> for one category)
  --link <url>         a share link made on the page (library sounds only)
Options:
  --minutes <n>        length, default 60
  --jobs <n>           renders running at once, default ${DEFAULT_JOBS} (each takes a browser, a video process and ffmpeg)
  --skip-existing      leave presets that already have their files (to carry on after a stop)
  --seed <n>           another variation (--phrase <words> works too)
  --wander <kind>      sine | brownian: how the voices drift (the preset's own by default)
  --ambience-wander <kind>  sine | brownian: how the ambient bed's levels drift
  --ending             end on the home chord instead of fading out
  --out-dir <dir>      where the files go, default renders (named <preset>-<minutes>m)
  --out <path>         one render's files, without extension
  --no-video           the MP3 only (an ambience-only preset's video shows its layers' levels drifting)
  --no-audio           the MP4 without its sound (for testing the picture)
  --width <px>         video width, default 1680 (the height is 21:9: 720)
  --fps <n>            default 30
  --theme dark|light   default dark
  --mp3-quality <0-9>  LAME VBR quality, 0 best, default 2 (about 190 kbit/s)
  --chrome <path>      Chrome or Edge, if it is not found
  --ffmpeg <path>      ffmpeg, if it is not on the PATH
  --list               list the presets and exit`;

function parseArgs(argv) {
    const options = { minutes: 60, fps: 30, width: 1680, theme: 'dark', quality: 2, video: true, audio: true, jobs: DEFAULT_JOBS };
    const flags = new Set(['ending', 'no-video', 'no-audio', 'list', 'help', 'all', 'skip-existing']);
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}`);
        const key = arg.slice(2);
        if (flags.has(key)) {
            options[key] = true;
        } else {
            if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
            options[key] = argv[++i];
        }
    }
    if (options['no-video']) options.video = false;
    if (options['no-audio']) options.audio = false;
    options.minutes = Number(options.minutes);
    options.fps = Number(options.fps);
    options.width = Number(options.width);
    options.jobs = Number(options.jobs);
    options.quality = Number(options['mp3-quality'] ?? options.quality);
    if (!(options.minutes > 0) || !(options.fps > 0) || !(options.width >= 320) || !(options.jobs >= 1)) throw new Error('--minutes, --fps, --width and --jobs must be positive numbers');
    ['wander', 'ambience-wander'].forEach((key) => {
        if (options[key] && !['sine', 'brownian'].includes(options[key])) throw new Error(`--${key} is sine or brownian`);
    });
    return options;
}

function findChrome(given) {
    const candidates = [
        given, process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) throw new Error('Chrome or Edge not found: pass --chrome <path>');
    return found;
}

const slugOf = (name) => sceneSlug(name) || 'bgm';

// What to render: [{ label, query }].
function targets(options) {
    const extra = new URLSearchParams();
    if (options.seed) extra.set('seed', options.seed);
    if (options.phrase) extra.set('phrase', options.phrase);
    ['wander', 'ambience-wander'].forEach((key) => { if (options[key]) extra.set(key, options[key]); });
    const withExtra = (query) => { extra.forEach((value, key) => query.set(key, value)); return query; };
    if (options.link) {
        const url = new URL(options.link, 'https://calmbgm.com/');
        const query = new URLSearchParams(url.search);
        return [{ label: 'link', query: withExtra(query), hash: url.hash }];
    }
    if (options.all) {
        if (options.category && !SCENE_CATEGORIES.some((c) => c.id === options.category)) {
            throw new Error(`No category ${options.category}: ${SCENE_CATEGORIES.map((c) => c.id).join(', ')}`);
        }
        return SCENES.filter((scene) => !options.category || scene.category === options.category)
            .map((scene) => ({ label: scene.name, query: withExtra(new URLSearchParams({ preset: sceneSlug(scene.name) })), hash: '' }));
    }
    if (options.preset) {
        return options.preset.split(',').map((name) => name.trim()).filter(Boolean)
            .map((name) => ({ label: name, query: withExtra(new URLSearchParams({ preset: name })), hash: '' }));
    }
    return null;
}

// Closes a browser, and kills it if it takes its time (a closing Chrome can idle for minutes).
async function closeBrowser(browser) {
    const process = browser.process();
    await Promise.race([browser.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (process && process.exitCode === null) process.kill();
}

/**
 * One render: its own browser for the audio, its own process for the video.
 * `ctx` is what the jobs share: options, the dev server's address, ffmpeg, Chrome's path, the progress board.
 */
async function renderOne(target, ctx, cleanups) {
    const { options, base, ffmpeg, chrome, board } = ctx;
    const row = board.add(target.label, { audio: options.audio, video: options.video });
    const seconds = Math.round(options.minutes * 60);
    const mine = [];
    const track = (fn) => { mine.push(fn); cleanups.add(fn); };
    let browser = null;
    const files = [];
    try {
        // (an existing result is known by the preset's name, before a browser is needed)
        const name = options.out ? null : slugOf(target.label);
        const dir = path.resolve(options['out-dir'] || 'renders');
        const guess = options.out ? path.resolve(options.out) : path.join(dir, `${name}-${options.minutes}m`);
        if (options['skip-existing'] && (!options.video || fs.existsSync(`${guess}.mp4`)) && (!options.audio || fs.existsSync(`${guess}.mp3`))) {
            row.set({ status: 'skipped', audio: options.audio ? 1 : null, video: options.video ? 1 : null });
            return { target, skipped: true };
        }

        row.set({ status: 'starting' });
        browser = await puppeteer.launch({
            executablePath: chrome,
            headless: true,
            protocolTimeout: 0, // a render takes as long as it takes
            args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--mute-audio'],
        });
        track(() => closeBrowser(browser));
        const page = await browser.newPage();
        page.on('pageerror', (error) => board.log(`[${target.label}] ${error.message}`));
        page.on('console', (message) => {
            if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) board.log(`[${target.label}] ${message.text()}`);
        });
        await page.goto(`${base}/tools/render.html?${target.query}${target.hash || ''}`);
        await page.waitForFunction('window.bgmRenderReady === true', { timeout: 120000 });
        const info = await page.evaluate((theme) => window.bgmRender.setup({ theme }), options.theme);
        row.set({ label: info.name });

        const out = options.out ? path.resolve(options.out) : path.join(dir, `${slugOf(info.name)}-${options.minutes}m`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const mp3 = `${out}.mp3`;
        const silentVideo = `${out}.video.mp4`;
        const planFile = `${out}.plan.json`;
        const wantVideo = options.video;
        row.set({ status: 'rendering' });
        const jobs = [];

        if (options.audio) {
            const encoder = startFfmpeg(ffmpeg, [
                '-f', 's16le', '-ar', String(info.sampleRate), '-ac', '2', '-i', 'pipe:0',
                '-c:a', 'libmp3lame', '-q:a', String(options.quality), '-metadata', `title=${info.name}`, '-metadata', 'artist=calmbgm', mp3,
            ]);
            track(() => encoder.kill());
            await page.exposeFunction('bgmProgress', (fraction) => row.set({ audio: fraction }));
            await page.exposeFunction('bgmChunk', (base64) => encoder.write(Buffer.from(base64, 'base64')));
            files.push(mp3);
            jobs.push((async () => {
                await page.evaluate((s, ending) => window.bgmRender.audio(s, ending), seconds, Boolean(options.ending));
                await encoder.end();
                row.set({ audio: 1 });
            })());
        }

        if (wantVideo) {
            // an ambience-only preset has no notes to draw: its layers' levels are drawn instead
            const view = info.playMusic ? await page.evaluate((s, ending) => window.bgmRender.timeline(s, ending), seconds, Boolean(options.ending)) : {};
            const roles = Object.fromEntries(info.roles.map((role) => [role, info.presets[role]]));
            const plan = info.playMusic ? { ...view, roles, colors: info.colors } : { ambience: { ...info.ambience, name: info.name }, colors: info.colors };
            fs.writeFileSync(planFile, JSON.stringify({ plan, ffmpeg, out: silentVideo, fps: options.fps, width: options.width - (options.width % 2), seconds }));
            files.push(planFile, silentVideo);
            jobs.push(new Promise((resolve, reject) => {
                const child = spawn(process.execPath, [VITE_NODE, path.join(ROOT, 'tools', 'videoJob.js'), planFile], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
                track(() => child.kill());
                child.on('message', (message) => { if (message.progress !== undefined) row.set({ video: message.progress }); });
                child.on('error', reject);
                child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`the video process exited with ${code}`))));
            }));
        }

        await Promise.all(jobs);
        await closeBrowser(browser);
        browser = null;
        if (wantVideo) {
            row.set({ status: 'muxing' });
            const mp4 = `${out}.mp4`;
            const mux = options.audio
                ? ['-i', silentVideo, '-i', mp3, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]
                : ['-i', silentVideo, '-c', 'copy', '-movflags', '+faststart', mp4];
            await startFfmpeg(ffmpeg, mux).end();
            fs.rmSync(silentVideo, { force: true });
            fs.rmSync(planFile, { force: true });
        }
        row.set({ status: 'done', audio: options.audio ? 1 : null, video: wantVideo ? 1 : null });
        board.log(`done: ${out}.${[options.audio ? 'mp3' : null, wantVideo ? 'mp4' : null].filter(Boolean).join(' / ')}`);
        return { target, out };
    } catch (error) {
        files.forEach((file) => fs.rmSync(file, { force: true }));
        row.set({ status: 'failed' });
        board.log(`failed: ${target.label}: ${error.message}`);
        return { target, error };
    } finally {
        if (browser) await closeBrowser(browser);
        mine.forEach((fn) => cleanups.delete(fn));
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(HELP);
        return 0;
    }
    if (options.list) {
        SCENES.forEach((scene) => console.log(`${sceneSlug(scene.name).padEnd(40)} ${scene.name}  (${scene.category})`));
        return 0;
    }
    const list = targets(options);
    if (!list || !list.length) {
        console.log(HELP);
        throw new Error('Say what to play: --preset <name>, --all or --link <url>');
    }
    if (options.out && list.length > 1) throw new Error('--out is for one render; use --out-dir for several');
    const ffmpeg = findFfmpeg(options.ffmpeg);
    const chrome = findChrome(options.chrome);

    const server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const board = new Board();
    const cleanups = new Set();
    const started = Date.now();
    const stop = () => {
        cleanups.forEach((fn) => fn());
        process.exit(130);
    };
    process.on('SIGINT', stop);

    const jobs = Math.min(options.jobs, list.length);
    console.log(`${list.length} render${list.length > 1 ? 's' : ''} of ${clock(options.minutes * 60)}, ${jobs} at a time`);
    const results = [];
    const queue = [...list];
    const ctx = { options, base, ffmpeg, chrome, board };
    await Promise.all(Array.from({ length: jobs }, async () => {
        while (queue.length) results.push(await renderOne(queue.shift(), ctx, cleanups));
    }));
    board.finish();
    await server.close();

    const failed = results.filter((r) => r.error);
    const skipped = results.filter((r) => r.skipped);
    console.log(`\n${results.length - failed.length - skipped.length} done${skipped.length ? `, ${skipped.length} skipped` : ''}${failed.length ? `, ${failed.length} failed` : ''} in ${clock((Date.now() - started) / 1000)}`);
    failed.forEach((r) => console.log(`  failed: ${r.target.label}: ${r.error.message}`));
    return failed.length ? 1 : 0;
}

main().then((code) => process.exit(code), (error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
});
