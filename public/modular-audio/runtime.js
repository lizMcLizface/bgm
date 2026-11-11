// src/modular-audio/legacyPatchTransition.js
var flattenFM = (p) => [...p.globals.map(([i, v]) => [0, i, v]), ...p.operators.map(([op, i, v]) => [1, op * 32 + i, v]), ...p.routes.map(([a, b, v]) => [2, a * 8 + b, v]), ...p.carriers.map(([i, v]) => [3, i, v])];
var coreDiscrete = (s, i) => s === 0 ? [0, 1, 2].includes(i) : [0, 1, 11, 44, 48, 52, 53, 54, 58, 94, 99].includes(i) || i >= 74 && i <= 85 && (i - 74) % 3 !== 2;
var fmDiscrete = (s, i) => s === 0 ? [0, 1, 2, 4, 6, 13, 49].includes(i) || i >= 29 && i <= 40 && (i - 29) % 3 !== 2 : s === 1 ? [16, 17, 21].includes(i % 32) : false;
var coreLog = (s, i) => s === 0 ? [9].includes(i) : [9, 12, 17, 18, 20, 21, 22, 24, 25, 35, 45, 65, 66, 68, 72, 88, 96].includes(i);
var fmLog = (s, i) => s === 0 ? [10, 16, 19, 20, 22, 26, 28, 43, 51].includes(i) : s === 1 ? [0, 1, 4, 5, 7, 10].includes(i % 32) : false;
var PatchTransition = class {
  constructor(values, performance3, apply, onPerformance, discrete, log, rate) {
    this.values = new Map(values.map(([s, i, v]) => [s + ":" + i, v]));
    this.performance = performance3;
    this.apply = apply;
    this.onPerformance = onPerformance;
    this.discrete = discrete;
    this.log = log;
    this.rate = rate;
    this.pending = [];
    this.active = null;
    this.outputGain = 1;
  }
  schedule(values, performance3, frame4, seconds = 0.06) {
    if (!Number.isFinite(frame4) || frame4 < 0 || !Number.isFinite(seconds) || values.length > 512 || values.some((t) => t.length !== 3 || t.some((v) => !Number.isFinite(v)))) throw Error("Invalid patch transition.");
    const p = { values, performance: performance3, frame: Math.round(frame4), seconds: seconds <= 0 ? 0 : Math.max(0.016, Math.min(2, seconds)) };
    const at = this.pending.findIndex((x) => x.frame === p.frame);
    if (at >= 0) this.pending[at] = p;
    else {
      if (this.pending.length >= 32) throw Error("Patch queue full (32).");
      this.pending.push(p);
      this.pending.sort((a, b) => a.frame - b.frame);
    }
  }
  update(frame4) {
    const a = this.active;
    if (!a) return;
    const t = Math.min(1, Math.max(0, (frame4 - a.start) / (a.end - a.start))), ease = t * t * (3 - 2 * t);
    for (const r of a.rows) {
      if (r.discrete) {
        if (!a.switched && frame4 >= a.mid) {
          this.apply(r.s, r.i, r.to);
          this.values.set(r.key, r.to);
        }
      } else {
        const v = t === 1 ? r.to : r.log ? Math.exp(Math.log(r.from) + (Math.log(r.to) - Math.log(r.from)) * ease) : r.from + (r.to - r.from) * ease;
        this.apply(r.s, r.i, v);
        this.values.set(r.key, v);
      }
    }
    if (!a.switched && frame4 >= a.mid) {
      this.onPerformance(a.performance, frame4);
      this.performance = a.performance;
      a.switched = true;
    }
    if (t === 1) this.active = null;
  }
  tick(frame4) {
    const a = this.active;
    if (a && (frame4 >= a.next || frame4 >= a.end || !a.switched && frame4 >= a.mid || this.pending[0]?.frame <= frame4)) {
      this.update(frame4);
      if (this.active) this.active.next = this.active.start + (Math.floor((frame4 - this.active.start) / 16) + 1) * 16;
    }
    while (this.pending[0]?.frame <= frame4) {
      const p = this.pending.shift(), rows2 = [];
      for (const [s, i, to] of p.values) {
        const key = s + ":" + i, from = this.values.get(key) ?? to;
        if (from !== to) rows2.push({ s, i, key, from, to, discrete: this.discrete(s, i) || this.discrete === fmDiscrete && s === 1 && i % 32 === 1 && (from === 0 || to === 0), log: from > 0 && to > 0 && this.log(s, i) });
      }
      const perfChanged = JSON.stringify(p.performance) !== JSON.stringify(this.performance), structural = rows2.some((r) => r.discrete) || p.performance?.mode !== this.performance?.mode;
      if (!rows2.length && !perfChanged) continue;
      if (p.seconds === 0) {
        for (const r of rows2) {
          this.apply(r.s, r.i, r.to);
          this.values.set(r.key, r.to);
        }
        if (perfChanged) this.onPerformance(p.performance, frame4);
        this.performance = p.performance;
        this.active = null;
      } else {
        const end = frame4 + Math.max(2, Math.round(p.seconds * this.rate));
        this.active = { rows: rows2, performance: p.performance, start: frame4, next: frame4 + 16, end, mid: Math.round((frame4 + end) / 2), switched: false, structural };
      }
    }
  }
  span(frame4, count) {
    if (this.pending.length) count = Math.min(count, Math.max(1, this.pending[0].frame - frame4));
    if (this.active) {
      count = Math.min(count, Math.max(1, this.active.next - frame4), this.active.end - frame4);
      if (!this.active.switched) count = Math.min(count, Math.max(1, this.active.mid - frame4));
    }
    return Math.max(1, count);
  }
  gain(frame4) {
    const a = this.active, target = a?.structural ? Math.min(1, Math.abs(frame4 - a.mid) / Math.max(1, this.rate * 4e-3)) : 1, step = 1 / Math.max(1, this.rate * 4e-3);
    this.outputGain += Math.max(-step, Math.min(step, target - this.outputGain));
    return this.outputGain;
  }
  clear() {
    this.pending.length = 0;
    this.active = null;
    this.outputGain = 1;
  }
};

// src/modular-audio/ownedCore.js
var frame = (n) => Number.isSafeInteger(n) && n >= 0;
var integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
var finite = (n) => typeof n === "number" && Number.isFinite(n);
function packet(p) {
  if (!Array.isArray(p) || p.length > 244 || p.some((r) => !Array.isArray(r) || r.length !== 3 || !r.every(finite) || !Number.isFinite(Math.fround(r[2])) || !integer(r[0], 0, 2) || !integer(r[1], 0, r[0] === 0 ? 11 : 115))) throw Error("Invalid core packet");
  const keys = p.map((r) => r[0] + ":" + r[1]);
  if (new Set(keys).size !== keys.length) throw Error("Duplicate core parameter");
  return p;
}
function performance(p) {
  if (!p || !integer(p.mode, 0, 2) || !finite(p.portamento) || p.portamento < 0 || p.portamento > 3 || !["always", "overlap"].includes(p.glide)) throw Error("Invalid core performance");
}
function validateCoreSpec(raw) {
  const p = JSON.parse(JSON.stringify(raw));
  if (p?.version !== 1) throw Error("Invalid owned core version");
  packet(p.patch);
  performance(p.performance);
  if (!Array.isArray(p.events) || !Array.isArray(p.edits) || p.edits.length > 32 || p.events.length + p.edits.length + 1 > 4096) throw Error("core resource bounds");
  for (const e of p.events) {
    if (!Array.isArray(e) || e.length !== 5 || !integer(e[0], 0, 6) || !integer(e[1], 0, 4294967295) || !frame(e[2]) || !finite(e[3]) || !finite(e[4])) throw Error("Invalid core event");
    if ([0, 1, 5].includes(e[0]) && !e[1]) throw Error("core note ID required");
    if (e[0] === 6 && e[1] > 2) throw Error("Invalid core mode");
    if ([0, 5].includes(e[0]) && (e[3] < 0 || e[3] > 127) || e[0] === 0 && (e[4] < 0 || e[4] > 1) || [2, 3].includes(e[0]) && (e[3] < 0 || e[3] > 1) || e[0] === 5 && (e[4] < 0 || e[4] > 8) || e[0] === 6 && (e[3] < 0 || e[3] > 3 || e[4] < 0 || e[4] > 1)) throw Error("core event value bounds");
  }
  for (const e of p.edits) {
    packet(e.patch);
    performance(e.performance);
    if (!frame(e.frame) || !finite(e.seconds) || e.seconds < 0 || e.seconds > 2) throw Error("Invalid core transition");
  }
  return p;
}

// src/modular-audio/ownedFm.js
var frame2 = (n) => Number.isSafeInteger(n) && n >= 0;
var integer2 = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
var finite2 = (n) => typeof n === "number" && Number.isFinite(n);
function packet2(p) {
  if (!p || typeof p !== "object") throw Error("Missing FM packet");
  for (const [name, len, valid] of [
    ["globals", 2, (r) => integer2(r[0], 0, 59)],
    ["operators", 3, (r) => integer2(r[0], 0, 7) && integer2(r[1], 0, 21)],
    ["routes", 3, (r) => integer2(r[0], 0, 7) && integer2(r[1], 0, 7) && (r[0] < r[1] || r[2] === 0)],
    ["carriers", 2, (r) => integer2(r[0], 0, 7)]
  ]) {
    const rows2 = p[name];
    if (!Array.isArray(rows2) || rows2.length > 256 || rows2.some((r) => !Array.isArray(r) || r.length !== len || !r.every(finite2) || !Number.isFinite(Math.fround(r.at(-1))) || !valid(r))) throw Error(`Invalid FM ${name}`);
    const keys = rows2.map((r) => r.slice(0, -1).join(":"));
    if (new Set(keys).size !== keys.length) throw Error(`Duplicate FM ${name}`);
  }
  return p;
}
function performance2(p) {
  if (!p || !integer2(p.mode, 0, 2) || !finite2(p.portamento) || p.portamento < 0 || p.portamento > 3 || !["always", "overlap"].includes(p.glide)) throw Error("Invalid FM performance");
}
function validateFmSpec(raw) {
  const p = JSON.parse(JSON.stringify(raw));
  if (p?.version !== 1) throw Error("Invalid owned FM version");
  packet2(p.patch);
  performance2(p.performance);
  if (!Array.isArray(p.events) || !Array.isArray(p.edits) || p.edits.length > 32 || p.events.length + p.edits.length + 1 > 4096) throw Error("FM resource bounds");
  for (const e of p.events) {
    if (!Array.isArray(e) || e.length !== 5 || !integer2(e[0], 0, 6) || !integer2(e[1], 0, 4294967295) || !frame2(e[2]) || !finite2(e[3]) || !finite2(e[4])) throw Error("Invalid FM event");
    if ([0, 1, 5].includes(e[0]) && !e[1]) throw Error("FM note ID required");
    if (e[0] === 6 && e[1] > 2) throw Error("Invalid FM mode");
    if ([0, 5].includes(e[0]) && (e[3] < 0 || e[3] > 127) || e[0] === 0 && (e[4] < 0 || e[4] > 1) || [2, 3].includes(e[0]) && (e[3] < 0 || e[3] > 1) || e[0] === 5 && (e[4] < 0 || e[4] > 8) || e[0] === 6 && (e[3] < 0 || e[3] > 3 || e[4] < 0 || e[4] > 1)) throw Error("FM event value bounds");
  }
  for (const e of p.edits) {
    packet2(e.patch);
    performance2(e.performance);
    if (!frame2(e.frame) || !finite2(e.seconds) || e.seconds < 0 || e.seconds > 2) throw Error("Invalid FM transition");
  }
  return p;
}

