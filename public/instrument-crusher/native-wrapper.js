// src/modular-audio/sourceDisposalFence.js
function createSourceDisposalFence(context, node, { label = "Audio source", message = { type: "dispose" }, timeoutMs = 1e3 } = {}) {
  if (!node?.port || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1e4) throw Error("Invalid source disposal fence");
  let disposal, resolve, reject, timer, receipt = null, released = false, primary = null, closed = false, quarantined = false, lateReceipt = false;
  const cleanup = [];
  const status = () => ({ version: 1, profile: "source-terminal-receipt-v1", capability: true, released, quarantined, lateReceipt, receipt: receipt ? { ...receipt } : null, error: primary ? String(primary) : null, cleanupErrors: cleanup.map(String) });
  const cleanupPort = () => {
    if (closed) return;
    closed = true;
    for (const action of [() => node.port.close(), () => {
      node.port.onmessage = null;
    }, () => {
      node.onprocessorerror = null;
    }, () => context.removeEventListener?.("statechange", onClosed)]) try {
      action();
    } catch (error) {
      cleanup.push(error);
    }
  };
  const finish = () => {
    clearTimeout(timer);
    cleanupPort();
    const errors = [...primary ? [primary] : [], ...cleanup];
    if (errors.length) reject?.(errors.length === 1 ? errors[0] : new AggregateError(errors, label + " release failed"));
    else resolve?.(status());
  };
  const onClosed = () => {
    if (context.state !== "closed") return;
    released = true;
    quarantined = false;
    receipt ??= { type: "disposed", version: 1, released: true, clean: true, reason: "context-closed" };
    finish();
  };
  const fail = (error) => {
    primary ??= error instanceof Error ? error : Error(String(error));
    quarantined = !released;
    if (disposal) {
      clearTimeout(timer);
      reject(primary);
    }
  };
  return Object.freeze({
    status,
    fail,
    receive(data) {
      if (data?.type !== "disposed") return false;
      if (data.version !== 1 || data.released !== true || typeof data.clean !== "boolean") {
        fail(Error(label + " invalid terminal receipt"));
        return true;
      }
      lateReceipt = quarantined;
      receipt = { ...data };
      released = true;
      quarantined = false;
      if (!data.clean) primary ??= Error(data.error ?? label + " terminal cleanup failed");
      finish();
      return true;
    },
    dispose() {
      if (disposal) return disposal;
      disposal = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      disposal.catch(() => {
      });
      if (released) {
        finish();
        return disposal;
      }
      if (context.state === "closed") {
        onClosed();
        return disposal;
      }
      try {
        context.addEventListener?.("statechange", onClosed);
      } catch (error) {
        fail(error);
      }
      timer = setTimeout(() => fail(Error(label + " disposal acknowledgement timed out; source quarantined")), timeoutMs);
      try {
        node.port.postMessage(message);
      } catch (error) {
        fail(error);
      }
      if (primary) fail(primary);
      onClosed();
      return disposal;
    }
  });
}

