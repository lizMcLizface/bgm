import { CHAPTERS, RULES } from './model';

export const RULE_ROWS = [
    { id: 'instrument', title: 'Instrument rules', pages: ['melody', 'ensemble', 'pad', 'bass', 'percussion', 'performance', 'ambient-dynamics'] },
    { id: 'harmonic', title: 'Harmonic rules', pages: ['harmony'] },
    { id: 'composition', title: 'Composition rules', pages: ['melodic-composition', 'duet', 'rhythm', 'form'] },
];
export const PAGE_IDS = RULE_ROWS.flatMap(row => row.pages);
export const pageRole = id => ({ melody: 'lead', ensemble: 'counter', pad: 'pad', bass: 'bass', percussion: 'perc', 'melodic-composition': 'lead', duet: 'counter', rhythm: 'pad' }[id]);
export const pageTitle = chapter => ({ melody: 'Lead style', ensemble: 'Second lead', performance: 'Playing feel' }[chapter.id] ?? chapter.title);
// Keep old URLs valid for controls now housed outside the book.
export const pageRules = chapter => RULES.filter(r => r.chapter === chapter && r.id !== 'pitch-wander');

export function initialPages(saved, oldPages, stage) {
    const pages = new Set(['melody']);
    if (Array.isArray(saved)) { for (const id of saved) if (PAGE_IDS.includes(id)) pages.add(id); }
    else if (Number.isInteger(oldPages)) {
        for (const c of CHAPTERS.slice(0, Math.min(7, oldPages) + 1)) if (PAGE_IDS.includes(c.id)) pages.add(c.id);
        if (oldPages >= 7) for (const id of PAGE_IDS) pages.add(id);
    }
    // Existing stage unlocks retain access at their new home.
    if (stage >= 3) for (const id of ['pad', 'bass', 'percussion']) pages.add(id);
    if (stage >= 4) for (const id of ['ensemble', 'melodic-composition', 'duet', 'rhythm', 'form']) pages.add(id);
    if (stage >= 6) for (const id of ['harmony', 'performance']) pages.add(id);
    if (stage >= 1) pages.add('ambient-dynamics');
    return PAGE_IDS.filter(id => pages.has(id));
}
