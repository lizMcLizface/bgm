// How far the kernel's chorus, phaser and flanger are from the Web Audio originals the front page presets were written against.
// The same test signals go through the original nodes (src/nodes, rendered offline in headless Chrome) and through the inserts kernel with
// the settings the translation gives (app/engine/wasmPreset.js), and both outputs are measured the same way. Needs a dev server.
//   npx vite-node tools/modulationCompare.mjs [origin]            writes .tmp/modulation-compare.md
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import voices from '../src/library/voices.json';
import DEFAULTS from '../src/app/engine/presetDefaults';
import { translatedWasmPreset } from '../src/app/engine/wasmPreset';
import { renderInserts } from '../src/synth-lab/inserts';

const origin = process.argv[2] ?? 'http://localhost:5173', RATE = 48000;
const module = new WebAssembly.Module(fs.readFileSync('public/synth-lab/inserts.wasm'));

// --- cases: every distinct modulation setting a front-page voice uses ---
const KEYS = {
  chorus: ['chorusAmount', 'chorusRate', 'chorusDepth'],
  phaser: ['phaserAmount', 'phaserRate', 'phaserDepth', 'phaserFrequency', 'phaserFeedback'],
  flanger: ['flangerAmount', 'flangerRate', 'flangerDepth', 'flangerDelay', 'flangerFeedback'],
};
const cases = [];
for (const [category, list] of Object.entries(voices)) for (const [name, raw] of Object.entries(list)) {
  const p = { ...DEFAULTS, ...raw };
  for (const [kind, keys] of Object.entries(KEYS)) {
    if (!(p[keys[0]] > 0)) continue;
    const settings = Object.fromEntries(keys.map((k) => [k, Math.round(p[k] * 1e4) / 1e4])), id = kind + JSON.stringify(settings);
    const known = cases.find((c) => c.id === id);
    if (known) known.names.push(name);
    else cases.push({ id, kind, settings, names: [name], raw });
  }
}

// --- test signals ---
const seconds = 3, frames = RATE * seconds;
let seed = 12345;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const sine = Float32Array.from({ length: frames }, (_, i) => .1 * Math.sin(2 * Math.PI * 440 * i / RATE));
const noise = Float32Array.from({ length: frames }, () => .1 * random());

