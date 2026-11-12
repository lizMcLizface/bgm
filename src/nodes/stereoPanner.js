import {AudioConstructorJournal} from '../audio/constructorJournal.js';
import Gain from './gain';

class StereoPanner {
    dispose() { return this.ownership.retire(); }
    cleanupStatus() { return this.ownership.status(); }
    constructor(AC) {
        this.ownership = new AudioConstructorJournal({capacity:16,label:'StereoPanner'});
        try {
        this.AC = AC;
        this.node = this.ownership.create('node',()=>this.AC.createStereoPanner(),node=>node.disconnect());
        this.gain = this.ownership.create('gain',()=>new Gain(this.AC),owner=>owner.getNode().disconnect());

        this.node.connect(this.gain.getNode());
        this.gain.setGain(1.5); // Compensation, panner reduces volume a bit for some reason
        } catch(error) { throw this.ownership.failure(error); }
    }

    connect = (destination) => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => this.gain.connect(dest));
        } else {
            this.gain.connect(destination);
        }
    }

    disconnect = () => {
        try {
            this.gain.getNode().disconnect();
        } catch (e) {
            console.warn('Failed to disconnect StereoPanner:', e);
        }
    }

    // Getters
    getNode = () => this.node;
    getPan = () => this.node.pan.value;

    // Setters
    setPan = val => {
        this.node.pan.setValueAtTime(val, this.AC.currentTime);
    }
}

export default StereoPanner;
