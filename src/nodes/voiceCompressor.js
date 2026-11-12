import {AudioConstructorJournal} from '../audio/constructorJournal.js';
// A one-knob compressor for a voice: Amount lowers the threshold (0 dB at 0, -36 dB at 1) and
// gives back most of what it takes from a sound around -18 dBFS, so turning it up evens the
// sound out rather than making it much quieter or louder. (A DynamicsCompressorNode adds a
// make-up gain of its own, from its threshold and ratio; that is taken back out first.) Ratio,
// attack, release and an output trim shape it further. The Instrument routes around the stage
// while the amount is 0.

const RANGE_DB = 36;
const KNEE_DB = 6;

class VoiceCompressor {
    constructor(AC) {
        this.ownership=new AudioConstructorJournal({capacity:2,label:'Native VoiceCompressor'});this.disposed=false;
        try {
        this.AC = AC;
        this.node = this.ownership.create('compressor',()=>AC.createDynamicsCompressor(),node=>node.disconnect());
        this.node.knee.value = KNEE_DB;
        this.makeup = this.ownership.create('makeup',()=>AC.createGain(),node=>node.disconnect());
        this.node.connect(this.makeup);
        this.amount = 0;
        this.ratio = 4;
        this.trim = 0;
        this.update();
        }catch(error){this.disposed=true;throw this.ownership.failure(error);}
    }
    check(){if(this.disposed)throw Object.assign(Error('Native VoiceCompressor disposed'),{code:'AUDIO_OWNER_DISPOSED'});}
    dispose(){this.disposed=true;return this.ownership.retire();}
    cleanupStatus(){return this.ownership.status();}

    getNode = () => this.node;
    connect = (destination) => {this.check();return [].concat(destination).forEach((d) => this.makeup.connect(d));};
    /** dB the compressor is taking off right now (for a meter). */
    reduction = () => this.node.reduction;

    update() {
        this.check();
        const now = this.AC.currentTime;
        const threshold = -this.amount * RANGE_DB;
        this.node.threshold.setTargetAtTime(threshold, now, 0.02);
        this.node.ratio.setTargetAtTime(this.ratio, now, 0.02);
        const slope = 1 - 1 / this.ratio;
        const builtIn = 0.6 * -threshold * slope;
        const typical = Math.max(0, -18 - threshold) * slope;
        const makeupDb = -builtIn + typical * 0.85 + this.trim;
        this.makeup.gain.setTargetAtTime(10 ** (makeupDb / 20), now, 0.02);
    }

    setAmount = (v) => { this.check(); this.amount = Math.min(1, Math.max(0, v)); this.update(); };
    setRatio = (v) => { this.check(); this.ratio = Math.min(20, Math.max(1, v)); this.update(); };
    setTrim = (db) => { this.check(); this.trim = Math.min(18, Math.max(-18, db)); this.update(); };
    setAttack = (s) => {this.check();return this.node.attack.setTargetAtTime(Math.min(1, Math.max(0.001, s)), this.AC.currentTime, 0.02);};
    setRelease = (s) => {this.check();return this.node.release.setTargetAtTime(Math.min(1, Math.max(0.01, s)), this.AC.currentTime, 0.02);};
}

export default VoiceCompressor;
