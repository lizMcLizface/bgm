// src/modular-audio/workerOutputProcessor.js
import { ReferenceGraph } from "./runtime.js?v=f2251aa547f5b85b";

// src/modular-audio/queueLead.js
function contiguousLeadFrames(slots, frame, capacity) {
  let cursor = frame;
  for (let hop = 0; hop < slots.length; hop++) {
    let end = cursor;
    for (let i = 0; i < slots.length; i++) {
      const b = slots[i];
      if (b && b.frame <= cursor && b.frame + b.n > end) end = b.frame + b.n;
    }
    if (end === cursor) break;
    cursor = end;
  }
  return Math.min(capacity, Math.max(0, cursor - frame));
}
var LeadWindow = class {
  constructor(capacity, blockFrames) {
    this.capacity = capacity;
    this.blockFrames = blockFrames;
    this.bins = new Uint32Array(Math.floor(capacity / 128) + 1);
    this.samples = 0;
    this.min = Infinity;
    this.max = 0;
    this.zeros = 0;
    this.underQuantum = 0;
    this.underBlock = 0;
    this.firstZero = null;
    this.minNeeded = Infinity;
    this.maxNeeded = 0;
  }
  observe(lead, needed, frame) {
    this.samples++;
    this.min = Math.min(this.min, lead);
    this.max = Math.max(this.max, lead);
    this.minNeeded = Math.min(this.minNeeded, needed);
    this.maxNeeded = Math.max(this.maxNeeded, needed);
    if (lead === 0) {
      this.zeros++;
      if (this.firstZero === null) this.firstZero = frame;
    }
    if (lead < needed) this.underQuantum++;
    if (lead < this.blockFrames) this.underBlock++;
    this.bins[Math.floor(lead / 128)]++;
  }
  snapshot() {
    return { samples: this.samples, minFrames: this.samples ? this.min : null, maxFrames: this.samples ? this.max : null, zeroLeadQuanta: this.zeros, belowQuantumQuanta: this.underQuantum, belowBlockQuanta: this.underBlock, firstZeroSourceFrame: this.firstZero, minNeededFrames: this.samples ? this.minNeeded : null, maxNeededFrames: this.samples ? this.maxNeeded : null, histogram: Array.from(this.bins) };
  }
};
var QueueLead = class {
  constructor(capacity, blockFrames) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16384 || !Number.isInteger(blockFrames) || blockFrames < 1 || blockFrames > capacity) throw Error("Invalid queue-lead capacity");
    this.capacity = capacity;
    this.blockFrames = blockFrames;
    this.steady = new LeadWindow(capacity, blockFrames);
    this.drain = new LeadWindow(capacity, blockFrames);
  }
  observe(lead, needed, remaining, frame) {
    if (needed <= 0) return;
    (remaining >= this.capacity ? this.steady : this.drain).observe(Math.min(this.capacity, Math.max(0, lead)), needed, frame);
  }
  snapshot() {
    return { scope: "Contiguous ready source frames at active-consumption quantum entry; startup delay excluded; final capacity window reported separately; not device output quality", capacityFrames: this.capacity, blockFrames: this.blockFrames, histogramBucketFrames: 128, observations: this.steady.samples + this.drain.samples, steady: this.steady.snapshot(), drain: this.drain.snapshot() };
  }
};