// --- the original nodes, in Chrome ---
const browser = await puppeteer.launch({ executablePath: process.env.SYNTH_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage();
await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
// the page's side is plain text, so the bundler that runs this script leaves its dynamic import alone
const RENDER = `async (kind, settings, input, rate) => {
  const modules = { chorus: '/src/nodes/chorus.js', phaser: '/src/nodes/phaser.js', flanger: '/src/nodes/flanger.js' };
  const { default: Effect } = await import(modules[kind]);
  const ctx = new OfflineAudioContext(2, input.length, rate), buffer = ctx.createBuffer(1, input.length, rate);
  buffer.copyToChannel(Float32Array.from(input), 0);
  const source = ctx.createBufferSource(), fx = new Effect(ctx);
  source.buffer = buffer; for (const node of [].concat(fx.getNode())) source.connect(node); fx.connect(ctx.destination);
  const set = { chorusAmount: 'setAmount', chorusRate: 'setRate', chorusDepth: 'setDepth', phaserAmount: 'setAmount', phaserRate: 'setRate', phaserDepth: 'setDepth', phaserFrequency: 'setFrequency', phaserFeedback: 'setFeedback',
    flangerAmount: 'setAmount', flangerRate: 'setRate', flangerDepth: 'setDepth', flangerDelay: 'setDelay', flangerFeedback: 'setFeedback' };
  for (const [key, value] of Object.entries(settings)) fx[set[key]](value);
  source.start();
  const rendered = await ctx.startRendering();
  return [Array.from(rendered.getChannelData(0)), Array.from(rendered.getChannelData(1))];
}`;
const original = async (kind, settings, input) => {
  const out = await page.evaluate(`(${RENDER})(${JSON.stringify(kind)}, ${JSON.stringify(settings)}, ${JSON.stringify(Array.from(input))}, ${RATE})`);
  return out.map((c) => Float32Array.from(c));
};

// --- the kernel ---
const kernel = (raw, input, kind) => {
  // a voice may have several of these; each is measured alone, as the original node is (the translation's level trim follows the amounts)
  const alone = { ...raw };
  for (const other of ['chorus', 'phaser', 'flanger']) if (other !== kind) alone[other + 'Amount'] = 0;
  const { inserts } = translatedWasmPreset(alone, 8, null);
  // the voice's own level (its master volume) is not the effect's: take it off the trim, keep what the translation adds for the effect; no saturation or EQ
  const p = { ...DEFAULTS, ...alone }, master = Math.min(6, Math.max(0, 20 * Math.log10(Math.max(1e-6, p.masterVolume * .95) / .8)));
  return renderInserts(module, [input, input.slice()], RATE, { ...inserts, gain: inserts.gain - master, saturation: 0, lowGain: 0, midGain: 0, highGain: 0 });
};

// --- measurements ---
const rms = (x, from = 0) => { let s = 0; for (let i = from; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / (x.length - from)); };
const db = (v) => 20 * Math.log10(Math.max(1e-9, v));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const SKIP = RATE;      // the first second is settling

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
/** The carrier of a sine, demodulated: its level against the input's, how much it swings in level and pitch, and how fast. */
function carrier(x, hz = 440) {
  const hop = 480, win = 2400, level = [], phase = [];
  for (let at = SKIP; at + win < x.length; at += hop) {
    let re = 0, im = 0;
    for (let i = 0; i < win; i++) { const t = (at + i) / RATE, w = .5 - .5 * Math.cos(2 * Math.PI * i / win); re += x[at + i] * w * Math.cos(2 * Math.PI * hz * t); im -= x[at + i] * w * Math.sin(2 * Math.PI * hz * t); }
    level.push(Math.hypot(re, im) * 2 / (win * .5)); phase.push(Math.atan2(im, re));
  }
  for (let i = 1; i < phase.length; i++) { while (phase[i] - phase[i - 1] > Math.PI) phase[i] -= 2 * Math.PI; while (phase[i] - phase[i - 1] < -Math.PI) phase[i] += 2 * Math.PI; }
  const step = hop / RATE, deviation = phase.slice(1).map((p, i) => (p - phase[i]) / (2 * Math.PI * step));      // Hz
  const cents = deviation.map((d) => 1200 * Math.log2(Math.max(1e-3, (hz + d) / hz)));
  const peakAt = (series) => {
    const n = 2 ** Math.floor(Math.log2(series.length)), re = Float64Array.from(series.slice(0, n).map((v) => v - mean(series.slice(0, n)))), im = new Float64Array(n);
    fft(re, im);
    let best = 1; for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
    return best / (n * step);
  };
  return { level: mean(level), am: std(level) / mean(level), fm: std(cents), rate: peakAt(level), fmRate: peakAt(cents) };
}
/** The long-term spectrum of a noise output against the input's, in dB, at 48 log-spaced points from 100 Hz to 16 kHz, and how it moves over time. */
function response(x, input) {
  const n = 8192, bins = 48, edges = Array.from({ length: bins + 1 }, (_, i) => 100 * (16000 / 100) ** (i / bins));
  const frames = [];
  for (let at = SKIP; at + n <= x.length; at += n / 2) {
    const re = new Float64Array(n), im = new Float64Array(n), ri = new Float64Array(n), ii = new Float64Array(n);
    for (let i = 0; i < n; i++) { const w = .5 - .5 * Math.cos(2 * Math.PI * i / n); re[i] = x[at + i] * w; ri[i] = input[at + i] * w; }
    fft(re, im); fft(ri, ii);
    frames.push(Array.from({ length: bins }, (_, b) => {
      let o = 0, c = 0; const lo = Math.ceil(edges[b] * n / RATE), hi = Math.max(lo + 1, Math.floor(edges[b + 1] * n / RATE));
      for (let k = lo; k < hi; k++) { o += re[k] ** 2 + im[k] ** 2; c += ri[k] ** 2 + ii[k] ** 2; }
      return 10 * Math.log10(Math.max(1e-12, o) / Math.max(1e-12, c));
    }));
  }
  const average = Array.from({ length: bins }, (_, b) => mean(frames.map((f) => f[b])));
  return { average, movement: mean(Array.from({ length: bins }, (_, b) => std(frames.map((f) => f[b])))) };
}
const correlation = (a, b) => { let ab = 0, aa = 0, bb = 0; for (let i = SKIP; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / Math.sqrt(aa * bb || 1); };
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');

const rows = [];
for (const c of cases) {
  const o = { sine: await original(c.kind, c.settings, sine), noise: await original(c.kind, c.settings, noise) };
  const k = { sine: kernel(c.raw, sine, c.kind), noise: kernel(c.raw, noise, c.kind) };
  const m = {};
  for (const [who, set] of [['original', o], ['kernel', k]]) {
    const cr = carrier(set.sine[0]), spec = response(set.noise[0], noise);
    m[who] = { carrier: cr, spec, level: db(rms(set.noise[0], SKIP) / rms(noise, SKIP)), width: 1 - correlation(set.noise[0], set.noise[1]) };
  }
  // the two responses' shapes with their means taken off, and how far apart they are
  const shape = (s) => { const mm = mean(s.average); return s.average.map((v) => v - mm); };
  const a = shape(m.original.spec), b = shape(m.kernel.spec);
  c.result = { m, shapeDiff: Math.sqrt(mean(a.map((v, i) => (v - b[i]) ** 2))), shapeDepth: [std(a), std(b)] };
  console.log(c.kind, JSON.stringify(c.settings), c.names.length, 'presets', 'done');
}
await browser.close();

const out = ['# Chorus, phaser and flanger: the Web Audio originals against the inserts kernel', '',
  `Generated by tools/modulationCompare.mjs. ${cases.length} distinct settings from the front page's voices, each through both. Sine: 440 Hz, white noise: both ${seconds} s, the first second left out.`, '',
  '- **level**: the noise output against its input, dB (wet/dry mix and the effect\'s own gain)',
  '- **AM / FM**: how much the 440 Hz carrier swings in level (% of its mean) and in pitch (cents, rms), and the rate of the strongest swing',
  '- **width**: 1 − L/R correlation of the noise output (0 = the same in both ears, 1 = unrelated)',
  '- **comb depth**: the spread (dB, standard deviation) of the long-term spectrum against the input, a measure of how deep the combing or notching is; **shape diff**: how far apart the two spectra\'s shapes are (dB rms)',
  '- **movement**: how much each band of the spectrum moves over time (dB), the LFO\'s work', ''];
for (const kind of ['chorus', 'phaser', 'flanger']) {
  const list = cases.filter((c) => c.kind === kind);
  if (!list.length) continue;
  out.push(`## ${kind[0].toUpperCase() + kind.slice(1)}`, '', '| Setting | Presets | Engine | Level | AM % | FM cents | Rate Hz | Width | Comb depth | Movement | Shape diff |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of list) {
    const { m, shapeDiff, shapeDepth } = c.result;
    const label = Object.entries(c.settings).map(([key, v]) => `${key.replace(kind, '')} ${v}`).join(', ');
    for (const who of ['original', 'kernel']) {
      const x = m[who];
      out.push(`| ${who === 'original' ? label : ''} | ${who === 'original' ? c.names.length : ''} | ${who} | ${f(x.level)} | ${f(x.carrier.am * 100, 2)} | ${f(x.carrier.fm, 2)} | ${f(x.carrier.rate, 2)} / ${f(x.carrier.fmRate, 2)} | ${f(x.width, 2)} | ${f(shapeDepth[who === 'original' ? 0 : 1])} | ${f(x.spec.movement)} | ${who === 'kernel' ? f(shapeDiff) : ''} |`);
    }
  }
  out.push('');
}
fs.mkdirSync('.tmp', { recursive: true });
fs.writeFileSync('.tmp/modulation-compare.md', out.join('\n'));
console.log('written .tmp/modulation-compare.md');
