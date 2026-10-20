//! Building blocks shared by the classic-synth models. Original code; no third-party DSP.
//! Everything here is allocation-free and cheap enough to run per sample on a tablet.
use core::f32::consts::{FRAC_PI_2, PI, TAU};

/// Largest block the host renders in one call.
pub const MAX_BLOCK: usize = 2048;

#[inline]
pub fn bound(v: f32, lo: f32, hi: f32) -> f32 {
    if v.is_finite() {
        v.clamp(lo, hi)
    } else {
        lo
    }
}

/// Rational soft clipper: unity slope at zero, reaches ±1 at ±3.
#[inline]
pub fn soft(x: f32) -> f32 {
    let x = x.clamp(-3., 3.);
    x * (27. + x * x) / (27. + 9. * x * x)
}

/// 2^x to about 0.03 cents, without a libm call.
#[inline]
pub fn exp2(x: f32) -> f32 {
    let x = x.clamp(-100., 100.);
    let xi = x.floor();
    let f = x - xi;
    let p = 1. + f * (0.693_147_2 + f * (0.240_226_5 + f * (0.055_504_1 + f * (0.009_618_1 + f * (0.001_333_4 + f * 0.000_154)))));
    p * f32::from_bits(((xi as i32 + 127) as u32) << 23)
}

/// log2 for positive finite inputs, accurate to ~1e-4 octave (only used on parameters).
#[inline]
pub fn log2(x: f32) -> f32 {
    x.max(1e-30).log2()
}

#[inline]
pub fn note_hz(note: f32) -> f32 {
    440. * exp2((note - 69.) / 12.)
}

/// sin(2π·t) for any t (in turns); absolute error below 2e-4.
#[inline]
pub fn sin_turns(t: f32) -> f32 {
    let x = t - t.floor() - 0.5;
    let mut y = -x * TAU;
    if y > FRAC_PI_2 {
        y = PI - y;
    } else if y < -FRAC_PI_2 {
        y = -PI - y;
    }
    let y2 = y * y;
    y * (1. + y2 * (-1. / 6. + y2 * (1. / 120. + y2 * (-1. / 5040.))))
}

/// The SVF frequency warp tan(π·hz/sr), clamped to a stable, musical range.
#[inline]
pub fn warp(hz: f32, sr: f32) -> f32 {
    let t = bound(hz, 8., 0.45 * sr) / (2. * sr);
    sin_turns(t) / sin_turns(t + 0.25)
}

/// One-pole smoothing coefficient for a time constant, at a given update rate.
#[inline]
pub fn smoothing(seconds: f32, rate: f32) -> f32 {
    if seconds <= 0. {
        1.
    } else {
        1. - (-1. / (seconds * rate)).exp()
    }
}

#[inline]
pub fn smoothstep(x: f32) -> f32 {
    let x = x.clamp(0., 1.);
    x * x * (3. - 2. * x)
}

/// Equal-power pan gains, normalised so the centre is (1, 1).
#[inline]
pub fn pan(position: f32) -> (f32, f32) {
    // cos via sin(¼ − t) keeps the centre exactly equal on both sides
    let t = (bound(position, -1., 1.) + 1.) * 0.125;
    (sin_turns(0.25 - t) * core::f32::consts::SQRT_2, sin_turns(t) * core::f32::consts::SQRT_2)
}

/// xorshift32 noise in [-1, 1).
#[derive(Clone, Copy)]
pub struct Rng(pub u32);
impl Rng {
    #[inline]
    pub fn next(&mut self) -> f32 {
        let mut s = self.0;
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        self.0 = s;
        (s as i32) as f32 * (1. / 2_147_483_648.)
    }
}

/// PolyBLEP residual for a unit step at phase 0.
#[inline]
pub fn blep(t: f32, dt: f32) -> f32 {
    if t < dt {
        let x = t / dt;
        x + x - x * x - 1.
    } else if t > 1. - dt {
        let x = (t - 1.) / dt;
        x * x + x + x + 1.
    } else {
        0.
    }
}

