// Records a stretch of a preset - an hour, say - as an MP3 and an MP4 that shows
// the timeline with its playhead at 30 fps, for demo videos and uploads.
//
//   npm run render -- --preset rainy-day --minutes 60
//   npm run render -- --link "https://calmbgm.com/?m=...&v=..." --minutes 10 --no-video
//   npm run render -- --list
//
// The sound is made by the page's own engine, so a headless Chrome renders
// it (tools/renderPage.js, through a Vite dev server this script starts) in
// one-minute chunks, faster than real time, and streams the samples into
// ffmpeg - never a WAV on disk. The video is drawn here with node-canvas,
// from the same plan, and muxed with the audio at the end. Needs Chrome (or
// Edge) and ffmpeg. Run through vite-node (see the npm script).

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { createFrameRenderer } from './videoFrame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `Usage: npm run render -- [options]

What to play (one of):
  --preset <name>      a built-in preset, by name or slug (--list shows them)
  --link <url>         a share link made on the page (library sounds only)
Options:
  --minutes <n>        length, default 60
  --seed <n>           another variation of the same preset (--phrase <words> works too)
  --wander <kind>      sine | brownian: how the voices drift (the preset's own by default)
  --ambience-wander <kind>  sine | brownian: how the ambient bed's levels drift
  --ending             end on the home chord instead of fading out
  --out <path>         output without extension, default renders/<preset>-<minutes>m
  --no-video           the MP3 only
  --no-audio           the MP4 without its sound... (video only; for testing the picture)
  --width <px>         video width, default 1680 (the height is 21:9: 720)
  --fps <n>            default 30
  --theme dark|light   default dark
  --mp3-quality <0-9>  LAME VBR quality, 0 best, default 2 (about 190 kbit/s)
  --chrome <path>      Chrome or Edge, if it is not found
  --ffmpeg <path>      ffmpeg, if it is not on the PATH
  --list               list the presets and exit`;

function parseArgs(argv) {
    const options = { minutes: 60, fps: 30, width: 1680, theme: 'dark', quality: 2, video: true, audio: true };
    const flags = new Set(['ending', 'no-video', 'no-audio', 'list', 'help']);
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
    options.quality = Number(options['mp3-quality'] ?? options.quality);
    if (!(options.minutes > 0) || !(options.fps > 0) || !(options.width >= 320)) throw new Error('--minutes, --fps and --width must be positive numbers');
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

function findFfmpeg(given) {
    const ffmpeg = given || process.env.FFMPEG || 'ffmpeg';
    const probe = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' });
    if (probe.error || probe.status !== 0) throw new Error('ffmpeg not found: install it or pass --ffmpeg <path>');
    return ffmpeg;
}

// An ffmpeg process whose stdin takes buffers, with back-pressure.
function startFfmpeg(ffmpeg, args) {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'ignore', 'inherit'] });
    const done = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
        child.stdin.on('error', () => {}); // surfaces as the exit code
    });
    return {
        async write(buffer) {
            if (!child.stdin.write(buffer)) await once(child.stdin, 'drain');
        },
        async end() {
            child.stdin.end();
            await done;
        },
        done,
        kill: () => child.kill(),
    };
}

const clock = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function progressLine(label) {
    const started = Date.now();
    return (fraction) => {
        const elapsed = (Date.now() - started) / 1000;
        const eta = fraction > 0.005 ? (elapsed / fraction) * (1 - fraction) : NaN;
        process.stdout.write(`\r${label} ${(fraction * 100).toFixed(1).padStart(5)}%  elapsed ${clock(elapsed)}  left ${Number.isFinite(eta) ? clock(eta) : '--:--:--'}   `);
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(HELP);
        return;
    }
    const ffmpeg = options.list ? null : findFfmpeg(options.ffmpeg);
    const query = new URLSearchParams();
    let hash = '';
    if (options.link) {
        const url = new URL(options.link, 'https://calmbgm.com/');
        url.searchParams.forEach((value, key) => query.set(key, value));
        hash = url.hash;
    } else if (options.preset) {
        query.set('preset', options.preset);
    } else if (!options.list) {
        console.log(HELP);
        throw new Error('Say what to play: --preset <name> or --link <url>');
    }
    if (options.seed) query.set('seed', options.seed);
    if (options.phrase) query.set('phrase', options.phrase);
    ['wander', 'ambience-wander'].forEach((key) => {
        if (!options[key]) return;
        if (!['sine', 'brownian'].includes(options[key])) throw new Error(`--${key} is sine or brownian`);
        query.set(key, options[key]);
    });

    const server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const browser = await puppeteer.launch({
        executablePath: findChrome(options.chrome),
        headless: true,
        protocolTimeout: 0, // a render takes as long as it takes
        args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--mute-audio'],
    });
    const cleanups = [];
    try {
        const page = await browser.newPage();
        page.on('pageerror', (error) => console.error('\n[page]', error.message));
        page.on('console', (message) => { if (message.type() === 'error') console.error('\n[page]', message.text()); });
        await page.goto(`${base}/tools/render.html?${query}${hash}`);
        await page.waitForFunction('window.bgmRenderReady === true', { timeout: 120000 });

        if (options.list) {
            const list = await page.evaluate(() => window.bgmRender.list());
            list.forEach((scene) => console.log(`${scene.slug.padEnd(40)} ${scene.name}  (${scene.category})`));
            return;
        }

        const info = await page.evaluate((theme) => window.bgmRender.setup({ theme }), options.theme);
        const seconds = Math.round(options.minutes * 60);
        const slug = info.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bgm';
        const out = path.resolve(options.out || path.join('renders', `${slug}-${options.minutes}m`));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        console.log(`${info.name}: ${clock(seconds)} at ${info.sampleRate} Hz, variation ${info.seed}`);
        if (!info.playMusic) console.log('(this preset is ambience only: the video will show an empty timeline)');

        const jobs = [];
        const mp3 = `${out}.mp3`;
        const silentVideo = `${out}.video.mp4`;

        if (options.audio) {
            const encoder = startFfmpeg(ffmpeg, [
                '-f', 's16le', '-ar', String(info.sampleRate), '-ac', '2', '-i', 'pipe:0',
                '-c:a', 'libmp3lame', '-q:a', String(options.quality), '-metadata', `title=${info.name}`, '-metadata', 'artist=calmbgm', mp3,
            ]);
            cleanups.push(() => encoder.kill());
            const report = progressLine('audio');
            await page.exposeFunction('bgmProgress', (fraction) => report(fraction));
            await page.exposeFunction('bgmChunk', (base64) => encoder.write(Buffer.from(base64, 'base64')));
            jobs.push((async () => {
                await page.evaluate((s, ending) => window.bgmRender.audio(s, ending), seconds, Boolean(options.ending));
                await encoder.end();
                console.log(`\nwrote ${mp3}`);
            })());
        }

        if (options.video) {
            const view = await page.evaluate((s, ending) => window.bgmRender.timeline(s, ending), seconds, Boolean(options.ending));
            const roles = Object.fromEntries(info.roles.map((role) => [role, info.presets[role]]));
            const frames = createFrameRenderer({ ...view, roles, colors: info.colors, outWidth: options.width - (options.width % 2) });
            const total = Math.round(seconds * options.fps);
            const encoder = startFfmpeg(ffmpeg, [
                '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${frames.width}x${frames.height}`, '-r', String(options.fps), '-i', 'pipe:0',
                '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'animation', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(options.fps), silentVideo,
            ]);
            cleanups.push(() => encoder.kill());
            jobs.push((async () => {
                const report = progressLine('video');
                for (let frame = 0; frame < total; frame++) {
                    await encoder.write(frames.frame(Math.min(seconds - 0.001, frame / options.fps)));
                    if (frame % 300 === 0) report(frame / total);
                }
                await encoder.end();
                report(1);
                console.log(`\nvideo drawn`);
            })());
        }

        await Promise.all(jobs);
        if (options.video) {
            const mp4 = `${out}.mp4`;
            const mux = options.audio
                ? ['-i', silentVideo, '-i', mp3, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]
                : ['-i', silentVideo, '-c', 'copy', '-movflags', '+faststart', mp4];
            const muxer = startFfmpeg(ffmpeg, mux);
            await muxer.end();
            fs.rmSync(silentVideo, { force: true });
            console.log(`wrote ${mp4}`);
        }
    } catch (error) {
        cleanups.forEach((cleanup) => cleanup());
        throw error;
    } finally {
        await browser.close();
        await server.close();
    }
}

main().then(() => process.exit(0), (error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
});
