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

// src/nodes/distortion.js
var MAX_DIST = 30;
var createDistCurve = (gain = 0) => {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; ++i) {
    const x = i * 2 / n_samples - 1;
    curve[i] = (3 + gain) * Math.atan(Math.sinh(x * 0.25) * 5) / (Math.PI + gain * Math.abs(x));
  }
  return curve;
};
var Distortion = class {
  dispose() {
    return this.ownership.retire();
  }
  cleanupStatus() {
    return this.ownership.status();
  }
  constructor(AC) {
    this.ownership = new AudioConstructorJournal({ capacity: 16, label: "Distortion" });
    try {
      this.AC = AC;
      this.dryGain = this.ownership.create("dryGain", () => new gain_default(this.AC), (owner) => owner.getNode().disconnect());
      this.wetGain = this.ownership.create("wetGain", () => new gain_default(this.AC), (owner) => owner.getNode().disconnect());
      this.node = this.ownership.create("node", () => this.AC.createWaveShaper(), (node) => node.disconnect());
      this.node.curve = createDistCurve();
      this.node.oversample = "none";
      this.node.connect(this.wetGain.getNode());
      this.distortion = 0;
      this.setDistortion(0);
      this.setAmount(0);
    } catch (error) {
      throw this.ownership.failure(error);
    }
  }
  connect = (destination) => {
    if (Array.isArray(destination)) {
      destination.forEach((dest) => {
        this.dryGain.connect(dest);
        this.wetGain.connect(dest);
      });
    } else {
      this.dryGain.connect(destination);
      this.wetGain.connect(destination);
    }
  };
  // Getters
  getNode = () => [this.dryGain.getNode(), this.node];
  getDistortion = () => this.distortion;
  getAmount = () => this.wetGain.getGain();
  // Setters
  setDistortion = (val) => {
    if (val < 0 || val > MAX_DIST) return false;
    this.distortion = val;
    this.node.curve = createDistCurve(val);
  };
  setAmount = (val) => {
    this.dryGain.setGain(1 - val);
    this.wetGain.setGain(val);
  };
};
var distortion_default = Distortion;
export {
  distortion_default as default
};
