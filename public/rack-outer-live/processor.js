(() => {
  // src/modular-audio/nativeContextClockCodec.js
  var NATIVE_CONTEXT_CLOCK_PROFILE = "native-loop-cycle-clock-v1";
  var NATIVE_CLOCK_HORIZON_SECONDS = 2 ** 20;
  var NATIVE_CLOCK_CYCLE_LIMIT = 2 ** 17;
  var NATIVE_CLOCK_ERROR_BOUND = 1 / 32;
  var NATIVE_CLOCK_FRAME_MAX = 2 ** 40 - 128;
  var NativeClockError = class extends Error {
    constructor(code, message) {
      super(message);
      this.name = "NativeClockError";
      this.code = code;
    }
  };
  function reject(code, message) {
    throw new NativeClockError(code, message);
  }
  function nativeContextClockSpec(rate, epochFrame, generation = 1) {
    if (!Number.isInteger(rate) || rate < 8e3 || rate > 192e3 || !Number.isSafeInteger(epochFrame) || epochFrame < 0 || epochFrame + NATIVE_CLOCK_HORIZON_SECONDS * rate > NATIVE_CLOCK_FRAME_MAX || !Number.isInteger(generation) || generation < 1 || generation > 4294967295) reject("SPEC", "Invalid Native context clock spec");
    return Object.freeze({ version: 1, profile: NATIVE_CONTEXT_CLOCK_PROFILE, rate, epochFrame, generation, periodSeconds: 8, horizonSeconds: NATIVE_CLOCK_HORIZON_SECONDS, errorBound: NATIVE_CLOCK_ERROR_BOUND });
  }
  function validateNativeContextClockSpec(raw) {
    if (!raw || Object.keys(raw).length !== 8) reject("SPEC", "Complete immutable clock spec required");
    const s = nativeContextClockSpec(raw.rate, raw.epochFrame, raw.generation);
    for (const k of Object.keys(s)) if (raw[k] !== s[k]) reject("SPEC", "Native clock profile differs");
    return s;
  }
  function nativeContextClockDescriptors() {
    return [{ name: "nativeClockLow", defaultValue: 0, minValue: 0, maxValue: 16777215, automationRate: "a-rate" }, { name: "nativeClockCoarse", defaultValue: 0, minValue: -8, maxValue: NATIVE_CLOCK_CYCLE_LIMIT, automationRate: "a-rate" }];
  }
  var NativeContextClockCodec = class {
    constructor(spec, { allowGaps = true, requireInitialCycleZero = false, maxPendingQuanta = 64 } = {}) {
      this.spec = validateNativeContextClockSpec(spec);
      if (typeof allowGaps !== "boolean" || typeof requireInitialCycleZero !== "boolean" || !Number.isInteger(maxPendingQuanta) || maxPendingQuanta < 1 || maxPendingQuanta > 3e3) reject("SPEC", "Invalid clock ledger policy");
      this.allowGaps = allowGaps;
      this.requireInitialCycleZero = requireInitialCycleZero;
      this.maxPendingQuanta = maxPendingQuanta;
      this.periodFrames = this.spec.rate * 8;
      this.expiryFrame = this.spec.epochFrame + this.spec.rate * NATIVE_CLOCK_HORIZON_SECONDS;
      this.decoded = new Float64Array(128);
      this.quantum = 128;
      this.maxLagFrames = 8192;
      this.lastFrame = null;
      this.calls = 0;
      this.pendingQuanta = 0;
      this.forwardGapFrames = 0;
      this.maxCycleResidual = 0;
      this.rejected = 0;
      this.lastCode = null;
    }
    fail(code, message) {
      this.rejected++;
      this.lastCode = code;
      reject(code, message);
    }
    pending(low, coarse, allowPending) {
      if (!allowPending || this.lastFrame !== null) this.fail("NOT_STARTED", "Native clock has no complete current code");
      if (this.pendingQuanta >= this.maxPendingQuanta) this.fail("PENDING_LIMIT", "Native clock readiness callback bound");
      let first = -1;
      for (let i = 0; i < low.length; i++) {
        if (low[i] !== 0) {
          first = i;
          break;
        }
      }
      if (first < 0) {
        for (const x of coarse) if (x !== 0 && x !== -7) this.fail("PENDING_CODE", "Unknown prestart clock signal");
      } else {
        if (low.length !== 128 || first !== this.spec.epochFrame % 128) this.fail("PENDING_CODE", "Partial epoch boundary differs");
        for (let i = 0; i < 128; i++) {
          if (i < first) {
            if (low[i] !== 0) this.fail("PENDING_CODE", "Invalid prestart low prefix");
          } else if (low[i] !== i - first + 1) this.fail("PENDING_CODE", "Invalid partial low code");
          const c = coarse[coarse.length === 1 ? 0 : i];
          if (i < first) {
            if (c !== -7 && c !== 0) this.fail("PENDING_CODE", "Invalid coarse prestart prefix");
          } else if (Math.abs(c - (i - first) / this.periodFrames) > NATIVE_CLOCK_ERROR_BOUND) this.fail("PENDING_CODE", "Invalid partial coarse code");
        }
      }
      this.pendingQuanta++;
      return null;
    }
    next(parameters, { allowPending = false } = {}) {
      if (typeof allowPending !== "boolean") this.fail("ACTIVITY", "Clock pending authority must be Boolean");
      const low = parameters?.nativeClockLow, coarse = parameters?.nativeClockCoarse;
      if (!(low instanceof Float32Array) || ![1, 128].includes(low.length) || !(coarse instanceof Float32Array) || ![1, 128].includes(coarse.length)) this.fail("SHAPE", "Native clock requires Float32 AudioParam fields");
      for (const x of low) if (!Number.isFinite(x) || !Number.isInteger(x) || x < 0 || x > this.periodFrames) this.fail("LOW_WORD", "Invalid integer low clock word");
      for (const x of coarse) if (!Number.isFinite(x) || x < -7 || x > NATIVE_CLOCK_CYCLE_LIMIT) this.fail("COARSE_WORD", "Invalid coarse clock word");
      let hasZero = false;
      for (const x of low) if (x === 0) hasZero = true;
      if (hasZero) return this.pending(low, coarse, allowPending);
      if (low.length !== 128) this.fail("SHAPE", "Active low clock must contain128samples");
      let maxResidual = 0;
      for (let i = 0; i < 128; i++) {
        const l = low[i] - 1, c = coarse[coarse.length === 1 ? 0 : i], phase = l / this.periodFrames, h = Math.round(c - phase), residual = Math.abs(c - (h + phase));
        if (c < 0 || h < 0 || h > NATIVE_CLOCK_CYCLE_LIMIT || residual > NATIVE_CLOCK_ERROR_BOUND) this.fail("RESIDUAL", "Native clock integer code exceeds declared envelope");
        const frame2 = this.spec.epochFrame + h * this.periodFrames + l;
        if (!Number.isSafeInteger(frame2) || frame2 >= this.expiryFrame || frame2 > NATIVE_CLOCK_FRAME_MAX) this.fail("EXPIRED", "Native clock generation horizon expired");
        if (i && frame2 !== this.decoded[i - 1] + 1) this.fail("VECTOR", "Native clock vector is not consecutive");
        this.decoded[i] = frame2;
        maxResidual = Math.max(maxResidual, residual);
      }
      const frame = this.decoded[0];
      if (frame % 128) this.fail("CANONICAL", "Native clock callback is not canonical");
      if (this.lastFrame === null && this.requireInitialCycleZero && frame >= this.spec.epochFrame + this.periodFrames) this.fail("INITIAL_CYCLE", "Native clock anchor missed its initial cycle");
      if (this.lastFrame !== null) {
        const gap = frame - this.lastFrame - 128;
        if (gap < 0 || !this.allowGaps && gap !== 0) this.fail("CHRONOLOGY", "Native clock ledger moved backwards/repeated/skipped");
        this.forwardGapFrames += gap;
      }
      this.lastFrame = frame;
      this.calls++;
      this.maxCycleResidual = Math.max(this.maxCycleResidual, maxResidual);
      this.lastCode = null;
      return frame;
    }
    snapshot() {
      return { profile: NATIVE_CONTEXT_CLOCK_PROFILE, generation: this.spec.generation, epochFrame: this.spec.epochFrame, periodFrames: this.periodFrames, expiryFrame: this.expiryFrame, calls: this.calls, pendingQuanta: this.pendingQuanta, maxPendingQuanta: this.maxPendingQuanta, lastFrame: this.lastFrame, forwardGapFrames: this.forwardGapFrames, maxCycleResidual: this.maxCycleResidual, rejected: this.rejected, lastCode: this.lastCode, allowGaps: this.allowGaps };
    }
  };

  // src/modular-audio/physicalInputRouteState.js
  var PHYSICAL_ROUTE_TAG_MAX = 16777215;
  var PhysicalInputRouteState = class {
    constructor(channels, { limit = 64 } = {}) {
      if (![1, 2].includes(channels) || !Number.isInteger(limit) || limit < 1 || limit > 64) throw Error("Invalid physical route geometry");
      this.channels = channels;
      this.limit = limit;
      this.tag = 0;
      this.serial = 0;
      this.requestedOn = false;
      this.actualChannels = 0;
      this.actualPulled = false;
      this.phase = "off";
      this.mismatchQuanta = 0;
      this.hasBeenActive = false;
      this.lastActiveSerial = 0;
      this.confirmedOffSerial = 0;
      this.allowReanchor = false;
      this.frame = null;
    }
    observe(curve, channels) {
      if (!(curve instanceof Float32Array) || ![1, 128].includes(curve.length) || ![0, this.channels].includes(channels)) throw Error("Physical route shape differs");
      let previous = this.tag, maxOff = 0;
      for (const value of curve) {
        if (!Number.isInteger(value) || value < 0 || value > PHYSICAL_ROUTE_TAG_MAX || value < previous || value === 1) throw Error("Physical route tag is malformed/backward");
        const serial2 = Math.floor(value / 2);
        if (value !== previous && serial2 === Math.floor(previous / 2)) throw Error("Physical route identity changed its request");
        previous = value;
        if (value > 0 && value % 2 === 0) maxOff = Math.max(maxOff, serial2);
      }
      const tag = curve[curve.length - 1], serial = Math.floor(tag / 2), on = tag % 2 === 1;
      if (channels > 0 && (tag === 0 || !on && (!this.hasBeenActive || serial <= this.lastActiveSerial))) throw Error("Unsolicited off-route input has no realized active transition");
      const oldActive = this.lastActiveSerial;
      if (channels === 0 && this.hasBeenActive && maxOff > oldActive) this.confirmedOffSerial = Math.max(this.confirmedOffSerial, maxOff);
      this.tag = tag;
      this.serial = serial;
      this.requestedOn = on;
      this.actualChannels = channels;
      this.actualPulled = channels > 0;
      this.allowReanchor = false;
      if (channels > 0) {
        if (on) {
          this.phase = "active";
          this.allowReanchor = this.hasBeenActive && serial > oldActive && this.confirmedOffSerial > oldActive && serial > this.confirmedOffSerial;
          this.lastActiveSerial = serial;
          this.hasBeenActive = true;
          this.mismatchQuanta = 0;
        } else {
          this.phase = "drain";
          this.mismatchQuanta++;
        }
      } else if (!on) {
        this.phase = "off";
        this.mismatchQuanta = 0;
      } else {
        this.phase = this.hasBeenActive && serial === oldActive ? "withdrawal-pending" : "opening";
        this.mismatchQuanta++;
      }
      if (this.mismatchQuanta > this.limit) throw Error("Physical route request/connection mismatch bound");
      return this;
    }
    committed(frame) {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame % 128) throw Error("Physical route receipt frame differs");
      this.frame = frame;
    }
    realized() {
      return this.requestedOn === this.actualPulled && (this.requestedOn ? this.phase === "active" : this.phase === "off");
    }
    proof() {
      return { version: 1, tag: this.tag, serial: this.serial, requestedOn: this.requestedOn, actualInputChannels: this.actualChannels, actualPulled: this.actualPulled, realized: this.realized(), phase: this.phase, frame: this.frame };
    }
    snapshot() {
      return { ...this.proof(), mismatchQuanta: this.mismatchQuanta, limit: this.limit, hasBeenActive: this.hasBeenActive, lastActiveSerial: this.lastActiveSerial, confirmedOffSerial: this.confirmedOffSerial, allowReanchor: this.allowReanchor };
    }
  };

  // src/modular-audio/rackOuterRust.js
  var RACK_OUTER_PROFILE = "rack-outer-gain16-pull-authority-v1";
  var RACK_OUTER_MODES = Object.freeze({ unpulled: 0, parametersOnly: 1, audio: 2 });
  function rackOuterConfiguration(raw) {
    if (!raw || Object.keys(raw).some((k) => !["sampleRate", "stage", "channels", "processedChannels", "originFrame"].includes(k)) || !Number.isInteger(raw.sampleRate) || raw.sampleRate < 8e3 || raw.sampleRate > 192e3 || !["trim", "mix"].includes(raw.stage) || ![1, 2].includes(raw.channels) || raw.stage === "mix" && ![1, 2].includes(raw.processedChannels) || raw.stage === "trim" && raw.processedChannels !== void 0 || !Number.isSafeInteger(raw.originFrame ?? 0) || (raw.originFrame ?? 0) < 0 || (raw.originFrame ?? 0) % 128 || (raw.originFrame ?? 0) > 2 ** 40 - 128) throw Error("Invalid rack-outer stage configuration");
    const slots = raw.stage === "trim" ? [{ id: "program", channels: raw.channels }] : [{ id: "processed", channels: raw.processedChannels }, { id: "bypass", channels: raw.channels }];
    return Object.freeze({ profile: RACK_OUTER_PROFILE, sampleRate: raw.sampleRate, stage: raw.stage, channels: raw.channels, ...raw.stage === "mix" ? { processedChannels: raw.processedChannels } : {}, originFrame: raw.originFrame ?? 0, outputChannels: Math.max(...slots.map((s) => s.channels)), slots: Object.freeze(slots.map((s) => Object.freeze({ ...s, gain: 1, assignment: false }))) });
  }
  var RackOuterRust = class {
    constructor(module, raw) {
      this.spec = rackOuterConfiguration(raw);
      if (!(module instanceof WebAssembly.Module)) throw Error("Rack-outer compiled module required");
      this.e = new WebAssembly.Instance(module, {}).exports;
      this.handle = 0;
      this.failed = false;
      if (this.e.rack_outer_api() !== 1) throw Error("Rack-outer ABI differs");
      this.handle = this.e.rack_outer_new(this.spec.sampleRate, this.spec.slots.length);
      if (!this.handle) throw Error("Rack-outer allocation failed");
      try {
        this.spec.slots.forEach((s, i) => this.check(this.e.rack_outer_initial(this.handle, i, s.channels, 1)));
        this.check(this.e.rack_outer_prepare(this.handle, this.spec.originFrame));
        this.memory = this.e.memory.buffer;
        this.input = this.spec.slots.map((s, i) => Array.from({ length: s.channels }, (_, c) => new Float32Array(this.memory, this.e.rack_outer_input(this.handle, i, c), 128)));
        this.output = Array.from({ length: this.spec.outputChannels }, (_, c) => new Float32Array(this.memory, this.e.rack_outer_output(this.handle, c), 128));
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    alive() {
      if (!this.handle || this.failed) throw Error("Rack-outer stage is not live");
    }
    check(value) {
      if (value !== 1) throw Error("Rack-outer operation rejected");
    }
    sync(frame, mode) {
      this.alive();
      this.check(this.e.rack_outer_sync(this.handle, frame, mode));
    }
    command(c) {
      this.alive();
      const kinds2 = ["set", null, "target", "cancel"];
      if (!c || Object.keys(c).sort().join(",") !== "authorFrame,op,seconds,slot,tau,value" || !Number.isInteger(c.slot) || c.slot < 0 || c.slot >= this.spec.slots.length || !["set", "target", "cancel"].includes(c.op)) throw Error("Invalid rack-outer command");
      this.check(this.e.rack_outer_command(this.handle, c.slot, kinds2.indexOf(c.op), c.seconds, c.value, c.tau, c.authorFrame));
    }
    render(activity) {
      this.alive();
      if (!Number.isInteger(activity) || activity < 0 || activity >= 2 ** (2 * this.spec.slots.length)) throw Error("Invalid rack-outer activity word");
      try {
        if (this.memory !== this.e.memory.buffer) throw Error("Rack-outer memory changed");
        this.check(this.e.rack_outer_render(this.handle, activity));
      } catch (error) {
        this.failed = true;
        throw error;
      }
      return this.output;
    }
    freeSlots(frame, destination) {
      this.alive();
      if (!(destination instanceof Uint16Array) || destination.length !== this.spec.slots.length) throw Error("Rack-outer credit destination differs");
      for (let s = 0; s < destination.length; s++) {
        const value = this.e.rack_outer_free_slots(this.handle, s, frame);
        if (!Number.isInteger(value) || value < 0 || value > 256) throw Error("Invalid rack-outer credit proof");
        destination[s] = value;
      }
      return destination;
    }
    stats() {
      this.alive();
      return Object.fromEntries(["frame", "calls", "rejected", "silent", "latePublications", "mainThreadClamps", "lastAuthorFrame", "slots", "observations", "unpulled", "parametersOnly", "renderedUntil", "mode"].map((key, i) => [key, this.e.rack_outer_stat(this.handle, i)]));
    }
    dispose() {
      if (this.handle) {
        this.e.rack_outer_free(this.handle);
        this.handle = 0;
        this.input = this.output = this.memory = null;
      }
    }
  };

  // src/modular-audio/stampedWordTransport.js
  var STAMPED_WORD_PROFILE = "stamped-authored-raw-words-v1";
  var STAMPED_WORD_FRAME_MAX = 1099511627648;
  var BASE = 65536;
  var PERIOD = 256;
  var MAX = 16777215;
  function shape({ wordCount, slots = 32, prefix = "command" } = {}) {
    if (!Number.isInteger(wordCount) || wordCount < 1 || wordCount > 24 || !Number.isInteger(slots) || slots < 1 || slots > 64 || typeof prefix !== "string" || !/^[_a-zA-Z][_a-zA-Z0-9]{0,30}$/.test(prefix)) throw Error("Invalid stamped word geometry");
    return { wordCount, slots, prefix };
  }
  var names = (p, slot) => ["sequence", "frame0", "frame1", "frame2", ...Array.from({ length: p.wordCount }, (_, i) => "word" + i)].map((f) => p.prefix + slot + "_" + f);
  function stampedWordDescriptors(options) {
    const p = shape(options), out = [];
    for (let s = 0; s < p.slots; s++) for (const name of names(p, s)) out.push({ name, defaultValue: 0, minValue: 0, maxValue: MAX, automationRate: "a-rate" });
    return out;
  }
  var StampedWordReader = class {
    constructor(options) {
      Object.assign(this, shape(options));
      this.sequence = 0;
      this.count = 0;
      this.frames = new Float64Array(this.slots);
      this.words = new Uint16Array(this.slots * this.wordCount);
      this.tags = new Uint32Array(this.slots);
      this.names = Array.from({ length: this.slots }, (_, s) => names(this, s));
      this.scratch = new Uint16Array(this.wordCount + 3);
      this.lastAuthorFrame = null;
      this.lastVisibleSequence = 0;
      this.deferredQuanta = 0;
      this.deferredSequence = 0;
      this.deferredWord = null;
    }
    scalar(parameters, name) {
      const a = parameters[name];
      if (!(a instanceof Float32Array) || ![1, 128].includes(a.length)) throw Error("Stamped metadata block shape differs");
      for (let i = 0; i < a.length; i++) if (!Number.isInteger(a[i]) || a[i] < 0 || a[i] > MAX) throw Error("Invalid packed stamped word");
      return a[a.length - 1];
    }
    read(parameters) {
      this.count = 0;
      let last = this.sequence;
      for (let i = 0; i < this.slots; i++) {
        const tag = this.scalar(parameters, this.names[i][0]);
        this.tags[i] = tag;
        last = Math.max(last, tag);
      }
      this.lastVisibleSequence = last;
      if (last - this.sequence > this.slots) throw Error("Stamped words overwritten before observation");
      let count = 0, deferred = 0, word = null;
      for (let sequence = this.sequence + 1; sequence <= last; sequence++) {
        const slot = (sequence - 1) % this.slots, n = this.names[slot], stamp = sequence % PERIOD;
        if (this.tags[slot] !== sequence) {
          if (this.tags[slot] > sequence) throw Error("Stamped word slot sequence lost");
          deferred = sequence;
          break;
        }
        let complete = true;
        for (let j = 1; j < n.length; j++) {
          const packed = this.scalar(parameters, n[j]);
          if (Math.floor(packed / BASE) !== stamp) {
            complete = false;
            deferred = sequence;
            word = n[j];
            break;
          }
          this.scratch[j - 1] = packed % BASE;
        }
        if (!complete) break;
        const frame = this.scratch[0] + this.scratch[1] * BASE + this.scratch[2] * BASE * BASE;
        if (frame > STAMPED_WORD_FRAME_MAX || frame % 128 || (count ? frame < this.frames[count - 1] : this.lastAuthorFrame !== null && frame < this.lastAuthorFrame)) throw Error("Stamped authored frame/chronology differs");
        this.frames[count] = frame;
        for (let j = 0; j < this.wordCount; j++) this.words[count * this.wordCount + j] = this.scratch[j + 3];
        count++;
      }
      this.count = count;
      this.sequence += count;
      if (count) this.lastAuthorFrame = this.frames[count - 1];
      this.deferredSequence = deferred;
      this.deferredWord = word;
      if (deferred) this.deferredQuanta++;
      return count;
    }
    snapshot() {
      return { profile: STAMPED_WORD_PROFILE, sequence: this.sequence, lastVisibleSequence: this.lastVisibleSequence, lastAuthorFrame: this.lastAuthorFrame, count: this.count, deferredSequence: this.deferredSequence, deferredWord: this.deferredWord, deferredQuanta: this.deferredQuanta, slots: this.slots, wordCount: this.wordCount };
    }
  };
  var StampedFloat64Words = class {
    constructor() {
      this.buffer = new ArrayBuffer(8);
      this.view = new DataView(this.buffer);
    }
    encode(value, words, offset = 0) {
      if (typeof value !== "number" || !words || !Number.isInteger(offset) || offset < 0 || offset + 4 > words.length) throw Error("Invalid Float64 word destination");
      this.view.setFloat64(0, value, true);
      for (let i = 0; i < 4; i++) words[offset + i] = this.view.getUint16(i * 2, true);
      return words;
    }
    decode(words, offset = 0) {
      if (!words || !Number.isInteger(offset) || offset < 0 || offset + 4 > words.length) throw Error("Invalid Float64 word source");
      for (let i = 0; i < 4; i++) {
        const x = words[offset + i];
        if (!Number.isInteger(x) || x < 0 || x > 65535) throw Error("Invalid Float64 raw word");
        this.view.setUint16(i * 2, x, true);
      }
      return this.view.getFloat64(0, true);
    }
  };

  // src/modular-audio/rackOuterWords.js
  var rackOuterGeometry = () => ({ wordCount: 14, slots: 32, prefix: "rackOuterEvent" });
  var rackOuterDescriptors = () => stampedWordDescriptors(rackOuterGeometry());
  var kinds = ["set", null, "target", "cancel"];
  var keys = ["slot", "op", "seconds", "value", "tau"];
  function validateRackOuterControl(rate, count, c) {
    if (!Number.isInteger(rate) || rate < 8e3 || rate > 192e3 || !Number.isInteger(count) || count < 1 || count > 2 || !c || Object.keys(c).length !== 5 || !keys.every((k) => Object.hasOwn(c, k)) || !Number.isInteger(c.slot) || c.slot < 0 || c.slot >= count || !["set", "target", "cancel"].includes(c.op) || typeof c.seconds !== "number" || !Number.isFinite(c.seconds) || c.seconds < 0 || c.seconds > STAMPED_WORD_FRAME_MAX / rate || typeof c.value !== "number" || !Number.isFinite(c.value) || c.value < 0 || c.value > 16 || typeof c.tau !== "number" || !Number.isFinite(c.tau) || c.tau < 0 || c.tau > 3600 || c.op === "target" && (c.tau === 0 || Math.fround(c.tau) === 0) || c.op !== "target" && c.tau !== 0 || c.op === "cancel" && c.value !== 0) throw Error("Invalid rack outer raw control");
    return c;
  }
  function decodeRackOuter(rate, count, words, at, codec) {
    return validateRackOuterControl(rate, count, { slot: words[at], op: kinds[words[at + 1]], seconds: codec.decode(words, at + 2), value: codec.decode(words, at + 6), tau: codec.decode(words, at + 10) });
  }

  // src/modular-audio/rackOuterActivity.js
  var RACK_ACTIVITY_PROFILE = "owned-native-gain-activity-port-v1";
  var RACK_ACTIVITY_MAGIC = 12731277;
  var MAX_FRAME = 1099511627648;
  var MAX_PRODUCER = 16777215;
  function writeRackActivity(destination, producer, frame, channels, activity) {
    if (!(destination instanceof Float32Array) || destination.length !== 128 || !Number.isInteger(producer) || producer < 1 || producer > MAX_PRODUCER || !Number.isSafeInteger(frame) || frame < 0 || frame > MAX_FRAME || frame % 128 || channels !== 1 && channels !== 2 || !Number.isInteger(activity) || activity < 0 || activity > 2) throw Error("Invalid owned logical activity header");
    const low = frame % 65536, mid = Math.floor(frame / 65536) % 65536, high = Math.floor(frame / 4294967296);
    for (let at = 0; at < 128; at += 8) {
      destination[at] = RACK_ACTIVITY_MAGIC;
      destination[at + 1] = 1;
      destination[at + 2] = producer;
      destination[at + 3] = low;
      destination[at + 4] = mid;
      destination[at + 5] = high;
      destination[at + 6] = channels;
      destination[at + 7] = activity;
    }
    return destination;
  }
  var RackActivityReader = class {
    constructor(producer, channels) {
      if (!Number.isInteger(producer) || producer < 1 || producer > MAX_PRODUCER || channels !== 1 && channels !== 2) throw Error("Explicit private producer/channel activity geometry required");
      this.producer = producer;
      this.channels = channels;
      this.frame = null;
      this.activity = 0;
      this.calls = 0;
    }
    read(source, nativeFrame) {
      if (!(source instanceof Float32Array) || source.length !== 128 || !Number.isSafeInteger(nativeFrame) || nativeFrame < 0 || nativeFrame > MAX_FRAME || nativeFrame % 128) throw Error("Missing actual same-quantum logical activity header");
      for (let i = 0; i < 128; i++) if (!Number.isInteger(source[i]) || source[i] < 0 || source[i] > MAX_PRODUCER) throw Error("Noninteger logical activity word");
      if (source[0] !== RACK_ACTIVITY_MAGIC || source[1] !== 1 || source[2] !== this.producer || source[3] >= 65536 || source[4] >= 65536 || source[5] > 255 || source[6] !== this.channels || source[7] > 2) throw Error("Logical activity producer/layout differs");
      for (let at = 8; at < 128; at += 8) for (let word = 0; word < 8; word++) if (source[at + word] !== source[word]) throw Error("Torn logical activity quantum");
      const frame = source[3] + source[4] * 65536 + source[5] * 4294967296;
      if (frame !== nativeFrame) throw Error("Logical activity is not the actual Source7a quantum");
      if (this.frame !== null && frame <= this.frame) throw Error("Logical activity quantum replay/backwards");
      this.frame = frame;
      this.activity = source[7];
      this.calls++;
      return this.activity;
    }
    snapshot() {
      return { profile: RACK_ACTIVITY_PROFILE, producer: this.producer, channels: this.channels, frame: this.frame, activity: this.activity, calls: this.calls };
    }
  };

  // src/modular-audio/rackOuterCore.js
  var RackOuterCore = class {
    constructor(module, raw, { producer, processedProducer, emit = () => {
    } } = {}) {
      const spec = rackOuterConfiguration(raw);
      if (!Number.isInteger(producer) || producer < 1 || producer > 16777215 || typeof emit !== "function") throw Error("Rack-outer actual producer identity required");
      const headerReader = spec.stage === "mix" ? new RackActivityReader(processedProducer, spec.processedChannels) : null;
      this.spec = spec;
      this.producer = producer;
      this.headerReader = headerReader;
      this.header = new Float32Array(128);
      this.reader = new StampedWordReader(rackOuterGeometry());
      this.codec = new StampedFloat64Words();
      this.frames = new Float64Array(32);
      this.sequences = new Uint32Array(32);
      this.words = new Uint16Array(448);
      this.free = new Uint16Array(this.spec.slots.length);
      this.lastFree = new Uint16Array(this.free.length);
      this.report = { kind: "observed", sequence: 0, frame: 0, freeSlots: Array(this.spec.slots.length).fill(0) };
      this.emit = emit;
      this.lastReported = -1;
      this.frame = null;
      this.appliedSequence = 0;
      this.head = 0;
      this.queued = 0;
      this.deferredStreak = 0;
      this.error = null;
      this.activity = 0;
      this.outputActivity = 0;
      this.mode = 0;
      this.actualHeaderChannels = null;
      this.headerFailureShape = null;
      this.unit = new RackOuterRust(module, raw);
    }
    receive(parameters) {
      const count = this.reader.read(parameters), first = this.reader.sequence - count + 1;
      if (this.queued + count > 32) throw Error("Rack-outer command queue bound");
      this.deferredStreak = this.reader.deferredSequence ? this.deferredStreak + 1 : 0;
      if (this.deferredStreak > 64) throw Error("Rack-outer torn metadata bound");
      for (let i = 0; i < count; i++) {
        const at = (this.head + this.queued) % 32;
        this.frames[at] = this.reader.frames[i];
        this.sequences[at] = first + i;
        for (let word = 0; word < 14; word++) this.words[at * 14 + word] = this.reader.words[i * 14 + word];
        this.queued++;
      }
      while (this.queued && this.frames[this.head] <= this.frame) {
        const at = this.head, command = decodeRackOuter(this.spec.sampleRate, this.spec.slots.length, this.words, at * 14, this.codec);
        this.unit.command({ ...command, authorFrame: this.frames[at] });
        this.appliedSequence = this.sequences[at];
        this.head = (this.head + 1) % 32;
        this.queued--;
      }
      if (this.queued && this.frames[this.head] > this.frame + 8192) throw Error("Rack-outer future author bound");
    }
    render(frame, mode, inputs, parameters) {
      if (this.error || !this.unit) throw Error(this.error ?? "Disposed rack-outer stage");
      try {
        if (!Number.isSafeInteger(frame) || frame < 0 || frame % 128 || !Number.isInteger(mode) || mode < 0 || mode > 2 || !Array.isArray(inputs) || inputs.length !== (this.spec.stage === "trim" ? 1 : 3)) throw Error("Rack-outer physical stage inventory differs");
        const rawIndex = this.spec.stage === "trim" ? 0 : 2;
        let activity = 0;
        const raw = inputs[rawIndex];
        this.validateAudio(raw, this.spec.channels);
        if (raw.length) activity |= 1 << (this.spec.stage === "trim" ? 0 : 2);
        if (this.spec.stage === "mix") {
          const processed = inputs[0], header = inputs[1];
          this.validateAudio(processed, this.spec.processedChannels);
          this.actualHeaderChannels = Array.isArray(header) ? header.length : -1;
          if (!Array.isArray(header) || header.length !== 0 && header.length !== 1 || processed.length && !header.length) {
            this.headerFailureShape = { channels: this.actualHeaderChannels, firstChannels: Array.isArray(header) ? header.slice(0, 2).map((channel) => ({ length: channel?.length ?? null, words: channel instanceof Float32Array ? Array.from(channel.subarray(0, 8)) : null })) : [] };
            throw Error("Missing physical logical-activity port");
          }
          let flag = 0;
          if (header.length) flag = this.headerReader.read(header[0], frame);
          if (processed.length) activity |= flag;
        }
        if (mode === 0 && (raw.length || this.spec.stage === "mix" && inputs[0].length) || mode === 1 && (activity & 1 || activity >> 2 & 1)) throw Error("Pull mode contradicts actual privately declared source activity");
        this.unit.sync(frame, mode);
        this.frame = frame;
        this.mode = mode;
        this.activity = mode < 2 ? 0 : activity;
        this.receive(parameters);
        if (mode === 2) {
          for (let s = 0; s < this.spec.slots.length; s++) {
            const source = inputs[this.spec.stage === "trim" ? 0 : s === 0 ? 0 : 2];
            for (let channel = 0; channel < source.length; channel++) this.unit.input[s][channel].set(source[channel]);
          }
        }
        this.unit.render(this.activity);
        this.outputActivity = mode === 0 ? 0 : this.unit.e.rack_outer_stat(this.unit.handle, 3) === 1 ? 2 : 1;
        writeRackActivity(this.header, this.producer, frame, this.spec.outputChannels, this.outputActivity);
        this.unit.freeSlots(frame, this.free);
        let changed = this.lastReported !== this.appliedSequence;
        for (let s = 0; s < this.free.length; s++) if (this.lastFree[s] !== this.free[s]) changed = true;
        if (changed) {
          this.report.frame = frame;
          this.report.sequence = this.appliedSequence;
          for (let s = 0; s < this.free.length; s++) this.report.freeSlots[s] = this.free[s];
          this.emit(this.report);
          this.lastReported = this.appliedSequence;
          this.lastFree.set(this.free);
        }
        return this.unit.output;
      } catch (error) {
        this.error = String(error);
        throw error;
      }
    }
    validateAudio(source, channels) {
      if (!Array.isArray(source) || source.length !== 0 && source.length !== channels) throw Error("Rack-outer audio channel layout differs");
      for (let c = 0; c < source.length; c++) if (!(source[c] instanceof Float32Array) || source[c].length !== 128) throw Error("Rack-outer audio quantum differs");
    }
    stats() {
      return { frame: this.frame, mode: this.mode, activity: this.activity, outputActivity: this.outputActivity, unit: this.unit?.stats() ?? null, appliedSequence: this.appliedSequence, queued: this.queued, reader: this.reader.snapshot(), header: this.headerReader?.snapshot() ?? null, headerInputShape: { channels: this.actualHeaderChannels, failure: this.headerFailureShape }, memoryBytes: this.unit?.e.memory.buffer.byteLength ?? null, error: this.error };
    }
    dispose() {
      this.unit?.dispose();
      this.unit = null;
    }
  };

  // src/modular-audio/rackOuterProcessor.js
  var rackOuterHostDescriptors = () => [{ name: "terminalRequested", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, { name: "pullMode", defaultValue: 0, minValue: 0, maxValue: 2, automationRate: "a-rate" }, ...["route0", "route1"].map((name) => ({ name, defaultValue: 0, minValue: 0, maxValue: PHYSICAL_ROUTE_TAG_MAX, automationRate: "a-rate" })), ...nativeContextClockDescriptors(), ...rackOuterDescriptors()];
  var identity = (a, b) => a && typeof a === "object" && !Array.isArray(a) && Object.keys(a).length === 5 && ["hostVersion", "kernelVersion", "clockVersion", "generation", "producer"].every((key) => Object.hasOwn(a, key) && a[key] === b?.[key]);
  var scalar = (parameters, name, max) => {
    const values = parameters[name];
    if (!(values instanceof Float32Array) || values.length !== 1 && values.length !== 128) throw Error("Rack-outer scalar control shape differs");
    const first = values[0];
    for (let i = 0; i < values.length; i++) if (!Number.isInteger(values[i]) || values[i] < 0 || values[i] > max || values[i] !== first) throw Error("Rack-outer scalar control must be a uniform literal");
    return first;
  };
  var RackOuterProcessor = class {
    constructor(p, port, rate) {
      this.port = port;
      this.identity = p.identity;
      this.core = null;
      this.codec = null;
      this.pending = [];
      this.error = null;
      this.released = false;
      this.disposed = false;
      this.releaseErrors = [];
      this.terminalSeen = false;
      this.terminalCallbacks = 0;
      this.isolatedTerminalCallbacks = 0;
      this.terminalInputMask = 0;
      this.pendingClock = 0;
      this.firstFrame = null;
      this.mode = null;
      this.requestedMode = 0;
      this.inputMask = 0;
      this.lastRaw = null;
      port.onmessage = ({ data }) => this.message(data);
      try {
        if (!identity(p.identity, p.identity) || p.identity.hostVersion !== "db0f9d7d684a3580" || p.identity.kernelVersion !== "da3f650bcbbc1394" || p.identity.clockVersion !== "7a0838a735108706" || !Number.isInteger(p.identity.generation) || p.identity.generation < 1 || p.identity.generation > 4294967295 || !Number.isInteger(p.identity.producer) || p.identity.producer < 1 || p.identity.producer > 16777215 || p.configuration?.sampleRate !== rate) throw Error("Rack-outer immutable identity differs");
        const clock = validateNativeContextClockSpec(p.clockSpec);
        if (clock.rate !== rate) throw Error("Rack-outer Native clock rate differs");
        this.codec = new NativeContextClockCodec(clock, { allowGaps: false });
        this.core = new RackOuterCore(p.module, p.configuration, { producer: p.identity.producer, processedProducer: p.processedProducer, emit: (data) => this.emit(data) });
        this.routes = this.core.spec.slots.map((slot) => new PhysicalInputRouteState(slot.channels));
        this.emit({ kind: "ready" });
      } catch (error) {
        this.fail(error);
      }
    }
    emit(data) {
      this.port.postMessage({ ...data, identity: this.identity });
    }
    snapshot() {
      return { firstFrame: this.firstFrame, requestedMode: this.requestedMode, mode: this.mode, inputMask: this.inputMask, core: this.core?.stats() ?? null, clock: this.codec?.snapshot() ?? null, routes: this.routes?.map((route) => route.snapshot()) ?? [], pendingClock: this.pendingClock, terminalSeen: this.terminalSeen, terminalCallbacks: this.terminalCallbacks, isolatedTerminalCallbacks: this.isolatedTerminalCallbacks, terminalInputMask: this.terminalInputMask, error: this.error, released: this.released, disposed: this.disposed, releaseErrors: this.releaseErrors.slice() };
    }
    release() {
      if (this.released) return;
      try {
        this.core?.dispose();
      } catch (error) {
        this.releaseErrors.push(String(error));
      }
      this.core = null;
      this.released = true;
      for (const pending of this.pending) this.emit({ kind: "rejected", request: pending.request, error: "Rack-outer processor retired" });
      this.pending.length = 0;
    }
    fail(error) {
      if (this.error) return;
      this.error = String(error);
      let diagnostics;
      try {
        diagnostics = this.snapshot();
      } catch {
      }
      this.release();
      this.emit({ kind: "error", error: this.error, diagnostics });
    }
    message(data) {
      if (data?.kind === "native-clock-spec") {
        try {
          const spec = validateNativeContextClockSpec(data.spec);
          if (!this.codec || JSON.stringify(spec) !== JSON.stringify(this.codec.spec)) throw Error("Rack-outer clock binding changed");
          this.emit({ kind: "clock-bound", spec });
        } catch (error) {
          this.fail(error);
        }
        return;
      }
      if (data?.kind === "native-clock-failed") {
        this.fail(Error("Rack-outer Native clock retired: " + data.error));
        return;
      }
      try {
        if (!data || !identity(data.identity, this.identity)) throw Error("Exact rack-outer actor identity required");
        const fields = { dispose: ["kind", "identity"], stats: ["kind", "identity", "request"], flush: ["kind", "identity", "request", "sequence"], fence: ["kind", "identity", "request", "sequence", "mode", "routes", "header"] }[data.kind];
        if (!fields || Object.keys(data).length !== fields.length || fields.some((key) => !Object.hasOwn(data, key))) throw Error("Exact rack-outer control fields required");
        if (data.kind === "dispose") {
          const terminalObserved = { seen: this.terminalSeen, callbacks: this.terminalCallbacks, isolatedCallbacks: this.isolatedTerminalCallbacks, inputMask: this.terminalInputMask, frame: this.core?.frame ?? null, rust: this.core?.unit.stats() ?? null };
          this.disposed = true;
          this.release();
          this.emit({ type: "disposed", version: 1, released: true, clean: this.releaseErrors.length === 0, error: this.releaseErrors.join("; ") || null, terminalObserved });
          return;
        }
        if (this.error || this.disposed || !Number.isInteger(data.request) || data.request < 1 || data.request > 4294967295 || this.pending.length >= 16) throw Error("Invalid rack-outer request");
        if (data.kind === "stats") {
          this.emit({ kind: "stats", request: data.request, stats: this.snapshot() });
          return;
        }
        if (!Number.isInteger(data.sequence) || data.sequence < 0 || data.sequence > 16777215) throw Error("Invalid rack-outer sequence fence");
        if (data.kind === "fence" && (!Number.isInteger(data.mode) || data.mode < 0 || data.mode > 2 || !Array.isArray(data.routes) || data.routes.length !== this.routes.length || typeof data.header !== "boolean" || data.header && this.core.spec.stage !== "mix" || data.routes.some((tag) => !Number.isInteger(tag) || tag < 0 || tag > PHYSICAL_ROUTE_TAG_MAX || tag === 1))) throw Error("Invalid rack-outer route fence");
        this.pending.push({ ...data });
        this.finish();
      } catch (error) {
        this.emit({ kind: "rejected", request: data?.request, error: String(error) });
      }
    }
    finish() {
      if (this.firstFrame === null || this.error || !this.core) return;
      for (let i = 0; i < this.pending.length; ) {
        const pending = this.pending[i];
        let matches = pending.sequence <= this.core.appliedSequence;
        if (matches && pending.kind === "fence") {
          matches = this.requestedMode === pending.mode && (!pending.header || this.core.headerReader?.frame === this.core.frame);
          for (let s = 0; s < this.routes.length; s++) matches && (matches = this.routes[s].tag === pending.routes[s] && this.routes[s].realized());
        }
        if (matches) {
          this.emit({ kind: "stats", request: pending.request, stats: this.snapshot() });
          this.pending.splice(i, 1);
        } else i++;
      }
    }
    recordTerminalInputs(inputs) {
      let mask = 0;
      const count = this.core?.spec.stage === "trim" ? 1 : 3;
      for (let i = 0; i < count; i++) if (inputs?.[i]?.length) mask |= 1 << i;
      this.terminalInputMask = mask;
      this.isolatedTerminalCallbacks = mask === 0 ? this.isolatedTerminalCallbacks + 1 : 0;
    }
    process(inputs, outputs, parameters, rawFrame) {
      for (const output of outputs) for (const channel of output) channel.fill(0);
      if (this.error || this.disposed) return false;
      try {
        if (this.terminalSeen) {
          this.terminalCallbacks++;
          this.recordTerminalInputs(inputs);
          return true;
        }
        const terminal = parameters.terminalRequested;
        if (!(terminal instanceof Float32Array) || terminal.length !== 1 && terminal.length !== 128) throw Error("Rack-outer terminal shape differs");
        let requested = false;
        for (let i = 0; i < terminal.length; i++) {
          if (terminal[i] !== 0 && terminal[i] !== 1) throw Error("Rack-outer terminal control must be literal Boolean");
          requested || (requested = terminal[i] === 1);
        }
        if (requested) {
          this.terminalSeen = true;
          this.terminalCallbacks++;
          this.recordTerminalInputs(inputs);
          return true;
        }
        const spec = this.core.spec;
        if (outputs.length !== 3 || outputs[2].length !== 1 || outputs[2][0].length !== 128 || outputs[0].length !== spec.outputChannels || outputs[1].length !== 1 || outputs[1][0].length !== 128 || inputs.length !== (spec.stage === "trim" ? 1 : 3)) throw Error("Rack-outer physical output/port inventory differs");
        for (const channel of outputs[0]) if (channel.length !== 128) throw Error("Rack-outer render quantum differs");
        this.requestedMode = scalar(parameters, "pullMode", 2);
        this.inputMask = 0;
        for (let s = 0; s < this.routes.length; s++) {
          const source = inputs[spec.stage === "trim" ? 0 : s === 0 ? 0 : 2];
          if (!Array.isArray(source)) throw Error("Rack-outer input inventory differs");
          this.routes[s].observe(parameters["route" + s], source.length);
          if (source.length) this.inputMask |= 1 << s;
        }
        const frame = this.codec.next(parameters, { allowPending: this.inputMask === 0 && this.requestedMode === 0 });
        if (frame === null) {
          if (++this.pendingClock > 64) throw Error("Rack-outer pending clock bound");
          return true;
        }
        this.lastRaw = rawFrame;
        this.firstFrame ?? (this.firstFrame = frame);
        this.mode = this.inputMask ? 2 : this.requestedMode === 0 ? 0 : 1;
        const pcm = this.core.render(frame, this.mode, inputs, parameters);
        for (let c = 0; c < outputs[0].length; c++) outputs[0][c].set(pcm[c]);
        outputs[1][0].set(this.core.header);
        for (const route of this.routes) route.committed(frame);
        this.finish();
        return true;
      } catch (error) {
        for (const output of outputs) for (const channel of output) channel.fill(0);
        this.fail(error);
        return false;
      }
    }
  };

  // src/modular-audio/rackOuterReviewProducerProcessor.js
  var rackOuterReviewDescriptors = () => [{ name: "terminalRequested", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, { name: "route0", defaultValue: 0, minValue: 0, maxValue: PHYSICAL_ROUTE_TAG_MAX, automationRate: "a-rate" }, ...nativeContextClockDescriptors()];
  var same = (a, b) => a && Object.keys(a).length === 5 && Object.keys(b).every((k) => a[k] === b[k]);
  var RackOuterReviewProducerProcessor = class {
    constructor(p, port, rate) {
      this.port = port;
      this.identity = p.identity;
      this.error = null;
      this.disposed = false;
      this.terminal = false;
      this.terminalCallbacks = 0;
      this.calls = 0;
      this.firstFrame = null;
      this.lastFrame = null;
      this.headerFrame = null;
      this.actualAudioChannels = null;
      this.actualHeaderChannels = null;
      this.headerFailureShape = null;
      this.pending = [];
      this.header = new Float32Array(128);
      port.onmessage = ({ data }) => this.message(data);
      try {
        if (!same(p.identity, p.identity) || p.identity.hostVersion !== "db0f9d7d684a3580" || p.identity.kernelVersion !== "da3f650bcbbc1394" || p.identity.clockVersion !== "7a0838a735108706" || !Number.isInteger(p.identity.generation) || p.identity.generation < 1 || !Number.isInteger(p.identity.producer) || p.identity.producer < 1 || p.identity.producer > 16777215 || !["program", "external", "nativeExternal"].includes(p.kind) || ![1, 2].includes(p.channels) || ![1, 2].includes(p.inputChannels) || p.kind === "program" && p.inputChannels !== p.channels) throw Error("Actual review producer configuration differs");
        this.kind = p.kind;
        this.channels = p.channels;
        this.inputChannels = p.inputChannels;
        this.route = new PhysicalInputRouteState(p.inputChannels);
        this.codec = new NativeContextClockCodec(validateNativeContextClockSpec(p.clockSpec), { allowGaps: false });
        if (this.codec.spec.rate !== rate) throw Error("Review producer Native clock rate differs");
        this.reader = p.kind === "external" ? new RackActivityReader(p.inputProducer, p.inputChannels) : null;
        this.emit({ kind: "ready" });
      } catch (error) {
        this.fail(error);
      }
    }
    emit(data) {
      this.port.postMessage({ ...data, identity: this.identity });
    }
    snapshot() {
      return { kind: this.kind, channels: this.channels, inputChannels: this.inputChannels, calls: this.calls, firstFrame: this.firstFrame, lastFrame: this.lastFrame, headerFrame: this.headerFrame, inputShape: { audioChannels: this.actualAudioChannels, headerChannels: this.actualHeaderChannels, failure: this.headerFailureShape }, route: this.route?.snapshot(), clock: this.codec?.snapshot(), terminal: this.terminal, terminalCallbacks: this.terminalCallbacks, error: this.error, disposed: this.disposed };
    }
    fail(error) {
      if (this.error) return;
      this.error = String(error);
      this.emit({ kind: "error", error: this.error, diagnostics: this.snapshot() });
    }
    message(data) {
      if (data?.kind === "native-clock-spec") {
        try {
          if (JSON.stringify(validateNativeContextClockSpec(data.spec)) !== JSON.stringify(this.codec.spec)) throw Error("Review producer clock binding differs");
          this.emit({ kind: "clock-bound", spec: this.codec.spec });
        } catch (error) {
          this.fail(error);
        }
        return;
      }
      if (data?.kind === "native-clock-failed") {
        this.fail(Error(data.error));
        return;
      }
      try {
        if (!same(data?.identity, this.identity)) throw Error("Exact review producer identity required");
        const fields = { dispose: ["kind", "identity"], stats: ["kind", "identity", "request"], fence: ["kind", "identity", "request", "route", "header"] }[data.kind];
        if (!fields || Object.keys(data).length !== fields.length || fields.some((k) => !Object.hasOwn(data, k))) throw Error("Exact review producer message fields required");
        if (data.kind === "dispose") {
          this.disposed = true;
          this.emit({ type: "disposed", version: 1, released: true, clean: true, terminalObserved: { seen: this.terminal, callbacks: this.terminalCallbacks, frame: this.lastFrame } });
          return;
        }
        if (this.error || this.disposed || !Number.isInteger(data.request) || data.request < 1 || this.pending.length >= 16) throw Error("Review producer request refused");
        if (data.kind === "stats") {
          this.emit({ kind: "stats", request: data.request, stats: this.snapshot() });
          return;
        }
        if (typeof data.header !== "boolean" || data.header && this.kind !== "external" || !Number.isInteger(data.route) || data.route < 0 || data.route > PHYSICAL_ROUTE_TAG_MAX || data.route === 1) throw Error("Review route request differs");
        this.pending.push(data);
        this.finish();
      } catch (error) {
        this.emit({ kind: "rejected", request: data?.request, error: String(error) });
      }
    }
    finish() {
      if (this.firstFrame === null) return;
      for (let i = 0; i < this.pending.length; ) {
        const p = this.pending[i];
        if (this.route.tag === p.route && this.route.realized() && (!p.header || this.headerFrame === this.lastFrame)) {
          this.emit({ kind: "stats", request: p.request, stats: this.snapshot() });
          this.pending.splice(i, 1);
        } else i++;
      }
    }
    process(inputs, outputs, parameters) {
      for (const output of outputs) for (const c of output) c.fill(0);
      if (this.error || this.disposed) return false;
      try {
        if (this.terminal) {
          this.terminalCallbacks++;
          return true;
        }
        const terminal = parameters.terminalRequested;
        if (!(terminal instanceof Float32Array) || ![1, 128].includes(terminal.length)) throw Error("Review terminal shape differs");
        let stop = false;
        for (const v of terminal) {
          if (v !== 0 && v !== 1) throw Error("Review terminal literal Boolean required");
          stop || (stop = v === 1);
        }
        if (stop) {
          this.terminal = true;
          this.terminalCallbacks++;
          return true;
        }
        if (inputs.length !== (this.kind === "external" ? 2 : 1) || outputs.length !== (this.kind === "external" ? 3 : 2) || outputs[outputs.length - 1].length !== 1 || outputs[outputs.length - 1][0].length !== 128 || outputs[0].length !== this.channels) throw Error("Review producer port inventory differs");
        const input = inputs[0];
        this.actualAudioChannels = input?.length ?? -1;
        this.route.observe(parameters.route0, input.length);
        for (const c of input) if (!(c instanceof Float32Array) || c.length !== 128) throw Error("Review input quantum differs");
        for (const c of outputs[0]) if (c.length !== 128) throw Error("Review output quantum differs");
        const frame = this.codec.next(parameters, { allowPending: input.length === 0 });
        if (frame === null) return true;
        let flag = 1;
        if (this.kind === "external") {
          const header = inputs[1];
          this.actualHeaderChannels = Array.isArray(header) ? header.length : -1;
          if (!Array.isArray(header) || header.length !== 0 && header.length !== 1 || input.length && !header.length) {
            this.headerFailureShape = { channels: this.actualHeaderChannels, firstChannels: Array.isArray(header) ? header.slice(0, 2).map((channel) => ({ length: channel?.length ?? null, words: channel instanceof Float32Array ? Array.from(channel.subarray(0, 8)) : null })) : [] };
            throw Error("Owned nonlinear stage requires actual trim activity port");
          }
          if (header.length) {
            flag = this.reader.read(header[0], frame);
            this.headerFrame = frame;
          }
          if (input.length && flag === 0) throw Error("Unpulled trim cannot feed a connected nonlinear program port");
          if (outputs[1].length !== 1 || outputs[1][0].length !== 128) throw Error("Review activity output differs");
          writeRackActivity(this.header, this.identity.producer, frame, this.channels, 1);
          outputs[1][0].set(this.header);
        }
        for (let c = 0; c < this.channels; c++) {
          const source = input[Math.min(c, this.inputChannels - 1)], output = outputs[0][c];
          for (let i = 0; i < 128; i++) {
            const x = source && flag !== 2 ? source[i] : 0;
            if (!Number.isFinite(x)) throw Error("Review input must be finite");
            output[i] = this.kind === "program" ? x : Math.fround(x - Math.fround(0.25 * Math.fround(x * Math.fround(x * x))));
          }
        }
        this.firstFrame ?? (this.firstFrame = frame);
        this.lastFrame = frame;
        this.calls++;
        this.route.committed(frame);
        this.finish();
        return true;
      } catch (error) {
        for (const output of outputs) for (const c of output) c.fill(0);
        this.fail(error);
        return false;
      }
    }
  };

  // rack-outer-entry.js
  var Stage = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return rackOuterHostDescriptors();
    }
    constructor({ processorOptions: p }) {
      super();
      this.unit = new RackOuterProcessor(p, this.port, sampleRate);
    }
    process(a, b, c) {
      return this.unit.process(a, b, c, currentFrame);
    }
  };
  var Review = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return rackOuterReviewDescriptors();
    }
    constructor({ processorOptions: p }) {
      super();
      this.unit = new RackOuterReviewProducerProcessor(p, this.port, sampleRate);
    }
    process(a, b, c) {
      return this.unit.process(a, b, c);
    }
  };
  registerProcessor("rack-outer-stage-db0f9d7d684a3580", Stage);
  registerProcessor("rack-outer-review-db0f9d7d684a3580", Review);
})();
