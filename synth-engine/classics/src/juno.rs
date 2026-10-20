//! A Juno-106-inspired polysynth: one DCO per voice (saw, pulse with manual or
//! LFO width, a sub-octave square and noise) → the four-position high-pass
//! (+3 dB shelf at 70 Hz, flat, 6 dB/oct cuts at 225 and 700 Hz) → a resonant 4-pole low-pass → VCA. One
//! ADSR drives both filter and amplifier (or the VCA gates), a single delayed
//! triangle LFO modulates everything, and the BBD chorus is applied by the host.
//! DCOs are stable (no drift); the filters and amplifiers vary slightly per voice.
//! Velocity and pressure routes are additions for piano playing; the original had neither.
//! An original interpretation, not a circuit model.
use crate::alloc::{choose, Slot};
use crate::dsp::*;

pub const VOICES: usize = 16;
pub const PARAMS: usize = 48;
const TICK: usize = 16;

pub mod id {
    pub const RANGE: usize = 0;
    pub const LFO_DCO: usize = 1;
    pub const PWM: usize = 2;
    pub const PWM_SOURCE: usize = 3;
    pub const PULSE: usize = 4;
    pub const SAW: usize = 5;
    pub const SUB: usize = 6;
    pub const NOISE: usize = 7;
    pub const HPF: usize = 8;
    pub const CUTOFF: usize = 9;
    pub const RES: usize = 10;
    pub const ENV_POLARITY: usize = 11;
    pub const ENV: usize = 12;
    pub const LFO_VCF: usize = 13;
    pub const KYBD: usize = 14;
    pub const VCA_MODE: usize = 15;
    pub const LEVEL: usize = 16;
    pub const ATTACK: usize = 17;
    pub const DECAY: usize = 18;
    pub const SUSTAIN: usize = 19;
    pub const RELEASE: usize = 20;
    pub const LFO_RATE: usize = 21;
    pub const LFO_DELAY: usize = 22;
    pub const CHORUS: usize = 23;
    pub const CHORUS_NOISE: usize = 24;
    pub const BEND_VCF: usize = 25;
    pub const VEL_VCF: usize = 26;
    pub const VEL_VCA: usize = 27;
    pub const AFTER_VCF: usize = 28;
    pub const MOD_DEPTH: usize = 29;
    pub const VOLUME: usize = 30;
    pub const VOICES: usize = 31;
    pub const SPREAD: usize = 32;
    pub const WIDTH: usize = 33;
    pub const BEND_DCO: usize = 34;
}

const DEFAULTS: [(usize, f32); 23] = [
    (id::RANGE, 1.), (id::PWM, 0.), (id::PWM_SOURCE, 1.), (id::SAW, 1.), (id::HPF, 1.), (id::CUTOFF, 3000.),
    (id::RES, 0.1), (id::ENV, 0.21), (id::KYBD, 0.6), (id::LEVEL, 0.8), (id::ATTACK, 0.005), (id::DECAY, 0.8),
    (id::SUSTAIN, 0.7), (id::RELEASE, 0.4), (id::LFO_RATE, 3.), (id::CHORUS, 1.), (id::CHORUS_NOISE, 0.3),
    (id::VEL_VCF, 0.3), (id::VEL_VCA, 0.4), (id::MOD_DEPTH, 0.5), (id::VOLUME, 0.68), (id::VOICES, 6.), (id::BEND_DCO, 1.),
];

#[derive(Clone, Copy)]
struct Setup {
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    saw: bool,
    pulse: bool,
    sub: f32,
    noise: f32,
    hpf: u32,
    hp_a: f32,
    gate: bool,
    gate_k: f32,
}

#[derive(Clone, Copy)]
struct Voice {
    onset: Onset,
    key: u32,
    note: f32,
    velocity: f32,
    poly: f32,
    pressure: f32,
    down: bool,
    held: bool,
    active: bool,
    fresh: bool,
    stamp: u32,
    rng: Rng,
    phase: f32,
    odd: bool,
    env: Adsr,
    gate: f32,
    hp: f32,
    ladder: Ladder,
    dt: f32,
    dt_d: f32,
    pw: f32,
    pw_d: f32,
    g: f32,
    g_d: f32,
    gain: f32,
    gain_d: f32,
    k: f32,
    pan: (f32, f32),
    cut: f32,
    trim: f32,
    time: f32,
    spread: f32,
}
impl Voice {
    const ZERO: Self = Self {
        onset: Onset::DONE,
        key: 0, note: 60., velocity: 0., poly: 0., pressure: 0., down: false, held: false, active: false, fresh: true,
        stamp: 0, rng: Rng(1), phase: 0., odd: false, env: Adsr::ZERO, gate: 0., hp: 0., ladder: Ladder::ZERO,
        dt: 0., dt_d: 0., pw: 0.5, pw_d: 0., g: 0., g_d: 0., gain: 0., gain_d: 0., k: 0., pan: (1., 1.), cut: 0.,
        trim: 1., time: 1., spread: 0.,
    };
}

