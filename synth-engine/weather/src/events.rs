//! Original weatherEvents.js: fixed voice arrays and instance-owned f32 delays.
use crate::rain::{Low, Pink, Rng};
use std::f64::consts::PI;
fn rise(x: f64) -> f64 {
    let u = x.max(0.).min(1.);
    u * u * (3. - 2. * u)
}
struct Line {
    buffer: Vec<f32>,
    at: usize,
    low: f64,
}
struct Tail {
    lines: [Line; 4],
    feedback: f64,
    damping: f64,
    left: f64,
    right: f64,
}
impl Tail {
    fn new(rate: f64) -> Self {
        let mut s = Self {
            lines: [0.137, 0.193, 0.271, 0.367].map(|v| Line {
                buffer: vec![0.; (rate * v).round() as usize],
                at: 0,
                low: 0.,
            }),
            feedback: 0.,
            damping: 0.,
            left: 0.,
            right: 0.,
        };
        s.set(rate, 0.65, 0.6);
        s
    }
    fn set(&mut self, rate: f64, decay: f64, distance: f64) {
        self.feedback = 0.5 + 0.3 * decay;
        self.damping = 1. - (-2. * PI * (900. - 650. * distance) / rate).exp();
    }
    fn reset(&mut self) {
        for l in &mut self.lines {
            l.buffer.fill(0.);
            l.at = 0;
            l.low = 0.;
        }
        self.left = 0.;
        self.right = 0.;
    }
    fn tick(&mut self, left: f64, right: f64) {
        for l in &mut self.lines {
            l.low += self.damping * (l.buffer[l.at] as f64 - l.low);
        }
        let [a, b, c, d] = std::array::from_fn::<_, 4, _>(|i| self.lines[i].low);
        let f = self.feedback * 0.5;
        let values = [
            left * 0.22 + (a + b + c + d) * f,
            right * 0.22 + (a - b + c - d) * f,
            left * 0.16 + (a + b - c - d) * f,
            right * 0.16 + (a - b - c + d) * f,
        ];
        for (i, l) in self.lines.iter_mut().enumerate() {
            l.buffer[l.at] = values[i] as f32;
            l.at += 1;
            if l.at >= l.buffer.len() {
                l.at = 0;
            }
        }
        self.left = (a + c) * 0.7;
        self.right = (b + d) * 0.7;
    }
}
#[derive(Clone, Copy, Default)]
struct Front {
    at: f64,
    width: f64,
    amp: f64,
}
#[derive(Clone, Copy, Default)]
struct Part {
    at: f64,
    attack: f64,
    decay: f64,
    amp: f64,
}
#[derive(Clone, Copy, Default)]
struct ThunderVoice {
    remaining: u32,
    age: u32,
    dc: Low,
    low: [Low; 2],
    body: [Low; 2],
    crack: Low,
    fronts: [Front; 5],
    parts: [Part; 6],
    roll: f64,
    roll_target: f64,
    control: i32,
    roll_rise: f64,
    gain: f64,
    crack_gain: f64,
    attack: f64,
    boom_at: f64,
    boom_width: f64,
    left: f64,
    right: f64,
    noise_gain: f64,
}
impl ThunderVoice {
    fn new(rate: f64) -> Self {
        Self {
            dc: Low::new(rate, 14.),
            low: [Low::new(rate, 85.); 2],
            body: [Low::new(rate, 190.); 2],
            crack: Low::new(rate, 1100.),
            ..Self::default()
        }
    }
}
pub struct Thunder {
    rate: f64,
    rng: Rng,
    noise: Rng,
    voices: [ThunderVoice; 4],
    echo: Tail,
    pub echo_level: f64,
    pub events: u64,
    pub skipped: u64,
    next: f64,
    activity: f64,
    last: usize,
}
impl Thunder {
    pub fn new(rate: f64, e: &[f64; 13], seed: u32) -> Self {
        let mut s = Self {
            rate,
            rng: Rng::new(seed),
            noise: Rng::new(seed ^ 0x4165),
            voices: [ThunderVoice::new(rate); 4],
            echo: Tail::new(rate),
            echo_level: 0.,
            events: 0,
            skipped: 0,
            next: f64::INFINITY,
            activity: 0.,
            last: 0,
        };
        s.environment(e);
        s
    }
    pub fn reset(&mut self, e: &[f64; 13], seed: u32) {
        self.rng = Rng::new(seed);
        self.noise = Rng::new(seed ^ 0x4165);
        self.voices.fill(ThunderVoice::new(self.rate));
        self.echo.reset();
        self.echo_level = 0.;
        self.events = 0;
        self.skipped = 0;
        self.next = f64::INFINITY;
        self.activity = 0.;
        self.last = 0;
        self.environment(e);
    }
    pub fn environment(&mut self, e: &[f64; 13]) {
        if !(self.activity > 0.) && e[5] > 0. {
            self.next = self.rate * (1.5 + self.rng.next() * 2.);
        }
        if e[5] == 0. {
            self.next = f64::INFINITY;
        }
        self.activity = e[5];
        self.echo.set(self.rate, e[8], e[6]);
    }
    pub fn trigger(&mut self, e: &[f64; 13]) -> bool {
        let Some(index) = self.voices.iter().position(|v| v.remaining == 0) else {
            self.skipped += 1;
            return false;
        };
        let v = &mut self.voices[index];
        let r = &mut self.rng;
        let distance = (e[6] + (r.next() - 0.5) * 0.14).max(0.).min(1.);
        v.age = 0;
        v.roll = 0.;
        v.roll_target = 0.;
        v.control = 0;
        v.roll_rise = 1. - (-1. / (self.rate * 0.025)).exp();
        v.gain = (0.18 + 0.14 * e[7]) * (0.9 + r.next() * 0.2) / (1. + distance * 0.45);
        v.crack_gain = 0.35 + 0.65 * (1. - distance);
        v.attack = self.rate * (0.035 + 0.07 * distance);
        let mut at = 0.012 + 0.025 * distance;
        for (i, f) in v.fronts.iter_mut().enumerate() {
            f.width = 0.00055 + 0.0021 * distance + r.next() * 0.00065;
            f.at = at.max(f.width * 5.);
            f.amp = if i > 0 {
                (0.16 + 0.2 * r.next()) * if i % 2 == 1 { -1. } else { 1. }
            } else {
                1.
            };
            at += 0.008 + r.next() * (0.014 + 0.018 * distance);
        }
        v.boom_at = 0.09 + 0.12 * distance;
        v.boom_width = 0.018 + 0.018 * distance;
        v.crack.set(650. + 1100. * (1. - distance));
        v.crack.y = 0.;
        let seconds = 0.85 + 1.7 * e[8];
        let pan = (r.next() * 2. - 1.) * 0.65;
        v.left = ((1. - pan) * 0.5).sqrt();
        v.right = ((1. + pan) * 0.5).sqrt();
        let mut at = 0.025 + 0.06 * distance;
        for (i, p) in v.parts.iter_mut().enumerate() {
            if i > 0 {
                at += 0.25 + r.next() * (0.35 + 0.7 * e[8]);
            }
            p.at = at;
            p.amp = if i > 0 { 0.2 + r.next() * 0.45 } else { 1. };
            p.attack = 0.12 + distance * 0.22 + r.next() * 0.2;
            p.decay = seconds * (0.7 + r.next() * 0.45);
        }
        v.remaining = ((at + seconds * 8.) * self.rate).ceil() as u32;
        v.dc.y = 0.;
        for f in v.low.iter_mut().chain(v.body.iter_mut()) {
            f.y = 0.;
        }
        v.noise_gain = (self.rate / 48000.).sqrt();
        self.events += 1;
        self.last = index;
        true
    }
    pub fn tick(&mut self, e: &[f64; 13], out: &mut [f32; 24]) {
        self.next -= 1.;
        if self.next <= 0. {
            self.trigger(e);
            self.next = self.rate
                * (9. + (1. - e[5]) * 18. + self.rng.interval() * (7. + 60. * (1. - e[5])));
        }
        let (mut cl, mut cr, mut rl, mut rr) = (0., 0., 0., 0.);
        for v in &mut self.voices {
            if v.remaining == 0 {
                continue;
            }
            let t = v.age as f64 / self.rate;
            let white = self.noise.next() * 2. - 1.;
            let old = v.control;
            v.control -= 1;
            if old <= 0 {
                v.roll_target = 0.;
                for p in &v.parts {
                    let dt = t - p.at;
                    if dt >= 0. {
                        v.roll_target +=
                            p.amp * (1. - (-dt / p.attack).exp()).powi(2) * (-dt / p.decay).exp();
                    }
                }
                v.control = 31;
            }
            v.roll += v.roll_rise * (v.roll_target - v.roll);
            let mut front = 0.;
            for f in &v.fronts {
                let u = (t - f.at) / f.width;
                if u.abs() < 5. {
                    front += f.amp * (1. - u * u) * (-0.5 * u * u).exp();
                }
            }
            let bu = (t - v.boom_at) / v.boom_width;
            let boom = if bu.abs() < 5. {
                (1. - bu * bu) * (-0.5 * bu * bu).exp()
            } else {
                0.
            };
            let crack = v.crack.tick(front * 1.3 + boom * 0.7) * v.crack_gain * v.gain;
            let dry = white - v.dc.tick(white);
            let d = v.low[0].tick(dry);
            let deep = v.low[1].tick(d);
            let b = v.body[0].tick(dry);
            let body = v.body[1].tick(b);
            let roll = (deep * 10. + body * 0.9) * v.noise_gain * v.roll * v.gain;
            cl += crack * v.left;
            cr += crack * v.right;
            rl += roll * (0.65 + 0.35 * v.left);
            rr += roll * (0.65 + 0.35 * v.right);
            v.age += 1;
            v.remaining -= 1;
        }
        self.echo.tick(cl + 0.55 * rl, cr + 0.55 * rr);
        out[12] = cl as f32;
        out[13] = cr as f32;
        out[14] = rl as f32;
        out[15] = rr as f32;
        out[16] = self.echo.left as f32;
        out[17] = self.echo.right as f32;
        self.echo_level +=
            0.001 * ((self.echo.left.abs() + self.echo.right.abs()) * 0.5 - self.echo_level);
    }
    pub fn active(&self) -> usize {
        self.voices.iter().filter(|v| v.remaining > 0).count()
    }
}
#[derive(Clone, Copy, Default)]
struct SurfVoice {
    remaining: u32,
    age: u32,
    pink: Pink,
    left_pink: Pink,
    right_pink: Pink,
    low: Low,
    dc: Low,
    left_water: Low,
    right_water: Low,
    motion: Low,
    size: f64,
    level: f64,
    build: f64,
    foam_time: f64,
    left: f64,
    right: f64,
    wash_start: f64,
    handoff: f64,
    motion_gain: f64,
}
impl SurfVoice {
    fn new(rate: f64) -> Self {
        Self {
            low: Low::new(rate, 180.),
            dc: Low::new(rate, 45.),
            left_water: Low::new(rate, 2600.),
            right_water: Low::new(rate, 2600.),
            motion: Low::new(rate, 3.),
            ..Self::default()
        }
    }
}
pub struct Surf {
    rate: f64,
    rng: Rng,
    noise: Rng,
    voices: [SurfVoice; 8],
    pub events: u64,
    pub skipped: u64,
    next: f64,
    level: f64,
    last: usize,
}
impl Surf {
    pub fn new(rate: f64, e: &[f64; 13], seed: u32) -> Self {
        let mut s = Self {
            rate,
            rng: Rng::new(seed),
            noise: Rng::new(seed ^ 0x93672),
            voices: [SurfVoice::new(rate); 8],
            events: 0,
            skipped: 0,
            next: f64::INFINITY,
            level: 0.,
            last: 0,
        };
        s.environment(e);
        s
    }
    pub fn environment(&mut self, e: &[f64; 13]) {
        if !(self.level > 0.) && e[9] > 0. {
            self.next = self.rate * (0.15 + self.rng.next() * 0.5);
        }
        if e[9] == 0. {
            self.next = f64::INFINITY;
        }
        self.level = e[9];
    }
    pub fn trigger(&mut self, e: &[f64; 13], manual: bool) -> bool {
        let Some(index) = self.voices.iter().position(|v| v.remaining == 0) else {
            self.skipped += 1;
            return false;
        };
        let v = &mut self.voices[index];
        let r = &mut self.rng;
        v.age = 0;
        v.size = (0.35 + 0.9 * e[10]) * (0.8 + 0.4 * r.next());
        v.level = (0.18 + 0.16 * v.size) * if manual { e[9].max(0.65) } else { e[9] };
        v.build = 1.5 + 1.6 * v.size;
        v.foam_time = 1.6 + 2.5 * e[12] + 0.7 * v.size;
        let pan = (r.next() * 2. - 1.) * 0.22;
        v.left = ((1. - pan) * 0.5).sqrt();
        v.right = ((1. + pan) * 0.5).sqrt();
        v.wash_start = v.build + 0.8;
        v.handoff = 3. + e[12] * 1.5;
        v.remaining = ((v.build + v.foam_time * 8.) * self.rate).ceil() as u32;
        v.low.y = 0.;
        v.dc.y = 0.;
        v.left_water.y = 0.;
        v.right_water.y = 0.;
        v.motion.y = 0.;
        v.pink = Pink::default();
        v.left_pink = Pink::default();
        v.right_pink = Pink::default();
        v.motion_gain = (self.rate / 48000.).sqrt() * 65.;
        self.events += 1;
        self.last = index;
        true
    }
    pub fn tick(&mut self, e: &[f64; 13], out: &mut [f32; 24]) {
        self.next -= 1.;
        if self.next <= 0. {
            self.trigger(e, false);
            self.next = self.rate * (15. - 10. * e[11]) * (0.78 + 0.44 * self.rng.next());
        }
        let mut values = [0f64; 6];
        for v in &mut self.voices {
            if v.remaining == 0 {
                continue;
            }
            let t = v.age as f64 / self.rate;
            let dt = t - v.build;
            let envelope = rise(t / v.build) * (-dt.max(0.) / v.foam_time).exp();
            let breaking = rise((dt + 0.7) / 1.8);
            let retreat = rise((t - v.wash_start) / v.handoff);
            let approach = 1. - breaking;
            let br = breaking * (1. - retreat);
            let wash = breaking * retreat;
            let common = self.noise.next() * 2. - 1.;
            let left = self.noise.next() * 2. - 1.;
            let right = self.noise.next() * 2. - 1.;
            let pink = v.pink.tick(common);
            let dry = pink - v.dc.tick(pink);
            let deep = v.low.tick(dry);
            let turbulence = 1. + 0.14 * (v.motion.tick(common) * v.motion_gain).tanh();
            let l = v
                .left_water
                .tick(0.65 * dry + 0.35 * v.left_pink.tick(left));
            let rr = v
                .right_water
                .tick(0.65 * dry + 0.35 * v.right_pink.tick(right));
            let gain = envelope * turbulence * v.level;
            let wl = (l * 1.5 + deep * 0.9) * gain * v.left;
            let wr = (rr * 1.5 + deep * 0.9) * gain * v.right;
            values[0] += wl * approach;
            values[1] += wr * approach;
            values[2] += wl * br;
            values[3] += wr * br;
            values[4] += wl * wash;
            values[5] += wr * wash;
            v.age += 1;
            v.remaining -= 1;
        }
        for i in 0..6 {
            out[18 + i] = values[i] as f32;
        }
    }
    pub fn active(&self) -> usize {
        self.voices.iter().filter(|v| v.remaining > 0).count()
    }
}
