import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';

// A voice's dice once called the page's own "random whole preset" function, because a local const named
// randomPreset hid the imported function that picks a sound for one voice: it loaded a different preset
// (a second lead, a new landscape and all). The voice's sound comes in under its own name now.
it('keeps the voice dice and the whole-preset dice apart', () => {
    const source = readFileSync('src/app/GenerativeApp.jsx', 'utf8');
    expect(source).toMatch(/randomPreset as randomVoiceSound/);
    expect(source).toMatch(/loadPreset\(role, randomVoiceSound\(/);
    expect(source).not.toMatch(/import \{[^}]*\brandomPreset\b(?! as)[^}]*\} from '\.\/randomize'/);
});
