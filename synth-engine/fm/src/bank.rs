//! Experimental multi-output FM bank. Each slot owns its voices, patches,
//! reconstruction, DC and headroom; only independent operator arithmetic is batched.
//! One worklet thread, no shared wet bus and no realtime allocation in render.
use super::*;
const SLOTS: usize = 4;
static mut ENGINES: [Fm; SLOTS] = [const { Fm::new() }; SLOTS];
static mut ENABLED: [bool; SLOTS] = [false; SLOTS];
static mut MODEL: Option<Vec<BankBand>> = None;
static mut VECTOR: bool = true;
static mut FRAMES: u64 = 0;
static mut LANES: u64 = 0;
struct Scratch {
    expressions: [[[f32; 11]; VOICES]; SLOTS],
    refresh: [[bool; VOICES]; SLOTS],
    colours: [[bool; VOICES]; SLOTS],
    output: [[[f32; OPS]; VOICES]; SLOTS],
    envs: [[[f32; OPS]; VOICES]; SLOTS],
    alive_flags: [[bool; VOICES]; SLOTS],
}
impl Scratch {
    fn new() -> Self {
        Self {
            expressions: [[[0.; 11]; VOICES]; SLOTS],
            refresh: [[false; VOICES]; SLOTS],
            colours: [[false; VOICES]; SLOTS],
            output: [[[0.; OPS]; VOICES]; SLOTS],
            envs: [[[0.; OPS]; VOICES]; SLOTS],
            alive_flags: [[false; VOICES]; SLOTS],
        }
    }
}
#[derive(Clone, Copy)]
struct BankBand {
    units: [(usize, usize, usize); 4],
    len: usize,
    params: [V; OP_PARAMS],
    phase: V,
    previous: [V; 8],
    next: [usize; 4],
    env: Envelope4,
    sources: [[(usize, usize, usize); 4]; OPS],
    weights: [V; OPS],
    inputs: usize,
    feedback: V,
    steps: V,
    scales: V,
    levels: V,
    shape: u32,
    shapes: [V; 3],
}
impl BankBand {
    fn zero() -> Self {
        let z = V::s(0.);
        Self {
            units: [(0, 0, 0); 4],
            len: 0,
            params: [z; OP_PARAMS],
            phase: z,
            previous: [z; 8],
            next: [0; 4],
            env: Envelope4::zero(),
            sources: [[(0, 0, 0); 4]; OPS],
            weights: [z; OPS],
            inputs: 0,
            feedback: z,
            steps: z,
            scales: z,
            levels: z,
            shape: 0,
            shapes: [z; 3],
        }
    }
    fn new(engines: &[Fm; SLOTS], units: [(usize, usize, usize); 4], len: usize) -> Self {
        let mut b = Self::zero();
        b.units = units;
        b.len = len;
        b.params = core::array::from_fn(|k| {
            V::a(core::array::from_fn(|j| {
                engines[units[j].0].p[units[j].2][k]
            }))
        });
        let env: [Envelope; 4] = core::array::from_fn(|j| {
            if j < len {
                engines[units[j].0].voices[units[j].1].env[units[j].2]
            } else {
                Envelope::ZERO
            }
        });
        b.env = Envelope4 {
            value: V::a(env.map(|x| x.value)),
            start: V::a(env.map(|x| x.start)),
            target: V::a(env.map(|x| x.target)),
            total: I::a(env.map(|x| x.total)),
            left: I::a(env.map(|x| x.left)),
            stage: I::a(env.map(|x| x.stage as u32)),
            rate: V::a(core::array::from_fn(|j| {
                let (slot, v, op) = units[j];
                let e = &engines[slot];
                e.sr * e.factor() as f32 / e.voices[v].rate[op]
            })),
        };
        b.phase = V::a(core::array::from_fn(|j| {
            let (slot, v, op) = units[j];
            let e = &engines[slot];
            e.voices[v].phase[op]
        }));
        b.previous = core::array::from_fn(|k| {
            V::a(core::array::from_fn(|j| {
                let (slot, v, op) = units[j];
                let e = &engines[slot];
                let v = &e.voices[v];
                v.previous[op][(v.feedback_pos + k) % 8]
            }))
        });
        let mut weights = [[0.; 4]; OPS];
        for j in 0..len {
            let (slot, v, op) = units[j];
            let e = &engines[slot];
            let mut count = 0;
            for source in 0..op {
                let weight = e.routing[source][op];
                if weight != 0. {
                    b.sources[count][j] = (slot, v, source);
                    weights[count][j] = weight;
                    count += 1;
                }
            }
            b.inputs = b.inputs.max(count);
        }
        b.weights = weights.map(V::a);
        b.feedback = V::s(0.).lt(V::a(core::array::from_fn(|j| {
            if j < len && units[j].2 == engines[units[j].0].g[6] as usize {
                1.
            } else {
                0.
            }
        })));
        b.steps = V::a(units.map(|(s, v, op)| engines[s].voices[v].step[op]));
        b.scales = V::a(units.map(|(s, v, op)| engines[s].voices[v].scale[op]));
        b.levels = V::a(units.map(|(s, _, op)| engines[s].levels[op]));
        b.shape = engines[units[0].0].p[units[0].2][17] as u32;
        if (0..len).any(|j| engines[units[j].0].p[units[j].2][17] as u32 != b.shape) {
            b.shape = 4;
        }
        b.shapes = core::array::from_fn(|k| {
            V::s(0.).lt(V::a(core::array::from_fn(|j| {
                if engines[units[j].0].p[units[j].2][17] as usize == k + 1 {
                    1.
                } else {
                    0.
                }
            })))
        });
        b
    }
}