// src/modular-audio/arrivalGaps.js
var BUCKET = 128;
var BINS = 129;
var LIMIT = 32;
var WIDTH = 7;
var GapWindow = class {
  constructor() {
    this.positive = 0;
    this.same = 0;
    this.max = 0;
    this.total = 0;
    this.consumptions = 0;
    this.maxConsumed = 0;
    this.over = 0;
    this.bins = new Uint32Array(BINS);
  }
  arrive(gap) {
    if (!gap) {
      this.same++;
      return false;
    }
    const record = gap > this.max;
    this.positive++;
    this.total += gap;
    this.max = Math.max(this.max, gap);
    this.bins[Math.min(BINS - 1, Math.floor(gap / BUCKET))]++;
    return record;
  }
  consume(span, capacity) {
    this.consumptions++;
    this.maxConsumed = Math.max(this.maxConsumed, span);
    if (span > capacity) this.over++;
  }
  snapshot() {
    return { positiveGaps: this.positive, sameFrameArrivals: this.same, maxGapFrames: this.positive ? this.max : null, totalGapFrames: this.total, histogram: Array.from(this.bins), consumptionQuanta: this.consumptions, maxConsumedSinceArrivalFrames: this.consumptions ? this.maxConsumed : null, overCapacityQuanta: this.over };
  }
};
var ArrivalGaps = class {
  constructor(capacity, end) {
    this.capacity = capacity;
    this.end = end;
    this.last = null;
    this.observations = 0;
    this.publications = 0;
    this.priming = 0;
    this.measured = 0;
    this.expired = 0;
    this.unpaired = 0;
    this.wasShort = false;
    this.trace = new Float64Array(LIMIT * WIDTH);
    this.records = 0;
    this.dropped = 0;
    this.steady = new GapWindow();
    this.drain = new GapWindow();
  }
  record(kind, frame, packet, n, group, span, lead) {
    if (this.records === LIMIT) {
      this.dropped++;
      return;
    }
    const at = this.records++ * WIDTH;
    this.trace[at] = kind;
    this.trace[at + 1] = frame;
    this.trace[at + 2] = packet;
    this.trace[at + 3] = n;
    this.trace[at + 4] = group;
    this.trace[at + 5] = span;
    this.trace[at + 6] = lead;
  }
  arrive(frame, packet, n, expired, group = -1) {
    this.publications++;
    if (expired) this.expired++;
    if (!this.observations) this.priming++;
    else {
      this.measured++;
      if (this.last === null) this.unpaired++;
      else {
        const gap = frame - this.last, w = this.end - frame >= this.capacity ? this.steady : this.drain;
        if (w.arrive(gap)) this.record(0, frame, packet, n, group, gap, -1);
      }
    }
    this.last = frame;
  }
  observe(frame, needed, remaining, lead) {
    if (needed <= 0) return;
    this.observations++;
    const span = this.last === null ? -1 : frame + needed - this.last;
    if (span >= 0) (remaining >= this.capacity ? this.steady : this.drain).consume(span, this.capacity);
    const short = lead < needed;
    if (short && !this.wasShort) this.record(1, frame, -1, needed, -1, span, lead);
    this.wasShort = short;
  }
  snapshot() {
    const trace = [];
    for (let i = 0; i < this.records; i++) {
      const at = i * WIDTH;
      trace.push({ kind: this.trace[at] === 0 ? "new-arrival-gap-maximum" : "insufficient-lead-start", sourceFrame: this.trace[at + 1], packetFrame: this.trace[at + 2] < 0 ? null : this.trace[at + 2], frames: this.trace[at + 3], group: this.trace[at + 4] < 0 ? null : this.trace[at + 4], spanFrames: this.trace[at + 5] < 0 ? null : this.trace[at + 5], readyLeadFrames: this.trace[at + 6] < 0 ? null : this.trace[at + 6] });
    }
    return { scope: "Source frames advanced between valid publication callbacks, including expired packets; pool-level data uses any group arrival, not complete-cohort readiness. Startup excluded from measured gaps. Not wall time, CPU attribution or physical output.", capacityFrames: this.capacity, activeObservations: this.observations, publicationCallbacks: this.publications, primingArrivals: this.priming, measuredArrivals: this.measured, unpairedArrivals: this.unpaired, expiredPublications: this.expired, histogramBucketFrames: BUCKET, histogramOverflowFromFrames: (BINS - 1) * BUCKET, steady: this.steady.snapshot(), drain: this.drain.snapshot(), traceLimit: LIMIT, traceDropped: this.dropped, trace };
  }
};

