// src/modular-audio/workerOutputProcessor.js
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
function sourceViews(g) {
  const views = Array.from({ length: 6 }, (_, i) => g.outputs.get(i + 1));
  views.push(g.kicks.get(6));
  if (views.some((x) => !x)) throw Error("Worker requires six-role source ports");
  return views;
}
function graphSnapshot(g) {
  return {
    graph: g.stats(),
    meters: g.meters(),
    memoryBytes: g.engine.memory.buffer.byteLength,
    roles: Array.from({ length: 6 }, (_, i) => i === 5 ? g.percussionStats(i + 1) : g.pitchedStats(i + 1))
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

// src/modular-audio/workerOutputProcessor.js
var WorkerOutput = class extends AudioWorkletProcessor {
  constructor({ processorOptions: p }) {
    super();
    this.stopped = false;
    this.outputFrame = 0;
    this.sourceFrame = 0;
    this.primed = false;
    try {
      this.o = workerOptions(p.options);
      this.end = p.endFrame;
      this.mode = p.mode;
      if (!Number.isSafeInteger(this.end + this.o.delayFrames) || this.end < 1 || !["worker", "serial"].includes(this.mode)) throw Error("Invalid worker output");
      if (this.mode === "serial") {
        this.g = new ReferenceGraph(new WebAssembly.Instance(p.module, {}).exports, p.patch, p.contracts, sampleRate);
        this.views = sourceViews(this.g);
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
          if (d.type === "failure") {
            this.stopped = true;
            this.queue?.dispose();
            this.stats();
            this.port.postMessage({ type: "finished" });
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
    this.port.postMessage({ type: "stats", mode: this.mode, generation: this.o.generation, outputFrame: this.outputFrame, sourceFrame: this.sourceFrame, delayFrames: this.o.delayFrames, queue: this.queue ? { ...this.queue.counters, queuedBlocks: this.queue.count } : null, serial: this.g ? graphSnapshot(this.g) : null });
  }
  process(_inputs, outputs) {
    for (const bus of outputs) for (const ch of bus) ch.fill(0);
    if (this.stopped) return false;
    try {
      const length = outputs[0]?.[0]?.length ?? 0;
      let at = Math.min(length, Math.max(0, this.o.delayFrames - this.outputFrame));
      const n = Math.min(length - at, this.end - this.sourceFrame);
      if (n > 0) {
        if (this.queue) this.queue.consume(outputs, at, n);
        else {
          this.g.render(n);
          for (let bus = 0; bus < outputs.length; bus++) for (let ch = 0; ch < outputs[bus].length; ch++) for (let i = 0; i < n; i++) outputs[bus][ch][at + i] = bus === 7 ? ch === 0 ? this.g.left[i] : this.g.right[i] : this.views[bus][i * 2 + Math.min(ch, 1)];
        }
        this.sourceFrame += n;
      }
      this.outputFrame += length;
      if (this.sourceFrame >= this.end) {
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
registerProcessor("calmbgm-worker-output", WorkerOutput);