// src/modular-audio/pitchedCompiler.js
function validatePitchedConfig(raw, fm) {
  const p = (fm ? validateFmSpec : validateCoreSpec)(raw);
  if (p.events.length) throw Error("Pitched notes belong in graph events");
  return p;
}
function compilePitched(raw, fm, rate) {
  const p = validatePitchedConfig(raw, fm), flat = fm ? flattenFM : (p2) => p2, base = flat(p.patch), points = [], gains = [];
  let cursor = 0, lastGain = 1;
  const push = (rows2, row) => {
    if (points.length + gains.length >= 65536) throw Error("Pitched automation capacity exceeded");
    if (!Number.isSafeInteger(row[0])) throw Error("Pitched automation frame overflow");
    rows2.push(row);
  };
  const t = new PatchTransition(base, p.performance, (scope, index, value) => push(points, [cursor, scope, index, value, 0]), (perf) => push(points, [cursor, 4, perf.mode, perf.portamento, Number(perf.glide === "always")]), fm ? fmDiscrete : coreDiscrete, fm ? fmLog : coreLog, rate);
  for (const edit of p.edits) {
    if (!Number.isSafeInteger(edit.frame + Math.ceil(edit.seconds * rate) + 2048)) throw Error("Pitched transition frame overflow");
    t.schedule(flat(edit.patch), edit.performance, edit.frame, edit.seconds);
  }
  while (t.pending.length || t.active || t.outputGain !== 1) {
    if (!t.active && t.outputGain === 1 && t.pending[0]?.frame > cursor) cursor = t.pending[0].frame;
    t.tick(cursor);
    push(points, [cursor, 6, 0, 0, 0]);
    const span = t.span(cursor, 2048);
    if (t.active || t.outputGain !== 1) for (let i = 0; i < span; i++) {
      const gain = t.gain(cursor + i);
      if (gain !== lastGain) {
        push(gains, [cursor + i, 5, 0, gain, 0]);
        lastGain = gain;
      }
    }
    cursor += span;
  }
  return { base, performance: p.performance, points, gains };
}

// src/modular-audio/percussionConfig.js
function validatePercussionConfig(c, definition) {
  if (c === void 0) return void 0;
  const keys = (v, names) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k));
  if (!definition || !keys(c, ["version", "voice", "drums"]) || c.version !== definition.version || !definition.voices.includes(c.voice) || !Array.isArray(c.drums) || c.drums.length !== definition.slots) throw Error("Invalid percussion kit configuration");
  for (const d of c.drums) {
    if (!keys(d, ["on", "level", "tone", "decay"]) || typeof d.on !== "boolean") throw Error("Invalid percussion drum configuration");
    for (const [key, bounds2] of Object.entries(definition.fields)) if (typeof d[key] !== "number" || !Number.isFinite(d[key]) || d[key] < bounds2.min || d[key] > bounds2.max) throw Error(`Invalid percussion ${key}`);
  }
  return c;
}

// src/modular-audio/pianoConfig.js
var PIANO_TYPES = Object.freeze(["felt", "electric", "grand", "felted", "upright", "ambient", "glass", "drama", "soft", "subdued", "concert", "measured", "measuredAmbient", "measuredDrama", "measuredGlass", "measuredHouse", "measuredRavel", "measuredSoft", "measuredSubdued"]);
var range = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
var fail = () => {
  throw Error("Invalid prepared piano configuration");
};
function validatePianoConfig(c) {
  if (![1, 2, 3].includes(c?.version) || !Number.isInteger(c.voices) || !range(c.voices, 1, 32) || !range(c.cutoff, 0, 24e3) || !range(c.q, 0, 100) || !range(c.pitch, -2400, 2400) || !range(c.pitchDecay, 0, 30) || !Array.isArray(c.banks) || c.banks.length > 128 || !Array.isArray(c.notes) || c.notes.length > 2e3) fail();
  if (c.version === 1 && c.controls !== void 0 || c.version >= 2 && (!Array.isArray(c.controls) || c.controls.length > 4)) fail();
  for (const m of c.controls ?? []) {
    if (!["pitch", "filter"].includes(m.axis) || !["sine", "linear"].includes(m.kind) || (!range(m.phase, 0, 1) || m.phase === 1) || !range(m.frequency, 0, 44100) || !range(m.initialDepth, -24e3, 24e3) || !range(m.targetDepth, -24e3, 24e3) || !range(m.tauFrames, 0, 144e4) || !Array.isArray(m.points) || m.points.length > 128 || m.kind === "linear" && (m.points.length < 2 || m.points[0][0] !== 0 || m.points.at(-1)[0] < 576e4)) fail();
    let last = -1;
    for (const p of m.points) {
      if (!Array.isArray(p) || p.length !== 2 || !range(p[0], 0, 5952e3) || p[0] <= last || !range(p[1], m.kind === "sine" ? 0 : -(1.2 + Number.EPSILON), m.kind === "sine" ? 44100 : 1.2 + Number.EPSILON)) fail();
      last = p[0];
    }
  }
  for (const b of c.banks) {
    if (!range(b.frequency, 10, 8e3) || !PIANO_TYPES.includes(b.type) || !range(b.decay, 0.3, 5) || ["brightness", "hammer", "unison", "velocity", "resonance", "softness", "sustain", "wear"].some((k) => !range(b[k], 0, 1)) || !Number.isInteger(b.seed) || !range(b.seed, 0, 4294967295) || PIANO_TYPES.indexOf(b.type) >= 2 && b.sustain !== 0) fail();
  }
  const ids = /* @__PURE__ */ new Set();
  let points = 0;
  for (const n of c.notes) {
    if (!Number.isInteger(n.id) || !range(n.id, 1, 4294967295) || ids.has(n.id) || !Number.isInteger(n.bank) || !range(n.bank, 0, c.banks.length - 1) || !Number.isInteger(n.midi) || !range(n.midi, 0, 127) || !range(n.velocity, 0, 1) || !Array.isArray(n.gain) || n.gain.length < 2 || !Array.isArray(n.filter) || !n.filter.length) fail();
    ids.add(n.id);
    for (const [list, gain] of [[n.gain, true], [n.filter, false]]) {
      let last = -1;
      for (const p of list) {
        if (!Array.isArray(p) || p.length !== 4 || !range(p[0], gain ? 0 : 1, gain ? 0 : 2) || !Number.isInteger(p[0]) || !range(p[1], 0, 288e4) || p[1] < last || gain && p[1] === last || !range(p[2], gain ? 0 : -24e3, gain ? 1 : 24e3) || !range(p[3], 0, 144e4) || p[0] === 2 && p[3] < 0.48) fail();
        last = p[1];
        points++;
      }
    }
    if (n.gain[0][1] !== 0 || n.gain.at(-1)[2] !== 0 || n.filter[0][0] !== 1 || n.filter[0][1] !== 0) fail();
    if (c.version === 3) {
      if (!Number.isInteger(n.voice) || !range(n.voice, 0, c.voices - 1) || !Number.isInteger(n.onsetFrame) || !range(n.onsetFrame, 0, 576e4) || !range(n.cutFrame, 0, n.gain.at(-1)[1]) || n.fadeFrame !== null && (!range(n.fadeFrame, 0, n.cutFrame - 480) || n.cutFrame - n.fadeFrame !== 480) || n.fadeFrame === null && n.cutFrame !== n.gain.at(-1)[1]) fail();
    } else if (["voice", "onsetFrame", "fadeFrame", "cutFrame"].some((k) => n[k] !== void 0)) fail();
  }
  if (points > 65536) fail();
  if (c.version === 3) {
    const slots = [];
    for (const n of [...c.notes].sort((a, b) => a.onsetFrame - b.onsetFrame)) {
      const prior = slots[n.voice];
      if (prior && prior.onsetFrame + prior.cutFrame > n.onsetFrame) fail();
      slots[n.voice] = n;
    }
  }
  return c;
}

// src/modular-audio/iowaConfig.js
var IOWA_TYPES = Object.freeze(["held", "decay"]);
var range2 = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
var fail2 = () => {
  throw Error("Invalid prepared Iowa configuration");
};
var vector = (a, max = 262144) => Array.isArray(a) && a.length <= max && a.every((v) => typeof v === "number" && Number.isFinite(v));
var increasing = (a) => vector(a, 128) && a.length && a[0] >= 0 && a.at(-1) <= 30 && a.every((v, i) => !i || v > a[i - 1]);
function iowaFields(s) {
  return s.kind === "held" ? [[0, s.times], [1, s.tables.flat()], [2, s.envTimes], [3, s.envDb], [4, s.relTimes], [5, s.relDb], [6, s.noise], [7, s.burst]] : [[7, s.burst], [8, s.frequency.flatMap((f, i) => [f, s.amplitude[i], s.phase[i], s.rise[i], s.early[i], s.late[i]])]];
}
function validateIowaConfig(c) {
  if (c?.version !== 1 || !Number.isInteger(c.sampleRate) || !range2(c.sampleRate, 8e3, 192e3) || c.quantumFrames !== 128 || !Number.isInteger(c.voices) || !range2(c.voices, 1, 32) || !Array.isArray(c.banks) || c.banks.length > 96 || !Array.isArray(c.notes) || c.notes.length > 2e3) fail2();
  let bytes = 0;
  const bankIds = /* @__PURE__ */ new Set();
  for (const s of c.banks) {
    if (!Number.isInteger(s.id) || !range2(s.id, 1, 4294967295) || bankIds.has(s.id) || !IOWA_TYPES.includes(s.kind)) fail2();
    bankIds.add(s.id);
    if (!vector(s.burst) || s.burst.length && s.burst.length & s.burst.length - 1 || s.burst.some((v) => Math.abs(v) > 64)) fail2();
    if (s.kind === "held") {
      if (!range2(s.f0, 1, 2e4) || !range2(s.rate, 0, 30) || !range2(s.depth, 0, 2400) || !range2(s.tremolo, 0, 60) || !range2(s.pitchWander, 0, 100) || !range2(s.levelWander, 0, 60) || !increasing(s.times) || s.times.length > 32 || !Array.isArray(s.tables) || s.tables.length !== s.times.length || s.tables.some((a) => !vector(a, 2048) || a.length !== 2048 || a.some((v) => Math.abs(v) > 64)) || !increasing(s.envTimes) || !vector(s.envDb, 128) || s.envTimes.length !== s.envDb.length || !increasing(s.relTimes) || !vector(s.relDb, 128) || s.relTimes.length !== s.relDb.length || [...s.envDb, ...s.relDb].some((v) => Math.abs(v) > 240) || !vector(s.noise) || s.noise.length && s.noise.length & s.noise.length - 1 || s.noise.some((v) => Math.abs(v) > 64)) fail2();
    } else {
      if (!range2(s.seconds, 0.3, 8) || !vector(s.frequency, 128) || ["amplitude", "phase", "rise", "early", "late"].some((k) => !vector(s[k], 128) || s[k].length !== s.frequency.length) || s.frequency.some((v) => !range2(v, 0, 90240)) || s.amplitude.some((v) => !range2(v, 0, 64)) || s.rise.some((v) => !range2(v, 0, 4e-3)) || [...s.early, ...s.late].some((v) => !range2(v, -1e5, 0))) fail2();
    }
    for (const [, a] of iowaFields(s)) {
      bytes += a.length * 8;
      if (bytes > 67108864) fail2();
    }
  }
  const ids = /* @__PURE__ */ new Set();
  for (const n of c.notes) {
    if (!Number.isInteger(n.id) || !range2(n.id, 1, 4294967295) || ids.has(n.id) || !bankIds.has(n.bank) || !Number.isInteger(n.midi) || !range2(n.midi, 0, 127) || !range2(n.velocity, 0, 1) || !range2(n.gain, 0, 1024) || !range2(n.tune, 0.0625, 16) || typeof n.ring !== "boolean" || n.roll !== null && (!range2(n.roll?.rate, 1e-6, 100) || !range2(n.roll?.level, 0, 60) || !range2(n.roll?.timing, 0, 4) || c.banks.find((s) => s.id === n.bank).kind !== "decay") || n.slide !== null && (!range2(n.slide?.cents, -2400, 2400) || !range2(n.slide?.seconds, 5e-3, 30))) fail2();
    ids.add(n.id);
  }
  return c;
}

