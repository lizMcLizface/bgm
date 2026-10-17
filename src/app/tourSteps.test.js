import { TOUR_STEPS, STAGES } from './tourSteps';
import { availableSteps } from './Tour';
import { PAGE_IDS } from './rulebook/navigation';

afterEach(() => { document.body.innerHTML = ''; });

test('stage indices remain compatible and the basics introduce the book before the final unlock hint', () => {
    expect(STAGES.map(s => s.id)).toEqual(['basics','ambience','music','instruments','arrangement','evolution','feel','randomize']);
    expect(STAGES[3].name).toContain('playing rules');expect(STAGES[4].name).toBe('Composition rules');
    const basics=TOUR_STEPS.filter(s=>s.stage===0);
    expect(basics.at(-1).id).toBe('unlock');
    expect(basics.findIndex(s=>s.id==='rulebook')).toBeLessThan(basics.findIndex(s=>s.id==='unlock'));
});

test('closed rulebook pages remain eligible for preparation at their stage', () => {
    document.body.innerHTML='<section data-tour="rulebook"></section>';
    const instrumentSteps=availableSteps(3,3).filter(s=>s.rulePage);
    expect(instrumentSteps.map(s=>s.rulePage)).toEqual(['pad','bass','percussion']);
    expect(availableSteps(4,4).map(s=>s.rulePage)).toEqual(['melodic-composition','duet','form']);
    expect(availableSteps(6,6).filter(s=>s.rulePage).map(s=>s.rulePage)).toEqual(['performance','harmony']);
    expect(availableSteps(0,0).some(s=>s.rulePage)).toBe(false);
    document.body.innerHTML='';
    expect(availableSteps(4,4)).toEqual([]);
});

test('tour page references resolve to supported book pages and step IDs remain unique', () => {
    expect(new Set(TOUR_STEPS.map(s=>s.id)).size).toBe(TOUR_STEPS.length);
    for(const step of TOUR_STEPS.filter(s=>s.rulePage)) {
        expect(PAGE_IDS).toContain(step.rulePage);
        expect(step.selector).toMatch(/^#(group|rule)-/);
    }
});