// src/modular-audio/workerProtocol.js
var BUS_COUNT = 8;
function sourceSelection(ids = null) {
  if (ids === null) return null;
  if (!Array.isArray(ids) || !ids.length || ids.length > 6 || new Set(ids).size !== ids.length || ids.some((id) => !Number.isInteger(id) || id < 1 || id > 6)) throw Error("Invalid source selection");
  return ids.slice();
}
function workerScheduling(value = "timer") {
  if (!["timer", "message"].includes(value)) throw Error("Invalid worker scheduling");
  return value;
}
function workerOptions(raw = {}) {
  const o = { blockFrames: 1024, poolBlocks: 4, generation: 1, scheduling: "timer", ...raw };
  workerScheduling(o.scheduling);
  if (![256, 512, 1024, 2048].includes(o.blockFrames) || !Number.isInteger(o.poolBlocks) || o.poolBlocks < 2 || o.poolBlocks > 8 || !Number.isInteger(o.generation) || o.generation < 1 || o.generation > 4294967295) throw Error("Invalid worker bounds");
  o.delayFrames = o.blockFrames * o.poolBlocks;
  o.bufferBytes = o.blockFrames * BUS_COUNT * 2 * 4;
  return o;
}
function sourceViews(g, ids = null) {
  const views = Array.from({ length: 6 }, (_, i) => !ids || ids.includes(i + 1) ? g.outputs.get(i + 1) : null);
  views.push(g.kicks.get(6));
  if (ids ? ids.some((id) => !views[id - 1]) || ids.includes(6) && !views[6] : views.some((x) => !x)) throw Error("Worker requires declared source ports");
  return views;
}
function graphSnapshot(g, ids = null) {
  return {
    graph: g.stats(),
    meters: g.meters(),
    memoryBytes: g.engine.memory.buffer.byteLength,
    roles: Array.from({ length: 6 }, (_, i) => ids && !ids.includes(i + 1) ? null : i === 5 ? g.percussionStats(i + 1) : g.pitchedStats(i + 1))
  };
}
var WorkerPcmQueue = class {
  constructor(options, endFrame, recycle, onArrival = null) {
    this.o = workerOptions(options);
    if (!Number.isSafeInteger(endFrame + this.o.delayFrames) || endFrame < 1) throw Error("Invalid worker end frame");
    this.end = endFrame;
    this.recycle = recycle;
    this.frame = 0;
    this.count = 0;
    this.wasMissing = false;
    this.slots = Array(this.o.poolBlocks).fill(null);
    this.lead = new QueueLead(this.o.delayFrames, this.o.blockFrames);
    this.arrivals = new ArrivalGaps(this.o.delayFrames, endFrame);
    this.onArrival = onArrival;
    this.counters = { deliveredFrames: 0, underrunFrames: 0, underrunQuanta: 0, recoveries: 0, lateBlocks: 0, staleGeneration: 0, rejectedBlocks: 0, acceptedBlocks: 0, queueHighWater: 0 };
  }
  contiguousLead() {
    return contiguousLeadFrames(this.slots, this.frame, this.o.delayFrames);
  }
  observeLead(needed) {
    const lead = this.contiguousLead();
    this.lead.observe(lead, needed, this.end - this.frame, this.frame);
    this.arrivals.observe(this.frame, needed, this.end - this.frame, lead);
    return lead;
  }
  stats() {
    return { ...this.counters, queuedBlocks: this.count, lead: this.lead.snapshot(), arrivals: this.arrivals.snapshot() };
  }
  publication(b, expired) {
    this.arrivals.arrive(this.frame, b.frame, b.n, expired);
    this.onArrival?.(b, expired);
  }
  release(slot) {
    const b = this.slots[slot];
    if (!b) return;
    this.slots[slot] = null;
    this.count--;
    this.recycle(b);
  }
  accept(b) {
    const o = this.o;
    if (b.generation !== o.generation) {
      this.counters.staleGeneration++;
      return false;
    }
    if (!Number.isInteger(b.slot) || b.slot < 0 || b.slot >= o.poolBlocks || this.slots[b.slot] || !Number.isSafeInteger(b.frame) || b.frame < 0 || b.frame % o.blockFrames || !Number.isInteger(b.n) || b.n !== Math.min(o.blockFrames, this.end - b.frame) || b.n < 1 || b.buffer?.byteLength !== o.bufferBytes) {
      this.counters.rejectedBlocks++;
      return false;
    }
    if (b.frame + b.n <= this.frame) {
      this.publication(b, true);
      this.counters.lateBlocks++;
      this.recycle(b);
      return false;
    }
    for (const prior of this.slots) if (prior && prior.frame === b.frame) {
      this.counters.rejectedBlocks++;
      return false;
    }
    this.publication(b, false);
    b.pcm = new Float32Array(b.buffer);
    this.slots[b.slot] = b;
    this.count++;
    this.counters.acceptedBlocks++;
    this.counters.queueHighWater = Math.max(this.counters.queueHighWater, this.count);
    return true;
  }
  consume(outputs, at, frames) {
    let missing = false;
    for (let i = 0; i < frames; i++, this.frame++) {
      let block = null;
      for (let s = 0; s < this.slots.length; s++) {
        const b = this.slots[s];
        if (b && b.frame + b.n <= this.frame) {
          this.release(s);
          continue;
        }
        if (b && b.frame <= this.frame && this.frame < b.frame + b.n) block = b;
      }
      if (!block) {
        this.counters.underrunFrames++;
        missing = true;
        this.wasMissing = true;
      } else {
        this.counters.deliveredFrames++;
        if (this.wasMissing) {
          this.counters.recoveries++;
          this.wasMissing = false;
        }
      }
      for (let bus = 0; bus < outputs.length; bus++) for (let ch = 0; ch < outputs[bus].length; ch++) outputs[bus][ch][at + i] = block ? block.pcm[(bus * block.n + this.frame - block.frame) * 2 + Math.min(ch, 1)] : 0;
      if (block && this.frame + 1 === block.frame + block.n) this.release(block.slot);
    }
    if (missing) this.counters.underrunQuanta++;
  }
  dispose() {
    for (let s = 0; s < this.slots.length; s++) this.release(s);
  }
};

