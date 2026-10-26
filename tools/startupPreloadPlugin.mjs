// Starts the Wasm engine's downloads with the page instead of one request-wave at a time.
//
// The engine used to be found as it was needed: index.html -> the app entry -> (after React mounted and the
// Generator existed) the engine chunk and its imports -> the Wasm kernels and worklet processors it asks for ->
// patch-transition.js, which fm-processor.js imports. On a high-latency link each of those is a round trip of
// about 150 ms, whatever the size of the files, so a page of small files took seconds.
//
// All of those names are known at build time. This plugin adds them to the main page's <head>, so the whole set
// is requested at once, in parallel with the entry. A device that chose the previous engine (or ?wasm=0) skips
// them: they are added by a small inline script that checks that first, so those visitors download nothing extra.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = '/'; // vite.config.js: served at the root of calmbgm.com
const KERNELS = [['core', 'core.wasm', 'processor.js'], ['fm', 'fm.wasm', 'fm-processor.js'], ['effects', 'effects.wasm', 'effects-processor.js'], ['inserts', 'inserts.wasm', 'inserts-processor.js']];
// small worklet processors the page registers at start (public/*.js, fixed names)
const WORKLETS = ['bitcrusher-processor.js', 'white-noise-processor.js', 'pink-noise-processor.js', 'brown-noise-processor.js', 'load-meter-processor.js?v=output-4'];

function closure(bundle, entry, skip) {
    const found = new Set();
    const visit = (name) => {
        if (found.has(name) || skip.has(name) || !bundle[name]) return;
        found.add(name);
        bundle[name].imports?.forEach(visit);
    };
    visit(entry);
    return [...found];
}

export function startupPreload() {
    return {
        name: 'startup-preload',
        transformIndexHtml: {
            order: 'post',
            handler(html, ctx) {
                if (ctx.path !== '/index.html' || !ctx.bundle) return undefined;
                const versions = JSON.parse(fs.readFileSync(path.join(root, 'src/synth-lab/kernelVersions.json'), 'utf8'));
                const links = [];
                // the engine's code: the chunk the app imports once it has chosen the engine, and what it imports
                const engine = Object.keys(ctx.bundle).find((name) => ctx.bundle[name].type === 'chunk' && ctx.bundle[name].name === 'wasmInstrument');
                if (engine) {
                    const already = new Set([...html.matchAll(/(?:href|src)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]));
                    for (const name of closure(ctx.bundle, engine, already)) links.push(['modulepreload', base + name]);
                }
                // its kernels (fetched and compiled) and their processors (loaded into the audio worklet);
                // the processors import patch-transition.js, which modulepreload fetches along with them
                for (const [kind, wasm, processor] of KERNELS) {
                    const v = '?v=' + versions[kind];
                    links.push(['preload', `${base}synth-lab/${wasm}${v}`, 'fetch', 'application/wasm']);
                    links.push(['modulepreload', `${base}synth-lab/${processor}${v}`]);
                }
                for (const file of WORKLETS) links.push(['modulepreload', base + file]);
                const weather = Object.keys(ctx.bundle).find((name) => /weatherBed\.worklet-.*\.js$/.test(name));
                if (weather) links.push(['modulepreload', base + weather]);
                const script = `<script>(function(){try{if(localStorage.getItem('bgm-audio-engine')==='legacy'||/[?&]wasm=0/.test(location.search))return;}catch(e){}`
                    + `[${links.map((l) => JSON.stringify(l)).join(',')}].forEach(function(l){var e=document.createElement('link');e.rel=l[0];e.crossOrigin='';e.href=l[1];`
                    + `if(l[2])e.as=l[2];if(l[3])e.type=l[3];document.head.appendChild(e);});})();</script>`;
                return html.replace('</title>', `</title>\n    ${script}`);
            },
        },
    };
}
