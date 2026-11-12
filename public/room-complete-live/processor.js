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

  // src/modular-audio/liveRoomCompleteProgram.js
  var LIVE_ROOM_COMPLETE_PROFILE = "live-room-complete-prepared-worker-v1";
  var roomLiveInteger = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;

  // src/modular-audio/liveRoomCompleteProtocol.js
  var ROOM_LIVE_PROTOCOL = 1;
  var hash = /^[a-f0-9]{16}$/;
  function validateLiveRoomIdentity(p) {
    if (!p || p.protocol !== ROOM_LIVE_PROTOCOL || p.profile !== LIVE_ROOM_COMPLETE_PROFILE || !hash.test(p.hostVersion) || !hash.test(p.clockVersion) || !roomLiveInteger(p.generation, 1, 4294967295) || Object.keys(p.components ?? {}).length !== 3 || ["colour", "convolver", "mix"].some((k) => !hash.test(p.components[k]))) throw Error("Complete live Room receipt identity differs");
    return p;
  }
  function sameLiveRoomIdentity(a, b) {
    try {
      validateLiveRoomIdentity(a);
      validateLiveRoomIdentity(b);
    } catch {
      return false;
    }
    return ["protocol", "profile", "hostVersion", "clockVersion", "generation"].every((k) => a[k] === b[k]) && ["colour", "convolver", "mix"].every((k) => a.components[k] === b.components[k]);
  }
  var liveRoomReceipt = (identity, kind, request = 0, extra = {}) => ({ ...identity, kind, request, ...extra });
  function validateLiveRoomRequest(p, identity, kinds) {
    if (!sameLiveRoomIdentity(p, identity) || !kinds.includes(p.kind) || !roomLiveInteger(p.request, 1, 4294967295)) throw Error("Invalid complete live Room control request");
    return p;
  }

  // src/modular-audio/liveRoomCompleteTransport.js
  var LiveRoomCompleteTransport = class {
    constructor(options, port, rate) {
      this.port = port;
      this.identity = validateLiveRoomIdentity(options.identity);
      this.g = options.geometry;
      const g = this.g;
      if (g.sampleRate !== rate || ![1, 2].includes(g.inputChannels) || ![1, 2].includes(g.outputChannels) || g.outputChannels < g.inputChannels || !roomLiveInteger(g.blockFrames, 128, 2048) || g.blockFrames % 128 || !roomLiveInteger(g.frames, 128, rate * 3600) || g.frames % 128 || !roomLiveInteger(g.earliestInputFrame, 0, g.frames - 128) || g.earliestInputFrame % 128 || !roomLiveInteger(g.latencyFrames, 2 * g.blockFrames, rate * 2) || g.latencyFrames % 128 || g.latencyFrames !== Math.max(2 * g.blockFrames, Math.ceil(rate * 0.5 / 128) * 128) || g.poolBlocks !== Math.ceil(g.latencyFrames / g.blockFrames) + 4 || g.poolBlocks > 192) throw Error("Complete live Room transport geometry differs");
      this.disposed = false;
      this.failed = null;
      this.direct = null;
      this.codec = null;
      this.clockSpec = null;
      this.epoch = null;
      this.rawFrame = null;
      this.sourceFrame = 0;
      this.outputFrame = 0;
      this.returnedFrame = 0;
      this.capture = null;
      this.captureOffset = 0;
      this.captureFrame = 0;
      this.inFlight = 0;
      this.queued = 0;
      this.drained = false;
      this.underrunFrames = 0;
      this.rejectedPackets = 0;
      this.minReadyFrames = null;
      this.highWater = 0;
      this.releaseErrors = [];
      this.free = Array.from({ length: g.poolBlocks }, () => new Float32Array(Math.max(g.inputChannels, g.outputChannels) * g.blockFrames));
      this.ready = new Array(g.poolBlocks).fill(null);
      port.onmessage = ({ data }) => this.receive(data);
      this.send("ready", 0, { geometry: g });
    }
    send(kind, request = 0, extra = {}) {
      this.port.postMessage(liveRoomReceipt(this.identity, kind, request, extra));
    }
    receive(p) {
      if (p?.kind === "native-clock-spec") {
        try {
          const spec = validateNativeContextClockSpec(p.spec);
          if (spec.rate !== this.g.sampleRate || this.clockSpec && JSON.stringify(this.clockSpec) !== JSON.stringify(spec)) throw Error("Complete live Room clock authority changed");
          if (!this.codec) {
            this.clockSpec = spec;
            this.codec = new NativeContextClockCodec(spec, { allowGaps: true });
          }
          this.send("clock-bound", 0, { clockSpec: spec });
        } catch (error) {
          this.fail(error);
        }
        return;
      }
      if (p?.kind === "native-clock-failed") {
        if (!this.clockSpec || p.generation !== this.clockSpec.generation) {
          this.fail(Error("Live Room clock retirement generation differs"));
          return;
        }
        this.fail(Error(p.error ?? "Live Room clock retired"));
        return;
      }
      try {
        validateLiveRoomRequest(p, this.identity, ["attach", "arm", "stats", "dispose"]);
        if (p.kind === "dispose") {
          this.dispose();
          this.send("disposed", p.request, { releasedOwners: true, releaseErrors: this.releaseErrors, stats: this.stats() });
          return;
        }
        if (this.disposed || this.failed) throw Error("Complete live Room transport unavailable");
        if (p.kind === "attach") {
          if (this.direct || !p.port || typeof p.port.postMessage !== "function") throw Error("Complete live Room transport port differs");
          this.direct = p.port;
          this.direct.onmessage = ({ data }) => this.packet(data);
          this.direct.start?.();
          this.send("attached", p.request);
          return;
        }
        if (p.kind === "arm") {
          if (this.epoch !== null || !this.direct || !this.codec || !roomLiveInteger(p.epoch, 0, Number.MAX_SAFE_INTEGER - this.g.frames - this.g.latencyFrames) || p.epoch % 128 || p.epoch < Math.max(this.clockSpec.epochFrame, this.codec.lastFrame ?? this.clockSpec.epochFrame) + 256) throw Error("Complete live Room future source epoch invalid");
          this.epoch = p.epoch;
          this.send("armed", p.request, { epoch: p.epoch, earliestInputFrame: p.epoch + this.g.earliestInputFrame, earliestOutputFrame: p.epoch + this.g.earliestInputFrame + this.g.latencyFrames, latencyFrames: this.g.latencyFrames });
          return;
        }
        this.send("stats", p.request, { stats: this.stats() });
      } catch (error) {
        this.fail(error);
      }
    }
    packet(p) {
      if (this.disposed || this.failed) return;
      try {
        const g = this.g;
        if (p?.kind === "error") throw Error(p.error);
        if (p?.kind !== "pcm" || p.generation !== this.identity.generation || p.frame !== this.returnedFrame || p.frames !== Math.min(g.blockFrames, g.frames - this.returnedFrame) || p.frames < 1 || !(p.buffer instanceof ArrayBuffer) || p.buffer.byteLength !== Math.max(g.inputChannels, g.outputChannels) * g.blockFrames * 4 || this.inFlight < 1) throw Error("Complete live Room return packet/frontier differs");
        const index = p.frame / g.blockFrames % g.poolBlocks;
        if (p.frame < this.outputFrame || this.ready[index]) throw Error("Complete live Room late/duplicate packet");
        const pcm = new Float32Array(p.buffer);
        for (let c = 0; c < g.outputChannels; c++) for (let i = 0; i < p.frames; i++) if (!Number.isFinite(pcm[c * g.blockFrames + i])) throw Error("Complete live Room return contains nonfinite PCM");
        this.ready[index] = { frame: p.frame, frames: p.frames, pcm };
        this.returnedFrame += p.frames;
        this.inFlight--;
        this.queued++;
        this.highWater = Math.max(this.highWater, this.queued);
      } catch (error) {
        this.rejectedPackets++;
        this.fail(error);
      }
    }
    process(inputs, outputs, parameters, rawFrame) {
      const out = outputs[0] ?? [];
      for (const c of out) c.fill(0);
      if (this.disposed) return false;
      if (this.failed || this.drained) return true;
      this.rawFrame = rawFrame;
      try {
        if (out.length !== this.g.outputChannels || out.some((c) => c.length !== 128)) throw Error("Complete live Room output layout changed");
        if (!this.codec) {
          if (this.epoch !== null) throw Error("Complete live Room lacks clock authority");
          return true;
        }
        const frame = this.codec.next(parameters, { allowPending: this.epoch === null || this.sourceFrame === 0 });
        if (frame === null) return true;
        if (this.epoch === null || frame < this.epoch) return true;
        const g = this.g;
        if (this.sourceFrame < g.frames && frame - this.epoch !== this.sourceFrame || this.outputFrame < g.frames && frame >= this.epoch + g.latencyFrames && frame - this.epoch - g.latencyFrames !== this.outputFrame) throw Error("Complete live Room clock missed an active source/output frontier");
        const input = inputs[0] ?? [];
        for (let i = 0; i < 128; i++) {
          if (this.sourceFrame < g.frames) {
            if (this.sourceFrame >= g.earliestInputFrame && input.length !== g.inputChannels) throw Error("Complete live Room known input layout ended/changed");
            if (!this.capture) {
              this.capture = this.free.pop();
              if (!this.capture) throw Error("Complete live Room input credits exhausted");
              this.captureFrame = this.sourceFrame;
              this.captureOffset = 0;
            }
            for (let c = 0; c < g.inputChannels; c++) {
              const x = input[c]?.[i] ?? 0;
              if (!Number.isFinite(x) || this.sourceFrame < g.earliestInputFrame && x !== 0) throw Error("Complete live Room nonfinite/premature source input");
              this.capture[c * g.blockFrames + this.captureOffset] = x;
            }
            this.captureOffset++;
            this.sourceFrame++;
            if (this.captureOffset === g.blockFrames || this.sourceFrame === g.frames) {
              const buffer = this.capture.buffer;
              this.inFlight++;
              this.direct.postMessage({ kind: "pcm", generation: this.identity.generation, frame: this.captureFrame, frames: this.captureOffset, buffer }, [buffer]);
              this.capture = null;
            }
          }
          if (frame + i >= this.epoch + g.latencyFrames && this.outputFrame < g.frames) {
            const index = Math.floor(this.outputFrame / g.blockFrames) % g.poolBlocks, packet = this.ready[index], offset = this.outputFrame % g.blockFrames;
            if (!packet || packet.frame + offset !== this.outputFrame) {
              this.underrunFrames++;
              throw Error("Complete live Room output underrun");
            }
            for (let c = 0; c < g.outputChannels; c++) out[c][i] = packet.pcm[c * g.blockFrames + offset];
            this.outputFrame++;
            if (offset + 1 === packet.frames) {
              this.ready[index] = null;
              this.queued--;
              this.free.push(packet.pcm);
            }
            if (this.outputFrame === g.frames) {
              if (this.sourceFrame !== g.frames || this.returnedFrame !== g.frames || this.inFlight !== 0 || this.queued !== 0) throw Error("Complete live Room drain authority differs");
              this.drained = true;
              this.send("drained", 0, { stats: this.stats() });
            }
          }
        }
        return true;
      } catch (error) {
        for (const c of out) c.fill(0);
        this.fail(error);
        return true;
      }
    }
    stats() {
      return { epoch: this.epoch, sourceFrame: this.sourceFrame, returnedFrame: this.returnedFrame, outputFrame: this.outputFrame, inFlight: this.inFlight, queued: this.queued, highWater: this.highWater, freeBuffers: this.free?.length ?? 0, underrunFrames: this.underrunFrames, rejectedPackets: this.rejectedPackets, drained: this.drained, disposed: this.disposed, failed: this.failed, clock: this.codec?.snapshot() ?? null, rawFrame: this.rawFrame };
    }
    fail(error) {
      if (this.failed || this.disposed) return;
      this.failed = String(error);
      this.send("error", 0, { error: this.failed, stats: this.stats() });
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const action of [() => this.direct?.close(), () => {
        this.free.length = 0;
        this.ready.fill(null);
        this.capture = null;
      }]) try {
        action();
      } catch (error) {
        this.releaseErrors.push(String(error));
      }
      this.direct = null;
    }
  };

  // room-live-processor-entry.js
  var CompleteRoomTransport = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return nativeContextClockDescriptors();
    }
    constructor({ processorOptions: p }) {
      super();
      try {
        this.unit = new LiveRoomCompleteTransport(p, this.port, sampleRate);
      } catch (error) {
        this.port.postMessage(liveRoomReceipt(p.identity, "error", 0, { error: String(error) }));
        this.port.onmessage = ({ data }) => {
          if (data?.kind === "dispose") this.port.postMessage(liveRoomReceipt(p.identity, "disposed", data.request, { releasedOwners: true, releaseErrors: [] }));
        };
      }
    }
    process(inputs, outputs, parameters) {
      if (!this.unit) {
        for (const c of outputs[0] ?? []) c.fill(0);
        return true;
      }
      return this.unit.process(inputs, outputs, parameters, currentFrame);
    }
  };
  registerProcessor("owned-live-complete-room-500e21b661710c7e", CompleteRoomTransport);
})();
