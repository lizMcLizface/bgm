// src/modular-audio/graphWorker.js
import { ReferenceGraph } from "./runtime.js?v=cabfdffb0677f32f";

// src/modular-audio/workerDeliveryTiming.js
var WorkerDeliveryTiming = class {
  constructor(poolBlocks, clock = globalThis.performance) {
    this.clock = clock;
    this.available = true;
    this.origin = this.now();
    this.ready = null;
    this.empty = null;
    this.sent = new Float64Array(poolBlocks);
    this.sent.fill(NaN);
    this.taskWaits = 0;
    this.taskWaitMs = null;
    this.taskWaitMaxMs = 0;
    this.poolWaits = 0;
    this.poolWaitMs = null;
    this.poolWaitMaxMs = 0;
    this.recycleRttMs = null;
    this.recycleRttMaxMs = 0;
    this.lastRecycleConsumerFrame = null;
  }
  now() {
    try {
      const n = this.clock.now();
      if (!Number.isFinite(n)) throw Error("clock");
      return n;
    } catch {
      this.available = false;
      return null;
    }
  }
  requestTask(delay) {
    if (delay === 0 && this.ready === null) this.ready = this.now();
  }
  beginTask(stalled = false) {
    const now = this.now();
    if (!stalled && now !== null && this.ready !== null) {
      this.taskWaitMs = Math.max(0, now - this.ready);
      this.taskWaitMaxMs = Math.max(this.taskWaitMaxMs, this.taskWaitMs);
      this.taskWaits++;
    }
    this.ready = null;
  }
  published(slot, hasMore, free2) {
    const now = this.now();
    this.sent[slot] = now ?? NaN;
    if (hasMore && !free2 && this.empty === null) this.empty = now;
  }
  recycled(slot, consumerFrame) {
    const now = this.now();
    if (now !== null && Number.isFinite(this.sent[slot])) {
      this.recycleRttMs = Math.max(0, now - this.sent[slot]);
      this.recycleRttMaxMs = Math.max(this.recycleRttMaxMs, this.recycleRttMs);
    }
    this.sent[slot] = NaN;
    if (now !== null && this.empty !== null) {
      this.poolWaitMs = Math.max(0, now - this.empty);
      this.poolWaitMaxMs = Math.max(this.poolWaitMaxMs, this.poolWaitMs);
      this.poolWaits++;
    }
    this.empty = null;
    this.lastRecycleConsumerFrame = Number.isSafeInteger(consumerFrame) && consumerFrame >= 0 ? consumerFrame : null;
  }
  snapshot() {
    const now = this.now(), valid = this.available && now !== null;
    return { available: valid, elapsedMs: valid ? now - this.origin : null, taskWaits: this.taskWaits, taskWaitMs: valid ? this.taskWaitMs : null, taskWaitMaxMs: valid ? this.taskWaitMaxMs : null, poolWaits: this.poolWaits, poolWaitMs: valid ? this.poolWaitMs : null, poolWaitMaxMs: valid ? this.poolWaitMaxMs : null, recycleRttMs: valid ? this.recycleRttMs : null, recycleRttMaxMs: valid ? this.recycleRttMaxMs : null, lastRecycleConsumerFrame: this.lastRecycleConsumerFrame, readyTaskAgeMs: valid && this.ready !== null ? now - this.ready : null, poolEmptyAgeMs: valid && this.empty !== null ? now - this.empty : null };
  }
};