// src/audio/processorRetirements.js
var ProcessorRetirements = class {
  constructor(context, { label = "Native processor", capacity = 2, timeoutMs = 1e3 } = {}) {
    if (!context || capacity !== 2 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1e4) throw Error("Invalid bounded processor ownership");
    this.context = context;
    this.label = label;
    this.capacity = capacity;
    this.timeoutMs = timeoutMs;
    this.records = /* @__PURE__ */ new Map();
    this.retirementPromises = /* @__PURE__ */ new WeakMap();
    this.history = [];
    this.constructing = 0;
    this.sequence = 0;
    this.closed = false;
    this.error = null;
    this.disposal = null;
  }
  check() {
    if (this.closed || this.error) throw this.error ?? Error(this.label + " disposed");
  }
  preflight() {
    this.check();
    if (this.records.size + this.constructing >= this.capacity || this.sequence === 4294967295) throw Error(this.label + " source capacity exhausted before mutation");
  }
  create(kind, make, { beforeDisconnect = null } = {}) {
    this.preflight();
    if (!["worklet", "script"].includes(kind) || typeof make !== "function" || beforeDisconnect !== null && typeof beforeDisconnect !== "function") throw Error("Invalid actual processor factory");
    this.constructing++;
    let node, record;
    try {
      node = make();
      if (!node || this.records.has(node) || this.retirementPromises.has(node)) throw Error("Processor factory returned no independent node");
      record = { id: ++this.sequence, node, kind, extras: [], phase: "active", fence: null, promise: null, error: null, callbackCleared: false, beforeDisconnect };
      this.records.set(node, record);
      if (kind === "worklet") {
        const fence = createSourceDisposalFence(this.context, node, { label: this.label, timeoutMs: this.timeoutMs });
        record.fence = fence;
        const previous = node.port.onmessage, onError = node.onprocessorerror;
        node.port.onmessage = (event) => {
          if (!fence.receive(event.data)) previous?.(event);
        };
        node.onprocessorerror = (event) => {
          const error = Error(this.label + " processor failed");
          record.error ??= error;
          this.error ??= error;
          fence.fail(error);
          onError?.(event);
        };
        node.sourceDisposalStatus = fence.status;
        node.disposeOwned = () => this.retire(node);
      }
      return node;
    } catch (error) {
      if (record) {
        const cleanup = this.retire(node);
        error.cleanupReady = cleanup;
        cleanup.catch((cleanupError) => {
          error.cleanupError ??= cleanupError;
        });
      }
      throw error;
    } finally {
      this.constructing--;
    }
  }
  ownExtra(node, extra) {
    const record = this.records.get(node);
    if (!record || record.phase !== "active" || record.extras.length >= 1 || !extra?.disconnect) throw Error("Invalid private processor adjunct");
    record.extras.push(extra);
    return extra;
  }
  retire(node) {
    const record = this.records.get(node);
    if (!record) {
      const known = this.retirementPromises.get(node);
      if (known) return known;
      throw Error("Cannot retire an unowned processor");
    }
    if (record.promise) return record.promise;
    let resolve, reject;
    record.promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    record.promise.catch(() => {
    });
    this.retirementPromises.set(node, record.promise);
    record.phase = "retiring";
    const errors = [];
    let terminal;
    if (record.kind === "worklet") try {
      if (!record.fence) throw Error("Actual worklet has no terminal receiver");
      terminal = record.fence.dispose();
    } catch (error) {
      errors.push(error);
    }
    else try {
      node.onaudioprocess = null;
      record.callbackCleared = node.onaudioprocess === null;
      if (!record.callbackCleared) throw Error("ScriptProcessor callback was not cleared");
    } catch (error) {
      errors.push(error);
    }
    if (record.beforeDisconnect) try {
      record.beforeDisconnect();
    } catch (error) {
      errors.push(error);
    }
    for (const target of [node, ...record.extras]) try {
      target.disconnect();
    } catch (error) {
      errors.push(error);
    }
    Promise.allSettled(terminal ? [terminal] : []).then((results) => {
      for (const result of results) if (result.status === "rejected") errors.push(result.reason);
      if (record.error && !errors.includes(record.error)) errors.push(record.error);
      if (errors.length) {
        record.error = errors.length === 1 ? errors[0] : new AggregateError(errors, this.label + " retirement failed");
        record.phase = "quarantined";
        this.error ??= record.error;
        reject(record.error);
        return;
      }
      record.phase = "retired";
      const receipt = record.kind === "worklet" ? record.fence.status() : { profile: "script-processor-callback-closure-v1", clean: true, callbackCleared: true, sourceEndedAcknowledged: false };
      this.history.push({ id: record.id, kind: record.kind, phase: record.phase, receipt });
      if (this.history.length > 4) this.history.shift();
      this.records.delete(node);
      resolve(receipt);
    });
    return record.promise;
  }
  dispose() {
    if (this.disposal) return this.disposal;
    this.closed = true;
    const pending = [...this.records.keys()].map((node) => this.retire(node));
    this.disposal = Promise.allSettled(pending).then((results) => {
      const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason);
      if (this.error && !errors.includes(this.error)) errors.push(this.error);
      if (errors.length) throw new AggregateError(errors, this.label + " owner retirement failed");
      return { clean: true, profile: "processor-owner-set-retirement-v1", remaining: this.records.size };
    });
    this.disposal.catch(() => {
    });
    return this.disposal;
  }
  actors() {
    return [...this.records.values()].map((record) => ({ node: record.node, kind: record.kind, id: record.id, phase: record.phase }));
  }
  status() {
    return { profile: "bounded-processor-owner-set-v1", capacity: this.capacity, constructing: this.constructing, closed: this.closed, error: this.error ? String(this.error) : null, actors: [...this.records.values()].map((record) => ({ id: record.id, kind: record.kind, phase: record.phase, extras: record.extras.length, error: record.error ? String(record.error) : null, terminal: record.fence?.status() ?? null, callbackCleared: record.callbackCleared })), history: this.history.slice() };
  }
};

