import {AudioConstructorJournal} from '../audio/constructorJournal.js';
class Compressor {
    dispose() { return this.ownership.retire(); }
    cleanupStatus() { return this.ownership.status(); }
    constructor(AC, { factory = null, ...runtimeOptions } = {}) {
        this.ownership = new AudioConstructorJournal({capacity:16,label:'Compressor'});
        try {
        if (factory !== null) {
            if (typeof factory !== 'function') throw new TypeError('Compressor factory must be a prepared function');
            let stage;
            try {
                stage = factory(AC, runtimeOptions);
                if (!stage || typeof stage.getNode !== 'function' || typeof stage.connect !== 'function')
                    throw new TypeError('Compressor factory must return a synchronous stage');
            } catch(error) {
                if(stage && (typeof stage==='object'||typeof stage==='function'))this.ownership.create('invalid-factory-stage',()=>stage,owner=>{if(typeof owner.dispose!=='function')throw Error('Invalid compressor stage has no cleanup authority');return owner.dispose();});
                throw error;
            }
            return stage;
        }
        this.AC = AC;
        this.node = this.ownership.create('node',()=>this.AC.createDynamicsCompressor(),node=>node.disconnect());
        this.node.attack.value = 0.005;
        this.node.release.value = 0.05;
        } catch(error) { throw this.ownership.failure(error); }
    }

    connect = (destination) => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => this.node.connect(dest));
        } else {
            this.node.connect(destination);
        }
    }

    // Getters
    getNode = () => this.node;
    getThreshold = () => this.node.threshold.value;
    getRatio = () => this.node.ratio.value;

    // Setters
    setKnee = (val) => {
        this.node.knee.setValueAtTime(val, this.AC.currentTime);
    }
    setThreshold = (val) => {
        this.node.threshold.setValueAtTime(val, this.AC.currentTime);
    }
    setRatio = (val) => {
        this.node.ratio.setValueAtTime(val, this.AC.currentTime);
    }
    setAttack = (val) => {
        this.node.attack.setValueAtTime(val, this.AC.currentTime);
    }
    setRelease = (val) => {
        this.node.release.setValueAtTime(val, this.AC.currentTime);
    }
}

export default Compressor;
