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

  // src/modular-audio/ownedRoomControlLive.js
  var amount = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  function validateRoomAmount(v) {
    if (!amount(v)) throw Error("Invalid original Room amount");
    return v;
  }
  var OwnedRoomControlLive = class {
    constructor(module, { sampleRate: sampleRate2, sourceChannels = 2, wetChannels = 2 } = {}) {
      if (!(module instanceof WebAssembly.Module)) throw Error("Room controller compiled module required");
      this.e = new WebAssembly.Instance(module, {}).exports;
      this.handle = 0;
      this.failed = false;
      if (this.e.room_control_api() !== 1) throw Error("Room controller ABI differs");
      this.handle = this.e.room_control_new(sampleRate2, sourceChannels, wetChannels);
      if (!this.handle) throw Error("Room controller preparation failed");
      this.sampleRate = sampleRate2;
      this.sourceChannels = sourceChannels;
      this.wetChannels = wetChannels;
      this.outputChannels = Math.max(sourceChannels, wetChannels);
      const memory = this.e.memory.buffer;
      this.memory = memory;
      this.inputDry = Array.from({ length: sourceChannels }, (_, c) => new Float32Array(memory, this.e.room_control_input(this.handle, 0, c), 128));
      this.inputWet = Array.from({ length: wetChannels }, (_, c) => new Float32Array(memory, this.e.room_control_input(this.handle, 1, c), 128));
      this.output = Array.from({ length: this.outputChannels }, (_, c) => new Float32Array(memory, this.e.room_control_output(this.handle, c), 128));
    }
    alive() {
      if (!this.handle) throw Error("Room controller disposed");
      if (this.failed) throw Error("Room controller failed");
      if (this.e.memory.buffer !== this.memory) throw Error("Room controller memory grew");
    }
    check(v, label) {
      if (!v) throw Error("Room controller rejected " + label);
    }
    sync(frame, { isolated = false } = {}) {
      this.alive();
      if (typeof isolated !== "boolean") throw Error("Room isolation must be Boolean");
      this.check(this.e.room_control_sync(this.handle, frame, Number(isolated)), "clock");
    }
    admitPair(v, drySeconds, wetSeconds, { dryCallFrame = 0, wetCallFrame = dryCallFrame } = {}) {
      this.alive();
      validateRoomAmount(v);
      this.check(this.e.room_control_pair(this.handle, v, drySeconds, wetSeconds, dryCallFrame, wetCallFrame), "complete pair");
    }
    reservePair(id, v, callFrame) {
      this.alive();
      validateRoomAmount(v);
      this.check(this.e.room_control_reserve(this.handle, id, v, callFrame), "pair capacity");
    }
    leaf(id, lane, v, seconds, callFrame) {
      this.alive();
      try {
        this.check(this.e.room_control_leaf(this.handle, id, lane, v, seconds, callFrame), "live leaf");
      } catch (e) {
        this.failed = true;
        throw e;
      }
    }
    render({ dryMode = 2, wetMode = 2 } = {}) {
      this.alive();
      try {
        this.check(this.e.room_control_render(this.handle, dryMode, wetMode), "render");
        for (const p of this.output) for (const x of p) if (!Number.isFinite(x)) throw Error("Nonfinite original Room gain output");
      } catch (e) {
        this.failed = true;
        throw e;
      }
    }
    values(lane) {
      this.alive();
      if (lane !== 0 && lane !== 1) throw Error("Room gain lane differs");
      return Float32Array.from({ length: 128 }, (_, i) => this.e.room_control_value(this.handle, lane, i));
    }
    stats() {
      if (!this.handle) throw Error("Room controller disposed");
      const keys = ["frame", "calls", "audioFrames", "parameterFrames", "unpulledFrames", "commands", "pairs", "rejected", "lateRecords", "maxLateFrames", "reservedDry", "reservedWet", "pendingPairs", "peak", "originFrame", "lastDrySeconds", "lastWetSeconds", "lastDryMainSeconds", "lastWetMainSeconds", "lastDryObservedFrame", "lastWetObservedFrame"];
      return { ...Object.fromEntries(keys.map((k, i) => [k, this.e.room_control_stat(this.handle, i)])), sampleRate: this.sampleRate, sourceChannels: this.sourceChannels, wetChannels: this.wetChannels, outputChannels: this.outputChannels, adapterLatencyFrames: 0, failed: this.failed };
    }
    dispose() {
      if (this.handle) {
        this.e.room_control_free(this.handle);
        this.handle = 0;
        this.memory = this.inputDry = this.inputWet = this.output = null;
      }
    }
  };

  // src/modular-audio/roomAmountWords.js
  var ROOM_AMOUNT_WORDS = 16;
  var ROOM_AMOUNT_SLOTS = 32;
  var ROOM_AMOUNT_PREFIX = "roomAmount";
  var ROOM_AMOUNT_PAIR_MAX = 8388607;
  var roomAmountDescriptors = () => stampedWordDescriptors({ wordCount: ROOM_AMOUNT_WORDS, slots: ROOM_AMOUNT_SLOTS, prefix: ROOM_AMOUNT_PREFIX });

  // src/modular-audio/ownedRoomReservedControl.js
  var OwnedRoomReservedControl = class extends OwnedRoomControlLive {
    constructor(module, configuration) {
      super(module, configuration);
      try {
        if (this.e.room_control_ready_api?.() !== 1 || ["room_control_reserve_ready", "room_control_cancel_ready", "room_control_ready_credit", "room_control_ready_stat"].some((k) => typeof this.e[k] !== "function")) throw Error("Prepared Room ABI missing");
      } catch (e) {
        this.dispose();
        throw e;
      }
    }
    reserveReady(id, value) {
      this.alive();
      validateRoomAmount(value);
      this.check(this.e.room_control_reserve_ready(this.handle, id, value), "prepared pair capacity");
    }
    cancelReady(id) {
      this.alive();
      this.check(this.e.room_control_cancel_ready(this.handle, id), "unused prepared pair cancellation");
    }
    credits() {
      if (!this.handle) throw Error("Prepared Room controller disposed");
      return { dry: this.e.room_control_ready_credit(this.handle, 0), wet: this.e.room_control_ready_credit(this.handle, 1) };
    }
    stats() {
      return { ...super.stats(), credits: this.credits(), prepared: { reserved: this.e.room_control_ready_stat(this.handle, 0), cancelled: this.e.room_control_ready_stat(this.handle, 1), ready: this.e.room_control_ready_stat(this.handle, 2), started: this.e.room_control_ready_stat(this.handle, 3) } };
    }
  };

  // src/modular-audio/roomReservedCore.js
  var RoomReservedCore = class {
    constructor(module, configuration, { emit = () => {
    } } = {}) {
      this.unit = new OwnedRoomReservedControl(module, configuration);
      this.rate = configuration.sampleRate;
      this.emit = emit;
      this.reader = new StampedWordReader({ wordCount: 16, slots: 32, prefix: ROOM_AMOUNT_PREFIX });
      this.codec = new StampedFloat64Words();
      this.frames = new Float64Array(32);
      this.sequences = new Uint32Array(32);
      this.payloads = new Uint16Array(32 * 16);
      this.head = 0;
      this.queued = 0;
      this.appliedSequence = 0;
      this.consumedSequence = 0;
      this.pendingPair = 0;
      this.pendingPrepared = false;
      this.pendingSince = 0;
      this.frame = 0;
      this.failure = null;
      this.rejectedPairs = 0;
      this.maxQueue = 0;
    }
    alive() {
      if (this.failure) throw Error(this.failure);
      if (!this.unit) throw Error("Room control core disposed");
    }
    sync(frame, { isolated = false } = {}) {
      this.alive();
      this.unit.sync(frame, { isolated });
      this.frame = frame;
    }
    receive(parameters) {
      this.alive();
      try {
        return this.consume(parameters);
      } catch (e) {
        this.failure = String(e);
        throw e;
      }
    }
    consume(parameters) {
      this.alive();
      const count = this.reader.read(parameters), first = this.reader.sequence - count + 1;
      if (this.queued + count > 32) throw Error("Room amount owned pending queue capacity");
      for (let i = 0; i < count; i++) {
        const at = (this.head + this.queued) % 32;
        this.frames[at] = this.reader.frames[i];
        this.sequences[at] = first + i;
        for (let j = 0; j < 16; j++) this.payloads[at * 16 + j] = this.reader.words[i * 16 + j];
        this.queued++;
      }
      this.maxQueue = Math.max(this.maxQueue, this.queued);
      let observed = false;
      while (this.queued && this.frames[this.head] <= this.frame) {
        const at = this.head, offset = at * 16, op = this.payloads[offset], id = this.payloads[offset + 13] + this.payloads[offset + 14] * 65536, value = this.codec.decode(this.payloads, offset + 1), seconds = this.codec.decode(this.payloads, offset + 5), author = this.frames[at], sequence = this.sequences[at];
        if (op > 4 || id < 1 || id > ROOM_AMOUNT_PAIR_MAX || this.payloads[offset + 15] !== 0 || !Number.isFinite(value) || value < 0 || value > 1 || !Number.isFinite(seconds) || seconds < 0) throw Error("Invalid Room amount semantic payload");
        if (op !== 2 && seconds !== author / this.rate) throw Error("Prepared live Room seconds differ from authored call frame");
        if (op !== 2) {
          for (let j = 9; j < 13; j++) if (this.payloads[offset + j] !== 0) throw Error("Unexpected second time on a live Room leaf");
        }
        if (op === 0 || op === 3) {
          if (this.pendingPair) throw Error("Live Room dry arrived before prior wet");
          if (op === 0) this.unit.reservePair(id, value, author);
          this.unit.leaf(id, 0, value, seconds, author);
          this.pendingPair = id;
          this.pendingPrepared = op === 3;
          this.pendingSince = this.frame;
        } else if (op === 1 || op === 4) {
          if (op === 4 !== this.pendingPrepared) throw Error("Prepared Room wet operation differs");
          if (id !== this.pendingPair) throw Error("Live Room wet pair identifier differs");
          this.unit.leaf(id, 1, value, seconds, author);
          this.pendingPair = 0;
          this.pendingPrepared = false;
          this.appliedSequence = sequence;
          observed = true;
        } else {
          if (this.pendingPair) throw Error("Atomic Room pair interrupted an incomplete live call");
          const wet = this.codec.decode(this.payloads, offset + 9);
          if (!Number.isFinite(wet) || wet < seconds) throw Error("Invalid complete Room wet time");
          if (seconds < this.frame / this.rate || wet > this.frame / this.rate + 3600) {
            this.rejectedPairs++;
            this.emit({ kind: "pair-rejected", sequence, id, error: "Complete Room future pair missed its output deadline", authorFrame: author, observedOutputFrame: this.frame });
          } else {
            let rejection = null;
            try {
              this.unit.admitPair(value, seconds, wet, { dryCallFrame: author, wetCallFrame: author });
            } catch (e) {
              rejection = String(e);
            }
            if (rejection) {
              this.rejectedPairs++;
              this.emit({ kind: "pair-rejected", sequence, id, error: rejection, authorFrame: author, observedOutputFrame: this.frame });
            } else this.emit({ kind: "pair-accepted", sequence, id, authorFrame: author, observedOutputFrame: this.frame });
          }
          this.appliedSequence = sequence;
          observed = true;
        }
        this.consumedSequence = sequence;
        this.queued--;
        this.head = (this.head + 1) % 32;
      }
      if (this.pendingPair && this.frame - this.pendingSince >= 8192) throw Error("Missing live Room wet counterpart exceeded64-output-quantum bound");
      if (observed) this.emit({ kind: "observed", sequence: this.appliedSequence, outputFrame: this.frame });
      return count;
    }
    render(dry, wet, { dryMode = 2, wetMode = 2 } = {}) {
      this.alive();
      try {
        if (dryMode === 2) {
          if (dry.length !== this.unit.sourceChannels) throw Error("Room dry input layout differs");
          for (let c = 0; c < dry.length; c++) for (let i = 0; i < 128; i++) this.unit.inputDry[c][i] = dry[c][i];
        }
        if (wetMode === 2) {
          if (wet.length !== this.unit.wetChannels) throw Error("Room wet input layout differs");
          for (let c = 0; c < wet.length; c++) for (let i = 0; i < 128; i++) this.unit.inputWet[c][i] = wet[c][i];
        }
        this.unit.render({ dryMode, wetMode });
        return this.unit.output;
      } catch (e) {
        this.failure = String(e);
        throw e;
      }
    }
    reserveReady(id, value) {
      this.alive();
      this.unit.reserveReady(id, value);
    }
    cancelReady(id) {
      this.alive();
      this.unit.cancelReady(id);
    }
    stats() {
      return { unit: this.unit?.stats() ?? null, reader: this.reader.snapshot(), queued: this.queued, maxQueue: this.maxQueue, appliedSequence: this.appliedSequence, consumedSequence: this.consumedSequence, pendingPair: this.pendingPair, pendingPrepared: this.pendingPrepared, pendingSince: this.pendingSince, rejectedPairs: this.rejectedPairs, outputFrame: this.frame, failure: this.failure };
    }
    dispose() {
      this.unit?.dispose();
      this.unit = null;
      this.payloads = this.frames = this.sequences = null;
    }
  };

  // src/modular-audio/roomReservedProcessor.js
  var roomControlDescriptors = () => [{ name: "hostDemand", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, ...nativeContextClockDescriptors(), ...roomAmountDescriptors()];
  var RoomReservedProcessor = class {
    constructor(p, port, rate) {
      this.port = port;
      this.identity = p.identity;
      this.core = null;
      this.codec = null;
      this.error = null;
      this.disposed = false;
      this.released = false;
      this.releaseErrors = [];
      this.pending = [];
      this.lastRawFrame = null;
      this.mode = 0;
      port.onmessage = ({ data }) => this.message(data);
      try {
        if (p.identity?.hostVersion !== "55794c7d73868593" || p.identity?.kernelVersion !== "e323611d27ec3a36" || p.identity?.clockVersion !== "7a0838a735108706" || !(p.module instanceof WebAssembly.Module) || p.configuration?.sampleRate !== rate) throw Error("Room output controller identity differs");
        this.configuration = p.configuration;
        this.core = new RoomReservedCore(p.module, p.configuration, { emit: (d) => this.emit(d) });
        this.emit({ kind: "ready", stats: this.snapshot() });
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
          if (spec.rate !== this.configuration?.sampleRate || this.codec && JSON.stringify(spec) !== JSON.stringify(this.codec.spec)) throw Error("Room output clock generation changed");
          this.codec ??= new NativeContextClockCodec(spec);
          this.emit({ kind: "clock-bound", spec });
        } catch (e) {
          this.fail(e);
        }
        return;
      }
      if (d?.kind === "native-clock-failed") {
        if (!this.codec || d.generation !== this.codec.spec.generation) this.fail(Error("Room clock retirement identity differs"));
        else this.fail(Error(d.error));
        return;
      }
      if (d?.kind === "dispose") {
        this.release();
        this.disposed = true;
        this.port.postMessage({ type: "disposed", version: 1, released: true, clean: this.releaseErrors.length === 0, error: this.releaseErrors.join("; ") || null, identity: this.identity });
        return;
      }
      if (d?.kind === "amount-prepare" || d?.kind === "amount-cancel") {
        let admitted = false;
        try {
          if (this.disposed || this.error) throw Error(this.error ?? "Reserved Room controller disposed");
          if (!Number.isInteger(d.request) || d.request < 1 || d.request > 4294967295) throw Error("Invalid prepared amount request");
          if (d.kind === "amount-prepare") {
            this.core.reserveReady(d.id, d.value);
            admitted = true;
            this.emit({ kind: "amount-ready", request: d.request, id: d.id, value: d.value, reserved: true });
          } else {
            this.core.cancelReady(d.id);
            admitted = true;
            this.emit({ kind: "amount-cancelled", request: d.request, id: d.id, cancelled: true });
          }
        } catch (e) {
          if (admitted) this.fail(e);
          else this.emit({ kind: "rejected", request: d?.request, error: String(e) });
        }
        return;
      }
      try {
        if (this.disposed || this.error) throw Error(this.error ?? "Room output controller disposed");
        if (!Number.isInteger(d?.request) || d.request < 1 || d.request > 4294967295) throw Error("Invalid Room controller request");
        if (d.kind === "flush") {
          if (!Number.isInteger(d.sequence) || d.sequence < 0 || d.sequence > 16777215) throw Error("Invalid Room flush watermark");
          if (d.sequence > this.core.appliedSequence) {
            if (this.pending.length >= 16) throw Error("Room flush request capacity");
            this.pending.push({ request: d.request, sequence: d.sequence });
            return;
          }
        } else if (d.kind !== "stats") throw Error("Unknown Room controller request");
        this.emit({ kind: "stats", request: d.request, stats: this.snapshot() });
      } catch (e) {
        this.emit({ kind: "rejected", request: d?.request, error: String(e) });
      }
    }
    release() {
      if (this.released) return;
      for (const action of [() => this.core?.dispose(), () => this.onRelease?.()]) try {
        action();
      } catch (e) {
        this.releaseErrors.push(String(e));
      }
      this.core = null;
      this.released = true;
      for (const p of this.pending) this.emit({ kind: "rejected", request: p.request, error: "Disposed Room controller" });
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
    snapshot() {
      return { identity: this.identity, configuration: this.configuration, core: this.core?.stats() ?? null, clock: this.codec?.snapshot() ?? null, rawFrame: this.lastRawFrame, mode: this.mode, error: this.error, disposed: this.disposed, released: this.released, releaseErrors: [...this.releaseErrors], scope: "Original output-time gain controller. Authored Native seconds preserved; late visibility counted, no already-emitted audio reconstruction." };
    }
    decode(parameters, isolated) {
      if (!this.codec) {
        if (!isolated) throw Error("Room active output lacks Native clock");
        return null;
      }
      return this.codec.next(parameters, { allowPending: isolated });
    }
    controls(parameters, frame, isolated) {
      this.core.sync(frame, { isolated });
      this.core.receive(parameters);
      for (let i = 0; i < this.pending.length; ) {
        const p = this.pending[i];
        if (p.sequence <= this.core.appliedSequence) {
          this.emit({ kind: "stats", request: p.request, stats: this.snapshot() });
          this.pending.splice(i, 1);
        } else i++;
      }
    }
    process(inputs, outputs, parameters, rawFrame) {
      const out = outputs[0] ?? [];
      for (const p of out) p.fill(0);
      if (this.disposed || this.error) return false;
      try {
        this.lastRawFrame = rawFrame;
        const demand = parameters.hostDemand;
        if (!(demand instanceof Float32Array) || ![1, 128].includes(demand.length) || demand.some((v) => v !== 0 && v !== 1)) throw Error("Room output demand must be literal Boolean");
        const pulled = demand[demand.length - 1] === 1;
        const dry = inputs[0] ?? [], wet = inputs[1] ?? [];
        if (out.length !== Math.max(this.configuration.sourceChannels, this.configuration.wetChannels) || out.some((p) => p.length !== 128) || dry.length && dry.length !== this.configuration.sourceChannels || wet.length && wet.length !== this.configuration.wetChannels || dry.some((p) => p.length !== 128) || wet.some((p) => p.length !== 128)) throw Error("Room branch layout differs");
        if (!pulled && (dry.length || wet.length)) throw Error("Unpulled Room control service requires isolated program inputs");
        const frame = this.decode(parameters, !pulled);
        if (frame === null) return true;
        this.controls(parameters, frame, !pulled);
        const dryMode = pulled ? dry.length ? 2 : 1 : 0, wetMode = pulled ? wet.length ? 2 : 1 : 0;
        this.mode = Math.max(dryMode, wetMode);
        const result = this.core.render(dry, wet, { dryMode, wetMode });
        for (let c = 0; c < out.length; c++) out[c].set(result[c]);
        return true;
      } catch (e) {
        for (const p of out) p.fill(0);
        this.fail(e);
        return false;
      }
    }
  };

  // src/modular-audio/roomContinuousTransport.js
  var RoomContinuousTransport = class extends RoomReservedProcessor {
    constructor(p, port, rate) {
      super(p, port, rate);
      this.g = p.geometry;
      this.direct = null;
      this.epoch = null;
      this.running = false;
      this.drained = false;
      this.sourceFrame = 0;
      this.returnedFrame = 0;
      this.outputFrame = 0;
      this.endFrame = null;
      this.workerSealed = false;
      this.capture = null;
      this.offset = 0;
      this.captureFrame = 0;
      this.inFlight = 0;
      this.queued = 0;
      this.rejectedPackets = 0;
      this.underrunFrames = 0;
      this.highWater = 0;
      this.free = [];
      this.readyPackets = [];
      this.pendingPackets = [];
      this.inputStates = [];
      this.inputState = "audio";
      this.inputStateCount = 0;
      this.audioInputFrames = 0;
      this.silentInputFrames = 0;
      this.onRelease = () => this.releaseTransport();
      if (this.error) return;
      try {
        const g = this.g, L = Math.max(2 * g.blockFrames, Math.ceil(rate * 0.5 / 128) * 128), P = Math.ceil(L / g.blockFrames) + 4;
        if (g.sampleRate !== rate || g.inputChannels !== p.configuration.sourceChannels || g.wetChannels !== p.configuration.wetChannels || g.packetPlanes !== g.inputChannels + g.wetChannels || g.outputChannels !== Math.max(g.inputChannels, g.wetChannels) || !Number.isInteger(g.blockFrames) || g.blockFrames < 128 || g.blockFrames > 2048 || g.blockFrames % 128 || !Number.isSafeInteger(g.maxSessionFrames) || g.maxSessionFrames < 128 || g.maxSessionFrames % 128 || g.maxSessionFrames > Math.floor(rate * 3600 / 128) * 128 || g.latencyFrames !== L || g.poolBlocks !== P || P > 192 || g.inputPcmBytes !== P * g.inputChannels * g.blockFrames * 4 || g.wetPcmBytes !== P * g.wetChannels * g.blockFrames * 4 || g.poolBytes !== g.inputPcmBytes + g.wetPcmBytes) throw Error("Continuous Room transport geometry differs");
        this.free = Array.from({ length: P }, () => new Float32Array(g.packetPlanes * g.blockFrames));
        this.readyPackets = new Array(P).fill(null);
        this.pendingPackets = new Array(P).fill(null);
        this.emit({ kind: "transport-ready", geometry: g, stats: this.snapshot() });
      } catch (e) {
        this.fail(e);
      }
    }
    message(d) {
      if (d?.kind === "attach") {
        try {
          if (this.disposed || this.error || this.direct || !d.port || !Number.isInteger(d.request) || d.request < 1) throw Error("Continuous Room attach differs");
          this.direct = d.port;
          this.direct.onmessage = ({ data }) => this.packet(data);
          this.direct.start?.();
          this.emit({ kind: "attached", request: d.request });
        } catch (e) {
          this.fail(e);
        }
        return;
      }
      if (["arm", "input-state", "end"].includes(d?.kind)) {
        try {
          if (this.disposed || this.error || !Number.isInteger(d.request) || d.request < 1) throw Error("Continuous Room operation unavailable");
          if (d.kind === "arm") {
            if (this.epoch !== null || !this.direct || !this.codec || !Number.isSafeInteger(d.epoch) || d.epoch % 128 || d.epoch < Math.max(this.codec.spec.epochFrame, this.codec.lastFrame ?? this.codec.spec.epochFrame) + 256 || d.epoch + this.g.maxSessionFrames + this.g.latencyFrames > 1099511627648 || d.epoch + this.g.maxSessionFrames + this.g.latencyFrames > this.codec.expiryFrame || !["audio", "silent"].includes(d.inputState ?? "audio")) throw Error("Continuous Room future epoch differs");
            this.epoch = d.epoch;
            this.inputState = d.inputState ?? "audio";
            this.running = true;
            this.emit({ kind: "armed", request: d.request, epoch: d.epoch, firstOutputFrame: d.epoch + this.g.latencyFrames, latencyFrames: this.g.latencyFrames, maxSessionFrames: this.g.maxSessionFrames, inputState: this.inputState });
            return;
          }
          if (!this.running || this.drained || !Number.isSafeInteger(d.frame) || d.frame % 128 || d.frame < this.sourceFrame + 128 || d.frame > this.g.maxSessionFrames) throw Error("Continuous Room future source deadline differs");
          if (d.kind === "input-state") {
            if (!["audio", "silent"].includes(d.state) || this.inputStates.length >= 32 || this.endFrame !== null && d.frame >= this.endFrame || this.inputStates.length && d.frame < this.inputStates.at(-1).frame) throw Error("Continuous Room input authority/capacity differs");
            this.inputStates.push({ frame: d.frame, state: d.state });
            this.inputStateCount++;
            this.emit({ kind: "input-state-accepted", request: d.request, frame: d.frame, state: d.state, sourceFrame: this.sourceFrame });
            return;
          }
          if (this.endFrame !== null || this.inputStates.some((p) => p.frame >= d.frame)) throw Error("Continuous Room final boundary differs");
          this.endFrame = d.frame;
          this.emit({ kind: "end-accepted", request: d.request, frame: d.frame, sourceFrame: this.sourceFrame });
          return;
        } catch (e) {
          this.emit({ kind: "rejected", request: d.request, error: String(e), sourceFrame: this.sourceFrame });
        }
        return;
      }
      super.message(d);
    }
    packet(p) {
      if (this.disposed || this.error) return;
      try {
        const g = this.g;
        if (p?.kind === "error") throw Error(p.error);
        if (p?.generation !== this.identity.ownerGeneration) throw Error("Continuous Room return owner differs");
        if (p.kind === "sealed") {
          if (this.workerSealed || this.endFrame === null || p.frame !== this.endFrame || this.sourceFrame !== this.endFrame || this.returnedFrame !== this.endFrame || this.inFlight) throw Error("Continuous Room Worker seal differs");
          this.workerSealed = true;
          this.finish();
          return;
        }
        if (p?.kind !== "pcm" || p.frame !== this.returnedFrame || p.frame % g.blockFrames || !(p.buffer instanceof ArrayBuffer) || p.buffer.byteLength !== g.packetPlanes * g.blockFrames * 4 || this.inFlight < 1) throw Error("Continuous Room returned PCM frontier differs");
        const index = p.frame / g.blockFrames % g.poolBlocks, expected = this.pendingPackets[index];
        if (!expected || expected.frame !== p.frame || expected.frames !== p.frames || expected.final !== p.final || p.frame < this.outputFrame || this.readyPackets[index]) throw Error("Continuous Room packet duplicate/late/layout differs");
        const pcm = new Float32Array(p.buffer);
        for (let c = 0; c < g.packetPlanes; c++) for (let i = 0; i < p.frames; i++) if (!Number.isFinite(pcm[c * g.blockFrames + i])) throw Error("Nonfinite continuous Room return");
        this.pendingPackets[index] = null;
        this.readyPackets[index] = { frame: p.frame, frames: p.frames, pcm };
        this.returnedFrame += p.frames;
        this.inFlight--;
        this.queued++;
        this.highWater = Math.max(this.highWater, this.queued);
      } catch (e) {
        this.rejectedPackets++;
        this.fail(e);
      }
    }
    finish() {
      if (this.endFrame === null || this.outputFrame !== this.endFrame || !this.workerSealed) return;
      if (this.sourceFrame !== this.endFrame || this.returnedFrame !== this.endFrame || this.inFlight || this.queued || this.capture || this.free.length !== this.g.poolBlocks) throw Error("Continuous Room final drain/credit proof differs");
      this.drained = true;
      this.emit({ kind: "drained", stats: this.snapshot() });
    }
    snapshot() {
      const base = super.snapshot();
      return { ...base, transport: this.g ? { geometry: this.g, epoch: this.epoch, sourceFrame: this.sourceFrame, returnedFrame: this.returnedFrame, outputFrame: this.outputFrame, endFrame: this.endFrame, workerSealed: this.workerSealed, inFlight: this.inFlight, queued: this.queued, highWater: this.highWater, freeBuffers: this.free?.length ?? 0, rejectedPackets: this.rejectedPackets, underrunFrames: this.underrunFrames, drained: this.drained, running: this.running, inputState: this.inputState, pendingInputStates: this.inputStates?.length ?? 0, inputStateCount: this.inputStateCount, audioInputFrames: this.audioInputFrames, silentInputFrames: this.silentInputFrames } : null };
    }
    releaseTransport() {
      for (const action of [() => this.direct?.close(), () => {
        this.free.length = 0;
        this.readyPackets.fill(null);
        this.pendingPackets.fill(null);
        this.inputStates.length = 0;
        this.capture = null;
      }]) try {
        action();
      } catch (e) {
        this.releaseErrors.push(String(e));
      }
      this.direct = null;
    }
    process(inputs, outputs, parameters, rawFrame) {
      const out = outputs[0] ?? [];
      for (const p of out) p.fill(0);
      if (this.disposed || this.error) return false;
      try {
        this.lastRawFrame = rawFrame;
        const g = this.g, input = inputs[0] ?? [], isolated = !this.running || this.drained;
        if (out.length !== g.outputChannels || out.some((p) => p.length !== 128) || input.length && input.length !== g.inputChannels || input.some((p) => p.length !== 128)) throw Error("Continuous Room callback layout differs");
        const frame = this.decode(parameters, isolated);
        if (frame === null) return true;
        this.controls(parameters, frame, isolated);
        if (this.running && !this.drained && frame >= this.epoch && (this.endFrame === null || this.sourceFrame < this.endFrame)) {
          if (frame - this.epoch !== this.sourceFrame || this.sourceFrame >= g.maxSessionFrames) throw Error("Continuous Room source frontier/cap ended or skipped");
          while (this.inputStates.length && this.inputStates[0].frame === this.sourceFrame) this.inputState = this.inputStates.shift().state;
          if (this.inputStates.length && this.inputStates[0].frame < this.sourceFrame) throw Error("Continuous Room input authority arrived late");
          if (this.inputState === "audio" && input.length !== g.inputChannels) throw Error("Continuous Room declared audio input missing");
          if (!this.capture) {
            this.capture = this.free.pop();
            if (!this.capture) throw Error("Continuous Room input credits exhausted");
            this.captureFrame = this.sourceFrame;
            this.offset = 0;
          }
          for (let c = 0; c < g.inputChannels; c++) for (let i = 0; i < 128; i++) {
            const x = this.inputState === "audio" ? input[c][i] : 0;
            if (!Number.isFinite(x)) throw Error("Continuous Room nonfinite source");
            this.capture[c * g.blockFrames + this.offset + i] = x;
          }
          if (this.inputState === "audio") this.audioInputFrames += 128;
          else this.silentInputFrames += 128;
          this.offset += 128;
          this.sourceFrame += 128;
          const final = this.endFrame !== null && this.sourceFrame === this.endFrame;
          if (this.offset === g.blockFrames || final) {
            const buffer = this.capture.buffer, index = this.captureFrame / g.blockFrames % g.poolBlocks;
            if (this.pendingPackets[index] || this.readyPackets[index]) throw Error("Continuous Room packet credit reused early");
            this.pendingPackets[index] = { frame: this.captureFrame, frames: this.offset, final };
            this.inFlight++;
            this.direct.postMessage({ kind: "pcm", generation: this.identity.ownerGeneration, frame: this.captureFrame, frames: this.offset, final, buffer }, [buffer]);
            this.capture = null;
            if (final) {
              this.direct.postMessage({ kind: "end", generation: this.identity.ownerGeneration, frame: this.endFrame });
              this.emit({ kind: "input-ended", frame: this.endFrame, stats: this.snapshot() });
            }
          }
        }
        if (this.running && !this.drained && frame >= this.epoch + g.latencyFrames && (this.endFrame === null || this.outputFrame < this.endFrame)) {
          if (frame - this.epoch - g.latencyFrames !== this.outputFrame) throw Error("Continuous Room output frontier skipped");
          const index = Math.floor(this.outputFrame / g.blockFrames) % g.poolBlocks, packet = this.readyPackets[index], offset = this.outputFrame % g.blockFrames;
          if (!packet || packet.frame + offset !== this.outputFrame) {
            this.underrunFrames += 128;
            throw Error("Continuous Room output underrun");
          }
          for (let c = 0; c < g.inputChannels; c++) for (let i = 0; i < 128; i++) this.core.unit.inputDry[c][i] = packet.pcm[c * g.blockFrames + offset + i];
          for (let c = 0; c < g.wetChannels; c++) for (let i = 0; i < 128; i++) this.core.unit.inputWet[c][i] = packet.pcm[(g.inputChannels + c) * g.blockFrames + offset + i];
          this.core.unit.render({ dryMode: 2, wetMode: 2 });
          for (let c = 0; c < out.length; c++) out[c].set(this.core.unit.output[c]);
          this.mode = 2;
          this.outputFrame += 128;
          if (offset + 128 === packet.frames) {
            this.readyPackets[index] = null;
            this.queued--;
            this.free.push(packet.pcm);
          }
          this.finish();
        } else {
          const mode = this.running && !this.drained ? 1 : 0;
          this.mode = mode;
          this.core.unit.render({ dryMode: mode, wetMode: mode });
        }
        return true;
      } catch (e) {
        for (const p of out) p.fill(0);
        this.fail(e);
        return false;
      }
    }
  };

  // room-continuous-processor-entry.js
  var SplitRoomOutput = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return roomControlDescriptors();
    }
    constructor({ processorOptions: p }) {
      super();
      this.unit = new RoomContinuousTransport(p, this.port, sampleRate);
    }
    process(a, b, c) {
      return this.unit.process(a, b, c, currentFrame);
    }
  };
  registerProcessor("room-continuous-live-55794c7d73868593", SplitRoomOutput);
})();
