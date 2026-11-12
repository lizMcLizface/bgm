(() => {
  // src/modular-audio/ownedInstrumentTone.js
  var INSTRUMENT_TONE_MODES = Object.freeze({ filter: 0, eq2: 1, "eq2-filter": 2 });
  var INSTRUMENT_TONE_STATS = Object.freeze(["frame", "peak", "calls", "commands", "rejected", "renderedFrames", "unpulledFrames", "late", "mainThreadClamps", "mode", "channels", "filterType"]);
  var OwnedInstrumentTone = class {
    constructor(e, rate, { mode = "filter", channels = 2, origin = 0 } = {}) {
      if (e.instrument_tone_api?.() !== 1 || !Object.hasOwn(INSTRUMENT_TONE_MODES, mode) || ![1, 2].includes(channels) || !Number.isInteger(rate) || rate < 8e3 || rate > 192e3) throw Error("Instrument tone ABI/profile differs");
      this.e = e;
      this.rate = rate;
      this.mode = mode;
      this.channels = channels;
      this.handle = e.instrument_tone_new(rate, channels, INSTRUMENT_TONE_MODES[mode]);
      if (!this.handle) throw Error("Instrument tone allocation failed");
      try {
        this.check(e.instrument_tone_prepare(this.handle, origin), "prepare");
        this.memory = e.memory.buffer;
        this.input = [0, 1].map((c) => new Float32Array(this.memory, e.instrument_tone_input(this.handle, c), 128));
        this.output = [0, 1].map((c) => new Float32Array(this.memory, e.instrument_tone_output(this.handle, c), 128));
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    alive() {
      if (!this.handle) throw Error("Instrument tone disposed");
    }
    check(ok, method) {
      if (!ok) throw Error("Instrument tone rejected " + method);
    }
    sync(frame) {
      this.alive();
      this.check(this.e.instrument_tone_sync(this.handle, frame), "Native frame");
    }
    command(lane, op, value, tau, author = this.stat(0), seconds = author / this.rate) {
      this.alive();
      if (!Number.isInteger(lane) || lane < 0 || lane >= 16 || ![0, 2, 3, 4].includes(op)) throw Error("Invalid tone lane/opcode");
      this.check(this.e.instrument_tone_command(this.handle, lane, op, value, tau, author, seconds), "command");
    }
    setType(kind, author = this.stat(0)) {
      this.alive();
      if (!Number.isInteger(kind) || kind < 0 || kind > 6) throw Error("Invalid filter type");
      this.check(this.e.instrument_tone_type(this.handle, kind, author), "type");
    }
    credit(lane, count, author = this.stat(0)) {
      this.alive();
      if (!Number.isInteger(lane) || lane < 0 || lane >= 16 || !Number.isInteger(count) || count < 0 || count > 256) throw Error("Invalid tone credit query");
      return !!this.e.instrument_tone_credit(this.handle, lane, count, author);
    }
    render(channels, pulled = true) {
      this.alive();
      if (!Number.isInteger(channels) || ![0, this.channels].includes(channels) || typeof pulled !== "boolean" || this.e.memory.buffer !== this.memory) throw Error("Tone render layout/memory differs");
      this.check(this.e.instrument_tone_render(this.handle, channels, +pulled), "render");
    }
    curve(lane, index) {
      this.alive();
      return this.e.instrument_tone_curve(this.handle, lane, index);
    }
    target(lane) {
      this.alive();
      return this.e.instrument_tone_target(this.handle, lane);
    }
    stat(index) {
      this.alive();
      return this.e.instrument_tone_stat(this.handle, index);
    }
    stats() {
      this.alive();
      return Object.fromEntries(INSTRUMENT_TONE_STATS.map((key, i) => [key, this.stat(i)]));
    }
    dispose() {
      if (this.handle) {
        this.e.instrument_tone_free(this.handle);
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

  // src/modular-audio/instrumentToneWords.js
  var INSTRUMENT_TONE_WORD_OPTIONS = Object.freeze({ wordCount: 14, slots: 32, prefix: "instrumentTone" });
  var InstrumentToneWordCodec = class {
    constructor() {
      this.f64 = new StampedFloat64Words();
      this.words = new Uint16Array(14);
      this.op = 0;
      this.lane = 0;
      this.value = 0;
      this.tau = 0;
      this.seconds = 0;
    }
    encode(op, lane, value, tau, seconds) {
      if (![0, 2, 3, 4, 7].includes(op) || !Number.isInteger(lane) || lane < 0 || lane > 15 || typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)) || typeof tau !== "number" || !Number.isFinite(tau) || tau < 0 || typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) throw Error("Invalid Instrument tone control schema");
      if (op === 7) {
        if (lane !== 0 || !Number.isInteger(value) || value < 0 || value > 6 || tau !== 0) throw Error("Invalid Instrument filter type row");
      } else if (op === 3) {
        if (value !== 0 || tau !== 0) throw Error("Invalid Instrument tone cancel row");
      } else {
        const valid = lane % 4 === 0 ? value >= 0 && value <= 11e3 : lane % 4 === 1 ? value >= 0 && value <= 100 : lane % 4 === 2 ? value >= -40 && value <= 40 : value >= -153600 && value <= 153600;
        if (!valid || op === 2 && tau === 0 || op !== 2 && tau !== 0) throw Error("Invalid Instrument tone parameter row");
      }
      this.words[0] = op;
      this.words[1] = lane;
      this.f64.encode(value, this.words, 2);
      this.f64.encode(tau, this.words, 6);
      this.f64.encode(seconds, this.words, 10);
      return this.words;
    }
    decode(words, offset = 0) {
      if (!Number.isInteger(offset) || offset < 0 || offset + 14 > words.length) throw Error("Invalid Instrument tone word offset");
      const op = words[offset], lane = words[offset + 1], value = this.f64.decode(words, offset + 2), tau = this.f64.decode(words, offset + 6), seconds = this.f64.decode(words, offset + 10);
      this.encode(op, lane, value, tau, seconds);
      Object.assign(this, { op, lane, value, tau, seconds });
      return this;
    }
    apply(core, author) {
      if (this.seconds !== author / core.rate) throw Error("Instrument tone seconds differ from captured author epoch");
      if (this.op === 7) core.setType(this.value, author);
      else core.command(this.lane, this.op, this.value, this.tau, author, this.seconds);
    }
  };

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

  // src/modular-audio/instrumentToneProcessor.js
  var exactIdentity = (a, b) => a && b && typeof a === "object" && !Array.isArray(a) && Object.keys(a).length === 3 && Object.keys(b).length === 3 && Object.keys(b).every((k) => a[k] === b[k]);
  var InstrumentToneProcessor = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: "terminalGate", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, { name: "resumeGeneration", defaultValue: 0, minValue: 0, maxValue: 16777215, automationRate: "a-rate" }, { name: "hostDemand", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, ...nativeContextClockDescriptors(), ...stampedWordDescriptors(INSTRUMENT_TONE_WORD_OPTIONS)];
    }
    constructor({ processorOptions: p }) {
      super();
      this.identity = p.identity;
      this.mode = p.mode;
      this.channels = p.channels;
      this.origin = p.originFrame;
      this.endFrame = p.endFrame ?? null;
      this.pending = [];
      this.disposed = false;
      this.error = null;
      this.disposeRefusals = 0;
      this.terminalGateSeen = false;
      this.terminalQuanta = 0;
      this.pendingQuanta = 0;
      this.preorigin = 0;
      this.future = 0;
      this.lastResumeSeen = 0;
      this.lastPulledResume = 0;
      this.hasPulled = false;
      this.firstPulledFrame = null;
      this.reanchors = 0;
      this.reanchorFrames = 0;
      this.needed = new Uint16Array(16);
      this.reader = new StampedWordReader(INSTRUMENT_TONE_WORD_OPTIONS);
      this.codec = new InstrumentToneWordCodec();
      this.port.onmessage = ({ data }) => this.message(data);
      try {
        if (p.version !== "d1d152b4493cb684" || !exactIdentity(p.identity, { hostVersion: p.version, kernelVersion: "1afe2ec923809c85", ownerGeneration: p.identity?.ownerGeneration }) || !Number.isInteger(p.identity.ownerGeneration) || p.identity.ownerGeneration < 1 || p.identity.ownerGeneration > 4294967295 || ![1, 2].includes(p.channels)) throw Error("Instrument tone host identity/layout differs");
        this.clock = new NativeContextClockCodec(p.clockSpec);
        this.core = new OwnedInstrumentTone(new WebAssembly.Instance(p.module, {}).exports, sampleRate, { mode: p.mode, channels: p.channels, origin: p.originFrame });
        if (!Array.isArray(p.initialRows) || p.initialRows.length > 128) throw Error("Instrument tone cold command bound");
        let previous = this.origin;
        for (const row of p.initialRows) {
          if (!Array.isArray(row) || row.length !== 6 || !Number.isSafeInteger(row[0]) || row[0] % 128 || row[0] < previous || row[5] !== row[0] / sampleRate) throw Error("Instrument tone cold chronology differs");
          this.codec.encode(...row.slice(1));
          this.validateLane(this.codec.decode(this.codec.words));
          previous = row[0];
        }
        this.core.sync(previous);
        for (const row of p.initialRows) this.codec.decode(this.codec.encode(...row.slice(1))).apply(this.core, row[0]);
        this.port.postMessage({ kind: "ready", identity: this.identity, stats: this.snapshot() });
      } catch (error) {
        this.fail(error);
      }
    }
    validateLane(row) {
      if (this.mode === "filter" && row.lane >= 4 || this.mode === "eq2" && (row.lane < 4 || row.op === 7)) throw Error("Instrument tone row addresses an absent original stage");
    }
    observed() {
      if (!this.core) return this.lastObserved ?? null;
      const lanes = this.mode === "filter" ? [0, 1, 2, 3] : this.mode === "eq2" ? Array.from({ length: 12 }, (_, i) => i + 4) : Array.from({ length: 16 }, (_, i) => i);
      return { frame: this.core.stat(0), scope: "Last prepared/rendered Rust curves, not synchronous Native intrinsic getters", lanes: lanes.map((lane) => ({ lane, value: this.core.curve(lane, 127), target: this.core.target(lane) })) };
    }
    snapshot() {
      return { identity: this.identity, mode: this.mode, channels: this.channels, origin: this.origin, kernel: this.core?.stats() ?? this.lastStats ?? null, observed: this.observed(), clock: this.clock?.snapshot() ?? null, transport: this.reader.snapshot(), pendingQuanta: this.pendingQuanta, preoriginDeferrals: this.preorigin, futureDeferrals: this.future, resumeGeneration: this.lastResumeSeen, lastPulledResumeGeneration: this.lastPulledResume, hasPulled: this.hasPulled, firstPulledFrame: this.firstPulledFrame, reanchors: this.reanchors, reanchorFrames: this.reanchorFrames, terminalGateSeen: this.terminalGateSeen, terminalQuanta: this.terminalQuanta, disposeRefusals: this.disposeRefusals, disposed: this.disposed, error: this.error };
    }
    receipt(reason) {
      if (this.disposed) return;
      this.lastStats = this.core?.stats() ?? null;
      this.lastObserved = this.observed();
      this.disposed = true;
      let failure;
      try {
        this.core?.dispose();
      } catch (error) {
        failure = String(error);
      }
      this.core = null;
      this.port.postMessage({ type: "disposed", identity: this.identity, version: 1, released: true, clean: !failure, error: failure ?? null, reason, stats: this.snapshot() });
    }
    fail(error) {
      if (this.disposed) return;
      this.error = String(error);
      let diagnostics;
      try {
        diagnostics = this.snapshot();
      } catch (issue) {
        diagnostics = { error: String(issue) };
      }
      for (const row of this.pending) this.port.postMessage({ kind: "rejected", identity: this.identity, request: row.request, error: this.error });
      this.pending.length = 0;
      this.port.postMessage({ kind: "error", identity: this.identity, error: this.error, diagnostics });
      this.receipt("failure");
    }
    message(d) {
      if (d?.kind === "dispose") {
        if (Object.keys(d).length !== 2 || !exactIdentity(d.identity, this.identity)) {
          this.disposeRefusals = Math.min(4294967295, this.disposeRefusals + 1);
          this.port.postMessage({ kind: "dispose-refused", identity: this.identity, error: "Instrument tone terminal request identity differs" });
          return;
        }
        this.receipt("dispose");
        return;
      }
      if (this.disposed) return;
      try {
        if (d?.kind === "native-clock-spec") {
          if (JSON.stringify(d.spec) !== JSON.stringify(this.clock.spec)) throw Error("Instrument tone clock specification differs");
          return;
        }
        if (d?.kind === "native-clock-failed") {
          if (d.generation !== this.clock.spec.generation) throw Error("Instrument tone retired clock generation differs");
          throw Error(d.error ?? "Instrument tone clock generation retired");
        }
        if (!exactIdentity(d?.identity, this.identity) || !Number.isInteger(d.request) || d.request < 1 || d.request > 4294967295 || this.pending.length >= 16) throw Error("Instrument tone request identity/budget differs");
        if (d.kind === "stats" && Object.keys(d).length !== 3 || d.kind === "flush" && Object.keys(d).some((k) => !["kind", "identity", "request", "requiredSequence", "requireClock"].includes(k))) throw Error("Instrument tone request shape differs");
        if (d.kind === "stats") this.port.postMessage({ kind: "stats", identity: this.identity, request: d.request, stats: this.snapshot() });
        else if (d.kind === "flush") {
          if (!Number.isInteger(d.requiredSequence) || d.requiredSequence < 0 || d.requiredSequence > 16777215 || d.requireClock !== void 0 && typeof d.requireClock !== "boolean") throw Error("Instrument tone flush contract differs");
          this.pending.push({ request: d.request, requiredSequence: d.requiredSequence, requireClock: d.requireClock === true, minimumCoreCalls: d.requireClock ? this.core.stat(2) + 1 : 0 });
          this.flush();
        } else throw Error("Unknown Instrument tone control request");
      } catch (error) {
        this.fail(error);
      }
    }
    flush() {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        if (this.reader.sequence < p.requiredSequence || p.requireClock && (!this.clock.calls || this.core.stat(2) < p.minimumCoreCalls)) continue;
        this.pending.splice(i, 1);
        this.port.postMessage({ kind: "flushed", identity: this.identity, request: p.request, clockReceipt: p.requireClock ? { version: 1, generation: this.clock.spec.generation, requiredSequence: p.requiredSequence, minimumCoreCalls: p.minimumCoreCalls, coreCalls: this.core.stat(2), clockCalls: this.clock.calls, frame: this.clock.lastFrame } : null, stats: this.snapshot() });
      }
    }
    wait(kind) {
      if (++this.pendingQuanta > 64) throw Error("Instrument tone isolated readiness bound");
      if (kind === "preorigin") this.preorigin++;
      if (kind === "future") this.future++;
      return true;
    }
    readDue(parameters, frame, isolated) {
      const r = this.reader, saved = [r.sequence, r.count, r.lastAuthorFrame, r.deferredSequence, r.deferredWord, r.deferredQuanta], count = r.read(parameters);
      let future = false;
      const needed = this.needed;
      needed.fill(0);
      for (let i = 0; i < count; i++) {
        const author = r.frames[i], row = this.codec.decode(r.words, i * 14);
        this.validateLane(row);
        if (row.seconds !== author / sampleRate || author < this.origin || author > frame + 8192) throw Error("Instrument tone publication outside current epoch");
        if (author > frame) future = true;
        if (row.op !== 7 && row.op !== 3) needed[row.lane]++;
      }
      if (future) {
        if (!isolated) throw Error("Instrument tone future publication while active");
        [r.sequence, r.count, r.lastAuthorFrame, r.deferredSequence, r.deferredWord, r.deferredQuanta] = saved;
        this.wait("future");
        return false;
      }
      for (let lane = 0; lane < 16; lane++) if (needed[lane] && !this.core.credit(lane, needed[lane], r.frames[0])) throw Error("Instrument tone whole lane batch capacity");
      this.core.sync(frame);
      for (let i = 0; i < count; i++) this.codec.decode(r.words, i * 14).apply(this.core, r.frames[i]);
      if (count) this.port.postMessage({ kind: "observed", identity: this.identity, sequence: r.sequence });
      return true;
    }
    quiesce(parameters) {
      const gate = parameters.terminalGate;
      if (!(gate instanceof Float32Array) || ![1, 128].includes(gate.length)) throw Error("Instrument tone terminal gate shape differs");
      let seen = this.terminalGateSeen;
      for (const value of gate) {
        if (value !== 0 && value !== 1 || seen && value === 0) throw Error("Instrument tone terminal gate must be one-way Boolean");
        if (value === 1) seen = true;
      }
      this.terminalGateSeen = seen;
      if (seen) {
        this.terminalQuanta++;
        return true;
      }
      return false;
    }
    process(inputs, outputs, parameters) {
      const out = outputs[0];
      if (!out?.length) return !this.disposed;
      for (const plane of out) plane.fill(0);
      if (this.disposed) return false;
      try {
        if (this.quiesce(parameters)) return true;
        const input = inputs[0] ?? [], channels = input.length;
        if (channels > 2 || channels !== 0 && channels !== this.channels || out.length !== this.channels || out.some((plane) => plane.length !== 128)) throw Error("Instrument tone input/output layout differs");
        const demand = parameters.hostDemand;
        if (!(demand instanceof Float32Array) || ![1, 128].includes(demand.length)) throw Error("Instrument tone demand shape differs");
        let isolated = channels === 0;
        for (const value of demand) {
          if (value !== 0 && value !== 1) throw Error("Instrument tone demand must be literal Boolean");
          if (value !== 0) isolated = false;
        }
        const pulled = demand[demand.length - 1] === 1;
        if (!pulled && channels) throw Error("Instrument tone unpulled input must be physically isolated");
        const resume = parameters.resumeGeneration;
        if (!(resume instanceof Float32Array) || ![1, 128].includes(resume.length)) throw Error("Instrument tone reconnect shape differs");
        for (let i = 0; i < resume.length; i++) if (!Number.isInteger(resume[i]) || resume[i] < 0 || resume[i] > 16777215 || i && resume[i] < resume[i - 1]) throw Error("Instrument tone reconnect generation differs");
        const generation = resume[resume.length - 1];
        if (generation < this.lastResumeSeen) throw Error("Instrument tone reconnect generation moved backwards");
        const frame = this.clock.next(parameters, { allowPending: isolated });
        if (frame === null) return this.wait("clock");
        const coreFrame = this.core.stat(0);
        if (frame < coreFrame) {
          if (!isolated || coreFrame - frame > 8192 || this.core.stat(2) !== 0) throw Error("Instrument tone clock precedes active core");
          return this.wait("preorigin");
        }
        if (frame > coreFrame && pulled && this.hasPulled && generation <= this.lastPulledResume) throw Error("Instrument tone active frontier lacks physical reconnect permit");
        if (!this.readDue(parameters, frame, isolated)) return true;
        if (frame > coreFrame) {
          this.reanchors++;
          this.reanchorFrames += frame - coreFrame;
        }
        this.lastResumeSeen = generation;
        this.pendingQuanta = 0;
        for (let c = 0; c < channels; c++) this.core.input[c].set(input[c]);
        this.core.render(channels, pulled);
        if (pulled) {
          if (!this.hasPulled) this.firstPulledFrame = frame;
          this.hasPulled = true;
          this.lastPulledResume = generation;
        }
        for (let c = 0; c < this.channels; c++) out[c].set(this.core.output[c]);
        this.flush();
        if (this.endFrame !== null && frame + 128 >= this.endFrame) {
          this.receipt("offline-end");
          return false;
        }
        return true;
      } catch (error) {
        for (const plane of out) plane.fill(0);
        this.fail(error);
        return false;
      }
    }
  };
  registerProcessor("instrument-tone-d1d152b4493cb684", InstrumentToneProcessor);
})();
