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
        this.ownership = new AudioConstructorJournal({capacity:12,label:'Native motion'});
        try {
        this.startedSources = new Set();
        this.AC = AC;
        this.input = this.ownership.create('node-0',()=>AC.createGain(),node=>node.disconnect());
        this.tremolo = this.ownership.create('node-1',()=>AC.createGain(),node=>node.disconnect());
        // always two channels into the splitter (a mono input is upmixed)
        this.tremolo.channelCount = 2;
        this.tremolo.channelCountMode = 'explicit';
        this.input.connect(this.tremolo);
        const split = this.ownership.create('node-2',()=>AC.createChannelSplitter(2),node=>node.disconnect());
        this.merge = this.ownership.create('node-3',()=>AC.createChannelMerger(2),node=>node.disconnect());
        this.tremolo.connect(split);
        this.sides = ['left', 'right'].map((side, ch) => {
            const gain = this.ownership.create('node-4',()=>AC.createGain(),node=>node.disconnect());
            gain.gain.value = 0; // driven by the shaper (1 at centre)
            split.connect(gain, ch);
            gain.connect(this.merge, 0, ch);
            const shaper = this.ownership.create('node-5',()=>AC.createWaveShaper(),node=>node.disconnect());
            shaper.curve = balanceCurve(side);
            shaper.connect(gain.gain);
            return shaper;
        });

        this.tremoloLfo = this.ownership.create('oscillator-8',()=>AC.createOscillator(),node=>settleAudioCleanup('Native Motion oscillator',[()=>{if(this.startedSources.has(node))node.stop();},()=>node.disconnect()]));
        this.tremoloDepth = this.ownership.create('node-6',()=>AC.createGain(),node=>node.disconnect());
        this.tremoloDepth.gain.value = 0;
        this.tremoloLfo.connect(this.tremoloDepth);
        this.tremoloDepth.connect(this.tremolo.gain);

        this.panLfo = this.ownership.create('oscillator-9',()=>AC.createOscillator(),node=>settleAudioCleanup('Native Motion oscillator',[()=>{if(this.startedSources.has(node))node.stop();},()=>node.disconnect()]));
        this.panDepth = this.ownership.create('node-7',()=>AC.createGain(),node=>node.disconnect());
        this.panDepth.gain.value = 0;
        this.panLfo.connect(this.panDepth);
        this.sides.forEach((shaper) => this.panDepth.connect(shaper));

        this.tremoloLfo.frequency.value = 4;
        this.panLfo.frequency.value = 0.2;
        this.tremoloLfo.start();this.startedSources.add(this.tremoloLfo);
        this.panLfo.start();this.startedSources.add(this.panLfo);
        } catch(error) { throw this.ownership.failure(error); }
    }

    dispose = () => this.ownership.retire();
    cleanupStatus = () => this.ownership.status();

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
