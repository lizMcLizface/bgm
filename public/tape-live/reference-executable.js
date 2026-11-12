const {AudioConstructorJournal,settleAudioCleanup}=(()=>{
const requireClean = receipt => {if(receipt && typeof receipt==='object' && (receipt.clean===false||receipt.acknowledged===false||receipt.released===false||receipt.quarantined===true))throw Error('Explicit audio owner returned an unclean retirement receipt');return receipt;};
/** Bounded private constructor ownership. A completed callback is not a claim
 * that an untyped processor released; source capability remains its own actor. */
class AudioConstructorJournal {
    constructor({capacity=256,label='Audio constructor'}={}) {
        if(!Number.isInteger(capacity)||capacity<1||capacity>1024||typeof label!=='string'||!label.length||label.length>100)throw Error('Invalid constructor ownership journal');
        this.capacity=capacity;this.label=label;this.records=[];this.seen=new WeakSet();this.state='open';this.retirement=null;
    }
    create(label,make,release) {
        if(this.state!=='open'||this.records.length>=this.capacity||typeof label!=='string'||!label.length||label.length>100||typeof make!=='function'||typeof release!=='function')throw Error('Constructor ownership admission refused');
        const value=make();if(!value||(typeof value!=='object'&&typeof value!=='function')||this.seen.has(value))throw Error('Constructor returned no independent private owner');
        this.seen.add(value);this.records.push({label,value,release,attempted:false,closed:false,error:null});return value;
    }
    retire() {
        if(this.retirement)return this.retirement;this.state='retiring';let resolve,reject;this.retirement=new Promise((yes,no)=>{resolve=yes;reject=no;});this.retirement.catch(()=>{});const pending=[];
        // Invoke every close before awaiting any of them. Each callback owns only
        // its explicit private actor; no Native context/graph traversal occurs.
        for(const record of this.records.slice().reverse()) {record.attempted=true;let work;try{work=record.release(record.value);if(work===this.retirement)throw Error('Constructor cleanup returned its own retirement fence');}catch(error){work=Promise.reject(error);}pending.push(Promise.resolve(work).then(requireClean).then(()=>{record.closed=true;},error=>{record.error=error;throw error;}));}
        Promise.allSettled(pending).then(results=>{const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);this.state=errors.length?'cleanup-failed':'retired';if(errors.length)reject(new AggregateError(errors,this.label+' cleanup failed'));else resolve({clean:true,profile:'constructor-cleanup-journal-v1',owners:this.records.length});});return this.retirement;
    }
    failure(reason) {
        const error=reason&&typeof reason==='object'?reason:Error(String(reason)),inner=error.cleanupReady,outer=this.retire();
        const cleanupReady=Promise.allSettled([...(inner?.then?[inner]:[]),outer]).then(results=>{const errors=results.flatMap(result=>{if(result.status==='rejected')return[result.reason];try{requireClean(result.value);return[];}catch(error){return[error];}});if(errors.length)throw errors.length===1?errors[0]:new AggregateError(errors,this.label+' nested cleanup failed');return{clean:true,profile:'constructor-cleanup-journal-v1',owners:this.records.length};});
        error.cleanupReady=cleanupReady;cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});return error;
    }
    status(){return {profile:'constructor-cleanup-journal-v1',state:this.state,capacity:this.capacity,owners:this.records.length,records:this.records.map(record=>({label:record.label,attempted:record.attempted,closed:record.closed,error:record.error?String(record.error):null}))};}
}

/** Attempt every explicit private-owner action before observing any result.
 * This is aggregation, not processor termination authority. */
function settleAudioCleanup(label,actions) {
    if(typeof label!=='string'||!Array.isArray(actions)||actions.length>256||actions.some(action=>typeof action!=='function'))throw Error('Invalid bounded audio cleanup actions');
    const pending=actions.map(action=>{try{return Promise.resolve(action()).then(requireClean);}catch(error){return Promise.reject(error);}});
    return Promise.allSettled(pending).then(results=>{const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);if(errors.length)throw new AggregateError(errors,label+' cleanup failed');return {clean:true,profile:'explicit-audio-cleanup-actions-v1',actions:actions.length};});
}

return {AudioConstructorJournal,settleAudioCleanup};
})();

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
        this.ownership=new AudioConstructorJournal({capacity:12,label:'Native Tape'});this.startedSources=new Set();
        try {
        this.AC = AC;
        this.input = this.ownership.create('node-0',()=>AC.createGain(),node=>node.disconnect());
        this.shaper = this.ownership.create('node-1',()=>AC.createWaveShaper(),node=>node.disconnect());
        this.shaper.oversample = '2x';
        this.tone = this.ownership.create('node-2',()=>AC.createBiquadFilter(),node=>node.disconnect());
        this.tone.type = 'lowpass';
        this.tone.Q.value = 0.5;
        this.delay = this.ownership.create('node-3',()=>AC.createDelay(0.02),node=>node.disconnect());
        this.delay.delayTime.value = BASE_DELAY;
        this.input.connect(this.shaper);
        this.shaper.connect(this.tone);
        this.tone.connect(this.delay);

        const lfo = (hz) => {
            const osc = this.ownership.create('LFO',()=>AC.createOscillator(),node=>settleAudioCleanup('Native Tape LFO',[()=>{if(this.startedSources.has(node))node.stop();},()=>node.disconnect()]));
            const depth = this.ownership.create('node-4',()=>AC.createGain(),node=>node.disconnect());
            osc.frequency.value = hz;
            depth.gain.value = 0;
            osc.connect(depth);
            depth.connect(this.delay.delayTime);
            osc.start();this.startedSources.add(osc);
            return { osc, depth };
        };
        this.wow = lfo(0.6);
        this.drift = lfo(0.6 * 0.37);
        this.flutter = lfo(7.3);
        this.flutter2 = lfo(11.7);
        this.setDrive(0);
        this.setTone(9000);
        }catch(error){throw this.ownership.failure(error);}
    }

    dispose = () => this.ownership.retire();
    cleanupStatus = () => this.ownership.status();

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
