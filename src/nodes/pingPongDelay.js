import {AudioConstructorJournal} from '../audio/constructorJournal.js';
import Gain from './gain';
import Filter from './filter';

const MAX_DELAY_TIME = 1;

class PingPongDelay {
    dispose() { return this.ownership.retire(); }
    cleanupStatus() { return this.ownership.status(); }
    constructor(AC) {
        this.ownership = new AudioConstructorJournal({capacity:16,label:'PingPongDelay'});
        try {
        this.AC = AC;
        this.dryGain = this.ownership.create('dryGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.wetGain = this.ownership.create('wetGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());

        this.leftDelay = this.ownership.create('leftDelay',()=>this.AC.createDelay(),node=>node.disconnect());
        this.preDelay = this.ownership.create('preDelay',()=>this.AC.createDelay(),node=>node.disconnect());
        this.rightDelay = this.ownership.create('rightDelay',()=>this.AC.createDelay(),node=>node.disconnect());
        this.leftFeedbackGain = this.ownership.create('leftFeedbackGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.rightFeedbackGain = this.ownership.create('rightFeedbackGain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());
        this.channelMerger = this.ownership.create('channelMerger',()=>this.AC.createChannelMerger(2),node=>node.disconnect());
        this.tone = this.ownership.create('tone',()=>new Filter(this.AC),owner=>owner.dispose());

        this.preDelay.connect(this.rightDelay);

        this.leftDelay.connect(this.channelMerger, 0, 0);
        this.rightDelay.connect(this.channelMerger, 0, 1);

        this.leftDelay.connect(this.leftFeedbackGain.getNode());
        this.leftFeedbackGain.connect(this.rightDelay);

        this.rightDelay.connect(this.rightFeedbackGain.getNode());
        this.rightFeedbackGain.connect(this.leftDelay);

        this.channelMerger.connect(this.tone.getNode());
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
    getNode = () => [this.dryGain.getNode(), this.leftDelay, this.preDelay];
    getAmount = () => this.amount;
    getDelayTime = () => this.leftDelay.delayTime.value;
    getTone = () => this.tone.getFreq();
    getFeedback = () => this.leftFeedbackGain.getGain();

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
    setFeedback = (val) => {
        val = Math.max(0, Math.min(0.95, val)); // below runaway
        this.leftFeedbackGain.setGain(val);
        this.rightFeedbackGain.setGain(val);
    }
    setTone = (val) => this.tone.setFreq(val);
    setDelayTime = (val) => {
        if (val < 0 || val > MAX_DELAY_TIME) return false;
        this.leftDelay.delayTime.setValueAtTime(val, this.AC.currentTime);
        this.preDelay.delayTime.setValueAtTime(val, this.AC.currentTime);
        this.rightDelay.delayTime.setValueAtTime(val, this.AC.currentTime);
    }
}

export default PingPongDelay;
