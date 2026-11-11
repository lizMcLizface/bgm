//! Direct numeric translation of ambient/rainModel.js. f32 assignments are
//! intentional original typed-array rounding points, including each +=.
use std::f64::consts::PI;
#[derive(Clone, Copy)]
pub struct Rng(pub u32);
impl Rng {
    pub fn new(seed: u32) -> Self {
        Self(if seed == 0 { 1 } else { seed })
    }
    pub fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0 as f64 / 4294967296.
    }
    pub fn interval(&mut self) -> f64 {
        -self.next().max(1e-9).ln()
    }
}
#[derive(Clone, Copy, Default)]
pub struct Low {
    rate: f64,
    a: f64,
    pub y: f64,
}
impl Low {
    pub fn new(rate: f64, hz: f64) -> Self {
        let mut s = Self {
            rate,
            ..Self::default()
        };
        s.set(hz);
        s
    }
    pub fn set(&mut self, hz: f64) {
        self.a = 1. - (-2. * PI * hz / self.rate).exp();
    }
    pub fn tick(&mut self, x: f64) -> f64 {
        self.y += self.a * (x - self.y);
        self.y
    }
}
#[derive(Clone, Copy, Default)]
pub struct Band {
    rate: f64,
    b: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}
impl Band {
    fn new(rate: f64, hz: f64, q: f64) -> Self {
        let mut s = Self {
            rate,
            ..Self::default()
        };
        s.set(hz, q);
        s
    }
    fn set(&mut self, hz: f64, q: f64) {
        let w = 2. * PI * hz.min(self.rate * 0.43) / self.rate;
        let alpha = w.sin() / (2. * q);
        let a0 = 1. + alpha;
        self.b = alpha / a0;
        self.a1 = -2. * w.cos() / a0;
        self.a2 = (1. - alpha) / a0;
    }
    fn clear(&mut self) {
        self.x1 = 0.;
        self.x2 = 0.;
        self.y1 = 0.;
        self.y2 = 0.;
    }
    fn tick(&mut self, x: f64) -> f64 {
        let y = self.b * (x - self.x2) - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}
#[derive(Clone, Copy, Default)]
pub struct Pink {
    a: f64,
    b: f64,
    c: f64,
}
impl Pink {
    pub fn tick(&mut self, w: f64) -> f64 {
        self.a = 0.99765 * self.a + 0.099046 * w;
        self.b = 0.963 * self.b + 0.2965164 * w;
        self.c = 0.57 * self.c + 1.0526913 * w;
        (self.a + self.b + self.c + 0.1848 * w) * 0.13
    }
}
#[derive(Clone, Copy)]
struct Scale {
    period: f64,
    t: f64,
    a: f64,
    b: f64,
}
struct Weather {
    rng: Rng,
    scales: [Scale; 3],
}
impl Weather {
    fn new(mut rng: Rng) -> Self {
        let scales = [0.43, 2.7, 13.].map(|period| Scale {
            period,
            t: 0.,
            a: rng.next() * 2. - 1.,
            b: rng.next() * 2. - 1.,
        });
        Self { rng, scales }
    }
    fn tick(&mut self, dt: f64) -> f64 {
        let (mut sum, mut weight, mut norm) = (0., 1., 0.);
        for s in &mut self.scales {
            s.t += dt / s.period;
            while s.t >= 1. {
                s.t -= 1.;
                s.a = s.b;
                s.b = self.rng.next() * 2. - 1.;
            }
            let u = s.t * s.t * (3. - 2. * s.t);
            sum += (s.a + (s.b - s.a) * u) * weight;
            norm += weight;
            weight *= 1.7;
        }
        sum / norm
    }
}
struct Cloud {
    rng: Rng,
    splash: bool,
    hazard: f64,
    fast: f64,
    tail: f64,
    attack: f64,
    fast_decay: f64,
    tail_decay: f64,
    rise: f64,
    tail_mix: f64,
}
impl Cloud {
    fn new(rate: f64, mut rng: Rng, splash: bool) -> Self {
        Self {
            hazard: rng.interval(),
            rng,
            splash,
            fast: 0.,
            tail: 0.,
            attack: 0.,
            fast_decay: (-1. / (rate * if splash { 0.0014 } else { 0.014 })).exp(),
            tail_decay: (-1. / (rate * if splash { 0.009 } else { 0.036 })).exp(),
            rise: 1. - (-1. / (rate * if splash { 0.00012 } else { 0.0045 })).exp(),
            tail_mix: if splash { 0.25 } else { 0.45 },
        }
    }
    fn tick(&mut self, rate: f64) -> f64 {
        self.hazard -= rate;
        while self.hazard <= 0. {
            let d = self.rng.next();
            let a = if self.splash {
                0.25 + 3. * d.powi(3)
            } else {
                0.45 + 1.05 * d.powf(1.7)
            };
            self.fast += a * a;
            self.tail += a * a * self.tail_mix;
            self.hazard += self.rng.interval();
        }
        self.fast *= self.fast_decay;
        self.tail *= self.tail_decay;
        self.attack += self.rise * (self.fast + self.tail - self.attack);
        self.attack.sqrt()
    }
}
struct Channel {
    pink: Pink,
    body: Band,
    impact_body: Band,
    body_damp: [Low; 2],
    mist: Band,
    mist_motion: Low,
    mist_soft: Low,
    sheet: Band,
    air: Low,
    sizzle: Band,
    fry_depth: Band,
    fry_tail: Low,
    near_damp: [Low; 2],
    body_cloud: Cloud,
    splash_cloud: Cloud,
}
impl Channel {
    fn new(rate: f64, seed: u32, c: u32) -> Self {
        Self {
            pink: Pink::default(),
            body: Band::new(rate, 310., 0.55),
            impact_body: Band::new(rate, 300., 0.5),
            body_damp: [Low::new(rate, 750.); 2],
            mist: Band::new(rate, 1200., 0.85),
            mist_motion: Low::new(rate, 5.),
            mist_soft: Low::new(rate, 3400.),
            sheet: Band::new(rate, 3500., 1.1),
            air: Low::new(rate, 5300f64.min(rate * 0.32)),
            sizzle: Band::new(rate, 8500., 0.6),
            fry_depth: Band::new(rate, 2400., 0.6),
            fry_tail: Low::new(rate, 22.),
            near_damp: [Low::new(rate, 2300.); 2],
            body_cloud: Cloud::new(
                rate,
                Rng::new((seed ^ 0x37913).wrapping_add(c * 8731)),
                false,
            ),
            splash_cloud: Cloud::new(
                rate,
                Rng::new((seed ^ 0x71237).wrapping_add(c * 4517)),
                true,
            ),
        }
    }
}
#[derive(Clone, Copy, Default)]
struct Fragment {
    at: u32,
    amp: f64,
}
#[derive(Clone, Copy, Default)]
struct Voice {
    remaining: u32,
    colour: Band,
    body: Band,
    air: Low,
    fragments: [Fragment; 3],
    left: f64,
    right: f64,
    amp: f64,
    near_amp: f64,
    age: u32,
    material: u32,
    brightness: f64,
    attack: f64,
    near_attack: f64,
    distant_attack: f64,
    envelope: f64,
    body_envelope: f64,
    splash_envelope: f64,
    near_splash: f64,
    near_splash_rise: f64,
    decay: f64,
    body_decay: f64,
    splash_decay: f64,
    hz: f64,
}
impl Voice {
    fn new(rate: f64) -> Self {
        Self {
            colour: Band::new(rate, 2200., 0.7),
            body: Band::new(rate, 400., 0.6),
            air: Low::new(rate, 4200f64.min(rate * 0.3)),
            ..Self::default()
        }
    }
}
// leaves, concrete, glass, tin, puddle: original immutable material table.
const MATERIALS: [[f64; 5]; 5] = [
    [3200., 0.65, 470., 0.85, 0.8],
    [1400., 0.55, 260., 0.55, 0.6],
    [2900., 1.1, 620., 1.1, 0.7],
    [2100., 1.5, 430., 1.05, 0.9],
    [1600., 0.7, 320., 0.7, 1.2],
];
pub struct Rain {
    rate: f64,
    rng: Rng,
    event_rng: Rng,
    impact_rng: Rng,
    cluster_rng: Rng,
    weather: Weather,
    channels: [Channel; 2],
    brown: f64,
    dc: Low,
    rumble: Low,
    voices: [Voice; 96],
    hazard: f64,
    countdown: i32,
    pub events: u64,
    pub stolen: u64,
    cluster_hazard: f64,
    cluster: f64,
    smooth: f64,
    intensity: f64,
    wind: f64,
    correlation: f64,
    texture: f64,
    pub rate_now: f64,
    pub heave: f64,
    body_rate: f64,
    splash_rate: f64,
    body_level: f64,
    mist_level: f64,
    sheet_level: f64,
    hiss_level: f64,
    body_impact_level: f64,
    splash_impact_level: f64,
}
impl Rain {
    pub fn new(rate: f64, e: &[f64; 13], seed: u32) -> Self {
        let mut er = Rng::new(seed ^ 0x5327ab);
        let mut cr = Rng::new(seed ^ 0x81435);
        let hazard = er.interval();
        let cluster_hazard = cr.interval();
        Self {
            rate,
            rng: Rng::new(seed),
            event_rng: er,
            impact_rng: Rng::new(seed ^ 0x27183),
            cluster_rng: cr,
            weather: Weather::new(Rng::new(seed ^ 0x13579)),
            channels: [Channel::new(rate, seed, 0), Channel::new(rate, seed, 1)],
            brown: 0.,
            dc: Low::new(rate, 18.),
            rumble: Low::new(rate, 65.),
            voices: [Voice::new(rate); 96],
            hazard,
            countdown: 0,
            events: 0,
            stolen: 0,
            cluster_hazard,
            cluster: 0.,
            smooth: 1. - (-1. / (0.035 * rate)).exp(),
            intensity: e[0],
            wind: e[1],
            correlation: e[3],
            texture: e[4],
            rate_now: 0.,
            heave: 1.,
            body_rate: 0.,
            splash_rate: 0.,
            body_level: 0.,
            mist_level: 0.,
            sheet_level: 0.,
            hiss_level: 0.,
            body_impact_level: 0.,
            splash_impact_level: 0.,
        }
    }
    fn control(&mut self) {
        let gust = self.weather.tick(64. / self.rate);
        let depth = self.correlation * (0.22 + 0.78 * self.wind);
        self.heave = (depth * gust * 0.85).exp();
        self.rate_now =
            self.intensity * (7. + 140. * self.intensity.powf(1.5)) * (depth * gust * 2.6).exp();
        self.rumble.set(60. + 30. * self.wind * gust);
        let dt = 64. / self.rate;
        self.cluster *= (-dt / 0.055).exp();
        self.cluster_hazard -= (5. + 13. * self.intensity) * dt;
        while self.cluster_hazard <= 0. {
            self.cluster += 0.35 + self.cluster_rng.next() * 1.4;
            self.cluster_hazard += self.cluster_rng.interval();
        }
        let patch = 0.55 + self.cluster.min(3.) * 0.85;
        self.body_rate =
            self.intensity * (14. + 175. * self.intensity.powf(0.8)) * self.heave * patch
                / self.rate;
        self.splash_rate =
            self.intensity * (75. + 680. * self.intensity.powf(1.2)) * self.heave * patch
                / self.rate;
        self.body_level = 0.4 * self.intensity.powf(0.8) * self.heave;
        self.mist_level = 0.6 * self.intensity.powf(0.8) * self.heave;
        self.sheet_level = 0.9 * self.intensity.powf(1.1) * self.heave;
        self.hiss_level = 0.55 * self.intensity.powi(2) * self.heave;
        self.body_impact_level = 0.16 * self.intensity.powf(0.45);
        self.splash_impact_level = 0.035 * self.intensity.powf(0.6);
    }
    fn drop(&mut self, surface: u32) {
        let Some(v) = self.voices.iter_mut().find(|v| v.remaining == 0) else {
            self.stolen += 1;
            return;
        };
        let r = &mut self.event_rng;
        let material = if surface == 0 {
            [0, 0, 1, 4, 4][(r.next() * 5.).floor() as usize]
        } else {
            surface - 1
        };
        let spec = MATERIALS[material as usize];
        let size = 0.55 + r.next() * 1.25;
        let pan = (r.next() * 2. - 1.) * 0.85;
        v.left = ((pan + 1.) * PI / 4.).cos();
        v.right = ((pan + 1.) * PI / 4.).sin();
        let strength = r.next();
        let ig = 0.6 + 0.4 * self.intensity;
        v.amp = (0.065 + 0.22 * strength.powi(4)) * ig;
        v.near_amp = (0.085 + 0.065 * strength.powi(2)) * ig;
        v.age = 0;
        v.remaining = (self.rate * 0.14).ceil() as u32;
        v.material = material;
        v.brightness = spec[3];
        v.attack = (self.rate * (0.00015 + r.next() * 0.00065)).max(1.);
        v.near_attack = self.rate * (0.002 + 0.0025 * size);
        v.distant_attack = self.rate * (0.004 + 0.003 * size);
        v.envelope = 1.;
        v.body_envelope = 1.;
        v.splash_envelope = 0.;
        v.near_splash = 0.;
        v.near_splash_rise = 1. - (-1. / (self.rate * 0.0025)).exp();
        v.decay = (-1. / (self.rate * (0.007 + r.next() * 0.007) * size.sqrt())).exp();
        v.body_decay = (-1. / (self.rate * (0.006 + r.next() * 0.008) * size)).exp();
        v.splash_decay = (-1. / (self.rate * 0.004 * size * spec[4])).exp();
        v.hz = (spec[0] / size * (0.8 + r.next() * 0.4)).min(self.rate * 0.4);
        v.colour.set(v.hz, spec[1]);
        v.colour.clear();
        v.body.set(spec[2] / size.sqrt(), 0.55);
        v.body.clear();
        v.air.y = 0.;
        let mut at = 0.001;
        for f in &mut v.fragments {
            at += 0.001 + r.next() * 0.008 * spec[4];
            f.at = (at * self.rate).round() as u32;
            f.amp = 0.25 + r.next() * 0.7;
        }
        self.events += 1;
    }
    pub fn tick(&mut self, e: &[f64; 13], surface: u32, out: &mut [f32; 24]) {
        self.intensity += self.smooth * (e[0] - self.intensity);
        self.wind += self.smooth * (e[1] - self.wind);
        self.correlation += self.smooth * (e[3] - self.correlation);
        self.texture += self.smooth * (e[4] - self.texture);
        let old = self.countdown;
        self.countdown -= 1;
        if old <= 0 {
            self.control();
            self.countdown = 63;
        }
        let w = self.rng.next() * 2. - 1.;
        self.brown = 0.999 * self.brown + 0.014 * w;
        let dc = self.dc.tick(self.brown);
        let bass = self.rumble.tick(self.brown - dc) * 0.75 * self.intensity * self.heave;
        for c in 0..2 {
            let ch = &mut self.channels[c];
            let white = self.rng.next() * 2. - 1.;
            let pink = ch.pink.tick(white);
            out[c] = bass as f32;
            let bg = ch.body_cloud.tick(self.body_rate);
            let sg = ch.splash_cloud.tick(self.splash_rate);
            let bw = ch.body.tick(pink) * self.body_level;
            out[2 + c] = (bw * (1. - 0.82 * self.texture)
                + ch.impact_body.tick(white * bg) * self.body_impact_level * self.texture)
                as f32;
            let mm = ch.mist_motion.tick(bg.min(1.8));
            let mist = ch.mist.tick(pink);
            out[4 + c] = (ch.mist_soft.tick(mist)
                * self.mist_level
                * (1. - 0.13 * self.texture + 0.12 * self.texture * mm))
                as f32;
            out[6 + c] = (ch.sheet.tick(pink)
                * self.sheet_level
                * (1. - 0.5 * self.texture + 0.22 * self.texture * sg))
                as f32;
            let air = pink - ch.air.tick(pink);
            let ft = ch.fry_tail.tick(sg);
            let siz = ch.sizzle.tick(white * sg);
            let fd = ch.fry_depth.tick(white * (0.5 * sg + 0.5 * ft));
            out[8 + c] = (air * self.hiss_level * (1. - 0.9 * self.texture)
                + (0.9 * siz + 0.5 * fd) * self.splash_impact_level * self.texture)
                as f32;
            out[10 + c] = 0.;
        }
        self.hazard -= self.rate_now / self.rate;
        while self.hazard <= 0. {
            self.drop(surface);
            self.hazard += self.event_rng.interval();
        }
        for v in &mut self.voices {
            if v.remaining == 0 {
                continue;
            }
            let noise = self.impact_rng.next() * 2. - 1.;
            let attack = (v.age as f64 / v.attack).min(1.);
            for f in &v.fragments {
                if v.age == f.at {
                    v.splash_envelope += f.amp;
                }
            }
            if v.material == 4 && (v.age & 63) == 0 {
                v.colour.set(
                    v.hz * (1. - 0.18 * (v.age as f64 / (self.rate * 0.02)).min(1.)),
                    0.7,
                );
            }
            let nu = (v.age as f64 / v.near_attack).min(1.);
            let na = nu * nu * (3. - 2. * nu);
            let impact = v.colour.tick(noise) * v.envelope * na;
            let body = v.body.tick(noise) * v.body_envelope * attack;
            let air = noise - v.air.tick(noise);
            let splash = air * v.splash_envelope * v.brightness;
            v.near_splash += v.near_splash_rise * (v.splash_envelope - v.near_splash);
            let soft = air * v.near_splash * v.brightness;
            let x = (impact * 1.25 + body * na * 0.4 + soft * 0.18) * v.near_amp;
            out[10] = (out[10] as f64 + x * v.left) as f32;
            out[11] = (out[11] as f64 + x * v.right) as f32;
            for c in 0..2 {
                let pan = if c == 0 { v.left } else { v.right };
                let u = (v.age as f64 / v.distant_attack).min(1.);
                let ra = u * u * (3. - 2. * u);
                out[2 + c] =
                    (out[2 + c] as f64 + body * ra * v.amp * pan * self.texture * 0.35) as f32;
                out[8 + c] =
                    (out[8 + c] as f64 + splash * v.amp * pan * self.texture * 0.18) as f32;
            }
            v.envelope *= v.decay;
            v.body_envelope *= v.body_decay;
            v.splash_envelope *= v.splash_decay;
            v.age += 1;
            v.remaining -= 1;
        }
        for c in 0..2 {
            let ch = &mut self.channels[c];
            let a = ch.body_damp[0].tick(out[2 + c] as f64);
            out[2 + c] = ch.body_damp[1].tick(a) as f32;
            let a = ch.near_damp[0].tick(out[10 + c] as f64);
            out[10 + c] = ch.near_damp[1].tick(a) as f32;
        }
    }
    pub fn active(&self) -> usize {
        self.voices.iter().filter(|v| v.remaining > 0).count()
    }
}
