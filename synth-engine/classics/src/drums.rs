//! Analog-style drum machines on one engine: a sixteen-track kit (TR-808, TR-909 and TR-606
//! voice sets) and the shared step sequencer. The voices follow the circuits: bridged-T
//! resonators struck by a pulse (kick, toms, congas, rim), noise through filters (snare,
//! clap, maracas), two squares through a band-pass (cowbell) and a six-oscillator metal
//! source through high-pass and band-pass filters (hats, cymbals) shared by the hat voices.
//! The 909's recorded metal voices are approximated by filtered noise and inharmonic
//! oscillators, with separate crash and ride envelopes. No recordings are played back.
use crate::dsp::*;
use crate::seq::{Seq, MAX_PATTERNS, MAX_STEPS};
use core::f32::consts::TAU;

pub const TRACKS: usize = 16;
const STRIDE: usize = 8;
const G: usize = TRACKS * STRIDE;
pub const PARAMS: usize = G + 8;
/// Track fields.
const LEVEL: usize = 0;
const TUNE: usize = 1;
const DECAY: usize = 2;
const TONE: usize = 3;
const PAN: usize = 4;
/// Global fields.
const MASTER: usize = G;
const ACCENT: usize = G + 1;
const TEMPO: usize = G + 2;
const SWING: usize = G + 3;
const FLAM: usize = G + 4;
const KICK_BODY: usize = G + 5;
/// Steps fire this long before they sound, so a flam's grace note can come before the beat.
const LOOKAHEAD: f32 = 0.05;
const PENDING: usize = 48;

#[derive(Clone, Copy)]
struct Pending {
    on: bool,
    wait: u32,
    track: u8,
    velocity: f32,
    accent: f32,
}

pub const STYLE_808: u8 = 0;
pub const STYLE_909: u8 = 1;
pub const STYLE_606: u8 = 2;

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Kick,
    Snare,
    Tom,
    Conga,
    Rim,
    Clap,
    Cowbell,
    ClosedHat,
    OpenHat,
    Cymbal,
    Ride,
    Maracas,
    Claves,
}

#[derive(Clone, Copy)]
struct Spec {
    kind: Kind,
    /// Base frequency in Hz (the bank scale for hats and cymbals).
    f: f32,
    /// Base decay time constant in seconds.
    decay: f32,
    level: f32,
    pan: f32,
}
const fn spec(kind: Kind, f: f32, decay: f32, level: f32, pan: f32) -> Spec {
    Spec { kind, f, decay, level, pan }
}
const NONE: Spec = spec(Kind::Claves, 0., 0., 0., 0.);

