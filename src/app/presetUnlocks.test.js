import { describe, it, expect } from 'vitest';
import { TIERS, openingOrder, categoryStats, tierFor, goalText, presetAccess } from './presetUnlocks';

const names = Array.from({ length: 30 }, (_, i) => `P${i}`);
const cats = [{ id: 'a', label: 'Alpha', names }];

describe('opening order', () => {
    it('puts the starters first, then library order', () => {
        expect(openingOrder(['x', 'y', 'z'], ['z'])).toEqual(['z', 'x', 'y']);
    });
    it('starts a category with no starter on its first preset', () => {
        expect(openingOrder(['x', 'y', 'z'], [])).toEqual(['x', 'y', 'z']);
        expect(openingOrder(['x', 'y'], ['nope'])).toEqual(['x', 'y']);
    });
});

describe('tiers', () => {
    it('start with one preset, a minute opens the next two, five minutes two more', () => {
        expect(tierFor({ seconds: 0, distinct: 0 }, 30).total).toBe(1);
        expect(tierFor({ seconds: 60, distinct: 1 }, 30).total).toBe(3);
        expect(tierFor({ seconds: 300, distinct: 2 }, 30).total).toBe(5);
    });
    it('need enough different presets as well as time further up', () => {
        expect(tierFor({ seconds: 900, distinct: 3 }, 30).total).toBe(5);
        expect(tierFor({ seconds: 900, distinct: 4 }, 30).total).toBe(9);
    });
    it('open everything at the top, and never more than the category has', () => {
        expect(tierFor({ seconds: 99999, distinct: 99 }, 30)).toMatchObject({ total: 30, next: null });
        expect(tierFor({ seconds: 99999, distinct: 99 }, 4).total).toBe(4);
    });
    it('are in order', () => {
        TIERS.reduce((a, b) => { expect(b.seconds).toBeGreaterThan(a.seconds); expect(b.total).toBeGreaterThan(a.total); return b; });
    });
});

describe('goal text', () => {
    it('says what is missing', () => {
        const next = { seconds: 300, distinct: 0, total: 5 };
        expect(goalText({ seconds: 60, distinct: 1 }, next, 'Cozy')).toBe('Listen for 4 more minutes in Cozy to open more.');
        expect(goalText({ seconds: 900, distinct: 2 }, { seconds: 900, distinct: 4, total: 9 }, 'Cozy')).toBe('Listen to 2 more presets in Cozy to open more.');
        expect(goalText({ seconds: 0, distinct: 0 }, null, 'Cozy')).toBe('');
    });
});

describe('presetAccess', () => {
    it('opens the starter, then more as time is spent, and keeps what was heard', () => {
        let access = presetAccess(cats, {}, ['P7']);
        expect(access.isOpen('P7')).toBe(true);
        expect(access.isOpen('P0')).toBe(false);
        expect(access.byCategory.a).toMatchObject({ open: 1, total: 30 });
        access = presetAccess(cats, { P7: 70 }, ['P7']);
        expect(['P7', 'P0', 'P1'].every(access.isOpen)).toBe(true);
        expect(access.isOpen('P2')).toBe(false);
        expect(access.byCategory.a.goal).toContain('Alpha');
        // heard once via a link: stays open even though it is not in the opened set
        expect(presetAccess(cats, { P20: 5 }, ['P7']).isOpen('P20')).toBe(true);
    });
    it('counts time over the whole category', () => {
        expect(categoryStats(names, { P1: 40, P2: 20, P3: 31 })).toEqual({ seconds: 91, distinct: 2 });
    });
});

describe('always-open categories', () => {
    it('open every preset of the demo categories from the start', () => {
        const demos = names.map((n) => `D${n}`);
        const access = presetAccess([{ id: 'demo', label: 'Feel demos', names: demos }, ...cats], {}, []);
        expect(demos.every(access.isOpen)).toBe(true);
        expect(access.byCategory.demo).toMatchObject({ open: 30, next: null, goal: '' });
        expect(access.byCategory.a.open).toBe(1);
    });
});

describe('the real starters', () => {
    it('are all browsable presets, one per category at most', async () => {
        const { STARTERS } = await import('./presetUnlocks');
        const { BROWSABLE_SCENES } = await import('./scenes');
        const found = STARTERS.map((name) => BROWSABLE_SCENES.find((s) => s.name === name));
        expect(found.every(Boolean)).toBe(true);
        const categories = found.map((s) => s.category);
        expect(new Set(categories).size).toBe(categories.length);
    });
});
