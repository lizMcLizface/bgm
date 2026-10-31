// For the presetter's tests: the page as GenerativeApp's captureSetup builds it, so a test can stand in for the framed page.
import { sceneSettings, sceneVoiceSpec, buildSetup } from '../app/scenes';
import { voiceLayers } from '../app/arranger';
import { findPreset } from '../app/editor/presetStore';
import { ROLE_PRESETS } from '../app/presets';
import { inheritBook } from '../app/rulebook/session';

// The page as it is just after a preset loads: GenerativeApp's captureSetup, with the preset's own state.
export function pageAfterLoading(scene, seed = 4) {
    const settings = sceneSettings(scene, seed), layers = voiceLayers(settings);
    const voices = Object.fromEntries(Object.keys(ROLE_PRESETS).map((role) => {
        const spec = sceneVoiceSpec(scene, role, layers) ?? ROLE_PRESETS[role], name = typeof spec === 'string' ? spec : spec.name;
        return [role, spec?.external ? { name, external: spec.external } : { name, synth: typeof spec === 'string' ? findPreset(spec) : spec.synth }];
    }));
    return buildSetup({ settings, rulebook: inheritBook(scene.rulebook), voices, percussion: scene.percussion }, { name: scene.name });
}

