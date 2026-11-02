// Lists and downloads the University of Iowa Musical Instrument Samples (pre-2012 set: 16-bit 44.1 kHz mono chromatic scales at
// pp, mf and ff, input level constant within a session) into the git-ignored banks/iowa. https://theremin.music.uiowa.edu/mis.html -
// recordings "may be downloaded and used for any projects, without restrictions"; they ask to be told about projects that use them.
// Only tables derived from them ship, never the recordings. The post-2012 per-pitch set is ff only, so it is not used.
//
//   node tools/fetchIowa.mjs --list                    write banks/iowa/manifest.json and print each instrument's files and size
//   node tools/fetchIowa.mjs --only flute,oboe         download those instruments (default: everything in the manifest)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BASE = 'https://theremin.music.uiowa.edu/', ROOT = 'banks/iowa', MANIFEST = join(ROOT, 'manifest.json');
// id -> page. Unpitched percussion (cymbals, gongs, hand percussion, tambourines) is left out.
const PAGES = {
    flute: 'MISflute.html', 'alto-flute': 'MISaltoflute.html', 'bass-flute': 'MISbassflute.html', oboe: 'MISoboe.html',
    'eb-clarinet': 'MISEbclarinet.html', 'bb-clarinet': 'MISBbclarinet.html', 'bass-clarinet': 'MISbassclarinet.html', bassoon: 'MISbassoon.html',
    'soprano-sax': 'MISsopranosaxophone.html', 'alto-sax': 'MISaltosaxophone.html',
    horn: 'MISFrenchhorn.html', trumpet: 'MISBbtrumpet.html', 'tenor-trombone': 'MIStenortrombone.html', 'bass-trombone': 'MISbasstrombone.html', tuba: 'MIStuba.html',
    violin: 'MISviolin.html', viola: 'MISviola.html', cello: 'MIScello.html', 'double-bass': 'MISdoublebass.html',
    marimba: 'Mismarimba.html', xylophone: 'MISxylophone.html', vibraphone: 'Misvibraphone.html', bells: 'MISbells.html', crotales: 'MIScrotales.html', guitar: 'MISguitar.html',
};
// Techniques the page has no use for, and the guitar's stereo copies of its mono files.
export const SKIPPED = /\.(gliss|dampen|shortsustain|deadstroke|ambient)|\.silence\.|\.stereo\.|(^|\.)(cord)\./i;
const agent = { 'User-Agent': 'Mozilla/5.0' }, arg = (flag) => { const i = process.argv.indexOf(flag); return i < 0 ? null : process.argv[i + 1]; };
const resolve = (href) => new URL(href.replace(/ /g, '%20'), BASE).href;

async function pool(items, size, job) {
    const queue = [...items];
    await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await job(queue.shift()); }));
}

async function list() {
    const manifest = {};
    for (const [id, page] of Object.entries(PAGES)) {
        const html = await (await fetch(BASE + page, { headers: agent })).text();
        const hrefs = [...html.matchAll(/href="([^"]*\.aiff?)"/gi)].map((m) => m[1]);
        manifest[id] = [...new Set(hrefs)].map((href) => ({ url: resolve(href), file: decodeURIComponent(resolve(href).split('/').pop()) }));
        await pool(manifest[id], 6, async (entry) => {
            const head = await fetch(entry.url, { method: 'HEAD', headers: agent });
            entry.bytes = Number(head.headers.get('content-length')) || 0;
        });
        const mb = manifest[id].reduce((sum, e) => sum + e.bytes, 0) / 1e6;
        console.log(`${id.padEnd(16)} ${String(manifest[id].length).padStart(4)} files ${mb.toFixed(0).padStart(6)} MB  e.g. ${manifest[id][0]?.file}`);
    }
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
    console.log(`total ${(Object.values(manifest).flat().reduce((sum, e) => sum + e.bytes, 0) / 1e9).toFixed(2)} GB -> ${MANIFEST}`);
}

async function download() {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')), only = arg('--only')?.split(',');
    const files = Object.entries(manifest).filter(([id]) => !only || only.includes(id)).flatMap(([id, entries]) => entries.filter((e) => !SKIPPED.test(e.file)).map((e) => ({ ...e, path: join(ROOT, id, e.file) })));
    console.log(`${files.length} files, ${(files.reduce((sum, e) => sum + e.bytes, 0) / 1e9).toFixed(2)} GB`);
    let done = 0, failed = 0;
    await pool(files, 4, async (e) => {
        if (!existsSync(e.path)) {
            try {
                const response = await fetch(e.url, { headers: agent });
                if (!response.ok) throw new Error(response.status);
                mkdirSync(dirname(e.path), { recursive: true });
                writeFileSync(e.path, Buffer.from(await response.arrayBuffer()));
            } catch (error) { failed++; console.error(`failed ${e.file}: ${error.message}`); }
        }
        if (++done % 100 === 0) console.log(`${done} / ${files.length}`);
    });
    console.log(`${done - failed} of ${files.length} files in ${ROOT}`);
}

if (process.argv[1]?.endsWith("fetchIowa.mjs")) await (process.argv.includes('--list') ? list() : download());
