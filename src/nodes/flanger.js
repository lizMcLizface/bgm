import {AudioConstructorJournal,settleAudioCleanup} from '../audio/constructorJournal.js';
import Gain from './gain';
import LFO from './lfo';

const MAX_DELAY_TIME = 1;

class Flanger {
    constructor(AC) {
        this.ownership = new AudioConstructorJournal({capacity:6,label:'Native flanger'});
        try {
        this.AC = AC;
        this.dryGain = this.ownership.create('gain-0',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.wetGain = this.ownership.create('gain-1',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());

        this.inputGain = this.ownership.create('gain-2',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.delay = this.ownership.create('delay-5',()=>this.AC.createDelay(),node=>node.disconnect());
        this.feedback = this.ownership.create('gain-3',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.lfo = this.ownership.create('lfo-4',()=>new LFO(this.AC),owner=>owner.dispose());

        this.inputGain.connect(this.delay);
        this.inputGain.connect(this.wetGain.getNode());

        this.delay.connect(this.feedback.getNode());
        this.delay.connect(this.wetGain.getNode());

        this.feedback.connect(this.inputGain.getNode());

        this.lfo.connect(this.delay.delayTime);
        this.lfo.start();
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

    dispose = () => this.ownership.retire();
    cleanupStatus = () => this.ownership.status();

    // Getters
    getNode = () => [this.dryGain.getNode(), this.inputGain.getNode()];
    getAmount = () => this.amount;
    getDelay = () => this.delay.delayTime.value;
    getDepth = () => this.lfo.getDepth();
    getFeedback = () => this.feedback.getGain();
    getRate = () => this.lfo.getRate();

    // Setters
    setAmount = (val) => {
        this.amount = val;
        this.dryGain.setGain(1 - val);
        this.wetGain.setGain(val);
    }
    setFeedback = (val) => this.feedback.setGain(Math.max(-0.9, Math.min(0.9, val))); // below runaway
    setRate = (val) => this.lfo.setRate(val);
    setDepth = (val) => this.lfo.setDepth(val);
    setDelay = (val) => {
        if (val < 0 || val > MAX_DELAY_TIME) return false;
        this.delay.delayTime.setValueAtTime(val, this.AC.currentTime);
    }
}

export default Flanger;
