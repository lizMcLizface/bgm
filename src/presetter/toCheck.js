// Presets still leaning on the older Measured voices, marked in the presetter as [to check instrument]: the Iowa and VSCO instruments may do these parts better.
import voices from '../library/voices.json';

export const TO_CHECK_MARK = '[to check instrument]';
const OLDER = new Set(Object.keys(voices.Measured ?? {}));
const nameOf = (spec) => (typeof spec === 'string' ? spec : spec?.name);

/** The older instruments a preset uses, in any role or layer voice, without repeats. */
export function instrumentsToCheck(scene) {
    const named = [...Object.values(scene.voices ?? {}), ...Object.values(scene.layerVoices ?? {})].map(nameOf);
    return [...new Set(named.filter((name) => OLDER.has(name)))];
}
