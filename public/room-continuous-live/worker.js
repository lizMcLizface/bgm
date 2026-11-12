(() => {
  // src/modular-audio/ownedRoomColour.js
  var ROOM_COLOUR_PROFILE = "chromium-room-colour-f32-128-target-v1";
  var ranges = { predelay: [0, 0.225], damping: [200, 2e4] };
  var keys = ["predelay", "damping"];
  var valid = (key, v) => typeof v === "number" && Number.isFinite(v) && v >= ranges[key][0] && v <= ranges[key][1];
  function validateRoomColourSpec(raw) {
    if (!raw || Object.keys(raw).some((k) => !["version", "profile", "sampleRate", "channels", "initial", "events"].includes(k)) || raw.version !== 1 || raw.profile !== ROOM_COLOUR_PROFILE || !Number.isInteger(raw.sampleRate) || raw.sampleRate < 8e3 || raw.sampleRate > 192e3 || ![1, 2].includes(raw.channels) || !raw.initial || Object.keys(raw.initial).length !== 2 || keys.some((k) => !valid(k, raw.initial[k])) || !Array.isArray(raw.events) || raw.events.length > 512) throw Error("Invalid RoomColour contract");
    let previous = -1;
    const counts = [0, 0], times = [-1, -1];
    for (const e of raw.events) {
      const i = keys.indexOf(e?.parameter);
      if (i < 0 || Object.keys(e).length !== 3 || typeof e.seconds !== "number" || !Number.isFinite(e.seconds) || e.seconds < previous || e.seconds < 0 || e.seconds * raw.sampleRate > 9007199254740864 || !valid(e.parameter, e.value) || times[i] >= e.seconds && e.seconds !== 0 || ++counts[i] > 255) throw Error("Invalid RoomColour captured control");
      previous = e.seconds;
      times[i] = e.seconds;
    }
    return raw;
  }
  function roomColourSpec(sampleRate, { channels = 2, predelay = 0.025, damping = 6e3, events = [] } = {}) {
    return validateRoomColourSpec({ version: 1, profile: ROOM_COLOUR_PROFILE, sampleRate, channels, initial: { predelay, damping }, events: events.map((e) => ({ ...e })) });
  }
  var saveRoomColourSpec = (spec) => JSON.stringify(validateRoomColourSpec(spec)) + "\n";
  var loadRoomColourSpec = (text) => validateRoomColourSpec(JSON.parse(text));
  var OwnedRoomColour = class {
    constructor(engine, spec) {
      this.e = engine;
      const c = loadRoomColourSpec(saveRoomColourSpec(spec));
      for (const e of c.events) Object.freeze(e);
      Object.freeze(c.initial);
      Object.freeze(c.events);
      this.spec = Object.freeze(c);
      this.currentTargets = { ...c.initial };
      if (engine.room_colour_api() !== 1) throw Error("RoomColour ABI mismatch");
      this.handle = engine.room_colour_new(c.sampleRate, c.channels);
      if (!this.handle) throw Error("RoomColour preparation failed");
      try {
        keys.forEach((k, i) => this.check(engine.room_colour_initial(this.handle, i, c.initial[k])));
        for (const e of c.events) this.check(engine.room_colour_event(this.handle, keys.indexOf(e.parameter), e.seconds, e.value));
        this.check(engine.room_colour_prepare(this.handle));
        this.refresh();
      } catch (e) {
        this.dispose();
        throw e;
      }
    }
    check(ok) {
      if (!ok) throw Error("RoomColour operation rejected");
    }
    alive() {
      if (!this.handle) throw Error("RoomColour disposed");
    }
    refresh() {
      this.alive();
      this.memory = this.e.memory.buffer;
      this.input = Array.from({ length: this.spec.channels }, (_, c) => new Float32Array(this.memory, this.e.room_colour_input(this.handle, c), 2048));
      this.output = Array.from({ length: this.spec.channels }, (_, c) => new Float32Array(this.memory, this.e.room_colour_output(this.handle, c), 2048));
      this.controls = [0, 1].map((c) => new Float32Array(this.memory, this.e.room_colour_controls(this.handle, c), 128));
    }
    render(n) {
      this.alive();
      if (!Number.isInteger(n) || n < 0 || n > 2048) throw Error("RoomColour render bounds");
      if (this.memory !== this.e.memory.buffer) throw Error("RoomColour memory changed; refresh outside render");
      this.check(this.e.room_colour_render(this.handle, n));
    }
    schedule(parameter, seconds, value) {
      this.alive();
      const i = keys.indexOf(parameter);
      if (i < 0 || typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || seconds * this.spec.sampleRate > 9007199254740864 || !valid(parameter, value)) throw Error("Invalid RoomColour live control");
      this.check(this.e.room_colour_schedule(this.handle, i, seconds, value));
      this.currentTargets[parameter] = value;
    }
    reset() {
      this.alive();
      this.e.room_colour_reset(this.handle);
      this.currentTargets = { ...this.spec.initial };
    }
    stats() {
      this.alive();
      return Object.fromEntries(["frame", "peak", "channels", "rejected", "generatedUntil", "prepared"].map((key, i) => [key, this.e.room_colour_stat(this.handle, i)]));
    }
    // Captured-spec replay and saved current UI targets are intentionally distinct.
    capturedSnapshot() {
      this.alive();
      return loadRoomColourSpec(saveRoomColourSpec(this.spec));
    }
    settingsSnapshot() {
      this.alive();
      return roomColourSpec(this.spec.sampleRate, { channels: this.spec.channels, ...this.currentTargets });
    }
    dispose() {
      if (this.handle) {
        this.e.room_colour_free(this.handle);
        this.handle = 0;
        this.input = this.output = this.controls = this.memory = null;
      }
    }
  };

  // src/modular-audio/ownedRoomColourActivity.js
  var ROOM_COLOUR_ACTIVITY_PROFILE = "chromium-room-colour-authored-activity-f32-128-v2";
  var fields = ["version", "profile", "sampleRate", "channels", "initial", "events", "activity", "clock", "outputRouting"];
  var exact = (p, keys3) => p && Object.keys(p).length === keys3.length && keys3.every((k) => Object.hasOwn(p, k));
  var modes = ["audio", "params-only"];
  var base = (p) => ({ version: 1, profile: ROOM_COLOUR_PROFILE, sampleRate: p.sampleRate, channels: p.channels, initial: p.initial, events: p.events });
  function validateRoomColourActivityEvent(e, channels) {
    if (!exact(e, ["frame", "inputChannels", "delayProcessing", "filterProcessing"]) || !Number.isSafeInteger(e.frame) || e.frame < 0 || e.frame > 9007199254740864 || e.frame % 128 || !Number.isInteger(e.inputChannels) || e.inputChannels < 0 || e.inputChannels > channels || !modes.includes(e.delayProcessing) || !modes.includes(e.filterProcessing)) throw Error("Invalid authored RoomColour activity event");
    return e;
  }
  function validateRoomColourActivitySpec(p) {
    if (!exact(p, fields) || p.version !== 2 || p.profile !== ROOM_COLOUR_ACTIVITY_PROFILE || p.outputRouting !== "fixed-speaker" || !exact(p.clock, ["kind", "originFrame", "quantumFrames"]) || p.clock.kind !== "source-local" || p.clock.originFrame !== 0 || p.clock.quantumFrames !== 128 || !Array.isArray(p.activity) || p.activity.length > 256) throw Error("Invalid authored RoomColour activity contract");
    validateRoomColourSpec(base(p));
    let prior = -1;
    for (const e of p.activity) {
      validateRoomColourActivityEvent(e, p.channels);
      if (e.frame <= prior) throw Error("RoomColour activity clock must strictly increase");
      prior = e.frame;
    }
    return p;
  }
  function roomColourActivitySpec(rate, { channels = 2, predelay = 0.025, damping = 6e3, events = [], activity = [] } = {}) {
    return validateRoomColourActivitySpec({ ...roomColourSpec(rate, { channels, predelay, damping, events }), version: 2, profile: ROOM_COLOUR_ACTIVITY_PROFILE, clock: { kind: "source-local", originFrame: 0, quantumFrames: 128 }, outputRouting: "fixed-speaker", activity: activity.map((e) => ({ ...e })) });
  }
  var saveRoomColourActivitySpec = (p) => JSON.stringify(validateRoomColourActivitySpec(p)) + "\n";
  var loadRoomColourActivitySpec = (text) => validateRoomColourActivitySpec(JSON.parse(text));
  var OwnedRoomColourActivity = class extends OwnedRoomColour {
    constructor(engine, raw) {
      const captured = loadRoomColourActivitySpec(saveRoomColourActivitySpec(raw));
      if (typeof engine.room_colour_activity !== "function") throw Error("RoomColour activity ABI missing");
      super(engine, base(captured));
      this.spec = Object.freeze({ ...captured, initial: this.spec.initial, events: this.spec.events, clock: Object.freeze(captured.clock), activity: Object.freeze(captured.activity.map(Object.freeze)) });
      try {
        for (const e of this.spec.activity) this.setActivity(e);
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    setActivity(e) {
      this.alive();
      validateRoomColourActivityEvent(e, this.spec.channels);
      this.check(this.e.room_colour_activity(this.handle, e.frame, e.inputChannels, modes.indexOf(e.delayProcessing), modes.indexOf(e.filterProcessing)));
    }
    reset() {
      super.reset();
      for (const e of this.spec.activity) this.setActivity(e);
    }
    stats() {
      const p = super.stats(), stat = (i) => this.e.room_colour_stat(this.handle, i);
      return { ...p, sourceChannels: stat(6), logicalChannels: stat(7), delayProcessing: modes[stat(8)], filterProcessing: modes[stat(9)], activityApplied: stat(10), activityPending: stat(11), maxChannels: stat(12), outputRouting: "fixed-speaker" };
    }
    capturedSnapshot() {
      this.alive();
      return loadRoomColourActivitySpec(saveRoomColourActivitySpec(this.spec));
    }
    settingsSnapshot() {
      this.alive();
      const state = this.stats();
      return roomColourActivitySpec(this.spec.sampleRate, { channels: this.spec.channels, ...this.currentTargets, activity: [{ frame: 0, inputChannels: state.sourceChannels, delayProcessing: state.delayProcessing, filterProcessing: state.filterProcessing }] });
    }
  };

  // src/modular-audio/ownedRoomColourFramed.js
  var ROOM_COLOUR_FRAMED_PROFILE = "chromium-room-colour-authored-activity-framed-f32-128-v3";
  var fields2 = ["version", "profile", "sampleRate", "channels", "initial", "events", "activity", "clock", "outputRouting"];
  var exact2 = (p, keys3) => p && Object.keys(p).length === keys3.length && keys3.every((k) => Object.hasOwn(p, k));
  function nativeShape(p) {
    return roomColourActivitySpec(p.sampleRate, { channels: p.channels, ...p.initial, activity: p.activity, events: p.events.map((e) => ({ parameter: e.parameter, seconds: e.frame / p.sampleRate, value: e.value })) });
  }
  function validateRoomColourFramedSpec(p) {
    if (!exact2(p, fields2) || !Number.isInteger(p.sampleRate) || p.sampleRate < 8e3 || p.sampleRate > 192e3 || ![1, 2].includes(p.channels) || !exact2(p.initial, ["predelay", "damping"]) || ["predelay", "damping"].some((k) => typeof p.initial[k] !== "number" || !Number.isFinite(p.initial[k])) || !Array.isArray(p.activity) || p.version !== 3 || p.profile !== ROOM_COLOUR_FRAMED_PROFILE || !exact2(p.clock, ["kind", "originFrame", "quantumFrames"]) || p.clock.kind !== "source-local-integer-frames" || p.clock.originFrame !== 0 || p.clock.quantumFrames !== 128 || p.outputRouting !== "fixed-speaker" || !Array.isArray(p.events)) throw Error("Invalid integer-framed RoomColour contract");
    for (const e of p.events) if (!exact2(e, ["parameter", "frame", "value"]) || !Number.isSafeInteger(e.frame) || e.frame < 0 || e.frame > p.sampleRate * 3600 || e.frame % 128) throw Error("Invalid integer-framed RoomColour event");
    nativeShape(p);
    if (p.activity.some((e) => e.frame > p.sampleRate * 3600)) throw Error("Framed RoomColour activity exceeds one-hour clock");
    return p;
  }
  function roomColourFramedSpec(rate, { channels = 2, predelay = 0.025, damping = 6e3, events = [], activity = [] } = {}) {
    return validateRoomColourFramedSpec({ version: 3, profile: ROOM_COLOUR_FRAMED_PROFILE, sampleRate: rate, channels, initial: { predelay, damping }, events: events.map((e) => ({ ...e })), activity: activity.map((e) => ({ ...e })), clock: { kind: "source-local-integer-frames", originFrame: 0, quantumFrames: 128 }, outputRouting: "fixed-speaker" });
  }
  var saveRoomColourFramedSpec = (p) => JSON.stringify(validateRoomColourFramedSpec(p)) + "\n";
  var loadRoomColourFramedSpec = (text) => validateRoomColourFramedSpec(JSON.parse(text));
  var freeze = (p) => {
    if (p && typeof p === "object" && !Object.isFrozen(p)) {
      for (const v of Object.values(p)) freeze(v);
      Object.freeze(p);
    }
    return p;
  };
  var OwnedRoomColourFramed = class extends OwnedRoomColourActivity {
    constructor(engine, raw) {
      const p = loadRoomColourFramedSpec(saveRoomColourFramedSpec(raw));
      if (["room_colour_framed_new", "room_colour_framed_event", "room_colour_framed_schedule"].some((k) => typeof engine[k] !== "function")) throw Error("Framed RoomColour ABI missing");
      const facade = Object.create(engine);
      Object.defineProperties(facade, { room_colour_new: { value: (rate, channels) => engine.room_colour_framed_new(rate, channels) }, room_colour_event: { value: (handle, index, seconds, value) => engine.room_colour_framed_event(handle, index, Math.round(seconds * p.sampleRate), value) } });
      super(facade, nativeShape(p));
      this.spec = freeze(p);
    }
    schedule() {
      throw Error("Framed RoomColour requires scheduleFrame; native seconds are a separate contract");
    }
    scheduleFrame(parameter, frame, value) {
      this.alive();
      const index = ["predelay", "damping"].indexOf(parameter);
      if (index < 0 || !Number.isSafeInteger(frame) || frame < 0 || frame > this.spec.sampleRate * 3600 || frame % 128 || typeof value !== "number" || !Number.isFinite(value) || parameter === "predelay" && (value < 0 || value > 0.225) || parameter === "damping" && (value < 200 || value > 2e4)) throw Error("Invalid framed RoomColour live control");
      this.check(this.e.room_colour_framed_schedule(this.handle, index, frame, value));
      this.currentTargets[parameter] = value;
    }
    stats() {
      return { ...super.stats(), framed: !!this.e.room_colour_stat(this.handle, 13), clock: this.spec.clock, profile: ROOM_COLOUR_FRAMED_PROFILE };
    }
    capturedSnapshot() {
      this.alive();
      return loadRoomColourFramedSpec(saveRoomColourFramedSpec(this.spec));
    }
    settingsSnapshot() {
      this.alive();
      const state = this.stats();
      return roomColourFramedSpec(this.spec.sampleRate, { channels: this.spec.channels, ...this.currentTargets, activity: [{ frame: 0, inputChannels: state.sourceChannels, delayProcessing: state.delayProcessing, filterProcessing: state.filterProcessing }] });
    }
  };

  // src/modular-audio/ownedConvolver.js
  var CONVOLVER_MAX_IR = 327680;
  var CONVOLVER_LONG_MAX_IR = 2097152;
  var CONVOLVER_LONG_PROFILE = "static-f64-half-spectrum-nonuniform-128-65536-v2";
  var CONVOLVER_PROFILE = "static-f64-nonuniform-128-8192-v1";
  var integer = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  var fields3 = ["version", "sampleRate", "inputChannels", "irSampleRate", "normalize", "ir"];
  function validateOwnedConvolverSpec(spec) {
    const long = spec?.version === 2 && spec.profile === CONVOLVER_LONG_PROFILE, keys3 = long ? [...fields3, "profile"] : fields3;
    if (!spec || Object.keys(spec).length !== keys3.length || !keys3.every((k) => Object.hasOwn(spec, k)) || !(spec.version === 1 || long) || !integer(spec.sampleRate, 8e3, 192e3) || spec.irSampleRate !== spec.sampleRate || !integer(spec.inputChannels, 1, 2) || spec.normalize !== false || !Array.isArray(spec.ir) || !integer(spec.ir.length, 1, 2)) throw Error("Unsupported static convolver contract");
    const length = spec.ir[0]?.length;
    if (!integer(length, 1, long ? CONVOLVER_LONG_MAX_IR : CONVOLVER_MAX_IR) || !spec.ir.every((ch) => (Array.isArray(ch) || ch instanceof Float32Array) && ch.length === length && Array.prototype.every.call(ch, (v) => typeof v === "number" && Number.isFinite(v) && Number.isFinite(Math.fround(v))))) throw Error("Invalid static convolver impulse");
    return spec;
  }
  function saveOwnedConvolverSpec(spec) {
    validateOwnedConvolverSpec(spec);
    return JSON.stringify({ ...spec, ir: spec.ir.map((ch) => Array.from(ch, Math.fround)) }) + "\n";
  }
  var loadOwnedConvolverSpec = (text) => validateOwnedConvolverSpec(JSON.parse(text));
  var OwnedConvolver = class {
    constructor(engine, spec) {
      this.e = engine;
      validateOwnedConvolverSpec(spec);
      this.spec = { ...spec, ir: spec.ir.map((ch) => Array.from(ch, Math.fround)) };
      this.spec.ir.forEach(Object.freeze);
      Object.freeze(this.spec.ir);
      Object.freeze(this.spec);
      this.executionPolicy = "worker-only; offline reference permitted";
      if (engine.convolver_api() !== 1) throw Error("Static convolver ABI mismatch");
      const p = this.spec;
      const create = p.version === 2 ? engine.convolver_new_long : engine.convolver_new;
      if (typeof create !== "function") throw Error("Convolver profile ABI missing");
      this.handle = create(p.sampleRate, p.inputChannels, p.ir.length, p.ir[0].length);
      if (!this.handle) throw Error("Static convolver creation rejected");
      try {
        for (let ch = 0; ch < p.ir.length; ch++) new Float32Array(engine.memory.buffer, engine.convolver_ir(this.handle, ch), p.ir[ch].length).set(p.ir[ch]);
        if (!engine.convolver_prepare(this.handle)) throw Error("Static convolver preparation rejected");
        this.refresh();
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    alive() {
      if (!this.handle) throw Error("Static convolver disposed");
    }
    refresh() {
      this.alive();
      this.memory = this.e.memory.buffer;
      this.input = Array.from({ length: this.spec.inputChannels }, (_, ch) => new Float32Array(this.memory, this.e.convolver_input(this.handle, ch), 2048));
      this.stereoInput = [0, 1].map((ch) => new Float32Array(this.memory, this.e.convolver_input(this.handle, ch), 2048));
      this.output = Array.from({ length: Math.max(this.spec.inputChannels, this.spec.ir.length) }, (_, ch) => new Float32Array(this.memory, this.e.convolver_output(this.handle, ch), 2048));
      [this.left, this.right] = this.output;
    }
    render(frames) {
      this.alive();
      if (!integer(frames, 0, 2048)) throw Error("Invalid static convolver render bounds");
      if (this.memory !== this.e.memory.buffer) throw Error("Static convolver memory grew; refresh outside render");
      if (!this.e.convolver_render(this.handle, frames)) throw Error("Static convolver render rejected");
    }
    renderStereoToMono(frames) {
      this.alive();
      if (this.spec.inputChannels !== 1 || !integer(frames, 0, 2048)) throw Error("Invalid explicit stereo-to-mono render bounds");
      if (this.memory !== this.e.memory.buffer) throw Error("Static convolver memory grew; refresh outside render");
      if (typeof this.e.convolver_render_stereo_to_mono !== "function" || !this.e.convolver_render_stereo_to_mono(this.handle, frames)) throw Error("Explicit stereo-to-mono render rejected");
    }
    reset() {
      this.alive();
      this.e.convolver_reset(this.handle);
    }
    stats() {
      this.alive();
      return Object.fromEntries(["frame", "peak", "latencyFrames", "irFrames", "inputChannels", "irChannels", "outputChannels", "ownedBytes", "groups", "maxFFTSize", "forwardFFTs", "inverseFFTs", "rejectedInputs", "sampleRate", "prepared", "longProfile", "tailBlockFrames", "spectralPartitions"].map((key, index) => [key, this.e.convolver_stat(this.handle, index)]));
    }
    snapshot() {
      this.alive();
      return loadOwnedConvolverSpec(saveOwnedConvolverSpec(this.spec));
    }
    dispose() {
      if (this.handle) {
        this.e.convolver_free(this.handle);
        this.handle = 0;
        this.input = this.stereoInput = this.output = this.left = this.right = this.memory = null;
      }
    }
  };

  // src/modular-audio/ownedRoomConvolver.js
  var ROOM_CONVOLUTION_PROFILE = "owned-room-colour-convolution-source-local-v1";
  var ROOM_STEREO_DOWNMIX = "chromium-ordered-speaker-stereo-to-mono-v1";
  var fields4 = ["version", "profile", "clock", "routing", "colour", "convolver", "identities"];
  var canonical = (p) => p && typeof p === "object" ? Array.isArray(p) ? p.map(canonical) : Object.fromEntries(Object.keys(p).sort().map((k) => [k, canonical(p[k])])) : p;
  var same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  var clone = (p) => JSON.parse(JSON.stringify(p));
  var exact3 = (p, keys3) => p && Object.keys(p).length === keys3.length && keys3.every((k) => Object.hasOwn(p, k));
  function identity(p, kind) {
    if (!p || p.api !== 1 || p.audited !== false || typeof p.version !== "string" || !/^[0-9a-f]{16}$/.test(p.version) || typeof p.wasm !== "string" || !/^[0-9a-f]{64}$/.test(p.wasm) || typeof p.source !== "string" || !/^[0-9a-f]{64}$/.test(p.source) || !Number.isInteger(p.bytes) || p.bytes < 1 || p.profile !== (kind === "colour" ? ROOM_COLOUR_PROFILE : CONVOLVER_PROFILE)) throw Error("Invalid complete room kernel identity");
    return p;
  }
  function validateRoomConvolutionSpec(p) {
    if (!exact3(p, fields4) || p.version !== 1 || p.profile !== ROOM_CONVOLUTION_PROFILE || !exact3(p.clock, ["kind", "originFrame", "quantumFrames", "liveContextImport"]) || p.clock.kind !== "captured-source-local-seconds" || p.clock.originFrame !== 0 || p.clock.quantumFrames !== 128 || p.clock.liveContextImport !== false || !["matching", ROOM_STEREO_DOWNMIX].includes(p.routing) || !exact3(p.identities, ["convolver", "colour"])) throw Error("Invalid complete room convolution contract");
    validateOwnedConvolverSpec(p.convolver);
    identity(p.identities.convolver, "convolver");
    if (p.convolver.version === 2 && !p.identities.convolver.profiles?.includes(CONVOLVER_LONG_PROFILE)) throw Error("Long room kernel profile identity mismatch");
    if (p.colour !== null) {
      (p.colour.version === 3 ? validateRoomColourFramedSpec : p.colour.version === 2 ? validateRoomColourActivitySpec : validateRoomColourSpec)(p.colour);
      if (p.colour.version === 2 && p.identities.colour?.activityProfile !== ROOM_COLOUR_ACTIVITY_PROFILE) throw Error("Room activity profile identity mismatch");
      if (p.colour.version === 3 && p.identities.colour?.framedProfile !== ROOM_COLOUR_FRAMED_PROFILE) throw Error("Room framed profile identity mismatch");
      identity(p.identities.colour, "colour");
      if (p.colour.sampleRate !== p.convolver.sampleRate) throw Error("Room kernel sample-rate mismatch");
    } else if (p.identities.colour !== null) throw Error("Unexpected room colour identity");
    const source = p.colour?.channels ?? (p.routing === ROOM_STEREO_DOWNMIX ? 2 : p.convolver.inputChannels);
    if (p.routing === "matching" && source !== p.convolver.inputChannels || p.routing === ROOM_STEREO_DOWNMIX && (source !== 2 || p.convolver.inputChannels !== 1)) throw Error("Explicit room source routing mismatch");
    return p;
  }
  var saveRoomConvolutionSpec = (p) => JSON.stringify(validateRoomConvolutionSpec(p)) + "\n";
  var loadRoomConvolutionSpec = (text) => validateRoomConvolutionSpec(JSON.parse(text));
  var freeze2 = (p) => {
    if (p && typeof p === "object" && !Object.isFrozen(p)) {
      for (const x of Object.values(p)) freeze2(x);
      Object.freeze(p);
    }
    return p;
  };
  function validateRoomConvolutionAssets(assets, raw) {
    validateRoomConvolutionSpec(raw);
    if (!(assets?.convolver?.module instanceof WebAssembly.Module) || !same(assets.convolver.manifest, raw.identities.convolver) || raw.colour !== null && (!(assets?.colour?.module instanceof WebAssembly.Module) || !same(assets.colour.manifest, raw.identities.colour))) throw Error("Room assets do not match complete captured identities");
    return assets;
  }
  var OwnedRoomConvolver = class {
    constructor(assets, raw) {
      validateRoomConvolutionAssets(assets, raw);
      this.convolver = null;
      this.colour = null;
      this.frame = 0;
      this.failed = false;
      try {
        this.convolver = new OwnedConvolver(new WebAssembly.Instance(assets.convolver.module, {}).exports, raw.convolver);
        if (raw.colour !== null) this.colour = new (raw.colour.version === 3 ? OwnedRoomColourFramed : raw.colour.version === 2 ? OwnedRoomColourActivity : OwnedRoomColour)(new WebAssembly.Instance(assets.colour.module, {}).exports, raw.colour);
        this.spec = freeze2({ ...raw, clock: clone(raw.clock), identities: clone(raw.identities), colour: this.colour?.spec ?? null, convolver: this.convolver.spec });
        this.input = this.colour?.input ?? (raw.routing === ROOM_STEREO_DOWNMIX ? this.convolver.stereoInput : this.convolver.input);
        this.output = this.convolver.output;
        this.e = this.convolver.e;
        this.handle = true;
        this.memory = [this.convolver.e.memory.buffer, this.colour?.e.memory.buffer ?? null];
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    alive() {
      if (!this.handle) throw Error("Room convolution disposed");
      if (this.failed) throw Error("Room convolution failed; reset or reconstruct before replay");
    }
    render(n) {
      this.alive();
      if (!Number.isInteger(n) || n < 0 || n > 2048 || !Number.isSafeInteger(this.frame + n) || this.frame + n > Number.MAX_SAFE_INTEGER - 128) throw Error("Room convolution render bounds");
      if (this.convolver.e.memory.buffer !== this.memory[0] || this.colour && this.colour.e.memory.buffer !== this.memory[1]) throw Error("Room convolution memory grew outside its owner");
      if (this.input.some((p) => p.subarray(0, n).some((v) => !Number.isFinite(v)))) throw Error("Nonfinite room convolution input");
      try {
        if (this.colour) this.colour.render(n);
        const source = this.colour?.output;
        if (this.spec.routing === ROOM_STEREO_DOWNMIX) {
          if (source) for (let c = 0; c < 2; c++) this.convolver.stereoInput[c].set(source[c].subarray(0, n));
          this.convolver.renderStereoToMono(n);
        } else {
          if (source) for (let c = 0; c < this.convolver.input.length; c++) this.convolver.input[c].set(source[c].subarray(0, n));
          this.convolver.render(n);
        }
        for (const channel of this.output) for (let i = 0; i < n; i++) if (!Number.isFinite(channel[i])) throw Error("Nonfinite room convolution output; stopped before publication");
        this.frame += n;
      } catch (error) {
        this.failed = true;
        throw error;
      }
    }
    reset() {
      if (!this.handle) throw Error("Room convolution disposed");
      this.colour?.reset();
      this.convolver.reset();
      this.frame = 0;
      this.failed = false;
    }
    memoryBytes() {
      return this.convolver.e.memory.buffer.byteLength + (this.colour?.e.memory.buffer.byteLength ?? 0);
    }
    stats() {
      this.alive();
      return { ...this.convolver.stats(), sourceChannels: this.input.length, colour: this.colour?.stats() ?? null, routing: this.spec.routing, compositionProfile: ROOM_CONVOLUTION_PROFILE, memoryBytesTotal: this.memoryBytes() };
    }
    snapshot() {
      this.alive();
      return loadRoomConvolutionSpec(saveRoomConvolutionSpec(this.spec));
    }
    dispose() {
      this.colour?.dispose();
      this.convolver?.dispose();
      this.handle = false;
      this.input = this.output = this.memory = null;
    }
  };

  // src/modular-audio/roomContinuousSpec.js
  var ROOM_CONTINUOUS_PROFILE = "owned-private-room-continuous-immutable-ir-v1";
  var roomContinuousCap = (rate) => Math.floor(rate * 3600 / 128) * 128;
  var keys2 = ["version", "profile", "room", "blockFrames", "latencyFrames", "maxSessionFrames"];
  function validateRoomContinuousSpec(p) {
    if (!p || Object.keys(p).length !== keys2.length || !keys2.every((k) => Object.hasOwn(p, k)) || p.version !== 1 || p.profile !== ROOM_CONTINUOUS_PROFILE) throw Error("Invalid continuous Room contract");
    validateRoomConvolutionSpec(p.room);
    const rate = p.room.convolver.sampleRate, c = p.room.colour;
    if (c?.version !== 3 || c.events.length || c.activity.length !== 1 || c.activity[0].frame !== 0 || c.activity[0].inputChannels !== c.channels || c.activity[0].delayProcessing !== "audio" || c.activity[0].filterProcessing !== "audio") throw Error("Continuous Room requires immutable fully-processing framed colour");
    if (!Number.isInteger(p.blockFrames) || p.blockFrames < 128 || p.blockFrames > 2048 || p.blockFrames % 128 || !Number.isSafeInteger(p.maxSessionFrames) || p.maxSessionFrames < 128 || p.maxSessionFrames % 128 || p.maxSessionFrames > roomContinuousCap(rate)) throw Error("Continuous Room canonical session bound differs");
    if (p.latencyFrames !== Math.max(2 * p.blockFrames, Math.ceil(rate * 0.5 / 128) * 128)) throw Error("Continuous Room exact single latency differs");
    if (Math.ceil(p.latencyFrames / p.blockFrames) + 4 > 192) throw Error("Continuous Room PCM credit bound exceeds192");
    return p;
  }
  function roomContinuousGeometry(p) {
    validateRoomContinuousSpec(p);
    const inputChannels = p.room.colour.channels, wetChannels = Math.max(p.room.convolver.inputChannels, p.room.convolver.ir.length), packetPlanes = inputChannels + wetChannels, poolBlocks = Math.ceil(p.latencyFrames / p.blockFrames) + 4, inputPcmBytes = poolBlocks * inputChannels * p.blockFrames * 4, wetPcmBytes = poolBlocks * wetChannels * p.blockFrames * 4;
    return Object.freeze({ sampleRate: p.room.convolver.sampleRate, inputChannels, wetChannels, outputChannels: Math.max(inputChannels, wetChannels), packetPlanes, poolBlocks, blockFrames: p.blockFrames, maxSessionFrames: p.maxSessionFrames, latencyFrames: p.latencyFrames, inputPcmBytes, wetPcmBytes, poolBytes: inputPcmBytes + wetPcmBytes });
  }

  // src/modular-audio/roomContinuousWorker.js
  var RoomContinuousWorker = class {
    constructor(p, post) {
      this.identity = p.identity;
      this.post = post;
      this.unit = null;
      this.direct = null;
      this.disposed = false;
      this.error = null;
      this.frame = 0;
      this.blocks = 0;
      this.finalPacketEnd = null;
      this.sealed = false;
      this.maxRenderMs = 0;
      this.totalRenderMs = 0;
      this.releaseErrors = [];
      try {
        this.g = roomContinuousGeometry(p.program);
        validateRoomConvolutionAssets(p.assets, p.program.room);
        if (p.identity?.clockVersion !== "7a0838a735108706" || !Number.isInteger(p.identity.ownerGeneration) || p.identity.ownerGeneration < 1 || p.assets.colour.manifest.version !== p.identity.components?.colour || p.assets.convolver.manifest.version !== p.identity.components?.convolver) throw Error("Continuous Room Worker identity differs");
        this.unit = new OwnedRoomConvolver(p.assets, p.program.room);
        this.emit({ kind: "ready", geometry: this.g, stats: this.stats() });
      } catch (e) {
        this.fail(e);
      }
    }
    emit(d) {
      this.post({ ...d, identity: this.identity });
    }
    receive(d) {
      if (d?.kind === "dispose") {
        this.dispose();
        this.emit({ kind: "disposed", request: d.request, releasedOwners: !this.unit && !this.direct, releaseErrors: this.releaseErrors });
        return;
      }
      try {
        if (this.disposed || this.error) throw Error("Continuous Room Worker unavailable");
        if (!Number.isInteger(d?.request) || d.request < 1 || d.request > 4294967295) throw Error("Continuous Room Worker request differs");
        if (d.kind === "attach") {
          if (this.direct || !d.port) throw Error("Continuous Room direct port differs");
          this.direct = d.port;
          this.direct.onmessage = ({ data }) => this.pcm(data);
          this.direct.start?.();
          this.emit({ kind: "attached", request: d.request });
        } else if (d.kind === "stats") this.emit({ kind: "stats", request: d.request, stats: this.stats() });
        else throw Error("Continuous Room has immutable colour/IR; unknown Worker command");
      } catch (e) {
        this.fail(e);
      }
    }
    pcm(p) {
      try {
        const g = this.g;
        if (this.disposed || this.error || !this.unit || !this.direct || p?.generation !== this.identity.ownerGeneration || this.sealed) throw Error("Continuous Room PCM owner unavailable");
        if (p.kind === "end") {
          if (this.finalPacketEnd === null || p.frame !== this.frame || p.frame !== this.finalPacketEnd || p.frame < 128 || p.frame > g.maxSessionFrames) throw Error("Continuous Room ordered END differs");
          this.sealed = true;
          this.direct.postMessage({ kind: "sealed", generation: this.identity.ownerGeneration, frame: this.frame });
          this.emit({ kind: "processed", stats: this.stats(), scope: "Explicit final input frontier sealed; audible output drain is separate" });
          return;
        }
        if (p.kind !== "pcm" || this.finalPacketEnd !== null || p.frame !== this.frame || p.frame % g.blockFrames || !Number.isInteger(p.frames) || p.frames < 128 || p.frames > g.blockFrames || p.frames % 128 || typeof p.final !== "boolean" || p.frames !== g.blockFrames && !p.final || p.frame + p.frames > g.maxSessionFrames || !(p.buffer instanceof ArrayBuffer) || p.buffer.byteLength !== g.packetPlanes * g.blockFrames * 4) throw Error("Continuous Room PCM frontier/layout differs");
        const pcm = new Float32Array(p.buffer);
        for (let c = 0; c < g.inputChannels; c++) for (let i = 0; i < p.frames; i++) {
          const x = pcm[c * g.blockFrames + i];
          if (!Number.isFinite(x)) throw Error("Nonfinite continuous Room source");
          this.unit.input[c][i] = x;
        }
        const begin = performance.now();
        this.unit.render(p.frames);
        const ms = performance.now() - begin;
        this.maxRenderMs = Math.max(this.maxRenderMs, ms);
        this.totalRenderMs += ms;
        for (let c = 0; c < g.wetChannels; c++) for (let i = 0; i < p.frames; i++) {
          const x = this.unit.output[c][i];
          if (!Number.isFinite(x)) throw Error("Nonfinite continuous Room wet publication");
          pcm[(g.inputChannels + c) * g.blockFrames + i] = x;
        }
        this.frame += p.frames;
        this.blocks++;
        if (p.final) this.finalPacketEnd = this.frame;
        this.direct.postMessage({ kind: "pcm", generation: this.identity.ownerGeneration, frame: p.frame, frames: p.frames, final: p.final, buffer: p.buffer }, [p.buffer]);
      } catch (e) {
        this.fail(e);
      }
    }
    stats() {
      return { frame: this.frame, blocks: this.blocks, finalPacketEnd: this.finalPacketEnd, sealed: this.sealed, maxRenderMs: this.maxRenderMs, totalRenderMs: this.totalRenderMs, error: this.error, disposed: this.disposed, room: this.unit?.stats() ?? null, geometry: this.g };
    }
    fail(e) {
      if (this.error || this.disposed) return;
      this.error = String(e);
      let stats;
      try {
        stats = this.stats();
      } catch {
      }
      this.emit({ kind: "error", error: this.error, stats });
      try {
        this.direct?.postMessage({ kind: "error", error: this.error, generation: this.identity?.ownerGeneration });
      } catch {
      }
      this.dispose();
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const action of [() => this.unit?.colour?.dispose(), () => this.unit?.convolver?.dispose(), () => this.direct?.close()]) try {
        action();
      } catch (e) {
        this.releaseErrors.push(String(e));
      }
      this.unit = null;
      this.direct = null;
    }
  };

  // room-continuous-worker-entry.js
  var unit;
  self.onmessage = ({ data }) => {
    if (!unit && data?.kind === "init") unit = new RoomContinuousWorker(data, (d) => self.postMessage(d));
    else unit?.receive(data);
  };
})();
