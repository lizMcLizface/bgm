// src/modular-audio/graphWorker.js
import { ReferenceGraph } from "./runtime.js?v=f2251aa547f5b85b";

// src/modular-audio/workerProtocol.js
var BUS_COUNT = 8;
function workerOptions(raw = {}) {
  const o2 = { blockFrames: 1024, poolBlocks: 4, generation: 1, ...raw };
  if (![256, 512, 1024, 2048].includes(o2.blockFrames) || !Number.isInteger(o2.poolBlocks) || o2.poolBlocks < 2 || o2.poolBlocks > 8 || !Number.isInteger(o2.generation) || o2.generation < 1 || o2.generation > 4294967295) throw Error("Invalid worker bounds");
  o2.delayFrames = o2.blockFrames * o2.poolBlocks;
  o2.bufferBytes = o2.blockFrames * BUS_COUNT * 2 * 4;
  return o2;
}
function sourceViews(g2) {
  const views2 = Array.from({ length: 6 }, (_, i) => g2.outputs.get(i + 1));
  views2.push(g2.kicks.get(6));
  if (views2.some((x) => !x)) throw Error("Worker requires six-role source ports");
  return views2;
}
function copyGraph(g2, views2, pcm, frames) {
  for (let bus = 0; bus < BUS_COUNT; bus++) for (let i = 0; i < frames; i++) {
    const to = (bus * frames + i) * 2;
    pcm[to] = bus === 7 ? g2.left[i] : views2[bus][i * 2];
    pcm[to + 1] = bus === 7 ? g2.right[i] : views2[bus][i * 2 + 1];
  }
}
function graphSnapshot(g2) {
  return {
    graph: g2.stats(),
    meters: g2.meters(),
    memoryBytes: g2.engine.memory.buffer.byteLength,
    roles: Array.from({ length: 6 }, (_, i) => i === 5 ? g2.percussionStats(i + 1) : g2.pitchedStats(i + 1))
  };
}

// src/modular-audio/graphWorker.js
var g;
var views;
var o;
var port;
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
  return { generation: o.generation, frame, blocks, renderMs, maxRenderMs, blockMsHistogramLog2Us: Array.from(histogram), rejectedEvents, badRecycles, freeBuffers: free.length, inFlightBuffers: inFlight.filter(Boolean).length, ...graphSnapshot(g) };
}
function fail(e) {
  stopped = true;
  clearTimeout(timer);
  postMessage({ type: "error", message: String(e) });
}
function schedule() {
  if (!stopped && timer === null && free.length && frame < end) timer = setTimeout(pump, Math.max(0, stallUntil - performance.now()));
}
function pump() {
  timer = null;
  if (stopped || !free.length || frame >= end) return;
  if (performance.now() < stallUntil) {
    schedule();
    return;
  }
  try {
    const slot = free.pop(), n = Math.min(o.blockFrames, end - frame), pcm = new Float32Array(slot.buffer), start = performance.now();
    g.render(n);
    copyGraph(g, views, pcm, n);
    const elapsed = performance.now() - start;
    renderMs += elapsed;
    maxRenderMs = Math.max(maxRenderMs, elapsed);
    histogram[Math.min(31, Math.max(0, Math.ceil(Math.log2(Math.max(1, elapsed * 1e3)))))]++;
    blocks++;
    inFlight[slot.slot] = true;
    port.postMessage({ type: "block", generation: o.generation, slot: slot.slot, frame, n, buffer: slot.buffer }, [slot.buffer]);
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
      g = new ReferenceGraph(new WebAssembly.Instance(d.module, {}).exports, d.patch, d.contracts, d.rate, o.blockFrames);
      views = sourceViews(g);
      inFlight = Array(o.poolBlocks).fill(false);
      free = Array.from({ length: o.poolBlocks }, (_, slot) => ({ slot, buffer: new ArrayBuffer(o.bufferBytes) }));
      port.onmessage = ({ data: b }) => {
        if (stopped) return;
        if (b.type !== "recycle" || b.generation !== o.generation || !Number.isInteger(b.slot) || !inFlight[b.slot] || b.buffer?.byteLength !== o.bufferBytes) {
          badRecycles++;
          return;
        }
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
      clearTimeout(timer);
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
