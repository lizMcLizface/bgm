use super::*;
#[path = "simd_operators.rs"]
mod operators;
use crate::simd::{lut, I, V};
impl Fm {
    pub(super) fn simd_voices(
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
        packed: &mut [Packed; VOICES / 4],
        pos: usize,
    ) -> [f32; 2] {
        let mut out = [0.; 2];
        for base in (0..VOICES).step_by(4) {
            if !(base..base + 4).any(|i| self.voices[i].active) {
                continue;
            }
            let group = [base, base + 1, base + 2, base + 3];
            let state = &mut packed[base / 4];
            let mask = V::s(0.).lt(V::a(core::array::from_fn(|j| {
                if self.voices[base + j].active {
                    1.
                } else {
                    0.
                }
            })));
            let mut expressions = [[0.; 11]; 4];
            for (j, &voice_index) in group.iter().enumerate() {
                let v = &mut self.voices[voice_index];
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
                    for op in 0..count {
                        let p = &self.p[op];
                        v.scale[op] = (1. - p[11] + p[11] * v.velocity)
                            * 2_f32.powf(p[12] * (v.midi - 60.) / 24.).clamp(0.25, 4.)
                            * (1. + pressure * p[14]);
                    }
                }

                expressions[j] = expression;
            }
            let z = V::s(0.);
            let one = V::s(1.);
            let mut outputs = [z; OPS];
            let mut sum = [z; 2];
            let mut noise = [z; 2];
            let mut alive = [false; 4];
            let mut coloured = [false; 4];
            for (j, &i) in group.iter().enumerate() {
                let c = &self.colours[i];
                coloured[j] = colour::enabled(&self.g[41..54]) || c.engaged();
            }
            for op in 0..count {
                let p = &self.p[op];
                let mut scales = [0.; 4];
                let mut steps = [0.; 4];
                for (j, &i) in group.iter().enumerate() {
                    let v = &mut self.voices[i];
                    scales[j] = v.scale[op];
                    steps[j] = v.step[op];
                }
                let env = state.env[op].tick(p, mask);
                let stages = state.env[op].stage.array();
                for j in 0..4 {
                    if self.carriers[op] > 0. && stages[j] > 0 {
                        alive[j] = true;
                    }
                }
                let mut modulation = z;
                for source in 0..op {
                    modulation += outputs[source] * V::s(self.routing[source][op]);
                }
                if op == self.g[6] as usize {
                    let f = V::a(core::array::from_fn(|j| {
                        if expressions[j][2] == 0. {
                            self.smooth[1]
                        } else {
                            (self.smooth[1] + expressions[j][2] * 0.5).clamp(0., 1.)
                        }
                    }));
                    modulation += (state.previous[op][(pos + 8 - factor) % 8]
                        + state.previous[op][(pos + 8 - 2 * factor) % 8])
                        * V::s(0.5)
                        * f
                        * f
                        * V::s(6.);
                }
                let raw = lut(
                    &self.sine,
                    state.phase[op]
                        + modulation
                            * V::s(self.smooth[2])
                            * V::a(expressions.map(|e| 1. + e[1]))
                            * V::s(1. + lfo * self.g[18])
                            / V::s(2. * PI),
                );
                let shaped = match p[17] as u32 {
                    1 => raw.max(z) * V::s(2.) - V::s(0.63662),
                    2 => raw.abs() * V::s(2.) - V::s(1.27324),
                    3 => raw * raw * V::s(2.) - one,
                    _ => raw,
                };
                let scale = V::a(scales);
                let expression = V::a(expressions.map(|e| 1. + e[5 + op]));
                outputs[op] =
                    shaped * env * V::s(self.levels[op]) * scale * V::s(p[16]) * expression;
                let next = state.phase[op] + V::a(steps);
                state.phase[op] = mask.choose(next - next.trunc(), state.phase[op]);
                state.previous[op][pos] = mask.choose(outputs[op], state.previous[op][pos]);
                if self.carriers[op] > 0. {
                    let x = outputs[op] * V::s(self.carriers[op]) / V::s(norm)
                        * V::s(1. - self.g[17] * (lfo + 1.) * 0.5);
                    for ch in 0..2 {
                        sum[ch] += x * V::s(self.pan[op][ch]);
                    }
                    if coloured.iter().any(|x| *x) {
                        let level = env
                            * V::s(self.levels[op])
                            * scale
                            * V::s(p[16])
                            * expression
                            * V::s(self.carriers[op])
                            / V::s(norm)
                            * V::s(1. - self.g[17] * (lfo + 1.) * 0.5);
                        for ch in 0..2 {
                            noise[ch] += level * V::s(self.pan[op][ch]);
                        }
                    }
                }
            }
            let left = sum[0].array();
            let right = sum[1].array();
            let nl = noise[0].array();
            let nr = noise[1].array();
            for (j, &voice_index) in group.iter().enumerate() {
                let v = &mut self.voices[voice_index];
                if !v.active {
                    continue;
                }
                state.next[j] = (pos + 1) % 8;
                v.feedback_pos = (v.feedback_pos + 1) % 8;
                let expression = expressions[j];
                let mut voice_out = [left[j], right[j]];
                let mut noise_gain = [nl[j], nr[j]];
                let mut alive = alive[j];
                let coloured = coloured[j];
                let colour = &mut self.colours[voice_index];
                let pressure = v.pressure.max(self.g[12]);

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
        }
        out
    }
}