// src/modular-audio/workerProtocol.js
var BUS_COUNT = 8;
function workerScheduling(value = "timer") {
  if (!["timer", "message"].includes(value)) throw Error("Invalid worker scheduling");
  return value;
}
function workerOptions(raw = {}) {
  const o2 = { blockFrames: 1024, poolBlocks: 4, generation: 1, scheduling: "timer", ...raw };
  workerScheduling(o2.scheduling);
  if (![256, 512, 1024, 2048].includes(o2.blockFrames) || !Number.isInteger(o2.poolBlocks) || o2.poolBlocks < 2 || o2.poolBlocks > 8 && !(o2.blockFrames === 512 && o2.poolBlocks === 12) || !Number.isInteger(o2.generation) || o2.generation < 1 || o2.generation > 4294967295) throw Error("Invalid worker bounds");
  o2.delayFrames = o2.blockFrames * o2.poolBlocks;
  o2.bufferBytes = o2.blockFrames * BUS_COUNT * 2 * 4;
  return o2;
}
function sourceViews(g2, ids = null) {
  const views2 = Array.from({ length: 6 }, (_, i) => !ids || ids.includes(i + 1) ? g2.outputs.get(i + 1) : null);
  views2.push(g2.kicks.get(6));
  if (ids ? ids.some((id) => !views2[id - 1]) || ids.includes(6) && !views2[6] : views2.some((x) => !x)) throw Error("Worker requires declared source ports");
  return views2;
}
function copyGraph(g2, views2, pcm, frames, partial = false) {
  for (let bus = 0; bus < BUS_COUNT; bus++) for (let i = 0; i < frames; i++) {
    const to = (bus * frames + i) * 2;
    pcm[to] = bus === 7 ? partial ? 0 : g2.left[i] : views2[bus]?.[i * 2] ?? 0;
    pcm[to + 1] = bus === 7 ? partial ? 0 : g2.right[i] : views2[bus]?.[i * 2 + 1] ?? 0;
  }
}
function graphSnapshot(g2, ids = null) {
  return {
    graph: g2.stats(),
    meters: g2.meters(),
    memoryBytes: g2.engine.memory.buffer.byteLength,
    roles: Array.from({ length: 6 }, (_, i) => ids && !ids.includes(i + 1) ? null : i === 5 ? g2.percussionStats(i + 1) : g2.pitchedStats(i + 1))
  };
}

// src/modular-audio/workerTaskPump.js
var WorkerTaskPump = class {
  constructor(run, { makeChannel = () => new MessageChannel(), setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = (id) => clearTimeout(id) } = {}) {
    this.run = run;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.channel = makeChannel();
    this.pending = false;
    this.timer = null;
    this.disposed = false;
    this.posted = 0;
    this.handled = 0;
    this.waits = 0;
    this.channel.port1.onmessage = () => {
      this.pending = false;
      if (this.disposed) return;
      this.handled++;
      this.run();
    };
  }
  schedule(delay = 0) {
    if (this.disposed || this.pending || this.timer !== null) return false;
    if (!Number.isFinite(delay) || delay < 0) throw Error("Invalid pump delay");
    if (delay > 0) {
      this.waits++;
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.schedule();
      }, delay);
    } else {
      this.pending = true;
      this.posted++;
      this.channel.port2.postMessage(0);
    }
    return true;
  }
  snapshot() {
    return { kind: "message-channel", pendingTask: this.pending, waitingForStall: this.timer !== null, postedTasks: this.posted, handledTasks: this.handled, stallTimers: this.waits, disposed: this.disposed };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.pending = false;
    this.channel.port1.close();
    this.channel.port2.close();
  }
};

