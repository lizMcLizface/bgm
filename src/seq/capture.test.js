import { describe, expect, it } from 'vitest';
import { capturePattern, captureChords, captureDrums, captureProgressions, captureProject, NOTE_ROLES } from './capture';
import { makeKey, degreeToMidi } from './harmony';

const key = makeKey('Major-1', 0);
const rec = (events, chord = { name: 'C', numeral: 'I' }) => ({ events, chord, music: { tonic: 0, mode: 'Major-1' } });
const ev = (role, midi, beat, length = 1, velocity = 0.8) => ({ role, midi, beat, length, velocity });

describe('capture', () => {
    it('puts a role\'s notes on the step grid as scale degrees, with ties for long notes', () => {
        const p = capturePattern([rec([ev('lead', 64, 0, 2), ev('lead', 67, 2, 0.5, 0.5), ev('bass', 36, 0)])], 'lead', { key, stepsPerBar: 16 });
        expect(p.mode).toBe('note');
        expect(p.length).toBe(16);
        expect(p.steps[0]).toEqual({ n: [{ d: 2, o: 0, a: 0 }], vel: 0.8, len: 8 });
        expect(p.steps[8]).toEqual({ n: [{ d: 4, o: 0, a: 0 }], vel: 0.5, len: 2 });
        expect(p.steps.filter(Boolean)).toHaveLength(2);
        for (const s of p.steps.filter(Boolean)) expect(degreeToMidi(key, s.n[0])).toBeGreaterThan(60);
    });
    it('makes chords poly steps, notes ascending, and keeps notes that are not in the key as accidentals', () => {
        const p = capturePattern([rec([ev('pad', 67, 0), ev('pad', 60, 0), ev('pad', 64, 0), ev('pad', 61, 2)])], 'pad', { key, stepsPerBar: 16 });
        expect(p.mode).toBe('poly');
        expect(p.steps[0].n.map((n) => degreeToMidi(key, n))).toEqual([60, 64, 67]);
        expect(p.steps[8].n[0]).toEqual({ d: 0, o: 0, a: 1 });
    });
    it('lays bars end to end and lists the chords where they change', () => {
        const records = [rec([ev('bass', 36, 0)], { name: 'C', numeral: 'I' }), rec([ev('bass', 43, 0)], { name: 'C', numeral: 'I' }), rec([ev('bass', 45, 0)], { name: 'Am', numeral: 'vi' })];
        const p = capturePattern(records, 'bass', { key, stepsPerBar: 16 });
        expect(p.length).toBe(48);
        expect([0, 16, 32].map((i) => degreeToMidi(key, p.steps[i].n[0]))).toEqual([36, 43, 45]);
        expect(captureChords(records)).toEqual([{ bar: 0, name: 'C', numeral: 'I' }, { bar: 2, name: 'Am', numeral: 'vi' }]);
    });
    it('makes a project of the roles that have notes, in the first bar\'s key', () => {
        const project = captureProject([rec([ev('lead', 64, 0), ev('pad', 60, 0), ev('perc', 36, 0)])]);
        expect(Object.keys(project.patterns).sort()).toEqual(['lead', 'pad']);
        expect(project.key.tonic).toBe(0);
        expect(project.bars).toBe(1);
        expect(NOTE_ROLES).not.toContain('perc');
        expect(captureProject([])).toBeNull();
    });
    it('captures each progression cycle as a bar range, including repeated chords at cycle boundaries', () => {
        const records = [
            { ...rec([]), music: { ...rec([]).music, cycleStart: 0 } },
            { ...rec([], { name: 'G', numeral: 'V' }), music: { ...rec([]).music, cycleStart: 0 } },
            { ...rec([], { name: 'G', numeral: 'V' }), music: { ...rec([]).music, cycleStart: 2 } },
        ];
        expect(captureProgressions(records)).toEqual([
            { startBar: 0, bars: 2, key, chords: [{ bar: 0, name: 'C', numeral: 'I' }, { bar: 1, name: 'G', numeral: 'V' }] },
            { startBar: 2, bars: 1, key, chords: [{ bar: 0, name: 'G', numeral: 'V' }] },
        ]);
    });
    it('captures simultaneous percussion as drum hits rather than pitched notes', () => {
        const records=[rec([ev('perc',0,1,0.5,0.7),{...ev('perc',4,1,0.25,0.6),track:'ch'},ev('perc',99,1)])];
        const drums=captureDrums(records,{stepsPerBar:16});
        expect(drums.steps[4].hits).toEqual([{drum:0,velocity:0.7,duration:2},{drum:4,velocity:0.6,duration:1,track:'ch'}]);
        expect(captureProject(records).patterns.perc).toEqual(drums);
    });
});
it('captures a minimal legacy record without inventing historical key provenance',()=>{
 const records=[{chord:{name:'C'},events:[ev('lead',60,0)]}];
 expect(captureProgressions(records)).toEqual([{startBar:0,bars:1,chords:[{bar:0,name:'C',numeral:undefined}]}]);
 expect(capturePattern(records,'lead',{key,stepsPerBar:16}).steps[0].n).toEqual([{d:0,o:0,a:0}]);
});