// Common linear/cubic envelope arithmetic across four independent voices.
// Arbitrary fractional curves retain the original scalar implementation.
#[derive(Clone, Copy)]
pub(super) struct Packed {
    valid: bool,
    next: [usize; 4],
    phase: [V; OPS],
    env: [Envelope4; OPS],
    previous: [[V; 8]; OPS],
}
pub(super) fn pack(e: &Fm) -> [Packed; VOICES / 4] {
    let z = V::s(0.);
    let mut states = [Packed {
        valid: false,
        next: [0; 4],
        phase: [z; OPS],
        env: [Envelope4::zero(); OPS],
        previous: [[z; 8]; OPS],
    }; VOICES / 4];
    for group in 0..VOICES / 4 {
        if !(0..4).any(|j| e.voices[group * 4 + j].active) {
            continue;
        }
        states[group] = Packed {
            valid: true,
            next: [0; 4],
            phase: core::array::from_fn(|op| {
                V::a(core::array::from_fn(|j| e.voices[group * 4 + j].phase[op]))
            }),
            env: core::array::from_fn(|op| Envelope4::pack(e, group, op)),
            previous: core::array::from_fn(|op| {
                core::array::from_fn(|k| {
                    V::a(core::array::from_fn(|j| {
                        let v = &e.voices[group * 4 + j];
                        v.previous[op][(v.feedback_pos + k) % 8]
                    }))
                })
            }),
        };
    }
    states
}
pub(super) fn unpack(e: &mut Fm, state: &[Packed; VOICES / 4], _pos: usize) {
    for (group, s) in state.iter().enumerate() {
        if !s.valid {
            continue;
        }
        for op in 0..OPS {
            s.env[op].unpack(e, group, op);
            let phases = s.phase[op].array();
            for j in 0..4 {
                e.voices[group * 4 + j].phase[op] = phases[j];
            }
            for k in 0..8 {
                for j in 0..4 {
                    let value = s.previous[op][(s.next[j] + k) % 8].array()[j];
                    let v = &mut e.voices[group * 4 + j];
                    v.previous[op][(v.feedback_pos + k) % 8] = value;
                }
            }
        }
    }
}

impl Fm {
    pub(super) fn simd_eligible(&self) -> bool {
        let live = self.voices.iter().filter(|v| v.active).count();
        let eligible = live >= 2
            && (live >= 3
                || operators::widths(self).iter().max().copied().unwrap_or(0) * live >= 3)
            && self.p[..self.count()]
                .iter()
                .all(|p| p[18] == 1. && p[19] == 1. && p[20] == 1.);
        eligible
    }
    fn render_voices(&mut self, frames: usize) {
        let n = frames.min(BLOCK);
        let mut packed = simd_voices::pack(self);
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
            for op in 0..OPS {
                self.levels[op] += (self.p[op][3] - self.levels[op]) * smoothing;
            }
            while self.head < self.len && self.queue[self.head].frame <= self.frame {
                let e = self.queue[self.head];
                self.head += 1;
                simd_voices::unpack(self, &packed, packed_pos);
                self.event(e);
                packed = simd_voices::pack(self);
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
                    out = self.simd_voices(
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
        simd_voices::unpack(self, &packed, packed_pos);
        if self.head == self.len {
            self.head = 0;
            self.len = 0;
        }
    }
}

#[derive(Clone, Copy)]
struct Envelope4 {
    value: V,
    start: V,
    target: V,
    total: I,
    left: I,
    stage: I,
    rate: V,
}
impl Envelope4 {
    fn zero() -> Self {
        let z = V::s(0.);
        Self {
            value: z,
            start: z,
            target: z,
            total: I::s(0),
            left: I::s(0),
            stage: I::s(0),
            rate: z,
        }
    }
    fn pack(e: &Fm, group: usize, op: usize) -> Self {
        let env = core::array::from_fn::<_, 4, _>(|j| e.voices[group * 4 + j].env[op]);
        Self {
            value: V::a(env.map(|x| x.value)),
            start: V::a(env.map(|x| x.start)),
            target: V::a(env.map(|x| x.target)),
            total: I::a(env.map(|x| x.total)),
            left: I::a(env.map(|x| x.left)),
            stage: I::a(env.map(|x| x.stage as u32)),
            rate: V::a(core::array::from_fn(|j| {
                e.sr * e.factor() as f32 / e.voices[group * 4 + j].rate[op]
            })),
        }
    }
    fn unpack(self, e: &mut Fm, group: usize, op: usize) {
        let value = self.value.array();
        let start = self.start.array();
        let target = self.target.array();
        let total = self.total.array();
        let left = self.left.array();
        let stage = self.stage.array();
        for j in 0..4 {
            e.voices[group * 4 + j].env[op] = Envelope {
                value: value[j],
                start: start[j],
                target: target[j],
                total: total[j],
                left: left[j],
                stage: stage[j] as u8,
            };
        }
    }
    #[inline(always)]
    fn tick(&mut self, p: &[f32; OP_PARAMS], active: V) -> V {
        let held = active.and(self.stage.eq(I::s(5)));
        let running = active
            .and(self.stage.eq(I::s(0)).not())
            .and(self.stage.eq(I::s(5)).not());
        let held_value = self.value + (V::s(p[9]) - self.value) * V::s(0.001);
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
        let shaped = if p[21] >= 0.5 {
            fraction
        } else {
            self.target.lt(self.start).choose(down, fraction)
        };
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
                        targets[j] = p[if stages[j] == 1 { 8 } else { 9 }];
                        totals[j] =
                            (p[if stages[j] == 1 { 5 } else { 7 }] * rates[j]).max(1.) as u32;
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

impl Fm {
    pub(super) fn render_simd(&mut self, frames: usize) {
        if self.voices.iter().filter(|v| v.active).count() >= 3 {
            self.render_voices(frames)
        } else {
            self.render_operators(frames)
        }
    }
}
