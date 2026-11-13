// This is an isolated review recipe. It never reads or writes application settings.
export const REPLAY_KEY = 'calmbgm-integrated-audio-review-v1';
export const REVIEW_PROFILE = 'generator-ordered-mix-review-v1';
export const PRESETS = Object.freeze([
    'Wasm Glass Bells', 'Wasm Rosin Silk', 'Wasm Rosin Silk',
    'Wasm Round FM Bass', 'Wasm Glass Bells',
]);

export function createRecipe(sampleRate) {
    return validateRecipe({ version: 1, profile: REVIEW_PROFILE, sampleRate,
        seed: 20261112, liveInputLeadSeconds: .128, orderedMix: true, presets: [...PRESETS] });
}

export function validateRecipe(value) {
    const expectedKeys = 'liveInputLeadSeconds,orderedMix,presets,profile,sampleRate,seed,version';
    if (!value || Object.keys(value).sort().join(',') !== expectedKeys ||
        value.version !== 1 || value.profile !== REVIEW_PROFILE ||
        ![8000, 24000, 44100, 48000, 96000].includes(value.sampleRate) ||
        value.seed !== 20261112 || value.liveInputLeadSeconds !== .128 || value.orderedMix !== true ||
        JSON.stringify(value.presets) !== JSON.stringify(PRESETS)) {
        throw Error('Saved review recipe differs from the supported integrated slice');
    }
    return structuredClone(value);
}

function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

export async function fingerprints(values) {
    return Object.fromEntries(await Promise.all(Object.entries(values).map(async ([key, value]) => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
        return [key, Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')];
    })));
}

export function validateSavedRecord(value, sampleRate) {
    if (!value || Object.keys(value).sort().join(',') !== 'fingerprints,recipe,version' || value.version !== 1 ||
        !value.fingerprints || Object.keys(value.fingerprints).sort().join(',') !== 'factory,presets,recipe,settings' ||
        Object.values(value.fingerprints).some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) {
        throw Error('A completed review with valid fingerprints is required for replay');
    }
    const recipe = validateRecipe(value.recipe);
    if (recipe.sampleRate !== sampleRate) throw Error('Saved review sample rate differs from this audio context');
    return { version: 1, recipe, fingerprints: { ...value.fingerprints } };
}

export function verifyReplay(expected, actual) {
    if (Object.keys(actual).sort().join(',') !== 'factory,presets,recipe,settings' ||
        Object.keys(expected).sort().join(',') !== Object.keys(actual).sort().join(',') ||
        Object.keys(actual).some(key => actual[key] !== expected[key])) {
        throw Error('Reload changed the saved recipe, settings, presets or prepared factory identity');
    }
    return true;
}
