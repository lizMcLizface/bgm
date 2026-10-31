// Lists every voice a preset may use by family (editor/soundFamilies.js), for choosing layer voices. Writes .tmp/voice-inventory.json
import fs from 'node:fs';
import { PRESET_CATEGORIES, HIDDEN_PRESETS } from '../src/app/presets';
import { soundFamily } from '../src/app/editor/soundFamilies';
test('inventory', () => {
    const out = {};
    for (const [group, presets] of Object.entries(PRESET_CATEGORIES)) for (const name of Object.keys(presets)) {
        if (HIDDEN_PRESETS.has(name)) continue;
        (out[soundFamily(name, group)] ??= []).push(`${name} [${group}]`);
    }
    fs.writeFileSync('.tmp/voice-inventory.json', JSON.stringify(out, null, 1));
    console.log(Object.entries(out).map(([f, l]) => `${f}: ${l.length}`).join(', '));
});
