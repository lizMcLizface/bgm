import { describe, expect, it } from 'vitest';
import { linkedBlockOptions } from './patternDefaults';
import { viewFromSearch, withView, patternsFromSearch, patternsParam, withPatterns } from './viewLink';

describe('view link', () => {
    it('reads the background from ?view=', () => {
        expect(viewFromSearch('?preset=calm&view=landscape')).toEqual({ view: 'landscape', backdrop: 'scenery' });
        expect(viewFromSearch('?view=fluid').backdrop).toBe('fluid');
        expect(viewFromSearch('?view=nonsense')).toBeNull();
        expect(viewFromSearch('')).toBeNull();
    });

    it('keeps the parameter when the address is rewritten', () => {
        const linked = viewFromSearch('?view=landscape');
        expect(withView('/?preset=calm', linked)).toBe('/?preset=calm&view=landscape');
        expect(withView('/', linked)).toBe('/?view=landscape');
        expect(withView('/?a=1#x', linked)).toBe('/?a=1&view=landscape#x');
        expect(withView('/?a=1', null)).toBe('/?a=1');
    });
});

describe('patterns link', () => {
    it('reads which blocks show, their mode and string', () => {
        const linked = patternsFromSearch('?view=landscape&patterns=guitar.played.D,bass,piano.scale');
        expect(linked.show).toEqual({ piano: true, guitar: true, bass: true });
        expect(linked.options.guitar).toEqual({ mode: 'played', anchorLetter: 'D' });
        expect(patternsFromSearch('?patterns=guitar.played.A.lcat').options.guitar).toEqual({ mode: 'played', anchorLetter: 'A', voices: ['lead', 'counter'], exact: false, track: true });
        expect(linked.options.bass).toEqual({});
        expect(patternsFromSearch('?patterns=banjo').show).toEqual({ piano: false, guitar: false, bass: false });
        expect(patternsFromSearch('')).toBeNull();
    });

    it('writes them back', () => {
        const letter = (id, anchor) => ['E', 'A', 'D'][anchor];
        expect(patternsParam({ piano: true, guitar: true, bass: false }, { guitar: { mode: 'played', anchor: 2 } }, letter)).toBe('piano.played..lcpb,guitar.played.D.pt');
        expect(patternsParam({ guitar: true, bass: true }, { guitar: { mode: 'scale' }, bass: { track: false } }, letter)).toBe('guitar.scale.E,bass.played.E.bu');
        expect(patternsParam({ guitar: true }, { guitar: { mode: 'played', anchor: 1, voices: ['bass', 'lead'], exact: false, track: true } }, letter)).toBe('guitar.played.A.lbat');
        expect(patternsFromSearch('?patterns=guitar.played.E.pu').options.guitar.track).toBe(false);
        expect(withPatterns('/?a=1', 'guitar.scale.E')).toBe('/?a=1&patterns=guitar.scale.E');
    });
});

describe('opening a patterns link', () => {
    it('turns every field of every block into the options a block keeps', () => {
        const linked = patternsFromSearch('?preset=x&view=landscape&patterns=piano.played..lcpbt,guitar.played.D.pau,bass.scale.A');
        expect(linkedBlockOptions(linked.options)).toEqual({
            piano: { mode: 'played', voices: ['lead', 'counter', 'pad', 'bass'], track: true },
            guitar: { mode: 'played', anchor: 2, voices: ['pad'], exact: false, track: false },
            bass: { mode: 'scale', anchor: 1 },
        });
    });
});
