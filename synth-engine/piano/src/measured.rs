//! Packed measured tables are immutable. Interpolation, envelopes, noise and
//! preparation buffers belong to this note; playback uses the owned voice engine.
use super::{clamp, Piano, Settings};
use std::f64::consts::TAU;
#[path = "measured_tables.rs"]
mod tables;
struct Table {
    reference: f64,
    s: [f64; 8],
    sn: [f64; 8],
    notes: &'static [MeasuredNote],
}
struct MeasuredNote {
    pitch: f64,
    f1: f64,
    b: f64,
    held: f64,
    partials: &'static [[f64; 11]],
    noise: &'static [[f64; 5]],
}
#[derive(Clone)]
struct Partial {
    n: f64,
    f: f64,
    a: f64,
    t_peak: f64,
    delay: f64,
    rise: f64,
    s1: f64,
    s2: f64,
    tb: Option<f64>,
    beat: f64,
    depth: f64,
    phase: f64,
}
struct Band {
    lo: f64,
    hi: f64,
    rms: f64,
    t_peak: f64,
    tau: f64,
    floor: f64,
    floor_tau: f64,
}
struct Model {
    f1: f64,
    held: f64,
    partials: Vec<Partial>,
    noise: Vec<Band>,
}
const EDGES: [f64; 12] = [
    60., 120., 240., 480., 960., 1500., 2400., 3600., 4800., 6000., 8000., 12000.,
];
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
fn db(a: f64) -> f64 {
    20. * a.max(1e-9).log10()
}
fn linear(a: f64) -> f64 {
    10f64.powf(a / 20.)
}
fn geo(a: f64, b: f64, t: f64) -> f64 {
    lerp(a.max(1e-9).ln(), b.max(1e-9).ln(), t).exp()
}
fn et(m: f64) -> f64 {
    440. * 2f64.powf((m - 69.) / 12.)
}
fn curve(c: &[f64; 8], f: f64) -> f64 {
    let x = (f.max(1.) / 100.).log2();
    if x <= 0. {
        c[0]
    } else if x >= 7. {
        c[7]
    } else {
        let i = x.floor() as usize;
        let t = x - i as f64;
        c[i] * (1. - t) + c[i + 1] * t
    }
}
fn raw(p: &[f64; 11], f: f64) -> Partial {
    Partial {
        n: p[0],
        f,
        a: linear(p[1]),
        t_peak: p[2],
        delay: p[3],
        rise: p[4],
        s1: p[5],
        s2: p[6],
        tb: if p[7] < 0. { None } else { Some(p[7]) },
        beat: p[8],
        depth: p[9],
        phase: p[10],
    }
}
fn model(t: &Table, midi: f64, strength: f64) -> Model {
    let lo = t
        .notes
        .iter()
        .rfind(|n| n.pitch <= midi)
        .unwrap_or(&t.notes[0]);
    let hi = t
        .notes
        .iter()
        .find(|n| n.pitch >= midi)
        .unwrap_or(t.notes.last().unwrap());
    let (lo, hi, u) = if lo.pitch > midi {
        (lo, lo, 0.)
    } else if hi.pitch < midi {
        (hi, hi, 0.)
    } else {
        (
            lo,
            hi,
            if lo.pitch == hi.pitch {
                0.
            } else {
                (midi - lo.pitch) / (hi.pitch - lo.pitch)
            },
        )
    };
    let f1 = et(midi) * lerp(lo.f1 / et(lo.pitch), hi.f1 / et(hi.pitch), u);
    let b = geo(lo.b, hi.b, u);
    let count = lo
        .partials
        .last()
        .map_or(0., |p| p[0])
        .max(hi.partials.last().map_or(0., |p| p[0])) as usize;
    let mut partials = Vec::new();
    let lambda = (t.reference / strength.max(1.)).ln();
    for n in 1..=count {
        let nf = n as f64;
        let f = nf * f1 * (1. + b * nf * nf).sqrt();
        if f > 20000. {
            break;
        }
        let a = lo.partials.iter().find(|p| p[0] == nf);
        let z = hi.partials.iter().find(|p| p[0] == nf);
        let mut p = match (a, z) {
            (Some(a), Some(z)) => {
                let a = raw(a, f);
                let z = raw(z, f);
                let near = if u < 0.5 { &a } else { &z };
                Partial {
                    n: a.n,
                    f,
                    a: linear(lerp(db(a.a), db(z.a), u)),
                    t_peak: lerp(a.t_peak, z.t_peak, u),
                    delay: lerp(a.delay, z.delay, u),
                    rise: geo(a.rise, z.rise, u),
                    s1: lerp(a.s1, z.s1, u),
                    s2: lerp(a.s2, z.s2, u),
                    tb: match (a.tb, z.tb) {
                        (Some(x), Some(y)) => Some(lerp(x, y, u)),
                        _ => near.tb,
                    },
                    beat: near.beat,
                    depth: near.depth,
                    phase: near.phase,
                }
            }
            (Some(a), None) if u < 0.5 => raw(a, f),
            (None, Some(z)) if u >= 0.5 => raw(z, f),
            _ => continue,
        };
        p.a *= linear(-lambda * curve(&t.s, p.f.min(800. * p.n)));
        partials.push(p);
    }
    let noise = lo
        .noise
        .iter()
        .zip(hi.noise)
        .enumerate()
        .map(|(i, (a, b))| {
            let amp = |d: f64| if d < -170. { 0. } else { linear(d) };
            let fa = if a[3] == -1000. { 0. } else { linear(a[3]) };
            let fb = if b[3] == -1000. { 0. } else { linear(b[3]) };
            let gain = linear(-lambda * curve(&t.sn, (EDGES[i] * EDGES[i + 1]).sqrt()));
            Band {
                lo: EDGES[i],
                hi: EDGES[i + 1],
                rms: linear(lerp(db(amp(a[0])), db(amp(b[0])), u)) * gain,
                t_peak: geo(a[1], b[1], u),
                tau: geo(a[2], b[2], u),
                floor: if fa > 0. || fb > 0. {
                    linear(lerp(db(fa), db(fb), u)) * gain
                } else {
                    0.
                },
                floor_tau: if a[4] != 0. && b[4] != 0. {
                    geo(a[4], b[4], u)
                } else {
                    if a[4] != 0. {
                        a[4]
                    } else {
                        b[4]
                    }
                },
            }
        })
        .collect();
    Model {
        f1,
        held: lo.held.max(hi.held),
        partials,
        noise,
    }
}
fn envelope(p: &Partial, t: f64) -> f64 {
    let swell = if t <= p.delay {
        0.
    } else {
        (1. - (-(t - p.delay) / p.rise).exp()).powf(3.)
    };
    let mut slope = p.s1 * (t - p.t_peak).max(0.);
    if let Some(tb) = p.tb {
        if p.s2 != p.s1 {
            slope += (p.s2 - p.s1) * (t - tb).max(0.);
        }
    }
    let mut level = p.a * swell * linear(slope);
    if p.depth > 0. {
        level *= 1. + p.depth * (TAU * p.beat * t + p.phase).cos();
    }
    level
}
fn anchor(t: &Table, strength: f64) -> f64 {
    let m = model(t, 60., strength);
    let limit = 700f64.max(2.5 * m.f1);
    let mut power = 0.;
    for p in &m.partials {
        if p.f < limit {
            power += envelope(p, 0.4).powf(2.) / 2.;
        }
    }
    let rms = power.sqrt();
    if rms > 0. {
        0.08 / rms
    } else {
        1.
    }
}
struct Random(u32);
impl Random {
    fn new(s: u32) -> Self {
        Self(if s == 0 { 1 } else { s })
    }
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0 as f64 / 2147483648. - 1.
    }
}
#[derive(Default)]
struct State {
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}
struct Filter {
    b0: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}
