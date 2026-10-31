import { midiHeld, midiHeldRole, holdNote, releaseNote } from './Tracks';

test('a held note remembers the voice it is played on, and none when no voice is chosen', () => {
    holdNote(60, 'lead'); holdNote(64);
    expect([...midiHeld]).toEqual([60, 64]);
    expect(midiHeldRole.get(60)).toBe('lead');
    expect(midiHeldRole.has(64)).toBe(false);
    holdNote(64, 'pad'); holdNote(60);
    expect(midiHeldRole.get(64)).toBe('pad');
    expect(midiHeldRole.has(60)).toBe(false);
    releaseNote(60); releaseNote(64);
    expect(midiHeld.size + midiHeldRole.size).toBe(0);
});