pub struct Juno {
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    setup: Setup,
    voices: [Voice; VOICES],
    stamp: u32,
    until: usize,
    lfo: Lfo,
    fade: f32,
    bend_to: f32,
    bend: f32,
    pressure: f32,
    modulation: f32,
    expression: f32,
    expression_s: f32,
    brightness: f32,
    soft: f32,
    pedal: bool,
    pub steals: u32,
}

impl Juno {
    pub const fn new() -> Self {
        Self {
            sr: 48000., p: [0.; PARAMS], dirty: true,
            setup: Setup { attack: 1., decay: 1., sustain: 0., release: 1., saw: false, pulse: false, sub: 0., noise: 0., hpf: 1, hp_a: 0., gate: false, gate_k: 1. },
            voices: [Voice::ZERO; VOICES], stamp: 0, until: 0, lfo: Lfo::new(0x2f6b_1e7d), fade: 1., bend_to: 0., bend: 0.,
            pressure: 0., modulation: 0., expression: 1., expression_s: 1., brightness: 0., soft: 0., pedal: false, steals: 0,
        }
    }

    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
        for &(i, v) in DEFAULTS.iter() {
            self.p[i] = v;
        }
        let mut rng = Rng(0x7f4a_7c15);
        for (n, v) in self.voices.iter_mut().enumerate() {
            v.rng = Rng(0x51ed_270b ^ (n as u32 + 1).wrapping_mul(0x9e37_79b9));
            v.cut = rng.next();
            v.trim = 1. + 0.08 * rng.next();
            v.time = 1. + 0.05 * rng.next();
            v.spread = ((n as f32 * 0.618_034) % 1.) * 2. - 1.;
            v.phase = 0.5 + 0.5 * rng.next();
        }
    }

    pub fn set(&mut self, i: usize, value: f32) {
        if i < PARAMS && value.is_finite() {
            self.p[i] = value;
            self.dirty = true;
        }
    }

    pub fn chorus(&self) -> (u32, f32) {
        (bound(self.p[id::CHORUS], 0., 3.).round() as u32, self.p[id::CHORUS_NOISE])
    }

    pub fn active(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    fn level(v: &Voice, gate: bool) -> f32 {
        if gate {
            v.gate
        } else {
            v.env.value
        }
    }

    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        if !note.is_finite() {
            return;
        }
        if self.dirty {
            self.prepare();
        }
        let note = note.clamp(0., 127.);
        let n = (self.p[id::VOICES].round() as usize).clamp(1, VOICES);
        let gate = self.setup.gate;
        // The LFO delay restarts when a phrase starts (no key held), as on the original.
        if !self.voices.iter().any(|v| v.down) {
            self.fade = 0.;
        }
        let mut slots = [Slot { active: false, down: false, held: false, note: 0., stamp: 0, level: 0. }; VOICES];
        for (slot, v) in slots.iter_mut().zip(self.voices.iter()) {
            *slot = Slot { active: v.active, down: v.down, held: v.held, note: v.note, stamp: v.stamp, level: Self::level(v, gate) };
        }
        let index = choose(&slots[..n], note);
        let ringing = ladder_feedback(self.p[id::RES]) >= 3.95;
        if self.voices[index].active && self.voices[index].down && self.voices[index].note != note {
            self.steals += 1;
        }
        self.stamp = self.stamp.wrapping_add(1);
        let v = &mut self.voices[index];
        if !v.active {
            v.fresh = true;
            v.pressure = 0.;
            v.hp = 0.;
            v.ladder = Ladder::ZERO;
            if ringing {
                v.ladder.ring();
            }
            v.gate = 0.;
        }
        v.key = key;
        v.note = note;
        v.velocity = bound(velocity, 0., 1.);
        v.poly = 0.;
        v.down = true;
        v.held = false;
        v.stamp = self.stamp;
        v.env.attack();
        if !v.active {
            v.onset.arm();
        }
        v.active = true;
    }

    fn release(v: &mut Voice) {
        v.down = false;
        v.held = false;
        v.env.release();
    }

    pub fn note_off(&mut self, key: u32) {
        let pedal = self.pedal;
        for v in self.voices.iter_mut().filter(|v| v.active && v.down && v.key == key) {
            if pedal {
                v.down = false;
                v.held = true;
            } else {
                Self::release(v);
            }
        }
    }

    pub fn poly_pressure(&mut self, key: u32, value: f32) {
        for v in self.voices.iter_mut().filter(|v| v.active && v.key == key) {
            v.poly = bound(value, 0., 1.);
        }
    }

    pub fn control(&mut self, which: u32, value: f32) {
        use crate::cs80::control::*;
        if !value.is_finite() {
            return;
        }
        match which {
            BEND => self.bend_to = value.clamp(-48., 48.),
            PRESSURE => self.pressure = value.clamp(0., 1.),
            MOD => self.modulation = value.clamp(0., 1.),
            EXPRESSION => self.expression = value.clamp(0., 1.),
            BRIGHTNESS => self.brightness = value.clamp(-1., 1.),
            SOFT => self.soft = value.clamp(0., 1.),
            SUSTAIN => {
                self.pedal = value >= 0.5;
                if !self.pedal {
                    for v in self.voices.iter_mut().filter(|v| v.active && v.held) {
                        Self::release(v);
                    }
                }
            }
            _ => {}
        }
    }

    pub fn panic(&mut self) {
        for v in self.voices.iter_mut() {
            v.active = false;
            v.down = false;
            v.held = false;
            v.env = Adsr::ZERO;
            v.gate = 0.;
            v.hp = 0.;
            v.ladder = Ladder::ZERO;
        }
        self.pedal = false;
    }

    fn prepare(&mut self) {
        let sr = self.sr;
        let p = &self.p;
        let hpf = bound(p[id::HPF], 0., 3.).round() as u32;
        self.setup = Setup {
            attack: 1. / (bound(p[id::ATTACK], 0.001, 10.) * sr),
            decay: fall_coefficient(bound(p[id::DECAY], 0.001, 20.), sr),
            sustain: bound(p[id::SUSTAIN], 0., 1.),
            release: fall_coefficient(bound(p[id::RELEASE], 0.001, 20.), sr),
            saw: p[id::SAW] >= 0.5,
            pulse: p[id::PULSE] >= 0.5,
            sub: bound(p[id::SUB], 0., 1.),
            noise: bound(p[id::NOISE], 0., 1.),
            hpf,
            hp_a: 1. - (-core::f32::consts::TAU * [70., 70., 225., 700.][hpf as usize] / sr).exp(),
            gate: p[id::VCA_MODE] >= 0.5,
            gate_k: smoothing(0.0015, sr),
        };
        self.dirty = false;
    }

    fn tick(&mut self) {
        if self.dirty {
            self.prepare();
        }
        let sr = self.sr;
        let ts = TICK as f32 / sr;
        let rate = sr / TICK as f32;
        let p = self.p;
        let fast = smoothing(0.006, rate);
        self.bend += (self.bend_to - self.bend) * fast;
        self.expression_s += (self.expression - self.expression_s) * fast;
        let raw = self.lfo.step(bound(p[id::LFO_RATE], 0.05, 40.) * ts, LFO_TRIANGLE);
        let delay = bound(p[id::LFO_DELAY], 0., 6.);
        self.fade = if delay > 0. { (self.fade + ts / delay).min(1.) } else { 1. };
        let lfo = raw * smoothstep(self.fade);
        let press_k = smoothing(0.025, rate);
        let range = [-12., 0., 12.][(bound(p[id::RANGE], 0., 2.).round()) as usize];
        let pitch_mod = bound(p[id::LFO_DCO], 0., 12.) * lfo + bound(p[id::MOD_DEPTH], 0., 3.) * self.modulation * raw;
        let bend_pitch = bound(p[id::BEND_DCO], 0., 1.) * self.bend;
        let pwm = bound(p[id::PWM], 0., 1.);
        let width = 0.5 - 0.46 * pwm * if p[id::PWM_SOURCE] >= 0.5 { 1. } else { 0.5 * (lfo + 1.) };
        let polarity = if p[id::ENV_POLARITY] >= 0.5 { -1. } else { 1. };
        // Roland's service notes: envelope modulation of the filter is up to +-14 octaves
        let env_oct = 14. * bound(p[id::ENV], 0., 1.) * polarity;
        let base = log2(bound(p[id::CUTOFF], 5., 60000.)) + 3.5 * bound(p[id::LFO_VCF], 0., 1.) * lfo
            + bound(p[id::BEND_VCF], 0., 1.) * self.bend / 6. + 1.5 * self.brightness - self.soft;
        let kybd = bound(p[id::KYBD], 0., 1.2);
        let (vel_vcf, vel_vca, after_vcf) = (bound(p[id::VEL_VCF], 0., 1.), bound(p[id::VEL_VCA], 0., 1.), bound(p[id::AFTER_VCF], 0., 1.));
        let k = ladder_feedback(p[id::RES]);
        let spread = bound(p[id::SPREAD], 0., 1.);
        let stereo = bound(p[id::WIDTH], 0., 1.);
        let level = bound(p[id::LEVEL], 0., 1.);
        let volume = bound(p[id::VOLUME], 0., 1.);
        // the 4-pole loses passband as resonance rises; give back part of it
        let master = level * level * volume * volume * self.expression_s * (1. - 0.35 * self.soft) * 0.78 * (1. + 0.3 * k);
        let channel_pressure = self.pressure;
        let inv = 1. / TICK as f32;
        for v in self.voices.iter_mut().filter(|v| v.active) {
            v.pressure += (v.poly.max(channel_pressure) - v.pressure) * press_k;
            let dt = (note_hz(v.note + range + bend_pitch + pitch_mod) / sr).min(0.45);
            let oct = base + kybd * (v.note - 60.) / 12. + env_oct * v.env.value + vel_vcf * 3. * (v.velocity - 0.6)
                + after_vcf * 3. * v.pressure + 0.2 * spread * v.cut;
            let hz = exp2(oct);
            let g = warp(hz, sr);
            let gain = master * (1. - vel_vca * (1. - v.velocity)) * (1. + spread * (v.trim - 1.));
            v.pan = pan(stereo * v.spread);
            // a cutoff pushed past the audio band keeps its resonant peak out of hearing
            // rather than ringing at the clamp just below Nyquist
            v.k = k * (1. - ((hz - 0.3 * sr) / (0.15 * sr)).clamp(0., 1.));
            if v.fresh {
                v.fresh = false;
                v.dt = dt;
                v.pw = width;
                v.g = g;
                v.gain = gain;
            }
            v.dt_d = (dt - v.dt) * inv;
            v.pw_d = (width - v.pw) * inv;
            v.g_d = (g - v.g) * inv;
            v.gain_d = (gain - v.gain) * inv;
        }
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let n = left.len();
        left.fill(0.);
        right.fill(0.);
        let mut at = 0;
        while at < n {
            if self.until == 0 {
                self.tick();
                self.until = TICK;
            }
            let m = self.until.min(n - at);
            let s = self.setup;
            for v in self.voices.iter_mut().filter(|v| v.active) {
                render_voice(v, &s, &mut left[at..at + m], &mut right[at..at + m]);
                let done = if s.gate { !v.down && !v.held && v.gate < 1e-5 } else { v.env.stage == IDLE };
                if done {
                    v.active = false;
                    v.down = false;
                    v.held = false;
                    v.env = Adsr::ZERO;
                }
            }
            at += m;
            self.until -= m;
        }
    }
}

