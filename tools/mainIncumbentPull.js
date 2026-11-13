import url from "./mainIncumbentPull.worklet.js?worker&url";
import { createSourceDisposalFence } from "../src/modular-audio/sourceDisposalFence.js";
const registered = /* @__PURE__ */ new WeakMap(), counts = /* @__PURE__ */ new WeakMap();
const bounded = (promise, label, ms = 1e4) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => timer = setTimeout(() => reject(Error(label + " timed out")), ms))]).finally(() => clearTimeout(timer));
};
async function borrowIncumbentControlPull({ g, root, role, onLease }) {
  const context = g.AC, owner = g.roles[role]?.instrument, backend = owner?.voice?.backend, source = backend?.node, initialClock = backend?.clockStatus?.(), generation = initialClock?.clock?.spec?.generation, destination = root.sourceDestination(role);
  const route = () => {
    root.check();
    if (g.roles[role].instrument !== owner || backend.node !== source || root.sourceDestination(role) !== destination || g.isRunning || g.ambienceRunning || g.liveNotes.size || g.noteLog.length || owner.disposed || owner.held?.size || backend.starts?.size || owner.voice?.keys?.size || backend.error) throw Error("Current incumbent route or explicit no-program admission changed");
  };
  if (typeof onLease !== "function" || !["lead", "counter", "pad", "bass", "rhythm"].includes(role) || context.state !== "running" || source?.context !== context || owner.AC !== context || backend.sourceClockProfile !== "native-clock-owned-core-fm-live-v1" || !generation || initialClock.clock.version !== "7a0838a735108706" || typeof backend.flush !== "function" || typeof source.sourceDisposalStatus !== "function" || (counts.get(context) ?? 0) >= 5) throw Error("Exact current Core/FM incumbent authority required");
  route();
  counts.set(context, (counts.get(context) ?? 0) + 1);
  let node, fence, attempted = false, connected = false, readyResolve, readyReject, request = 0, proof, error = null, closing, readyCallback = false;
  const pending = /* @__PURE__ */ new Map(), ready = new Promise((a, b) => {
    readyResolve = a;
    readyReject = b;
  });
  ready.catch(() => {
  });
  const terminal = () => source.sourceDisposalStatus(), released = () => context.state === "closed" || terminal()?.released === true && terminal()?.receipt?.clean === true;
  const snapshot = () => ({ profile: "review-current-incumbent-core-pull-v1", role, generation, attempted, connected, proof, error: error ? String(error) : null, sourceClock: backend.clockStatus(), sourceTerminal: terminal(), consumerTerminal: fence?.status() ?? null });
  const lease = { owner, source, release() {
    if (closing) return closing;
    if (attempted && !released()) throw Error("Keep current incumbent pull until actual source terminal ACK");
    closing = (async () => {
      const errors = [];
      if (attempted) try {
        source.disconnect(node);
        connected = false;
      } catch (e) {
        if (e.name !== "InvalidAccessError") errors.push(e);
      }
      try {
        node?.disconnect();
      } catch (e) {
        errors.push(e);
      }
      try {
        await fence?.dispose();
      } catch (e) {
        errors.push(e);
      }
      if (errors.length) throw new AggregateError(errors, "Incumbent consumer retirement failed");
      counts.set(context, Math.max(0, (counts.get(context) ?? 1) - 1));
      return { released: true, proof, terminal: terminal(), consumer: fence?.status() };
    })();
    closing.catch(() => {
    });
    return closing;
  }, status: snapshot };
  const stats = () => bounded(new Promise((resolve, reject) => {
    const id = ++request;
    if (request > 64) return reject(Error("Incumbent observation bound"));
    pending.set(id, { resolve, reject });
    node.port.postMessage({ type: "stats", request: id });
  }), "Incumbent consumer observation");
  try {
    if (!registered.has(context)) registered.set(context, context.audioWorklet.addModule(url));
    await bounded(registered.get(context), "Incumbent consumer registration");
    route();
    node = new AudioWorkletNode(context, "main-incumbent-control-pull-review-v1", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "max" });
    fence = createSourceDisposalFence(context, node, { label: "Current incumbent private control pull" });
    node.port.onmessage = ({ data: d }) => {
      if (fence.receive(d)) return;
      if (d.type === "ready" && d.version === 1) readyResolve();
      const p = pending.get(d.request);
      if (p) {
        pending.delete(d.request);
        p.resolve(d);
      }
    };
    node.onprocessorerror = () => {
      const e = Error("Incumbent consumer processor failed");
      error = e;
      fence.fail(e);
      readyReject(e);
      for (const p of pending.values()) p.reject(e);
      pending.clear();
    };
    onLease(lease);
    readyCallback = true;
    node.connect(context.destination);
    await bounded(ready, "Incumbent consumer ready");
    route();
    attempted = true;
    source.connect(node);
    connected = true;
    const first = await backend.flush();
    const observed = await bounded((async () => {
      for (; ; ) {
        const s = await stats();
        if (s.inputQuanta) return s;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })(), "Actual stereo incumbent input");
    const second = await backend.flush(), current = backend.clockStatus();
    route();
    if (!current.ready || current.clock.spec.generation !== generation || second.clock?.generation !== generation || second.frame !== second.clock.lastFrame + 128 || second.frame % 128 || second.frame < current.firstFrame + 128 || second.active !== 0 || second.late !== 0 || second.dropped !== 0 || observed.inputChannels !== 2 || observed.inputPeak !== 0) throw Error("Actual incumbent first-pull/FIFO/stereo-zero proof differs");
    proof = { profile: "current-program-incumbent-source-control-proof-v1", role, generation, currentProgramRoute: true, programNotesAbsent: true, directBackendNode: true, first, second, consumer: observed, clock: current };
    return lease;
  } catch (primary) {
    error = primary;
    if (!readyCallback || !attempted) try {
      await lease.release();
    } catch (cleanupError) {
      primary.cleanupError = cleanupError;
    }
    else primary.incumbentPullRetainedUntilSourceAck = true;
    primary.incumbentPull = snapshot();
    throw primary;
  }
}
export {
  borrowIncumbentControlPull
};