/// Band-limited sawtooth from a phase in [0, 1).
#[inline]
pub fn saw(t: f32, dt: f32) -> f32 {
    2. * t - 1. - blep(t, dt)
}

/// Band-limited pulse with its DC removed, so width modulation does not thump.
#[inline]
pub fn pulse(t: f32, dt: f32, width: f32) -> f32 {
    let high = t < width;
    let falling = if high { t - width + 1. } else { t - width };
    let naive = if high { 1. } else { -1. };
    naive + blep(t, dt) - blep(falling, dt) - (2. * width - 1.)
}

/// Topology-preserving state-variable filter (12 dB/oct). The band integrator
/// saturates gently, so high resonance sings and self-oscillation stays bounded.
#[derive(Clone, Copy)]
pub struct Svf {
    ic1: f32,
    ic2: f32,
}
impl Svf {
    pub const ZERO: Self = Self { ic1: 0., ic2: 0. };
    /// Returns (low-pass, high-pass). `g` from [`warp`], `k` = 1/Q.
    #[inline]
    pub fn tick(&mut self, v0: f32, g: f32, k: f32) -> (f32, f32) {
        let a1 = 1. / (1. + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;
        let v3 = v0 - self.ic2;
        let v1 = a1 * self.ic1 + a2 * v3;
        let v2 = self.ic2 + a2 * self.ic1 + a3 * v3;
        self.ic1 = 2.5 * soft((2. * v1 - self.ic1) * 0.4);
        self.ic2 = 2. * v2 - self.ic2;
        (v2, v0 - k * v1 - v2)
    }
}

/// Resonance control 0..1 to SVF damping; 1 sits just under self-oscillation.
#[inline]
pub fn damping(resonance: f32) -> f32 {
    let r = bound(resonance, 0., 1.);
    2. - 1.97 * r * (2. - r)
}

/// Analog-style ADSR: the attack charges towards an overshoot and stops at 1,
/// decay and release are exponential. Re-attacks start from the current level.
#[derive(Clone, Copy)]
pub struct Adsr {
    pub value: f32,
    pub stage: u8,
}
pub const IDLE: u8 = 0;
pub const ATTACK: u8 = 1;
pub const DECAY: u8 = 2;
pub const RELEASE: u8 = 3;
impl Adsr {
    pub const ZERO: Self = Self { value: 0., stage: IDLE };
    pub fn attack(&mut self) {
        self.stage = ATTACK;
    }
    pub fn release(&mut self) {
        if self.stage != IDLE {
            self.stage = RELEASE;
        }
    }
    #[inline]
    pub fn tick(&mut self, attack: f32, decay: f32, sustain: f32, release: f32) -> f32 {
        match self.stage {
            ATTACK => {
                self.value += (1.3 - self.value) * attack;
                if self.value >= 1. {
                    self.value = 1.;
                    self.stage = DECAY;
                }
            }
            DECAY => {
                self.value += (sustain - self.value) * decay;
                if sustain < 1e-4 && self.value < 1e-4 {
                    self.value = 0.;
                    self.stage = IDLE;
                }
            }
            RELEASE => {
                self.value -= self.value * release;
                if self.value < 1e-4 {
                    self.value = 0.;
                    self.stage = IDLE;
                }
            }
            _ => {}
        }
        self.value
    }
}
/// Coefficient so the overshooting attack reaches 1 after `seconds`.
pub fn attack_coefficient(seconds: f32, sr: f32) -> f32 {
    smoothing(seconds / 1.466, sr)
}
/// Decay/release coefficient: about -43 dB after `seconds`.
pub fn fall_coefficient(seconds: f32, sr: f32) -> f32 {
    smoothing(seconds / 5., sr)
}

/// Low-frequency oscillator in turns with the classic function set.
#[derive(Clone, Copy)]
pub struct Lfo {
    pub phase: f32,
    held: f32,
    from: f32,
    rng: Rng,
}
pub const LFO_SINE: u32 = 0;
pub const LFO_TRIANGLE: u32 = 1;
pub const LFO_SAW_UP: u32 = 2;
pub const LFO_SAW_DOWN: u32 = 3;
pub const LFO_SQUARE: u32 = 4;
pub const LFO_SAMPLE_HOLD: u32 = 5;
pub const LFO_DRIFT: u32 = 6;
impl Lfo {
    pub const fn new(seed: u32) -> Self {
        Self { phase: 0., held: 0., from: 0., rng: Rng(seed) }
    }
    /// Advance by `turns` and return the value in [-1, 1].
    #[inline]
    pub fn step(&mut self, turns: f32, shape: u32) -> f32 {
        self.phase += turns;
        if self.phase >= 1. {
            self.phase -= self.phase.floor();
            self.from = self.held;
            self.held = self.rng.next();
        }
        let t = self.phase;
        match shape {
            LFO_TRIANGLE => 1. - 4. * (t - 0.5).abs(),
            LFO_SAW_UP => 2. * t - 1.,
            LFO_SAW_DOWN => 1. - 2. * t,
            LFO_SQUARE => {
                if t < 0.5 {
                    1.
                } else {
                    -1.
                }
            }
            LFO_SAMPLE_HOLD => self.held,
            LFO_DRIFT => self.from + (self.held - self.from) * smoothstep(t),
            LFO_SINE | _ => sin_turns(t),
        }
    }
}

/// Removes DC from the final mix; flushes to zero instead of decaying into denormals.
#[derive(Clone, Copy)]
pub struct DcBlock {
    x: f32,
    y: f32,
}
impl DcBlock {
    pub const ZERO: Self = Self { x: 0., y: 0. };
    #[inline]
    pub fn tick(&mut self, x: f32, r: f32) -> f32 {
        let mut y = x - self.x + r * self.y;
        if y.abs() < 1e-20 {
            y = 0.;
        }
        self.x = x;
        self.y = y;
        y
    }
}

/// Four cascaded one-pole TPT stages with global feedback (24 dB/oct), solved
/// zero-delay for the linear part; the feedback sum saturates, so resonance
/// self-oscillates near k = 4 with a bounded level. Used for the OTA/ladder
/// families (Juno, Prophet, Jupiter); as on those filters, the passband drops as k rises.
#[derive(Clone, Copy)]
pub struct Ladder {
    s: [f32; 4],
}
impl Ladder {
    pub const ZERO: Self = Self { s: [0.; 4] };
    /// Starts a fresh filter already ringing, as a self-oscillating hardware
    /// filter is before a key opens the VCA (otherwise it needs many cycles to build up).
    pub fn ring(&mut self) {
        self.s = [0.9, 0.6, 0.3, 0.1];
    }
    /// `g` from [`warp`], `k` = feedback (0 = none, 4 = self-oscillation).
    #[inline]
    pub fn tick(&mut self, x: f32, g: f32, k: f32) -> f32 {
        self.taps(x, g, k).1
    }
    /// The second stage (12 dB/oct, still resonating through the four-stage
    /// loop, as the 2-pole mode of the IR3109 filters) and the fourth (24 dB/oct).
    #[inline]
    pub fn taps(&mut self, x: f32, g: f32, k: f32) -> (f32, f32) {
        let a = g / (1. + g);
        let b = 1. / (1. + g);
        let [s0, s1, s2, s3] = self.s;
        let a2 = a * a;
        let a4 = a2 * a2;
        let sum = b * (a2 * a * s0 + a2 * s1 + a * s2 + s3);
        let y = (a4 * x + sum) / (1. + k * a4);
        let mut u = 2. * soft(0.5 * (x - k * y));
        let mut two = 0.;
        for (i, st) in self.s.iter_mut().enumerate() {
            let v = (u - *st) * a;
            let out = v + *st;
            *st = out + v;
            u = out;
            if i == 1 {
                two = out;
            }
        }
        (two, u)
    }
}
/// Resonance control 0..1 to ladder feedback; the last few percent self-oscillate.
#[inline]
pub fn ladder_feedback(resonance: f32) -> f32 {
    4.15 * bound(resonance, 0., 1.)
}

impl Adsr {
    /// Linear-attack variant (digitally generated envelopes such as the Juno-106's).
    #[inline]
    pub fn tick_linear(&mut self, attack_step: f32, decay: f32, sustain: f32, release: f32) -> f32 {
        if self.stage == ATTACK {
            self.value += attack_step;
            if self.value >= 1. {
                self.value = 1.;
                self.stage = DECAY;
            }
            self.value
        } else {
            self.tick(1., decay, sustain, release)
        }
    }
}

/// Levels of the waveforms a [`VcOsc`] mixes (0 = off).
#[derive(Clone, Copy)]
pub struct Waves {
    pub saw: f32,
    pub pulse: f32,
    pub tri: f32,
    pub sine: f32,
}
impl Waves {
    pub const NONE: Self = Self { saw: 0., pulse: 0., tri: 0., sine: 0. };
}

/// Corrections for one sample step: `now` for the new sample, `before` for the
/// held one. Events sit `tau` ∈ (0, 1] of the way from the held sample to the new one.
struct Fix {
    now: f32,
    before: f32,
}
impl Fix {
    /// PolyBLEP for a step of height `h`.
    #[inline]
    fn step(&mut self, h: f32, tau: f32) {
        let d = 1. - tau;
        self.before += 0.5 * h * d * d;
        self.now -= 0.5 * h * tau * tau;
    }
    /// PolyBLAMP for a change of slope `m` (value per sample).
    #[inline]
    fn corner(&mut self, m: f32, tau: f32) {
        let d = 1. - tau;
        self.before += m * d * d * d * (1. / 6.);
        self.now += m * tau * tau * tau * (1. / 6.);
    }
}

/// A band-limited analog-style oscillator: saw, pulse (DC-free) and triangle
/// mixed, with every discontinuity placed at its sub-sample time (polyBLEP for
/// steps, polyBLAMP for the triangle's corners), hard-sync resets included. The
/// output is one sample late, so a correction can reach back before an event.
#[derive(Clone, Copy)]
pub struct VcOsc {
    pub phase: f32,
    held: f32,
}
impl VcOsc {
    pub const ZERO: Self = Self { phase: 0., held: 0. };

