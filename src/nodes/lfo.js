import Gain from './gain';
import Oscillator from './oscillator';
import {ControlClock} from '../app/engine/controlSnapshot';

const MAX_RATE = 100;
const MAX_DEPTH = 1000;

class LFO {
    constructor(AC) {
        this.AC = AC;

        this.depth = new Gain(this.AC);
        this.osc = new Oscillator(this.AC);
        this.osc.setType('sine');
        this.captureClock = new ControlClock(AC.currentTime,440,0,1);
        this.captureType = 'sine';

        this.osc.connect(this.depth.getNode());
    }

    connect = (destination) => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => this.depth.connect(dest));
        } else {
            this.depth.connect(destination);
        }
    }
    start = () => {this.captureClock.start(this.AC.currentTime);this.osc.start();};
    captureSettings = () => ({...this.captureClock.settings(),type:this.captureType});
    captureControl = time => {if(this.captureType!=='sine')throw Error('Unsupported vibrato waveform');return this.captureClock.capture(time);};

    captureLiveControl = time => {if(this.captureType!=='sine')throw Error('Unsupported vibrato waveform');return this.captureClock.captureLive(time);};
    getNode = () => this.osc.getNode();
    getDepthNode = () => this.depth.getNode();
    getRate = () => this.osc.getFreq();
    getDepth = () => this.depth.getGain();

    // Setters
    setRate = val => {
        if (val < 0 || val > MAX_RATE) return false;
        this.captureClock.rate(val,this.AC.currentTime+.001,this.AC.currentTime);
        this.osc.setFreq(val);
    }
    setDepth = val => {
        if (val < 0 || val > MAX_DEPTH) return false;
        this.captureClock.depth(val,this.AC.currentTime);
        this.depth.setGain(val);
    }
    setType = type => {this.captureType=type;this.osc.setType(type);};
}

export default LFO;
