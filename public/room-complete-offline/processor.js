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
  function roomColourSpec(sampleRate2, { channels = 2, predelay = 0.025, damping = 6e3, events = [] } = {}) {
    return validateRoomColourSpec({ version: 1, profile: ROOM_COLOUR_PROFILE, sampleRate: sampleRate2, channels, initial: { predelay, damping }, events: events.map((e) => ({ ...e })) });
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
  var exact = (p, keys2) => p && Object.keys(p).length === keys2.length && keys2.every((k) => Object.hasOwn(p, k));
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
  var exact2 = (p, keys2) => p && Object.keys(p).length === keys2.length && keys2.every((k) => Object.hasOwn(p, k));
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
    const long = spec?.version === 2 && spec.profile === CONVOLVER_LONG_PROFILE, keys2 = long ? [...fields3, "profile"] : fields3;
    if (!spec || Object.keys(spec).length !== keys2.length || !keys2.every((k) => Object.hasOwn(spec, k)) || !(spec.version === 1 || long) || !integer(spec.sampleRate, 8e3, 192e3) || spec.irSampleRate !== spec.sampleRate || !integer(spec.inputChannels, 1, 2) || spec.normalize !== false || !Array.isArray(spec.ir) || !integer(spec.ir.length, 1, 2)) throw Error("Unsupported static convolver contract");
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
  var exact3 = (p, keys2) => p && Object.keys(p).length === keys2.length && keys2.every((k) => Object.hasOwn(p, k));
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

  // src/modular-audio/ownedRoomCompleteMix.js
  var ROOM_COMPLETE_MIX_PROFILE = "original-room-unsmoothed-drywet-step-v1";
  var fields5 = ["version", "profile", "sampleRate", "sourceChannels", "wetChannels", "initialAmount", "events"];
  var exact4 = (p, keys2) => p && typeof p === "object" && Object.keys(p).length === keys2.length && keys2.every((k) => Object.hasOwn(p, k));
  var amount = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  function validateRoomCompleteMixSpec(p) {
    if (!exact4(p, fields5) || p.version !== 1 || p.profile !== ROOM_COMPLETE_MIX_PROFILE || !Number.isInteger(p.sampleRate) || p.sampleRate < 8e3 || p.sampleRate > 192e3 || ![1, 2].includes(p.sourceChannels) || ![1, 2].includes(p.wetChannels) || !amount(p.initialAmount) || !Array.isArray(p.events) || p.events.length > 255) throw Error("Invalid complete Room dry/wet contract");
    let last = 0;
    for (const e of p.events) {
      if (!exact4(e, ["amount", "drySeconds", "wetSeconds"]) || !amount(e.amount) || typeof e.drySeconds !== "number" || !Number.isFinite(e.drySeconds) || typeof e.wetSeconds !== "number" || !Number.isFinite(e.wetSeconds) || e.drySeconds < last || e.wetSeconds < e.drySeconds || e.wetSeconds > 3600) throw Error("Invalid independently captured Room gain steps");
      last = e.wetSeconds;
    }
    return p;
  }
  var saveRoomCompleteMixSpec = (p) => JSON.stringify(validateRoomCompleteMixSpec(p)) + "\n";
  var loadRoomCompleteMixSpec = (s) => validateRoomCompleteMixSpec(JSON.parse(s));
  var OwnedRoomCompleteMix = class {
    constructor(module, raw) {
      if (!(module instanceof WebAssembly.Module)) throw Error("Compiled complete Room mix required");
      this.spec = loadRoomCompleteMixSpec(saveRoomCompleteMixSpec(raw));
      this.spec.events.forEach(Object.freeze);
      Object.freeze(this.spec.events);
      Object.freeze(this.spec);
      this.e = new WebAssembly.Instance(module, {}).exports;
      this.handle = 0;
      this.failed = false;
      if (this.e.room_complete_mix_api() !== 1) throw Error("Complete Room mix ABI differs");
      const p = this.spec;
      this.handle = this.e.room_complete_mix_new(p.sampleRate, p.sourceChannels, p.wetChannels);
      if (!this.handle) throw Error("Complete Room mix allocation failed");
      try {
        this.check(this.e.room_complete_mix_initial(this.handle, p.initialAmount));
        for (const e of p.events) {
          this.check(this.e.room_complete_mix_event(this.handle, 0, e.drySeconds, e.amount));
          this.check(this.e.room_complete_mix_event(this.handle, 1, e.wetSeconds, e.amount));
        }
        this.check(this.e.room_complete_mix_prepare(this.handle));
        this.memory = this.e.memory.buffer;
        this.inputDry = Array.from({ length: p.sourceChannels }, (_, c) => new Float32Array(this.memory, this.e.room_complete_mix_input(this.handle, 0, c), 2048));
        this.inputWet = Array.from({ length: p.wetChannels }, (_, c) => new Float32Array(this.memory, this.e.room_complete_mix_input(this.handle, 1, c), 2048));
        this.output = Array.from({ length: Math.max(p.sourceChannels, p.wetChannels) }, (_, c) => new Float32Array(this.memory, this.e.room_complete_mix_output(this.handle, c), 2048));
      } catch (error) {
        this.dispose();
        throw error;
      }
    }
    check(value) {
      if (!value) throw Error("Complete Room mix operation rejected");
    }
    alive() {
      if (!this.handle) throw Error("Complete Room mix disposed");
      if (this.failed) throw Error("Complete Room mix failed; reset before replay");
    }
    render(frames) {
      this.alive();
      if (!Number.isInteger(frames) || frames < 0 || frames > 2048) throw Error("Complete Room mix block bounds");
      if (this.memory !== this.e.memory.buffer) throw Error("Complete Room mix memory changed");
      try {
        this.check(this.e.room_complete_mix_render(this.handle, frames));
        for (const plane of this.output) for (let i = 0; i < frames; i++) if (!Number.isFinite(plane[i])) throw Error("Nonfinite complete Room mix output before publication");
      } catch (error) {
        this.failed = true;
        throw error;
      }
    }
    reset() {
      if (!this.handle) throw Error("Complete Room mix disposed");
      this.e.room_complete_mix_reset(this.handle);
      this.failed = false;
    }
    stats() {
      if (!this.handle) throw Error("Complete Room mix disposed");
      return Object.fromEntries(["frame", "peak", "calls", "rejected", "sourceChannels", "wetChannels", "outputChannels", "prepared", "capturedLaneEvents"].map((k, i) => [k, this.e.room_complete_mix_stat(this.handle, i)]));
    }
    snapshot() {
      if (!this.handle) throw Error("Complete Room mix disposed");
      return loadRoomCompleteMixSpec(saveRoomCompleteMixSpec(this.spec));
    }
    dispose() {
      if (this.handle) {
        this.e.room_complete_mix_free(this.handle);
        this.handle = 0;
        this.inputDry = this.inputWet = this.output = this.memory = null;
      }
    }
  };

  // src/modular-audio/ownedOfflineRoomComplete.js
  var OFFLINE_ROOM_COMPLETE_PROFILE = "offline-room-colour-convolution-drywet-v1";
  var fields6 = ["version", "profile", "room", "mix", "mixIdentity"];
  var exact5 = (p, keys2) => p && typeof p === "object" && Object.keys(p).length === keys2.length && keys2.every((k) => Object.hasOwn(p, k));
  var canonical2 = (p) => p && typeof p === "object" ? Array.isArray(p) ? p.map(canonical2) : Object.fromEntries(Object.keys(p).sort().map((k) => [k, canonical2(p[k])])) : p;
  var same2 = (a, b) => JSON.stringify(canonical2(a)) === JSON.stringify(canonical2(b));
  var freeze3 = (p) => {
    if (p && typeof p === "object" && !Object.isFrozen(p)) {
      for (const value of Object.values(p)) freeze3(value);
      Object.freeze(p);
    }
    return p;
  };
  function validateOfflineRoomCompleteSpec(p) {
    if (!exact5(p, fields6) || p.version !== 1 || p.profile !== OFFLINE_ROOM_COMPLETE_PROFILE) throw Error("Invalid complete offline Room contract");
    validateRoomConvolutionSpec(p.room);
    validateRoomCompleteMixSpec(p.mix);
    const id = p.mixIdentity, source = p.room.colour?.channels, wet = Math.max(p.room.convolver.inputChannels, p.room.convolver.ir.length);
    if (p.room.colour?.version !== 1 || source !== p.mix.sourceChannels || wet !== p.mix.wetChannels || p.room.convolver.sampleRate !== p.mix.sampleRate || !id || id.api !== 1 || id.profile !== ROOM_COMPLETE_MIX_PROFILE || id.audited !== false || !/^[a-f0-9]{16}$/.test(id.version) || !/^[a-f0-9]{64}$/.test(id.wasm) || !/^[a-f0-9]{64}$/.test(id.source) || !Number.isInteger(id.bytes) || id.bytes < 1) throw Error("Complete Room kernels/layout/captured clock differ");
    return p;
  }
  var saveOfflineRoomCompleteSpec = (p) => JSON.stringify(validateOfflineRoomCompleteSpec(p)) + "\n";
  var loadOfflineRoomCompleteSpec = (s) => validateOfflineRoomCompleteSpec(JSON.parse(s));
  var OwnedOfflineRoomComplete = class {
    constructor(assets, raw) {
      validateOfflineRoomCompleteSpec(raw);
      validateRoomConvolutionAssets(assets, raw.room);
      if (!(assets?.mix?.module instanceof WebAssembly.Module) || !same2(assets.mix.manifest, raw.mixIdentity)) throw Error("Complete Room mix assets differ from captured identity");
      this.room = this.mix = null;
      this.failed = false;
      this.disposed = false;
      this.frame = 0;
      try {
        this.room = new OwnedRoomConvolver(assets, raw.room);
        this.mix = new OwnedRoomCompleteMix(assets.mix.module, raw.mix);
        this.spec = freeze3({ version: 1, profile: OFFLINE_ROOM_COMPLETE_PROFILE, room: this.room.spec, mix: this.mix.spec, mixIdentity: JSON.parse(JSON.stringify(raw.mixIdentity)) });
        this.input = this.room.input;
        this.output = this.mix.output;
        this.memories = [this.room.convolver.e.memory.buffer, this.room.colour.e.memory.buffer, this.mix.e.memory.buffer];
      } catch (error) {
        try {
          this.dispose();
        } catch (cleanupError) {
          error.cleanupError = String(cleanupError);
        }
        throw error;
      }
    }
    alive() {
      if (this.disposed) throw Error("Complete offline Room disposed");
      if (this.failed) throw Error("Complete offline Room failed; reset before replay");
    }
    render(frames) {
      this.alive();
      if (!Number.isInteger(frames) || frames < 0 || frames > 2048) throw Error("Complete offline Room render bounds");
      for (const plane of this.input) for (let i = 0; i < frames; i++) if (!Number.isFinite(plane[i])) throw Error("Nonfinite complete offline Room input");
      if (this.memories[0] !== this.room.convolver.e.memory.buffer || this.memories[1] !== this.room.colour.e.memory.buffer || this.memories[2] !== this.mix.e.memory.buffer) throw Error("Complete offline Room memory changed");
      try {
        for (let c = 0; c < this.input.length; c++) this.mix.inputDry[c].set(this.input[c].subarray(0, frames));
        this.room.render(frames);
        for (let c = 0; c < this.room.output.length; c++) this.mix.inputWet[c].set(this.room.output[c].subarray(0, frames));
        this.mix.render(frames);
        this.frame += frames;
      } catch (error) {
        this.failed = true;
        throw error;
      }
    }
    reset() {
      this.aliveReset();
      try {
        this.room.reset();
        this.mix.reset();
        this.frame = 0;
        this.failed = false;
      } catch (error) {
        this.failed = true;
        throw error;
      }
    }
    aliveReset() {
      if (this.disposed) throw Error("Complete offline Room disposed");
    }
    stats() {
      this.aliveReset();
      const read = (owner) => {
        try {
          return owner.stats();
        } catch (error) {
          return { error: String(error) };
        }
      };
      return { profile: OFFLINE_ROOM_COMPLETE_PROFILE, frame: this.frame, failed: this.failed, sourceChannels: this.input.length, wetChannels: this.room.output.length, outputChannels: this.output.length, adapterLatencyFrames: 0, room: read(this.room), mix: read(this.mix), memoryBytes: this.memories.reduce((n, b) => n + b.byteLength, 0) };
    }
    snapshot() {
      this.aliveReset();
      return loadOfflineRoomCompleteSpec(saveOfflineRoomCompleteSpec(this.spec));
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      const failures = [];
      for (const owner of [this.room, this.mix]) try {
        owner?.dispose();
      } catch (error) {
        failures.push(error);
      }
      this.input = this.output = this.memories = null;
      if (failures.length) throw new AggregateError(failures, "Complete offline Room cleanup failed");
    }
  };

  // src/modular-audio/offlineRoomCompleteProcessor.js
  var OfflineRoomCompleteProcessor = class {
    constructor(p, port, rate) {
      this.port = port;
      this.unit = null;
      this.disposed = false;
      this.error = null;
      this.calls = 0;
      this.finalStats = null;
      this.releaseError = null;
      this.releasedOwners = false;
      port.onmessage = ({ data }) => this.message(data);
      try {
        if (p.hostVersion !== "be3bdf1dc8315dd8" || p.execution !== OFFLINE_ROOM_COMPLETE_PROFILE || !Number.isInteger(p.expectedFrames) || p.expectedFrames < 1 || p.expectedFrames > 2147483647 || Math.ceil(p.expectedFrames / 128) * 128 > rate * 3600) throw Error("Offline complete Room identity/execution differs");
        validateOfflineRoomCompleteSpec(p.spec);
        if (p.spec.mix.sampleRate !== rate || p.assets?.convolver?.manifest?.version !== "c5dbde0540bfdf83" || p.assets?.colour?.manifest?.version !== "7725ec44e5572cf0" || p.assets?.mix?.manifest?.version !== "c7b4ee0c1094a319") throw Error("Offline complete Room component identity/rate differs");
        this.frames = p.expectedFrames;
        this.channels = p.spec.mix.sourceChannels;
        this.outputChannels = Math.max(this.channels, p.spec.mix.wetChannels);
        this.unit = new OwnedOfflineRoomComplete(p.assets, p.spec);
        this.port.postMessage({ kind: "ready", stats: this.snapshot() });
      } catch (error) {
        this.fail(error);
      }
    }
    snapshot() {
      let dsp = this.finalStats;
      if (this.unit) try {
        dsp = this.unit.stats();
      } catch (error) {
        dsp = { error: String(error) };
      }
      return { hostVersion: "be3bdf1dc8315dd8", components: { convolver: "c5dbde0540bfdf83", colour: "7725ec44e5572cf0", mix: "c7b4ee0c1094a319" }, execution: OFFLINE_ROOM_COMPLETE_PROFILE, expectedFrames: this.frames, calls: this.calls, sourceChannels: this.channels, outputChannels: this.outputChannels, disposed: this.disposed, error: this.error, releasedOwners: this.releasedOwners, releaseError: this.releaseError, dsp };
    }
    release() {
      if (this.unit) {
        try {
          this.finalStats = this.unit.stats();
        } catch (error) {
          this.finalStats = { error: String(error) };
        }
        try {
          this.unit.dispose();
        } catch (error) {
          this.releaseError = String(error);
        } finally {
          this.unit = null;
        }
      }
      this.releasedOwners = true;
    }
    fail(error) {
      if (this.error) return;
      this.error = String(error);
      this.release();
      this.port.postMessage({ kind: "error", error: this.error, stats: this.snapshot() });
    }
    message(data) {
      if (!Number.isInteger(data?.request) || data.request < 1 || data.request > 4294967295) {
        this.fail(Error("Invalid offline complete Room request"));
        return;
      }
      if (data.kind === "dispose") {
        this.release();
        this.disposed = true;
        this.port.postMessage({ kind: "disposed", request: data.request, stats: this.snapshot() });
        return;
      }
      if (data.kind === "stats") {
        this.port.postMessage({ kind: "stats", request: data.request, stats: this.snapshot() });
        return;
      }
      this.fail(Error("Unknown offline complete Room operation"));
    }
    process(inputs, outputs) {
      const out = outputs[0] ?? [];
      for (const plane of out) plane.fill(0);
      if (this.disposed || this.error) return false;
      try {
        const input = inputs[0] ?? [];
        if (input.length !== this.channels || out.length !== this.outputChannels || input.some((p) => !(p instanceof Float32Array) || p.length !== 128 || p.some((v) => !Number.isFinite(v))) || out.some((p) => p.length !== 128) || this.calls >= Math.ceil(this.frames / 128)) throw Error("Offline complete Room fixed-program layout/budget differs");
        for (let c = 0; c < input.length; c++) this.unit.input[c].set(input[c]);
        this.unit.render(128);
        for (let c = 0; c < out.length; c++) out[c].set(this.unit.output[c].subarray(0, 128));
        this.calls++;
        return true;
      } catch (error) {
        for (const plane of out) plane.fill(0);
        this.fail(error);
        return false;
      }
    }
  };

  // room-complete-offline-entry.js
  var RoomCompleteWorklet = class extends AudioWorkletProcessor {
    constructor({ processorOptions }) {
      super();
      this.owner = new OfflineRoomCompleteProcessor(processorOptions, this.port, sampleRate);
    }
    process(inputs, outputs) {
      return this.owner.process(inputs, outputs);
    }
  };
  registerProcessor("owned-offline-complete-room-be3bdf1dc8315dd8", RoomCompleteWorklet);
})();