impl Filter {
    fn new(lo: f64, hi: f64, sr: f64) -> Self {
        let centre = (lo * hi).sqrt();
        let w = TAU * centre / sr;
        let q = 0.7f64.max(centre / (hi - lo) * 1.2);
        let alpha = w.sin() / (2. * q);
        let a0 = 1. + alpha;
        Self {
            b0: alpha / a0,
            b2: -alpha / a0,
            a1: -2. * w.cos() / a0,
            a2: (1. - alpha) / a0,
        }
    }
    fn run(&self, s: &mut State, x: f64) -> f64 {
        let y = self.b0 * x + self.b2 * s.x2 - self.a1 * s.y1 - self.a2 * s.y2;
        s.x2 = s.x1;
        s.x1 = x;
        s.y2 = s.y1;
        s.y1 = y;
        y
    }
    fn norm(&self) -> f64 {
        let mut r = Random::new(12345);
        let (mut a, mut b) = (State::default(), State::default());
        let mut sum = 0.;
        for i in 0..16384 {
            let y = self.run(&mut b, self.run(&mut a, r.next() * 3f64.sqrt()));
            if i > 2048 {
                sum += y * y;
            }
        }
        1. / (sum / 14335.).sqrt()
    }
}
pub fn render(sr: f64, freq: f64, code: u32, s: Settings) -> Piano {
    let sr = clamp(sr, 8000., 192000.);
    let f0 = clamp(freq, 15., sr / 6.);
    let midi = 69. + 12. * (f0 / 440.).log2();
    let strength = (clamp(s.velocity, 0., 1.) * 127.).round().clamp(1., 127.);
    let table = &tables::TABLES[(code - 11) as usize];
    let gain = anchor(table, strength);
    let mut m = model(table, midi, strength);
    let move_by = f0 / m.f1;
    let stretch = 2.8 / clamp(s.decay, 0.3, 5.);
    let beating = clamp(s.unison, 0., 1.) / 0.25;
    let high = clamp((midi - 72.) / 24., 0., 1.);
    let over = (midi - 72.).max(0.);
    for p in &mut m.partials {
        p.rise = p.rise.min(0.012);
        p.delay = p.delay.min(0.004);
        if over > 0. {
            p.depth *= 0.5;
            let lim2 = -(25. + 0.6 * over) * (1. + 0.25 * (p.n - 1.));
            let lim1 = if p.tb.is_some_and(|tb| tb < 1.) {
                4. * lim2
            } else {
                lim2
            };
            p.s1 = p.s1.max(lim1);
            p.s2 = p.s2.max(lim2);
        }
        p.f *= move_by;
        p.s1 *= stretch;
        p.s2 *= stretch;
        p.tb = p.tb.map(|v| v / stretch);
        p.depth = (p.depth * beating).min(0.9);
    }
    for b in &mut m.noise {
        let ng = linear(if over > 0. { 3. } else { 0. });
        b.floor *= ng;
        b.rms *= ng;
        b.t_peak = b.t_peak.min(0.006);
        if over > 0. && !(m.f1 >= 1000. && b.hi <= m.f1 * 0.85) {
            b.tau = b.tau.min(0.02 + 0.02 * (1. - high)).max(0.);
        }
    }
    let seconds = (m.held + 1.).min(9.);
    let length = (seconds * sr).ceil() as usize;
    let mut out = vec![0f32; length];
    let hop = (sr * 0.001).round().max(1.) as usize;
    let points = (length as f64 / hop as f64).ceil() as usize + 2;
    for p in &m.partials {
        if p.f >= sr * 0.45 {
            continue;
        }
        let mut until = seconds;
        let mut t = p.t_peak;
        while t < seconds {
            let mut slope = p.s1 * (t - p.t_peak).max(0.);
            if let Some(tb) = p.tb {
                if p.s2 != p.s1 {
                    slope += (p.s2 - p.s1) * (t - tb).max(0.);
                }
            }
            if slope < -85. {
                until = t;
                break;
            }
            t += 0.05;
        }
        let env: Vec<f32> = (0..points)
            .map(|k| {
                let t = k as f64 * hop as f64 / sr;
                if t <= until {
                    (envelope(p, t) * gain) as f32
                } else {
                    0.
                }
            })
            .collect();
        let w = TAU * p.f / sr;
        let (dr, di) = (w.cos(), w.sin());
        let (mut cr, mut ci) = (1., 0.);
        let end = length.min((until * sr).ceil() as usize);
        for (i, x) in out.iter_mut().enumerate().take(end) {
            let k = i / hop;
            let u = i as f64 / hop as f64 - k as f64;
            let a = env[k] as f64 + (env[k + 1] as f64 - env[k] as f64) * u;
            *x = (*x as f64 + a * ci) as f32;
            let nr = cr * dr - ci * di;
            ci = cr * di + ci * dr;
            cr = nr;
            if i & 2047 == 2047 {
                let h = cr.hypot(ci);
                cr /= h;
                ci /= h;
            }
        }
    }
    // JS multiplies in Float64 before ToUint32. A wrapping u32 product would
    // change the noise seed for large seeds due to the original rounding.
    let mut random = Random::new((s.seed as f64 * 2654435761.) as u64 as u32);
    for b in &m.noise {
        if !(b.rms > 0. || b.floor > 0.) || b.lo >= sr * 0.45 {
            continue;
        }
        let filter = Filter::new(b.lo, b.hi.min(sr * 0.45), sr);
        let norm = filter.norm();
        let (mut a, mut z) = (State::default(), State::default());
        let floor_end = if b.floor > 0. {
            seconds.min(b.floor_tau * 7.)
        } else {
            0.
        };
        let end =
            length.min((seconds.min(b.t_peak + b.tau * 7.).max(floor_end) * sr).ceil() as usize);
        for (i, x) in out.iter_mut().enumerate().take(end) {
            let t = i as f64 / sr;
            let y = filter.run(&mut z, filter.run(&mut a, random.next() * 3f64.sqrt()));
            let mut e = if b.rms > 0. {
                (if t < b.t_peak {
                    (t / b.t_peak.max(1e-4)).powf(2.)
                } else {
                    (-(t - b.t_peak) / b.tau).exp()
                }) * b.rms
            } else {
                0.
            };
            if b.floor > 0. {
                e += b.floor * (-t / b.floor_tau).exp() * 1f64.min(t / 0.02);
            }
            *x = (*x as f64 + y * norm * e * gain) as f32;
        }
    }
    let fade = length.min((sr * 0.05).round() as usize);
    for i in 0..fade {
        let j = length - 1 - i;
        out[j] = (out[j] as f64 * (i as f64 / fade as f64)) as f32;
    }
    let peak = out.iter().fold(0f64, |p, x| p.max((*x as f64).abs()));
    if peak > 0.85 {
        for x in &mut out {
            *x = (*x as f64 * (0.85 / peak)) as f32;
        }
    }
    Piano { samples: out }
}
