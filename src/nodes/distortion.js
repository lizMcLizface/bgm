import {AudioConstructorJournal} from '../audio/constructorJournal.js';
import Gain from './gain';

const MAX_DIST = 30;

const createDistCurve = (gain = 0) => {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);

    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        curve[i] = (3 + gain) * Math.atan(Math.sinh(x * 0.25) * 5) / (Math.PI + gain * Math.abs(x));
    }
    return curve;
};

class Distortion {
    dispose() { return this.ownership.retire(); }
    cleanupStatus() { return this.ownership.status(); }
    constructor(AC) {
        this.ownership = new AudioConstructorJournal({capacity:16,label:'Distortion'});
        try {
        this.AC = AC;
        this.dryGain = this.ownership.create('dryGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.wetGain = this.ownership.create('wetGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());

        this.node = this.ownership.create('node',()=>this.AC.createWaveShaper(),node=>node.disconnect());
        this.node.curve = createDistCurve();
        this.node.oversample = 'none';

        this.node.connect(this.wetGain.getNode());

        this.distortion = 0;

        this.setDistortion(0);
        this.setAmount(0);
        } catch(error) { throw this.ownership.failure(error); }
    }

    connect = destination => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => {
                this.dryGain.connect(dest);
                this.wetGain.connect(dest);
            });
        } else {
            this.dryGain.connect(destination);
            this.wetGain.connect(destination);
        }
    }

    // Getters
    getNode = () => [this.dryGain.getNode(), this.node];
    getDistortion = () => this.distortion;
    getAmount = () => this.wetGain.getGain();

    // Setters
    setDistortion = val => {
        if (val < 0 || val > MAX_DIST) return false;
        this.distortion = val;
        this.node.curve = createDistCurve(val);
    }
    setAmount = val => {
        this.dryGain.setGain(1 - val);
        this.wetGain.setGain(val);
    }
}

export default Distortion;
