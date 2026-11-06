// The generator's own plan, captured into sequencer patterns (src/seq/capture.js): the progression, voicings and lines are the generator's, offline, no audio.
import { defaultSettings } from './settings';

vi.mock('../audio/context', () => ({
    audioContext: {
        currentTime: 0,
        state: 'running',
        resume: () => Promise.resolve(),
        createGain: () => {
            const gain = {
                value: 1,
                setTargetAtTime: (v) => { gain.value = v; },
                setValueAtTime: (v) => { gain.value = v; },
                cancelScheduledValues: () => {},
            };
            return { connect: () => {}, gain };
        },
        createConstantSource: () => ({ connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, offset: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} } }),
        createChannelSplitter: () => ({ connect: () => {}, disconnect: () => {} }),
        createChannelMerger: () => ({ connect: () => {}, disconnect: () => {} }),
        createWaveShaper: () => ({ connect: () => {}, disconnect: () => {} }),
        createPeriodicWave: () => ({}),
        createOscillator: () => ({
            connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, setPeriodicWave: () => {}, frequency: { value: 0 },
        }),
        createBiquadFilter: () => {
            const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {} });
            return { connect: () => {}, frequency: param(), Q: param() };
        },
    },
}));
vi.mock('../audio/bus', () => ({ masterBus: {} }));
// vi.mock factories are hoisted above imports; shared state must be too.
const mockBooked = vi.hoisted(() => []);
vi.mock('./engine/Instrument', () => ({ default: class {
    constructor({ polyphony }) { this.polyphony = polyphony; this.preset = {}; }
    connect() {}
    applyPreset() {}
    scheduleNote(midi, start, duration, velocity, detune) { mockBooked.push({ midi, start, duration, velocity, detune }); }
    silence() {}
    flushTails() {}
} }));

const mockHits = vi.hoisted(() => []);
vi.mock('./engine/drumKit', () => ({ default: class {
    constructor() { this.polyphony = 0; this.preset = {}; this.bus={gain:{setTargetAtTime(){}}}; }
    futureBookings(){return [];}
    dispose(){}
    setKit() {}
    setVoicePreset(id) {this.voicePreset=id;}
    connect() {}
    scheduleNote(drum, start, duration, velocity) { mockHits.push({ drum, start, velocity }); }
    silence() {}
    flushTails() {}
} }));

const percussionMock=vi.hoisted(()=>({fail:false}));
vi.mock('./engine/wasmDrumKit',()=>({default:class {
 constructor(){this.preset={};this.ready=percussionMock.fail?Promise.reject(Error('Kernel unavailable')):Promise.resolve();}
 setKit(kit){this.kit=kit;}
 setVoicePreset(id){this.voicePreset=id;}
 connect(){} scheduleNote(){} silence(){} flushTails(){} dispose(){}
}}));
import Generator from './Generator';
import { captureProject, planCompleteProgressions, planProgressions } from '../seq/capture';
import { degreeToMidi } from '../seq/harmony';
import { generatedChords } from '../synths/all/placedChords';
import { noteStepEvents } from '../seq/notes';

test('a planned song is captured as patterns for every role that plays', () => {
    const g = new Generator({ ...defaultSettings(), seed: 11 }).planner();
    const bars = 8;
    for (let bar = 0; bar < bars; bar++) g.planBar(bar);
    const records = [...Array(bars).keys()].map((bar) => g.plan.get(bar));
    const meterSteps = Math.round(g.meter.units * 4);
    const project = captureProject(records, { stepsPerBar: meterSteps });
    expect(project.bars).toBe(bars);
    expect(Object.keys(project.patterns)).toEqual(expect.arrayContaining(['pad', 'bass']));
    expect(project.chords.length).toBeGreaterThan(1);
    for (const [role, pattern] of Object.entries(project.patterns)) {
        expect(pattern.length).toBe(bars * meterSteps);
        const midis = pattern.steps.filter(Boolean).flatMap((s) => s.n.map((n) => degreeToMidi(project.key, n)));
        expect(midis.length, role).toBeGreaterThan(0);
        expect(Math.min(...midis), role).toBeGreaterThan(20);
        expect(Math.max(...midis), role).toBeLessThan(110);
    }
    // what the generator planned for the bass is what the pattern holds (pitches survive the trip through degrees)
    const planned = records.flatMap((r) => r.events).filter((e) => e.role === 'bass').map((e) => e.midi);
    const captured = project.patterns.bass.steps.filter(Boolean).flatMap((s) => s.n.map((n) => degreeToMidi(project.key, n)));
    expect(new Set(captured)).toEqual(new Set(planned));
});

