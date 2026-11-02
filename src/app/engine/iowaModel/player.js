// Plays the Iowa instruments (docs/IOWA_INSTRUMENTS.md) in a worklet, held notes from wavetables and struck notes as decaying partials, everything into
// one room. A note's numbers are built here once and handed over; nothing is rendered ahead, so a key sounds at once.
import workletUrl from './iowa.worklet.js?worker&url';
import { heldModel, heldVoice, decayModel, decayVoice, settleLevels } from './model.js';
import { LAYERS, PATCHES } from './patches.js';
import LEVELS from '../../../library/iowaLevels.json';

const TABLES = import.meta.glob('../../../library/iowaTables/*.json');
const STRENGTHS = 12;                  // velocities are rounded to this many steps, so a note's tables can be kept
const trimOf = (id, midi) => (LEVELS[id]?.trim ?? 0) + (LEVELS[id]?.curve?.[midi] ?? 0);     // dB: the instrument to its class, this key to the instrument (tools/measureIowaLevels.mjs)
const quantise = (velocity) => Math.max(1, Math.round(Math.round(velocity * STRENGTHS) / STRENGTHS * 127));

export async function loadTable(id) {
    const load = TABLES[`../../../library/iowaTables/${id}.json`];
    if (!load) throw new Error(`no table for ${id}`);
    return settleLevels(structuredClone((await load()).default));
}

// One decoded room per context: every role's instrument has its own convolver, and they all read this.
const rooms = new WeakMap();
function roomFor(context) {
    if (!rooms.has(context)) rooms.set(context, fetch(`${import.meta.env.BASE_URL}reverb/reverb4.flac`).then((r) => r.arrayBuffer()).then((data) => context.decodeAudioData(data)));
    return rooms.get(context);
}

export default class IowaPlayer {
    constructor(context) {
        this.context = context;
        this.master = context.createGain();
        this.dry = context.createGain(); this.wet = context.createGain();
        this.convolver = context.createConvolver();
        // the recordings keep some of their loudness across the range, so a chord high up can go over: a limiter, not a level change
        this.limiter = context.createDynamicsCompressor();
        this.limiter.threshold.value = -6; this.limiter.knee.value = 6; this.limiter.ratio.value = 12; this.limiter.attack.value = .003; this.limiter.release.value = .15;
        this.dry.connect(this.limiter); this.wet.connect(this.convolver); this.convolver.connect(this.limiter); this.limiter.connect(this.master);
        this.bus = context.createGain();
        this.bus.connect(this.dry); this.bus.connect(this.wet);
        this.tables = new Map(); this.stored = new Map();
        this.vibrato = 1; this.nextId = 1;
        // an offline render makes its node last, with every note it will play (prepareOffline)
        this.pending = Number.isFinite(context.length) ? [] : null;
        this.setRoom(.25);
        this.ready = Promise.all([
            context.audioWorklet.addModule(workletUrl).then(() => { if (!this.pending) this.makeNode(); }),
            roomFor(context).then((buffer) => { this.convolver.buffer = buffer; }),
        ]);
    }
    makeNode(messages) {
        this.node = new AudioWorkletNode(this.context, 'iowa-voices', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], ...(messages ? { processorOptions: { messages } } : {}) });
        this.node.connect(this.bus);
    }
    prepareOffline() {
        if (!this.pending || this.node) return;
        this.makeNode(this.pending);
        this.pending = null;
    }
    send(message) {
        if (this.pending) this.pending.push(message);
        else this.node?.port.postMessage(message);
    }
    connect(node) { this.master.connect(node); return this; }
    setRoom(amount) { this.dry.gain.value = 1 - amount * .35; this.wet.gain.value = amount * .9; }
    setVibrato(scale) { if (scale !== this.vibrato) { this.vibrato = scale; this.stored.clear(); } }
    async load(id) {
        const source = PATCHES.find((p) => p.id === id)?.uses ?? id;
        if (!this.tables.has(source)) this.tables.set(source, await loadTable(source));
        return this.tables.get(source);
    }
    tableOf(id) { return this.tables.get(PATCHES.find((p) => p.id === id)?.uses ?? id); }

    /** Hands a note's numbers to the worklet once; the keys in view are prepared in the background so even the first press needs nothing. */
    prepare(id, midi, velocity) {
        const table = this.tableOf(id);
        return table ? this.store(table, midi, velocity) : null;
    }
    store(table, midi, velocity) {
        const v = quantise(velocity), key = `${table.id}:${midi}:${v}:${table.decay ? 0 : this.vibrato}`;
        if (this.stored.has(key)) return key;
        const rate = this.context.sampleRate, seed = midi * 31 + v, model = table.decay ? decayModel(table, midi, v) : heldModel(table, midi, v);
        if (!model) return null;
        const spec = table.decay ? decayVoice(model, rate, seed) : heldVoice(model, rate, { vibrato: this.vibrato, seed });
        this.send({ store: true, key, spec });
        this.stored.set(key, table.decay ? 0 : spec.level);      // a held voice's tables have unit power, a struck voice's partials carry their own level
        if (this.stored.size > 90) this.stored.delete(this.stored.keys().next().value);
        return key;
    }

    /**
     * Starts a note, now or booked for `at` and ending by itself at `until` (context seconds); `tune` scales its pitch, `slide` { cents, seconds } joins a held note to the one before. Returns a handle for `stop`, or null outside
     * the instrument's range.
     */
    start(id, midi, velocity, { at, until, tune, slide } = {}) {
        const table = this.tableOf(id), patch = PATCHES.find((p) => p.id === id);
        if (!table) return null;
        const key = this.store(table, midi, velocity);
        if (!key) return null;
        const handle = { id: this.nextId++ };
        this.send({ on: true, id: handle.id, key, gain: 10 ** ((this.stored.get(key) + trimOf(id, midi)) / 20), roll: patch?.roll ? table.roll : null, ring: !!patch?.ring, at, until, tune, slide });
        return handle;
    }
    stop(handle) { if (handle) this.send({ off: true, id: handle.id }); }
    panic() { this.send({ panic: true }); }
    dispose() {
        this.node?.disconnect(); this.node?.port.close();
        for (const part of [this.bus, this.dry, this.wet, this.convolver, this.limiter, this.master]) part.disconnect();
    }

    /** The gain that brings a recorded note (for the page's A/B) to the level the model plays it at. */
    originalGain(id, midi, velocity) {
        const table = this.tableOf(id), v = velocity * 127, [name] = LAYERS.filter(([layer]) => table?.layers[layer]).reduce((best, layer) => (Math.abs(layer[1] - v) < Math.abs(best[1] - v) ? layer : best), ['', Infinity]);
        const note = table?.layers[name]?.find((n) => n.m === midi);
        return 10 ** (((note ? note.level - note.l : 0) + trimOf(id, midi)) / 20);
    }
}