const fn kit_808() -> [Spec; TRACKS] {
    [
        // Envelope time constants, not total audible decay. Calibrated against
        // the dry Roland50 comparison targets; the old values sustained far too long.
        spec(Kind::Kick, 52., 0.24, 0.75, 0.),
        spec(Kind::Snare, 172., 0.030, 0.48, 0.),
        spec(Kind::Tom, 89., 0.083, 0.74, 0.),
        spec(Kind::Tom, 136., 0.048, 0.80, 0.),
        spec(Kind::Tom, 188., 0.038, 0.91, 0.),
        spec(Kind::Conga, 232., 0.11, 0.9, -0.4),
        spec(Kind::Conga, 326., 0.10, 0.9, -0.1),
        spec(Kind::Conga, 456., 0.09, 0.9, 0.2),
        spec(Kind::Rim, 1670., 0.003, 1.20, 0.),
        spec(Kind::Claves, 2400., 0.020, 0.9, 0.3),
        spec(Kind::Clap, 1250., 0.027, 0.92, 0.),
        spec(Kind::Maracas, 5000., 0.022, 0.7, 0.4),
        spec(Kind::Cowbell, 556., 0.058, 0.96, 0.),
        spec(Kind::Cymbal, 1., 0.285, 1.04, 0.),
        spec(Kind::OpenHat, 1., 0.32, 0.88, 0.),
        spec(Kind::ClosedHat, 1., 0.019, 0.74, 0.),
    ]
}
const fn kit_909() -> [Spec; TRACKS] {
    let mut k = [NONE; TRACKS];
    k[0] = spec(Kind::Kick, 52., 0.058, 0.75, 0.);
    k[1] = spec(Kind::Snare, 172., 0.045, 0.98, 0.);
    k[2] = spec(Kind::Tom, 89., 0.111, 0.91, 0.);
    k[3] = spec(Kind::Tom, 117., 0.072, 0.97, 0.);
    k[4] = spec(Kind::Tom, 154., 0.075, 0.96, 0.);
    k[5] = spec(Kind::Rim, 470., 0.009, 1.90, 0.);
    k[6] = spec(Kind::Clap, 1450., 0.032, 1.10, 0.);
    k[7] = spec(Kind::ClosedHat, 1., 0.036, 0.096, 0.);
    k[8] = spec(Kind::OpenHat, 1., 0.087, 0.088, 0.);
    k[9] = spec(Kind::Cymbal, 1., 0.34, 0.119, 0.);
    k[10] = spec(Kind::Ride, 1., 0.277, 0.062, 0.);
    k
}
const fn kit_606() -> [Spec; TRACKS] {
    let mut k = [NONE; TRACKS];
    k[0] = spec(Kind::Kick, 56., 0.030, 0.75, 0.);
    k[1] = spec(Kind::Snare, 202., 0.027, 0.90, 0.);
    k[2] = spec(Kind::Tom, 129., 0.048, 0.72, 0.);
    k[3] = spec(Kind::Tom, 205., 0.031, 0.97, 0.);
    k[4] = spec(Kind::ClosedHat, 1., 0.019, 1.67, 0.);
    k[5] = spec(Kind::OpenHat, 1., 0.51, 1.40, 0.);
    k[6] = spec(Kind::Cymbal, 1., 0.135, 1.05, 0.);
    k
}
static KIT_808: [Spec; TRACKS] = kit_808();
static KIT_909: [Spec; TRACKS] = kit_909();
static KIT_606: [Spec; TRACKS] = kit_606();

pub fn track_count(style: u8) -> usize {
    match style {
        STYLE_909 => 11,
        STYLE_606 => 7,
        _ => 16,
    }
}

/// Linear TPT filter with coefficients prepared on the hit. Keeping these in Hz
/// avoids the old snare's sample-rate-dependent one-pole coefficients.
#[derive(Clone, Copy)]
struct DrumFilter { a1: f32, a2: f32, a3: f32, k: f32, s1: f32, s2: f32 }
impl DrumFilter {
    const ZERO: Self = Self { a1: 1., a2: 0., a3: 0., k: 1., s1: 0., s2: 0. };
    fn set(&mut self, hz: f32, q: f32, sr: f32) {
        let g = warp(hz, sr);
        self.k = 1. / q;
        self.a1 = 1. / (1. + g * (g + self.k));
        self.a2 = g * self.a1;
        self.a3 = g * self.a2;
        self.s1 = 0.; self.s2 = 0.;
    }
    #[inline]
    fn tick(&mut self, x: f32) -> (f32, f32, f32) {
        let v3 = x - self.s2;
        let band = self.a1 * self.s1 + self.a2 * v3;
        let low = self.s2 + self.a2 * self.s1 + self.a3 * v3;
        self.s1 = 2. * band - self.s1;
        self.s2 = 2. * low - self.s2;
        (low, band * self.k, x - self.k * band - low)
    }
}

