import { describe, expect, it } from 'vitest';
import { viewFromSearch, withView } from './viewLink';

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
