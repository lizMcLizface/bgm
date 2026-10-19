use super::*;
use crate::simd::V;
#[derive(Clone, Copy)]
struct Item {
    x: f32,
    g: f32,
    amp: f32,
    pan: f32,
    value: f32,
    pwm: f32,
    dt: [f32; 2],
}
impl Item {
    const ZERO: Self = Self {
        x: 0.,
        g: 0.,
        amp: 0.,
        pan: 0.,
        value: 0.,
        pwm: 0.,
        dt: [0.01; 2],
    };
}
#[inline(always)]
fn filter(x: V, g: V, k: f32, ic1: &mut V, ic2: &mut V, kind: u32) -> V {
    let a1 = V::s(1.) / (V::s(1.) + g * (g + V::s(k)));
    let v1 = a1 * (*ic1 + g * (x - *ic2));
    let v2 = *ic2 + g * v1;
    *ic1 = (V::s(2.) * v1 - *ic1).clamp(-16., 16.);
    *ic2 = (V::s(2.) * v2 - *ic2).clamp(-16., 16.);
    match kind {
        2 => v1,
        3 => x - V::s(k) * v1 - v2,
        _ => v2,
    }
}
#[inline(always)]
fn soft4(x: V) -> V {
    let x = x.clamp(-3., 3.);
    x * (V::s(27.) + x * x) / (V::s(27.) + V::s(9.) * x * x)
}
impl Engine {
    pub(super) fn simd_voices(
        &mut self,
        mode: u32,
        layers: usize,
        unison: usize,
        lfos: [[f32; 2]; 2],
        control: bool,
        routes: [bool; 2],
        motion_enabled: [bool; 2],
        packed: &mut [Packed; VOICES / 4 * 2 * UNISON],
    ) -> [f32; 2] {
        let mut out = [0.; 2];
        let mut items = [Item::ZERO; VOICES * 2 * UNISON];
        let mut alive = [false; VOICES];
        let mut flags = [[false; 2]; VOICES];
        let mut pressures = [0.; VOICES];
        for (voice_index, v) in self.voices.iter_mut().enumerate() {
            if !v.active {
                continue;
            }
            // Only handoffs set different targets; ordinary/polyphonic
            // voices keep their sample-identical path. Five-ms slew avoids
            // a replacement amplitude/filter step when key velocity changes.
            if v.velocity != v.velocity_target {
                v.velocity += (v.velocity_target - v.velocity) * self.modulation_alpha;
                if (v.velocity_target - v.velocity).abs() < 1e-6 {
                    v.velocity = v.velocity_target;
                }
            }
            if v.pressure != v.pressure_target {
                v.pressure += (v.pressure_target - v.pressure) * self.modulation_alpha;
                if (v.pressure_target - v.pressure).abs() < 1e-6 {
                    v.pressure = v.pressure_target;
                }
            }
            if v.glide_left > 0 {
                v.midi += (v.target_midi - v.midi) / v.glide_left as f32;
                v.glide_left -= 1;
                if control || v.glide_left == 0 {
                    v.hz = 440. * ((v.midi - 69.) / 12.).exp2();
                }
            }

            for l in 0..layers {
                let p = &self.p[l];
                let colour = unsafe { &mut COLOURS[voice_index][l] };
                let coloured = colour::enabled(&p[86..99]) || colour.engaged();

                let amp = v.amp[l].next(p, 17, 59, self.sr);
                let fe = if mode == 3 {
                    amp
                } else {
                    v.filter_env[l].next(p, 21, 62, self.sr)
                };
                let me = v.mod_env[l].next(p, 65, 69, self.sr);
                alive[voice_index] |= v.amp[l].stage > 0;
                let age = (self.frame - v.age) as f32 / self.sr;
                let fade_lfo = if p[45] > 0.001 {
                    (age / p[45]).min(1.)
                } else {
                    1.
                };
                let pressure = v.pressure.max(self.global[7]);
                pressures[voice_index] = pressure;
                flags[voice_index][l] = coloured;
                let update = control || self.frame == v.age;
                let motion = if motion_enabled[l] {
                    v.motion[l].next(p[72], self.sr)
                } else {
                    0.
                };
                let mut target = [0.; 5];
                if routes[l] {
                    for slot in 0..4 {
                        let at = 74 + slot * 3;
                        let destination = p[at + 1] as usize;
                        if destination == 0 || p[at] == 0. || p[at + 2] == 0. {
                            continue;
                        }
                        let source = match p[at] as u32 {
                            1 => lfos[l][0] * fade_lfo,
                            2 => lfos[l][1],
                            3 => me,
                            4 => amp,
                            5 => fe,
                            6 => v.velocity,
                            7 => ((v.midi - 60.) / 36.).clamp(-1., 1.),
                            8 => pressure,
                            9 => self.global[6],
                            10 => motion,
                            _ => 0.,
                        };
                        target[destination - 1] += source * p[at + 2];
                    }
                }
                for k in 0..5 {
                    if target[k] != 0. || v.modulation[l][k] != 0. {
                        v.modulation[l][k] +=
                            (target[k].clamp(-1., 1.) - v.modulation[l][k]) * self.modulation_alpha;
                        if v.modulation[l][k].abs() < 1e-12 {
                            v.modulation[l][k] = 0.;
                        }
                    }
                }
                let modulation = v.modulation[l];
                let lfo_pitch = (lfos[l][0] * (p[26] + self.global[6] * 35.) * fade_lfo
                    + lfos[l][1] * p[36])
                    / 1200.;
                let env_pitch = fe * p[34] / 12.;
                let drift = if mode == 3 {
                    0.
                } else {
                    p[29] * v.drift / 1200.
                };
                let pitch = if update {
                    (self.bend / 12.
                        + env_pitch
                        + drift
                        + lfo_pitch
                        + pressure * p[56] / 1200.
                        + (motion * p[73] + modulation[0] * 100.) / 1200.)
                        .exp2()
                } else {
                    0.
                };
                let pwm = (p[6] + lfos[l][0] * p[28] + fe * p[40] + modulation[2] * 0.4)
                    .clamp(0.05, 0.95);
                let vel = 1. - p[42] + p[42] * v.velocity;
                for u in 0..unison {
                    let lane = &mut v.lanes[l][u];
                    // Frequency/cutoff evaluated every 16 samples, interpolated cutoff per sample.
                    if update {
                        let position = if unison > 1 {
                            u as f32 / (unison - 1) as f32 * 2. - 1.
                        } else {
                            0.
                        };
                        let detune = (position * self.global[3] / 1200.).exp2();
                        let base = v.hz * pitch * detune;
                        lane.dt = [
                            (base * self.ratios[l][0] / self.sr).clamp(0.000001, 0.45),
                            ((if p[53] >= 0.5 {
                                if p[99] >= 0.5 {
                                    v.hz * pitch
                                } else {
                                    base
                                }
                            } else {
                                440. * pitch * detune
                            }) * self.ratios[l][1]
                                / self.sr
                                / if p[54] >= 0.5 { env_pitch.exp2() } else { 1. })
                            .clamp(0.000001, 0.45),
                        ];
                        let oct = fe * p[14]
                            + lfos[l][0] * p[27]
                            + lfos[l][1] * p[37]
                            + pressure * p[41]
                            + p[16] * (v.velocity - 0.5)
                            + p[15] * (v.midi - 60.) / 12.
                            + modulation[1] * 4.;
                        let hz = (p[9] * oct.exp2()).clamp(15., self.sr * 0.4);
                        lane.target_g = (PI * hz / self.sr).tan();
                    }
                    let noise = if p[8] > 0. {
                        random(&mut v.rng) * p[8] * 0.3
                    } else {
                        0.
                    };
                    let amp = amp
                        * vel
                        * p[30]
                        * (1. - p[38] * (lfos[l][1] + 1.) * 0.5)
                        * (1. - p[55] + p[55] * pressure)
                        * (1. + modulation[3]);
                    let position = if unison > 1 {
                        u as f32 / (unison - 1) as f32 * 2. - 1.
                    } else {
                        0.
                    };
                    let pan =
                        (p[31] + position * self.global[11] * 0.8 + modulation[4]).clamp(-1., 1.);
                    items[voice_index * 2 * UNISON + l * UNISON + u] = Item {
                        x: noise,
                        g: lane.target_g,
                        amp,
                        pan,
                        value: 0.,
                        pwm,
                        dt: lane.dt,
                    };
                }
            }
        }

        for l in 0..layers {
            let p = &self.p[l];
            for base in (0..VOICES).step_by(4) {
                if !(base..base + 4).any(|i| self.voices[i].active) {
                    continue;
                }
                for u in 0..unison {
                    let group = [
                        base * UNISON + u,
                        (base + 1) * UNISON + u,
                        (base + 2) * UNISON + u,
                        (base + 3) * UNISON + u,
                    ];
                    let position = (base / 4 * 2 + l) * UNISON + u;
                    let old = packed[position];
                    let mask = V::s(0.).lt(V::a(core::array::from_fn(|j| {
                        if self.voices[base + j].active {
                            1.
                        } else {
                            0.
                        }
                    })));
                    let frame: [Item; 4] =
                        core::array::from_fn(|j| items[(base + j) * 2 * UNISON + l * UNISON + u]);
                    let dt_a = V::a(frame.map(|x| x.dt[0]));
                    let dt_b = V::a(frame.map(|x| x.dt[1]));
                    let pwm = V::a(frame.map(|x| x.pwm));
                    let raw_b = wave4(
                        p[1] as u32,
                        if mode == 3 {
                            old.phase[0]
                        } else {
                            old.phase[1]
                        },
                        if mode == 3 { dt_a } else { dt_b },
                        (pwm + V::s(p[51])).clamp(0.05, 0.95),
                        &self.sine,
                    );
                    let pwma = (pwm + V::s(p[50]) + raw_b * V::s(p[33])).clamp(0.05, 0.95);
                    let step = (dt_a * (V::s(1.) + raw_b * V::s(p[32]))).clamp(0.000001, 0.45);
                    let a =
                        wave4(p[0] as u32, old.phase[0], step, pwma, &self.sine) + old.sync_tail;
                    let sub = wave4(4, old.phase[2], dt_a * V::s(0.5), V::s(0.5), &self.sine);
                    let mix = if p[99] >= 0.5 {
                        let n = unison as f32;
                        a * V::s(p[2]) * V::s(n) / V::s(1. + (n - 1.) * 0.2)
                            + if u == 0 {
                                raw_b * V::s(p[3]) * V::s(n)
                            } else {
                                V::s(0.)
                            }
                    } else {
                        a * V::s(p[2]) + raw_b * V::s(p[3])
                    };
                    let x = ((mix * V::s(1. - p[57]) + a * raw_b * V::s(p[57]))
                        + sub * V::s(p[7])
                        + V::a(frame.map(|x| x.x)))
                        * V::s(0.5);
                    let targets = V::a(frame.map(|x| x.g));
                    let g = old.g
                        + (targets - old.g)
                            * V::s(if self.modern_filters {
                                self.cutoff_alpha
                            } else {
                                0.08
                            });
                    let hp_g = V::s(self.hp_g[l]);
                    let mut h1 = old.hp1;
                    let mut h2 = old.hp2;
                    let high = filter(
                        x,
                        hp_g,
                        damping(p[13], self.modern_filters),
                        &mut h1,
                        &mut h2,
                        3,
                    );
                    let driven = if p[99] >= 0.5 && p[39] == 0. {
                        high
                    } else {
                        soft4(high * V::s(1. + p[39]))
                    };
                    let kind = if mode == 2 { 0 } else { p[11] as u32 };
                    let mut a = old.lp1;
                    let mut b = old.lp2;
                    let mut c = old.lq1;
                    let mut d = old.lq2;
                    let mut ladder = old.ladder;
                    let mut result = if p[58] >= 0.5 && mode != 2 {
                        // The nonlinear ladder's four state poles are independent across voices too.
                        let g = g / (V::s(1.) + g);
                        let g2 = g * g;
                        let g3 = g2 * g;
                        let g4 = g2 * g2;
                        let feedback = p[10] * 3.8;
                        let mut z = old.ladder;
                        let state = (V::s(1.) - g) * (g3 * z[0] + g2 * z[1] + g * z[2] + z[3]);
                        let mut signal = soft4(
                            (driven - V::s(feedback) * state) / (V::s(1.) + V::s(feedback) * g4),
                        );
                        for k in 0..4 {
                            let v = (signal - z[k]) * g;
                            signal = v + z[k];
                            z[k] = (signal + v).clamp(-8., 8.);
                        }
                        ladder = z;
                        signal
                            * V::s(if self.modern_filters {
                                1. + feedback * 0.75
                            } else {
                                1.
                            })
                    } else if self.modern_filters && kind == 1 {
                        let scale = 1. - p[10] * 0.7;
                        let first = filter(driven, g, 1.847759 * scale, &mut a, &mut b, 0);
                        filter(first, g, 0.76536685 * scale, &mut c, &mut d, 0)
                    } else {
                        let first = filter(
                            driven,
                            g,
                            damping(p[10], self.modern_filters),
                            &mut a,
                            &mut b,
                            kind,
                        );
                        if kind == 1 {
                            filter(
                                first,
                                g,
                                damping(p[10], self.modern_filters),
                                &mut c,
                                &mut d,
                                0,
                            )
                        } else {
                            first
                        }
                    };
                    if p[99] >= 0.5 && kind == 2 {
                        result = result * V::s(damping(p[10], self.modern_filters));
                    }
                    let result = result.array();
                    for (j, &key) in group.iter().enumerate() {
                        if self.voices[base + j].active {
                            items[(key / UNISON) * 2 * UNISON + l * UNISON + key % UNISON].value =
                                result[j];
                        }
                    }
                    let next = [
                        old.phase[0] + step,
                        old.phase[1] + dt_b,
                        old.phase[2] + dt_a * V::s(0.5),
                    ];
                    packed[position] = Packed {
                        valid: true,
                        phase: core::array::from_fn(|k| {
                            mask.choose(next[k] - next[k].trunc(), old.phase[k])
                        }),
                        g: mask.choose(g, old.g),
                        sync_tail: mask.choose(V::s(0.), old.sync_tail),
                        previous_width: mask.choose(pwma, old.previous_width),
                        hp1: mask.choose(h1, old.hp1),
                        hp2: mask.choose(h2, old.hp2),
                        lp1: mask.choose(a, old.lp1),
                        lp2: mask.choose(b, old.lp2),
                        lq1: mask.choose(c, old.lq1),
                        lq2: mask.choose(d, old.lq2),
                        ladder: core::array::from_fn(|k| mask.choose(ladder[k], old.ladder[k])),
                    };
                }
            }
        }
        for (voice_index, v) in self.voices.iter_mut().enumerate() {
            if !v.active {
                continue;
            }
            let mut voice_out = [0.; 2];
            let mut alive = alive[voice_index];
            let pressure = pressures[voice_index];
            for l in 0..layers {
                let p = &self.p[l];
                let coloured = flags[voice_index][l];
                let colour = unsafe { &mut COLOURS[voice_index][l] };
                let mut layer_out = [0.; 2];
                let mut noise_gain = [0.; 2];
                for u in 0..unison {
                    let item = items[voice_index * 2 * UNISON + l * UNISON + u];
                    let filtered = item.value;
                    let amp = item.amp;
                    let pan = item.pan;
                    // The oscillator mixer reserves 6 dB before the driven
                    // filters. Restore that level after filtering, rather
                    // than unintentionally attenuating every held voice.
                    let signal = filtered * amp * 2. / unison as f32;
                    if coloured {
                        layer_out[0] += signal * (1. - pan) * 0.5;
                        layer_out[1] += signal * (1. + pan) * 0.5;
                        noise_gain[0] += amp * (1. - pan) * 0.5 / unison as f32;
                        noise_gain[1] += amp * (1. + pan) * 0.5 / unison as f32;
                    } else {
                        voice_out[0] += signal * (1. - pan) * 0.5;
                        voice_out[1] += signal * (1. + pan) * 0.5;
                    }
                }
                if coloured {
                    let output = colour.tick(layer_out, noise_gain, pressure, &p[86..99], self.sr);
                    voice_out[0] += output[0];
                    voice_out[1] += output[1];
                    alive |= colour.ringing();
                }
            }
            if v.fade > 0 {
                let t = v.fade as f32 / 64.;
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
}

#[derive(Clone, Copy)]
pub(super) struct Packed {
    valid: bool,
    phase: [V; 3],
    g: V,
    sync_tail: V,
    previous_width: V,
    hp1: V,
    hp2: V,
    lp1: V,
    lp2: V,
    lq1: V,
    lq2: V,
    ladder: [V; 4],
}
pub(super) fn pack(e: &Engine) -> [Packed; VOICES / 4 * 2 * UNISON] {
    let z = V::s(0.);
    let zero = Packed {
        valid: false,
        phase: [z; 3],
        g: z,
        sync_tail: z,
        previous_width: z,
        hp1: z,
        hp2: z,
        lp1: z,
        lp2: z,
        lq1: z,
        lq2: z,
        ladder: [z; 4],
    };
    let mut states = [zero; VOICES / 4 * 2 * UNISON];
    let layers = if e.global[0] == 2. { 2 } else { 1 };
    let unison = e.global[2] as usize;
    for base in (0..VOICES).step_by(4) {
        if !(base..base + 4).any(|i| e.voices[i].active) {
            continue;
        }
        for l in 0..layers {
            for u in 0..unison {
                let lane = |j: usize| &e.voices[base + j].lanes[l][u];
                states[(base / 4 * 2 + l) * UNISON + u] = Packed {
                    valid: true,
                    phase: core::array::from_fn(|k| {
                        V::a(core::array::from_fn(|j| lane(j).phase[k]))
                    }),
                    g: V::a(core::array::from_fn(|j| lane(j).g)),
                    sync_tail: V::a(core::array::from_fn(|j| lane(j).sync_tail)),
                    previous_width: V::a(core::array::from_fn(|j| lane(j).previous_width)),
                    hp1: V::a(core::array::from_fn(|j| lane(j).hp.ic1)),
                    hp2: V::a(core::array::from_fn(|j| lane(j).hp.ic2)),
                    lp1: V::a(core::array::from_fn(|j| lane(j).lp.ic1)),
                    lp2: V::a(core::array::from_fn(|j| lane(j).lp.ic2)),
                    lq1: V::a(core::array::from_fn(|j| lane(j).lp2.ic1)),
                    lq2: V::a(core::array::from_fn(|j| lane(j).lp2.ic2)),
                    ladder: core::array::from_fn(|k| {
                        V::a(core::array::from_fn(|j| lane(j).ladder[k]))
                    }),
                };
            }
        }
    }
    states
}
pub(super) fn unpack(e: &mut Engine, state: &[Packed; VOICES / 4 * 2 * UNISON]) {
    for (key, v) in state.iter().enumerate() {
        if !v.valid {
            continue;
        }
        let u = key % UNISON;
        let l = key / UNISON % 2;
        let base = key / UNISON / 2 * 4;
        let a = v.hp1.array();
        let b = v.hp2.array();
        let c = v.lp1.array();
        let d = v.lp2.array();
        let f = v.lq1.array();
        let g = v.lq2.array();
        let z = v.ladder.map(|x| x.array());
        let phases = v.phase.map(|x| x.array());
        let gstate = v.g.array();
        let sync = v.sync_tail.array();
        let widths = v.previous_width.array();
        for j in 0..4 {
            let lane = &mut e.voices[base + j].lanes[l][u];
            lane.phase = core::array::from_fn(|k| phases[k][j]);
            lane.g = gstate[j];
            lane.sync_tail = sync[j];
            lane.previous_width = widths[j];
            lane.hp = Filter {
                ic1: a[j],
                ic2: b[j],
            };
            lane.lp = Filter {
                ic1: c[j],
                ic2: d[j],
            };
            lane.lp2 = Filter {
                ic1: f[j],
                ic2: g[j],
            };
            lane.ladder = core::array::from_fn(|k| z[k][j]);
        }
    }
}

#[inline(always)]
fn blep4(t: V, dt: V) -> V {
    let x = t / dt;
    let a = x + x - x * x - V::s(1.);
    let x = (t - V::s(1.)) / dt;
    let b = x * x + x + x + V::s(1.);
    t.lt(dt)
        .choose(a, (V::s(1.) - dt).lt(t).choose(b, V::s(0.)))
}
#[inline(always)]
fn wave4(kind: u32, t: V, dt: V, pw: V, sine: &[f32; LUT + 1]) -> V {
    match kind {
        1 => {
            let x = t * V::s(LUT as f32);
            let xs = x.array();
            let index = xs.map(|x| x as usize);
            let a = V::a(index.map(|i| sine[i]));
            let b = V::a(index.map(|i| sine[i + 1]));
            a + (b - a) * (x - V::a(index.map(|i| i as f32)))
        }
        2 => V::s(1.) - V::s(4.) * (t - V::s(0.5)).abs(),
        3 => V::s(2.) * t - V::s(1.) - blep4(t, dt),
        4 => {
            let q = t - pw + V::s(1.);
            t.lt(pw).choose(V::s(1.), V::s(-1.)) + blep4(t, dt) - blep4(q - q.trunc(), dt)
        }
        _ => V::s(0.),
    }
}

impl Engine {
    pub(super) fn simd_eligible(&self) -> bool {
        let layers = if self.global[0] == 2. { 2 } else { 1 };
        let live = self.voices.iter().filter(|v| v.active).count();
        let budget = live * layers * self.global[2] as usize;
        let eligible = (budget >= 32 || live >= 8 && (0..layers).any(|l| self.p[l][58] >= 0.5))
            && (0..layers).all(|l| {
                let p = &self.p[l];
                p[0] <= 4.
                    && p[1] <= 4.
                    && (p[48] < 0.5 || self.global[0] == 3.)
                    && p[49] == 0.
                    && !(p[0] == 4.
                        && (p[33] > 0.
                            || p[28] > 0.
                            || p[40] != 0.
                            || (0..4).any(|k| p[74 + k * 3 + 1] == 3. && p[74 + k * 3 + 2] != 0.)))
            });
        eligible
    }
    pub(super) fn render_simd(&mut self, n: usize) {
        let n = n.min(BLOCK);
        let mode = self.global[0] as u32;
        let layers = if mode == 2 { 2 } else { 1 };
        let unison = self.global[2] as usize;
        let routes: [bool; 2] = std::array::from_fn(|l| {
            (0..4).any(|slot| {
                let at = 74 + slot * 3;
                self.p[l][at] > 0. && self.p[l][at + 1] > 0. && self.p[l][at + 2] != 0.
            })
        });
        let motion_enabled: [bool; 2] = std::array::from_fn(|l| {
            self.p[l][73] > 0.
                || (0..4).any(|slot| {
                    let at = 74 + slot * 3;
                    self.p[l][at] == 10. && self.p[l][at + 1] > 0. && self.p[l][at + 2] != 0.
                })
        });
        let mut packed_filters = simd_voices::pack(self);
        let dc_r = (-2. * PI * 15. / self.sr).exp();
        self.peak = 0.;
        for sample in 0..n {
            while self.head < self.len && self.queue[self.head].frame <= self.frame {
                let e = self.queue[self.head];
                self.head += 1;
                simd_voices::unpack(self, &packed_filters);
                self.event(e);
                packed_filters = simd_voices::pack(self);
            }
            self.bend += (self.global[5] - self.bend) * 0.002;
            let control = self.frame % 16 == 0;
            let mut lfos = [[0.; 2]; 2];
            for l in 0..layers {
                for k in 0..2 {
                    let rate = self.p[l][if k == 0 { 25 } else { 35 }];
                    let phase = self.lfo_phase[l][k];
                    let shape = if k == 0 { self.p[l][44] as u32 } else { 0 };
                    lfos[l][k] = match shape {
                        1 => 1. - 4. * (phase - 0.5).abs(),
                        2 => {
                            if phase < 0.5 {
                                1.
                            } else {
                                -1.
                            }
                        }
                        3 => 2. * phase - 1.,
                        4 => self.lfo_hold[l][k],
                        _ => wave(1, phase, 0.01, 0.5, &self.sine),
                    };
                    let next = phase + rate / self.sr;
                    if next >= 1. {
                        self.lfo_hold[l][k] = random(&mut self.rng);
                    }
                    self.lfo_phase[l][k] = next.fract();
                }
            }
            let out = self.simd_voices(
                mode,
                layers,
                unison,
                lfos,
                control,
                routes,
                motion_enabled,
                &mut packed_filters,
            );
            let (mixed, _) = self.chorus.tick(
                out,
                self.global[8],
                self.global[9],
                self.global[10],
                self.sr,
                &self.sine,
                self.modern_chorus,
            );
            let mut clean = [0.; 2];
            for ch in 0..2 {
                let x = mixed[ch] * self.global[4];
                let dc = x - self.dc_in[ch] + dc_r * self.dc_out[ch];
                self.dc_in[ch] = x;
                self.dc_out[ch] = dc;
                clean[ch] = dc * 0.98;
            }
            let protected = self.headroom.tick(clean);
            for ch in 0..2 {
                let y = protected[ch];
                self.peak = self.peak.max(y.abs());
                unsafe {
                    if ch == 0 {
                        LEFT[sample] = y;
                    } else {
                        RIGHT[sample] = y;
                    }
                }
            }
            self.frame += 1;
        }
        simd_voices::unpack(self, &packed_filters);
        if self.head == self.len {
            self.head = 0;
            self.len = 0;
        }
        self.blocks += 1;
    }
}