#[derive(Clone, Copy)]
struct Voice {
    spec: Spec,
    style: u8,
    active: bool,
    t: f32,
    f: f32,
    tau: f32,
    tone: f32,
    gain: f32,
    noise_scale: f32,
    ph: [f32; 8],
    filters: [DrumFilter; 3],
    e1: f32,
    e2: f32,
    e3: f32,
    k1: f32,
    k2: f32,
    k3: f32,
    lp: [f32; 2],
    rng: Rng,
}
impl Voice {
    const fn new() -> Self {
        Self {
            spec: NONE,
            style: 0,
            active: false,
            t: 0.,
            f: 0.,
            tau: 0.1,
            tone: 0.5,
            gain: 0.,
            noise_scale: 1.,
            ph: [0.; 8],
            filters: [DrumFilter::ZERO; 3],
            e1: 0.,
            e2: 0.,
            e3: 0.,
            k1: 0.,
            k2: 0.,
            k3: 0.,
            lp: [0.; 2],
            rng: Rng(0x1234_5678),
        }
    }
    fn hit(&mut self, sr: f32, spec: Spec, style: u8, tune: f32, decay: f32, tone: f32, gain: f32, deep_kick: bool) {
        let k = |tau: f32| (-1. / (tau.max(1e-4) * sr)).exp();
        self.spec = spec;
        self.style = style;
        self.active = true;
        self.t = 0.;
        self.f = spec.f * exp2((tune - 0.5) * 1.0);
        self.tau = spec.decay * exp2((decay - 0.5) * 2.4);
        self.tone = tone;
        self.gain = gain;
        // Fixed-Hz noise filters pass fewer of the discrete noise bins as the
        // sample rate rises. Compensate their density to preserve the kit balance.
        self.noise_scale = (sr / 48000.).sqrt();
        self.ph = [0.; 8];
        self.filters = [DrumFilter::ZERO; 3];
        self.lp = [0.; 2];
        self.e1 = 1.;
        self.e2 = 1.;
        self.e3 = 1.;
        match spec.kind {
            Kind::Kick => {
                self.e2 = match style {
                    STYLE_909 => 3.6,
                    STYLE_606 => if deep_kick { 1.4 } else { 0.45 },
                    // measured 808 kicks sweep only about half a tone averaged over 0.2 s; this one
                    // starts 2.2x high and is down within about 10 ms (about 0.8 semitone on average)
                    _ => 1.2,
                };
                self.k1 = k(self.tau);
                self.k2 = k(match style {
                    STYLE_909 => 0.011,
                    STYLE_606 => if deep_kick { 0.020 } else { 0.010 },
                    _ => 0.008,
                });
                self.k3 = k(0.0012);
            }
            Kind::Snare => {
                let body = match style { STYLE_909 => 0.035, STYLE_606 => 0.024, _ => 0.025 };
                self.k1 = k(body * (self.tau / spec.decay));
                self.k2 = k(self.tau);
                let (hi, lo) = if style == STYLE_909 { (3800., 12500.) } else { (1400., 7500.) };
                self.filters[0].set(hi, 0.707, sr);
                self.filters[1].set(lo, 0.707, sr);
            }
            Kind::Tom => {
                self.e2 = if style == STYLE_909 { 0.45 } else { 0.25 };
                self.k1 = k(self.tau);
                self.k2 = k(if style == STYLE_909 { 0.015 } else { 0.008 });
                self.k3 = k(0.004);
            }
            Kind::Conga => {
                self.k1 = k(self.tau);
                self.k2 = k(0.012);
                self.k3 = k(0.003);
            }
            Kind::Rim => self.k1 = k(self.tau),
            Kind::Clap => {
                self.k1 = k(self.tau);
                self.filters[0].set(self.f * (0.7 + 0.6 * tone), 1.1, sr);
            }
            Kind::Cowbell => {
                self.k1 = k(0.011);
                self.k2 = k(self.tau);
                self.filters[0].set(950. * (0.85 + 0.3 * tone), 1.4, sr);
                self.filters[1].set(2200., 0.707, sr);
            }
            Kind::ClosedHat | Kind::OpenHat => {
                let open = spec.kind == Kind::OpenHat;
                self.k1 = k(if open && style != STYLE_909 { self.tau * 0.9 } else { self.tau });
                self.k2 = k(0.03);
                self.k3 = k(0.006 * self.tau / spec.decay);
                let tune = exp2((tune - 0.5) * 0.5) * (0.8 + 0.4 * tone);
                if style == STYLE_909 {
                    self.filters[0].set(if open { 3700. * tune } else { 4500. * tune }, 0.707, sr);
                    self.filters[1].set(if open { 10000. * tune } else { 11000. * tune }, 0.707, sr);
                    self.filters[2].set(12200. * tune, 0.707, sr);
                } else {
                    let centre = if style == STYLE_606 { 8300. } else if open { 7900. } else { 12500. };
                    self.filters[0].set(centre * tune, if open { 2.8 } else { 1.4 }, sr);
                    let high = if style == STYLE_606 && open { 6200. } else if style == STYLE_808 && !open { 7600. } else { 6800. };
                    self.filters[1].set(high * tune, 0.8, sr);
                    self.filters[2].set(15500. * tune, 0.707, sr);
                }
            }
            Kind::Cymbal | Kind::Ride => {
                self.k1 = k(0.025);
                self.k2 = k(self.tau);
                let tune = exp2((tune - 0.5) * 0.5) * (0.85 + 0.3 * tone);
                if style == STYLE_909 {
                    let high = if spec.kind == Kind::Ride { 2400. } else { 2800. };
                    self.filters[0].set(high * tune, 0.707, sr);
                    self.filters[1].set(10300. * tune, 0.707, sr);
                    self.filters[2].set(12500. * tune, 0.707, sr);
                } else {
                    self.filters[0].set(if style == STYLE_808 { 7900. * tune } else { 7400. * tune }, 1.6, sr);
                    self.filters[1].set(if style == STYLE_808 { 5800. * tune } else { 5200. * tune }, 0.707, sr);
                    self.filters[2].set(11500. * tune, 0.707, sr);
                }
            }
            Kind::Maracas => {
                self.e2 = 0.;
                self.k1 = k(self.tau);
                self.k2 = 1. - k(0.004);
            }
            Kind::Claves => self.k1 = k(self.tau),
        }
    }