// src/audio/processorModuleObservation.js
function observeProcessorModule(load, { timeoutMs = 1e4, timers = globalThis } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1e4) throw Error("Invalid processor module deadline");
  let done = false, resolve;
  const promise = new Promise((yes) => resolve = yes), finish = (value) => {
    if (done) return;
    done = true;
    timers.clearTimeout(timer);
    resolve(value);
  }, timer = timers.setTimeout(() => finish({ loaded: false, error: Error("Processor module observation timed out") }), timeoutMs);
  Promise.resolve(load).then(() => finish({ loaded: true }), (error) => finish({ loaded: false, error }));
  return { promise, cancel: () => finish({ cancelled: true }) };
}

// src/audio/constructorJournal.js
var requireClean = (receipt) => {
  if (receipt && typeof receipt === "object" && (receipt.clean === false || receipt.acknowledged === false || receipt.released === false || receipt.quarantined === true)) throw Error("Explicit audio owner returned an unclean retirement receipt");
  return receipt;
};
var AudioConstructorJournal = class {
  constructor({ capacity = 256, label = "Audio constructor" } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1024 || typeof label !== "string" || !label.length || label.length > 100) throw Error("Invalid constructor ownership journal");
    this.capacity = capacity;
    this.label = label;
    this.records = [];
    this.seen = /* @__PURE__ */ new WeakSet();
    this.state = "open";
    this.retirement = null;
  }
  create(label, make, release) {
    if (this.state !== "open" || this.records.length >= this.capacity || typeof label !== "string" || !label.length || label.length > 100 || typeof make !== "function" || typeof release !== "function") throw Error("Constructor ownership admission refused");
    const value = make();
    if (!value || typeof value !== "object" && typeof value !== "function" || this.seen.has(value)) throw Error("Constructor returned no independent private owner");
    this.seen.add(value);
    this.records.push({ label, value, release, attempted: false, closed: false, error: null });
    return value;
  }
  retire() {
    if (this.retirement) return this.retirement;
    this.state = "retiring";
    let resolve, reject;
    this.retirement = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    this.retirement.catch(() => {
    });
    const pending = [];
    for (const record of this.records.slice().reverse()) {
      record.attempted = true;
      let work;
      try {
        work = record.release(record.value);
        if (work === this.retirement) throw Error("Constructor cleanup returned its own retirement fence");
      } catch (error) {
        work = Promise.reject(error);
      }
      pending.push(Promise.resolve(work).then(requireClean).then(() => {
        record.closed = true;
      }, (error) => {
        record.error = error;
        throw error;
      }));
    }
    Promise.allSettled(pending).then((results) => {
      const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
      this.state = errors.length ? "cleanup-failed" : "retired";
      if (errors.length) reject(new AggregateError(errors, this.label + " cleanup failed"));
      else resolve({ clean: true, profile: "constructor-cleanup-journal-v1", owners: this.records.length });
    });
    return this.retirement;
  }
  failure(reason) {
    const error = reason && typeof reason === "object" ? reason : Error(String(reason)), inner = error.cleanupReady, outer = this.retire();
    const cleanupReady = Promise.allSettled([...inner?.then ? [inner] : [], outer]).then((results) => {
      const errors = results.flatMap((result) => {
        if (result.status === "rejected") return [result.reason];
        try {
          requireClean(result.value);
          return [];
        } catch (error2) {
          return [error2];
        }
      });
      if (errors.length) throw errors.length === 1 ? errors[0] : new AggregateError(errors, this.label + " nested cleanup failed");
      return { clean: true, profile: "constructor-cleanup-journal-v1", owners: this.records.length };
    });
    error.cleanupReady = cleanupReady;
    cleanupReady.catch((cleanupError) => {
      error.cleanupError ??= cleanupError;
    });
    return error;
  }
  status() {
    return { profile: "constructor-cleanup-journal-v1", state: this.state, capacity: this.capacity, owners: this.records.length, records: this.records.map((record) => ({ label: record.label, attempted: record.attempted, closed: record.closed, error: record.error ? String(record.error) : null })) };
  }
};
function settleAudioCleanup(label, actions) {
  if (typeof label !== "string" || !Array.isArray(actions) || actions.length > 256 || actions.some((action) => typeof action !== "function")) throw Error("Invalid bounded audio cleanup actions");
  const pending = actions.map((action) => {
    try {
      return Promise.resolve(action()).then(requireClean);
    } catch (error) {
      return Promise.reject(error);
    }
  });
  return Promise.allSettled(pending).then((results) => {
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, label + " cleanup failed");
    return { clean: true, profile: "explicit-audio-cleanup-actions-v1", actions: actions.length };
  });
}

