import { TOUR_STEPS, STAGES } from './tourSteps';
import { availableSteps } from './Tour';
import { PAGE_IDS } from './rulebook/navigation';

afterEach(() => { document.body.innerHTML = ''; });

test('stage indices stay in order, the basics end on the unlock hint, and the book comes with the playing rules', () => {
    expect(STAGES.map(s => s.id)).toEqual(['basics','voices','mixing','music','instruments','arrangement','evolution','feel','randomize']);
    expect(STAGES[4].name).toContain('playing rules');expect(STAGES[5].name).toBe('Composition rules');
    expect(TOUR_STEPS.filter(s=>s.stage===0).at(-1).id).toBe('unlock');
    // the rulebook is not met before the level of the playing rules, and no early level is a crowd of steps
    expect(TOUR_STEPS.find(s=>s.id==='rulebook').stage).toBe(4);
    for (const stage of [1, 2]) expect(TOUR_STEPS.filter(s=>s.stage===stage).length).toBeLessThanOrEqual(4);
});

test('closed rulebook pages remain eligible for preparation at their stage', () => {
    document.body.innerHTML='<section data-tour="rulebook"></section>';
    const instrumentSteps=availableSteps(4,4).filter(s=>s.rulePage);
    expect(instrumentSteps.map(s=>s.rulePage)).toEqual(['ambient-dynamics','pad','bass','percussion']);
    expect(availableSteps(5,5).map(s=>s.rulePage)).toEqual(['melodic-composition','duet','form']);
    expect(availableSteps(7,7).filter(s=>s.rulePage).map(s=>s.rulePage)).toEqual(['performance','harmony']);
    expect(availableSteps(0,0).some(s=>s.rulePage)).toBe(false);
    document.body.innerHTML='';
    expect(availableSteps(5,5)).toEqual([]);
});

test('tour page references resolve to supported book pages and step IDs remain unique', () => {
    expect(new Set(TOUR_STEPS.map(s=>s.id)).size).toBe(TOUR_STEPS.length);
    for(const step of TOUR_STEPS.filter(s=>s.rulePage)) {
        expect(PAGE_IDS).toContain(step.rulePage);
        expect(step.selector).toMatch(/^#(group|rule)-/);
    }
});