    /// A small plate model for the 909 metal voices. These are oscillators with
    /// inharmonic ratios, not a wavetable or a reconstruction of recorded PCM.
    #[inline]
    fn plate(&mut self, sr: f32, ride: bool) -> f32 {
        let frequencies = if ride {
            [1193., 2179., 3187., 3917., 5861., 7319., 7837., 9989.]
        } else {
            [341., 421., 653., 1013., 1613., 2543., 4163., 6451.]
        };
        let mut x = 0.;
        for (i, hz) in frequencies.iter().enumerate() {
            let f = hz * self.f;
            if f < sr * 0.44 {
                self.ph[i] = (self.ph[i] + f / sr).fract();
                let weight = if ride { [0.02, 0.03, 0.06, 0.7, 0.2, 0.9, 0.75, 1.1][i] } else { 0.125 };
                x += sin_turns(self.ph[i]) * weight;
            }
        }
        x
    }

    #[inline]
    fn tick(&mut self, sr: f32, metal: f32) -> f32 {
        let dt = 1. / sr;
        self.t += dt;
        let sp = self.spec;
        let out = match sp.kind {
            Kind::Kick => {
                let sweep = self.e2 - if self.style == STYLE_909 { 0.0 } else { 0.0 };
                self.e2 *= self.k2;
                self.ph[0] = (self.ph[0] + self.f * (1. + sweep * 1.0) * dt).fract();
                let body = sin_turns(self.ph[0]) * self.e1;
                self.e1 *= self.k1;
                // the strike: the same short burst of ringing on every hit (a fixed 1.5 kHz decaying
                // sine from zero phase, so the hit still starts from silence), not random noise
                self.ph[1] = (self.ph[1] + 1500. * dt).fract();
                let click = sin_turns(self.ph[1]) * self.e3 * self.tone * if self.style == STYLE_909 { 0.9 } else { 0.5 };
                self.e3 *= self.k3;
                let drive = match self.style {
                    STYLE_909 => 2.0,
                    STYLE_606 => 1.1,
                    _ => 1.5,
                };
                if self.e1 < 1e-4 {
                    self.active = false;
                }
                soft((body + click) * drive) * 0.95
            }
            Kind::Snare => {
                let (a, b) = (self.f, self.f * 1.83);
                self.ph[0] = (self.ph[0] + a * dt).fract();
                self.ph[1] = (self.ph[1] + b * dt).fract();
                let tonal = (sin_turns(self.ph[0]) * 0.8 + sin_turns(self.ph[1]) * 0.12) * self.e1;
                self.e1 *= self.k1;
                let n = self.rng.next() * self.noise_scale;
                let (_, _, hp) = self.filters[0].tick(n);
                let (lp, _, _) = self.filters[1].tick(hp);
                let noise = lp * self.e2;
                self.e2 *= self.k2;
                if self.e2 < 1e-4 {
                    self.active = false;
                }
                let (tw, nw) = match self.style {
                    STYLE_909 => (0.80, 0.65 + 0.9 * self.tone),
                    STYLE_606 => (0.6, 0.65 + 1.1 * self.tone),
                    _ => (0.95, 0.6 + 1.2 * self.tone),
                };
                (tonal * tw + noise * nw) * 0.9
            }
            Kind::Tom => {
                let sweep = self.e2;
                self.e2 *= self.k2;
                self.ph[0] = (self.ph[0] + self.f * (1. + sweep * 0.9) * dt).fract();
                let body = sin_turns(self.ph[0]) * self.e1;
                self.e1 *= self.k1;
                let n = self.rng.next();
                self.lp[0] += (n - self.lp[0]) * 0.3;
                let click = self.lp[0] * self.e3 * self.tone * 0.5;
                self.e3 *= self.k3;
                if self.e1 < 1e-4 {
                    self.active = false;
                }
                soft((body + click) * 1.3) * 0.9
            }
            Kind::Conga => {
                let sweep = self.e2 * 0.25;
                self.e2 *= self.k2;
                self.ph[0] = (self.ph[0] + self.f * (1. + sweep) * dt).fract();
                let x = sin_turns(self.ph[0]);
                let second = sin_turns(self.ph[0] * 2.) * 0.3 * self.tone;
                let body = (x + second) * self.e1;
                self.e1 *= self.k1;
                let n = self.rng.next();
                self.lp[0] += (n - self.lp[0]) * 0.4;
                let strike = self.lp[0] * self.e3 * 0.4;
                self.e3 *= self.k3;
                if self.e1 < 1e-4 {
                    self.active = false;
                }
                (body + strike) * 0.8
            }
            Kind::Rim => {
                let (ratio, weight) = if self.style == STYLE_909 { (0.46, 0.5) } else { (0.282, 0.95) };
                self.ph[0] = (self.ph[0] + self.f * dt).fract();
                self.ph[1] = (self.ph[1] + self.f * ratio * dt).fract();
                let x = soft((sin_turns(self.ph[0]) * weight + sin_turns(self.ph[1]) * 1.2) * 1.2) * self.e1;
                self.e1 *= self.k1;
                if self.e1 < 1e-4 {
                    self.active = false;
                }
                x * 0.7
            }
            Kind::Clap => {
                let n = self.rng.next() * self.noise_scale;
                let (_, band, _) = self.filters[0].tick(n);
                // three quick bursts, then the room tail
                let t = self.t;
                let env = if t < 0.031 {
                    let local = t % 0.0105;
                    (-local / 0.0035).exp()
                } else {
                    let tail = (-(t - 0.031) / self.tau).exp();
                    self.e1 = tail;
                    tail * 0.9
                };
                if t > 0.031 && self.e1 < 1e-4 {
                    self.active = false;
                }
                band * env * 2.2
            }
            Kind::Cowbell => {
                let (f1, f2) = (self.f, self.f * 1.4815);
                self.ph[0] = (self.ph[0] + f1 * dt).fract();
                self.ph[1] = (self.ph[1] + f2 * dt).fract();
                let sq = pulse(self.ph[0], f1 * dt, 0.5) + pulse(self.ph[1], f2 * dt, 0.5);
                let (_, band, _) = self.filters[0].tick(sq * 0.5);
                let (band, _, _) = self.filters[1].tick(band);
                let env = 0.55 * self.e1 + 0.45 * self.e2;
                self.e1 *= self.k1;
                self.e2 *= self.k2;
                if self.e2 < 1e-4 {
                    self.active = false;
                }
                soft(band * 1.4) * env * 0.8
            }
            Kind::ClosedHat | Kind::OpenHat => {
                let v = if self.style == STYLE_909 {
                    let x = self.rng.next() * self.noise_scale * 0.8;
                    let (_, _, hi) = self.filters[0].tick(x);
                    let (low, _, _) = self.filters[1].tick(hi);
                    let (low, _, _) = self.filters[2].tick(low);
                    low + self.plate(sr, false) * 0.025
                } else {
                    let x = soft(metal * 4.);
                    let (_, band, _) = self.filters[0].tick(x);
                    let (_, _, hi) = self.filters[1].tick(band);
                    let (low, _, _) = self.filters[2].tick(hi);
                    low
                };
                // The analogue open hats hold a slowly decaying body, then close
                // quickly. A single exponential cannot reproduce that articulation.
                if sp.kind == Kind::OpenHat && self.style != STYLE_909 && self.t > self.tau {
                    self.e3 *= self.k3;
                }
                let attack = if self.style == STYLE_606 && sp.kind == Kind::OpenHat { 0.45 + 0.55 * self.e2 } else { 1. };
                self.e2 *= self.k2;
                let env = self.e1 * self.e3 * attack;
                self.e1 *= self.k1;
                if env < 1e-4 {
                    self.active = false;
                }
                v * env * 4.0
            }
            Kind::Cymbal | Kind::Ride => {
                let ride = sp.kind == Kind::Ride;
                let x = if self.style == STYLE_909 {
                    let noise = self.rng.next() * self.noise_scale;
                    if ride {
                        self.plate(sr, true) * 0.4 + noise * (0.15 + 0.3 * self.e1)
                    } else {
                        noise * 0.8 + soft(metal * 4.) * 0.15
                    }
                } else { soft(metal * 4.) };
                let mix = if self.style == STYLE_909 {
                    let (_, _, hi) = self.filters[0].tick(x);
                    let (low, _, _) = self.filters[1].tick(hi);
                    let (low, _, _) = self.filters[2].tick(low);
                    low
                } else {
                    let (_, band, _) = self.filters[0].tick(x);
                    let (_, _, hi) = self.filters[1].tick(band);
                    let (low, _, _) = self.filters[2].tick(hi);
                    low
                };
                let env = 0.25 * self.e1 + 0.75 * self.e2;
                self.e1 *= self.k1;
                self.e2 *= self.k2;
                if self.e2 < 1e-4 {
                    self.active = false;
                }
                mix * env * 3.2
            }
            Kind::Maracas => {
                let n = self.rng.next();
                self.lp[0] += (n - self.lp[0]) * 0.45;
                let hp = n - self.lp[0];
                self.e2 += (1. - self.e2) * self.k2;
                let env = self.e1 * self.e2;
                self.e1 *= self.k1;
                if self.e1 < 1e-4 {
                    self.active = false;
                }
                hp * env * (1.8 + 1.0 * self.tone)
            }
            Kind::Claves => {
                self.ph[0] = (self.ph[0] + self.f * dt).fract();
                let x = (sin_turns(self.ph[0]) + sin_turns(self.ph[0] * 2.) * 0.12) * self.e1;
                self.e1 *= self.k1;
                if self.e1 < 1e-4 {
                    self.active = false;
                }
                soft(x * 1.4) * 0.8
            }
        };
        out * self.gain
    }
}

