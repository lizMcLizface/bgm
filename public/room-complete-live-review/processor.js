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

  // tools/liveRoomCompleteCapture.js
  var LiveRoomCompleteCapture = class {
    constructor(p, port, rate) {
      if (!Number.isSafeInteger(p.epoch) || p.epoch < 0 || p.epoch % 128 || !Number.isSafeInteger(p.frames) || p.frames < 128 || p.frames % 128 || p.frames > rate * 12 || ![1, 2].includes(p.channels)) throw Error("Live Room review capture bounds");
      this.p = p;
      this.port = port;
      this.rate = rate;
      this.frame = 0;
      this.done = false;
      this.error = null;
      this.codec = null;
      this.planes = Array.from({ length: p.channels }, () => new Float32Array(p.frames));
      this.missingInputQuanta = 0;
      port.onmessage = ({ data: d }) => {
        try {
          if (d?.kind === "native-clock-spec") {
            const s = validateNativeContextClockSpec(d.spec);
            if (s.rate !== rate || this.codec && JSON.stringify(this.codec.spec) !== JSON.stringify(s)) throw Error("Room capture clock changed");
            this.codec ??= new NativeContextClockCodec(s);
            port.postMessage({ kind: "clock-bound", spec: s });
          } else if (d?.kind === "native-clock-failed") {
            if (!this.done) throw Error(d.error);
          } else if (d?.kind === "dispose") {
            this.done = true;
            this.planes = null;
            port.postMessage({ kind: "disposed" });
          } else throw Error("Unknown Room capture control");
        } catch (e) {
          this.fail(e);
        }
      };
    }
    fail(e) {
      if (this.error || this.done) return;
      this.error = String(e);
      this.port.postMessage({ kind: "error", error: this.error, frame: this.frame, clock: this.codec?.snapshot() ?? null });
    }
    process(inputs, outputs, parameters, rawFrame) {
      for (const p of outputs[0] ?? []) p.fill(0);
      if (this.done || this.error) return true;
      try {
        if (!this.codec) return true;
        const f = this.codec.next(parameters, { allowPending: this.frame === 0 });
        if (f === null || f < this.p.epoch) return true;
        if (f - this.p.epoch !== this.frame) throw Error("Room capture missed declared source/output frame");
        const input = inputs[0] ?? [];
        if (input.length !== this.p.channels || input.some((p) => p.length !== 128)) {
          this.missingInputQuanta++;
          throw Error("Room capture logical layout differs");
        }
        for (let c = 0; c < this.p.channels; c++) for (let i = 0; i < 128; i++) {
          const x = input[c][i];
          if (!Number.isFinite(x)) throw Error("Nonfinite Room capture");
          this.planes[c][this.frame + i] = x;
        }
        this.frame += 128;
        if (this.frame === this.p.frames) {
          this.done = true;
          const planes = this.planes;
          this.planes = null;
          this.port.postMessage({ kind: "captured", channels: planes, frame: this.frame, epoch: this.p.epoch, clock: this.codec.snapshot(), rawFrame, missingInputQuanta: this.missingInputQuanta }, planes.map((p) => p.buffer));
        }
      } catch (e) {
        this.fail(e);
      }
      return true;
    }
  };

  // room-live-review-entry.js
  var ReviewCapture = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return nativeContextClockDescriptors();
    }
    constructor({ processorOptions: p }) {
      super();
      this.unit = new LiveRoomCompleteCapture(p, this.port, sampleRate);
    }
    process(a, b, c) {
      return this.unit.process(a, b, c, currentFrame);
    }
  };
  registerProcessor("complete-room-live-capture-c6511ac6c2b40bd5", ReviewCapture);
})();
