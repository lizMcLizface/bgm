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
      const p = this.pending.shift(), rows = [];
      for (const [s, i, to] of p.values) {
        const key = s + ":" + i, from = this.values.get(key) ?? to;
        if (from !== to) rows.push({ s, i, key, from, to, discrete: this.discrete(s, i) || this.discrete === fmDiscrete && s === 1 && i % 32 === 1 && (from === 0 || to === 0), log: from > 0 && to > 0 && this.log(s, i) });
      }
      const perfChanged = JSON.stringify(p.performance) !== JSON.stringify(this.performance), structural = rows.some((r) => r.discrete) || p.performance?.mode !== this.performance?.mode;
      if (!rows.length && !perfChanged) continue;
      if (p.seconds === 0) {
        for (const r of rows) {
          this.apply(r.s, r.i, r.to);
          this.values.set(r.key, r.to);
        }
        if (perfChanged) this.onPerformance(p.performance, frame4);
        this.performance = p.performance;
        this.active = null;
      } else {
        const end = frame4 + Math.max(2, Math.round(p.seconds * this.rate));
        this.active = { rows, performance: p.performance, start: frame4, next: frame4 + 16, end, mid: Math.round((frame4 + end) / 2), switched: false, structural };
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
    const rows = p[name];
    if (!Array.isArray(rows) || rows.length > 256 || rows.some((r) => !Array.isArray(r) || r.length !== len || !r.every(finite2) || !Number.isFinite(Math.fround(r.at(-1))) || !valid(r))) throw Error(`Invalid FM ${name}`);
    const keys = rows.map((r) => r.slice(0, -1).join(":"));
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
  const push = (rows, row) => {
    if (points.length + gains.length >= 65536) throw Error("Pitched automation capacity exceeded");
    if (!Number.isSafeInteger(row[0])) throw Error("Pitched automation frame overflow");
    rows.push(row);
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
    for (const [key, bounds] of Object.entries(definition.fields)) if (typeof d[key] !== "number" || !Number.isFinite(d[key]) || d[key] < bounds.min || d[key] > bounds.max) throw Error(`Invalid percussion ${key}`);
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

// src/modular-audio/runtime.js
var checked = (code) => {
  if (code) throw Error(`Graph rejected operation (${code})`);
};
var uint = (n) => Number.isInteger(n) && n > 0 && n <= 4294967295;
var frame3 = (n) => Number.isSafeInteger(n) && n >= 0;
var finite3 = (n) => typeof n === "number" && Number.isFinite(n);
function validatePatch(raw, contracts) {
  const p = JSON.parse(JSON.stringify(raw));
  if (p?.version !== contracts.patchVersion || !Array.isArray(p.modules) || !p.modules.length || p.modules.length > contracts.maxNodes || !Array.isArray(p.connections) || p.connections.length > contracts.maxEdges || !Array.isArray(p.events) || p.events.length > contracts.maxEvents) throw Error("Invalid patch version or resource bounds");
  const modules = /* @__PURE__ */ new Map(), edges = /* @__PURE__ */ new Set(), inputs = /* @__PURE__ */ new Set(), dependencies = /* @__PURE__ */ new Map();
  for (const n of p.modules) {
    const d = contracts.modules.find((d2) => d2.type === n.type && d2.version === n.version);
    if (!uint(n.id) || modules.has(n.id) || !d || !n.parameters || typeof n.parameters !== "object" || Array.isArray(n.parameters)) throw Error("Invalid module identity/contract");
    for (const [id, value] of Object.entries(n.parameters)) {
      const param = d.parameters.find((p2) => p2.id === id);
      if (!param || !finite3(value) || value < param.min || value > param.max || ["enum", "boolean"].includes(param.unit) && !Number.isInteger(value)) throw Error(`Invalid parameter ${id}`);
    }
    modules.set(n.id, d);
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
    if (!uint(e.id) || edges.has(e.id) || !modules.has(e.from?.module) || !modules.has(e.to?.module)) throw Error("Invalid connection identity");
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
      if (source.family !== "control" || source.channels !== 1 || !dest?.modulation || !["bipolar", "unipolar"].includes(e.mapping) || !finite3(e.depth) || Math.abs(e.depth) > 4 || !finite3(e.offset) || Math.abs(e.offset) > 4) throw Error("Incompatible modulation mapping");
    } else throw Error("Unsupported connection family");
    dependencies.get(e.to.module).add(e.from.module);
  }
  if (p.modules.filter((n) => n.type === "legacy.percussion").length > 8) throw Error("Percussion instance limit exceeded");
  if (p.modules.filter((n) => ["legacy.core", "legacy.fm", "legacy.piano", "legacy.iowa"].includes(n.type)).length > 8) throw Error("Pitched instance limit exceeded");
  if ([...modules.values()].filter((d) => d.type === "ref.output").length !== 1) throw Error("Exactly one output is required");
  for (const [id, d] of modules) for (const port of d.ports) if (port.required && !inputs.has(`${id}:${port.id}`)) throw Error("Missing required input");
  const ready = /* @__PURE__ */ new Set();
  while (ready.size < modules.size) {
    const next = [...dependencies].find(([id, deps]) => !ready.has(id) && [...deps].every((id2) => ready.has(id2)));
    if (!next) throw Error("Unsupported graph cycle");
    ready.add(next[0]);
  }
  const owners = /* @__PURE__ */ new Map();
  for (const e of p.events) {
    eventPacket(e, modules, p.connections);
    if (e.kind === "note" && e.note && [0, 1, 3, 5].includes(e.event)) {
      const k = e.target + ":" + e.note;
      if (owners.has(k) && owners.get(k) !== e.owner) throw Error("Pitched note owner conflict");
      owners.set(k, e.owner);
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
  return p;
}
function eventPacket(e, modules, connections) {
  const d = modules.get(e.target);
  if (!frame3(e.frame) || !uint(e.owner) || !d) throw Error("Invalid event frame/ownership/target");
  if (["legacy.core", "legacy.fm", "legacy.piano", "legacy.iowa"].includes(d.type)) {
    if (d.type === "legacy.iowa" && e.kind === "note" && (![0, 1, 4].includes(e.event) || e.frame % 128 !== 0)) throw Error("Iowa notes require canonical 128-frame ticks");
    if (d.type === "legacy.piano" && e.kind === "note" && ![0, 4].includes(e.event)) throw Error("Unsupported finite piano event");
    if (e.kind === "cancel") return [e.frame, e.target, e.owner, 4, 0, 0];
    if (e.kind === "note" && Number.isInteger(e.event) && e.event >= 0 && e.event <= 6 && Number.isInteger(e.note) && e.note >= 0 && e.note <= 4294967295 && finite3(e.a) && finite3(e.b)) {
      const k = e.event, id = e.note, a = e.a, b = e.b;
      if ([0, 1, 5].includes(k) && !id || k === 0 && (a < 0 || a > 127 || b < 0 || b > 1) || [2, 3].includes(k) && (a < 0 || a > 1) || k === 5 && (a < 0 || a > 127 || b < 0 || b > 8) || k === 6 && (id > 2 || a < 0 || a > 3 || b < 0 || b > 1)) throw Error("Invalid pitched note values");
      return [e.frame, e.target, e.owner, k, id, a, b];
    }
  }
  if (e.kind === "gate" && d.type === "ref.tone" && typeof e.value === "boolean") return [e.frame, e.target, e.owner, 1, 0, Number(e.value)];
  if (e.kind === "hit" && d.type === "legacy.percussion" && Number.isInteger(e.drum) && e.drum >= 0 && e.drum < 14 && Number.isInteger(e.model) && e.model >= 0 && e.model <= 2 && Number.isInteger(e.hit) && e.hit >= 0 && e.hit <= 4294967295 && finite3(e.velocity) && e.velocity >= 0 && e.velocity <= 1 && finite3(e.duration) && e.duration >= 0 && e.duration <= 30 && finite3(e.vary) && Math.abs(e.vary) <= 1 && finite3(e.tone) && Math.abs(e.tone) <= 1 && finite3(e.decay) && e.decay >= 0.5 && e.decay <= 2) return [e.frame, e.target, e.owner, e.drum, e.velocity, e.duration, e.vary, e.tone, e.decay, e.hit, e.model];
  if (e.kind === "parameter") {
    const p = d.parameters.find((p2) => p2.id === e.parameter);
    if (p && finite3(e.value) && e.value >= p.min && e.value <= p.max && (!["enum", "boolean"].includes(p.unit) || Number.isInteger(e.value))) return [e.frame, e.target, e.owner, 0, p.code, e.value];
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
    if (this.patch.modules.some((n) => n.type === "legacy.piano") && sampleRate !== 48e3) throw Error("Prepared piano v1 requires 48 kHz");
    if (this.patch.modules.some((n) => n.type === "legacy.iowa" && n.config.sampleRate !== sampleRate)) throw Error("Prepared Iowa sample rate mismatch");
    this.contracts = contracts;
    this.modules = new Map(this.patch.modules.map((n) => [n.id, contracts.modules.find((d) => d.type === n.type && d.version === n.version)]));
    if (engine.graph_api() !== contracts.api) throw Error("Graph ABI mismatch");
    this.handle = engine.graph_new(sampleRate, maxBlock);
    if (!this.handle) throw Error("Invalid sample rate/block size");
    this.maxBlock = maxBlock;
    try {
      for (const n of this.patch.modules) {
        const d = this.modules.get(n.id);
        checked(engine.graph_node(this.handle, n.id, d.code, n.version));
        for (const [key, value] of Object.entries(n.parameters)) checked(engine.graph_base(this.handle, n.id, d.parameters.find((p) => p.id === key).code, value));
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
    checked(this.engine[event.kind === "hit" ? "graph_hit" : event.kind === "note" ? "graph_note" : "graph_event"](this.handle, ...eventPacket(event, this.modules, this.patch.connections)));
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
  pitchedStats(id) {
    this.alive();
    if (!["legacy.core", "legacy.fm", "legacy.piano", "legacy.iowa"].includes(this.modules.get(id)?.type)) throw Error("Not a pitched node");
    return Object.fromEntries(["active", "steals", "dropped", "late", "frame", "peak", "latencyFrames", "peakActive"].map((key, i) => [key, this.engine.graph_pitch_stat(this.handle, id, i)]));
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
    if (!uint(owner)) throw Error("Invalid owner");
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
  checked,
  loadPatch,
  savePatch,
  validatePatch
};
