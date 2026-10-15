// Tremolo and auto-pan: two slow sine LFOs, one on the level and one on
// the stereo position. Depth 0 leaves that half flat; the Instrument routes
// around the whole stage while both are 0.
//
// Auto-pan is an equal-power balance rather than a StereoPanner: a panner
// sums both channels into one side at its extremes (+6 dB for a centred
// sound), a balance keeps the level and, at centre, passes stereo as is.

// Balance gain of each side for a position -1..1 (1 at centre).
const balanceCurve = (side) => Float32Array.from({ length: 1025 }, (_, i) => {
    const p = (i / 1024) * 2 - 1;
    const angle = ((p + 1) * Math.PI) / 4;
    return Math.SQRT2 * (side === 'left' ? Math.cos(angle) : Math.sin(angle));
});

class Motion {
    constructor(AC) {
        this.AC = AC;
        this.input = AC.createGain();
        this.tremolo = AC.createGain();
        // always two channels into the splitter (a mono input is upmixed)
        this.tremolo.channelCount = 2;
        this.tremolo.channelCountMode = 'explicit';
        this.input.connect(this.tremolo);
        const split = AC.createChannelSplitter(2);
        this.merge = AC.createChannelMerger(2);
        this.tremolo.connect(split);
        this.sides = ['left', 'right'].map((side, ch) => {
            const gain = AC.createGain();
            gain.gain.value = 0; // driven by the shaper (1 at centre)
            split.connect(gain, ch);
            gain.connect(this.merge, 0, ch);
            const shaper = AC.createWaveShaper();
            shaper.curve = balanceCurve(side);
            shaper.connect(gain.gain);
            return shaper;
        });

        this.tremoloLfo = AC.createOscillator();
        this.tremoloDepth = AC.createGain();
        this.tremoloDepth.gain.value = 0;
        this.tremoloLfo.connect(this.tremoloDepth);
        this.tremoloDepth.connect(this.tremolo.gain);

        this.panLfo = AC.createOscillator();
        this.panDepth = AC.createGain();
        this.panDepth.gain.value = 0;
        this.panLfo.connect(this.panDepth);
        this.sides.forEach((shaper) => this.panDepth.connect(shaper));

        this.tremoloLfo.frequency.value = 4;
        this.panLfo.frequency.value = 0.2;
        this.tremoloLfo.start();
        this.panLfo.start();
    }

    getNode = () => this.input;

    connect = (destination) => this.merge.connect(destination);

    // depth 0..1: the level swings between 1 and 1 - depth
    setTremoloDepth = (depth) => {
        const d = Math.min(1, Math.max(0, depth));
        this.tremolo.gain.setValueAtTime(1 - d / 2, this.AC.currentTime);
        this.tremoloDepth.gain.setValueAtTime(d / 2, this.AC.currentTime);
    };

    setTremoloRate = (hz) => this.tremoloLfo.frequency.setValueAtTime(Math.min(20, Math.max(0.01, hz)), this.AC.currentTime);

    // depth 0..1: how far left and right the sound travels
    setAutoPanDepth = (depth) => this.panDepth.gain.setValueAtTime(Math.min(1, Math.max(0, depth)), this.AC.currentTime);

    setAutoPanRate = (hz) => this.panLfo.frequency.setValueAtTime(Math.min(20, Math.max(0.01, hz)), this.AC.currentTime);
}

export default Motion;