    #[inline]
    fn value(t: f32, pw: f32, w: &Waves) -> f32 {
        let pulse = if t < pw { 1. } else { -1. };
        let sine = if w.sine != 0. { w.sine * sin_turns(t) } else { 0. };
        w.saw * (2. * t - 1.) + w.pulse * (pulse - (2. * pw - 1.)) + w.tri * (1. - 4. * (t - 0.5).abs()) + sine
    }

    /// Slope in value per sample at phase `t`.
    #[inline]
    fn slope(t: f32, dt: f32, w: &Waves) -> f32 {
        let sine = if w.sine != 0. { w.sine * TAU * dt * sin_turns(t + 0.25) } else { 0. };
        2. * dt * w.saw + if t < 0.5 { 4. } else { -4. } * dt * w.tri + sine
    }

    /// Moves the phase through the part of the sample from `from` to `to`, correcting each edge.
    #[inline]
    fn run(t: &mut f32, dt: f32, pw: f32, w: &Waves, from: f32, to: f32, fix: &mut Fix, wrap: &mut f32) {
        let mut at = from;
        for _ in 0..4 {
            let end = *t + dt * (to - at);
            // the next edge ahead: pulse fall at pw, triangle peak at ½, wrap at 1
            let (mut edge, mut kind) = (1., 0u8);
            if w.pulse != 0. && *t < pw && pw < edge {
                edge = pw;
                kind = 1;
            }
            if w.tri != 0. && *t < 0.5 && 0.5 < edge {
                edge = 0.5;
                kind = 2;
            }
            if end < edge {
                *t = end;
                return;
            }
            let tau = (at + (edge - *t) / dt).clamp(from, to);
            match kind {
                1 => fix.step(-2. * w.pulse, tau),
                2 => fix.corner(-8. * dt * w.tri, tau),
                _ => {
                    fix.step(2. * (w.pulse - w.saw), tau);
                    fix.corner(8. * dt * w.tri, tau);
                    *wrap = tau;
                }
            }
            *t = if kind == 0 { 0. } else { edge };
            at = tau;
        }
        *t = t.clamp(0., 0.999_999);
    }

