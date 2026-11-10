// src/modular-audio/poolOutputProcessor.js
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

// src/modular-audio/workerDeliveryTiming.js
function packetProducerSnapshot(value) {
  if (!value || value.version !== 1) return null;
  const result = { version: 1, available: value.available === true };
  for (const key of ["frame", "blocks", "freeBuffers", "inFlightBuffers", "elapsedMs", "taskWaits", "taskWaitMs", "taskWaitMaxMs", "poolWaits", "poolWaitMs", "poolWaitMaxMs", "recycleRttMs", "recycleRttMaxMs", "lastRecycleConsumerFrame", "renderMs", "maxRenderMs"]) {
    const n = value[key];
    result[key] = typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null;
  }
  return result;
}

// src/modular-audio/workerProtocol.js
var BUS_COUNT = 8;
function workerScheduling(value = "timer") {
  if (!["timer", "message"].includes(value)) throw Error("Invalid worker scheduling");
  return value;
}
function workerOptions(raw = {}) {
  const o = { blockFrames: 1024, poolBlocks: 4, generation: 1, scheduling: "timer", ...raw };
  workerScheduling(o.scheduling);
  if (![256, 512, 1024, 2048].includes(o.blockFrames) || !Number.isInteger(o.poolBlocks) || o.poolBlocks < 2 || o.poolBlocks > 8 && !(o.blockFrames === 512 && o.poolBlocks === 12) || !Number.isInteger(o.generation) || o.generation < 1 || o.generation > 4294967295) throw Error("Invalid worker bounds");
  o.delayFrames = o.blockFrames * o.poolBlocks;
  o.bufferBytes = o.blockFrames * BUS_COUNT * 2 * 4;
  return o;
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
  constructor(options, endFrame, recycle, onArrival = null, captureDelivery = false) {
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
    this.captureDelivery = captureDelivery;
    this.lastPacket = null;
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
    return { ...this.counters, queuedBlocks: this.count, lastPacket: this.lastPacket, lead: this.lead.snapshot(), arrivals: this.arrivals.snapshot() };
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
    if (this.captureDelivery) this.lastPacket = { packetFrame: b.frame, frames: b.n, sourceFrameAtArrival: this.frame, producer: packetProducerSnapshot(b.producer) };
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

// src/modular-audio/poolProtocol.js
var AlignedSourcePool = class {
  constructor(options, end, groups, recycle) {
    this.o = workerOptions(options);
    this.groups = groups;
    this.frame = 0;
    this.end = end;
    this.arrivals = new ArrivalGaps(this.o.delayFrames, end);
    this.queues = groups.map((_, i) => new WorkerPcmQueue(this.o, end, (b) => recycle(i, b), (b, expired) => this.arrivals.arrive(this.frame, b.frame, b.n, expired, i)));
    this.blocks = Array(groups.length).fill(null);
    this.missing = Array(groups.length).fill(false);
    this.counters = { deliveredFrames: 0, underrunFrames: 0, underrunQuanta: 0, recoveries: 0 };
    this.wasMissing = false;
    this.lead = new QueueLead(this.o.delayFrames, this.o.blockFrames);
  }
  accept(group, b) {
    if (!Number.isInteger(group) || !this.queues[group]) return false;
    return this.queues[group].accept(b);
  }
  observeLead(needed) {
    let minimum = this.o.delayFrames;
    for (let g = 0; g < this.queues.length; g++) minimum = Math.min(minimum, this.queues[g].observeLead(needed));
    this.lead.observe(minimum, needed, this.end - this.frame, this.frame);
    this.arrivals.observe(this.frame, needed, this.end - this.frame, minimum);
    return minimum;
  }
  fill(inputs, n) {
    let missed = false;
    this.missing.fill(false);
    for (let i = 0; i < n; i++, this.frame++) {
      let complete = true;
      for (let g = 0; g < this.queues.length; g++) {
        const q = this.queues[g];
        let block = null;
        for (let s = 0; s < q.slots.length; s++) {
          const b = q.slots[s];
          if (b && b.frame + b.n <= this.frame) {
            q.release(s);
            continue;
          }
          if (b && b.frame <= this.frame && this.frame < b.frame + b.n) block = b;
        }
        this.blocks[g] = block;
        if (!block) {
          complete = false;
          this.missing[g] = true;
          q.counters.underrunFrames++;
          q.wasMissing = true;
        } else {
          q.counters.deliveredFrames++;
          if (q.wasMissing) {
            q.counters.recoveries++;
            q.wasMissing = false;
          }
        }
      }
      if (complete) {
        this.counters.deliveredFrames++;
        if (this.wasMissing) {
          this.counters.recoveries++;
          this.wasMissing = false;
        }
      } else {
        this.counters.underrunFrames++;
        missed = true;
        this.wasMissing = true;
      }
      for (let bus = 0; bus < 7; bus++) {
        inputs[bus][i * 2] = 0;
        inputs[bus][i * 2 + 1] = 0;
      }
      if (complete) for (let g = 0; g < this.groups.length; g++) {
        const b = this.blocks[g], offset = this.frame - b.frame;
        for (const id of this.groups[g]) for (let ch = 0; ch < 2; ch++) inputs[id - 1][i * 2 + ch] = b.pcm[((id - 1) * b.n + offset) * 2 + ch];
        if (this.groups[g].includes(6)) for (let ch = 0; ch < 2; ch++) inputs[6][i * 2 + ch] = b.pcm[(6 * b.n + offset) * 2 + ch];
      }
      for (let g = 0; g < this.queues.length; g++) {
        const q = this.queues[g], b = this.blocks[g];
        q.frame = this.frame + 1;
        if (b && this.frame + 1 === b.frame + b.n) q.release(b.slot);
      }
    }
    if (missed) this.counters.underrunQuanta++;
    for (let g = 0; g < this.queues.length; g++) if (this.missing[g]) this.queues[g].counters.underrunQuanta++;
  }
  stats() {
    return { ...this.counters, lead: this.lead.snapshot(), arrivals: this.arrivals.snapshot(), groups: this.queues.map((q) => q.stats()) };
  }
  dispose() {
    this.queues.forEach((q) => q.dispose());
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

// src/modular-audio/poolOutputProcessor.js
var PoolOutput = class extends AudioWorkletProcessor {
  constructor({ processorOptions: p }) {
    super();
    this.stopped = false;
    this.frame = 0;
    this.outputFrame = 0;
    this.primed = false;
    this.timing = new ProcessTiming();
    try {
      this.o = workerOptions(p.options);
      this.end = p.endFrame;
      this.groups = p.groups;
      if (!Number.isSafeInteger(this.end + this.o.delayFrames) || this.end < 1 || this.groups.length < 2 || this.groups.length > 6) throw Error("Invalid pool output");
      this.g = new ReferenceGraph(new WebAssembly.Instance(p.module, {}).exports, p.patch, p.contracts, sampleRate);
      this.inputs = Array.from({ length: 7 }, (_, i) => this.g.inputs.get(i + 1));
      if (this.inputs.some((x) => !x)) throw Error("Missing pool master inputs");
      this.links = Array(this.groups.length).fill(null);
      this.pool = new AlignedSourcePool(this.o, this.end, this.groups, (group, b) => this.links[group].postMessage({ type: "recycle", generation: b.generation, slot: b.slot, buffer: b.buffer }, [b.buffer]));
      this.port.onmessage = ({ data: d }) => {
        try {
          if (d.type === "connect") {
            if (!Number.isInteger(d.group) || !this.pool.queues[d.group] || this.links[d.group]) throw Error("Invalid pool group port");
            this.links[d.group] = d.port;
            d.port.onmessage = ({ data: b }) => {
              try {
                if (this.stopped) return;
                this.pool.accept(d.group, b);
                if (!this.primed && this.pool.queues.every((q) => q.count >= Math.min(this.o.poolBlocks, Math.ceil(this.end / this.o.blockFrames)))) {
                  this.primed = true;
                  this.port.postMessage({ type: "primed" });
                }
              } catch (e) {
                this.fail(e);
              }
            };
          }
          if (d.type === "stats") this.stats();
          if (d.type === "failure") {
            this.stopped = true;
            this.pool.dispose();
            this.stats();
            this.port.postMessage({ type: "finished" });
          }
          if (d.type === "dispose") {
            this.stopped = true;
            this.pool.dispose();
            this.links.forEach((p2) => p2?.close());
            this.g.dispose();
            this.port.close();
          }
        } catch (e) {
          this.fail(e);
        }
      };
      this.port.postMessage({ type: "ready" });
    } catch (e) {
      this.fail(e);
    }
  }
  fail(e) {
    this.stopped = true;
    this.port.postMessage({ type: "error", message: String(e) });
  }
  stats() {
    this.port.postMessage({ type: "stats", mode: "pool", generation: this.o.generation, sourceFrame: this.frame, outputFrame: this.outputFrame, delayFrames: this.o.delayFrames, processTiming: this.timing.snapshot(), queue: this.pool.stats(), master: graphSnapshot(this.g, []) });
  }
  process(_inputs, outputs) {
    const started = this.timing.start(), quantum = outputs[0]?.[0]?.length ?? 0;
    for (const bus of outputs) for (const ch of bus) ch.fill(0);
    if (this.stopped) return false;
    try {
      const length = outputs[0]?.[0]?.length ?? 0, at = Math.min(length, Math.max(0, this.o.delayFrames - this.outputFrame)), n = Math.min(length - at, this.end - this.frame);
      if (n > 0) {
        this.pool.observeLead(n);
        this.pool.fill(this.inputs, n);
        for (let bus = 0; bus < 7; bus++) for (let ch = 0; ch < outputs[bus].length; ch++) for (let i = 0; i < n; i++) outputs[bus][ch][at + i] = this.inputs[bus][i * 2 + Math.min(ch, 1)];
        this.g.render(n);
        for (let ch = 0; ch < outputs[7].length; ch++) for (let i = 0; i < n; i++) outputs[7][ch][at + i] = ch === 0 ? this.g.left[i] : this.g.right[i];
        this.frame += n;
      }
      this.outputFrame += length;
      if (this.frame >= this.end) {
        this.stopped = true;
        this.stats();
        this.port.postMessage({ type: "finished" });
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
registerProcessor("calmbgm-pool-output", PoolOutput);
