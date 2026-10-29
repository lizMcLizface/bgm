import { glideNotes } from './portamento';

const note = (role, midi, beat, length = 0.5) => ({ role, midi, beat, length, velocity: 0.8 });

test('a close following note glides from the one before it, and the glide scales with the amount', () => {
    const events = [note('bass', 40, 0, 0.9), note('bass', 47, 1, 0.9), note('bass', 40, 2, 0.9)];
    glideNotes(events, { secondsPerBeat: 0.5, amounts: { bass: 0.5 } });
    expect(events[0].expression).toBeUndefined();
    expect(events[1].expression).toEqual({ slideFromMidi: 40, slideSeconds: 0.15 });
    expect(events[2].expression.slideFromMidi).toBe(47);
    const more = [note('bass', 40, 0, 0.9), note('bass', 47, 1, 0.9)];
    glideNotes(more, { secondsPerBeat: 0.5, amounts: { bass: 1 } });
    expect(more[1].expression.slideSeconds).toBeCloseTo(0.3);
});

test('nothing glides at 0, across a long gap, a repeated note or a leap', () => {
    const base = () => [note('lead', 60, 0), note('lead', 62, 3), note('lead', 62, 3.6), note('lead', 80, 3.8)];
    const none = base(); glideNotes(none, { secondsPerBeat: 0.5, amounts: { lead: 0 } });
    expect(none.every((e) => !e.expression)).toBe(true);
    const some = base(); glideNotes(some, { secondsPerBeat: 0.5, amounts: { lead: 1 } });
    expect(some[1].expression).toBeUndefined(); // two beats of silence
    expect(some[2].expression).toBeUndefined(); // same pitch
    expect(some[3].expression).toBeUndefined(); // an 18-semitone leap
});

test('a glide crosses the bar line, chords glide as one line, and existing slides are kept', () => {
    const previous = [note('bass', 38, 3.5)];
    const events = [note('bass', 41, 0), note('lead', 64, 0), note('lead', 67, 0)];
    glideNotes(events, { previous, units: 4, secondsPerBeat: 0.5, amounts: { bass: 0.4, lead: 0.4 } });
    expect(events[0].expression.slideFromMidi).toBe(38);
    expect(events[1].expression).toBeUndefined();
    const kept = [{ ...note('lead', 62, 1), expression: { slideFromMidi: 50, slideSeconds: 0.1 } }, note('lead', 60, 0)];
    glideNotes(kept, { secondsPerBeat: 0.5, amounts: { lead: 1 } });
    expect(kept[0].expression.slideFromMidi).toBe(50);
});

test('settings carry the glide and share links keep it only when it is used', async () => {
    const { defaultSettings, encodeSettings, decodeShare } = await import('../settings');
    const base = { ...defaultSettings(), seed: 3 };
    expect(encodeSettings(base)).not.toMatch(/x=/);
    const glide = { ...base, portamento: { lead: 0.4, counter: 0, bass: 0.7 } };
    expect(decodeShare(encodeSettings(glide)).settings.portamento).toEqual(glide.portamento);
    expect(decodeShare(encodeSettings({ ...base, portamento: { lead: 5, counter: 0, bass: 0 } })).settings.portamento.lead).toBe(1);
});
