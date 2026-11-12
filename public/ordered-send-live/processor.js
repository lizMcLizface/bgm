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

  // src/modular-audio/orderedSendWords.js
  var orderedSendGeometry = () => ({ wordCount: 14, slots: 32, prefix: "sendEvent" });
  var orderedSendDescriptors = () => stampedWordDescriptors(orderedSendGeometry());
  var kinds = ["set", null, "target", "cancel"];
  var keys = ["slot", "op", "seconds", "value", "tau"];
  function validateOrderedSendControl(rate, count, c) {
    if (!Number.isInteger(rate) || rate < 8e3 || rate > 192e3 || !Number.isInteger(count) || count < 1 || count > 8 || !c || Object.keys(c).length !== 5 || !keys.every((k) => Object.hasOwn(c, k)) || !Number.isInteger(c.slot) || c.slot < 0 || c.slot >= count || !["set", "target", "cancel"].includes(c.op) || typeof c.seconds !== "number" || !Number.isFinite(c.seconds) || c.seconds < 0 || c.seconds > STAMPED_WORD_FRAME_MAX / rate || typeof c.value !== "number" || !Number.isFinite(c.value) || c.value < 0 || c.value > 4 || typeof c.tau !== "number" || !Number.isFinite(c.tau) || c.tau < 0 || c.tau > 3600 || c.op === "target" && (c.tau === 0 || Math.fround(c.tau) === 0) || c.op !== "target" && c.tau !== 0 || c.op === "cancel" && c.value !== 0) throw Error("Invalid ordered send raw control");
    return c;
  }
  function decodeOrderedSend(rate, count, words, at, codec) {
    return validateOrderedSendControl(rate, count, { slot: words[at], op: kinds[words[at + 1]], seconds: codec.decode(words, at + 2), value: codec.decode(words, at + 6), tau: codec.decode(words, at + 10) });
  }

  // src/modular-audio/orderedSendRust.js
  function orderedSendConfiguration(raw) {
    if (!raw || Object.keys(raw).some((k) => !["sampleRate", "slots", "originFrame"].includes(k)) || !Number.isInteger(raw.sampleRate) || raw.sampleRate < 8e3 || raw.sampleRate > 192e3 || !Array.isArray(raw.slots) || raw.slots.length < 1 || raw.slots.length > 8 || !Number.isSafeInteger(raw.originFrame ?? 0) || (raw.originFrame ?? 0) < 0 || (raw.originFrame ?? 0) % 128 || (raw.originFrame ?? 0) > 2 ** 40 - 128) throw Error("Invalid ordered send configuration");
    const names2 = /* @__PURE__ */ new Set();
    const slots = raw.slots.map((s) => {
      if (!s || Object.keys(s).length !== 4 || !["id", "channels", "gain", "assignment"].every((k) => Object.hasOwn(s, k)) || typeof s.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(s.id) || names2.has(s.id) || ![1, 2].includes(s.channels) || typeof s.gain !== "number" || !Number.isFinite(s.gain) || s.gain < 0 || s.gain > 4 || typeof s.assignment !== "boolean") throw Error("Invalid immutable ordered send slot");
      names2.add(s.id);
      return Object.freeze({ ...s });
    });
    return Object.freeze({ sampleRate: raw.sampleRate, slots: Object.freeze(slots), originFrame: raw.originFrame ?? 0 });
  }
  var ops = ["set", null, "target", "cancel"];
  var OrderedSendRust = class {
    constructor(module, raw) {
      this.spec = orderedSendConfiguration(raw);
      if (!(module instanceof WebAssembly.Module)) throw Error("Ordered send compiled module required");
      this.e = new WebAssembly.Instance(module, {}).exports;
      this.handle = 0;
      this.failed = false;
      if (this.e.ordered_send_api() !== 1) throw Error("Ordered send ABI differs");
      this.handle = this.e.ordered_send_new(this.spec.sampleRate, this.spec.slots.length);
      if (!this.handle) throw Error("Ordered send allocation failed");
      try {
        this.spec.slots.forEach((s, i) => this.check(this.e.ordered_send_initial(this.handle, i, s.channels, s.gain)));
        this.check(this.e.ordered_send_prepare(this.handle, this.spec.originFrame));
        this.spec.slots.forEach((s, slot) => {
          if (s.assignment) this.command({ slot, op: "set", seconds: this.spec.originFrame / this.spec.sampleRate, value: s.gain, tau: 0, authorFrame: this.spec.originFrame });
        });
        this.memory = this.e.memory.buffer;
        this.input = this.spec.slots.map((s, i) => Array.from({ length: s.channels }, (_, c) => new Float32Array(this.memory, this.e.ordered_send_input(this.handle, i, c), 128)));
        this.output = Array.from({ length: 2 }, (_, c) => new Float32Array(this.memory, this.e.ordered_send_output(this.handle, c), 128));
      } catch (e) {
        this.dispose();
        throw e;
      }
    }
    alive() {
      if (!this.handle || this.failed) throw Error("Ordered send is not live");
    }
    check(v) {
      if (v !== 1) throw Error("Ordered send operation rejected");
    }
    firstFrame(frame) {
      this.alive();
      this.check(this.e.ordered_send_first_frame(this.handle, frame));
    }
    command(c) {
      this.alive();
      if (!c || Object.keys(c).length !== 6 || !["slot", "op", "seconds", "value", "tau", "authorFrame"].every((k) => Object.hasOwn(c, k)) || !Number.isInteger(c.slot) || c.slot < 0 || c.slot >= this.spec.slots.length || !ops.includes(c.op) || c.op === null) throw Error("Invalid ordered send command");
      this.check(this.e.ordered_send_command(this.handle, c.slot, ops.indexOf(c.op), c.seconds, c.value, c.tau, c.authorFrame));
    }
    render(activity) {
      this.alive();
      if (!Number.isInteger(activity) || activity < 0 || activity >= 2 ** (this.spec.slots.length * 2)) throw Error("Invalid ordered send activity word");
      try {
        if (this.memory !== this.e.memory.buffer) throw Error("Ordered send memory changed");
        this.check(this.e.ordered_send_render(this.handle, activity));
      } catch (e) {
        this.failed = true;
        throw e;
      }
      return this.output;
    }
    freeSlots(frame, destination) {
      this.alive();
      if (!(destination instanceof Uint16Array) || destination.length !== this.spec.slots.length) throw Error("Ordered send credit destination differs");
      for (let s = 0; s < destination.length; s++) {
        const n = this.e.ordered_send_free_slots(this.handle, s, frame);
        if (!Number.isInteger(n) || n < 0 || n > 256) throw Error("Invalid ordered send credit proof");
        destination[s] = n;
      }
      return destination;
    }
    stats() {
      this.alive();
      return Object.fromEntries(["frame", "calls", "rejected", "silent", "latePublications", "mainThreadClamps", "lastAuthorFrame", "slots"].map((k, i) => [k, this.e.ordered_send_stat(this.handle, i)]));
    }
    dispose() {
      if (this.handle) {
        this.e.ordered_send_free(this.handle);
        this.handle = 0;
        this.memory = this.input = this.output = null;
      }
    }
  };

  // src/modular-audio/orderedSendCore.js
  var OrderedSendCore = class {
    constructor(module, configuration, { emit = () => {
    } } = {}) {
      this.unit = new OrderedSendRust(module, configuration);
      this.spec = this.unit.spec;
      this.emit = emit;
      this.reader = new StampedWordReader(orderedSendGeometry());
      this.codec = new StampedFloat64Words();
      this.frames = new Float64Array(32);
      this.sequences = new Uint32Array(32);
      this.words = new Uint16Array(448);
      this.head = 0;
      this.queued = 0;
      this.frame = null;
      this.appliedSequence = 0;
      this.free = new Uint16Array(this.spec.slots.length);
      this.lastReported = -1;
      this.lastFree = new Uint16Array(this.free.length);
      this.deferredStreak = 0;
      this.error = null;
      this.seenInputMask = 0;
      this.attachmentQuanta = 0;
      this.attached = false;
    }
    sync(frame) {
      if (this.error || !this.unit) throw Error(this.error ?? "Disposed ordered send");
      if (!Number.isSafeInteger(frame) || frame < 0 || frame % 128) throw Error("Ordered send Native frame differs");
      if (this.frame === null) this.unit.firstFrame(frame);
      else if (frame !== this.frame + 128) throw Error("Ordered send Native pull gap");
      this.frame = frame;
    }
    receive(parameters) {
      if (this.frame === null) throw Error("Ordered send requires Native frame");
      const count = this.reader.read(parameters), first = this.reader.sequence - count + 1;
      if (this.queued + count > 32) throw Error("Ordered send pending capacity");
      this.deferredStreak = this.reader.deferredSequence ? this.deferredStreak + 1 : 0;
      if (this.deferredStreak > 64) throw Error("Ordered send torn command bound");
      for (let i = 0; i < count; i++) {
        const at = (this.head + this.queued) % 32;
        this.frames[at] = this.reader.frames[i];
        this.sequences[at] = first + i;
        for (let w = 0; w < 14; w++) this.words[at * 14 + w] = this.reader.words[i * 14 + w];
        this.queued++;
      }
      while (this.queued && this.frames[this.head] <= this.frame) {
        const at = this.head, c = decodeOrderedSend(this.spec.sampleRate, this.spec.slots.length, this.words, at * 14, this.codec);
        this.unit.command({ ...c, authorFrame: this.frames[at] });
        this.appliedSequence = this.sequences[at];
        this.head = (this.head + 1) % 32;
        this.queued--;
      }
      if (this.queued && this.frames[this.head] > this.frame + 8192) throw Error("Ordered send future author bound");
    }
    render(inputs, { active = false } = {}) {
      try {
        if (this.frame === null || this.error || !this.unit || typeof active !== "boolean" || !Array.isArray(inputs) || inputs.length !== this.spec.slots.length) throw Error("Ordered send physical inventory differs");
        let inputMask = 0;
        for (let s = 0; s < inputs.length; s++) {
          const input = inputs[s], channels = this.spec.slots[s].channels;
          if (!Array.isArray(input) || input.length !== 0 && input.length !== channels || !active && input.length) throw Error("Ordered send source activity/layout differs");
          for (let c = 0; c < input.length; c++) if (!(input[c] instanceof Float32Array) || input[c].length !== 128) throw Error("Ordered send input quantum differs");
          if (input.length) inputMask |= 1 << s;
        }
        if (this.seenInputMask & ~inputMask) throw Error("Previously connected ordered source became absent; unknown activity refuses");
        if (!active && this.seenInputMask) throw Error("Continuous ordered source demand cannot be withdrawn");
        if (active) {
          if (inputMask !== 2 ** inputs.length - 1) {
            if (++this.attachmentQuanta > 64) throw Error("Ordered send attachment readiness exceeded64 actual quanta");
          } else this.attached = true;
          this.seenInputMask |= inputMask;
        }
        let activity = 0;
        for (let s = 0; s < inputs.length; s++) {
          const input = inputs[s];
          for (let c = 0; c < input.length; c++) this.unit.input[s][c].set(input[c]);
          if (input.length) activity |= 1 << s * 2;
        }
        this.unit.render(activity);
        this.unit.freeSlots(this.frame, this.free);
        let changed = this.lastReported !== this.appliedSequence;
        for (let i = 0; i < this.free.length; i++) if (this.lastFree[i] !== this.free[i]) changed = true;
        if (changed) {
          this.emit({ kind: "observed", sequence: this.appliedSequence, frame: this.frame, freeSlots: Array.from(this.free) });
          this.lastReported = this.appliedSequence;
          this.lastFree.set(this.free);
        }
        return this.unit.output;
      } catch (e) {
        this.error = String(e);
        throw e;
      }
    }
    stats() {
      return { frame: this.frame, unit: this.unit?.stats() ?? null, appliedSequence: this.appliedSequence, queued: this.queued, seenInputMask: this.seenInputMask, attachmentQuanta: this.attachmentQuanta, attached: this.attached, freeSlots: Array.from(this.free), reader: this.reader.snapshot(), memoryBytes: this.unit?.e.memory.buffer.byteLength ?? null, error: this.error };
    }
    dispose() {
      this.unit?.dispose();
      this.unit = null;
    }
  };

  // src/modular-audio/orderedSendProcessor.js
  var orderedSendHostDescriptors = () => [{ name: "terminalRequested", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, { name: "hostDemand", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, ...nativeContextClockDescriptors(), ...orderedSendDescriptors()];
  var cohortIdentity = (a, b) => !!a && typeof a === "object" && !Array.isArray(a) && Object.keys(a).length === 4 && ["hostVersion", "kernelVersion", "clockVersion", "generation"].every((k) => Object.hasOwn(a, k) && a[k] === b?.[k]);
  var OrderedSendProcessor = class {
    constructor(p, port, rate) {
      this.port = port;
      this.identity = p.identity;
      this.core = null;
      this.codec = null;
      this.error = null;
      this.released = false;
      this.disposed = false;
      this.pending = [];
      this.releaseErrors = [];
      this.firstFrame = null;
      this.demand = null;
      this.inputMask = 0;
      this.pendingClock = 0;
      this.terminalSeen = false;
      this.terminalCallbacks = 0;
      port.onmessage = ({ data }) => this.message(data);
      try {
        if (!cohortIdentity(p.identity, p.identity) || !Number.isInteger(p.identity.generation) || p.identity.generation < 1 || p.identity.generation > 4294967295 || p.identity?.hostVersion !== "5fd0b70532696b82" || p.identity?.kernelVersion !== "b4ebfc029ac9b939" || p.identity?.clockVersion !== "7a0838a735108706" || p.configuration?.sampleRate !== rate) throw Error("Ordered send identity differs");
        this.core = new OrderedSendCore(p.module, p.configuration, { emit: (d) => this.emit(d) });
        this.emit({ kind: "ready" });
      } catch (e) {
        this.fail(e);
      }
    }
    emit(d) {
      this.port.postMessage({ ...d, identity: this.identity });
    }
    snapshot() {
      return { firstFrame: this.firstFrame, demand: this.demand, inputMask: this.inputMask, core: this.core?.stats() ?? null, clock: this.codec?.snapshot() ?? null, pendingClock: this.pendingClock, terminalSeen: this.terminalSeen, terminalCallbacks: this.terminalCallbacks, error: this.error, released: this.released, disposed: this.disposed, releaseErrors: [...this.releaseErrors] };
    }
    release() {
      if (this.released) return;
      try {
        this.core?.dispose();
      } catch (e) {
        this.releaseErrors.push(String(e));
      }
      this.core = null;
      this.released = true;
      for (const p of this.pending) this.emit({ kind: "rejected", request: p.request, error: "Ordered send disposed" });
      this.pending.length = 0;
    }
    fail(e) {
      if (this.error) return;
      this.error = String(e);
      let stats;
      try {
        stats = this.snapshot();
      } catch {
      }
      this.release();
      this.emit({ kind: "error", error: this.error, stats });
    }
    message(d) {
      if (d?.kind === "native-clock-spec") {
        try {
          const s = validateNativeContextClockSpec(d.spec);
          if (s.rate !== this.core?.spec.sampleRate || this.codec && JSON.stringify(s) !== JSON.stringify(this.codec.spec)) throw Error("Ordered send clock changed");
          this.codec ?? (this.codec = new NativeContextClockCodec(s, { allowGaps: false }));
          this.emit({ kind: "clock-bound", spec: s });
        } catch (e) {
          this.fail(e);
        }
        return;
      }
      if (d?.kind === "native-clock-failed") {
        this.fail(Error("Ordered send Native clock retired: " + d.error));
        return;
      }
      try {
        if (!d || typeof d !== "object" || Array.isArray(d) || !cohortIdentity(d.identity, this.identity)) throw Error("Ordered send exact cohort identity required");
        const fields = { dispose: ["kind", "identity"], stats: ["kind", "identity", "request"], flush: ["kind", "identity", "request", "sequence"], activation: ["kind", "identity", "request", "sequence", "demand"] }[d.kind];
        if (!fields || Object.keys(d).length !== fields.length || !fields.every((k) => Object.hasOwn(d, k))) throw Error("Ordered send exact control packet fields required");
        if (d.kind === "dispose") {
          const terminalObserved = { seen: this.terminalSeen, callbacks: this.terminalCallbacks, lastActiveFrame: this.core?.frame ?? null, lastRustFrame: this.core?.unit.stats().frame ?? null };
          this.disposed = true;
          this.release();
          this.emit({ type: "disposed", version: 1, released: true, clean: !this.releaseErrors.length, error: this.releaseErrors.join("; ") || null, terminalObserved });
          return;
        }
        if (this.error || this.disposed || !Number.isInteger(d.request) || d.request < 1 || d.request > 4294967295 || this.pending.length >= 16) throw Error("Invalid ordered send request");
        if (d.kind === "stats") {
          this.emit({ kind: "stats", request: d.request, stats: this.snapshot() });
          return;
        }
        if (!Number.isInteger(d.sequence) || d.sequence < 0 || d.sequence > 16777215 || d.kind === "activation" && ![0, 1].includes(d.demand)) throw Error("Ordered send fence differs");
        this.pending.push({ ...d });
        this.finish();
      } catch (e) {
        this.emit({ kind: "rejected", request: d?.request, error: String(e) });
      }
    }
    finish() {
      if (this.firstFrame === null || this.error || !this.core) return;
      for (let i = 0; i < this.pending.length; ) {
        const p = this.pending[i];
        if (p.sequence <= this.core.appliedSequence && (p.kind !== "activation" || this.demand === p.demand && this.inputMask === 0)) {
          this.emit({ kind: "stats", request: p.request, stats: this.snapshot() });
          this.pending.splice(i, 1);
        } else i++;
      }
    }
    process(inputs, outputs, parameters) {
      for (const output of outputs) for (const c of output) c.fill(0);
      if (this.disposed || this.error) return false;
      try {
        if (this.terminalSeen) {
          this.terminalCallbacks++;
          return true;
        }
        const terminal = parameters.terminalRequested;
        if (!(terminal instanceof Float32Array) || ![1, 128].includes(terminal.length) || terminal.some((v) => v !== 0 && v !== 1)) throw Error("Ordered send terminal gate must be literal Boolean");
        if (terminal.some((v) => v === 1)) {
          this.terminalSeen = true;
          this.terminalCallbacks++;
          return true;
        }
        const d = parameters.hostDemand;
        if (!(d instanceof Float32Array) || ![1, 128].includes(d.length) || d.some((v) => v !== d[0]) || ![0, 1].includes(d[0])) throw Error("Ordered send demand must be uniform literal Boolean");
        this.demand = d[0];
        const out = outputs[0] ?? [];
        if (out.length !== 2 || out.some((c) => c.length !== 128) || inputs.length !== this.core.spec.slots.length) throw Error("Ordered send output/inventory differs");
        this.inputMask = 0;
        for (let s = 0; s < inputs.length; s++) if (inputs[s].length) this.inputMask |= 1 << s;
        if (!this.demand && this.inputMask) throw Error("Ordered send inactive program input forbidden");
        if (!this.codec) {
          if (this.demand || this.inputMask || ++this.pendingClock > 64) throw Error("Ordered send Native spec absent");
          return true;
        }
        const frame = this.codec.next(parameters, { allowPending: !this.demand && this.inputMask === 0 });
        if (frame === null) return true;
        this.firstFrame ?? (this.firstFrame = frame);
        this.core.sync(frame);
        this.core.receive(parameters);
        const pcm = this.core.render(inputs, { active: !!this.demand });
        if (this.demand) for (let c = 0; c < 2; c++) out[c].set(pcm[c]);
        this.finish();
        return true;
      } catch (e) {
        for (const output of outputs) for (const c of output) c.fill(0);
        this.fail(e);
        return false;
      }
    }
  };

  // ordered-send-host-entry.js
  var Cohort = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return orderedSendHostDescriptors();
    }
    constructor({ processorOptions: p }) {
      super();
      this.unit = new OrderedSendProcessor(p, this.port, sampleRate);
    }
    process(a, b, c) {
      return this.unit.process(a, b, c);
    }
  };
  registerProcessor("ordered-send-5fd0b70532696b82", Cohort);
})();