// src/synth-lab/insertsConfig.js
var INSERTS = [
  ["bypass", "Bypass inserts", 0, 1, 1, 0],
  ["saturation", "Saturation mix", 0, 1, 0.01, 0],
  ["drive", "Saturation drive \xB7 dB", 0, 24, 0.5, 6],
  ["lowGain", "Low shelf \xB7 dB", -12, 12, 0.5, 0],
  ["lowFreq", "Low shelf \xB7 Hz", 60, 600, 1, 180],
  ["midGain", "Mid peak \xB7 dB", -12, 12, 0.5, 0],
  ["midFreq", "Mid peak \xB7 Hz", 200, 6e3, 1, 1e3],
  ["midQ", "Mid peak Q", 0.2, 4, 0.05, 0.7],
  ["highGain", "High shelf \xB7 dB", -12, 12, 0.5, 0],
  ["highFreq", "High shelf \xB7 Hz", 1500, 12e3, 1, 6e3],
  ["phaser", "Phaser mix", 0, 1, 0.01, 0],
  ["phaserRate", "Phaser rate \xB7 Hz", 0.02, 5, 0.01, 0.15],
  ["phaserDepth", "Phaser sweep \xB7 octaves", 0, 3, 0.05, 1.5],
  ["phaserFreq", "Phaser centre \xB7 Hz", 100, 4e3, 1, 700],
  ["phaserFeedback", "Phaser feedback", -0.75, 0.75, 0.01, 0.2],
  ["flanger", "Flanger mix", 0, 1, 0.01, 0],
  ["flangerRate", "Flanger rate \xB7 Hz", 0.02, 5, 0.01, 0.12],
  ["flangerDepth", "Flanger depth \xB7 ms", 0, 4, 0.05, 1],
  ["flangerDelay", "Flanger centre \xB7 ms", 0.3, 20, 0.05, 2],
  ["flangerFeedback", "Flanger feedback", -0.85, 0.85, 0.01, 0.35],
  ["chorus", "Chorus mix", 0, 0.8, 0.01, 0],
  ["chorusRate", "Chorus rate \xB7 Hz", 0.05, 10, 0.01, 0.35],
  ["chorusDepth", "Chorus depth \xB7 ms", 0, 8, 0.1, 3.5],
  ["gain", "Insert output trim \xB7 dB", -18, 6, 0.5, 0],
  // appended with the kernel's parameters 24-28: the left/right offset of each modulation (cycles), chorus feedback, phaser stage count
  ["phaserSpread", "Phaser spread", 0, 0.5, 0.01, 0.25],
  ["flangerSpread", "Flanger spread", 0, 0.5, 0.01, 0.5],
  ["chorusSpread", "Chorus spread", 0, 0.5, 0.01, 0.5],
  ["chorusFeedback", "Chorus feedback", -0.6, 0.6, 0.01, 0],
  ["phaserStages", "Phaser stages", 2, 12, 2, 6]
];

// src/modular-audio/ownedInserts.js
function validateOwnedInsertsSpec(raw) {
  const c = JSON.parse(JSON.stringify(raw));
  if (c?.version !== 1 || !Array.isArray(c.parameters) || c.parameters.length !== INSERTS.length) throw Error("Invalid owned inserts configuration");
  const ids = /* @__PURE__ */ new Set();
  for (const pair of c.parameters) {
    if (!Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0]) || ids.has(pair[0])) throw Error("Invalid owned inserts parameter identity");
    const d = INSERTS[pair[0]], v = pair[1];
    if (!d || typeof v !== "number" || !Number.isFinite(v) || v < d[2] || v > d[3]) throw Error("Invalid owned inserts parameter value");
    ids.add(pair[0]);
  }
  return c;
}

// src/synth-lab/effectsConfig.js
var EFFECTS = [
  ["dry", "Dry level", 0, 1, 0.01, 1],
  ["reverb", "Reverb send", 0, 0.8, 0.01, 0.22],
  ["delay", "Delay send", 0, 0.8, 0.01, 0.12],
  ["decay", "Reverb decay \xB7 RT60 seconds", 0.3, 30, 0.1, 8],
  ["size", "Room size", 0.2, 1, 0.01, 0.7],
  ["damping", "Reverb darkening above \xB7 Hz", 500, 16e3, 10, 6e3],
  ["predelay", "Pre-delay \xB7 ms", 0, 150, 1, 25],
  ["width", "Reverb stereo width", 0, 1, 0.01, 1],
  ["modulation", "Reverb modulation", 0, 1, 0.01, 0.3],
  ["delayMs", "Echo spacing \xB7 ms", 40, 2e3, 1, 375],
  ["feedback", "Echo feedback", 0, 0.85, 0.01, 0.4],
  ["tone", "Echo damping \xB7 Hz", 300, 14e3, 10, 4500],
  ["pingPong", "Ping-pong", 0, 1, 1, 1],
  ["delayToReverb", "Echo \u2192 reverb", 0, 1, 0.01, 0.2],
  ["quality", "Reverb network \xB7 8 / 16 lines", 0, 1, 1, 1],
  ["bypass", "Bypass effects", 0, 1, 1, 0],
  ["reverbReturn", "Reverb return \xB7 dB", -24, 18, 0.5, 0],
  ["reflections", "Early reflections", 0, 8, 0.01, 0],
  // appended with the kernel's parameters 18-20
  ["feedbackLow", "Echo low cut \xB7 Hz", 0, 1e3, 1, 0],
  ["duck", "Echo ducking", 0, 1, 0.01, 0],
  ["reverbType", "Reverb type", 0, 3, 1, 0]
];

// src/modular-audio/ownedEffects.js
function validateOwnedEffectsSpec(raw) {
  const c = JSON.parse(JSON.stringify(raw));
  if (c?.version !== 1 || !Array.isArray(c.parameters) || c.parameters.length !== EFFECTS.length) throw Error("Invalid owned effects configuration");
  const ids = /* @__PURE__ */ new Set();
  for (const pair of c.parameters) {
    if (!Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0]) || ids.has(pair[0])) throw Error("Invalid owned effects parameter identity");
    const d = EFFECTS[pair[0]], v = pair[1];
    if (!d || typeof v !== "number" || !Number.isFinite(v) || v < d[2] || v > d[3]) throw Error("Invalid owned effects parameter value");
    ids.add(pair[0]);
  }
  return c;
}

// src/modular-audio/mixerConfig.js
var MIXER_KINDS = Object.freeze(["strip", "matrix", "fader", "limiter"]);
var finite3 = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
var integer3 = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
var bounds = (kind, rate) => kind === "strip" ? [[0, 64], [0, rate / 2], [0, rate / 2], [-12, 12], [-12, 12], [-12, 12], [-1, 1], [0, 4]] : kind === "matrix" ? [[0, 2], [-1, 1]] : kind === "limiter" ? [[0, 1], [0.05, 1]] : [[0, 4]];
function validateMixerConfig(raw) {
  const c = JSON.parse(JSON.stringify(raw));
  if (c?.version !== 1 || !MIXER_KINDS.includes(c.kind) || !finite3(c.sampleRate, 8e3, 192e3) || typeof c.settled !== "boolean" || !Array.isArray(c.parameters) || !Array.isArray(c.events) || c.events.length > 512) throw Error("Invalid mixer configuration");
  const b = bounds(c.kind, c.sampleRate);
  if (c.parameters.length !== b.length || c.parameters.some((v, i) => !finite3(v, ...b[i]) || c.kind === "limiter" && i === 0 && !Number.isInteger(v))) throw Error("Invalid mixer parameter");
  for (const e of c.events) if (!integer3(e.frame, 0, Number.MAX_SAFE_INTEGER) || !integer3(e.owner, 1, 4294967295) || !integer3(e.parameter, 0, b.length - 1) || !finite3(e.value, ...b[e.parameter]) || c.kind === "limiter" && e.parameter === 0 && !Number.isInteger(e.value)) throw Error("Invalid mixer timestamped event");
  return c;
}

