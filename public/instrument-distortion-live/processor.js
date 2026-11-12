(() => {
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

  // src/modular-audio/ownedInstrumentDistortionLive.js
  var integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  var OwnedInstrumentDistortionLive = class {
    constructor(e, rate, { channels = 2 } = {}) {
      if (e.distortion_live_api?.() !== 1 || !integer(rate, 8e3, 192e3) || ![1, 2].includes(channels)) throw Error("Live original Distortion ABI/rate/layout differs");
      this.e = e;
      this.rate = rate;
      this.channels = channels;
      this.handle = e.distortion_live_new(rate, channels);
      if (!this.handle) throw Error("Live original Distortion allocation refused");
      this.memory = e.memory.buffer;
      this.input = [0, 1].map((c) => new Float32Array(this.memory, e.distortion_live_input(this.handle, c), 128));
      this.output = [0, 1].map((c) => new Float32Array(this.memory, e.distortion_live_output(this.handle, c), 128));
      this.wet = [0, 1].map((c) => new Float32Array(this.memory, e.distortion_live_wet(this.handle, c), 128));
      this.scratch = new Float32Array(this.memory, e.distortion_live_scratch(this.handle), 1024);
    }
    alive() {
      if (!this.handle || this.e.memory.buffer !== this.memory) throw Error("Live original Distortion disposed/memory changed");
    }
    checked(ok, label) {
      if (!ok) throw Error("Live original Distortion " + label + " refused");
    }
    reserve(slot, generation, drive) {
      this.alive();
      if (!integer(slot, 0, 7) || !integer(generation, 1, 4294967295) || typeof drive !== "number" || !Number.isFinite(drive) || drive < 0 || drive > 30) throw Error("Invalid live original Distortion resource");
      this.checked(this.e.distortion_live_reserve(this.handle, slot, generation, drive), "reserve");
    }
    upload(slot, generation, offset, values) {
      this.alive();
      if (!integer(slot, 0, 7) || !integer(generation, 1, 4294967295) || !integer(offset, 0, 44100) || !(values instanceof Float32Array) || values.length < 1 || values.length > 1024 || values.some((x) => !Number.isFinite(x))) throw Error("Invalid live original Distortion upload");
      this.scratch.set(values);
      this.checked(this.e.distortion_live_upload(this.handle, slot, generation, offset, values.length), "upload");
    }
    seal(slot, generation) {
      this.alive();
      if (!integer(slot, 0, 7) || !integer(generation, 1, 4294967295)) throw Error("Invalid live original Distortion seal");
      this.checked(this.e.distortion_live_seal(this.handle, slot, generation), "seal");
    }
    importCurve(slot, generation, drive, curve) {
      this.alive();
      if (this.stat(12) || !(curve instanceof Float32Array) || curve.length !== 44100 || curve.some((v) => !Number.isFinite(v))) throw Error("Immutable live Distortion constructor resource required");
      this.reserve(slot, generation, drive);
      for (let offset = 0; offset < 44100; offset += 1024) this.upload(slot, generation, offset, curve.subarray(offset, Math.min(44100, offset + 1024)));
      this.seal(slot, generation);
    }
    release(slot, generation) {
      this.alive();
      if (!integer(slot, 0, 7) || !integer(generation, 1, 4294967295)) throw Error("Invalid live original Distortion release");
      this.checked(this.e.distortion_live_release(this.handle, slot, generation), "release");
    }
    service(ordinal) {
      this.alive();
      if (!integer(ordinal, 0, Number.MAX_SAFE_INTEGER)) throw Error("Invalid live original Distortion service ordinal");
      this.checked(this.e.distortion_live_service(this.handle, ordinal), "resource service");
    }
    initial(lane, value, author, seconds = author / this.rate) {
      this.alive();
      if (!integer(lane, 0, 1) || typeof value !== "number" || !Number.isFinite(value) || !Number.isSafeInteger(author) || author < 0 || author % 128 || seconds !== author / this.rate) throw Error("Invalid live original Distortion constructor clock");
      this.checked(this.e.distortion_live_initial(this.handle, lane, value, author, seconds), "initial control");
    }
    initialCurve(slot, generation, author, seconds = author / this.rate) {
      this.alive();
      if (!integer(slot, 0, 7) || !integer(generation, 1, 4294967295) || !Number.isSafeInteger(author) || author < 0 || author % 128 || seconds !== author / this.rate) throw Error("Invalid live original Distortion constructor curve clock");
      this.checked(this.e.distortion_live_initial_curve(this.handle, slot, generation, author, seconds), "initial curve");
    }
    prepare(origin, { slot = this.stat(7) < 0 ? 1 : this.stat(7), generation = 1 } = {}) {
      this.alive();
      if (!Number.isSafeInteger(origin) || origin < 0 || origin % 128 || !integer(slot, 0, 7) || !integer(generation, 1, 4294967295)) throw Error("Invalid live original Distortion prepared epoch");
      this.checked(this.e.distortion_live_prepare(this.handle, origin, slot, generation), "prepare");
    }
    sync(frame) {
      this.alive();
      if (!Number.isSafeInteger(frame) || frame < 0 || frame % 128) throw Error("Invalid live original Distortion source frame");
      this.checked(this.e.distortion_live_sync(this.handle, frame), "sync");
    }
    lane(lane, value, author, seconds = author / this.rate) {
      this.alive();
      if (!integer(lane, 0, 1) || typeof value !== "number" || !Number.isFinite(value) || !Number.isSafeInteger(author) || author < 0 || author % 128 || seconds !== author / this.rate) throw Error("Invalid live original Distortion gain clock");
      this.checked(this.e.distortion_live_lane(this.handle, lane, value, author, seconds), "gain command");
    }
    curve(slot, generation, author, seconds = author / this.rate) {
      this.alive();
      if (!integer(slot, 0, 7) || !integer(generation, 1, 4294967295) || !Number.isSafeInteger(author) || author < 0 || author % 128 || seconds !== author / this.rate) throw Error("Invalid live original Distortion install clock");
      this.checked(this.e.distortion_live_curve(this.handle, slot, generation, author, seconds), "curve command");
    }
    capacity(lane, count) {
      this.alive();
      return !!this.e.distortion_live_capacity(this.handle, lane, count);
    }
    commit() {
      this.alive();
      this.checked(this.e.distortion_live_commit(this.handle), "commit");
    }
    render(channels, { pulled = true } = {}) {
      this.alive();
      if (!integer(channels, 0, 2) || typeof pulled !== "boolean") throw Error("Invalid live original Distortion render");
      this.checked(this.e.distortion_live_render(this.handle, channels, +pulled), "render");
    }
    slot(slot) {
      this.alive();
      if (!integer(slot, 0, 7)) throw Error("Unknown live original Distortion slot");
      return Object.fromEntries(["generation", "state", "drive", "written", "references", "active"].map((key, i) => [key, this.e.distortion_live_slot(this.handle, slot, i)]));
    }
    stat(i) {
      this.alive();
      return this.e.distortion_live_stat(this.handle, i);
    }
    stats() {
      return Object.fromEntries(["frame", "peak", "calls", "renderedFrames", "unpulledFrames", "applied", "rejected", "activeSlot", "queued", "curveAssignments", "uploadedFloats", "serviceFloats", "ready", "origin", "dryTarget", "wetTarget", "dryObserved", "wetObserved"].map((key, i) => [key, this.stat(i)]));
    }
    dispose() {
      if (this.handle) {
        this.e.distortion_live_free(this.handle);
        this.handle = 0;
        this.input = this.output = this.wet = this.scratch = this.memory = null;
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

  // src/modular-audio/instrumentDistortionLiveWords.js
  var DISTORTION_WORD_OPTIONS = Object.freeze({ wordCount: 14, slots: 32, prefix: "distortion" });
  var InstrumentDistortionWordCodec = class {
    constructor() {
      this.f64 = new StampedFloat64Words();
      this.words = new Uint16Array(14);
      this.op = 0;
      this.lane = 0;
      this.value = 0;
      this.extra = 0;
      this.seconds = 0;
    }
    encode(op, lane, value, extra, seconds) {
      if (![0, 1].includes(op) || !Number.isInteger(lane) || lane < 0 || lane > 1 || typeof value !== "number" || !Number.isFinite(value) || typeof extra !== "number" || !Number.isFinite(extra) || typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || op === 0 && (!Number.isFinite(Math.fround(value)) || extra !== 0) || op === 1 && (lane !== 0 || !Number.isInteger(value) || value < 0 || value > 7 || !Number.isInteger(extra) || extra < 1 || extra > 4294967295)) throw Error("Invalid live original Distortion control schema");
      this.words[0] = op;
      this.words[1] = lane;
      this.f64.encode(value, this.words, 2);
      this.f64.encode(extra, this.words, 6);
      this.f64.encode(seconds, this.words, 10);
      return this.words;
    }
    decode(words, offset = 0) {
      if (!Number.isInteger(offset) || offset < 0 || offset + 14 > words.length) throw Error("Invalid live original Distortion word offset");
      const op = words[offset], lane = words[offset + 1], value = this.f64.decode(words, offset + 2), extra = this.f64.decode(words, offset + 6), seconds = this.f64.decode(words, offset + 10);
      this.encode(op, lane, value, extra, seconds);
      Object.assign(this, { op, lane, value, extra, seconds });
      return this;
    }
    apply(core, author) {
      if (this.seconds !== author / core.rate) throw Error("Live original Distortion seconds differ from authored epoch");
      if (this.op === 0) core.lane(this.lane, this.value, author, this.seconds);
      else core.curve(this.value, this.extra, author, this.seconds);
    }
    initial(core, author) {
      if (this.seconds !== author / core.rate) throw Error("Live original Distortion constructor seconds differ");
      if (this.op === 0) core.initial(this.lane, this.value, author, this.seconds);
      else core.initialCurve(this.value, this.extra, author, this.seconds);
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

  // src/modular-audio/instrumentDistortionLiveProcessor.js
  var InstrumentDistortionLiveProcessor = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: "terminalGate", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" }, { name: "routeTag", defaultValue: 0, minValue: 0, maxValue: 16777215, automationRate: "a-rate" }, ...nativeContextClockDescriptors(), ...stampedWordDescriptors(DISTORTION_WORD_OPTIONS)];
    }
    constructor({ processorOptions: p }) {
      super();
      this.identity = p.identity;
      this.disposeRefusals = 0;
      this.terminalGateSeen = false;
      this.terminalQuanta = 0;
      this.disposed = false;
      this.error = null;
      this.failureContext = null;
      this.pending = [];
      this.pendingQuanta = 0;
      this.preorigin = 0;
      this.future = 0;
      this.observed = 0;
      this.resourceOrdinal = 0;
      this.uploadQueue = [];
      this.uploadRequests = /* @__PURE__ */ new Set();
      this.lastResourceRequest = 0;
      this.route = null;
      this.lastRouteAck = -1;
      this.routeEvents = 0;
      this.hasPulled = false;
      this.firstPulledFrame = null;
      this.reanchors = 0;
      this.reanchorFrames = 0;
      this.channels = p.channels;
      this.reader = new StampedWordReader(DISTORTION_WORD_OPTIONS);
      this.codec = new InstrumentDistortionWordCodec();
      this.port.onmessage = ({ data }) => this.message(data);
      try {
        if (!p.identity || typeof p.identity !== "object" || Array.isArray(p.identity) || Object.keys(p.identity).length !== 3 || !["hostVersion", "kernelVersion", "ownerGeneration"].every((k) => Object.prototype.hasOwnProperty.call(p.identity, k)) || p.version !== "863cba9522906ba4" || p.identity.hostVersion !== p.version || p.identity.kernelVersion !== "0020ba74cab101ee" || !Number.isInteger(p.identity.ownerGeneration) || p.identity.ownerGeneration < 1 || p.identity.ownerGeneration > 4294967295) throw Error("Live original Distortion host identity differs");
        this.origin = p.originFrame;
        this.endFrame = p.endFrame ?? null;
        this.clock = new NativeContextClockCodec(p.clockSpec);
        if (![1, 2].includes(this.channels)) throw Error("Live original Distortion logical output layout differs");
        this.route = new PhysicalInputRouteState(this.channels);
        this.core = new OwnedInstrumentDistortionLive(new WebAssembly.Instance(p.module, {}).exports, sampleRate, { channels: this.channels });
        if (!Array.isArray(p.curves) || p.curves.length < 2 || p.curves.length > 8) throw Error("Live original Distortion constructor resource bound");
        const seen = /* @__PURE__ */ new Set();
        for (const resource of p.curves) {
          if (!resource || !Number.isInteger(resource.slot) || resource.slot < 0 || resource.slot > 7 || seen.has(resource.slot) || resource.generation !== 1 || !(resource.curve instanceof Float32Array) || resource.curve.length !== 44100) throw Error("Live original Distortion constructor resource identity differs");
          seen.add(resource.slot);
          this.core.importCurve(resource.slot, 1, resource.drive, resource.curve);
        }
        if (!Array.isArray(p.initialRows) || p.initialRows.length < 2 || p.initialRows.length > 128) throw Error("Live original Distortion initial control bound");
        let previous = 0;
        for (const row of p.initialRows) {
          if (!Array.isArray(row) || row.length !== 6 || row[0] < previous || row[0] % 128 || !Number.isSafeInteger(row[0])) throw Error("Live original Distortion initial chronology differs");
          this.codec.encode(row[1], row[2], row[3], row[4], row[5]);
          if (row[5] !== row[0] / sampleRate) throw Error("Live original Distortion initial seconds differ");
          previous = row[0];
          this.codec.decode(this.codec.words).initial(this.core, row[0]);
        }
        this.origin = Math.max(this.origin, previous);
        this.core.prepare(this.origin);
        this.port.postMessage({ kind: "ready", identity: this.identity, stats: this.snapshot() });
      } catch (error) {
        this.fail(error);
      }
    }
    snapshot() {
      return { identity: this.identity, channels: this.channels, disposeRefusals: this.disposeRefusals, observed: this.core ? { dry: this.core.stat(16), wet: this.core.stat(17) } : this.lastObserved ?? null, terminalGateSeen: this.terminalGateSeen, terminalQuanta: this.terminalQuanta, kernel: this.core?.stats() ?? this.lastStats ?? null, clock: this.clock?.snapshot() ?? null, transport: this.reader.snapshot(), resourceServiceOrdinal: this.resourceOrdinal, resourceQueued: this.uploadQueue.length, pendingQuanta: this.pendingQuanta, preoriginDeferrals: this.preorigin, futureDeferrals: this.future, route: this.route?.snapshot() ?? null, hasPulled: this.hasPulled, firstPulledFrame: this.firstPulledFrame, reanchors: this.reanchors, reanchorFrames: this.reanchorFrames, disposed: this.disposed, error: this.error, failureContext: this.failureContext };
    }
    receipt(reason) {
      if (this.disposed) return;
      this.lastStats = this.core?.stats() ?? null;
      this.lastObserved = this.core ? { dry: this.core.stat(16), wet: this.core.stat(17) } : null;
      this.disposed = true;
      let failure;
      try {
        this.core?.dispose();
      } catch (e) {
        failure = String(e);
      }
      this.core = null;
      this.uploadQueue.length = 0;
      this.uploadRequests.clear();
      this.port.postMessage({ type: "disposed", identity: this.identity, version: 1, released: true, clean: !failure, error: failure ?? null, reason, stats: this.snapshot() });
    }
    fail(error, inputs = null, parameters = null) {
      if (this.disposed) return;
      this.error = String(error);
      if (parameters) try {
        this.failureContext = { rawGlobalFrame: typeof currentFrame === "number" ? currentFrame : null, origin: this.origin, kernel: this.core?.stats(), clock: this.clock?.snapshot(), route: this.route?.snapshot(), actualInputChannels: inputs?.[0]?.length ?? null, routeCurve: parameters.routeTag ? [...parameters.routeTag] : null };
      } catch (diagnosticError) {
        this.failureContext = { diagnosticError: String(diagnosticError) };
      }
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
        const id = d.identity, expected = this.identity, valid = d && typeof d === "object" && !Array.isArray(d) && Object.keys(d).length === 2 && Object.prototype.hasOwnProperty.call(d, "kind") && Object.prototype.hasOwnProperty.call(d, "identity") && id && expected && typeof id === "object" && !Array.isArray(id) && Object.keys(id).length === Object.keys(expected).length && Object.keys(expected).every((k) => id[k] === expected[k]);
        if (!valid) {
          this.disposeRefusals = Math.min(4294967295, this.disposeRefusals + 1);
          this.port.postMessage({ kind: "dispose-refused", identity: this.identity, error: "Live original Distortion terminal request identity differs" });
          return;
        }
        this.receipt("dispose");
        return;
      }
      if (this.disposed) return;
      try {
        if (d?.kind === "native-clock-spec") {
          if (JSON.stringify(d.spec) !== JSON.stringify(this.clock.spec)) throw Error("Live original Distortion Native clock specification differs");
          return;
        }
        if (d?.kind === "native-clock-failed") {
          if (d.generation !== this.clock.spec.generation) throw Error("Live original Distortion retired generation differs");
          throw Error(d.error ?? "Live original Distortion clock generation retired");
        }
        if (!d?.identity || Array.isArray(d.identity) || Object.keys(d.identity).length !== Object.keys(this.identity).length || Object.keys(this.identity).some((k) => this.identity[k] !== d.identity[k])) throw Error("Live original Distortion control identity differs");
        if (["reserve", "chunk", "release"].includes(d.kind)) {
          this.resourceMessage(d);
          return;
        }
        if (!Number.isInteger(d.request) || d.request < 1 || d.request > 4294967295 || this.pending.length >= 16) throw Error("Live original Distortion request bound");
        if (d.kind === "stats") this.port.postMessage({ kind: "stats", identity: this.identity, request: d.request, stats: this.snapshot() });
        else if (d.kind === "flush") {
          if (!Number.isInteger(d.requiredSequence) || d.requiredSequence < 0 || d.requiredSequence > 16777215 || d.requireClock !== void 0 && typeof d.requireClock !== "boolean" || !Number.isInteger(d.requiredRouteTag) || d.requiredRouteTag < 0 || d.requiredRouteTag > 16777215) throw Error("Invalid Live original Distortion watermark/clock request");
          this.pending.push({ request: d.request, requiredSequence: d.requiredSequence, requiredRouteTag: d.requiredRouteTag, requireClock: d.requireClock === true, minimumCoreCalls: d.requireClock ? this.core.stat(2) + 1 : 0 });
          this.flush();
        } else throw Error("Unknown Live original Distortion control request");
      } catch (error) {
        this.fail(error);
      }
    }
    flush() {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        if (this.route.tag > p.requiredRouteTag) {
          this.pending.splice(i, 1);
          this.port.postMessage({ kind: "rejected", identity: this.identity, request: p.request, error: "Physical route arm intent was superseded" });
          continue;
        }
        if (this.reader.sequence >= p.requiredSequence && this.route.tag === p.requiredRouteTag && this.route.realized() && (!p.requireClock || this.clock.calls > 0 && this.core.stat(2) >= p.minimumCoreCalls)) {
          this.pending.splice(i, 1);
          const clockReceipt = p.requireClock ? { version: 1, generation: this.clock.spec.generation, requiredSequence: p.requiredSequence, minimumCoreCalls: p.minimumCoreCalls, coreCalls: this.core.stat(2), clockCalls: this.clock.calls, frame: this.clock.lastFrame, routeProof: this.route.proof() } : null;
          this.port.postMessage({ kind: "flushed", identity: this.identity, request: p.request, clockReceipt, stats: this.snapshot() });
        }
      }
    }
    wait(kind) {
      if (++this.pendingQuanta > 64) throw Error("Live original Distortion isolated clock/control readiness bound");
      if (kind === "preorigin") this.preorigin++;
      if (kind === "future") this.future++;
      return true;
    }
    readDue(parameters, frame, isolated) {
      const r = this.reader, saved = [r.sequence, r.count, r.lastAuthorFrame, r.deferredSequence, r.deferredWord, r.deferredQuanta], count = r.read(parameters);
      let future = false;
      for (let i = 0; i < count; i++) {
        const author = r.frames[i];
        this.codec.decode(r.words, i * 14);
        if (this.codec.seconds !== author / sampleRate || author < this.origin || author > frame + 8192) throw Error("Live original Distortion authored row outside current epoch");
        if (author > frame) future = true;
      }
      if (future) {
        if (!isolated) throw Error("Live original Distortion future publication while active");
        [r.sequence, r.count, r.lastAuthorFrame, r.deferredSequence, r.deferredWord, r.deferredQuanta] = saved;
        this.wait("future");
        return false;
      }
      this.core.sync(frame);
      for (let lane = 0; lane < 2; lane++) {
        let needed = 0;
        for (let i = 0; i < count; i++) {
          this.codec.decode(r.words, i * 14);
          if (this.codec.op === 0 && this.codec.lane === lane) needed++;
        }
        if (!this.core.capacity(lane, needed)) throw Error("Live original Distortion lane batch capacity");
      }
      for (let i = 0; i < count; i++) this.codec.decode(r.words, i * 14).apply(this.core, r.frames[i]);
      this.core.commit();
      if (count) {
        for (let i = 0; i < count; i++) {
          this.codec.decode(r.words, i * 14);
          if (this.codec.op === 1) this.port.postMessage({ kind: "curve-applied", identity: this.identity, sequence: r.sequence - count + i + 1, slot: this.codec.value, generation: this.codec.extra });
        }
        this.observed = r.sequence;
        this.port.postMessage({ kind: "observed", identity: this.identity, sequence: r.sequence });
      }
      return true;
    }
    resourceMessage(d) {
      if (d.kind === "reserve") {
        if (typeof d.drive !== "number") throw Error("Invalid Distortion resource drive");
        this.core.reserve(d.slot, d.generation, d.drive);
        return;
      }
      if (!Number.isInteger(d.request) || d.request < 1 || d.request > 4294967295 || d.request <= this.lastResourceRequest) throw Error("Invalid Distortion resource request");
      this.lastResourceRequest = d.request;
      if (d.kind === "release") {
        this.core.release(d.slot, d.generation);
        this.port.postMessage({ kind: "released", identity: this.identity, request: d.request, slot: d.slot, generation: d.generation });
        return;
      }
      if (this.uploadQueue.length >= 2 || this.uploadRequests.has(d.request) || !(d.data instanceof Float32Array) || d.data.length < 1 || d.data.length > 1024 || !Number.isInteger(d.slot) || d.slot < 0 || d.slot > 7 || !Number.isInteger(d.generation) || d.generation < 1 || d.generation > 4294967295 || !Number.isInteger(d.offset) || d.offset < 0 || d.offset + d.data.length > 44100) throw Error("Live Distortion chunk identity/capacity differs");
      this.uploadRequests.add(d.request);
      this.uploadQueue.push(d);
    }
    serviceResources() {
      this.core.service(this.resourceOrdinal++);
      while (this.uploadQueue.length && this.core.stat(11) + this.uploadQueue[0].data.length <= 1024) {
        const d = this.uploadQueue.shift();
        this.core.upload(d.slot, d.generation, d.offset, d.data);
        const ready = d.offset + d.data.length === 44100;
        if (ready) this.core.seal(d.slot, d.generation);
        this.uploadRequests.delete(d.request);
        this.port.postMessage({ kind: "chunk-ack", identity: this.identity, request: d.request, slot: d.slot, generation: d.generation, written: d.offset + d.data.length, ready });
      }
    }
    quiesce(parameters) {
      const gate = parameters.terminalGate;
      if (!(gate instanceof Float32Array) || ![1, 128].includes(gate.length)) throw Error("Live original Distortion terminal gate shape differs");
      let seen = this.terminalGateSeen;
      for (const value of gate) {
        if (value !== 0 && value !== 1) throw Error("Live original Distortion terminal gate must be literal Boolean");
        if (seen && value === 0) throw Error("Live original Distortion terminal gate cannot reopen");
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
        this.serviceResources();
        const input = inputs[0] ?? [], channels = input.length;
        if (channels > 2 || channels !== 0 && channels !== this.channels || out.length !== this.channels || out.some((a) => a.length !== 128)) throw Error("Live original Distortion input/output layout differs");
        this.route.observe(parameters.routeTag, channels);
        const pulled = this.route.actualPulled, isolated = channels === 0;
        const frame = this.clock.next(parameters, { allowPending: isolated });
        if (frame === null) return this.wait("clock");
        const coreFrame = this.core.stat(0);
        if (frame < coreFrame) {
          if (!isolated || coreFrame - frame > 8192 || this.core.stat(2) !== 0) throw Error("Live original Distortion clock precedes live core");
          return this.wait("preorigin");
        }
        if (frame > coreFrame && pulled && this.hasPulled && !this.route.allowReanchor) throw Error("Live original Distortion active frontier lacks a new physical reconnect permit");
        if (!this.readDue(parameters, frame, isolated)) return true;
        if (frame > coreFrame) {
          this.reanchors++;
          this.reanchorFrames += frame - coreFrame;
        }
        this.pendingQuanta = 0;
        const rawBefore = this.core.stat(3), phase = this.route.phase;
        for (let c = 0; c < channels; c++) this.core.input[c].set(input[c]);
        this.core.render(channels, { pulled });
        if (pulled) {
          if (!this.hasPulled) this.firstPulledFrame = frame;
          this.hasPulled = true;
        }
        for (let c = 0; c < this.channels; c++) out[c].set(this.core.output[c]);
        this.route.committed(frame);
        if (this.route.phase !== "active" && this.route.phase !== "off" && this.routeEvents < 32) {
          this.routeEvents++;
          this.port.postMessage({ kind: "route-transition", identity: this.identity, route: this.route.proof(), rawFramesBefore: rawBefore, rawFramesAfter: this.core.stat(3), kernelPeak: this.core.stat(1) });
        }
        if (this.route.realized() && this.lastRouteAck !== this.route.tag) {
          this.lastRouteAck = this.route.tag;
          this.port.postMessage({ kind: "route-observed", identity: this.identity, route: this.route.proof() });
        }
        this.flush();
        if (this.endFrame !== null && frame + 128 >= this.endFrame) {
          this.receipt("offline-end");
          return false;
        }
        return true;
      } catch (error) {
        this.fail(error, inputs, parameters);
        return false;
      }
    }
  };
  registerProcessor("instrument-distortion-live-863cba9522906ba4", InstrumentDistortionLiveProcessor);
})();
