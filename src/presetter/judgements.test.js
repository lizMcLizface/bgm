import { describe, expect, it } from 'vitest';
import { feel, texture, styles, instruments, median, levelClass, detail, searchText } from './judgements';
import { rowsFor } from './table';

const calm = { lufs: -26, range: 5, quietest: -30, peak: -4, centroid: 2600, bands: [0.2, 0.3, 0.4, 0.05, 0.05], onsets: 2, silent: 0.01,
    feel: { relaxed: 0.94, sad: 0.77, happy: 0.09, aggressive: 0.01, party: 0.04, acoustic: 0.53, electronic: 0.43, danceable: 0.33, instrumental: 0.9 },
    styles: [['Electronic / Ambient', 0.1], ['Jazz / Fusion', 0.06], ['New Age', 0.05]], instruments: [['piano', 0.41], ['synthesizer', 0.28]], moodThemes: [['relaxing', 0.14]], genres: [['ambient', 0.24]], clap: { mood: [['sad', 0.19]] } };
const club = { ...calm, lufs: -15, range: 3, onsets: 7, feel: { ...calm.feel, relaxed: 0.42, party: 0.89, acoustic: 0.01, electronic: 0.97, danceable: 0.99, sad: 0.11 } };

describe('judgement summaries', () => {
    it('lists the moods that are on, strongest first', () => {
        expect(feel(calm)).toBe('relaxed · sad');
        expect(feel(club)).toBe('danceable · party');
        expect(feel(undefined)).toBe('');
    });
    it('calls the texture', () => {
        expect(texture(calm)).toBe('acoustic');
        expect(texture(club)).toBe('electronic');
        expect(texture({ feel: { acoustic: 0.2, electronic: 0.5 } })).toBe('mixed');
    });
    it('takes the top styles and instruments', () => {
        expect(styles(calm)).toBe('Electronic / Ambient, Jazz / Fusion');
        expect(instruments(calm, 1)).toBe('piano');
    });
    it('flags levels far from the median', () => {
        const mid = median([-26, -15, -17, -16, -14.9]);
        expect(mid).toBe(-16);
        expect(levelClass(-26, mid)).toBe('quiet');
        expect(levelClass(-15, mid)).toBe('');
        expect(levelClass(-10, mid)).toBe('loud');
        expect(levelClass(undefined, mid)).toBe('');
    });
    it('describes a preset in full, or says there is nothing', () => {
        expect(detail(calm)).toContain('-26 LUFS');
        expect(detail(calm)).toContain('Jazz / Fusion 6%');
        expect(detail(undefined)).toBe('No audio judgement yet');
        expect(searchText(calm)).toContain('relaxing');
    });
});

describe('table with judgements', () => {
    const scenes = [{ name: 'Calm', category: 'cozy' }, { name: 'Club', category: 'electronic' }, { name: 'Unjudged', category: 'cozy' }];
    const judgements = { Calm: calm, Club: club };
    const store = { presets: {} };
    it('sorts by loudness with unjudged presets last', () => {
        expect(rowsFor(scenes, store, { sort: 'loud', judgements }).map((s) => s.name)).toEqual(['Club', 'Calm', 'Unjudged']);
        expect(rowsFor(scenes, store, { sort: 'quiet', judgements }).map((s) => s.name)).toEqual(['Calm', 'Club', 'Unjudged']);
        expect(rowsFor(scenes, store, { sort: '', judgements }).map((s) => s.name)).toEqual(['Calm', 'Club', 'Unjudged']);
    });
    it('finds presets by what the judges heard', () => {
        expect(rowsFor(scenes, store, { query: 'jazz', judgements }).map((s) => s.name)).toEqual(['Calm', 'Club']);
        expect(rowsFor(scenes, store, { query: 'party', judgements }).map((s) => s.name)).toEqual(['Club']);
    });
});