fn pack(engines: &[Fm; SLOTS], slots: &[usize], model: &mut Vec<BankBand>) {
    model.clear();
    let depths: [[usize; OPS]; SLOTS] = core::array::from_fn(|s| {
        let e = &engines[s];
        let mut depth = [0usize; OPS];
        for op in 0..e.count() {
            for source in 0..op {
                if e.routing[source][op] != 0. {
                    depth[op] = depth[op].max(depth[source] + 1);
                }
            }
        }
        depth
    });
    for level in 0..OPS {
        let mut units = [(0, 0, 0); 4];
        let mut len = 0;
        for &slot in slots {
            let e = &engines[slot];
            for v in 0..VOICES {
                if !e.voices[v].active {
                    continue;
                }
                for op in 0..e.count() {
                    if depths[slot][op] != level {
                        continue;
                    }
                    units[len] = (slot, v, op);
                    len += 1;
                    if len == 4 {
                        model.push(BankBand::new(engines, units, len));
                        len = 0;
                    }
                }
            }
        }
        if len > 0 {
            model.push(BankBand::new(engines, units, len));
        }
    }
}
fn unpack(engines: &mut [Fm; SLOTS], model: &[BankBand]) {
    for b in model {
        let phases = b.phase.array();
        let value = b.env.value.array();
        let start = b.env.start.array();
        let target = b.env.target.array();
        let total = b.env.total.array();
        let left = b.env.left.array();
        let stage = b.env.stage.array();
        for j in 0..b.len {
            let (s, v, op) = b.units[j];
            let v = &mut engines[s].voices[v];
            v.phase[op] = phases[j];
            v.env[op] = Envelope {
                value: value[j],
                start: start[j],
                target: target[j],
                total: total[j],
                left: left[j],
                stage: stage[j] as u8,
            };
            for k in 0..8 {
                v.previous[op][(v.feedback_pos + k) % 8] =
                    b.previous[(b.next[j] + k) % 8].array()[j];
            }
        }
    }
}
#[derive(Clone, Copy)]
struct Config {
    count: usize,
    norm: f32,
    dc: f32,
    smoothing: f32,
    alpha: f32,
    routes: bool,
    motion: bool,
    fir_idle: bool,
    filter_idle: bool,
}
impl Config {
    fn new(e: &Fm) -> Self {
        let routes = (0..4).any(|slot| {
            let at = 29 + slot * 3;
            e.g[at] > 0. && e.g[at + 1] > 0. && e.g[at + 2] != 0.
        });
        let motion = e.g[27] > 0.
            || (0..4).any(|slot| {
                let at = 29 + slot * 3;
                e.g[at] == 8. && e.g[at + 1] > 0. && e.g[at + 2] != 0.
            });
        let fir_idle = !e.idle_reference && e.history.iter().flatten().all(|x| *x == 0.);
        Self {
            count: e.count(),
            norm: e.carriers[..e.count()].iter().sum::<f32>().max(1.),
            dc: (-2. * PI * 8. / e.sr).exp(),
            smoothing: 1. - (-1. / (e.sr * 0.008)).exp(),
            alpha: 1. - (-1. / (e.sr * e.factor() as f32 * 0.005)).exp(),
            routes,
            motion,
            fir_idle,
            filter_idle: fir_idle && e.dc_in.iter().chain(e.dc_out.iter()).all(|x| *x == 0.),
        }
    }
}
fn tick(
    engines: &mut [Fm; SLOTS],
    slots: &[usize],
    cfg: &[Config; SLOTS],
    lfos: [[f32; 2]; SLOTS],
    factor: usize,
    sr: f32,
    control: bool,
    levels_changed: bool,
    model: &mut [BankBand],
    pos: usize,
    scratch: &mut Scratch,
    active: &[(usize, usize)],
) -> [[f32; 2]; SLOTS] {
    let Scratch {
        expressions,
        refresh,
        colours,
        output,
        envs,
        alive_flags,
    } = scratch;
    let mut expressed = false;
    for &(slot, voice_index) in active {
        let e = &mut engines[slot];
        let c = cfg[slot];
        let count = c.count;
        let expression_alpha = c.alpha;
        let motion = c.motion;
        let routes = c.routes;
        let lfo = lfos[slot][0];
        let lfo2 = lfos[slot][1];
        let v = &mut e.voices[voice_index];
        if !v.active {
            continue;
        }
        // Only handoffs set different targets; ordinary/polyphonic
        // voices keep their sample-identical path. Five-ms slew avoids
        // a replacement amplitude/filter step when key velocity changes.
        let handoff_dynamics = v.velocity != v.velocity_target || v.pressure != v.pressure_target;
        if v.velocity != v.velocity_target {
            v.velocity += (v.velocity_target - v.velocity) * expression_alpha;
            if (v.velocity_target - v.velocity).abs() < 1e-6 {
                v.velocity = v.velocity_target;
            }
        }
        if v.pressure != v.pressure_target {
            v.pressure += (v.pressure_target - v.pressure) * expression_alpha;
            if (v.pressure_target - v.pressure).abs() < 1e-6 {
                v.pressure = v.pressure_target;
            }
        }
        if v.glide > 0 {
            v.midi += (v.target - v.midi) / v.glide as f32;
            v.glide -= 1;
        }
        let update = control || e.frame == v.age;
        let pressure = v.pressure.max(e.g[12]);
        let random = v.expression.tick(&e.g, sr, expression_alpha, motion);
        let mut targets = [0.; 11];
        if routes {
            for slot in 0..4 {
                let at = 29 + slot * 3;
                let destination = e.g[at + 1] as usize;
                if destination == 0 || e.g[at] == 0. || e.g[at + 2] == 0. {
                    continue;
                }
                let source = match e.g[at] as u32 {
                    1 => lfo,
                    2 => lfo2,
                    3 => v.expression.value,
                    4 => v.velocity,
                    5 => ((v.midi - 60.) / 36.).clamp(-1., 1.),
                    6 => pressure,
                    7 => e.g[9],
                    8 => random,
                    _ => 0.,
                };
                targets[destination - 1] += source * e.g[at + 2];
            }
        }
        for k in 0..11 {
            if targets[k] != 0. || v.expression.routes[k] != 0. {
                v.expression.routes[k] +=
                    (targets[k].clamp(-1., 1.) - v.expression.routes[k]) * expression_alpha;
                if v.expression.routes[k].abs() < 1e-12 {
                    v.expression.routes[k] = 0.;
                }
            }
        }
        let expression = v.expression.routes;
        if update {
            let age = (e.frame - v.age) as f32 / e.sr;
            let transient = e.g[15] * (1. - age / e.g[16]).max(0.);
            let hz = 440.
                * ((v.midi - 69.
                    + e.bend
                    + transient
                    + lfo * (e.g[11] + e.g[9] * 35.) / 100.
                    + (random * e.g[27] + expression[0] * 100.) / 100.)
                    / 12.)
                    .exp2();
            for op in 0..count {
                let p = &e.p[op];
                let freq = if p[1] > 0. { p[1] } else { hz * p[0] };
                v.step[op] = (freq * (p[2] / 1200.).exp2() / sr).clamp(0., 0.45);
            }
        }
        // A handoff's slewed velocity/pressure must not turn back
        // into 16-sample amplitude steps at the operator scaler.
        refresh[slot][voice_index] = update || handoff_dynamics;
        if update || handoff_dynamics {
            for op in 0..count {
                let p = &e.p[op];
                v.scale[op] = (1. - p[11] + p[11] * v.velocity)
                    * 2_f32.powf(p[12] * (v.midi - 60.) / 24.).clamp(0.25, 4.)
                    * (1. + pressure * p[14]);
            }
        }

        let active = expression.iter().any(|x| *x != 0.);
        expressed |= active;
        expressions[slot][voice_index] = expression;
        alive_flags[slot][voice_index] = false;
        colours[slot][voice_index] =
            colour::enabled(&e.g[41..54]) || e.colours[voice_index].engaged();
    }
    let z = V::s(0.);
    let one = V::s(1.);
    for band in model.iter_mut() {
        let mask = V::s(0.).lt(V::a(core::array::from_fn(|j| {
            if j < band.len && engines[band.units[j].0].voices[band.units[j].1].active {
                1.
            } else {
                0.
            }
        })));
        if band.units[..band.len]
            .iter()
            .any(|(s, v, _)| refresh[*s][*v])
        {
            band.steps = V::a(band.units.map(|(s, v, op)| engines[s].voices[v].step[op]));
            band.scales = V::a(band.units.map(|(s, v, op)| engines[s].voices[v].scale[op]));
        }
        if levels_changed {
            band.levels = V::a(band.units.map(|(s, _, op)| engines[s].levels[op]));
        }
        let p = &band.params;
        let env = band.env.tick_units(p, mask);
        let mut modulation = z;
        for input in 0..band.inputs {
            let sources = band.sources[input];
            modulation += V::a(sources.map(|(s, v, op)| output[s][v][op])) * band.weights[input];
        }
        if band.feedback.any() {
            let feedback = if expressed {
                V::a(core::array::from_fn(|j| {
                    let value = expressions[band.units[j].0][band.units[j].1][2];
                    if value == 0. {
                        engines[band.units[j].0].smooth[1]
                    } else {
                        (engines[band.units[j].0].smooth[1] + value * 0.5).clamp(0., 1.)
                    }
                }))
            } else {
                V::a(band.units.map(|(s, _, _)| engines[s].smooth[1]))
            };
            let fb = (band.previous[(pos + 8 - factor) % 8]
                + band.previous[(pos + 8 - 2 * factor) % 8])
                * V::s(0.5)
                * feedback
                * feedback
                * V::s(6.);
            modulation += band.feedback.choose(fb, z);
        }
        let raw = lut(
            &engines[slots[0]].sine,
            band.phase
                + modulation
                    * V::a(band.units.map(|(s, _, _)| engines[s].smooth[2]))
                    * if expressed {
                        V::a(band.units.map(|(s, v, _)| 1. + expressions[s][v][1]))
                    } else {
                        one
                    }
                    * V::a(
                        band.units
                            .map(|(s, _, _)| 1. + lfos[s][0] * engines[s].g[18]),
                    )
                    / V::s(2. * PI),
        );
        let shaped = match band.shape {
            0 => raw,
            1 => raw.max(z) * V::s(2.) - V::s(0.63662),
            2 => raw.abs() * V::s(2.) - V::s(1.27324),
            3 => raw * raw * V::s(2.) - one,
            _ => band.shapes[0].choose(
                raw.max(z) * V::s(2.) - V::s(0.63662),
                band.shapes[1].choose(
                    raw.abs() * V::s(2.) - V::s(1.27324),
                    band.shapes[2].choose(raw * raw * V::s(2.) - one, raw),
                ),
            ),
        };
        let value = shaped
            * env
            * band.levels
            * band.scales
            * p[16]
            * if expressed {
                V::a(band.units.map(|(s, v, op)| 1. + expressions[s][v][5 + op]))
            } else {
                one
            };
        let next = band.phase + band.steps;
        band.phase = mask.choose(next - next.trunc(), band.phase);
        band.previous[pos] = mask.choose(value, band.previous[pos]);
        let values = value.array();
        let envelopes = env.array();
        let stages = band.env.stage.array();
        for j in 0..band.len {
            let (s, v, op) = band.units[j];
            if !engines[s].voices[v].active {
                continue;
            }
            output[s][v][op] = values[j];
            if colours[s][v] {
                envs[s][v][op] = envelopes[j];
            }
            alive_flags[s][v] |= engines[s].carriers[op] > 0. && stages[j] > 0;
            band.next[j] = (pos + 1) % 8;
        }
    }
    let mut out = [[0.; 2]; SLOTS];
    for &(slot, voice_index) in active {
        let e = &mut engines[slot];
        let c = cfg[slot];
        let count = c.count;
        let norm = c.norm;
        let lfo = lfos[slot][0];
        let v = &mut e.voices[voice_index];
        if !v.active {
            continue;
        }
        let expression = expressions[slot][voice_index];
        let pressure = v.pressure.max(e.g[12]);
        let colour = &mut e.colours[voice_index];
        let coloured = colours[slot][voice_index];
        let mut voice_out = [0.; 2];
        let mut noise_gain = [0.; 2];
        let mut alive = alive_flags[slot][voice_index];
        for op in 0..count {
            if e.carriers[op] > 0. {
                let p = &e.p[op];
                let x = output[slot][voice_index][op] * e.carriers[op] / norm
                    * (1. - e.g[17] * (lfo + 1.) * 0.5);
                for ch in 0..2 {
                    voice_out[ch] += x * e.pan[op][ch];
                }
                if coloured {
                    let level = envs[slot][voice_index][op]
                        * e.levels[op]
                        * v.scale[op]
                        * p[16]
                        * (1. + expression[5 + op])
                        * e.carriers[op]
                        / norm
                        * (1. - e.g[17] * (lfo + 1.) * 0.5);
                    for ch in 0..2 {
                        noise_gain[ch] += level * e.pan[op][ch];
                    }
                }
            }
        }
        v.feedback_pos = (v.feedback_pos + 1) % 8;
        if expression[3] != 0. || expression[4] != 0. {
            voice_out[0] *= (1. + expression[3]) * (1. - expression[4].max(0.));
            voice_out[1] *= (1. + expression[3]) * (1. + expression[4].min(0.));
            noise_gain[0] *= (1. + expression[3]) * (1. - expression[4].max(0.));
            noise_gain[1] *= (1. + expression[3]) * (1. + expression[4].min(0.));
        }
        if coloured {
            voice_out = colour.tick(voice_out, noise_gain, pressure, &e.g[41..54], sr);
            alive |= colour.ringing();
        }
        if v.fade > 0 {
            let t = v.fade as f32 / (64. * factor as f32);
            voice_out[0] += v.tail[0] * t;
            voice_out[1] += v.tail[1] * t;
            v.fade -= 1;
        }
        v.last = voice_out;
        out[slot][0] += voice_out[0];
        out[slot][1] += voice_out[1];
        if !alive && v.fade == 0 {
            v.active = false;
        }
    }
    out
}

