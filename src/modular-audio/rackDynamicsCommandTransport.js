import { authoredRackFrame, RACK_TARGET_SEQUENCE_MAX, RACK_TARGET_FRAME_MAX } from './rackDynamicsTargetTransport.js';

// Per-lane authored times and a 32-command acknowledgement window, without
// materialising 288 AudioParams in every compressor/limiter callback.
export const RACK_COMMAND_SLOTS = 32;
export class RackDynamicsCommandWriter {
    constructor(port, context) {
        this.profile = 'acknowledged32-authored-lane-messages';
        this.port = port; this.context = context; this.sequence = 0;
        this.observedSequence = 0; this.lastFrame = null; this.frameEdits = 0;
    }
    preflight(count, seconds) {
        if (!Number.isInteger(count) || count < 1 || count > RACK_COMMAND_SLOTS ||
            this.sequence - this.observedSequence + count > RACK_COMMAND_SLOTS) throw Error('Whole rack patch exceeds unobserved control capacity');
        if (this.sequence + count > RACK_TARGET_SEQUENCE_MAX) throw Error('Rack target sequence exhausted');
        const frame = authoredRackFrame(this.context, seconds);
        if (this.lastFrame !== null && frame < this.lastFrame) throw Error('Rack authored context moved backwards');
        if (this.lastFrame === frame && this.frameEdits + count > RACK_COMMAND_SLOTS) throw Error('Whole rack patch exceeds same-quantum capacity');
        return frame;
    }
    post(values, { initial = false, seconds = this.context.currentTime } = {}) {
        if (!Array.isArray(values) || values.length !== 2 || !Number.isInteger(values[0]) || values[0] < 0 || values[0] > 6 ||
            !Number.isFinite(values[1]) || values[1] < -100 || values[1] > 40 || typeof initial !== 'boolean') throw Error('Invalid rack command');
        const frame = this.preflight(1, seconds), sequence = this.sequence + 1;
        this.port.postMessage({ kind: 'authored-lane', sequence, frame, lane: values[0], value: Math.fround(values[1]), initial });
        this.frameEdits = this.lastFrame === frame ? this.frameEdits + 1 : 1;
        this.lastFrame = frame; this.sequence = sequence;
        return sequence;
    }
    acknowledge(sequence) {
        if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > this.sequence) throw Error('Invalid rack command observation watermark');
        this.observedSequence = Math.max(this.observedSequence, sequence);
    }
}

export class RackDynamicsCommandReader {
    constructor() {
        this.sequence = 0; this.receivedSequence = 0; this.lastReceivedFrame = null; this.count = 0;
        this.queuedFrames = new Float64Array(RACK_COMMAND_SLOTS);
        this.queuedValues = new Float64Array(RACK_COMMAND_SLOTS * 2);
        this.queuedInitials = new Uint8Array(RACK_COMMAND_SLOTS);
        this.frames = new Float64Array(RACK_COMMAND_SLOTS);
        this.values = new Float64Array(RACK_COMMAND_SLOTS * 2);
        this.initials = new Uint8Array(RACK_COMMAND_SLOTS);
        this.lastVisibleSequence = 0;
        this.deferredQuanta = this.deferredStreak = this.maxDeferredStreak = this.deferredSequence = 0;
        this.deferredReason = this.deferredWord = null;
    }
    receive({ sequence, frame, lane, value, initial }) {
        if (!Number.isSafeInteger(sequence) || sequence !== this.receivedSequence + 1 || sequence > RACK_TARGET_SEQUENCE_MAX ||
            sequence - this.sequence > RACK_COMMAND_SLOTS || !Number.isSafeInteger(frame) || frame < 0 || frame % 128 ||
            frame > RACK_TARGET_FRAME_MAX || this.lastReceivedFrame !== null && frame < this.lastReceivedFrame ||
            !Number.isInteger(lane) || lane < 0 || lane > 6 || !Number.isFinite(value) || value < -100 || value > 40 ||
            Math.fround(value) !== value || typeof initial !== 'boolean') throw Error('Invalid or overflowing authored rack command');
        const slot = (sequence - 1) % RACK_COMMAND_SLOTS;
        this.queuedFrames[slot] = frame; this.queuedValues[slot * 2] = lane; this.queuedValues[slot * 2 + 1] = value;
        this.queuedInitials[slot] = Number(initial); this.receivedSequence = sequence; this.lastReceivedFrame = frame;
    }
    read(_parameters, frame) {
        if (!Number.isSafeInteger(frame) || frame < 0 || frame % 128) throw Error('Rack command reader requires canonical epoch');
        this.count = 0; this.lastVisibleSequence = this.receivedSequence;
        while (this.sequence < this.receivedSequence) {
            const slot = this.sequence % RACK_COMMAND_SLOTS, authored = this.queuedFrames[slot];
            if (authored > frame) break;
            const at = this.count++;
            this.frames[at] = authored; this.values[at * 2] = this.queuedValues[slot * 2];
            this.values[at * 2 + 1] = this.queuedValues[slot * 2 + 1]; this.initials[at] = this.queuedInitials[slot];
            this.sequence++;
        }
        return this.count;
    }
}