#[inline(always)]
fn render_voice(v: &mut Voice, s: &Setup, left: &mut [f32], right: &mut [f32]) {
    let (attack, decay, release) = ((s.attack / v.time).min(1.), (s.decay / v.time).min(1.), (s.release / v.time).min(1.));
    let gate_to = if v.down || v.held { 1. } else { 0. };
    let (pl, pr) = v.pan;
    for i in 0..left.len() {
        v.dt += v.dt_d;
        v.pw += v.pw_d;
        v.g += v.g_d;
        v.gain += v.gain_d;
        let t = v.phase;
        let dt = v.dt;
        let mut x = 0.;
        if s.saw {
            x += saw(t, dt);
        }
        if s.pulse {
            x += pulse(t, dt, v.pw);
        }
        if s.sub > 0. {
            // square one octave down, phase-locked to the DCO
            x += s.sub * pulse((t + if v.odd { 1. } else { 0. }) * 0.5, dt * 0.5, 0.5);
        }
        let noise = v.rng.next();
        x = 0.45 * (x + s.noise * noise);
        // one-pole: position 0 adds back ~3 dB below 70 Hz, 2 and 3 cut at 6 dB/oct
        v.hp += (x - v.hp) * s.hp_a;
        x = match s.hpf {
            0 => x + 0.41 * v.hp,
            1 => x,
            _ => x - v.hp,
        };
        // a whisper of noise lets a fully resonant filter start singing on its own
        let y = v.ladder.tick(x + 1e-5 * noise, v.g, v.k);
        let e = v.env.tick_linear(attack, decay, s.sustain, release);
        let amp = if s.gate {
            v.gate += (gate_to - v.gate) * s.gate_k;
            v.gate
        } else {
            e
        };
        let o = y * amp * v.gain;
        let o = o * v.onset.tick();
        left[i] += o * pl;
        right[i] += o * pr;
        let next = t + dt;
        if next >= 1. {
            v.phase = next - 1.;
            v.odd = !v.odd;
        } else {
            v.phase = next;
        }
    }
}