fn render_group(engines: &mut [Fm; SLOTS], slots: &[usize], n: usize, model: &mut Vec<BankBand>) {
    let factor = engines[slots[0]].factor();
    let sr = engines[slots[0]].sr * factor as f32;
    let mut cfg = core::array::from_fn(|s| Config::new(&engines[s]));
    pack(engines, slots, model);
    let mut pos = 0;
    let mut scratch = Scratch::new();
    let mut active = [(0, 0); SLOTS * VOICES];
    let mut active_len = 0;
    for &s in slots {
        for v in 0..VOICES {
            if engines[s].voices[v].active {
                active[active_len] = (s, v);
                active_len += 1;
            }
        }
    }
    for &s in slots {
        engines[s].peak = 0.;
    }
    for sample in 0..n {
        let mut changed = false;
        for &s in slots {
            let e = &mut engines[s];
            let c = &cfg[s];
            for (i, p) in [3, 5, 7].iter().enumerate() {
                e.smooth[i] += (e.g[*p] - e.smooth[i]) * c.smoothing;
            }
            for op in 0..OPS {
                let old = e.levels[op];
                e.levels[op] += (e.p[op][3] - e.levels[op]) * c.smoothing;
                changed |= old != e.levels[op];
            }
        }
        let events = slots.iter().any(|s| {
            let e = &engines[*s];
            e.head < e.len && e.queue[e.head].frame <= e.frame
        });
        if events {
            unpack(engines, model);
            for &s in slots {
                let e = &mut engines[s];
                while e.head < e.len && e.queue[e.head].frame <= e.frame {
                    let event = e.queue[e.head];
                    e.head += 1;
                    e.event(event);
                }
            }
            pack(engines, slots, model);
            pos = 0;
            active_len = 0;
            for &s in slots {
                for v in 0..VOICES {
                    if engines[s].voices[v].active {
                        active[active_len] = (s, v);
                        active_len += 1;
                    }
                }
            }
        }
        for sub in 0..factor {
            let mut lfos = [[0.; 2]; SLOTS];
            for &s in slots {
                let e = &mut engines[s];
                e.bend += (e.g[8] - e.bend) * 0.002 / factor as f32;
                lfos[s][0] = sin(&e.sine, e.lfo);
                e.lfo = (e.lfo + e.g[10] / sr).fract();
                lfos[s][1] = sin(&e.sine, e.lfo2);
                e.lfo2 = (e.lfo2 + e.g[28] / sr).fract();
            }
            let control = engines[slots[0]].frame % 16 == 0 && sub == 0;
            let out = tick(
                engines,
                slots,
                &cfg,
                lfos,
                factor,
                sr,
                control,
                changed,
                model,
                pos,
                &mut scratch,
                &active[..active_len],
            );
            pos = (pos + 1) % 8;
            for &s in slots {
                let e = &mut engines[s];
                let c = &mut cfg[s];
                for ch in 0..2 {
                    let value = out[s][ch] * e.smooth[0] * 0.98;
                    if value != 0. {
                        c.fir_idle = false;
                        c.filter_idle = false;
                    }
                    e.history[ch][e.fir_pos] = value;
                }
                e.fir_pos = (e.fir_pos + 1) % 64;
            }
        }
        for &s in slots {
            let e = &mut engines[s];
            let c = cfg[s];
            let mut clean = [0.; 2];
            if !c.filter_idle {
                for ch in 0..2 {
                    let mut x = 0.;
                    if !c.fir_idle {
                        for i in 0..e.fir_len {
                            x += e.history[ch][(e.fir_pos + 63 - i) % 64] * e.fir[i];
                        }
                    }
                    let filtered = x - e.dc_in[ch] + c.dc * e.dc_out[ch];
                    e.dc_in[ch] = x;
                    e.dc_out[ch] = filtered;
                    clean[ch] = filtered;
                }
            }
            let protected = e.headroom.tick(clean);
            for ch in 0..2 {
                e.output[ch][sample] = protected[ch];
                e.peak = e.peak.max(protected[ch].abs());
            }
            e.frame += 1;
        }
    }
    unpack(engines, model);
    for &s in slots {
        let e = &mut engines[s];
        if e.head == e.len {
            e.head = 0;
            e.len = 0;
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn bank_init() {
    unsafe {
        ENABLED.fill(false);
        FRAMES = 0;
        LANES = 0;
        VECTOR = true;
        // Worst case: six depth bands, each rounded up to four independent units.
        MODEL = Some(Vec::with_capacity(SLOTS * VOICES * OPS / 4 + OPS));
    }
}
#[no_mangle]
pub extern "C" fn bank_slot_init(slot: u32, sr: f32, frame: f64) -> u32 {
    if slot as usize >= SLOTS || !frame.is_finite() || frame < 0. {
        return 0;
    }
    unsafe {
        let s = slot as usize;
        ENGINES[s].init(sr);
        ENGINES[s].frame = frame as u64;
        ENABLED[s] = true;
    }
    1
}
#[no_mangle]
pub extern "C" fn bank_release(slot: u32) {
    if (slot as usize) < SLOTS {
        unsafe {
            ENGINES[slot as usize].panic();
            ENABLED[slot as usize] = false;
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_set_frame(slot: u32, frame: f64) {
    if (slot as usize) < SLOTS && frame.is_finite() && frame >= 0. {
        unsafe {
            ENGINES[slot as usize].frame = frame as u64;
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_param(s: u32, i: u32, v: f32) {
    if (s as usize) < SLOTS {
        unsafe {
            ENGINES[s as usize].param(i as usize, v);
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_op(s: u32, o: u32, i: u32, v: f32) {
    if (s as usize) < SLOTS {
        unsafe {
            ENGINES[s as usize].op(o as usize, i as usize, v);
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_route(s: u32, from: u32, to: u32, v: f32) {
    if (s as usize) < SLOTS && from < to && to < 6 {
        unsafe {
            ENGINES[s as usize].routing[from as usize][to as usize] = bounded(v, 0., 2.);
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_carrier(s: u32, op: u32, v: f32) {
    if (s as usize) < SLOTS && op < 6 {
        unsafe {
            ENGINES[s as usize].carriers[op as usize] = bounded(v, 0., 1.);
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_event(s: u32, k: u32, id: u32, f: f64, a: f32, b: f32) -> u32 {
    if (s as usize) >= SLOTS {
        return 0;
    }
    unsafe { ENGINES[s as usize].enqueue(k, id, f, a, b) }
}
#[no_mangle]
pub extern "C" fn bank_panic(s: u32) {
    if (s as usize) < SLOTS {
        unsafe {
            ENGINES[s as usize].panic();
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_vector_mode(on: u32) {
    unsafe {
        VECTOR = on != 0;
    }
}
#[no_mangle]
pub extern "C" fn bank_output(s: u32, ch: u32) -> *const f32 {
    unsafe { ENGINES[(s as usize).min(SLOTS - 1)].output[(ch as usize).min(1)].as_ptr() }
}
#[no_mangle]
pub extern "C" fn bank_stat(s: u32, i: u32) -> f64 {
    if (s as usize) >= SLOTS {
        return 0.;
    }
    unsafe {
        let e = &ENGINES[s as usize];
        match i {
            0 => e.voices.iter().filter(|v| v.active).count() as f64,
            1 => e.steals as f64,
            2 => e.dropped as f64,
            3 => e.late as f64,
            4 => e.frame as f64,
            5 => e.peak as f64,
            6 => (e.fir_len - 1) as f64 / (2. * e.factor() as f64),
            7 => FRAMES as f64,
            8 => LANES as f64,
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn bank_render(frames: u32) {
    unsafe {
        let n = (frames as usize).min(BLOCK);
        for s in 0..SLOTS { if ENABLED[s] { super::denormal::flush(&mut ENGINES[s].dc_in); super::denormal::flush(&mut ENGINES[s].dc_out); } }
        let mut done = [false; SLOTS];
        if VECTOR {
            for factor in [1, 2, 4] {
                let mut slots = [0; SLOTS];
                let mut len = 0;
                let mut live = 0;
                let mut clock = None;
                for s in 0..SLOTS {
                    let e = &ENGINES[s];
                    let active = e.voices.iter().filter(|v| v.active).count();
                    // Sparse instruments benefit from filling lanes together; dense
                    // instruments retain the faster existing voice-vector kernel.
                    if !ENABLED[s]
                        || e.factor() != factor
                        || active == 0
                        || active > 2
                        || !e.p[..e.count()]
                            .iter()
                            .all(|p| p[18] == 1. && p[19] == 1. && p[20] == 1.)
                    {
                        continue;
                    }
                    // All registered slots follow one worklet clock; mismatches stay independent.
                    if clock.is_some_and(|f| f != e.frame) {
                        continue;
                    }
                    clock = Some(e.frame);
                    slots[len] = s;
                    len += 1;
                    live += active;
                }
                if len >= 2 && live >= 2 {
                    let model = MODEL.as_mut().expect("bank_init required");
                    render_group(&mut ENGINES, &slots[..len], n, model);
                    FRAMES += n as u64;
                    LANES += model.iter().map(|b| b.len as u64).sum::<u64>() * n as u64;
                    for &s in &slots[..len] {
                        done[s] = true;
                    }
                }
            }
        }
        for s in 0..SLOTS {
            if ENABLED[s] && !done[s] {
                ENGINES[s].render(n);
            }
        }
    }
}
