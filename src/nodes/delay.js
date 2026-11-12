import {AudioConstructorJournal} from '../audio/constructorJournal.js';
import Gain from './gain';
import Filter from './filter';

const MAX_DELAY_TIME = 1;

class Delay {
    dispose() { return this.ownership.retire(); }
    cleanupStatus() { return this.ownership.status(); }
    constructor(AC) {
        this.ownership = new AudioConstructorJournal({capacity:16,label:'Delay'});
        try {
        this.AC = AC;
        this.dryGain = this.ownership.create('dryGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.wetGain = this.ownership.create('wetGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());

        this.delay = this.ownership.create('delay',()=>this.AC.createDelay(),node=>node.disconnect());
        this.feedbackGain = this.ownership.create('feedbackGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.tone = this.ownership.create('tone',()=>new Filter(this.AC),owner=>owner.dispose());

        this.delay.connect(this.feedbackGain.getNode());
        this.feedbackGain.connect(this.tone.getNode());
        this.feedbackGain.connect(this.delay);
        this.tone.connect(this.wetGain.getNode());

        this.amount = 0;

        this.setAmount(0);
        this.setFeedback(0);
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
    getNode = () => [this.dryGain.getNode(), this.delay];
    getAmount = () => this.amount;
    getDelayTime = () => this.delay.delayTime.value;
    getTone = () => this.tone.getFreq();
    getFeedback = () => this.feedbackGain.getGain();

    // Setters
    setAmount = (val) => {
        this.amount = val;
        if (val < 0.5) {
            this.dryGain.setGain(1);
            this.wetGain.setGain(val * 2);
        } else {
            this.dryGain.setGain(1 - ((val - 0.5) * 2));
            this.wetGain.setGain(1);
        }
    }
    setFeedback = (val) => this.feedbackGain.setGain(Math.max(0, Math.min(0.95, val))); // below runaway
    setTone = (val) => this.tone.setFreq(val);
    setDelayTime = (val) => {
        if (val < 0 || val > MAX_DELAY_TIME) return false;
        this.delay.delayTime.setValueAtTime(val, this.AC.currentTime);
    }
}

export default Delay;