    /// Advances one sample at `dt` turns per sample (below ½). `sync` in (0, 1]
    /// resets the phase that far through the sample; 0 means no reset. Returns the
    /// output and where this oscillator wrapped within the sample (0 if it did not),
    /// which is the `sync` for an oscillator slaved to it.
    #[inline]
    pub fn step(&mut self, dt: f32, pw: f32, w: &Waves, sync: f32) -> (f32, f32) {
        let mut fix = Fix { now: 0., before: 0. };
        let mut t = self.phase;
        let mut wrap = 0.;
        if sync > 0. && sync <= 1. {
            Self::run(&mut t, dt, pw, w, 0., sync, &mut fix, &mut wrap);
            fix.step(Self::value(0., pw, w) - Self::value(t, pw, w), sync);
            fix.corner(Self::slope(0., dt, w) - Self::slope(t, dt, w), sync);
            t = 0.;
            Self::run(&mut t, dt, pw, w, sync, 1., &mut fix, &mut wrap);
        } else {
            Self::run(&mut t, dt, pw, w, 0., 1., &mut fix, &mut wrap);
        }
        let out = self.held + fix.before;
        self.held = Self::value(t, pw, w) + fix.now;
        self.phase = t;
        (out, wrap)
    }
}

/// Odd taps of a 47-tap Blackman-windowed half-band low-pass (centre tap ½): flat
/// to 0.2·fs, −50 dB at 0.3·fs and below −79 dB from 0.32·fs (fs = oversampled rate).
const HALF_BAND: [f32; 11] = [
    0.315_884_39, -0.099_017_018, 0.052_466_078, -0.030_992_122, 0.018_581_689, -0.010_847_646,
    0.005_996_370_8, -0.003_052_243_7, 0.001_371_809_1, -0.000_495_819_78, 0.000_104_510_76,
];

/// Two-to-one decimator for a voice path run at twice the sample rate.
#[derive(Clone, Copy)]
pub struct HalfBand {
    buf: [f32; 128],
    pos: usize,
}
impl HalfBand {
    pub const ZERO: Self = Self { buf: [0.; 128], pos: 0 };
    #[inline]
    fn push(&mut self, x: f32) {
        self.buf[self.pos] = x;
        self.buf[self.pos + 64] = x;
        self.pos = (self.pos + 1) & 63;
    }
    /// Takes two oversampled samples, returns one at the base rate (latency 23 oversampled samples).
    #[inline]
    pub fn tick(&mut self, a: f32, b: f32) -> f32 {
        self.push(a);
        self.push(b);
        let s = &self.buf[self.pos + 17..self.pos + 64];
        let mut y = 0.5 * s[23];
        for (k, c) in HALF_BAND.iter().enumerate() {
            let m = 2 * k + 1;
            y += c * (s[23 - m] + s[23 + m]);
        }
        if y.abs() < 1e-20 {
            0.
        } else {
            y
        }
    }
}

/// A short fade-in (about 4 ms, a smoothstep) for a voice that starts from silence, so a key
/// press never begins with a step even when the envelope's attack is instant. A voice that is
/// still sounding when it is reused keeps its gain.
#[derive(Clone, Copy)]
pub struct Onset {
    g: f32,
}
impl Onset {
    pub const DONE: Self = Self { g: 1. };
    #[inline]
    pub fn arm(&mut self) {
        self.g = 0.;
    }
    #[inline]
    pub fn tick(&mut self) -> f32 {
        if self.g >= 1. {
            return 1.;
        }
        self.g = (self.g + 1. / 192.).min(1.);
        self.g * self.g * (3. - 2. * self.g)
    }
}