// src/util/util.js
var envelopeShape = (t, shape, exponent = 2) => {
  let scaledT;
  switch (shape) {
    case "linear":
      scaledT = t;
      break;
    case "exponential":
      scaledT = Math.pow(t, exponent);
      break;
    case "logarithmic":
      scaledT = 1 - Math.pow(1 - t, exponent);
      break;
    case "sine":
      scaledT = Math.sin(t * Math.PI / 2);
      if (exponent !== 1) {
        scaledT = Math.pow(scaledT, exponent);
      }
      break;
    case "cosine":
      scaledT = 1 - Math.cos(t * Math.PI / 2);
      if (exponent !== 1) {
        scaledT = Math.pow(scaledT, exponent);
      }
      break;
    case "smooth":
      scaledT = t * t * (3 - 2 * t);
      if (exponent !== 1) {
        scaledT = Math.pow(scaledT, exponent);
      }
      break;
    case "sharp":
      scaledT = t < 0.2 ? Math.pow(t / 0.2, exponent) * 0.6 : 0.6 + (t - 0.2) / 0.8 * 0.4;
      break;
    case "curved":
      scaledT = t * t * t * (t * (t * 6 - 15) + 10);
      if (exponent !== 1) {
        scaledT = Math.pow(scaledT, exponent);
      }
      break;
    case "steep":
      scaledT = 1 - Math.pow(1 - t, exponent * 2);
      break;
    case "gentle":
      scaledT = Math.pow(t, exponent * 0.5);
      break;
    case "bounce":
      if (t < 0.7) {
        scaledT = Math.pow(t / 0.7, exponent) * 1.2;
      } else {
        const overshoot = 1.2 - (t - 0.7) / 0.3 * 0.2;
        scaledT = Math.max(overshoot, 1);
      }
      break;
    case "overshoot":
      if (t < 0.6) {
        scaledT = Math.pow(t / 0.6, exponent) * 1.3;
      } else {
        scaledT = 1.3 - (t - 0.6) / 0.4 * 0.3;
      }
      break;
    default:
      scaledT = t;
  }
  return Math.max(0, Math.min(2, scaledT));
};
var generateEnvelopeCurve = (initialLevel, finalLevel, shape, exponent = 2, steps = 100) => {
  if (steps < 2) return [initialLevel, finalLevel];
  const curve = [];
  const range = finalLevel - initialLevel;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    curve.push(initialLevel + range * envelopeShape(t, shape, exponent));
  }
  return curve;
};

