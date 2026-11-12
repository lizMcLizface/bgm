(() => {
  // src/modular-audio/ownedSweepLive.js
  var SWEEP_LIVE_STATS = Object.freeze(["frame", "peak", "origin", "calls", "commands", "rejected", "renderedFrames", "unpulledFrames", "late", "maxLate", "channels", "lastAuthor"]);
  var SWEEP_INITIAL = Object.freeze({ lowpass: 22e3, highpass: 10, resonance: Math.SQRT1_2 });
  var OwnedSweepLive = class {
    constructor(e, rate, { origin = 0, channels = 2, initial = true } = {}) {
      if (e.sweep_live_api?.() !== 1 || !Number.isInteger(rate) || rate < 8e3 || rate > 192e3 || ![1, 2].includes(channels) || typeof initial !== "boolean") throw Error("Sweep ABI/rate/layout differs");
      this.e = e;
      this.rate = rate;
      this.channels = channels;
      this.handle = e.sweep_live_new(rate, channels);
      if (!this.handle) throw Error("Sweep allocation failed");
      try {
        this.check(e.sweep_live_prepare(this.handle, origin), "prepare");
        this.memory = e.memory.buffer;
        this.input = [0, 1].map((c) => new Float32Array(this.memory, e.sweep_live_input(this.handle, c), 128));
        this.output = [0, 1].map((c) => new Float32Array(this.memory, e.sweep_live_output(this.handle, c), 128));
        if (initial) this.set(SWEEP_INITIAL, 0, origin);
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    alive() {
      if (!this.handle) throw Error("Sweep disposed");
    }
    check(ok, operation) {
      if (!ok) throw Error("Sweep rejected " + operation);
    }
    sync(frame) {
      this.alive();
      this.check(this.e.sweep_live_sync(this.handle, frame), "sync");
    }
    capacity(count, author) {
      this.alive();
      return !!this.e.sweep_live_capacity(this.handle, count, author);
    }
    set({ lowpass = 22e3, highpass = 10, resonance = Math.SQRT1_2 } = {}, tc = 0.1, author = this.stat(0), seconds = author / this.rate) {
      this.alive();
      this.check(this.e.sweep_live_set(this.handle, lowpass, highpass, resonance, tc, author, seconds), "complete-set");
    }
    render(channels, pulled = true) {
      this.alive();
      if (!Number.isInteger(channels) || ![0, this.channels].includes(channels) || typeof pulled !== "boolean" || this.e.memory.buffer !== this.memory) throw Error("Sweep render contract differs");
      this.check(this.e.sweep_live_render(this.handle, channels, +pulled), "render");
    }
    curve(lane, index) {
      this.alive();
      return this.e.sweep_live_curve(this.handle, lane, index);
    }
    target(lane) {
      this.alive();
      return this.e.sweep_live_target(this.handle, lane);
    }
    stat(index) {
      this.alive();
      return this.e.sweep_live_stat(this.handle, index);
    }
    stats() {
      this.alive();
      return Object.fromEntries(SWEEP_LIVE_STATS.map((k, i) => [k, this.e.sweep_live_stat(this.handle, i)]));
    }
    observed() {
      this.alive();
      const values = [0, 1, 2, 3].map((i) => this.curve(i, 127));
      return { frame: this.stat(0), values, isOpen: values[0] >= 22e3 * 0.95 && values[1] <= 10 * 1.5, scope: "Last prepared/rendered Rust parameter values; not a synchronous Native AudioParam.value getter" };
    }
    dispose() {
      if (this.handle) {
        this.e.sweep_live_free(this.handle);
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

  // src/modular-audio/sweepLiveWords.js
  var SWEEP_WORD_OPTIONS = Object.freeze({ wordCount: 21, slots: 32, prefix: "sweep" });
  function validateSweepSet(raw = {}, tc = 0.1) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof tc !== "number" || !Number.isFinite(tc)) throw Error("Invalid Sweep complete call");
    for (const [key, fallback] of [["lowpass", 22e3], ["highpass", 10], ["resonance", Math.SQRT1_2]]) {
      const v = raw[key] === void 0 ? fallback : raw[key];
      if (typeof v !== "number" || !Number.isFinite(v) || !Number.isFinite(Math.fround(v))) throw Error("Invalid Sweep " + key);
    }
    return raw;
  }
  var SweepLiveWordCodec = class {
    constructor() {
      this.f64 = new StampedFloat64Words();
      this.words = new Uint16Array(21);
      this.values = { lowpass: 22e3, highpass: 10, resonance: Math.SQRT1_2 };
      this.tc = 0;
      this.seconds = 0;
    }
    encode(values = {}, tc = 0.1, seconds) {
      validateSweepSet(values, tc);
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) throw Error("Invalid Sweep original seconds");
      this.words[0] = tc > 0 ? 2 : 0;
      for (const [i, v] of [seconds, values.lowpass ?? 22e3, values.highpass ?? 10, values.resonance ?? Math.SQRT1_2, tc].entries()) this.f64.encode(v, this.words, 1 + i * 4);
      return this.words;
    }
    decode(words, offset = 0) {
      if (!Number.isInteger(offset) || offset < 0 || offset + 21 > words.length) throw Error("Invalid Sweep word offset");
      this.seconds = this.f64.decode(words, offset + 1);
      this.values.lowpass = this.f64.decode(words, offset + 5);
      this.values.highpass = this.f64.decode(words, offset + 9);
      this.values.resonance = this.f64.decode(words, offset + 13);
      this.tc = this.f64.decode(words, offset + 17);
      validateSweepSet(this.values, this.tc);
      if (!Number.isFinite(this.seconds) || this.seconds < 0 || words[offset] !== (this.tc > 0 ? 2 : 0)) throw Error("Invalid Sweep word schema");
      return this;
    }
    apply(core, author) {
      if (this.seconds !== author / core.rate) throw Error("Sweep original seconds differ from captured author epoch");
      core.set(this.values, this.tc, author, this.seconds);
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

  // src/modular-audio/sweepLiveProcessor.js
  var SweepLiveProcessor = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: "terminalGate", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, { name: "resumeGeneration", defaultValue: 0, minValue: 0, maxValue: 16777215, automationRate: "a-rate" }, { name: "hostDemand", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, ...nativeContextClockDescriptors(), ...stampedWordDescriptors(SWEEP_WORD_OPTIONS)];
    }
    constructor({ processorOptions: p }) {
      super();
      this.identity = p.identity;
      this.disposeRefusals = 0;
      this.terminalGateSeen = false;
      this.terminalQuanta = 0;
      this.disposed = false;
      this.error = null;
      this.pending = [];
      this.pendingQuanta = 0;
      this.preorigin = 0;
      this.future = 0;
      this.observed = 0;
      this.lastResumeSeen = 0;
      this.lastPulledResume = 0;
      this.hasPulled = false;
      this.firstPulledFrame = null;
      this.reanchors = 0;
      this.reanchorFrames = 0;
      this.channels = p.channels;
      this.reader = new StampedWordReader(SWEEP_WORD_OPTIONS);
      this.codec = new SweepLiveWordCodec();
      this.port.onmessage = ({ data }) => this.message(data);
      try {
        if (p.version !== "5d0df54e500f5e1a" || p.identity.hostVersion !== p.version || p.identity.kernelVersion !== "9f946a992e346794" || !Number.isInteger(p.identity.ownerGeneration) || p.identity.ownerGeneration < 1) throw Error("Sweep host identity differs");
        this.origin = p.originFrame;
        this.endFrame = p.endFrame ?? null;
        this.clock = new NativeContextClockCodec(p.clockSpec);
        if (![1, 2].includes(this.channels)) throw Error("Sweep logical output layout differs");
        this.core = new OwnedSweepLive(new WebAssembly.Instance(p.module, {}).exports, sampleRate, { origin: this.origin, channels: this.channels, initial: false });
        if (!Array.isArray(p.initialRows) || p.initialRows.length > 128) throw Error("Sweep initial control bound");
        let previous = this.origin;
        for (const row of p.initialRows) {
          if (!Array.isArray(row) || row.length !== 6 || row[0] < previous || row[0] % 128 || !Number.isSafeInteger(row[0])) throw Error("Sweep initial chronology differs");
          this.codec.encode({ lowpass: row[1], highpass: row[2], resonance: row[3] }, row[4], row[5]);
          if (row[5] !== row[0] / sampleRate) throw Error("Sweep initial seconds differ");
          previous = row[0];
        }
        this.core.sync(previous);
        for (const row of p.initialRows) {
          this.codec.encode({ lowpass: row[1], highpass: row[2], resonance: row[3] }, row[4], row[5]);
          this.codec.decode(this.codec.words).apply(this.core, row[0]);
        }
        this.port.postMessage({ kind: "ready", identity: this.identity, stats: this.snapshot() });
      } catch (error) {
        this.fail(error);
      }
    }
    snapshot() {
      return { identity: this.identity, channels: this.channels, disposeRefusals: this.disposeRefusals, observed: this.core?.observed() ?? this.lastObserved ?? null, terminalGateSeen: this.terminalGateSeen, terminalQuanta: this.terminalQuanta, kernel: this.core?.stats() ?? this.lastStats ?? null, clock: this.clock?.snapshot() ?? null, transport: this.reader.snapshot(), pendingQuanta: this.pendingQuanta, preoriginDeferrals: this.preorigin, futureDeferrals: this.future, resumeGeneration: this.lastResumeSeen, lastPulledResumeGeneration: this.lastPulledResume, hasPulled: this.hasPulled, firstPulledFrame: this.firstPulledFrame, reanchors: this.reanchors, reanchorFrames: this.reanchorFrames, disposed: this.disposed, error: this.error };
    }
    receipt(reason) {
      if (this.disposed) return;
      this.lastStats = this.core?.stats() ?? null;
      this.lastObserved = this.core?.observed() ?? null;
      this.disposed = true;
      let failure;
      try {
        this.core?.dispose();
      } catch (e) {
        failure = String(e);
      }
      this.core = null;
      this.port.postMessage({ type: "disposed", identity: this.identity, version: 1, released: true, clean: !failure, error: failure ?? null, reason, stats: this.snapshot() });
    }
    fail(error) {
      if (this.disposed) return;
      this.error = String(error);
      let stats;
      try {
        stats = this.snapshot();
      } catch (e) {
        stats = { error: String(e) };
      }
      for (const p of this.pending) this.port.postMessage({ kind: "rejected", identity: this.identity, request: p.request, error: this.error });
      this.pending.length = 0;
      this.port.postMessage({ kind: "error", identity: this.identity, error: this.error, diagnostics: stats });
      this.receipt("failure");
    }
    message(d) {
      if (d?.kind === "dispose") {
        const id = d.identity, expected = this.identity, valid = id && expected && typeof id === "object" && !Array.isArray(id) && Object.keys(id).length === Object.keys(expected).length && Object.keys(expected).every((k) => id[k] === expected[k]);
        if (!valid) {
          this.disposeRefusals = Math.min(4294967295, this.disposeRefusals + 1);
          this.port.postMessage({ kind: "dispose-refused", identity: this.identity, error: "Sweep terminal request identity differs" });
          return;
        }
        this.receipt("dispose");
        return;
      }
      if (this.disposed) return;
      try {
        if (d?.kind === "native-clock-spec") {
          if (JSON.stringify(d.spec) !== JSON.stringify(this.clock.spec)) throw Error("Sweep Native clock specification differs");
          return;
        }
        if (d?.kind === "native-clock-failed") {
          if (d.generation !== this.clock.spec.generation) throw Error("Sweep retired generation differs");
          throw Error(d.error ?? "Sweep clock generation retired");
        }
        if (!d?.identity || Object.keys(this.identity).some((k) => this.identity[k] !== d.identity[k])) throw Error("Sweep control identity differs");
        if (!Number.isInteger(d.request) || d.request < 1 || d.request > 4294967295 || this.pending.length >= 16) throw Error("Sweep request bound");
        if (d.kind === "stats") this.port.postMessage({ kind: "stats", identity: this.identity, request: d.request, stats: this.snapshot() });
        else if (d.kind === "flush") {
          if (!Number.isInteger(d.requiredSequence) || d.requiredSequence < 0 || d.requiredSequence > 16777215 || d.requireClock !== void 0 && typeof d.requireClock !== "boolean") throw Error("Invalid Sweep watermark/clock request");
          this.pending.push({ request: d.request, requiredSequence: d.requiredSequence, requireClock: d.requireClock === true, minimumCoreCalls: d.requireClock ? this.core.stat(3) + 1 : 0 });
          this.flush();
        } else throw Error("Unknown Sweep control request");
      } catch (error) {
        this.fail(error);
      }
    }
    flush() {
      for (let i = this.pending.length - 1; i >= 0; i--) if (this.reader.sequence >= this.pending[i].requiredSequence && (!this.pending[i].requireClock || this.clock.calls > 0 && this.core.stat(3) >= this.pending[i].minimumCoreCalls)) {
        const p = this.pending.splice(i, 1)[0], clockReceipt = p.requireClock ? { version: 1, generation: this.clock.spec.generation, requiredSequence: p.requiredSequence, minimumCoreCalls: p.minimumCoreCalls, coreCalls: this.core.stat(3), clockCalls: this.clock.calls, frame: this.clock.lastFrame } : null;
        this.port.postMessage({ kind: "flushed", identity: this.identity, request: p.request, clockReceipt, stats: this.snapshot() });
      }
    }
    wait(kind) {
      if (++this.pendingQuanta > 64) throw Error("Sweep isolated clock/control readiness bound");
      if (kind === "preorigin") this.preorigin++;
      if (kind === "future") this.future++;
      return true;
    }
    readDue(parameters, frame, isolated) {
      const r = this.reader, saved = [r.sequence, r.count, r.lastAuthorFrame, r.deferredSequence, r.deferredWord, r.deferredQuanta], count = r.read(parameters);
      let future = false;
      for (let i = 0; i < count; i++) {
        const author = r.frames[i];
        this.codec.decode(r.words, i * 21);
        if (this.codec.seconds !== author / sampleRate || author < this.origin || author > frame + 8192) throw Error("Sweep authored row outside current epoch");
        if (author > frame) future = true;
      }
      if (future) {
        if (!isolated) throw Error("Sweep future publication while active");
        [r.sequence, r.count, r.lastAuthorFrame, r.deferredSequence, r.deferredWord, r.deferredQuanta] = saved;
        this.wait("future");
        return false;
      }
      if (count && !this.core.capacity(count, r.frames[0])) throw Error("Sweep four-lane complete-call capacity");
      this.core.sync(frame);
      for (let i = 0; i < count; i++) this.codec.decode(r.words, i * 21).apply(this.core, r.frames[i]);
      if (count) {
        this.observed = r.sequence;
        this.port.postMessage({ kind: "observed", identity: this.identity, sequence: r.sequence });
      }
      return true;
    }
    quiesce(parameters) {
      const gate = parameters.terminalGate;
      if (!(gate instanceof Float32Array) || ![1, 128].includes(gate.length)) throw Error("Sweep terminal gate shape differs");
      let seen = this.terminalGateSeen;
      for (const value of gate) {
        if (value !== 0 && value !== 1) throw Error("Sweep terminal gate must be literal Boolean");
        if (seen && value === 0) throw Error("Sweep terminal gate cannot reopen");
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
      for (const a of out) a.fill(0);
      if (this.disposed) return false;
      try {
        if (this.quiesce(parameters)) return true;
        const input = inputs[0] ?? [], channels = input.length;
        if (channels > 2 || channels !== 0 && channels !== this.channels || out.length !== this.channels || out.some((a) => a.length !== 128)) throw Error("Sweep input/output layout differs");
        const d = parameters.hostDemand;
        if (!(d instanceof Float32Array) || ![1, 128].includes(d.length)) throw Error("Sweep demand shape differs");
        let isolated = channels === 0;
        for (const v of d) {
          if (v !== 0 && v !== 1) throw Error("Sweep demand must be literal Boolean");
          if (v !== 0) isolated = false;
        }
        const pulled = d[d.length - 1] === 1;
        if (!pulled && channels) throw Error("Sweep unpulled input must be physically isolated");
        const resume = parameters.resumeGeneration;
        if (!(resume instanceof Float32Array) || ![1, 128].includes(resume.length)) throw Error("Sweep reconnect generation shape");
        for (let i = 0; i < resume.length; i++) if (!Number.isInteger(resume[i]) || resume[i] < 0 || resume[i] > 16777215 || i && resume[i] < resume[i - 1]) throw Error("Sweep malformed reconnect generation");
        const generation = resume[resume.length - 1];
        if (generation < this.lastResumeSeen) throw Error("Sweep reconnect generation moved backwards");
        const frame = this.clock.next(parameters, { allowPending: isolated });
        if (frame === null) return this.wait("clock");
        const coreFrame = this.core.stat(0);
        if (frame < coreFrame) {
          if (!isolated || coreFrame - frame > 8192 || this.core.stat(3) !== 0) throw Error("Sweep clock precedes live core");
          return this.wait("preorigin");
        }
        if (frame > coreFrame && pulled && this.hasPulled && generation <= this.lastPulledResume) throw Error("Sweep active frontier lacks a new physical reconnect permit");
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
        this.fail(error);
        return false;
      }
    }
  };
  registerProcessor("sweep-live-5d0df54e500f5e1a", SweepLiveProcessor);
})();
