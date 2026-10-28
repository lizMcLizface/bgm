// Stubs the audio layer so Generator can plan without Web Audio (same approach as
// src/app/generator.test.js). Loaded by tools/vitest.audit.config.js for *.audit.js files.
const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
vi.mock('../src/audio/context', () => ({
    audioContext: {
        currentTime: 0, state: 'running', resume: () => Promise.resolve(),
        createGain: () => ({ connect() {}, gain: param() }),
        createConstantSource: () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, offset: param() }),
        createChannelSplitter: () => ({ connect() {}, disconnect() {} }),
        createChannelMerger: () => ({ connect() {}, disconnect() {} }),
        createWaveShaper: () => ({ connect() {}, disconnect() {} }),
        createPeriodicWave: () => ({}),
        createOscillator: () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, setPeriodicWave() {}, frequency: param() }),
        createBiquadFilter: () => ({ connect() {}, frequency: param(), Q: param() }),
    },
}));
vi.mock('../src/audio/bus', () => ({ masterBus: {} }));
vi.mock('../src/app/engine/Instrument', () => ({ default: class {
    constructor({ polyphony }) { this.polyphony = polyphony; this.preset = {}; }
    connect() {} applyPreset() {} scheduleNote() {} silence() {} flushTails() {}
} }));
vi.mock('../src/app/engine/drumKit', () => ({ default: class {
    constructor() { this.polyphony = 0; this.preset = {}; this.bus = { gain: { setTargetAtTime() {} } }; }
    futureBookings() { return []; } dispose() {} setKit() {} setVoicePreset() {} connect() {}
    scheduleNote() {} silence() {} flushTails() {}
} }));
vi.mock('../src/app/engine/wasmDrumKit', () => ({ default: class {
    constructor() { this.preset = {}; this.ready = Promise.resolve(); }
    setKit() {} setVoicePreset() {} connect() {} scheduleNote() {} silence() {} flushTails() {} dispose() {}
} }));