// src/modular-audio/processTiming.js
var ProcessTiming = class {
  constructor(clock = globalThis.performance) {
    this.clock = typeof clock?.now === "function" ? clock : null;
    this.calls = 0;
    this.totalMs = 0;
    this.maxMs = 0;
    this.overQuantumPeriod = 0;
    this.bins = new Uint32Array(32);
  }
  start() {
    if (!this.clock) return 0;
    try {
      return this.clock.now();
    } catch {
      this.clock = null;
      return 0;
    }
  }
  stop(start, frames, rate) {
    if (!this.clock) return;
    try {
      const ms = this.clock.now() - start;
      if (!Number.isFinite(ms) || ms < 0) {
        this.clock = null;
        return;
      }
      this.calls++;
      this.totalMs += ms;
      this.maxMs = Math.max(this.maxMs, ms);
      if (ms > frames / rate * 1e3) this.overQuantumPeriod++;
      this.bins[Math.min(31, Math.max(0, Math.ceil(Math.log2(Math.max(1, ms * 1e3)))))]++;
    } catch {
      this.clock = null;
    }
  }
  snapshot() {
    return { available: !!this.clock, scope: "process() wall time including copy/DSP and preemption; not callback scheduling, CPU utilization or device underruns", reason: this.clock ? null : "Monotonic performance.now() is unavailable or failed in this worklet", calls: this.clock ? this.calls : null, totalMs: this.clock ? this.totalMs : null, maxMs: this.clock ? this.maxMs : null, overQuantumPeriod: this.clock ? this.overQuantumPeriod : null, histogramLog2Us: this.clock ? Array.from(this.bins) : null };
  }
};

