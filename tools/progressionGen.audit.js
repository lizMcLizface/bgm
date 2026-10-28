// What generated progressions look like against the rock corpus (de Clercq & Temperley 2011), for each mood.
//   npx vitest run --config tools/vitest.audit.config.js tools/progressionGen.audit.js
import { generateProgression, MOODS, DEFAULT_MOOD, STATES, CORPUS_ROOTS } from '../src/app/composition/progressionGen';

const PC = { I: 0, i: 0, ii: 2, iii: 4, III: 3, IV: 5, iv: 5, V: 7, v: 7, vi: 9, VI: 8, bVI: 8, bVII: 10, VII: 10 };
const NAMES = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const fifthsDistance = (a, b) => { const d = ((b - a) % 12 + 12) % 12, steps = (d * 7) % 12; return Math.min(steps, 12 - steps); };

test('generated progressions against the corpus', () => {
    const rows = [];
    const moods = { neutral: DEFAULT_MOOD, ...MOODS };
    for (const [name, mood] of Object.entries(moods)) {
        const roots = Array(12).fill(0), motion = Array(7).fill(0); let chords = 0, distinct = 0, borrowed = 0, unsettled = 0, runs = 0;
        for (let seed = 1; seed <= 400; seed++) for (const length of [4, 4, 6]) {
            const p = generateProgression({ seed, length, family: 'major', mood });
            const pcs = p.ids.map((id) => STATES.major.find((s) => s.id === id).corpus);
            pcs.forEach((pc, i) => { roots[pc]++; chords++; motion[fifthsDistance(pc, pcs[(i + 1) % pcs.length])]++; });
            distinct += new Set(p.ids).size; borrowed += p.borrows.filter(Boolean).length; unsettled += p.unsettled ? 1 : 0; runs++;
        }
        const pct = (x) => (100 * x / chords).toFixed(0).padStart(3);
        rows.push(`${name.padEnd(12)} I${pct(roots[0])} IV${pct(roots[5])} V${pct(roots[7])} bVII${pct(roots[10])} bVI${pct(roots[8])} vi${pct(roots[9])} ii${pct(roots[2])} | by fifths 1:${pct(motion[1])} 2:${pct(motion[2])} 3:${pct(motion[3])} | borrowed ${(borrowed / runs).toFixed(2)}/cycle, distinct ${(distinct / runs).toFixed(1)}, no tonic ${(100 * unsettled / runs).toFixed(0)}%`);
    }
    const corpus = `corpus       I${(100 * CORPUS_ROOTS[0]).toFixed(0).padStart(3)} IV${(100 * CORPUS_ROOTS[5]).toFixed(0).padStart(3)} V${(100 * CORPUS_ROOTS[7]).toFixed(0).padStart(3)} bVII${(100 * CORPUS_ROOTS[10]).toFixed(0).padStart(3)} bVI${(100 * CORPUS_ROOTS[8]).toFixed(0).padStart(3)} vi${(100 * CORPUS_ROOTS[9]).toFixed(0).padStart(3)} ii${(100 * CORPUS_ROOTS[2]).toFixed(0).padStart(3)} | by fifths 1: 49 2: 30 3:  9 (Tables 5-6)`;
    console.log('GEN\n' + [corpus, ...rows].join('\n'));
});