// src/nodes/gain.js
var Gain = class {
  constructor(AC) {
    this.AC = AC;
    this.node = this.AC.createGain();
  }
  connect = (destination) => {
    if (Array.isArray(destination)) {
      destination.forEach((dest) => this.node.connect(dest));
    } else {
      this.node.connect(destination);
    }
  };
  disconnect = (destination) => {
    try {
      if (destination) {
        this.node.disconnect(destination);
      } else {
        this.node.disconnect();
      }
    } catch (e) {
      console.warn("Failed to disconnect Gain node:", e);
    }
  };
  // Getters
  getNode = () => this.node;
  getGain = () => this.node.gain.value;
  // Setters
  setGain = (val, time = 0) => {
    time ? this.node.gain.setTargetAtTime(val, this.AC.currentTime, time) : this.node.gain.setValueAtTime(val, this.AC.currentTime);
  };
  /**
   * Sets gain using an envelope curve
   * @param {number} currentLevel - Starting gain value (if null, reads current value)
   * @param {number} finalLevel - Target gain value
   * @param {number} duration - Time duration in seconds (0 = immediate)
   * @param {string} shape - Envelope shape type
   * @param {number} exponent - Curve exponent factor
   * @param {number} startTime - When to start the curve (default: now)
   */
  setGainCurve = (currentLevel, finalLevel, duration = 0, shape = "linear", exponent = 2, startTime = null) => {
    const when = startTime !== null ? startTime : this.AC.currentTime;
    try {
      this.node.gain.cancelScheduledValues(when);
    } catch (e) {
      console.warn("Failed to cancel scheduled values:", e);
    }
    const actualCurrentLevel = this.node.gain.value;
    if (duration <= 0) {
      try {
        this.node.gain.setValueAtTime(finalLevel, when);
      } catch (e) {
        console.warn("Failed to set immediate gain value:", e);
      }
      return;
    }
    const steps = Math.max(10, Math.min(512, Math.floor(duration * 100)));
    const curve = generateEnvelopeCurve(actualCurrentLevel, finalLevel, shape, exponent, steps);
    const curveArray = new Float32Array(curve);
    try {
      this.node.gain.setValueCurveAtTime(curveArray, when, duration);
    } catch (e) {
      console.warn("setValueCurveAtTime failed, using fallback:", e);
      try {
        this.node.gain.setValueAtTime(actualCurrentLevel, when);
        this.node.gain.linearRampToValueAtTime(finalLevel, when + duration);
      } catch (fallbackError) {
        console.warn("Fallback gain update also failed:", fallbackError);
        this.node.gain.setValueAtTime(finalLevel, this.AC.currentTime);
      }
    }
  };
};
var gain_default = Gain;

