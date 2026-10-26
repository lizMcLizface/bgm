// The Wasm engine's rooms for the native (JS) voices: the effects kernel's FDN room (synth-lab/effects.js)
// instead of a convolver on a recorded impulse, so nothing is fetched and no multi-megabyte impulse is held.
// The drum kits use it, and so do the native voices the Wasm engine still runs (library sounds that need the
// native source, see labs/voice.js).
//
// Each of the six room types is the kernel's settings, fitted to the recording the type used to be
// (tools/fitFdnRoom.mjs): its decay, how many early reflections, how wide, how bright, and how loud. A
// preset's own controls act as they do on a convolver: decay shortens the room, damping darkens it, and
// pre-delay adds to it (nodes/reverb.js RoomColour).
//
// It stands where a Reverb or SendReverb stood: a dry path and a send, both taken from the voice's bus, and a
// wet return, all joined at `connect`. Where the kernel cannot run (no AudioWorklet, no WebAssembly, a failed
// load) the recorded room takes over, so a voice never loses its room.
import * as Nodes from '../../nodes';
import { MIN_WET, ROOM_DEFAULTS, RoomColour } from '../../nodes/reverb';
import { SendReverb } from '../../nodes/sharedReverb';
import { createEffectsBus } from '../../synth-lab/effects';

/** Rooms as effects-kernel settings, plus the send's high-pass `hp` and low-pass `lp` in Hz. */
export const FDN_ROOMS = {
    // near-mono hall, dark
    reverb1: { decay: 4.27, size: 0.44, damping: 8780, predelay: 0.5, width: 0.15, modulation: 0.11, reverbReturn: 3, reflections: 1.01, hp: 113, lp: 2080 },
    // near-mono, late onset
    reverb2: { decay: 3.35, size: 0.5, damping: 12150, predelay: 37, width: 0.1, modulation: 0.36, reverbReturn: 6.3, reflections: 0.14, hp: 96, lp: 1500 },
    // tight room, strong early reflections (the drums)
    reverb3: { decay: 1.47, size: 0.49, damping: 6890, predelay: 0, width: 1, modulation: 0.34, reverbReturn: -3.8, reflections: 1.93, hp: 259, lp: 8520 },
    // wide, bright, long hall (the kernel keeps the ears a little closer than the recording)
    reverb4: { decay: 3.81, size: 0.44, damping: 7480, predelay: 30.1, width: 1, modulation: 0.25, reverbReturn: -4, reflections: 2.34, hp: 167, lp: 5750 },
    // short plate-like
    reverb5: { decay: 2.12, size: 0.57, damping: 8710, predelay: 43.3, width: 0.25, modulation: 0.19, reverbReturn: 1.3, reflections: 1.24, hp: 113, lp: 2850 },
    // very early-heavy and wide (the recording is out of phase between the ears, which the kernel cannot be; its decay is also short)
    reverb6: { decay: 1.37, size: 0.42, damping: 10160, predelay: 0, width: 1, modulation: 0.19, reverbReturn: -5.1, reflections: 2.2, hp: 179, lp: 9660 },
};

const TAIL_EXTRA = 0.5;

/** The kernel can run here. */
export const fdnRoomSupported = (context) => Boolean(context?.audioWorklet) && typeof WebAssembly === 'object';

/** What a drum kit's room is: the FDN where the kernel runs, the convolver (shared through the hub, if any) where not. */
export function makeDrumRoom(context, reverbHub = null) {
    if (fdnRoomSupported(context)) return new FdnRoom(context);
    return reverbHub ? new SendReverb(context, reverbHub) : new Nodes.Reverb(context);
}

export default class FdnRoom {
    constructor(AC, type = 'reverb3') {
        this.AC = AC;
        this.type = type;
        this.amount = 0;
        this.decay = ROOM_DEFAULTS.decay;
        this.deferred = false;
        this.disposed = false;
        this.failed = false;
        this.bus = null;
        this.starting = null;
        this.fallback = null;
        this.dryGain = AC.createGain();
        this.sendGain = AC.createGain();
        this.colour = new RoomColour(AC);
        this.highpass = AC.createBiquadFilter();
        this.highpass.type = 'highpass';
        this.highpass.Q.value = Math.SQRT1_2;
        this.lowpass = AC.createBiquadFilter();
        this.lowpass.type = 'lowpass';
        this.lowpass.Q.value = Math.SQRT1_2;
        this.out = AC.createGain();
        this.sendGain.connect(this.colour.input);
        this.colour.connect(this.highpass);
        this.highpass.connect(this.lowpass);
        this.setAmount(0);
        this.patch();
    }

