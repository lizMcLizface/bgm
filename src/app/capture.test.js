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
import { captureProject } from '../seq/capture';
import { degreeToMidi } from '../seq/harmony';

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