// src/nodes/bitcrusher.js
var moduleLoads = /* @__PURE__ */ new WeakMap();
function loadModule(AC) {
  if (!moduleLoads.has(AC)) {
    moduleLoads.set(AC, AC.audioWorklet.addModule(`${"/"}bitcrusher-processor.js`));
  }
  return moduleLoads.get(AC);
}
var bitCrusherReady = (AC) => AC.audioWorklet ? loadModule(AC).catch(() => {
}) : Promise.resolve();
var BitCrusher = class {
  constructor(AC) {
    this.AC = AC;
    this.bufferSize = 256;
    this.bits = 8;
    this.normfreq = 0.25;
    this.amount = 0;
    this.node = null;
    this.disposed = false;
    this.failure = null;
    this.disposal = null;
    this.sources = new ProcessorRetirements(AC, { label: "Native BitCrusher" });
    this.ownership = new AudioConstructorJournal({ capacity: 3, label: "Native BitCrusher stable gains" });
    try {
      this.dryGain = this.ownership.create("dry", () => new gain_default(AC), (gain) => gain.getNode().disconnect());
      this.wetGain = this.ownership.create("wet", () => new gain_default(AC), (gain) => gain.getNode().disconnect());
      this.wetInput = this.ownership.create("input", () => new gain_default(AC), (gain) => gain.getNode().disconnect());
      this.workletState = AC.audioWorklet ? "loading" : "unsupported";
      this.ready = Promise.resolve(this);
      if (AC.audioWorklet) {
        this.moduleObservation = observeProcessorModule(loadModule(AC));
        this.ready = this.moduleObservation.promise.then((result) => {
          if (this.disposed || result.cancelled) return this;
          this.moduleError = result.error ?? null;
          this.workletState = result.loaded ? "ready" : "unsupported";
          this.updateNode();
          return this;
        });
        this.ready.catch((error) => {
          this.failure ??= error;
          const earlier = error.cleanupReady;
          error.cleanupReady = settleAudioCleanup("Native BitCrusher preparation", [() => earlier, () => this.dispose()]);
          error.cleanupReady.catch((cleanupError) => {
            error.cleanupError ??= cleanupError;
          });
        });
      }
      this.setAmount(0);
    } catch (error) {
      this.disposed = true;
      this.moduleObservation?.cancel();
      const earlier = error.cleanupReady;
      error.cleanupReady = settleAudioCleanup("Native BitCrusher constructor", [() => earlier, () => this.sources.dispose(), () => this.ownership.retire()]);
      error.cleanupReady.catch((cleanupError) => {
        error.cleanupError ??= cleanupError;
      });
      throw error;
    }
  }
  check() {
    if (this.disposed || this.failure) throw this.failure ?? Error("Native BitCrusher disposed");
    this.sources.check();
  }
  connect = (destination) => {
    this.check();
    if (Array.isArray(destination)) destination.forEach((dest) => {
      this.dryGain.connect(dest);
      this.wetGain.connect(dest);
    });
    else {
      this.dryGain.connect(destination);
      this.wetGain.connect(destination);
    }
  };
  getNode = () => [this.dryGain.getNode(), this.wetInput.getNode()];
  getBitDepth = () => this.bits;
  getAmount = () => this.wetGain.getGain();
  updateNode() {
    this.check();
    const wanted = this.amount > 0;
    if (!wanted && this.node) {
      const node = this.node;
      this.node = null;
      this.sources.retire(node).catch((error) => {
        this.failure ??= error;
      });
    } else if (wanted && !this.node && this.workletState !== "loading") {
      this.sources.preflight();
      let node;
      try {
        node = this.sources.create(this.workletState === "ready" ? "worklet" : "script", () => this.workletState === "ready" ? new AudioWorkletNode(this.AC, "bitcrusher-processor", { parameterData: { bits: this.bits, normfreq: this.normfreq } }) : this.createScriptProcessor(), { beforeDisconnect: () => this.wetInput.getNode().disconnect() });
        this.node = node;
        this.wetInput.connect(node);
        node.connect(this.wetGain.getNode());
      } catch (error) {
        this.node = null;
        this.failure ??= error;
        const earlier = error.cleanupReady;
        error.cleanupReady = settleAudioCleanup("Native BitCrusher partial processor", [() => earlier, () => this.dispose()]);
        error.cleanupReady.catch((cleanupError) => {
          error.cleanupError ??= cleanupError;
        });
        throw error;
      }
    }
  }
  createScriptProcessor() {
    const node = this.AC.createScriptProcessor(this.bufferSize, 1, 1);
    let phaser = 0;
    let last = 0;
    node.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);
      const step = Math.pow(0.75, this.bits);
      for (let i = 0; i < this.bufferSize; i++) {
        phaser += this.normfreq;
        if (phaser >= 1) {
          phaser -= 1;
          last = step * Math.floor(input[i] / step + 0.5);
        }
        output[i] = last;
      }
    };
    return node;
  }
  // Setters
  setBitDepth = (bitDepth) => {
    this.check();
    if (bitDepth === this.bits) return false;
    this.bits = bitDepth;
    if (this.node && this.node.parameters) {
      this.node.parameters.get("bits").setValueAtTime(bitDepth, this.AC.currentTime);
    }
  };
  setAmount = (val) => {
    this.check();
    if (val > 0 && !this.node && this.workletState !== "loading") this.sources.preflight();
    this.amount = val;
    if (val < 0.5) {
      this.dryGain.setGain(1);
      this.wetGain.setGain(val * 2);
    } else {
      this.dryGain.setGain(1 - (val - 0.5) * 2);
      this.wetGain.setGain(1);
    }
    this.updateNode();
  };
  dispose() {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.moduleObservation?.cancel();
    this.node = null;
    this.disposal = settleAudioCleanup("Native BitCrusher disposal", [() => this.sources.dispose(), () => this.ownership.retire()]);
    this.disposal.catch((error) => {
      this.cleanupError ??= error;
    });
    return this.disposal;
  }
  sourceActors = () => this.sources.actors();
  disposalStatus = () => ({ profile: "native-bitcrusher-owner-lifecycle-v1", backend: "native-js", disposed: this.disposed, moduleState: this.workletState, moduleError: this.moduleError ? String(this.moduleError) : null, error: this.failure ? String(this.failure) : this.cleanupError ? String(this.cleanupError) : null, processors: this.sources.status(), stable: this.ownership.status() });
};
var bitcrusher_default = BitCrusher;
export {
  bitCrusherReady,
  bitcrusher_default as default
};