/// Six square oscillators of the metal source, the frequencies of the 808's hat circuit.
const METAL: [f32; 6] = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];

pub struct Drums {
    sr: f32,
    pub style: u8,
    pub seq: Seq,
    voices: [Voice; TRACKS],
    knobs: [[f32; STRIDE]; TRACKS],
    master: f32,
    accent: f32,
    flam: f32,
    deep_kick: bool,
    pend: [Pending; PENDING],
    npend: usize,
    metal_ph: [f32; 6],
    metal_scale: f32,
    /// Steps: pattern → track (16 = accent row) → step. 0 off, 1 on.
    pat: [[[u8; MAX_STEPS]; TRACKS + 1]; MAX_PATTERNS],
    pub steals: u32,
}

impl Drums {
    pub const fn new() -> Self {
        Self {
            sr: 48000.,
            style: STYLE_808,
            seq: Seq::new(),
            voices: [Voice::new(); TRACKS],
            knobs: [[0.; STRIDE]; TRACKS],
            master: 0.8,
            accent: 0.5,
            flam: 0.5,
            deep_kick: true,
            pend: [Pending { on: false, wait: 0, track: 0, velocity: 0., accent: 0. }; PENDING],
            npend: 0,
            metal_ph: [0.; 6],
            metal_scale: 1.,
            pat: [[[0; MAX_STEPS]; TRACKS + 1]; MAX_PATTERNS],
            steals: 0,
        }
    }
    pub fn init(&mut self, sr: f32, style: u8) {
        self.sr = sr;
        self.style = style;
        self.seq.init(sr);
        self.seq.bpm = 120.;
        self.voices = [Voice::new(); TRACKS];
        for (i, v) in self.voices.iter_mut().enumerate() {
            v.rng = Rng(0x9e37_79b9u32.wrapping_mul(i as u32 + 1) | 1);
        }
        for k in self.knobs.iter_mut() {
            *k = [0.8, 0.5, 0.5, 0.5, 0., 0., 0., 0.];
        }
        self.master = 0.8;
        self.accent = 0.5;
        self.flam = 0.5;
        self.deep_kick = true;
        self.pend = [Pending { on: false, wait: 0, track: 0, velocity: 0., accent: 0. }; PENDING];
        self.npend = 0;
        self.metal_ph = [0.; 6];
        self.metal_scale = match style {
            STYLE_909 => 1.28,
            STYLE_606 => 1.12,
            _ => 1.0,
        };
        self.pat = [[[0; MAX_STEPS]; TRACKS + 1]; MAX_PATTERNS];
        self.steals = 0;
    }
    fn kit(&self) -> &'static [Spec; TRACKS] {
        match self.style {
            STYLE_909 => &KIT_909,
            STYLE_606 => &KIT_606,
            _ => &KIT_808,
        }
    }
    pub fn set(&mut self, i: usize, value: f32) {
        let v = bound(value, -1., 1000.);
        if i < G {
            let (t, f) = (i / STRIDE, i % STRIDE);
            self.knobs[t][f] = match f {
                PAN => v.clamp(-1., 1.),
                _ => v.clamp(0., 1.),
            };
        } else {
            match i {
                MASTER => self.master = v.clamp(0., 1.),
                ACCENT => self.accent = v.clamp(0., 1.),
                TEMPO => self.seq.bpm = v.clamp(30., 300.),
                SWING => self.seq.swing = v.clamp(0.5, 0.75),
                FLAM => self.flam = v.clamp(0., 1.),
                KICK_BODY => self.deep_kick = v >= 0.5,
                _ => {}
            }
        }
    }
    pub fn active(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }
    fn trigger(&mut self, track: usize, velocity: f32, accent: f32) {
        if track >= track_count(self.style) {
            return;
        }
        let mut spec = self.kit()[track];
        if self.deep_kick && spec.kind == Kind::Kick {
            // Preserve the original long, full-level kick for Deep and for saved
            // patches/URLs from before the calibrated Classic recipe was added.
            spec.decay = match self.style {
                STYLE_909 => 0.34,
                STYLE_606 => 0.2,
                _ => 0.42,
            };
            spec.level = 1.0;
            spec.f = match self.style { STYLE_909 => 52., STYLE_606 => 62., _ => 50. };
        }
        let k = self.knobs[track];
        let gain = k[LEVEL] * spec.level * (0.35 + 0.65 * velocity.clamp(0., 1.)) * (1. + 0.9 * self.accent * accent);
        // the closed hat chokes the open hat
        if spec.kind == Kind::ClosedHat {
            for (j, s) in self.kit().iter().enumerate() {
                if s.kind == Kind::OpenHat && j < track_count(self.style) {
                    self.voices[j].active = false;
                }
            }
        }
        if self.voices[track].active {
            self.steals += 1;
        }
        let sr = self.sr;
        let style = self.style;
        self.voices[track].hit(sr, spec, style, k[TUNE], k[DECAY], k[TONE], gain, self.deep_kick);
    }
    /// Piano keys: each key from C2 is a pad, wrapping every two octaves.
    pub fn note_on(&mut self, _key: u32, note: f32, velocity: f32) {
        let t = (note.round() as i32 - 36).rem_euclid(24) as usize;
        self.trigger(t, velocity.max(0.2), 0.);
    }
    pub fn note_off(&mut self, _key: u32) {}
    pub fn poly_pressure(&mut self, _key: u32, _value: f32) {}
    pub fn control(&mut self, _which: u32, _value: f32) {}
    pub fn panic(&mut self) {
        for v in self.voices.iter_mut() {
            v.active = false;
        }
        for p in self.pend.iter_mut() {
            p.on = false;
        }
        self.npend = 0;
        self.seq.stop();
    }
    /// Sequencer commands: 1 sets a step (a = pattern << 10 | track << 5 | step, b = 0 or 1),
    /// 7 clears a pattern; the rest are shared (see [`Seq::command`]).
    pub fn command(&mut self, cmd: u32, a: u32, b: f32) {
        if self.seq.command(cmd, a, b) {
            return;
        }
        match cmd {
            1 => {
                let (p, t, s) = ((a >> 10) as usize, ((a >> 5) & 31) as usize, (a & 31) as usize);
                if p < MAX_PATTERNS && t <= TRACKS && s < MAX_STEPS {
                    self.pat[p][t][s] = (b.round().max(0.) as u8).min(if t == TRACKS { 3 } else { 2 });
                }
            }
            7 => {
                if (a as usize) < MAX_PATTERNS {
                    self.pat[a as usize] = [[0; MAX_STEPS]; TRACKS + 1];
                }
            }
            _ => {}
        }
    }
    fn queue(&mut self, track: usize, wait: u32, velocity: f32, accent: f32) {
        if let Some(slot) = self.pend.iter_mut().find(|p| !p.on) {
            *slot = Pending { on: true, wait, track: track as u8, velocity, accent };
            self.npend += 1;
        }
    }
    fn fire(&mut self) {
        let (p, s) = self.seq.fire();
        let accent = self.pat[p][TRACKS][s] as f32 / 3.;
        let look = (LOOKAHEAD * self.sr) as u32;
        let gap = ((0.010 + 0.035 * self.flam) * self.sr) as u32;
        for t in 0..track_count(self.style) {
            match self.pat[p][t][s] {
                1 => self.queue(t, look, 1., accent),
                // a flam: a quiet grace note just before the beat, then the hit itself
                2 => {
                    self.queue(t, look.saturating_sub(gap), 0.45, 0.);
                    self.queue(t, look, 1., accent);
                }
                _ => {}
            }
        }
    }
    fn mix(&mut self, left: &mut [f32], right: &mut [f32], from: usize, to: usize) {
        let mut any_metal = self.voices.iter().any(|v| v.active && matches!(v.spec.kind, Kind::ClosedHat | Kind::OpenHat | Kind::Cymbal));
        let sr = self.sr;
        let pans: [(f32, f32); TRACKS] = core::array::from_fn(|t| pan(self.knobs[t][PAN] + self.kit()[t].pan));
        for n in from..to {
            if self.npend > 0 {
                for i in 0..PENDING {
                    if self.pend[i].on {
                        if self.pend[i].wait == 0 {
                            let q = self.pend[i];
                            self.pend[i].on = false;
                            self.npend -= 1;
                            self.trigger(q.track as usize, q.velocity, q.accent);
                            any_metal = self.voices.iter().any(|v| v.active && matches!(v.spec.kind, Kind::ClosedHat | Kind::OpenHat | Kind::Cymbal));
                        } else {
                            self.pend[i].wait -= 1;
                        }
                    }
                }
            }
            let mut metal = 0.;
            // The metal bank runs freely, including the gaps between short hats.
            // Pausing it at block boundaries made the next hit's tone depend on
            // the host buffer size once the previous hat had finished decaying.
            for (ph, f) in self.metal_ph.iter_mut().zip(METAL.iter()) {
                let hz = f * self.metal_scale;
                let dt = hz / sr;
                *ph += dt;
                if *ph >= 1. {
                    *ph -= 1.;
                }
                if any_metal {
                    metal += pulse(*ph, dt, 0.5);
                }
            }
            metal *= 1. / 6.;
            let (mut l, mut r) = (0., 0.);
            for (t, v) in self.voices.iter_mut().enumerate() {
                if v.active {
                    let x = v.tick(sr, metal);
                    l += x * pans[t].0;
                    r += x * pans[t].1;
                }
            }
            left[n] = l * self.master;
            right[n] = r * self.master;
        }
    }
    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let n = left.len();
        let mut pos = 0;
        loop {
            let due = self.seq.due();
            let end = due.min(n).max(pos);
            self.mix(left, right, pos, end);
            pos = end;
            if due >= n {
                break;
            }
            self.fire();
        }
        self.seq.end_block(n);
    }
}

#[allow(dead_code)]
const _: f32 = TAU;
