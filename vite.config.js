import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages redirects /labs/strings to /labs/strings/; Vite's dev and preview
// servers instead fall back to the main app. Mirror the Pages redirect locally.
function directorySlash() {
    const redirect = dir => (req, res, next) => {
        const [pathname, query = ''] = req.url.split('?');
        if (/^\/[\w-]+(\/[\w-]+)*$/.test(pathname) && fs.existsSync(path.join(dir, pathname, 'index.html'))) {
            res.statusCode = 301;
            res.setHeader('Location', pathname + '/' + (query ? '?' + query : ''));
            res.end();
            return;
        }
        next();
    };
    return {
        name: 'directory-slash',
        configureServer(server) { server.middlewares.use(redirect(server.config.root)); },
        configurePreviewServer(server) { server.middlewares.use(redirect(path.resolve(server.config.root, server.config.build.outDir))); },
    };
}

// The /synths pages are a personal sandbox for learning how classic synths work, not
// part of the public site. `vite build` includes them (dist/, for the local and tablet
// preview); `vite build --mode public` (used by deploy) leaves out their pages and the
// engine files Vite copies from public/synths, and writes to dist-public/.
const SYNTH_PAGES = { synths:'synths/index.html', synthCs80:'synths/cs80/index.html', synthJuno:'synths/juno/index.html', synthProphet5:'synths/prophet5/index.html', synthJupiter8:'synths/jupiter8/index.html', synthMinimoog:'synths/minimoog/index.html', synthDx7:'synths/dx7/index.html', synthObxa:'synths/obxa/index.html', synthVs:'synths/vs/index.html', synthTr808:'synths/tr808/index.html', synthTr909:'synths/tr909/index.html', synthTr606:'synths/tr606/index.html', synthTb303:'synths/tb303/index.html' };
function dropPrivateFiles(outDir) {
    return { name: 'drop-private-files', apply: 'build', closeBundle() { fs.rmSync(path.join(outDir, 'synths'), { recursive: true, force: true }); } };
}

// Your own factory banks for the /synths pages, auto-loaded on your machine only. They live in the
// git-ignored banks/<synth>/ folders. The dev and preview servers serve them at /local-banks/ (plus
// an index.json), and a local `vite build` copies them into dist/local-banks/ so any static server of
// dist/ has them too. The public build (deploy) never includes them; tools/checkPublicBuild.mjs
// refuses a deploy that does.
const BANKS_DIR = 'banks', BANKS_URL = 'local-banks';
function bankIndex() {
    if (!fs.existsSync(BANKS_DIR)) return {};
    const index = {};
    for (const synth of fs.readdirSync(BANKS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())) {
        const files = fs.readdirSync(path.join(BANKS_DIR, synth.name)).filter(f => /\.(syx|wav|json)$/i.test(f)).sort();
        if (files.length) index[synth.name] = files.map(f => ({ name: f, url: `${BANKS_URL}/${synth.name}/${encodeURIComponent(f)}` }));
    }
    return index;
}
function localBanks(isPublic) {
    const serve = (req, res, next) => {
        const [pathname] = req.url.split('?');
        if (!pathname.startsWith(`/${BANKS_URL}/`)) return next();
        const rel = decodeURIComponent(pathname.slice(BANKS_URL.length + 2));
        if (rel === 'index.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(bankIndex())); return; }
        const file = path.resolve(BANKS_DIR, rel);
        // only plain files inside banks/
        if (!file.startsWith(path.resolve(BANKS_DIR) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
    };
    return {
        name: 'local-banks',
        configureServer(server) { server.middlewares.use(serve); },
        configurePreviewServer(server) { server.middlewares.use(serve); },
        apply(_, env) { return env.command === 'serve' || !isPublic; },
        writeBundle(options) {
            if (isPublic) return;
            const out = path.join(options.dir, BANKS_URL), index = bankIndex();
            fs.rmSync(out, { recursive: true, force: true });
            if (!Object.keys(index).length) return;
            for (const [synth, files] of Object.entries(index)) {
                fs.mkdirSync(path.join(out, synth), { recursive: true });
                for (const f of files) fs.copyFileSync(path.join(BANKS_DIR, synth, f.name), path.join(out, synth, f.name));
            }
            fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
        },
    };
}

// Served at the root of calmbgm.com (GitHub Pages with a custom domain:
// public/CNAME). Asset and worklet URLs still go through
// import.meta.env.BASE_URL, so a sub-path deploy only needs `base` changed.
export default defineConfig(({ mode }) => {
  const isPublic = mode === 'public', outDir = isPublic ? 'dist-public' : 'dist';
  return {
    base: '/',
    plugins: [react(), directorySlash(), localBanks(isPublic), ...(isPublic ? [dropPrivateFiles(outDir)] : [])],
    build: {
        outDir,
        rollupOptions: { input: { main: 'index.html', percussion: 'tools/percussion-engine.html', audioOutput: 'tools/audio-output.html', labs:'labs/index.html', labAll:'labs/all/index.html', labStrings:'labs/strings/index.html', labKeys:'labs/keys/index.html', labChoir:'labs/choir/index.html', labOrgans:'labs/organs/index.html', labDrones:'labs/drones/index.html', labBass:'labs/bass/index.html', labPlucks:'labs/plucks/index.html', labWinds:'labs/winds/index.html', labLeads:'labs/leads/index.html', labPads:'labs/pads/index.html', ...(isPublic ? {} : SYNTH_PAGES), synthLab: 'tools/synth-lab.html', currentSynth: 'tools/current-synth.html', effectsLab:'tools/effects.html', fmLab:'tools/fm.html', ensembleSynth:'tools/ensemble-synth.html', spectrum:'tools/spectrum.html', quality:'tools/quality.html', tone:'tools/tone.html', modulation:'tools/modulation.html', instrumentEffects:'tools/instrument-effects.html', acoustic:'tools/acoustic.html', sources:'tools/sources.html', behavior:'tools/behavior.html', stress:'tools/stress.html' } },
    },
    test: {
        environment: 'jsdom',
        globals: true,
    },
  };
});