// src/modular-audio/classicConfig.js
var CLASSIC_MODELS = Object.freeze(Array.from({ length: 14 }, (_, i) => i));
var COUNTS = [128, 48, 76, 144, 52, 176, 144, 96, 136, 136, 136, 16, 125, 136];
var shaped = /* @__PURE__ */ new Set([0, 1, 2, 3, 4, 6, 12]);
var fail3 = () => {
  throw Error("Invalid prepared classic configuration");
};
var classicWaveLength = (model) => model === 7 ? 16384 : model === 12 ? 8192 : 0;
var classicParameter = (model, id) => Number.isInteger(id) && id >= 0 && (id < COUNTS[model] || id >= 180 && id < 196 && shaped.has(model) || id >= 200 && id < 216);
function validateClassicConfig(c) {
  if (c?.version !== 1 || !CLASSIC_MODELS.includes(c.model) || !Number.isInteger(c.polyphony) || c.polyphony < 1 || c.polyphony > 32 || !Array.isArray(c.parameters) || c.parameters.length > 256) fail3();
  const seen = /* @__PURE__ */ new Set();
  for (const p of c.parameters) {
    if (!Array.isArray(p) || p.length !== 2 || !classicParameter(c.model, p[0]) || seen.has(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(Math.fround(p[1]))) fail3();
    seen.add(p[0]);
  }
  const length = classicWaveLength(c.model);
  if (c.waves !== void 0 && (!length || !(Array.isArray(c.waves) || c.waves instanceof Float32Array) || c.waves.length !== length || Array.from(c.waves).some((v) => !Number.isFinite(v) || Math.abs(v) > 64))) fail3();
  if (c.model === 7 && !c.waves) fail3();
  return c;
}

// src/modular-audio/ownedPluckedString.js
var STRING_BODIES = Object.freeze(["guitar", "harp", "bass", "kalimba"]);
var range3 = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
function validatePluckedStringSpec(p) {
  if (p?.version !== 1 || !range3(p.sampleRate, 8e3, 192e3) || !range3(p.frequency, 10, p.sampleRate / 6) || !range3(p.decay, 0.15, 5) || !range3(p.damping, 0, 1) || !range3(p.position, 0.05, 0.45) || !range3(p.body, 0, 1) || !range3(p.resonance, 0, 1) || !STRING_BODIES.includes(p.bodyType) || !Number.isInteger(p.seed) || p.seed < 1 || p.seed > 4294967295 || !range3(p.softness, 0, 1)) throw Error("Invalid owned plucked-string configuration");
  return p;
}

// src/modular-audio/pluckedConfig.js
var range4 = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
var uint = (v) => Number.isInteger(v) && v > 0 && v <= 4294967295;
var fail4 = () => {
  throw Error("Invalid prepared plucked voice configuration");
};
function validatePluckedConfig(c) {
  if (c?.version !== 1 || c.sampleRate !== 48e3 || !Number.isInteger(c.voices) || !range4(c.voices, 1, 32) || !range4(c.cutoff, 0, 24e3) || !range4(c.q, 0, 100) || !range4(c.pitch, -2400, 2400) || !range4(c.pitchDecay, 0, 30) || !Array.isArray(c.banks) || c.banks.length > 128 || !Array.isArray(c.notes) || c.notes.length > 2e3 || !Array.isArray(c.controls) || c.controls.length > 4) fail4();
  let bytes = 0;
  for (const b of c.banks) {
    validatePluckedStringSpec(b);
    if (b.sampleRate !== 48e3) fail4();
    bytes += Math.ceil(48e3 * Math.min(6, Math.max(0.35, b.decay * 1.25))) * 4;
  }
  if (bytes > 67108864) fail4();
  for (const m of c.controls) {
    if (!["pitch", "filter"].includes(m.axis) || !["sine", "linear"].includes(m.kind) || !range4(m.phase, 0, 1) || m.phase === 1 || !range4(m.frequency, 0, 44100) || !range4(m.initialDepth, -24e3, 24e3) || !range4(m.targetDepth, -24e3, 24e3) || !range4(m.tauFrames, 0, 144e4) || !Array.isArray(m.points) || m.points.length > 128 || m.kind === "linear" && (m.points.length < 2 || m.points[0][0] !== 0 || m.points.at(-1)[0] < 576e4)) fail4();
    let prior = -1;
    for (const p of m.points) {
      if (!Array.isArray(p) || p.length !== 2 || !range4(p[0], 0, 5952e3) || p[0] <= prior || !range4(p[1], m.kind === "sine" ? 0 : -1.2 - Number.EPSILON, m.kind === "sine" ? 44100 : 1.2 + Number.EPSILON)) fail4();
      prior = p[0];
    }
  }
  const ids = /* @__PURE__ */ new Set(), slots = [];
  let points = 0;
  for (const n of c.notes) {
    if (!uint(n.id) || ids.has(n.id) || !uint(n.owner) || !Number.isInteger(n.bank) || !range4(n.bank, 0, c.banks.length - 1) || !Number.isInteger(n.midi) || !range4(n.midi, 0, 127) || !range4(n.velocity, 0, 1) || !Number.isInteger(n.voice) || !range4(n.voice, 0, c.voices - 1) || !Number.isInteger(n.onsetFrame) || !range4(n.onsetFrame, 0, 576e4) || !Array.isArray(n.gain) || n.gain.length < 2 || !Array.isArray(n.filter) || !n.filter.length) fail4();
    ids.add(n.id);
    for (const [list, gain] of [[n.gain, true], [n.filter, false]]) {
      let prior = -1;
      for (const p of list) {
        if (!Array.isArray(p) || p.length !== 4 || !Number.isInteger(p[0]) || !range4(p[0], gain ? 0 : 1, gain ? 0 : 2) || !range4(p[1], 0, 288e4) || p[1] < prior || gain && p[1] === prior || !range4(p[2], gain ? 0 : -24e3, gain ? 1 : 24e3) || !range4(p[3], 0, 144e4) || p[0] === 2 && p[3] < 0.48) fail4();
        prior = p[1];
        points++;
      }
    }
    if (n.gain[0][1] !== 0 || n.gain.at(-1)[2] !== 0 || n.filter[0][0] !== 1 || n.filter[0][1] !== 0 || !range4(n.cutFrame, 0, n.gain.at(-1)[1]) || n.fadeFrame === null && n.cutFrame !== n.gain.at(-1)[1] || n.fadeFrame !== null && (!range4(n.fadeFrame, 0, n.cutFrame - 480) || n.cutFrame - n.fadeFrame !== 480)) fail4();
  }
  if (points > 65536) fail4();
  for (const n of [...c.notes].sort((a, b) => a.onsetFrame - b.onsetFrame)) {
    const prior = slots[n.voice];
    if (prior && prior.onsetFrame + prior.cutFrame > n.onsetFrame) fail4();
    slots[n.voice] = n;
  }
  return c;
}

// src/modular-audio/ownedMotion.js
var MOTION_PROFILE = "native-motion-v1";
var MOTION_PARAMETERS = Object.freeze([["tremoloDepth", 0, 1, 0], ["tremoloRate", 0.01, 20, 4], ["autoPanDepth", 0, 1, 0], ["autoPanRate", 0.01, 20, 0.2]]);
function validateOwnedMotionSpec(raw) {
  const c = JSON.parse(JSON.stringify(raw));
  if (c?.version !== 1 || c.profile !== MOTION_PROFILE || c.phaseOrigin !== "instance-start" || !Array.isArray(c.parameters) || c.parameters.length !== 4) throw Error("Invalid owned Motion configuration");
  const ids = /* @__PURE__ */ new Set();
  for (const p of c.parameters) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || ids.has(p[0])) throw Error("Invalid Motion parameter identity");
    const d = MOTION_PARAMETERS[p[0]], v = p[1];
    if (!d || typeof v !== "number" || !Number.isFinite(v) || v < d[1] || v > d[2]) throw Error("Invalid Motion parameter value");
    ids.add(p[0]);
  }
  return c;
}

// src/modular-audio/ownedTape.js
var TAPE_PROFILE = "chromium-tape-e14de735-v1";
var TAPE_PARAMETERS = Object.freeze([["wow", 0, 1, 0], ["wowRate", 0.05, 5, 0.6], ["flutter", 0, 1, 0], ["drive", 0, 1, 0], ["tone", 500, 2e4, 9e3]]);
function validateOwnedTapeSpec(raw) {
  const c = JSON.parse(JSON.stringify(raw));
  if (c?.version !== 1 || c.profile !== TAPE_PROFILE || c.phaseOrigin !== "instance-start" || !Array.isArray(c.parameters) || c.parameters.length !== 5 || !Array.isArray(c.driveBank) || c.driveBank.length < 1 || c.driveBank.length > 32) throw Error("Invalid owned Tape profile");
  const ids = /* @__PURE__ */ new Set();
  for (const p of c.parameters) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || ids.has(p[0])) throw Error("Invalid Tape parameter identity");
    const d = TAPE_PARAMETERS[p[0]], value = p[1];
    if (!d || typeof value !== "number" || !Number.isFinite(value) || value < d[1] || value > d[2]) throw Error("Invalid Tape parameter value");
    ids.add(p[0]);
  }
  const bank = /* @__PURE__ */ new Set();
  for (const value of c.driveBank) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1 || bank.has(value)) throw Error("Invalid prepared Tape drive bank");
    bank.add(value);
  }
  if (!bank.has(c.parameters.find((p) => p[0] === 3)[1])) throw Error("Initial Tape drive is not prepared");
  return c;
}

// src/modular-audio/ownedNativeCompressor.js
var NATIVE_COMPRESSOR_PROFILE = "chromium-dynamics-e14de735-v1";
var NATIVE_COMPRESSOR_PARAMETERS = Object.freeze([["threshold", -100, 0, -24], ["knee", 0, 40, 30], ["ratio", 1, 20, 12], ["attack", 0, 1, 3e-3], ["release", 0, 1, 0.25]]);
function validateOwnedNativeCompressorSpec(raw) {
  const c = JSON.parse(JSON.stringify(raw));
  if (c?.version !== 1 || c.profile !== NATIVE_COMPRESSOR_PROFILE || c.controlClock !== "native-128" || !Array.isArray(c.parameters) || c.parameters.length !== 5) throw Error("Invalid native compressor profile");
  const seen = /* @__PURE__ */ new Set();
  for (const p of c.parameters) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || seen.has(p[0])) throw Error("Invalid native compressor parameter identity");
    const d = NATIVE_COMPRESSOR_PARAMETERS[p[0]], v = p[1];
    if (!d || typeof v !== "number" || !Number.isFinite(v) || v < d[1] || v > d[2]) throw Error("Invalid native compressor parameter value");
    seen.add(p[0]);
  }
  return c;
}

// src/modular-audio/ownedNativeCompressorAutomation.js
var NATIVE_COMPRESSOR_AUTOMATION_PROFILE = "chromium-dynamics-k-rate-e14de735-v1";
function validateOwnedNativeCompressorAutomationSpec(raw) {
  const c = JSON.parse(JSON.stringify(raw));
  if (c?.version !== 1 || c.profile !== NATIVE_COMPRESSOR_AUTOMATION_PROFILE || c.controlClock !== "native-128" || !Array.isArray(c.events) || c.events.length > 1024) throw Error("Invalid captured native compressor profile");
  validateOwnedNativeCompressorSpec({ ...c, profile: NATIVE_COMPRESSOR_PROFILE });
  const counts = Array(5).fill(0), last = Array(5).fill(-1);
  for (const e of c.events) {
    const p = NATIVE_COMPRESSOR_PARAMETERS[e?.parameter];
    if (!p || !Number.isInteger(e.parameter) || !["step", "target"].includes(e.kind) || typeof e.seconds !== "number" || !Number.isFinite(e.seconds) || e.seconds < 0 || e.seconds <= last[e.parameter] || typeof e.value !== "number" || !Number.isFinite(e.value) || e.value < p[1] || e.value > p[2] || ++counts[e.parameter] > 256) throw Error("Invalid captured native compressor event/order");
    if (e.kind === "target" && (typeof e.timeConstant !== "number" || !Number.isFinite(e.timeConstant) || e.timeConstant < 0 || !Number.isFinite(Math.fround(e.timeConstant)) || e.timeConstant > 0 && Math.fround(e.timeConstant) === 0)) throw Error("Invalid native target time constant");
    if (e.kind === "step" && e.timeConstant != null && e.timeConstant !== 0) throw Error("A native step has no time constant");
    last[e.parameter] = e.seconds;
  }
  return c;
}