test('generator chord provenance survives capture without changing note playback', () => {
    const planner=new Generator({...defaultSettings(),seed:11}).planner();
    const records=planCompleteProgressions(planner,8),stepsPerBar=Math.round(planner.meter.units*4);
    const tagged=records.flatMap(r=>r.events.filter(e=>e.role==='pad'&&e.chordSource));
    expect(tagged.length).toBeGreaterThan(0);
    const project=captureProject(records,{stepsPerBar});
    const groups=generatedChords(project.patterns.pad,project.key);
    expect(groups.length).toBeGreaterThan(0);
    const stripped=records.map(record=>({...record,events:record.events.map(({chordSource,...event})=>event)}));
    const baseline=captureProject(stripped,{stepsPerBar}).patterns.pad;
    for(let i=0;i<baseline.length;i++){
        const ctx={time:i*.1,stepSec:.1,key:project.key,random:()=>0};
        expect(noteStepEvents(project.patterns.pad,i,ctx)).toEqual(noteStepEvents(baseline,i,ctx));
    }
});

test('capture extends a partial generator cycle but does not add a cycle at an existing boundary', () => {
    const settings = { ...defaultSettings(), seed: 11, barsPerChord: 2 };
    const plan = () => new Generator(settings).planner();
    const first = planCompleteProgressions(plan(), 1);
    expect(first.length).toBeGreaterThan(1);
    expect(first.at(-1).nextMusic.cycleStart).toBe(first.length);
    const exact = planCompleteProgressions(plan(), first.length);
    expect(exact.length).toBe(first.length);
    const extended = planCompleteProgressions(plan(), first.length + 1);
    expect(extended.length).toBeGreaterThan(first.length + 1);
    expect(extended.at(-1).nextMusic.cycleStart).toBe(extended.length);
});

test('capture retains the generator percussion voices and their simultaneous hits', () => {
    const defaults=defaultSettings();
    const g=new Generator({...defaults,seed:11,drums:{...defaults.drums,style:'lofi'}}).planner();
    const records=planCompleteProgressions(g,8);
    const project=captureProject(records,{stepsPerBar:Math.round(g.meter.units*4)});
    const planned=records.flatMap(r=>r.events.filter(e=>e.role==='perc'));
    expect(planned.length).toBeGreaterThan(0);
    const captured=project.patterns.perc.steps.flatMap(s=>s?.hits??[]);
    expect(captured).toHaveLength(planned.length);
    expect(captured.map(h=>h.drum).sort((a,b)=>a-b)).toEqual(planned.map(e=>e.midi).sort((a,b)=>a-b));
});

test('planning by progression count produces exactly complete cycles', () => {
    for (const count of [1, 4, 8]) {
        const planner=new Generator({...defaultSettings(),seed:11,barsPerChord:2}).planner();
        const records=planProgressions(planner,count);
        const project=captureProject(records,{stepsPerBar:Math.round(planner.meter.units*4)});
        expect(project.progressions).toHaveLength(count);
        expect(records.at(-1).nextMusic.cycleStart).toBe(records.length);
        expect(project.chords[0].pitchClasses).toEqual(records[0].chord.pitchClasses);
        expect(project.chords[0].scalePcs).toEqual(records[0].chord.scalePcs);
    }
});
