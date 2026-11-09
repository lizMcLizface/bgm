// src/modular-audio/poolOutputProcessor.js
import { ReferenceGraph } from "./runtime.js?v=f2251aa547f5b85b";

// src/modular-audio/workerProtocol.js
var BUS_COUNT = 8;
function workerOptions(raw = {}) {
  const o = { blockFrames: 1024, poolBlocks: 4, generation: 1, ...raw };
  if (![256, 512, 1024, 2048].includes(o.blockFrames) || !Number.isInteger(o.poolBlocks) || o.poolBlocks < 2 || o.poolBlocks > 8 || !Number.isInteger(o.generation) || o.generation < 1 || o.generation > 4294967295) throw Error("Invalid worker bounds");
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
  constructor(options, endFrame, recycle) {
    this.o = workerOptions(options);
    if (!Number.isSafeInteger(endFrame + this.o.delayFrames) || endFrame < 1) throw Error("Invalid worker end frame");
    this.end = endFrame;
    this.recycle = recycle;
    this.frame = 0;
    this.count = 0;
    this.wasMissing = false;
    this.slots = Array(this.o.poolBlocks).fill(null);
    this.counters = { deliveredFrames: 0, underrunFrames: 0, underrunQuanta: 0, recoveries: 0, lateBlocks: 0, staleGeneration: 0, rejectedBlocks: 0, acceptedBlocks: 0, queueHighWater: 0 };
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
      this.counters.lateBlocks++;
      this.recycle(b);
      return false;
    }
    for (const prior of this.slots) if (prior && prior.frame === b.frame) {
      this.counters.rejectedBlocks++;
      return false;
    }
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
    this.queues = groups.map((_, i) => new WorkerPcmQueue(this.o, end, (b) => recycle(i, b)));
    this.blocks = Array(groups.length).fill(null);
    this.missing = Array(groups.length).fill(false);
    this.counters = { deliveredFrames: 0, underrunFrames: 0, underrunQuanta: 0, recoveries: 0 };
    this.wasMissing = false;
  }
  accept(group, b) {
    if (!Number.isInteger(group) || !this.queues[group]) return false;
    return this.queues[group].accept(b);
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
    return { ...this.counters, groups: this.queues.map((q) => ({ ...q.counters, queuedBlocks: q.count })) };
  }
  dispose() {
    this.queues.forEach((q) => q.dispose());
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
    this.port.postMessage({ type: "stats", mode: "pool", generation: this.o.generation, sourceFrame: this.frame, outputFrame: this.outputFrame, delayFrames: this.o.delayFrames, queue: this.pool.stats(), master: graphSnapshot(this.g, []) });
  }
  process(_inputs, outputs) {
    for (const bus of outputs) for (const ch of bus) ch.fill(0);
    if (this.stopped) return false;
    try {
      const length = outputs[0]?.[0]?.length ?? 0, at = Math.min(length, Math.max(0, this.o.delayFrames - this.outputFrame)), n = Math.min(length - at, this.end - this.frame);
      if (n > 0) {
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
    }
  }
};
registerProcessor("calmbgm-pool-output", PoolOutput);
