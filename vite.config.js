import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at the root of calmbgm.com (GitHub Pages with a custom domain:
// public/CNAME). Asset and worklet URLs still go through
// import.meta.env.BASE_URL, so a sub-path deploy only needs `base` changed.
export default defineConfig({
    base: '/',
    plugins: [react()],
    build: {
        rollupOptions: { input: { main: 'index.html', labs:'labs/index.html', labAll:'labs/all/index.html', labStrings:'labs/strings/index.html', labKeys:'labs/keys/index.html', labChoir:'labs/choir/index.html', labOrgans:'labs/organs/index.html', labDrones:'labs/drones/index.html', labBass:'labs/bass/index.html', labPlucks:'labs/plucks/index.html', labWinds:'labs/winds/index.html', labLeads:'labs/leads/index.html', labPads:'labs/pads/index.html', synthLab: 'tools/synth-lab.html', currentSynth: 'tools/current-synth.html', effectsLab:'tools/effects.html', fmLab:'tools/fm.html', ensembleSynth:'tools/ensemble-synth.html', spectrum:'tools/spectrum.html', quality:'tools/quality.html', tone:'tools/tone.html', modulation:'tools/modulation.html', instrumentEffects:'tools/instrument-effects.html', acoustic:'tools/acoustic.html', sources:'tools/sources.html', behavior:'tools/behavior.html', stress:'tools/stress.html' } },
    },
    test: {
        environment: 'jsdom',
        globals: true,
    },
});
