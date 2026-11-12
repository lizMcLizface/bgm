import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { localRainReferences } from './tools/rainReferencesPlugin.mjs';
import { startupPreload } from './tools/startupPreloadPlugin.mjs';
import { moduleAssetUrl } from './tools/moduleAssetUrls.mjs';
import { surveyPages } from './tools/surveyPages.mjs';

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

// The public /synths comparison pages include the engine and explicitly exported
// YAML banks in public/synth-presets/. Raw banks/ and listening references stay local.
const SYNTH_PAGES = { synthEnsemble:'synths/ensemble/index.html', synthAll:'synths/all/index.html', synthEffects:'synths/effects/index.html', synthPoly:'synths/poly/index.html', synthFm:'synths/fm/index.html', synths:'synths/index.html', synthCs80:'synths/cs80/index.html', synthJuno:'synths/juno/index.html', synthProphet5:'synths/prophet5/index.html', synthJupiter8:'synths/jupiter8/index.html', synthMinimoog:'synths/minimoog/index.html', synthDx7:'synths/dx7/index.html', synthObxa:'synths/obxa/index.html', synthVs:'synths/vs/index.html', synthWt:'synths/wt/index.html', synthTr808:'synths/tr808/index.html', synthTr909:'synths/tr909/index.html', synthTr606:'synths/tr606/index.html', synthTr707:'synths/tr707/index.html', synthTb303:'synths/tb303/index.html', synthPiano:'synths/piano/index.html', synthStrings:'synths/strings/index.html', synthIowa:'synths/iowa/index.html' };