// src/modular-audio/workerOutputProcessor.js
var WorkerOutput = class extends AudioWorkletProcessor {
  constructor({ processorOptions: p }) {
    super();
    this.stopped = false;
    this.outputFrame = 0;
    this.sourceFrame = 0;
    this.primed = false;
    this.finishReason = null;
    this.timing = new ProcessTiming();
    try {
      this.o = workerOptions(p.options);
      this.end = p.endFrame;
      this.mode = p.mode;
      this.sourceIds = sourceSelection(p.sourceIds ?? null);
      this.armed = !p.startPaused;
      if (p.startPaused !== void 0 && typeof p.startPaused !== "boolean") throw Error("Invalid manual start");
      if (p.stopOnUnderrun !== void 0 && typeof p.stopOnUnderrun !== "boolean") throw Error("Invalid delivery gap policy");
      this.stopOnUnderrun = !!p.stopOnUnderrun;
      if (!Number.isSafeInteger(this.end + this.o.delayFrames) || this.end < 1 || !["worker", "serial"].includes(this.mode)) throw Error("Invalid worker output");
      if (this.mode === "serial") {
        this.g = new ReferenceGraph(new WebAssembly.Instance(p.module, {}).exports, p.patch, p.contracts, sampleRate);
        this.views = sourceViews(this.g, this.sourceIds);
      } else this.queue = new WorkerPcmQueue(this.o, this.end, (b) => this.link.postMessage({ type: "recycle", generation: b.generation, slot: b.slot, buffer: b.buffer }, [b.buffer]));
      this.port.onmessage = ({ data: d }) => {
        try {
          if (d.type === "connect" && this.mode === "worker" && !this.link) {
            this.link = d.port;
            this.link.onmessage = ({ data: b }) => {
              if (this.stopped) return;
              if (b.type === "block") {
                this.queue.accept(b);
                if (!this.primed && this.queue.count >= Math.min(this.o.poolBlocks, Math.ceil(this.end / this.o.blockFrames))) {
                  this.primed = true;
                  this.port.postMessage({ type: "primed" });
                }
              }
            };
          }
          if (d.type === "stats") this.stats();
          if (d.type === "start") this.armed = true;
          if (d.type === "failure") {
            this.stopped = true;
            this.finishReason = "failed";
            this.queue?.dispose();
            this.stats();
            this.port.postMessage({ type: "finished", reason: this.finishReason });
          }
          if (d.type === "dispose") {
            this.stopped = true;
            this.queue?.dispose();
            this.link?.close();
            this.g?.dispose();
            this.port.postMessage({ type: "disposed" });
            this.port.close();
          }
        } catch (e) {
          this.fail(e);
        }
      };
      this.port.postMessage({ type: "ready", mode: this.mode, options: this.o });
    } catch (e) {
      this.fail(e);
    }
  }
  fail(e) {
    this.stopped = true;
    this.port.postMessage({ type: "error", message: String(e) });
  }
  stats() {
    this.port.postMessage({ type: "stats", mode: this.mode, generation: this.o.generation, armed: this.armed, stopOnUnderrun: this.stopOnUnderrun, finishReason: this.finishReason, sourceIds: this.sourceIds, outputFrame: this.outputFrame, sourceFrame: this.sourceFrame, delayFrames: this.o.delayFrames, processTiming: this.timing.snapshot(), queue: this.queue ? this.queue.stats() : null, serial: this.g ? graphSnapshot(this.g, this.sourceIds) : null });
  }
  process(_inputs, outputs) {
    const started = this.timing.start(), quantum = outputs[0]?.[0]?.length ?? 0;
    for (const bus of outputs) for (const ch of bus) ch.fill(0);
    if (this.stopped) return false;
    if (!this.armed) return true;
    try {
      const length = outputs[0]?.[0]?.length ?? 0;
      let at = Math.min(length, Math.max(0, this.o.delayFrames - this.outputFrame));
      const n = Math.min(length - at, this.end - this.sourceFrame);
      if (n > 0) {
        if (this.queue) {
          this.queue.observeLead(n);
          this.queue.consume(outputs, at, n);
        } else {
          this.g.render(n);
          for (let bus = 0; bus < outputs.length; bus++) for (let ch = 0; ch < outputs[bus].length; ch++) for (let i = 0; i < n; i++) outputs[bus][ch][at + i] = bus === 7 ? this.sourceIds ? 0 : ch === 0 ? this.g.left[i] : this.g.right[i] : this.views[bus]?.[i * 2 + Math.min(ch, 1)] ?? 0;
        }
        this.sourceFrame += n;
      }
      this.outputFrame += length;
      if (this.stopOnUnderrun && this.queue?.counters.underrunFrames) {
        this.stopped = true;
        this.finishReason = "delivery-gap";
        this.stats();
        this.port.postMessage({ type: "finished", reason: this.finishReason });
        return false;
      }
      if (this.sourceFrame >= this.end) {
        this.stopped = true;
        this.finishReason = "completed";
        this.stats();
        this.port.postMessage({ type: "finished", reason: this.finishReason });
        return false;
      }
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    } finally {
      this.timing.stop(started, quantum, sampleRate);
    }
  }
};
registerProcessor("calmbgm-worker-output", WorkerOutput);