// src/synths/effects/zplaneShapes.js
var BOOST = (level) => Math.max(2, Math.min(18, 18 + level * 0.45));
var NEUTRAL = [5500, 1e3, 0];
var SECTIONS = 12;
var fill = (rows2) => [...rows2, ...Array(SECTIONS - rows2.length).fill(NEUTRAL)];
var vowel = (rows2) => fill(rows2.map(([f, level, bw]) => [f, bw, BOOST(level)]));
var ZPLANE_SHAPES = [
  { name: "Ah", sections: vowel([[650, 0, 80], [1080, -6, 90], [2650, -7, 120], [2900, -8, 130], [3250, -22, 140]]) },
  { name: "Eh", sections: vowel([[400, 0, 70], [1700, -14, 80], [2600, -12, 100], [3200, -14, 120], [3580, -20, 120]]) },
  { name: "Ee", sections: vowel([[290, 0, 40], [1870, -15, 90], [2800, -18, 100], [3250, -20, 120], [3540, -30, 120]]) },
  { name: "Oh", sections: vowel([[400, 0, 40], [800, -10, 80], [2600, -12, 100], [2800, -12, 120], [3e3, -26, 120]]) },
  { name: "Oo", sections: vowel([[350, 0, 40], [600, -20, 60], [2700, -17, 100], [2900, -14, 120], [3300, -26, 120]]) },
  { name: "Nasal", sections: fill([[270, 80, 10], [1e3, 300, -14], [2200, 200, 10], [3e3, 300, 8], [4500, 500, -8]]) },
  { name: "Hollow", sections: fill([[450, 140, -16], [1100, 250, -18], [1800, 300, -14], [2800, 400, -12], [3900, 500, -10], [5200, 600, -8]]) },
  { name: "Dark", sections: fill([[150, 150, 6], [3e3, 3e3, -10], [6e3, 4e3, -16], [1500, 1500, -3]]) },
  { name: "Bright", sections: fill([[200, 200, -8], [500, 500, -4], [5e3, 4e3, 10], [9e3, 6e3, 8]]) },
  { name: "Telephone", sections: fill([[150, 200, -18], [400, 300, -8], [1800, 900, 8], [3400, 1e3, 2], [6e3, 3e3, -18], [9e3, 4e3, -20]]) },
  { name: "Wah low", sections: fill([[450, 130, 18], [1200, 500, 6], [2800, 1800, -4], [6e3, 4e3, -8]]) },
  { name: "Wah high", sections: fill([[1800, 300, 18], [3200, 800, 8], [600, 500, -6], [7e3, 4e3, -6]]) }
];
var ZPLANE_SHAPE_NAMES = ZPLANE_SHAPES.map((s) => s.name);
var ZPLANE_CUSTOM = ZPLANE_SHAPES.length;
ZPLANE_SHAPE_NAMES.push("Custom");
var FLAT_ROWS = Array.from({ length: SECTIONS }, (_, i) => {
  const f = Math.round(110 * (9e3 / 110) ** (i / (SECTIONS - 1)));
  return [f, Math.round(f * 0.4), 0];
});

// src/modular-audio/ownedRackFx.js
var RACK_FX_KINDS = Object.freeze(["crusher", "pitch", "zplane"]);
var RACK_FX_PARAMETERS = Object.freeze({ crusher: [["bits", 2, 16, 8], ["divide", 1, 32, 1], ["mix", 0, 1, 1]], pitch: [["semitones", -24, 24, -12], ["cents", -50, 50, 0], ["mix", 0, 1, 0.5]], zplane: [["a", 0, 63, 0], ["b", 0, 63, 2], ["morph", 0, 1, 0], ["shift", -1, 1, 0], ["q", 0, 1, 0.5], ["mix", 0, 1, 1]] });
var rows = (raw) => Array.isArray(raw) && raw.length === 12 && raw.every((r) => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite) && r[0] >= 20 && r[0] <= 12e3 && r[1] >= 8 && r[1] <= 8e3 && r[2] >= -30 && r[2] <= 30);
function validateOwnedRackFxSpec(raw) {
  const c = JSON.parse(JSON.stringify(raw)), parameters = RACK_FX_PARAMETERS[c?.kind];
  if (c?.version !== 1 || !parameters || !Array.isArray(c.parameters) || c.parameters.length !== parameters.length) throw Error("Invalid owned rack FX configuration");
  const ids = /* @__PURE__ */ new Set();
  for (const p of c.parameters) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || ids.has(p[0])) throw Error("Invalid rack FX parameter identity");
    const d = parameters[p[0]], v = p[1];
    if (!d || typeof v !== "number" || !Number.isFinite(v) || v < d[1] || v > d[2]) throw Error("Invalid rack FX parameter value");
    ids.add(p[0]);
  }
  if (c.kind === "zplane") {
    if (!Array.isArray(c.shapes) || c.shapes.length < 1 || c.shapes.length > 64 || c.shapes.some((s) => !rows(s)) || !rows(c.custom?.a) || !rows(c.custom?.b)) throw Error("Invalid rack FX shapes");
  } else if (c.shapes !== void 0 || c.custom !== void 0) throw Error("Shapes require z-plane");
  return c;
}

// src/modular-audio/ownedVoiceFx.js
var VOICE_FX_KINDS = Object.freeze(["shimmer", "freeze"]);
var VOICE_FX_RANDOM = "xorshift32-v1";
var VOICE_FX_PARAMETERS = Object.freeze({ shimmer: [["mix", 0, 1, 0], ["decay", 0.3, 30, 6], ["semitones", 0, 24, 12], ["climb", 0, 0.95, 0.5], ["tone", 500, 16e3, 7e3]], freeze: [["mix", 0, 1, 0], ["hold", 0, 1, 0], ["length", 0.25, 4, 2], ["fade", 0.02, 30, 1]] });
function validateOwnedVoiceFxSpec(raw) {
  const c = JSON.parse(JSON.stringify(raw)), parameters = VOICE_FX_PARAMETERS[c?.kind];
  if (c?.version !== 1 || !parameters || c.random !== VOICE_FX_RANDOM || !Number.isInteger(c.seed) || c.seed < 1 || c.seed > 4294967295 || !Array.isArray(c.parameters) || c.parameters.length !== parameters.length) throw Error("Invalid owned voice FX configuration");
  const ids = /* @__PURE__ */ new Set();
  for (const p of c.parameters) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || ids.has(p[0])) throw Error("Invalid voice FX parameter identity");
    const d = parameters[p[0]], v = p[1];
    if (!d || typeof v !== "number" || !Number.isFinite(v) || v < d[1] || v > d[2] || c.kind === "freeze" && p[0] === 1 && v !== 0 && v !== 1) throw Error("Invalid voice FX parameter value");
    ids.add(p[0]);
  }
  return c;
}

// src/modular-audio/executionPolicy.js
function workerOnlyModules(patch, contracts) {
  const modules = Array.isArray(patch?.modules) ? patch.modules : [], descriptors = Array.isArray(contracts?.modules) ? contracts.modules : [];
  return modules.filter((n) => n.type === "voice.freeze" || descriptors.some((d) => d.type === n.type && d.version === n.version && d.execution === "worker-only")).map((n) => ({ id: n.id, type: n.type, version: n.version }));
}
function workerRequiredMessage(modules) {
  return `Worker executor required for ${modules.map((n) => `${n.type}${n.id === void 0 ? "" : ` (module ${n.id})`}`).join(", ")}; serial realtime playback is unavailable.`;
}
function assertSerialRealtimeAllowed(patch, contracts) {
  const modules = workerOnlyModules(patch, contracts);
  if (modules.length) throw Error(workerRequiredMessage(modules));
}

