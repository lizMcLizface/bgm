import Gain from './gain';
import Reverb, { MIN_WET } from './reverb';

// One reverb for all the voices, a choice in the ⚙ menu's Performance section
// (audio/performance.js). Normally every instrument has a convolver of its own
// (a few tens of MB and a share of the audio thread each, see reverb.js);
// here a voice only *sends* to a convolver that is shared by every voice
// using the same impulse - typically two or three convolvers for five voices.
//
//   instrument stage input -> dry (as always) ......................> chain
//                         \-> send (wet level) -> level -> hub bus -> master
//
// The wet signal leaves each voice at the reverb's place in its chain and
// comes back at the master, so it skips what follows in the chain (EQ, the
// master filter, the limiter) and the role's section-tone filter and wander.
// `level` follows the role's volume and mute (Generator.applyMix), so a muted
// or turned-down voice sends no reverb. A close approximation of the full
// version, not the same sound.
//
// SendReverb offers what Reverb does to Instrument and DrumKit (amount, type,
// getNode / connect for the chain, defer / hear, settled), so they use either.

class ReverbHub {
    constructor(AC) {
        this.AC = AC;
        this.output = AC.createGain();
        this.buses = new Map();
    }

    connect(destination) {
        this.output.connect(destination);
    }

    /** The convolver for an impulse type, made (and its impulse loaded) on first use. */
    bus(type) {
        if (!this.buses.has(type)) {
            const reverb = new Reverb(this.AC);
            reverb.setType(type);
            reverb.setAmount(1); // fully wet: the voices' dry sound goes the other way
            reverb.connect(this.output);
            this.buses.set(type, reverb);
        }
        return this.buses.get(type);
    }

    /** Drops what the convolvers are ringing with (as Instrument.flushTails). */
    flushTails() {
        this.buses.forEach((reverb) => {
            const impulse = reverb.node.buffer;
            if (impulse) reverb.node.buffer = impulse;
        });
    }
}

const hubs = new WeakMap();
/** The shared reverbs of an AudioContext. */
export function hubFor(AC) {
    if (!hubs.has(AC)) hubs.set(AC, new ReverbHub(AC));
    return hubs.get(AC);
}

export class SendReverb {
    constructor(AC, hub = hubFor(AC)) {
        this.AC = AC;
        this.hub = hub;
        this.shared = true;
        this.type = 'reverb1';
        this.amount = 0;
        this.deferred = false;
        this.dryGain = new Gain(AC);
        this.sendGain = new Gain(AC);
        this.levelGain = new Gain(AC);
        this.sendGain.connect(this.levelGain.getNode());
        // the bus the level feeds, and whether the voice is awake (a sleeping
        // voice's send is cut so the chain before it can stop rendering)
        this.bus = null;
        this.asleep = true;
        this.setAmount(0);
    }

    // The same dry / wet law as Reverb.setAmount.
    setAmount = (val) => {
        this.amount = val;
        this.dryGain.setGain(val < 0.5 ? 1 : 1 - (val - 0.5) * 2);
        this.sendGain.setGain(val < 0.5 ? val * 2 : 1);
        this.route();
    };

    setType = (val) => {
        this.type = val;
        this.route();
    };

    getNode = () => [this.dryGain.getNode(), this.sendGain.getNode()];

    // (only the dry sound goes on down the chain)
    connect = (destination) => {
        [].concat(destination).forEach((node) => this.dryGain.connect(node));
    };

    /** The role's volume (and mute) for what it sends. */
    setLevel(value) {
        this.levelGain.getNode().gain.setTargetAtTime(value, this.AC.currentTime, 0.02);
    }

    defer() {
        this.deferred = true;
    }

    hear() {
        if (!this.deferred) return;
        this.deferred = false;
        this.route();
    }

    /** Awake: the voice sounds, or its tail does. */
    setAwake(awake) {
        this.asleep = !awake;
        this.route();
    }

    get wanted() {
        return !this.deferred && this.amount >= MIN_WET;
    }

    // Connects the level to the bus for the current type - or to none.
    route() {
        const bus = this.wanted ? this.hub.bus(this.type) : null;
        const target = bus && !this.asleep ? bus : null;
        if (target === this.bus) return;
        if (this.bus) this.levelGain.disconnect();
        this.bus = target;
        if (target) this.levelGain.connect(target.node);
    }

    get settled() {
        return !this.wanted || Boolean(this.hub.bus(this.type).node.buffer);
    }

    // What Instrument.tailSeconds and flushTails look at: nothing here, the hub owns the tails.
    get node() {
        return { buffer: null };
    }
}
