// Tape: wow (a slow, drifting pitch sway), flutter (a fast shimmer of pitch), soft saturation and
// the high end a tape loses. The wobble is a short delay line whose time sways with a few sine
// LFOs; it is a pitch effect, not a mix, so the whole sound goes through it. The Instrument routes
// around the stage while wow, flutter and drive are all 0.

// Seconds of delay swing at full depth; the base delay stays above their sum.
const WOW = 0.003;
const DRIFT = 0.0015;
const FLUTTER = 0.00025;
const FLUTTER_2 = 0.00012;
const BASE_DELAY = 0.006;

// tanh with a quiet sound's gain at 1 (+5 dB at full drive, about what the rounded peaks lose)
const driveCurve = (drive) => {
    const k = 1 + drive * 5;
    const gain = (1 + 0.15 * (k - 1)) / k;
    return Float32Array.from({ length: 2049 }, (_, i) => Math.tanh(k * ((i / 1024) - 1)) * gain);
};

class Tape {
    constructor(AC) {
        this.AC = AC;
        this.input = AC.createGain();
        this.shaper = AC.createWaveShaper();
        this.shaper.oversample = '2x';
        this.tone = AC.createBiquadFilter();
        this.tone.type = 'lowpass';
        this.tone.Q.value = 0.5;
        this.delay = AC.createDelay(0.02);
        this.delay.delayTime.value = BASE_DELAY;
        this.input.connect(this.shaper);
        this.shaper.connect(this.tone);
        this.tone.connect(this.delay);

        const lfo = (hz) => {
            const osc = AC.createOscillator();
            const depth = AC.createGain();
            osc.frequency.value = hz;
            depth.gain.value = 0;
            osc.connect(depth);
            depth.connect(this.delay.delayTime);
            osc.start();
            return { osc, depth };
        };
        this.wow = lfo(0.6);
        this.drift = lfo(0.6 * 0.37);
        this.flutter = lfo(7.3);
        this.flutter2 = lfo(11.7);
        this.setDrive(0);
        this.setTone(9000);
    }

    getNode = () => this.input;
    connect = (destination) => [].concat(destination).forEach((d) => this.delay.connect(d));

    at = (param, value) => param.setTargetAtTime(value, this.AC.currentTime, 0.03);
    // depth 0..1
    setWow = (v) => {
        const d = Math.min(1, Math.max(0, v));
        this.at(this.wow.depth.gain, d * WOW);
        this.at(this.drift.depth.gain, d * DRIFT);
    };
    setWowRate = (hz) => {
        const r = Math.min(5, Math.max(0.05, hz));
        this.at(this.wow.osc.frequency, r);
        this.at(this.drift.osc.frequency, r * 0.37);
    };
    setFlutter = (v) => {
        const d = Math.min(1, Math.max(0, v));
        this.at(this.flutter.depth.gain, d * FLUTTER);
        this.at(this.flutter2.depth.gain, d * FLUTTER_2);
    };
    setDrive = (v) => { this.shaper.curve = driveCurve(Math.min(1, Math.max(0, v))); };
    setTone = (hz) => this.at(this.tone.frequency, Math.min(20000, Math.max(500, hz)));
}

export default Tape;