// Your own factory banks for the /synths pages, auto-loaded on your machine only. They live in the
// git-ignored banks/<synth>/ folders. The dev and preview servers serve them at /local-banks/ (plus
// an index.json), and a local `vite build` copies them into dist/local-banks/ so any static server of
// dist/ has them too. The public build (deploy) never includes them; tools/checkPublicBuild.mjs
// refuses a deploy containing raw banks. Public comparison banks are separately
// allowlisted by tools/buildSynthPresets.mjs and published as YAML.
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
        apply() { return !isPublic; },
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
    experimental: { renderBuiltUrl: moduleAssetUrl },
    plugins: [react(), directorySlash(), surveyPages(), localBanks(isPublic), localRainReferences(isPublic), startupPreload(),
        // DEV_HTTPS=1 serves the dev server over a self-signed certificate: other devices on the network need a secure origin for AudioWorklet
        ...(process.env.DEV_HTTPS ? [basicSsl()] : [])],
    build: {
        outDir,
        rollupOptions: { input: { main: 'index.html', ambient: 'ambient/index.html', generatorSurvey:'tools/survey_generator/index.html', percussion: 'tools/percussion-engine.html', audioOutput: 'tools/audio-output.html', labs:'labs/index.html', labAll:'labs/all/index.html', labStrings:'labs/strings/index.html', labKeys:'labs/keys/index.html', labChoir:'labs/choir/index.html', labOrgans:'labs/organs/index.html', labDrones:'labs/drones/index.html', labBass:'labs/bass/index.html', labPlucks:'labs/plucks/index.html', labWinds:'labs/winds/index.html', labLeads:'labs/leads/index.html', labPads:'labs/pads/index.html', labLevels:'labs/levels/index.html', ...SYNTH_PAGES, shimmerLive:'tools/shimmer-live.html',motionLive:'tools/motion-live.html',motionLiveHost:'tools/motion-live-host.html',motionLiveSweep:'tools/motion-live-sweep.html',motionLiveCold:'tools/motion-live-cold.html',motionLiveEndpoints:'tools/motion-live-endpoints.html',motionLiveEndpointSweep:'tools/motion-live-endpoint-sweep.html',motionLiveReused:'tools/motion-live-reused.html',motionNormal:'tools/motion-normal.html',motionDormant:'tools/motion-live-dormant.html',filterNormal:'tools/normal-filter.html',filterRackActivity:'tools/filter-rack-activity.html',rackStartup:'tools/rack-startup.html',nativeClockedRack:'tools/native-clocked-rack.html',ambienceSpatial:'tools/ambience-spatial.html',ambienceSpatialLive:'tools/ambience-spatial-live.html',ambienceSpatialLiveMatrix:'tools/ambience-spatial-live-matrix.html',ambienceSpatialLive24k:'tools/ambience-spatial-live-24k.html',ambienceSpatialLifecycle:'tools/ambience-spatial-lifecycle.html',tapeLiveKernel:'tools/tape-live-kernel.html',tapeLiveResources:'tools/tape-live-resources.html',tapeLiveAudio:'tools/tape-live-audio.html',tapeCurvePreparation:'tools/tape-curve-preparation.html',ambienceSpatialPhase:'tools/ambience-spatial-phase.html',ambienceBankHost:'tools/ambience-bank-host.html',ambienceBankSum:'tools/ambience-bank-sum.html',shimmerNormal:'tools/shimmer-normal.html',nativeRackLive:'tools/native-rack-live.html',nativeRackNormal:'tools/native-rack-normal.html',nativeRackNormalLanes:'tools/native-rack-normal-lanes.html',nativeRackNormalHost:'tools/native-rack-normal-host.html',nativeRackNormalCold:'tools/native-rack-normal-cold.html',nativeRackNormalReused:'tools/native-rack-normal-reused.html',nativeRackNormalSweep:'tools/native-rack-normal-sweep.html',nativeRackNormalExtra:'tools/native-rack-normal-extra.html',nativeRackLiveSweep:'tools/native-rack-live-sweep.html',rackDynamicsLive:'tools/rack-dynamics-live.html',rackDynamicsReused:'tools/rack-dynamics-reused.html',rackDynamicsNormal:'tools/rack-dynamics-normal.html',rackDynamicsHosts:'tools/rack-dynamics-hosts.html',ambienceBank:'tools/ambience-bank.html',nativeEcho:'tools/native-echo.html',nativeEchoLive:'tools/native-echo-live.html',ownedEchoRoutes:'tools/owned-echo-routes.html',ambiencePlayback:'tools/ambience-playback.html',iowaLimiter:'tools/iowa-limiter.html',nativeRack:'tools/native-rack.html',instrumentDynamics:'tools/instrument-dynamics.html',rawCompressorLive:'tools/native-compressor-live.html',pianoStreaming:'tools/piano-streaming.html',pluckedLive:'tools/plucked-live.html',rackPlugins:'tools/rack-plugins.html',ownedCoreLive:'tools/owned-core-live.html',ownedBusLive:'tools/owned-bus-live.html',classicLive:'tools/classic-live.html',ownedAmbienceHost:'tools/ambience-host.html',privateRoom:'tools/private-room.html',clockedRackDynamics:'tools/clocked-rack-dynamics.html',clockedOwnedHost:'tools/clocked-owned-host.html',ambienceSpatialSession:'tools/ambience-spatial-session.html',ambienceBankSpatial:'tools/ambience-bank-spatial.html',ambienceSpatialEndpoints:'tools/ambience-spatial-endpoints.html',offlineConvolver:'tools/offline-convolver.html',clockedFilter:'tools/clocked-filter.html',ambienceComplete:'tools/ambience-complete.html',ambienceCompleteLifecycle:'tools/ambience-complete-lifecycle.html',tapePortableComposed:'tools/tape-portable-composed.html',tapePortableLive:'tools/tape-portable-live.html',ownedActiveHost:'tools/owned-active-host.html',pianoClock:'tools/piano-clock.html',liveVoiceCompressorState:'tools/live-voice-compressor-state.html',liveVoiceCompressorExtreme:'tools/live-voice-compressor-extreme.html',pianoLive:'tools/piano-live.html',liveVoiceCompressor:'tools/live-voice-compressor.html',roomConvolver:'tools/room-convolver.html',roleWander:'tools/role-wander.html',roomColour:'tools/room-colour.html',iowaLive:'tools/iowa-live.html',convolverLong:'tools/convolver-long.html',allDeskHost: 'tools/all-desk-host.html', nativeCompressorReference: 'tools/native-compressor-reference.html', nativeCompressorAutomation: 'tools/native-compressor-automation.html', nativeCompressorGraph: 'tools/native-compressor-graph.html', convolverOwned: 'tools/convolver-owned.html', convolverPreparation: 'tools/convolver-preparation.html', stringDecay: 'tools/string-decay.html', ambienceLoops: 'tools/ambience-loops.html', measuredString: 'tools/measured-string.html', tapeGraph: 'tools/tape-graph.html', weatherOwned: 'tools/weather-owned.html', tapeReference: 'tools/tape-reference.html', ownedDesk: 'tools/owned-desk.html', pluckedVoice: 'tools/plucked-voice.html', motionReference: 'tools/motion-reference.html', ownedPorts: 'tools/owned-ports.html', mixerOwned: 'tools/mixer-owned.html', iowaVoice: 'tools/iowa-voice.html', pianoVoice: 'tools/piano-voice.html', modularAudio: 'tools/modular-audio.html', modularEnsemble: 'tools/modular-ensemble.html', modularWorker: 'tools/modular-worker.html', synthLab: 'tools/synth-lab.html', currentSynth: 'tools/current-synth.html', effectsLab:'tools/effects.html', fmLab:'tools/fm.html', ensembleSynth:'tools/ensemble-synth.html', spectrum:'tools/spectrum.html', quality:'tools/quality.html', tone:'tools/tone.html', modulation:'tools/modulation.html', instrumentEffects:'tools/instrument-effects.html', acoustic:'tools/acoustic.html', sources:'tools/sources.html', behavior:'tools/behavior.html', stress:'tools/stress.html', scenery:'tools/scenery.html',
            // the preset tool (src/presetter) is for this machine: it needs the dev server's page hook, and the public build leaves it out
            ...(isPublic ? {} : { presetter: 'tools/presetter/index.html', chordSurvey: 'tools/survey_chords/index.html' }) },
            // React and its renderer are shared by every page; without a name, rollup calls the chunk after
            // whichever small module happens to import it first (it was "FirefoxAndroidNotice").
            output: { manualChunks: (id) => (/node_modules[\/](react|react-dom|scheduler)[\/]/.test(id) ? 'react' : undefined) } },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        // Ignored evidence/scratch folders are not part of the permanent suite
        exclude: [...configDefaults.exclude, '.tmp/**', 'reports/**'],
    },
  };
});
