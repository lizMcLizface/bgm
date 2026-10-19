//! Low-polyphony SIMD: schedule independent (voice, operator) units by DAG depth.
//! Carrier mixing and acoustic colour retain original voice/operator order.
use super::*;
const BANDS: usize = VOICES / 4 * OPS;
#[derive(Clone, Copy)]
struct Band {
    units: [(usize, usize); 4],
    len: usize,
    params: [V; OP_PARAMS],
    phase: V,
    previous: [V; 8],
    next: [usize; 4],
    env: Envelope4,
    sources: [[(usize, usize); 4]; OPS],
    weights: [V; OPS],
    inputs: usize,
    feedback: V,
    steps: V,
    scales: V,
    levels: V,
    shape: u32,
    shapes: [V; 3],
}
impl Band {
    fn zero() -> Self {
        let z = V::s(0.);
        Self {
            units: [(0, 0); 4],
            len: 0,
            params: [z; OP_PARAMS],
            phase: z,
            previous: [z; 8],
            next: [0; 4],
            env: Envelope4::zero(),
            sources: [[(0, 0); 4]; OPS],
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
    fn new(e: &Fm, units: [(usize, usize); 4], len: usize) -> Self {
        let mut b = Self::zero();
        b.units = units;
        b.len = len;
        b.params = core::array::from_fn(|k| V::a(core::array::from_fn(|j| e.p[units[j].1][k])));
        let env: [Envelope; 4] = core::array::from_fn(|j| {
            if j < len {
                e.voices[units[j].0].env[units[j].1]
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
                let (v, op) = units[j];
                e.sr * e.factor() as f32 / e.voices[v].rate[op]
            })),
        };
        b.phase = V::a(core::array::from_fn(|j| {
            let (v, op) = units[j];
            e.voices[v].phase[op]
        }));
        b.previous = core::array::from_fn(|k| {
            V::a(core::array::from_fn(|j| {
                let (v, op) = units[j];
                let v = &e.voices[v];
                v.previous[op][(v.feedback_pos + k) % 8]
            }))
        });
        let mut weights = [[0.; 4]; OPS];
        for j in 0..len {
            let (v, op) = units[j];
            let mut count = 0;
            for source in 0..op {
                let weight = e.routing[source][op];
                if weight != 0. {
                    b.sources[count][j] = (v, source);
                    weights[count][j] = weight;
                    count += 1;
                }
            }
            b.inputs = b.inputs.max(count);
        }
        b.weights = weights.map(V::a);
        b.feedback = V::s(0.).lt(V::a(core::array::from_fn(|j| {
            if j < len && units[j].1 == e.g[6] as usize {
                1.
            } else {
                0.
            }
        })));
        b.steps = V::a(units.map(|(v, op)| e.voices[v].step[op]));
        b.scales = V::a(units.map(|(v, op)| e.voices[v].scale[op]));
        b.levels = V::a(units.map(|(_, op)| e.levels[op]));
        b.shape = e.p[units[0].1][17] as u32;
        if (0..len).any(|j| e.p[units[j].1][17] as u32 != b.shape) {
            b.shape = 4;
        }
        b.shapes = core::array::from_fn(|k| {
            V::s(0.).lt(V::a(core::array::from_fn(|j| {
                if e.p[units[j].1][17] as usize == k + 1 {
                    1.
                } else {
                    0.
                }
            })))
        });
        b
    }
}
pub(super) fn widths(e: &Fm) -> [usize; OPS] {
    let mut depth = [0usize; OPS];
    let mut widths = [0; OPS];
    for op in 0..e.count() {
        for source in 0..op {
            if e.routing[source][op] != 0. {
                depth[op] = depth[op].max(depth[source] + 1);
            }
        }
        widths[depth[op]] += 1;
    }
    widths
}
struct Model {
    bands: [Band; BANDS],
    count: usize,
}
fn pack_units(e: &Fm) -> Model {
    let mut model = Model {
        bands: [Band::zero(); BANDS],
        count: 0,
    };
    let mut depth = [0usize; OPS];
    for op in 0..e.count() {
        for source in 0..op {
            if e.routing[source][op] != 0. {
                depth[op] = depth[op].max(depth[source] + 1);
            }
        }
    }
    for level in 0..OPS {
        let mut units = [(0, 0); 4];
        let mut len = 0;
        for v in 0..VOICES {
            if !e.voices[v].active {
                continue;
            }
            for op in 0..e.count() {
                if depth[op] != level {
                    continue;
                }
                units[len] = (v, op);
                len += 1;
                if len == 4 {
                    model.bands[model.count] = Band::new(e, units, len);
                    model.count += 1;
                    len = 0;
                }
            }
        }
        if len > 0 {
            model.bands[model.count] = Band::new(e, units, len);
            model.count += 1;
        }
    }
    model
}
fn unpack_units(e: &mut Fm, m: &Model, _pos: usize) {
    for b in &m.bands[..m.count] {
        let phase = b.phase.array();
        let value = b.env.value.array();
        let start = b.env.start.array();
        let target = b.env.target.array();
        let total = b.env.total.array();
        let left = b.env.left.array();
        let stage = b.env.stage.array();
        for j in 0..b.len {
            let (i, op) = b.units[j];
            let v = &mut e.voices[i];
            v.phase[op] = phase[j];
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
impl Fm {
    fn simd_operators(
        &mut self,
        count: usize,
        factor: usize,
        sr: f32,
        norm: f32,
        lfo: f32,
        lfo2: f32,
        control: bool,
        expression_alpha: f32,
        motion: bool,
        routes: bool,
        levels_changed: bool,
        model: &mut Model,
        pos: usize,
    ) -> [f32; 2] {
        let mut expressions = [[0.; 11]; VOICES];
        let mut refresh = [false; VOICES];
        let mut expressed = false;
        let mut colours = [false; VOICES];
        for (voice_index, v) in self.voices.iter_mut().enumerate() {
            if !v.active {
                continue;
            }
            // Only handoffs set different targets; ordinary/polyphonic
            // voices keep their sample-identical path. Five-ms slew avoids
            // a replacement amplitude/filter step when key velocity changes.
            let handoff_dynamics =
                v.velocity != v.velocity_target || v.pressure != v.pressure_target;
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
            let update = control || self.frame == v.age;
            let pressure = v.pressure.max(self.g[12]);
            let random = v.expression.tick(&self.g, sr, expression_alpha, motion);
            let mut targets = [0.; 11];
            if routes {
                for slot in 0..4 {
                    let at = 29 + slot * 3;
                    let destination = self.g[at + 1] as usize;
                    if destination == 0 || self.g[at] == 0. || self.g[at + 2] == 0. {
                        continue;
                    }
                    let source = match self.g[at] as u32 {
                        1 => lfo,
                        2 => lfo2,
                        3 => v.expression.value,
                        4 => v.velocity,
                        5 => ((v.midi - 60.) / 36.).clamp(-1., 1.),
                        6 => pressure,
                        7 => self.g[9],
                        8 => random,
                        _ => 0.,
                    };
                    targets[destination - 1] += source * self.g[at + 2];
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
                let age = (self.frame - v.age) as f32 / self.sr;
                let transient = self.g[15] * (1. - age / self.g[16]).max(0.);
                let hz = 440.
                    * ((v.midi - 69.
                        + self.bend
                        + transient
                        + lfo * (self.g[11] + self.g[9] * 35.) / 100.
                        + (random * self.g[27] + expression[0] * 100.) / 100.)
                        / 12.)
                        .exp2();
                for op in 0..count {
                    let p = &self.p[op];
                    let freq = if p[1] > 0. { p[1] } else { hz * p[0] };
                    v.step[op] = (freq * (p[2] / 1200.).exp2() / sr).clamp(0., 0.45);
                }
            }
            // A handoff's slewed velocity/pressure must not turn back
            // into 16-sample amplitude steps at the operator scaler.
            if update || handoff_dynamics {
                refresh[voice_index] = true;
                for op in 0..count {
                    let p = &self.p[op];
                    v.scale[op] = (1. - p[11] + p[11] * v.velocity)
                        * 2_f32.powf(p[12] * (v.midi - 60.) / 24.).clamp(0.25, 4.)
                        * (1. + pressure * p[14]);
                }
            }

            let active = expression.iter().any(|x| *x != 0.);
            expressed |= active;
            if active {
                expressions[voice_index] = expression;
            }
            colours[voice_index] =
                colour::enabled(&self.g[41..54]) || self.colours[voice_index].engaged();
        }
        let z = V::s(0.);
        let one = V::s(1.);
        let mut output = [[0.; OPS]; VOICES];
        let mut envs = [[0.; OPS]; VOICES];
        let mut alive_flags = [false; VOICES];
        for band in &mut model.bands[..model.count] {
            let mask = V::s(0.).lt(V::a(core::array::from_fn(|j| {
                if j < band.len && self.voices[band.units[j].0].active {
                    1.
                } else {
                    0.
                }
            })));
            if band.units[..band.len].iter().any(|(v, _)| refresh[*v]) {
                band.steps = V::a(band.units.map(|(v, op)| self.voices[v].step[op]));
                band.scales = V::a(band.units.map(|(v, op)| self.voices[v].scale[op]));
            }
            if levels_changed {
                band.levels = V::a(band.units.map(|(_, op)| self.levels[op]));
            }
            let p = &band.params;
            let env = band.env.tick_units(p, mask);
            let mut modulation = z;
            for input in 0..band.inputs {
                let sources = band.sources[input];
                modulation += V::a(sources.map(|(v, op)| output[v][op])) * band.weights[input];
            }
            if band.feedback.any() {
                let feedback = if expressed {
                    V::a(core::array::from_fn(|j| {
                        let value = expressions[band.units[j].0][2];
                        if value == 0. {
                            self.smooth[1]
                        } else {
                            (self.smooth[1] + value * 0.5).clamp(0., 1.)
                        }
                    }))
                } else {
                    V::s(self.smooth[1])
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
                &self.sine,
                band.phase
                    + modulation
                        * V::s(self.smooth[2])
                        * if expressed {
                            V::a(band.units.map(|(v, _)| 1. + expressions[v][1]))
                        } else {
                            one
                        }
                        * V::s(1. + lfo * self.g[18])
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
                    V::a(band.units.map(|(v, op)| 1. + expressions[v][5 + op]))
                } else {
                    one
                };
            let next = band.phase + band.steps;
            band.phase = mask.choose(next - next.trunc(), band.phase);
            band.previous[pos] = mask.choose(value, band.previous[pos]);
            let values = value.array();
            let envelopes = env.array();
            let s = band.env.stage.array();
            for j in 0..band.len {
                let (v, op) = band.units[j];
                if !self.voices[v].active {
                    continue;
                }
                output[v][op] = values[j];
                if colours[v] {
                    envs[v][op] = envelopes[j];
                }
                alive_flags[v] |= self.carriers[op] > 0. && s[j] > 0;
                band.next[j] = (pos + 1) % 8;
            }
        }
        let mut out = [0.; 2];
        for (voice_index, v) in self.voices.iter_mut().enumerate() {
            if !v.active {
                continue;
            }
            let expression = expressions[voice_index];
            let pressure = v.pressure.max(self.g[12]);
            let colour = &mut self.colours[voice_index];
            let coloured = colours[voice_index];
            let mut voice_out = [0.; 2];
            let mut noise_gain = [0.; 2];
            let mut alive = alive_flags[voice_index];
            for op in 0..count {
                if self.carriers[op] > 0. {
                    let p = &self.p[op];
                    let x = output[voice_index][op] * self.carriers[op] / norm
                        * (1. - self.g[17] * (lfo + 1.) * 0.5);
                    for ch in 0..2 {
                        voice_out[ch] += x * self.pan[op][ch];
                    }
                    if coloured {
                        let level = envs[voice_index][op]
                            * self.levels[op]
                            * v.scale[op]
                            * p[16]
                            * (1. + expression[5 + op])
                            * self.carriers[op]
                            / norm
                            * (1. - self.g[17] * (lfo + 1.) * 0.5);
                        for ch in 0..2 {
                            noise_gain[ch] += level * self.pan[op][ch];
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
                voice_out = colour.tick(voice_out, noise_gain, pressure, &self.g[41..54], sr);
                alive |= colour.ringing();
            }
            if v.fade > 0 {
                let t = v.fade as f32 / (64. * factor as f32);
                voice_out[0] += v.tail[0] * t;
                voice_out[1] += v.tail[1] * t;
                v.fade -= 1;
            }
            v.last = voice_out;
            out[0] += voice_out[0];
            out[1] += voice_out[1];
            if !alive && v.fade == 0 {
                v.active = false;
            }
        }
        out
    }
    pub(super) fn render_operators(&mut self, frames: usize) {
        let n = frames.min(BLOCK);
        let mut packed = pack_units(self);
        let mut packed_pos = 0;
        let factor = self.factor();
        let sr = self.sr * factor as f32;
        let count = self.count();
        // Empty instruments still advance their clock, smooth controls and LFOs.
        // Avoid scanning every voice twice per output sample before the first
        // scheduled note (or after panic), while keeping event boundaries exact.
        let voice_idle = !self.idle_reference
            && !self.voices.iter().any(|v| v.active)
            && (self.head >= self.len || self.queue[self.head].frame >= self.frame + n as u64);
        // Zero FIR history and a residual DC state are independent. Keep the
        // exact DC recurrence running without convolving an all-zero history.
        let mut fir_idle = !self.idle_reference && self.history.iter().flatten().all(|x| *x == 0.);
        let mut filter_idle = fir_idle
            && self
                .dc_in
                .iter()
                .chain(self.dc_out.iter())
                .all(|x| *x == 0.);
        let norm = self.carriers[..count].iter().sum::<f32>().max(1.);
        let dc = (-2. * PI * 8. / self.sr).exp();
        self.peak = 0.;
        let smoothing = 1. - (-1. / (self.sr * 0.008)).exp();
        let expression_alpha = 1. - (-1. / (sr * 0.005)).exp();
        let routes = (0..4).any(|slot| {
            let at = 29 + slot * 3;
            self.g[at] > 0. && self.g[at + 1] > 0. && self.g[at + 2] != 0.
        });
        let motion = self.g[27] > 0.
            || (0..4).any(|slot| {
                let at = 29 + slot * 3;
                self.g[at] == 8. && self.g[at + 1] > 0. && self.g[at + 2] != 0.
            });
        for sample in 0..n {
            for (i, param) in [3, 5, 7].iter().enumerate() {
                self.smooth[i] += (self.g[*param] - self.smooth[i]) * smoothing;
            }
            let mut levels_changed = false;
            for op in 0..OPS {
                let old = self.levels[op];
                self.levels[op] += (self.p[op][3] - self.levels[op]) * smoothing;
                levels_changed |= old != self.levels[op];
            }
            while self.head < self.len && self.queue[self.head].frame <= self.frame {
                let e = self.queue[self.head];
                self.head += 1;
                unpack_units(self, &packed, packed_pos);
                self.event(e);
                packed = pack_units(self);
                packed_pos = 0;
            }
            for sub in 0..factor {
                self.bend += (self.g[8] - self.bend) * 0.002 / factor as f32;
                let lfo = sin(&self.sine, self.lfo);
                self.lfo = (self.lfo + self.g[10] / sr).fract();
                let lfo2 = sin(&self.sine, self.lfo2);
                self.lfo2 = (self.lfo2 + self.g[28] / sr).fract();
                let control = self.frame % 16 == 0 && sub == 0;
                let mut out = [0.; 2];
                if !voice_idle {
                    out = self.simd_operators(
                        count,
                        factor,
                        sr,
                        norm,
                        lfo,
                        lfo2,
                        control,
                        expression_alpha,
                        motion,
                        routes,
                        levels_changed,
                        &mut packed,
                        packed_pos,
                    );
                    packed_pos = (packed_pos + 1) % 8;
                }
                for ch in 0..2 {
                    let value = out[ch] * self.smooth[0] * 0.98;
                    if value != 0. {
                        filter_idle = false;
                        fir_idle = false;
                    }
                    self.history[ch][self.fir_pos] = value;
                }
                self.fir_pos = (self.fir_pos + 1) % 64;
            }
            let mut clean = [0.; 2];
            // Only exact zero is skipped: no tail truncation or new silence
            // threshold. As soon as any sample enters the FIR, use its original
            // arithmetic and DC state for the rest of this block.
            if !filter_idle {
                for ch in 0..2 {
                    let mut x = 0.;
                    if !fir_idle {
                        for i in 0..self.fir_len {
                            x += self.history[ch][(self.fir_pos + 63 - i) % 64] * self.fir[i];
                        }
                    }
                    let filtered = x - self.dc_in[ch] + dc * self.dc_out[ch];
                    self.dc_in[ch] = x;
                    self.dc_out[ch] = filtered;
                    clean[ch] = filtered;
                }
            }
            let protected = self.headroom.tick(clean);
            for ch in 0..2 {
                let y = protected[ch];
                self.output[ch][sample] = y;
                self.peak = self.peak.max(y.abs());
            }
            self.frame += 1;
        }
        unpack_units(self, &packed, packed_pos);
        if self.head == self.len {
            self.head = 0;
            self.len = 0;
        }
    }
}
impl Envelope4 {
    fn tick_units(&mut self, p: &[V; OP_PARAMS], active: V) -> V {
        let held = active.and(self.stage.eq(I::s(5)));
        let running = active
            .and(self.stage.eq(I::s(0)).not())
            .and(self.stage.eq(I::s(5)).not());
        let held_value = self.value + (p[9] - self.value) * V::s(0.001);
        if !running.any() {
            self.value = held.choose(held_value, self.value);
            return active
                .and(self.stage.eq(I::s(0)).not())
                .choose(self.value, V::s(0.));
        }
        self.left = I::choose(running, self.left.down(), self.left);
        let fraction = V::s(1.) - self.left.float() / self.total.max(I::s(1)).float();
        let t = V::s(1.) - fraction;
        let down = V::s(1.) - t * t * t;
        let shaped = p[21]
            .lt(V::s(0.5))
            .choose(self.target.lt(self.start).choose(down, fraction), fraction);
        let value = self.start + (self.target - self.start) * shaped;
        self.value = running.choose(value, held.choose(held_value, self.value));
        let transition = running.and(self.left.eq(I::s(0)));
        if transition.any() {
            let mut values = self.value.array();
            let mut starts = self.start.array();
            let mut targets = self.target.array();
            let mut totals = self.total.array();
            let mut left = self.left.array();
            let mut stages = self.stage.array();
            let mask = transition.array();
            let rates = self.rate.array();
            for j in 0..4 {
                if mask[j].to_bits() == 0 {
                    continue;
                }
                match stages[j] {
                    1 | 2 => {
                        starts[j] = values[j];
                        targets[j] = p[if stages[j] == 1 { 8 } else { 9 }].array()[j];
                        totals[j] = (p[if stages[j] == 1 { 5 } else { 7 }].array()[j] * rates[j])
                            .max(1.) as u32;
                        left[j] = totals[j];
                        stages[j] += 1;
                    }
                    3 => stages[j] = 5,
                    4 => {
                        values[j] = 0.;
                        starts[j] = 0.;
                        targets[j] = 0.;
                        totals[j] = 0;
                        left[j] = 0;
                        stages[j] = 0;
                    }
                    _ => {}
                }
            }
            self.value = V::a(values);
            self.start = V::a(starts);
            self.target = V::a(targets);
            self.total = I::a(totals);
            self.left = I::a(left);
            self.stage = I::a(stages);
        }
        active
            .and(self.stage.eq(I::s(0)).not())
            .choose(self.value, V::s(0.))
    }
}

#[cfg(feature = "multitimbral")]
#[path = "bank.rs"]
mod bank;