    get room() {
        return FDN_ROOMS[this.type] ?? FDN_ROOMS.reverb3;
    }

    get wanted() {
        return !this.deferred && this.amount >= MIN_WET;
    }

    get settled() {
        return !this.wanted || Boolean(this.bus) || this.failed;
    }

    /** What a voice's tail timer and flush look for in a convolver; here the room tells its own length. */
    get node() {
        return { buffer: null };
    }

    getNode = () => [this.dryGain, this.sendGain];

    connect = (destination) => {
        [].concat(destination).forEach((node) => {
            this.dryGain.connect(node);
            this.out.connect(node);
        });
    };

    disconnect = () => {
        this.dryGain.disconnect();
        this.out.disconnect();
    };

    // The same dry / wet law as Reverb.setAmount.
    setAmount = (val) => {
        this.amount = val;
        this.dryGain.gain.value = val < 0.5 ? 1 : 1 - (val - 0.5) * 2;
        this.sendGain.gain.value = val < 0.5 ? val * 2 : 1;
        this.ensureRoom();
    };

    setType = (val) => {
        if (!FDN_ROOMS[val] || val === this.type) return;
        this.type = val;
        this.fallback?.setType(val);
        this.patch();
    };

    setDecay = (seconds) => {
        this.decay = Math.max(0.3, seconds);
        this.fallback?.setDecay(this.decay);
        this.patch();
    };

    setPredelay = (seconds) => {
        this.colour.setPredelay(seconds);
        this.fallback?.setPredelay(seconds);
    };

    setDamping = (hz) => {
        this.colour.setDamping(hz);
        this.fallback?.setDamping(hz);
    };

    defer() {
        this.deferred = true;
    }

    hear() {
        if (!this.deferred) return;
        this.deferred = false;
        this.ensureRoom();
    }

    setAwake() {}

    /** Seconds the room keeps sounding after its input stops. */
    tailSeconds() {
        return Math.min(this.room.decay, this.decay) + this.room.predelay / 1000 + TAIL_EXTRA;
    }

    flush() {
        this.bus?.clear();
        const impulse = this.fallback?.node.buffer;
        if (impulse) this.fallback.node.buffer = impulse;
    }

    // the room's settings, as the kernel takes them: send in, wet out
    settings() {
        const room = { ...this.room };
        delete room.hp;
        delete room.lp;
        // a preset's decay only shortens a room (as it does an impulse), never lengthens it
        room.decay = Math.min(room.decay, this.decay);
        return { ...room, dry: 0, reverb: 0.8, delay: 0, delayToReverb: 0, quality: 0, bypass: 0 };
    }

    patch() {
        this.highpass.frequency.value = this.room.hp;
        this.lowpass.frequency.value = this.room.lp;
        this.bus?.patch(this.settings());
    }

    ensureRoom() {
        if (!this.wanted || this.bus || this.starting || this.failed || this.disposed) return;
        this.starting = createEffectsBus(this.AC, this.settings(), { onError: (error) => this.fail(error) })
            .then((bus) => {
                if (this.disposed || this.failed) return bus.dispose();
                this.bus = bus;
                this.lowpass.connect(bus.node, 0, 1);
                bus.node.connect(this.out);
                return undefined;
            })
            .catch((error) => this.fail(error));
    }

    // The kernel failed: the recorded room, from now on.
    fail(error) {
        if (this.failed || this.disposed) return;
        this.failed = true;
        console.warn('Wasm room unavailable; using the recorded room.', error);
        this.bus?.dispose();
        this.bus = null;
        this.lowpass.disconnect();
        const room = new Nodes.Reverb(this.AC);
        room.setType(this.type);
        room.setDecay(this.decay);
        room.setAmount(1);
        this.sendGain.disconnect();
        this.sendGain.connect(room.getNode()[1]);
        room.connect(this.out);
        this.fallback = room;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.bus?.dispose();
        this.bus = null;
        this.lowpass.disconnect();
        this.sendGain.disconnect();
        this.disconnect();
        this.fallback?.disconnect?.();
    }
}