// src/modular-audio/runtime.js
var checked = (code) => {
  if (code) throw Error(code === 9 ? "Latency compensation requires fixed integer path differences; fractional differences or changing FM quality need another alignment policy." : `Graph rejected operation (${code})`);
};
var uint2 = (n) => Number.isInteger(n) && n > 0 && n <= 4294967295;
var frame3 = (n) => Number.isSafeInteger(n) && n >= 0;
var finite4 = (n) => typeof n === "number" && Number.isFinite(n);
function validatePatch(raw, contracts) {
  const p = JSON.parse(JSON.stringify(raw));
  if (p.latencyCompensation !== void 0 && typeof p.latencyCompensation !== "boolean") throw Error("Invalid latency compensation policy");
  if (p?.version !== contracts.patchVersion || !Array.isArray(p.modules) || !p.modules.length || p.modules.length > contracts.maxNodes || !Array.isArray(p.connections) || p.connections.length > contracts.maxEdges || !Array.isArray(p.events) || p.events.length > contracts.maxEvents) throw Error("Invalid patch version or resource bounds");
  const modules = /* @__PURE__ */ new Map(), edges = /* @__PURE__ */ new Set(), inputs = /* @__PURE__ */ new Set(), dependencies = /* @__PURE__ */ new Map();
  for (const n of p.modules) {
    const d = contracts.modules.find((d2) => d2.type === n.type && d2.version === n.version);
    if (!uint2(n.id) || modules.has(n.id) || !d || !n.parameters || typeof n.parameters !== "object" || Array.isArray(n.parameters)) throw Error("Invalid module identity/contract");
    for (const [id, value] of Object.entries(n.parameters)) {
      const param = d.parameters.find((p2) => p2.id === id);
      if (!param || !finite4(value) || value < param.min || value > param.max || ["enum", "boolean"].includes(param.unit) && !Number.isInteger(value)) throw Error(`Invalid parameter ${id}`);
    }
    modules.set(n.id, n.type === "legacy.classic" ? { ...d, classicModel: n.config?.model } : d);
    if (d.type === "host.audio" && n.config !== void 0 && (n.config?.version !== 1 || !finite4(n.config.latencyFrames) || n.config.latencyFrames < 0 || n.config.latencyFrames > 262144)) throw Error("Invalid declared host input latency");
    if (d.type.startsWith("desk.")) {
      n.config = validateMixerConfig(n.config);
      if (d.type !== `desk.${n.config.kind}` || Object.keys(n.parameters).length || n.config.events.length) throw Error("Mixer graph requires complete matching configuration and graph-owned events");
    }
    if (["legacy.inserts", "legacy.effects"].includes(d.type)) {
      if (Object.keys(n.parameters).length) throw Error("Effects use complete configuration targets");
      n.config = (d.type === "legacy.inserts" ? validateOwnedInsertsSpec : validateOwnedEffectsSpec)(n.config);
      const settled = d.type === "legacy.inserts";
      if (n.config.settled !== void 0 && n.config.settled !== settled) throw Error("Unsupported effect startup policy");
      n.config.settled = settled;
    }
    if (d.type === "graph.delay" && (n.config?.version !== 1 || !Number.isInteger(n.config.frames) || n.config.frames < 0 || n.config.frames > 262144 || Object.keys(n.parameters).length)) throw Error("Invalid fixed delay configuration");
    if (d.type === "legacy.classic") n.config = validateClassicConfig(n.config);
    if (d.type === "legacy.plucked") n.config = validatePluckedConfig(n.config);
    if (d.type === "native.compressor") {
      if (n.config?.events !== void 0) throw Error("Streaming compressor cannot drop captured timeline events");
      n.config = validateOwnedNativeCompressorSpec(n.config);
      if (Object.keys(n.parameters).length) throw Error("Native compressor requires complete configuration");
    }
    if (d.type === "native.compressor.capture") {
      n.config = validateOwnedNativeCompressorAutomationSpec(n.config);
      if (Object.keys(n.parameters).length) throw Error("Captured compressor has immutable configuration targets");
    }
    if (d.type === "voice.tape") {
      n.config = validateOwnedTapeSpec(n.config);
      if (Object.keys(n.parameters).length) throw Error("Tape requires complete configuration");
    }
    if (d.type === "voice.motion") {
      n.config = validateOwnedMotionSpec(n.config);
      if (Object.keys(n.parameters).length) throw Error("Motion requires complete configuration");
    }
    if (d.type.startsWith("rack.") || d.type.startsWith("voice.") && !["voice.motion", "voice.tape"].includes(d.type)) {
      n.config = (d.type.startsWith("rack.") ? validateOwnedRackFxSpec : validateOwnedVoiceFxSpec)(n.config);
      if (d.type.split(".")[1] !== n.config.kind || Object.keys(n.parameters).length) throw Error("Effects require complete matching configuration");
    }
    if (["legacy.core", "legacy.fm"].includes(d.type)) n.config = validatePitchedConfig(n.config, d.type === "legacy.fm");
    if (d.type === "legacy.piano") {
      n.config = validatePianoConfig(n.config);
      if (n.version !== n.config.version) throw Error("Piano module/configuration version mismatch");
    }
    if (d.type === "legacy.iowa") n.config = validateIowaConfig(n.config);
    if (d.type === "legacy.percussion") {
      if (n.version === 1 && n.config !== void 0 || n.version === 2 && n.config === void 0) throw Error("Invalid percussion kit: requires module version 2 and complete configuration");
      if (n.version === 2) n.config = validatePercussionConfig(n.config, d.kitConfiguration);
    }
    dependencies.set(n.id, /* @__PURE__ */ new Set());
  }
  for (const e of p.connections) {
    if (!uint2(e.id) || edges.has(e.id) || !modules.has(e.from?.module) || !modules.has(e.to?.module)) throw Error("Invalid connection identity");
    edges.add(e.id);
    const source = modules.get(e.from.module).ports.find((p2) => p2.id === e.from.port && p2.direction === "out");
    const target = modules.get(e.to.module);
    if (!source) throw Error("Missing output port");
    if (e.kind === "audio") {
      const dest = target.ports.find((p2) => p2.id === e.to.port && p2.direction === "in");
      if (!dest || source.family !== "audio" || dest.family !== source.family || dest.channels !== source.channels) throw Error("Incompatible audio buses");
      const input = `${e.to.module}:${dest.id}`;
      if (inputs.has(input)) throw Error("Duplicate input: use an explicit mixer");
      if (e.enabled !== void 0 && (typeof e.enabled !== "boolean" || dest.role !== "detector")) throw Error("Only detector connections can be disabled");
      inputs.add(input);
    } else if (e.kind === "modulation") {
      const dest = target.parameters.find((p2) => p2.id === e.to.parameter);
      if (source.family !== "control" || source.channels !== 1 || !dest?.modulation || !["bipolar", "unipolar"].includes(e.mapping) || !finite4(e.depth) || Math.abs(e.depth) > 4 || !finite4(e.offset) || Math.abs(e.offset) > 4) throw Error("Incompatible modulation mapping");
    } else throw Error("Unsupported connection family");
    dependencies.get(e.to.module).add(e.from.module);
  }
  if (p.modules.filter((n) => n.type.startsWith("native.compressor")).length > 8) throw Error("Native compressor instance bounds");
  if (p.modules.filter((n) => n.type === "legacy.percussion").length > 8) throw Error("Percussion instance limit exceeded");
  if (p.modules.filter((n) => n.type === "legacy.inserts").length > 8 || p.modules.filter((n) => n.type === "legacy.effects").length > 4) throw Error("Effects instance limit exceeded");
  if (p.modules.filter((n) => ["legacy.core", "legacy.fm", "legacy.piano", "legacy.iowa", "legacy.classic", "legacy.plucked"].includes(n.type)).length > 8) throw Error("Pitched instance limit exceeded");
  if ([...modules.values()].filter((d) => d.type === "ref.output").length !== 1) throw Error("Exactly one output is required");
  for (const [id, d] of modules) for (const port of d.ports) if (port.required && !inputs.has(`${id}:${port.id}`)) throw Error("Missing required input");
  const ready = /* @__PURE__ */ new Set();
  while (ready.size < modules.size) {
    const next = [...dependencies].find(([id, deps]) => !ready.has(id) && [...deps].every((id2) => ready.has(id2)));
    if (!next) throw Error("Unsupported graph cycle");
    ready.add(next[0]);
  }
  if (p.latencyCompensation && p.modules.some((n) => n.type === "voice.tape")) throw Error("Tape intentional modulated wet delay prevents fixed latency compensation");
  for (const n of p.modules.filter((n2) => n2.type === "voice.tape")) for (const e of p.events.filter((e2) => e2.target === n.id && e2.kind === "parameter" && e2.parameter === "drive")) if (!n.config.driveBank.includes(e.value)) throw Error("Tape drive curve is not prepared");
  const owners = /* @__PURE__ */ new Map();
  if (p.modules.filter((n) => n.type === "voice.freeze").length > 2 || p.modules.filter((n) => n.type.startsWith("voice.")).length > 8 || p.modules.filter((n) => n.type.startsWith("rack.")).length > 16) throw Error("Owned effect instance bounds");
  for (const e of p.events) {
    eventPacket(e, modules, p.connections);
    if (e.kind === "note" && e.note && [0, 1, 3, 5].includes(e.event)) {
      const k = e.target + ":" + e.note;
      if (owners.has(k) && owners.get(k) !== e.owner) throw Error("Pitched note owner conflict");
      owners.set(k, e.owner);
    }
  }
  for (const n of p.modules.filter((n2) => n2.type === "legacy.plucked")) {
    const used = /* @__PURE__ */ new Set();
    for (const e of p.events.filter((e2) => e2.target === n.id && e2.kind === "note" && e2.event === 0)) {
      const v = n.config.notes.find((v2) => v2.id === e.note);
      if (!v || used.has(v.id) || e.frame !== v.onsetFrame || Math.fround(e.a) !== Math.fround(v.midi) || Math.fround(e.b) !== Math.fround(v.velocity)) throw Error("Plucked trigger/configuration mismatch");
      used.add(v.id);
    }
  }
  for (const n of p.modules.filter((n2) => n2.type === "legacy.piano")) {
    const used = /* @__PURE__ */ new Set(), ends = [], slots = [];
    for (const e of p.events.filter((e2) => e2.target === n.id && e2.kind === "note" && e2.event === 0).sort((a, b) => a.frame - b.frame)) {
      const v = n.config.notes.find((v2) => v2.id === e.note);
      if (!v || used.has(v.id) || Math.fround(e.a) !== Math.fround(v.midi) || Math.fround(e.b) !== Math.fround(v.velocity)) throw Error("Piano trigger/configuration mismatch");
      used.add(v.id);
      if (n.config.version === 3) {
        const prior = slots[v.voice];
        if (v.onsetFrame !== e.frame || prior && prior.onsetFrame + prior.cutFrame > e.frame) throw Error("Piano slot lifetime/trigger mismatch");
        slots[v.voice] = v;
      } else {
        for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= e.frame) ends.splice(i, 1);
        if (ends.length >= n.config.voices) throw Error("Piano voice-steal fade is not supported");
        ends.push(e.frame + v.gain.at(-1)[1]);
      }
    }
  }
  for (const n of p.modules.filter((n2) => n2.type === "legacy.iowa")) {
    const used = /* @__PURE__ */ new Set();
    for (const e of p.events.filter((e2) => e2.target === n.id && e2.kind === "note" && e2.event !== 4)) {
      const v = n.config.notes.find((v2) => v2.id === e.note);
      if (!v || e.event === 0 && (used.has(v.id) || Math.fround(e.a) !== Math.fround(v.midi) || Math.fround(e.b) !== Math.fround(v.velocity))) throw Error("Iowa trigger/configuration mismatch");
      if (e.event === 0) used.add(v.id);
    }
  }
  for (const n of p.modules) if (p.events.filter((e) => e.target === n.id && e.kind === "note").length > 4e3) throw Error("Pitched note capacity exceeded");
  for (const n of p.modules.filter((n2) => n2.type === "legacy.classic")) {
    const events = p.events.filter((e) => e.target === n.id && e.kind === "classic");
    if (events.length > 4e3 || new Set(events.map((e) => e.owner)).size > 1 || events.some((e) => e.event === 5 && !classicParameter(n.config.model, e.id) || e.event === 6 && ![8, 9, 10, 11, 13].includes(n.config.model))) throw Error("Invalid classic source contract");
  }
  return p;
}
function eventPacket(e, modules, connections) {
  const d = modules.get(e.target);
  if (!frame3(e.frame) || !uint2(e.owner) || !d) throw Error("Invalid event frame/ownership/target");
  if (d.type === "legacy.classic") {
    if (e.kind === "cancel") return [e.frame, e.target, e.owner, 4, 0, 0];
    if (e.kind === "classic" && Number.isInteger(e.event) && e.event >= 0 && e.event <= 6 && Number.isInteger(e.id) && e.id >= 0 && e.id <= 4294967295 && finite4(e.a) && finite4(e.b) && Number.isFinite(Math.fround(e.a)) && Number.isFinite(Math.fround(e.b))) {
      const k = e.event;
      if ([0, 1, 3].includes(k) && !e.id || k === 0 && (e.a < 0 || e.a > 127 || e.b < 0 || e.b > 1) || k === 2 && e.id > 6 || k === 3 && (e.a < ([8, 9, 10, 13].includes(d.classicModel) && [2, 3].includes(e.id % 4) ? -1 : 0) || e.a > 1) || k === 5 && e.id > 215 || k === 6 && (e.id > 8 || e.a < 0 || e.a > 16777215 || !Number.isInteger(e.a))) throw Error("Invalid classic event values");
      return [e.frame, e.target, e.owner, k, e.id, e.a, e.b];
    }
  }
  if (["legacy.core", "legacy.fm", "legacy.piano", "legacy.iowa", "legacy.plucked"].includes(d.type)) {
    if (d.type === "legacy.iowa" && e.kind === "note" && (![0, 1, 4].includes(e.event) || e.frame % 128 !== 0)) throw Error("Iowa notes require canonical 128-frame ticks");
    if (["legacy.piano", "legacy.plucked"].includes(d.type) && e.kind === "note" && ![0, 4].includes(e.event)) throw Error("Unsupported finite piano event");
    if (e.kind === "cancel") return [e.frame, e.target, e.owner, 4, 0, 0];
    if (e.kind === "note" && Number.isInteger(e.event) && e.event >= 0 && e.event <= 6 && Number.isInteger(e.note) && e.note >= 0 && e.note <= 4294967295 && finite4(e.a) && finite4(e.b)) {
      const k = e.event, id = e.note, a = e.a, b = e.b;
      if ([0, 1, 5].includes(k) && !id || k === 0 && (a < 0 || a > 127 || b < 0 || b > 1) || [2, 3].includes(k) && (a < 0 || a > 1) || k === 5 && (a < 0 || a > 127 || b < 0 || b > 8) || k === 6 && (id > 2 || a < 0 || a > 3 || b < 0 || b > 1)) throw Error("Invalid pitched note values");
      return [e.frame, e.target, e.owner, k, id, a, b];
    }
  }
  if (e.kind === "gate" && d.type === "ref.tone" && typeof e.value === "boolean") return [e.frame, e.target, e.owner, 1, 0, Number(e.value)];
  if (e.kind === "hit" && d.type === "legacy.percussion" && Number.isInteger(e.drum) && e.drum >= 0 && e.drum < 14 && Number.isInteger(e.model) && e.model >= 0 && e.model <= 2 && Number.isInteger(e.hit) && e.hit >= 0 && e.hit <= 4294967295 && finite4(e.velocity) && e.velocity >= 0 && e.velocity <= 1 && finite4(e.duration) && e.duration >= 0 && e.duration <= 30 && finite4(e.vary) && Math.abs(e.vary) <= 1 && finite4(e.tone) && Math.abs(e.tone) <= 1 && finite4(e.decay) && e.decay >= 0.5 && e.decay <= 2) return [e.frame, e.target, e.owner, e.drum, e.velocity, e.duration, e.vary, e.tone, e.decay, e.hit, e.model];
  if (e.kind === "parameter") {
    if (d.type === "native.compressor" && e.frame % 128 !== 0) throw Error("Native compressor targets require128-frame boundaries");
    if ((["legacy.inserts", "legacy.effects"].includes(d.type) || d.type.startsWith("rack.") || d.type.startsWith("voice.") && d.type !== "voice.motion") && e.frame % 128 !== 0) throw Error("Effect parameters require canonical 128-frame input boundaries");
    if (d.type === "voice.freeze" && e.parameter === "hold" && e.value !== 0 && e.value !== 1) throw Error("Invalid Freeze hold");
    const p = d.parameters.find((p2) => p2.id === e.parameter);
    if (p && finite4(e.value) && e.value >= p.min && e.value <= p.max && (!["enum", "boolean"].includes(p.unit) || Number.isInteger(e.value))) return [e.frame, e.target, e.owner, 0, p.code, e.value];
  }
  if (e.kind === "modulation" && typeof e.value === "boolean" && connections.some((c) => c.id === e.edge && c.kind === "modulation" && c.to.module === e.target)) return [e.frame, e.target, e.owner, 2, e.edge, Number(e.value)];
  if (e.kind === "connection" && typeof e.value === "boolean" && d.type === "graph.compressor" && connections.some((c) => c.id === e.edge && c.kind === "audio" && c.to.module === e.target && c.to.port === "detector.in")) return [e.frame, e.target, e.owner, 3, e.edge, Number(e.value)];
  throw Error("Invalid event contract");
}
function savePatch(patch, contracts) {
  return JSON.stringify(validatePatch(patch, contracts), null, 2) + "\n";
}
function loadPatch(text, contracts) {
  return validatePatch(JSON.parse(text), contracts);
}
var ReferenceGraph = class {
  constructor(engine, patch, contracts, sampleRate, maxBlock = 2048) {
    this.engine = engine;
    if (!Number.isInteger(maxBlock) || maxBlock < 1 || maxBlock > contracts.maxBlock) throw Error("Invalid block size");
    this.patch = validatePatch(patch, contracts);
    if (this.patch.modules.some((n) => ["legacy.piano", "legacy.plucked"].includes(n.type)) && sampleRate !== 48e3) throw Error("Prepared piano v1 requires 48 kHz");
    if (this.patch.modules.some((n) => n.type === "legacy.iowa" && n.config.sampleRate !== sampleRate)) throw Error("Prepared Iowa sample rate mismatch");
    if (this.patch.modules.some((n) => n.type.startsWith("desk.") && n.config.sampleRate !== sampleRate)) throw Error("Mixer sample rate mismatch");
    if (this.patch.modules.some((n) => n.type === "native.compressor.capture" && n.config.events.some((e) => e.seconds * sampleRate > 9007199254740864))) throw Error("Captured native compressor event exceeds exact frame range");
    this.contracts = contracts;
    this.modules = new Map(this.patch.modules.map((n) => {
      const d = contracts.modules.find((d2) => d2.type === n.type && d2.version === n.version);
      return [n.id, n.type === "legacy.classic" ? { ...d, classicModel: n.config.model } : d];
    }));
    if (engine.graph_api() !== contracts.api) throw Error("Graph ABI mismatch");
    this.handle = engine.graph_new(sampleRate, maxBlock);
    if (!this.handle) throw Error("Invalid sample rate/block size");
    this.maxBlock = maxBlock;
    try {
      checked(engine.graph_latency_compensation(this.handle, Number(this.patch.latencyCompensation ?? false)));
      for (const n of this.patch.modules) {
        const d = this.modules.get(n.id);
        checked(engine.graph_node(this.handle, n.id, d.code, n.version));
        for (const [key, value] of Object.entries(n.parameters)) checked(engine.graph_base(this.handle, n.id, d.parameters.find((p) => p.id === key).code, value));
        if (d.type === "host.audio" && n.config) checked(engine.graph_input_latency(this.handle, n.id, n.config.latencyFrames));
        if (d.type.startsWith("desk.")) n.config.parameters.forEach((value, index) => checked(engine.graph_mixer_config(this.handle, n.id, index, value, Number(n.config.settled))));
        if (d.type === "legacy.classic") {
          const c = n.config;
          checked(engine.graph_classic_config(this.handle, n.id, c.model, c.polyphony));
          for (const [index, value] of c.parameters) checked(engine.graph_classic_param(this.handle, n.id, index, value));
          if (c.waves) {
            const len = engine.graph_classic_wave_len(this.handle, n.id), ptr = engine.graph_classic_wave_ptr(this.handle, n.id);
            if (len !== c.waves.length || !ptr) throw Error("Classic wave preparation mismatch");
            new Float32Array(engine.memory.buffer, ptr, len).set(c.waves);
            checked(engine.graph_classic_wave_commit(this.handle, n.id));
          }
        }
        if (d.type.startsWith("native.compressor")) {
          for (const [index, value] of n.config.parameters) checked(engine.graph_native_comp_initial(this.handle, n.id, index, value));
          if (d.type === "native.compressor.capture") for (const event of n.config.events) checked(engine.graph_native_comp_event(this.handle, n.id, event.parameter, event.kind === "step" ? 0 : 1, event.seconds, event.value, event.timeConstant ?? 0));
        }
        if (d.type === "voice.tape") {
          for (const value of n.config.driveBank) checked(engine.graph_tape_drive(this.handle, n.id, value));
          for (const [index, value] of n.config.parameters) checked(engine.graph_fx_initial(this.handle, n.id, index, value));
        }
        if (d.type === "voice.motion") for (const [index, value] of n.config.parameters) checked(engine.graph_fx_initial(this.handle, n.id, index, value));
        if (d.type.startsWith("rack.") || d.type.startsWith("voice.") && !["voice.motion", "voice.tape"].includes(d.type)) {
          const c = n.config;
          if (d.type.startsWith("voice.")) checked(engine.graph_voice_fx_config(this.handle, n.id, c.seed));
          for (const [index, value] of c.parameters) checked(engine.graph_fx_initial(this.handle, n.id, index, value));
          if (c.kind === "zplane") {
            checked(engine.graph_rack_shape_count(this.handle, n.id, c.shapes.length));
            c.shapes.forEach((rows2, shape) => rows2.forEach((row, section) => checked(engine.graph_rack_shape_row(this.handle, n.id, shape, section, ...row))));
            ["a", "b"].forEach((key, i) => c.custom[key].forEach((row, section) => checked(engine.graph_rack_shape_row(this.handle, n.id, 64 + i, section, ...row))));
          }
        }
        if (["legacy.inserts", "legacy.effects"].includes(d.type)) {
          for (const [index, value] of n.config.parameters) checked(engine.graph_base(this.handle, n.id, index, value));
          checked(engine.graph_fx_config(this.handle, n.id, Number(n.config.settled)));
        }
        if (d.type === "graph.delay") checked(engine.graph_delay_config(this.handle, n.id, n.config.frames));
        if (d.type === "legacy.percussion" && n.config) {
          const c = n.config;
          checked(engine.graph_percussion_config(this.handle, n.id, c.version, d.kitConfiguration.voices.indexOf(c.voice) + 1));
          c.drums.forEach((v, i) => checked(engine.graph_percussion_drum(this.handle, n.id, i, Number(v.on), v.level, v.tone, v.decay)));
        }
        if (d.type === "legacy.iowa") {
          const c = n.config;
          checked(engine.graph_iowa_config(this.handle, n.id, c.voices));
          for (const s of c.banks) {
            checked(engine.graph_iowa_spec(this.handle, n.id, s.id, Number(s.kind === "decay"), s.f0 ?? 0, s.seconds ?? 0, s.rate ?? 0, s.depth ?? 0, s.tremolo ?? 0, s.pitchWander ?? 0, s.levelWander ?? 0));
            for (const [field, a] of iowaFields(s)) {
              const ptr = engine.graph_iowa_buffer_new(a.length);
              if (!ptr) throw Error("Iowa preparation scratch bound exceeded");
              try {
                new Float64Array(engine.memory.buffer, engine.graph_iowa_buffer_ptr(ptr), a.length).set(a);
                checked(engine.graph_iowa_data(this.handle, n.id, s.id, field, ptr));
              } finally {
                engine.graph_iowa_buffer_free(ptr);
              }
            }
          }
          for (const v of c.notes) checked(engine.graph_iowa_note_spec(this.handle, n.id, v.id, v.bank, v.midi, v.velocity, v.gain, v.tune, Number(v.ring), v.roll?.rate ?? 0, v.roll?.level ?? 0, v.roll?.timing ?? 0, v.slide?.cents ?? 0, v.slide?.seconds ?? 0));
        }
        if (d.type === "legacy.plucked") {
          const c = n.config;
          checked(engine.graph_plucked_config(this.handle, n.id, c.voices, c.cutoff, c.q, c.pitch, c.pitchDecay));
          for (const b of c.banks) checked(engine.graph_plucked_bank(this.handle, n.id, b.frequency, b.decay, b.damping, b.position, b.body, b.resonance, STRING_BODIES.indexOf(b.bodyType), b.seed, b.softness));
          for (const v of c.notes) {
            checked(engine.graph_plucked_spec(this.handle, n.id, v.id, v.bank, v.midi, v.velocity));
            for (const point of [...v.gain, ...v.filter]) checked(engine.graph_plucked_point(this.handle, n.id, v.id, ...point));
            checked(engine.graph_plucked_lifetime(this.handle, n.id, v.id, v.voice, v.onsetFrame, v.fadeFrame ?? -1, v.cutFrame));
          }
          c.controls.forEach((m, index) => {
            checked(engine.graph_plucked_control(this.handle, n.id, Number(m.axis === "filter"), Number(m.kind === "linear"), m.phase, m.frequency, m.initialDepth, m.targetDepth, m.tauFrames));
            for (const point of m.points) checked(engine.graph_plucked_control_point(this.handle, n.id, index, ...point));
          });
        }
        if (d.type === "legacy.piano") {
          const c = n.config;
          checked(engine.graph_piano_config(this.handle, n.id, c.voices, c.cutoff, c.q, c.pitch, c.pitchDecay));
          for (const [i, m] of (c.controls ?? []).entries()) {
            checked(engine.graph_piano_control(this.handle, n.id, Number(m.axis === "filter"), Number(m.kind === "linear"), m.phase, m.frequency, m.initialDepth, m.targetDepth, m.tauFrames));
            for (const [frame4, value] of m.points) checked(engine.graph_piano_control_point(this.handle, n.id, i, frame4, value));
          }
          for (const b of c.banks) checked(engine.graph_piano_bank(this.handle, n.id, b.frequency, PIANO_TYPES.indexOf(b.type), b.decay, b.brightness, b.hammer, b.unison, b.velocity, b.seed, b.resonance, b.softness, b.sustain, b.wear));
          for (const v of c.notes) {
            checked(engine.graph_piano_spec(this.handle, n.id, v.id, v.bank, v.midi, v.velocity));
            for (const p of [...v.gain, ...v.filter]) checked(engine.graph_piano_point(this.handle, n.id, v.id, ...p));
            if (c.version === 3) checked(engine.graph_piano_lifetime(this.handle, n.id, v.id, v.voice, v.onsetFrame, v.fadeFrame ?? -1, v.cutFrame));
          }
        }
        if (["legacy.core", "legacy.fm"].includes(d.type)) {
          const c = compilePitched(n.config, d.type === "legacy.fm", sampleRate);
          for (const [scope, index, value] of c.base) checked(engine.graph_pitch_config(this.handle, n.id, scope, index, value));
          checked(engine.graph_pitch_performance(this.handle, n.id, c.performance.mode, c.performance.portamento, Number(c.performance.glide === "always")));
          for (const point of c.points) checked(engine.graph_pitch_point(this.handle, n.id, ...point));
          for (const point of c.gains) checked(engine.graph_pitch_point(this.handle, n.id, ...point));
        }
      }
      for (const c of this.patch.connections) {
        const dest = this.modules.get(c.to.module);
        if (c.kind === "audio") {
          checked(engine.graph_audio_port(this.handle, c.id, c.from.module, this.modules.get(c.from.module).ports.find((p) => p.id === c.from.port).code, c.to.module, dest.ports.find((p) => p.id === c.to.port).code));
          if (c.enabled === false) checked(engine.graph_detector_connection(this.handle, c.id, 0));
        } else checked(engine.graph_mod(this.handle, c.id, c.from.module, c.to.module, dest.parameters.find((p) => p.id === c.to.parameter).code, c.depth, c.offset, Number(c.mapping === "unipolar")));
      }
      checked(engine.graph_prepare(this.handle));
      for (const event of this.patch.events) this.enqueue(event);
      this.refresh();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  refresh() {
    this.alive();
    this.left = new Float32Array(this.engine.memory.buffer, this.engine.graph_left(this.handle), this.maxBlock);
    this.right = new Float32Array(this.engine.memory.buffer, this.engine.graph_right(this.handle), this.maxBlock);
    this.inputs = /* @__PURE__ */ new Map();
    this.kicks = /* @__PURE__ */ new Map();
    this.outputs = /* @__PURE__ */ new Map();
    for (const [id, d] of this.modules) {
      this.outputs.set(id, new Float32Array(this.engine.memory.buffer, this.engine.graph_node_ptr(this.handle, id), this.maxBlock * 2));
      if (d.hostInput) this.inputs.set(id, new Float32Array(this.engine.memory.buffer, this.engine.graph_input_ptr(this.handle, id), this.maxBlock * 2));
      if (d.type === "legacy.percussion") this.kicks.set(id, new Float32Array(this.engine.memory.buffer, this.engine.graph_kick_ptr(this.handle, id), this.maxBlock * 2));
    }
  }
  enqueue(event) {
    this.alive();
    if (event.kind === "parameter" && this.modules.get(event.target)?.type.startsWith("desk.")) {
      const packet3 = eventPacket(event, this.modules, this.patch.connections);
      checked(this.engine.graph_mixer_param(this.handle, packet3[0], packet3[1], packet3[2], packet3[4], packet3[5]));
      return;
    }
    if (event.kind === "parameter" && ["rack.", "voice.", "native.compressor"].some((prefix) => this.modules.get(event.target)?.type.startsWith(prefix))) {
      const p = eventPacket(event, this.modules, this.patch.connections);
      checked(this.engine.graph_fx_param(this.handle, p[0], p[1], p[2], p[4], p[5]));
      return;
    }
    checked(this.engine[event.kind === "classic" ? "graph_classic_event" : event.kind === "hit" ? "graph_hit" : event.kind === "note" ? "graph_note" : "graph_event"](this.handle, ...eventPacket(event, this.modules, this.patch.connections)));
  }
  alive() {
    if (!this.handle) throw Error("Disposed graph");
  }
  render(frames) {
    this.alive();
    if (!Number.isInteger(frames) || frames < 0 || frames > this.maxBlock) throw Error("Invalid frame count");
    checked(this.engine.graph_render(this.handle, frames));
  }
  stats() {
    this.alive();
    return Object.fromEntries(["frame", "late", "overflow", "applied"].map((key, i) => [key, this.engine.graph_stat(this.handle, i)]));
  }
  baseValue(id, parameter) {
    this.alive();
    const d = this.modules.get(id), p = d?.parameters.find((p2) => p2.id === parameter);
    if (!p) throw Error("Invalid parameter");
    return this.engine[d.type.startsWith("desk.") ? "graph_mixer_value" : ["rack.", "voice.", "native.compressor"].some((x) => d.type.startsWith(x)) ? "graph_fx_value" : "graph_get_base"](this.handle, id, p.code);
  }
  latency(id) {
    this.alive();
    const value = this.engine.graph_latency(this.handle, id);
    if (!Number.isFinite(value)) throw Error("Invalid latency module");
    return value;
  }
  edgeLatency(id) {
    this.alive();
    const value = this.engine.graph_edge_latency(this.handle, id);
    if (!Number.isFinite(value)) throw Error("Invalid latency edge");
    return value;
  }
  effectStats(id) {
    this.alive();
    const t = this.modules.get(id)?.type;
    if (!["legacy.inserts", "legacy.effects"].includes(t) && !["rack.", "voice.", "native.compressor"].some((p) => t?.startsWith(p))) throw Error("Not an effect node");
    return Object.fromEntries([["peak", 0], ["latencyFrames", 16], ["phase", 17], ["frame", 18]].map(([k, i]) => [k, this.engine.graph_fx_stat(this.handle, id, i)]));
  }
  pitchedStats(id) {
    this.alive();
    if (!["legacy.core", "legacy.fm", "legacy.piano", "legacy.iowa", "legacy.classic", "legacy.plucked"].includes(this.modules.get(id)?.type)) throw Error("Not a pitched node");
    return Object.fromEntries(["active", "steals", "dropped", "late", "frame", "peak", "latencyFrames", "peakActive"].map((key, i) => [key, this.engine.graph_pitch_stat(this.handle, id, i)]));
  }
  nativeCompressorState(id) {
    this.alive();
    if (!this.modules.get(id)?.type.startsWith("native.compressor")) throw Error("Not a native compressor node");
    const s = (index) => this.engine.graph_fx_stat(this.handle, id, index);
    return { frame: s(18), latencyFrames: s(16), controlPhase: s(17), divisionPhase: s(21), reductionDb: s(20), tailSeconds: s(22), targets: Array.from({ length: 5 }, (_, i) => this.engine.graph_native_comp_value(this.handle, id, i, 0)), coefficients: Array.from({ length: 5 }, (_, i) => this.engine.graph_native_comp_value(this.handle, id, i, 1)) };
  }
  percussionStats(id) {
    this.alive();
    if (this.modules.get(id)?.type !== "legacy.percussion") throw Error("Not percussion");
    return Object.fromEntries(["active", "queued", "steals", "dropped", "late", "frame", "peakActive"].map((key, i) => [key, this.engine.graph_percussion_stat(this.handle, id, i)]));
  }
  meters() {
    this.alive();
    return Object.fromEntries([...this.modules].filter(([, d]) => d.type === "graph.compressor").map(([id]) => [id, Object.fromEntries(["inputPeak", "keyPeak", "reductionDb", "outputPeak", "missingKey", "externalKey"].map((key, i) => [key, this.engine.graph_meter(this.handle, id, i)]))]));
  }
  pause(value) {
    this.alive();
    this.engine.graph_pause(this.handle, Number(value));
  }
  cancel(owner) {
    this.alive();
    if (!uint2(owner)) throw Error("Invalid owner");
    this.engine.graph_cancel(this.handle, owner);
  }
  reset() {
    this.alive();
    this.engine.graph_reset(this.handle);
  }
  dispose() {
    if (this.handle) {
      this.engine.graph_free(this.handle);
      this.handle = 0;
      this.left = this.right = null;
    }
  }
};
export {
  ReferenceGraph,
  assertSerialRealtimeAllowed,
  checked,
  loadPatch,
  savePatch,
  validatePatch
};