// src/modular-audio/graphWorker.js
var g;
var views;
var o;
var port;
var tasks;
var delivery;
var sourceIds = null;
var end = 0;
var frame = 0;
var free = [];
var inFlight;
var timer = null;
var stopped = false;
var stallUntil = 0;
var blocks = 0;
var renderMs = 0;
var maxRenderMs = 0;
var rejectedEvents = 0;
var badRecycles = 0;
var histogram = new Uint32Array(32);
function snapshot() {
  return { generation: o.generation, sourceIds, frame, blocks, renderMs, maxRenderMs, blockMsHistogramLog2Us: Array.from(histogram), rejectedEvents, badRecycles, freeBuffers: free.length, inFlightBuffers: inFlight.filter(Boolean).length, deliveryTiming: delivery?.snapshot() ?? null, scheduler: tasks ? tasks.snapshot() : { kind: "timer", pendingTimer: timer !== null }, ...graphSnapshot(g, sourceIds) };
}
function stopPump() {
  clearTimeout(timer);
  timer = null;
  tasks?.dispose();
}
function fail(e) {
  stopped = true;
  stopPump();
  postMessage({ type: "error", message: String(e) });
}
function schedule() {
  if (!stopped && free.length && frame < end) {
    const delay = Math.max(0, stallUntil - performance.now());
    delivery?.requestTask(delay);
    if (tasks) tasks.schedule(delay);
    else if (timer === null) timer = setTimeout(pump, delay);
  }
}
function pump() {
  timer = null;
  if (stopped || !free.length || frame >= end) return;
  const stalled = performance.now() < stallUntil;
  delivery?.beginTask(stalled);
  if (stalled) {
    schedule();
    return;
  }
  try {
    const slot = free.pop(), n = Math.min(o.blockFrames, end - frame), pcm = new Float32Array(slot.buffer), start = performance.now();
    g.render(n);
    copyGraph(g, views, pcm, n, !!sourceIds);
    const elapsed = performance.now() - start;
    renderMs += elapsed;
    maxRenderMs = Math.max(maxRenderMs, elapsed);
    histogram[Math.min(31, Math.max(0, Math.ceil(Math.log2(Math.max(1, elapsed * 1e3)))))]++;
    blocks++;
    inFlight[slot.slot] = true;
    let producer;
    if (delivery) {
      delivery.published(slot.slot, frame + n < end, free.length);
      producer = { version: 1, ...delivery.snapshot(), frame: frame + n, blocks, freeBuffers: free.length, inFlightBuffers: inFlight.filter(Boolean).length, renderMs: elapsed, maxRenderMs };
    }
    const packet = { type: "block", generation: o.generation, slot: slot.slot, frame, n, buffer: slot.buffer };
    if (producer) packet.producer = producer;
    port.postMessage(packet, [slot.buffer]);
    frame += n;
    schedule();
  } catch (e) {
    fail(e);
  }
}
globalThis.onmessage = ({ data: d }) => {
  try {
    if (d.type === "init") {
      if (g || stopped) throw Error("Worker is single-generation; replace it to reset");
      o = workerOptions(d.options);
      if (!Number.isSafeInteger(d.endFrame) || d.endFrame < 1) throw Error("Invalid score end");
      end = d.endFrame;
      port = d.port;
      if (d.deliveryDiagnostics !== void 0 && typeof d.deliveryDiagnostics !== "boolean") throw Error("Invalid delivery diagnostics");
      if (d.deliveryDiagnostics) delivery = new WorkerDeliveryTiming(o.poolBlocks);
      sourceIds = d.sourceIds ?? null;
      if (sourceIds && (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.length > 6 || new Set(sourceIds).size !== sourceIds.length || sourceIds.some((id) => !Number.isInteger(id) || id < 1 || id > 6))) throw Error("Invalid source group");
      g = new ReferenceGraph(new WebAssembly.Instance(d.module, {}).exports, d.patch, d.contracts, d.rate, o.blockFrames);
      views = sourceViews(g, sourceIds);
      if (o.scheduling === "message") tasks = new WorkerTaskPump(pump);
      inFlight = Array(o.poolBlocks).fill(false);
      free = Array.from({ length: o.poolBlocks }, (_, slot) => ({ slot, buffer: new ArrayBuffer(o.bufferBytes) }));
      port.onmessage = ({ data: b }) => {
        if (stopped) return;
        if (b.type !== "recycle" || b.generation !== o.generation || !Number.isInteger(b.slot) || !inFlight[b.slot] || b.buffer?.byteLength !== o.bufferBytes) {
          badRecycles++;
          return;
        }
        delivery?.recycled(b.slot, b.consumerFrame);
        inFlight[b.slot] = false;
        free.push({ slot: b.slot, buffer: b.buffer });
        schedule();
      };
      postMessage({ type: "ready", options: o, memoryBytes: g.engine.memory.buffer.byteLength });
      schedule();
      return;
    }
    if (d.type === "dispose") {
      stopped = true;
      stopPump();
      g?.dispose();
      port?.close();
      postMessage({ type: "disposed" });
      close();
      return;
    }
    if (!g || stopped) throw Error("Worker is not running");
    if (d.generation !== o.generation) {
      postMessage({ type: "rejected", request: d.request, message: "Stale generation" });
      return;
    }
    if (d.type === "stats") {
      postMessage({ type: "stats", request: d.request, ...snapshot() });
      return;
    }
    if (d.type === "stall") {
      if (!Number.isFinite(d.ms) || d.ms < 0 || d.ms > 1e3) throw Error("Invalid stall");
      stallUntil = performance.now() + d.ms;
      delivery?.beginTask(true);
      postMessage({ type: "stalled", request: d.request, ms: d.ms, frame });
      return;
    }
    if (d.type === "event") {
      try {
        if (!Number.isSafeInteger(d.event?.frame) || d.event.frame < frame) throw Error("Event is inside already-rendered lookahead");
        g.enqueue(d.event);
        postMessage({ type: "accepted", request: d.request, frame, eventFrame: d.event.frame });
      } catch (e) {
        rejectedEvents++;
        postMessage({ type: "rejected", request: d.request, frame, message: String(e) });
      }
      return;
    }
    throw Error("Unknown worker command");
  } catch (e) {
    fail(e);
  }
};
