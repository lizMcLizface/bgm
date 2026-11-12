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

  // src/modular-audio/mainControlWords.js
  var mainControlGeometry = () => ({ wordCount: 14, slots: 32, prefix: "mainEvent" });
  var mainControlDescriptors = () => stampedWordDescriptors(mainControlGeometry());
  var kinds = ["set", null, "target", "cancel"];
  var keys = ["lane", "op", "seconds", "value", "tau"];
  function validateMainControl(rate, c) {
    if (!Number.isInteger(rate) || rate < 8e3 || rate > 192e3 || !c || Object.keys(c).length !== 5 || !keys.every((k) => Object.hasOwn(c, k)) || !Number.isInteger(c.lane) || c.lane < 0 || c.lane > 2 || !["set", "target", "cancel"].includes(c.op) || typeof c.seconds !== "number" || !Number.isFinite(c.seconds) || c.seconds < 0 || c.seconds > STAMPED_WORD_FRAME_MAX / rate || typeof c.value !== "number" || !Number.isFinite(c.value) || c.value < 0 || c.value > (c.lane === 0 ? rate / 2 : c.lane === 1 ? 4 : 1) || typeof c.tau !== "number" || !Number.isFinite(c.tau) || c.tau < 0 || c.tau > 3600 || c.op === "target" && (c.tau === 0 || Math.fround(c.tau) === 0) || c.op !== "target" && c.tau !== 0 || c.op === "cancel" && c.value !== 0) throw Error("Invalid bounded Main control record");
    return c;
  }
  function decodeMainControl(rate, words, offset, codec) {
    if (!(words instanceof Uint16Array) || !Number.isInteger(offset) || offset < 0 || offset + 14 > words.length || !(codec instanceof StampedFloat64Words)) throw Error("Main control decoder scratch differs");
    return validateMainControl(rate, { lane: words[offset], op: kinds[words[offset + 1]], seconds: codec.decode(words, offset + 2), value: codec.decode(words, offset + 6), tau: codec.decode(words, offset + 10) });
  }

  // src/modular-audio/mainStripLiveRust.js
  var ops = ["set", null, "target", "cancel"];
  var MainStripLiveRust = class {
    constructor(module, raw) {
      if (!raw || typeof raw !== "object" || Object.keys(raw).some((k) => !["sampleRate", "channels", "filtered", "initial", "originFrame", "initialAssignments"].includes(k))) throw Error("Invalid mutable Main strip fields");
      const { sampleRate: sampleRate2, channels = 2, filtered = true, initial = [Math.min(2e4, sampleRate2 / 2), 1, 1], originFrame = 0, initialAssignments = [true, true, false] } = raw;
      if (!(module instanceof WebAssembly.Module) || !Number.isInteger(sampleRate2) || sampleRate2 < 8e3 || sampleRate2 > 192e3 || ![1, 2].includes(channels) || typeof filtered !== "boolean" || !Array.isArray(initial) || initial.length !== 3 || initial.some((v, i) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > (i === 0 ? sampleRate2 / 2 : i === 1 ? 4 : 1)) || !Number.isSafeInteger(originFrame) || originFrame < 0 || originFrame % 128 || originFrame > 2 ** 40 - 128) throw Error("Invalid mutable Main strip geometry");
      if (!Array.isArray(initialAssignments) || initialAssignments.length !== 3 || initialAssignments.some((v) => typeof v !== "boolean")) throw Error("Invalid Main constructor assignment trace");
      this.e = new WebAssembly.Instance(module, {}).exports;
      this.handle = 0;
      this.failed = false;
      this.spec = Object.freeze({ sampleRate: sampleRate2, channels, filtered, initial: Object.freeze([...initial]), originFrame, initialAssignments: Object.freeze([...initialAssignments]) });
      if (this.e.main_strip_live_api() !== 1) throw Error("Mutable Main strip ABI differs");
      this.handle = this.e.main_strip_live_new(sampleRate2, channels, Number(filtered));
      if (!this.handle) throw Error("Mutable Main strip allocation failed");
      try {
        initial.forEach((v, i) => this.check(this.e.main_strip_live_initial(this.handle, i, v)));
        this.check(this.e.main_strip_live_prepare(this.handle, originFrame));
        initialAssignments.forEach((assigned, lane) => {
          if (assigned) this.check(this.e.main_strip_live_command(this.handle, lane, 0, originFrame / sampleRate2, initial[lane], 0, originFrame));
        });
        this.memory = this.e.memory.buffer;
        this.input = Array.from({ length: channels }, (_, c) => new Float32Array(this.memory, this.e.main_strip_live_input(this.handle, c), 2048));
        this.output = Array.from({ length: channels }, (_, c) => new Float32Array(this.memory, this.e.main_strip_live_output(this.handle, c), 2048));
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    alive() {
      if (!this.handle || this.failed) throw Error("Mutable Main strip is not live");
    }
    check(value) {
      if (!value) throw Error("Mutable Main strip operation rejected");
    }
    firstFrame(frame) {
      this.alive();
      if (!Number.isSafeInteger(frame) || frame < 0 || frame % 128) throw Error("Invalid first Native Main frame");
      this.check(this.e.main_strip_live_first_frame(this.handle, frame));
    }
    command(c) {
      this.alive();
      if (!c || Object.keys(c).length !== 6 || !["lane", "op", "seconds", "value", "tau", "authorFrame"].every((k) => Object.hasOwn(c, k)) || !Number.isInteger(c.lane) || c.lane < 0 || c.lane > 2 || !["set", "target", "cancel"].includes(c.op) || typeof c.seconds !== "number" || !Number.isFinite(c.seconds) || c.seconds < 0 || typeof c.value !== "number" || !Number.isFinite(c.value) || typeof c.tau !== "number" || !Number.isFinite(c.tau) || c.tau < 0 || !Number.isSafeInteger(c.authorFrame) || c.authorFrame < 0 || c.authorFrame % 128) throw Error("Invalid mutable Main strip command");
      this.check(this.e.main_strip_live_command(this.handle, c.lane, ops.indexOf(c.op), c.seconds, c.value, c.tau, c.authorFrame));
    }
    render(n) {
      this.alive();
      if (!Number.isInteger(n) || n < 0 || n > 2048) throw Error("Mutable Main strip block bounds");
      try {
        if (this.memory !== this.e.memory.buffer) throw Error("Mutable Main strip memory changed");
        this.check(this.e.main_strip_live_render(this.handle, n));
        for (const p of this.output) for (let i = 0; i < n; i++) if (!Number.isFinite(p[i])) throw Error("Nonfinite mutable Main strip output");
      } catch (error) {
        this.failed = true;
        throw error;
      }
    }
    freeSlots(frame, slots = new Array(3)) {
      this.alive();
      if (!Number.isSafeInteger(frame) || frame < 0 || frame % 128 || !(Array.isArray(slots) || slots instanceof Uint16Array) || slots.length !== 3) throw Error("Invalid Main observed credit frame/storage");
      for (let lane = 0; lane < 3; lane++) {
        const n = this.e.main_strip_live_free_slots(this.handle, lane, frame);
        if (!Number.isInteger(n) || n < 0 || n > 256) throw Error("Invalid Main DSP credit observation");
        slots[lane] = n;
      }
      return slots;
    }
    stats() {
      if (!this.handle) throw Error("Mutable Main strip disposed");
      return Object.fromEntries(["frame", "peak", "calls", "rejected", "lastAuthorFrame", "latePublications", "mainThreadClamps", "filtered"].map((k, i) => [k, this.e.main_strip_live_stat(this.handle, i)]));
    }
    dispose() {
      if (this.handle) {
        this.e.main_strip_live_free(this.handle);
        this.handle = 0;
        this.input = this.output = this.memory = null;
      }
    }
  };

  // src/modular-audio/mainStripControlCore.js
  var MainStripControlCore = class {
    constructor(module, configuration, { emit = () => {
    } } = {}) {
      this.unit = new MainStripLiveRust(module, configuration);
      this.rate = configuration.sampleRate;
      this.emit = emit;
      this.reader = new StampedWordReader(mainControlGeometry());
      this.codec = new StampedFloat64Words();
      this.frames = new Float64Array(32);
      this.sequences = new Uint32Array(32);
      this.words = new Uint16Array(32 * 14);
      this.head = 0;
      this.queued = 0;
      this.frame = null;
      this.appliedSequence = 0;
      this.free = (configuration.initialAssignments ?? [true, true, false]).map((v) => 256 - Number(v));
      this.lastReportedSequence = -1;
      this.lastReportedFree = null;
      this.deferredStreak = 0;
      this.error = null;
    }
    sync(frame) {
      if (this.error || !this.unit) throw Error(this.error ?? "Disposed Main controller");
      if (!Number.isSafeInteger(frame) || frame < 0 || frame % 128) throw Error("Noncanonical Main Native frame");
      if (this.frame === null) this.unit.firstFrame(frame);
      else if (frame !== this.frame + 128) throw Error("Main Native clock discontinuity");
      this.frame = frame;
    }
    receive(parameters) {
      if (this.frame === null) throw Error("Main controls require an actual Native frame");
      const count = this.reader.read(parameters), first = this.reader.sequence - count + 1;
      if (this.queued + count > 32) throw Error("Main pending command capacity");
      this.deferredStreak = this.reader.deferredSequence ? this.deferredStreak + 1 : 0;
      if (this.deferredStreak > 64) throw Error("Main torn command exceeded64 quanta");
      for (let i = 0; i < count; i++) {
        const at = (this.head + this.queued) % 32;
        this.frames[at] = this.reader.frames[i];
        this.sequences[at] = first + i;
        this.words.set(this.reader.words.subarray(i * 14, i * 14 + 14), at * 14);
        this.queued++;
      }
      while (this.queued && this.frames[this.head] <= this.frame) {
        const at = this.head, c = decodeMainControl(this.rate, this.words, at * 14, this.codec);
        this.unit.command({ ...c, authorFrame: this.frames[at] });
        this.appliedSequence = this.sequences[at];
        this.head = (this.head + 1) % 32;
        this.queued--;
      }
      if (this.queued && this.frames[this.head] > this.frame + 8192) throw Error("Main author metadata exceeds current Native clock bound");
    }
    render(input, { pulled = true } = {}) {
      if (this.frame === null || this.error || !this.unit) throw Error(this.error ?? "Main render has no Native frame");
      try {
        if (typeof pulled !== "boolean" || !Array.isArray(input) || input.length && input.length !== this.unit.spec.channels || input.some((p) => !(p instanceof Float32Array) || p.length !== 128) || !pulled && input.length) throw Error("Main input layout or pull authority differs");
        for (let c = 0; c < this.unit.input.length; c++) if (input.length) this.unit.input[c].set(input[c]);
        else this.unit.input[c].fill(0, 0, 128);
        this.unit.render(128);
        this.unit.freeSlots(this.frame, this.free);
        if (this.lastReportedSequence !== this.appliedSequence || !this.lastReportedFree || this.free.some((n, i) => n !== this.lastReportedFree[i])) {
          this.emit({ kind: "observed", sequence: this.appliedSequence, frame: this.frame, freeSlots: [...this.free] });
          this.lastReportedSequence = this.appliedSequence;
          this.lastReportedFree = [...this.free];
        }
        return this.unit.output;
      } catch (e) {
        this.error = String(e);
        throw e;
      }
    }
    stats() {
      return { frame: this.frame, unit: this.unit?.stats() ?? null, appliedSequence: this.appliedSequence, queued: this.queued, freeSlots: [...this.free], reader: this.reader.snapshot(), error: this.error, scope: "Continuous Native-frame Main; exact read-only Rust credits at the observed Native frame, no inferred reclamation" };
    }
    dispose() {
      this.unit?.dispose();
      this.unit = null;
      this.frames = this.sequences = this.words = null;
    }
  };

  // src/modular-audio/mainStripControlProcessor.js
  var mainStripControlDescriptors = () => [{ name: "hostDemand", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, ...nativeContextClockDescriptors(), ...mainControlDescriptors()];
  var MainStripControlProcessor = class {
    constructor(p, port, rate) {
      this.port = port;
      this.identity = p.identity;
      this.configuration = p.configuration;
      this.core = null;
      this.codec = null;
      this.error = null;
      this.disposed = false;
      this.released = false;
      this.releaseErrors = [];
      this.pending = [];
      this.firstFrame = null;
      port.onmessage = ({ data }) => this.message(data);
      try {
        if (p.identity?.hostVersion !== "dce22a3010c7a3b7" || p.identity?.kernelVersion !== "03eb5d894a75d801" || p.identity?.clockVersion !== "7a0838a735108706" || !(p.module instanceof WebAssembly.Module) || p.configuration?.sampleRate !== rate) throw Error("Main controller identity differs");
        this.core = new MainStripControlCore(p.module, p.configuration, { emit: (d) => this.emit(d) });
        this.emit({ kind: "ready" });
      } catch (e) {
        this.fail(e);
      }
    }
    emit(d) {
      this.port.postMessage({ ...d, identity: this.identity });
    }
    message(d) {
      if (d?.kind === "native-clock-spec") {
        try {
          const spec = validateNativeContextClockSpec(d.spec);
          if (spec.rate !== this.configuration?.sampleRate || this.codec && JSON.stringify(spec) !== JSON.stringify(this.codec.spec)) throw Error("Main clock generation changed");
          this.codec ??= new NativeContextClockCodec(spec, { allowGaps: false });
        } catch (e) {
          this.fail(e);
        }
        return;
      }
      if (d?.kind === "native-clock-failed") {
        this.fail(Error("Main Native clock retired: " + d.error));
        return;
      }
      if (d?.kind === "dispose") {
        this.release();
        this.disposed = true;
        this.port.postMessage({ type: "disposed", version: 1, released: true, clean: this.releaseErrors.length === 0, error: this.releaseErrors.join("; ") || null, identity: this.identity });
        return;
      }
      try {
        if (this.disposed || this.error) throw Error(this.error ?? "Disposed Main controller");
        if (!Number.isInteger(d?.request) || d.request < 1 || d.request > 4294967295 || !["stats", "flush"].includes(d.kind)) throw Error("Invalid Main request");
        if (d.kind === "flush") {
          if (!Number.isInteger(d.sequence) || d.sequence < 0 || d.sequence > 16777215) throw Error("Invalid Main flush sequence");
          if (this.firstFrame === null || d.sequence > this.core.appliedSequence) {
            if (this.pending.length >= 16) throw Error("Main pending flush capacity");
            this.pending.push({ request: d.request, sequence: d.sequence });
            return;
          }
        }
        this.emit({ kind: "stats", request: d.request, stats: this.snapshot() });
      } catch (e) {
        this.emit({ kind: "rejected", request: d?.request, error: String(e) });
      }
    }
    snapshot() {
      return { identity: this.identity, configuration: this.configuration, firstFrame: this.firstFrame, core: this.core?.stats() ?? null, clock: this.codec?.snapshot() ?? null, error: this.error, released: this.released, disposed: this.disposed, releaseErrors: [...this.releaseErrors] };
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
      for (const p of this.pending) this.emit({ kind: "rejected", request: p.request, error: "Disposed Main controller" });
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
    process(inputs, outputs, parameters) {
      const out = outputs[0] ?? [];
      for (const p of out) p.fill(0);
      if (this.disposed || this.error) return false;
      try {
        const demand = parameters.hostDemand;
        if (!(demand instanceof Float32Array) || ![1, 128].includes(demand.length) || demand.some((v) => v !== 0 && v !== 1)) throw Error("Main demand must be literal Boolean");
        const pulled = demand[demand.length - 1] === 1, input = inputs[0] ?? [];
        if (out.length !== this.configuration.channels || out.some((p) => p.length !== 128) || !pulled && input.length) throw Error("Main output layout or unpulled input differs");
        if (!this.codec) {
          if (pulled) throw Error("Active Main has no Native clock");
          return true;
        }
        const frame = this.codec.next(parameters, { allowPending: !pulled });
        if (frame === null) return true;
        this.firstFrame ??= frame;
        this.core.sync(frame);
        this.core.receive(parameters);
        const pcm = this.core.render(input, { pulled });
        if (pulled) for (let c = 0; c < out.length; c++) out[c].set(pcm[c].subarray(0, 128));
        for (let i = 0; i < this.pending.length; ) {
          const p = this.pending[i];
          if (p.sequence <= this.core.appliedSequence) {
            this.emit({ kind: "stats", request: p.request, stats: this.snapshot() });
            this.pending.splice(i, 1);
          } else i++;
        }
        return true;
      } catch (e) {
        for (const p of out) p.fill(0);
        this.fail(e);
        return false;
      }
    }
  };

  // src/modular-audio/mainRoleControlProcessor.js
  var mainRoleControlDescriptors = mainStripControlDescriptors;
  var MainRoleControlProcessor = class extends MainStripControlProcessor {
    constructor(...args) {
      super(...args);
      this.activationPending = [];
      this.observedDemand = null;
      this.observedInputChannels = null;
      this.uniformDemand = false;
    }
    message(data) {
      if (data?.kind !== "activation-fence") return super.message(data);
      try {
        if (this.disposed || this.error || Object.keys(data).length !== 4 || !Number.isInteger(data.request) || data.request < 1 || data.request > 4294967295 || ![0, 1].includes(data.demand) || !Number.isInteger(data.sequence) || data.sequence < 0 || data.sequence > 16777215 || this.activationPending.length >= 4) throw Error("Invalid role control activation fence");
        this.activationPending.push({ ...data });
        this.finishActivation();
      } catch (error) {
        this.emit({ kind: "rejected", request: data?.request, error: String(error) });
      }
    }
    finishActivation() {
      if (!this.uniformDemand || this.observedInputChannels !== 0 || this.firstFrame === null || this.error || this.disposed) return;
      for (let i = 0; i < this.activationPending.length; ) {
        const request = this.activationPending[i];
        if (request.demand === this.observedDemand && request.sequence <= this.core.appliedSequence) {
          this.emit({ kind: "activation-bound", request: request.request, stats: this.snapshot() });
          this.activationPending.splice(i, 1);
        } else i++;
      }
    }
    snapshot() {
      return { ...super.snapshot(), observedDemand: this.observedDemand ?? null, observedInputChannels: this.observedInputChannels ?? null, uniformDemand: this.uniformDemand ?? false, memoryBytes: this.core?.unit?.e?.memory?.buffer?.byteLength ?? null };
    }
    release() {
      if (this.activationPending) {
        for (const request of this.activationPending) this.emit({ kind: "rejected", request: request.request, error: "Disposed role control" });
        this.activationPending.length = 0;
      }
      return super.release();
    }
    process(inputs, outputs, parameters) {
      const result = super.process(inputs, outputs, parameters);
      if (result && !this.error && !this.disposed && this.firstFrame !== null) {
        const demand = parameters.hostDemand;
        this.observedDemand = demand[demand.length - 1];
        let uniform = true;
        for (let i = 0; i < demand.length; i++) if (demand[i] !== this.observedDemand) uniform = false;
        this.uniformDemand = uniform;
        this.observedInputChannels = (inputs[0] ?? []).length;
        this.finishActivation();
      }
      return result;
    }
  };

  // main-role-control-entry.js
  var RoleControl = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return mainRoleControlDescriptors();
    }
    constructor({ processorOptions: p }) {
      super();
      this.unit = new MainRoleControlProcessor(p, this.port, sampleRate);
    }
    process(a, b, c) {
      return this.unit.process(a, b, c);
    }
  };
  registerProcessor("native-clock-main-role-dce22a3010c7a3b7", RoleControl);
})();
