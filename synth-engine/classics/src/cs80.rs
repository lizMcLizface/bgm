//! A CS-80-inspired polysynth: every voice has two complete channels
//! (VCO → resonant 12 dB high-pass → resonant 12 dB low-pass → VCA, with the
//! sine wave bypassing the filters), the IL/AL filter envelope, per-note initial
//! and after touch, keyboard scaling, one global sub-oscillator, a ring
//! modulator with its own envelope, portamento/glissando and per-voice analog
//! variation. An original interpretation of the published panel layout, not a
//! circuit model.
use crate::alloc::{choose, Slot};
use crate::dsp::*;

pub const VOICES: usize = 16;
pub const PARAMS: usize = 128;
/// Samples between control updates (pitch, filters, envelopes, modulation).
const TICK: usize = 16;
/// Octaves of cutoff movement at full filter-envelope level.
const EG_OCTAVES: f32 = 5.;

/// Per-channel parameter offsets; channel II adds [`CH2`].
pub mod id {
    pub const CH2: usize = 32;
    pub const FEET: usize = 0;
    pub const PW: usize = 1;
    pub const PWM: usize = 2;
    pub const PWM_RATE: usize = 3;
    pub const SAW: usize = 4;
    pub const SQUARE: usize = 5;
    pub const NOISE: usize = 6;
    pub const SINE: usize = 7;
    pub const HPF: usize = 8;
    pub const HP_RES: usize = 9;
    pub const LPF: usize = 10;
    pub const LP_RES: usize = 11;
    pub const IL: usize = 12;
    pub const AL: usize = 13;
    pub const F_ATTACK: usize = 14;
    pub const F_DECAY: usize = 15;
    pub const F_RELEASE: usize = 16;
    pub const HP_EG: usize = 17;
    pub const ATTACK: usize = 18;
    pub const DECAY: usize = 19;
    pub const SUSTAIN: usize = 20;
    pub const RELEASE: usize = 21;
    pub const LEVEL: usize = 22;
    pub const INIT_BRILL: usize = 23;
    pub const INIT_LEVEL: usize = 24;
    pub const AFTER_BRILL: usize = 25;
    pub const AFTER_LEVEL: usize = 26;
    pub const KEYTRACK: usize = 27;

    pub const VOLUME: usize = 64;
    pub const BALANCE: usize = 65;
    pub const DETUNE: usize = 66;
    pub const BRILLIANCE: usize = 67;
    pub const RESONANCE: usize = 68;
    pub const SUB_FUNCTION: usize = 69;
    pub const SUB_RATE: usize = 70;
    pub const SUB_VCO: usize = 71;
    pub const SUB_VCF: usize = 72;
    pub const SUB_VCA: usize = 73;
    pub const SUB_DELAY: usize = 74;
    pub const AT_PITCH: usize = 75;
    pub const AT_VIBRATO: usize = 76;
    pub const PORTAMENTO: usize = 77;
    pub const GLISSANDO: usize = 78;
    pub const RING_SPEED: usize = 79;
    pub const RING_DEPTH: usize = 80;
    pub const RING_ATTACK: usize = 81;
    pub const RING_DECAY: usize = 82;
    pub const RING_SWEEP: usize = 83;
    pub const BRILL_LOW: usize = 84;
    pub const BRILL_HIGH: usize = 85;
    pub const LEVEL_LOW: usize = 86;
    pub const LEVEL_HIGH: usize = 87;
    pub const DRIFT: usize = 88;
    pub const WIDTH: usize = 89;
    pub const AUTO_TOUCH: usize = 90;
    pub const AUTO_TIME: usize = 91;
    pub const VOICES: usize = 92;
}

/// Performance controls (`syn_control`).
pub mod control {
    pub const BEND: u32 = 0;
    pub const PRESSURE: u32 = 1;
    pub const MOD: u32 = 2;
    pub const EXPRESSION: u32 = 3;
    pub const BRIGHTNESS: u32 = 4;
    pub const SUSTAIN: u32 = 5;
    pub const SOFT: u32 = 6;
}

const DEFAULTS: [(usize, f32); 46] = [
    (id::FEET, 1.), (id::PW, 0.5), (id::PWM_RATE, 0.8), (id::SAW, 1.), (id::HPF, 20.), (id::LPF, 2000.),
    (id::LP_RES, 0.15), (id::AL, 0.4), (id::F_ATTACK, 0.05), (id::F_DECAY, 0.8), (id::F_RELEASE, 0.5),
    (id::ATTACK, 0.01), (id::DECAY, 1.), (id::SUSTAIN, 0.8), (id::RELEASE, 0.6), (id::LEVEL, 0.8),
    (id::INIT_BRILL, 0.3), (id::INIT_LEVEL, 0.5), (id::AFTER_BRILL, 0.4), (id::AFTER_LEVEL, 0.3), (id::KEYTRACK, 0.8),
    (id::CH2 + id::FEET, 1.), (id::CH2 + id::PW, 0.5), (id::CH2 + id::PWM_RATE, 0.8), (id::CH2 + id::SAW, 1.),
    (id::CH2 + id::HPF, 20.), (id::CH2 + id::LPF, 2000.), (id::CH2 + id::LP_RES, 0.15), (id::CH2 + id::AL, 0.4),
    (id::CH2 + id::F_ATTACK, 0.05), (id::CH2 + id::F_DECAY, 0.8), (id::CH2 + id::F_RELEASE, 0.5),
    (id::CH2 + id::ATTACK, 0.01), (id::CH2 + id::DECAY, 1.), (id::CH2 + id::SUSTAIN, 0.8), (id::CH2 + id::RELEASE, 0.6),
    (id::CH2 + id::LEVEL, 0.8), (id::CH2 + id::KEYTRACK, 0.8),
    (id::VOLUME, 0.68), (id::BALANCE, 0.5), (id::DETUNE, 6.), (id::SUB_RATE, 5.5), (id::RING_SPEED, 30.),
    (id::DRIFT, 0.4), (id::AUTO_TIME, 1.5), (id::VOICES, 8.),
];

/// Coefficients that only change when parameters do.
#[derive(Clone, Copy)]
struct ChanSetup {
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    f_attack: f32,
    f_decay: f32,
    f_release: f32,
    saw: f32,
    square: f32,
    noise: f32,
    sine: f32,
    lpf: f32,
    hpf: f32,
    feet: f32,
    gain: f32,
}
impl ChanSetup {
    const ZERO: Self = Self {
        attack: 1., decay: 1., sustain: 0., release: 1., f_attack: 1., f_decay: 1., f_release: 1.,
        saw: 0., square: 0., noise: 0., sine: 0., lpf: 0., hpf: 0., feet: 0., gain: 0.,
    };
}

#[derive(Clone, Copy)]
struct FilterEg {
    value: f32,
    stage: u8,
}
impl FilterEg {
    const ZERO: Self = Self { value: 0., stage: IDLE };
    /// One control tick of IL → AL (linear, over the attack time) → 0 → release back to IL.
    fn tick(&mut self, il: f32, al: f32, step: f32, decay: f32, release: f32) {
        match self.stage {
            ATTACK => {
                let span = step * (al - il).abs().max(0.05);
                if self.value < al {
                    self.value = (self.value + span).min(al);
                } else {
                    self.value = (self.value - span).max(al);
                }
                if self.value == al {
                    self.stage = DECAY;
                }
            }
            DECAY => self.value -= self.value * decay,
            RELEASE => self.value += (il - self.value) * release,
            _ => {}
        }
    }
}

#[derive(Clone, Copy)]
struct Chan {
    onset: Onset,
    phase: f32,
    hp: Svf,
    lp: Svf,
    amp: Adsr,
    feg: FilterEg,
    // per-sample interpolated controls: value and per-sample step
    dt: f32,
    dt_d: f32,
    pw: f32,
    pw_d: f32,
    hg: f32,
    hg_d: f32,
    lg: f32,
    lg_d: f32,
    gain: f32,
    gain_d: f32,
    hk: f32,
    lk: f32,
    pan: (f32, f32),
}
impl Chan {
    const ZERO: Self = Self {
        onset: Onset::DONE,
        phase: 0., hp: Svf::ZERO, lp: Svf::ZERO, amp: Adsr::ZERO, feg: FilterEg::ZERO,
        dt: 0., dt_d: 0., pw: 0.5, pw_d: 0., hg: 0., hg_d: 0., lg: 0., lg_d: 0., gain: 0., gain_d: 0.,
        hk: 2., lk: 2., pan: (1., 1.),
    };
}

#[derive(Clone, Copy)]
struct Voice {
    key: u32,
    note: f32,
    pitch: f32,
    velocity: f32,
    poly: f32,
    pressure: f32,
    down: bool,
    held: bool,
    active: bool,
    fresh: bool,
    age: f32,
    stamp: u32,
    rng: Rng,
    drift: f32,
    drift_to: f32,
    tune: [f32; 2],
    cut: f32,
    time: f32,
    spread: f32,
    ch: [Chan; 2],
}
impl Voice {
    const ZERO: Self = Self {
        key: 0, note: 60., pitch: 60., velocity: 0., poly: 0., pressure: 0., down: false, held: false,
        active: false, fresh: true, age: 0., stamp: 0, rng: Rng(1), drift: 0., drift_to: 0., tune: [0.; 2],
        cut: 0., time: 1., spread: 0., ch: [Chan::ZERO; 2],
    };
}

pub struct Cs80 {
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    setup: [ChanSetup; 2],
    voices: [Voice; VOICES],
    stamp: u32,
    until: usize,
    sub: Lfo,
    pwm: [Lfo; 2],
    lfo: f32,
    pwm_value: [f32; 2],
    last_note: Option<f32>,
    // performance
    bend_to: f32,
    bend: f32,
    pressure: f32,
    modulation: f32,
    expression: f32,
    expression_s: f32,
    brightness: f32,
    soft: f32,
    pedal: bool,
    // ring modulator
    ring_phase: f32,
    ring_env: f32,
    ring_rising: bool,
    ring_dt: f32,
    ring_dt_d: f32,
    ring_depth: f32,
    ring_depth_d: f32,
    // stats
    pub steals: u32,
    shape_p: [f32; SHAPE_PARAMS],
    shape: EnvShape,
}

impl Cs80 {
    pub const fn new() -> Self {
        Self {
            sr: 48000., p: [0.; PARAMS], dirty: true, setup: [ChanSetup::ZERO; 2], voices: [Voice::ZERO; VOICES],
            stamp: 0, until: 0, sub: Lfo::new(0x9e37_79b9), pwm: [Lfo::new(0x85eb_ca6b), Lfo::new(0xc2b2_ae35)],
            lfo: 0., pwm_value: [0.; 2], last_note: None, bend_to: 0., bend: 0., pressure: 0., modulation: 0.,
            expression: 1., expression_s: 1., brightness: 0., soft: 0., pedal: false, ring_phase: 0., ring_env: 0.,
            ring_rising: false, ring_dt: 0., ring_dt_d: 0., ring_depth: 0., ring_depth_d: 0., steals: 0,
            shape_p: [0.; SHAPE_PARAMS], shape: EnvShape::NATIVE,
        }
    }

    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
        for &(i, v) in DEFAULTS.iter() {
            self.p[i] = v;
        }
        // Fixed per-voice character: tuning, cutoff and envelope-time tolerances.
        let mut rng = Rng(0x2545_f491);
        for (n, v) in self.voices.iter_mut().enumerate() {
            v.rng = Rng(0x1234_5678 ^ (n as u32 + 1).wrapping_mul(0x9e37_79b9));
            v.tune = [rng.next(), rng.next()];
            v.cut = rng.next();
            v.time = 1. + 0.06 * rng.next();
            v.spread = ((n as f32 * 0.618_034) % 1.) * 2. - 1.;
            v.ch[0].phase = 0.5 + 0.5 * rng.next();
            v.ch[1].phase = 0.5 + 0.5 * rng.next();
        }
    }

    /// Amplitude envelope shape for both channels (the IL/AL filter EG keeps its own form).
    pub fn set_shape(&mut self, i: usize, value: f32) {
        self.shape_p[i] = value;
        self.dirty = true;
    }

    pub fn set(&mut self, i: usize, value: f32) {
        if i < PARAMS && value.is_finite() {
            self.p[i] = value;
            self.dirty = true;
        }
    }

    fn polyphony(&self) -> usize {
        (self.p[id::VOICES].round() as usize).clamp(1, VOICES)
    }

    pub fn active(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        if !note.is_finite() {
            return;
        }
        let note = note.clamp(0., 127.);
        let velocity = bound(velocity, 0., 1.);
        let n = self.polyphony();
        let mut slots = [Slot { active: false, down: false, held: false, note: 0., stamp: 0, level: 0. }; VOICES];
        for (slot, v) in slots.iter_mut().zip(self.voices.iter()) {
            *slot = Slot { active: v.active, down: v.down, held: v.held, note: v.note, stamp: v.stamp, level: v.ch[0].amp.value.max(v.ch[1].amp.value) };
        }
        let index = choose(&slots[..n], note);
        if self.voices[index].active && self.voices[index].note != note {
            self.steals += self.voices[index].down as u32;
        }
        self.stamp = self.stamp.wrapping_add(1);
        let glide = self.p[id::PORTAMENTO] > 0.001;
        let from = if glide { self.last_note.unwrap_or(note) } else { note };
        let il = [self.p[id::IL], self.p[id::CH2 + id::IL]];
        let v = &mut self.voices[index];
        let was = v.active;
        v.key = key;
        v.note = note;
        v.pitch = from;
        v.velocity = velocity;
        v.poly = 0.;
        v.down = true;
        v.held = false;
        v.age = 0.;
        v.stamp = self.stamp;
        if !was {
            v.fresh = true;
            v.pressure = 0.;
            v.drift = v.drift_to;
        }
        for (c, ch) in v.ch.iter_mut().enumerate() {
            if !was {
                ch.hp = Svf::ZERO;
                ch.lp = Svf::ZERO;
                ch.feg.value = bound(il[c], -1., 1.);
            }
            if !v.active {
                ch.onset.arm();
            }
            ch.amp.attack();
            ch.feg.stage = ATTACK;
        }
        v.active = true;
        self.last_note = Some(note);
        self.ring_rising = true;
    }

    fn release(v: &mut Voice) {
        v.down = false;
        v.held = false;
        for ch in v.ch.iter_mut() {
            ch.amp.release();
            if ch.feg.stage != IDLE {
                ch.feg.stage = RELEASE;
            }
        }
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
        let value = bound(value, 0., 1.);
        for v in self.voices.iter_mut().filter(|v| v.active && v.key == key) {
            v.poly = value;
        }
    }

    pub fn control(&mut self, which: u32, value: f32) {
        if !value.is_finite() {
            return;
        }
        match which {
            control::BEND => self.bend_to = value.clamp(-48., 48.),
            control::PRESSURE => self.pressure = value.clamp(0., 1.),
            control::MOD => self.modulation = value.clamp(0., 1.),
            control::EXPRESSION => self.expression = value.clamp(0., 1.),
            control::BRIGHTNESS => self.brightness = value.clamp(-1., 1.),
            control::SOFT => self.soft = value.clamp(0., 1.),
            control::SUSTAIN => {
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
            for ch in v.ch.iter_mut() {
                ch.amp = Adsr::ZERO;
                ch.feg = FilterEg::ZERO;
                ch.hp = Svf::ZERO;
                ch.lp = Svf::ZERO;
            }
        }
        self.pedal = false;
        self.ring_env = 0.;
        self.ring_rising = false;
    }

    fn prepare(&mut self) {
        let sr = self.sr;
        let tick_rate = sr / TICK as f32;
        let balance = bound(self.p[id::BALANCE], 0., 1.);
        for c in 0..2 {
            let p = |o: usize| self.p[c * id::CH2 + o];
            let level = bound(p(id::LEVEL), 0., 1.);
            let side = if c == 0 { 1. - balance } else { balance };
            self.setup[c] = ChanSetup {
                attack: attack_coefficient(bound(p(id::ATTACK), 0.0005, 20.), sr),
                decay: fall_coefficient(bound(p(id::DECAY), 0.002, 30.), sr),
                sustain: bound(p(id::SUSTAIN), 0., 1.),
                release: fall_coefficient(bound(p(id::RELEASE), 0.002, 30.), sr),
                f_attack: 1. / (bound(p(id::F_ATTACK), 0.0005, 20.) * tick_rate),
                f_decay: smoothing(bound(p(id::F_DECAY), 0.002, 30.) / 5., tick_rate),
                f_release: smoothing(bound(p(id::F_RELEASE), 0.002, 30.) / 5., tick_rate),
                saw: bound(p(id::SAW), 0., 1.),
                square: bound(p(id::SQUARE), 0., 1.),
                noise: bound(p(id::NOISE), 0., 1.) * 0.8,
                sine: bound(p(id::SINE), 0., 1.) * 0.7,
                lpf: log2(bound(p(id::LPF), 10., 22000.)),
                hpf: log2(bound(p(id::HPF), 5., 12000.)),
                feet: [-12., 0., 12., 24.][(p(id::FEET).round() as usize).min(3)],
                gain: level * level * (2. * side).min(1.) * 0.45,
            };
        }
        self.shape = EnvShape::new(&self.shape_p[..SHAPE_PER_ENV], sr);
        self.dirty = false;
    }

    /// Recompute every voice's targets for the next TICK samples.
    fn tick(&mut self) {
        if self.dirty {
            self.prepare();
        }
        let sr = self.sr;
        let ts = TICK as f32 / sr;
        let tick_rate = sr / TICK as f32;
        let p = self.p;
        let fast = smoothing(0.006, tick_rate);
        self.bend += (self.bend_to - self.bend) * fast;
        self.expression_s += (self.expression - self.expression_s) * fast;
        let function = bound(p[id::SUB_FUNCTION], 0., 6.).round() as u32;
        self.lfo = self.sub.step(bound(p[id::SUB_RATE], 0.02, 50.) * ts, function);
        for c in 0..2 {
            self.pwm_value[c] = self.pwm[c].step(bound(p[c * id::CH2 + id::PWM_RATE], 0.01, 20.) * ts, LFO_TRIANGLE);
        }
        self.ring_tick(ts);

        let press_k = smoothing(0.025, tick_rate);
        let porta = bound(p[id::PORTAMENTO], 0., 5.);
        let glide_k = smoothing(porta / 3., tick_rate);
        let gliss = p[id::GLISSANDO] >= 0.5;
        let drift = bound(p[id::DRIFT], 0., 1.);
        let drift_k = smoothing(0.6, tick_rate);
        let sub_delay = bound(p[id::SUB_DELAY], 0., 10.);
        let auto = bound(p[id::AUTO_TOUCH], 0., 1.);
        let auto_time = bound(p[id::AUTO_TIME], 0.02, 10.);
        let width = bound(p[id::WIDTH], 0., 1.);
        let global_bright = 3. * bound(p[id::BRILLIANCE], -1., 1.) + 1.5 * self.brightness - 1.2 * self.soft;
        let global_res = 0.5 * bound(p[id::RESONANCE], -1., 1.);
        let volume = bound(p[id::VOLUME], 0., 1.);
        let master = volume * volume * self.expression_s * (1. - 0.35 * self.soft);
        let (sub_vco, sub_vcf, sub_vca) = (bound(p[id::SUB_VCO], 0., 12.), bound(p[id::SUB_VCF], 0., 4.), bound(p[id::SUB_VCA], 0., 1.));
        let (at_pitch, at_vibrato) = (bound(p[id::AT_PITCH], -12., 12.), bound(p[id::AT_VIBRATO], 0., 12.));
        let detune = bound(p[id::DETUNE], -100., 100.) / 100.;
        let tremolo = 1. - 0.5 * sub_vca * (1. - self.lfo);
        let inv = 1. / TICK as f32;
        let channel_pressure = self.pressure;
        let modulation = self.modulation;
        let bend = self.bend;
        let lfo = self.lfo;
        let pwm_value = self.pwm_value;
        let setup = self.setup;

        for v in self.voices.iter_mut().filter(|v| v.active) {
            v.age += ts;
            let synthetic = if auto > 0. { auto * smoothstep(v.age / auto_time) } else { 0. };
            let target = v.poly.max(channel_pressure).max(synthetic);
            v.pressure += (target - v.pressure) * press_k;
            let press = v.pressure;
            if porta > 0.001 {
                v.pitch += (v.note - v.pitch) * glide_k;
                if (v.note - v.pitch).abs() < 0.002 {
                    v.pitch = v.note;
                }
            } else {
                v.pitch = v.note;
            }
            if v.rng.next() > 1. - 1.2 * ts {
                v.drift_to = v.rng.next();
            }
            v.drift += (v.drift_to - v.drift) * drift_k;
            let played = if gliss { v.pitch.round() } else { v.pitch };
            let delay = if sub_delay > 0. { smoothstep(v.age / sub_delay) } else { 1. };
            let vibrato = (sub_vco * delay + at_vibrato * press + 0.6 * modulation) * lfo;
            let common = played + bend + at_pitch * press + vibrato;
            let key = (v.note - 60.) / 12.;
            let x = ((v.note - 60.) / 30.).clamp(-1., 1.);
            let (bl, bh, ll, lh) = (p[id::BRILL_LOW], p[id::BRILL_HIGH], p[id::LEVEL_LOW], p[id::LEVEL_HIGH]);
            let scale_bright = 2. * if x < 0. { -x * bound(bl, -1., 1.) } else { x * bound(bh, -1., 1.) };
            let scale_level = exp2(2. * if x < 0. { -x * bound(ll, -1., 1.) } else { x * bound(lh, -1., 1.) });
            let fresh = v.fresh;
            v.fresh = false;
            for c in 0..2 {
                let s = &setup[c];
                let base = c * id::CH2;
                let q = |o: usize| p[base + o];
                let ch = &mut v.ch[c];
                ch.feg.tick(bound(q(id::IL), -1., 1.), bound(q(id::AL), -1., 1.), s.f_attack / v.time, s.f_decay, s.f_release);
                // pitch
                let cents = drift * (0.04 * v.tune[c] + 0.06 * v.drift);
                let note = common + s.feet + cents + if c == 1 { detune } else { 0. };
                let dt = (note_hz(note) / sr).min(0.45);
                // pulse width
                let pw = bound(q(id::PW) + 0.45 * bound(q(id::PWM), 0., 1.) * pwm_value[c], 0.03, 0.97);
                // filters (octaves)
                let track = bound(q(id::KEYTRACK), 0., 1.5) * key;
                let eg = EG_OCTAVES * ch.feg.value;
                let touch = 2.5 * bound(q(id::INIT_BRILL), -1., 1.) * (v.velocity - 0.5) + 3. * bound(q(id::AFTER_BRILL), -1., 1.) * press;
                let lp = s.lpf + track + eg + touch + global_bright + scale_bright + sub_vcf * lfo + 0.15 * drift * v.cut;
                let hp = s.hpf + track + eg * bound(q(id::HP_EG), 0., 1.);
                let lg = warp(exp2(lp), sr);
                let hg = warp(exp2(hp), sr);
                ch.lk = damping(q(id::LP_RES) + global_res);
                ch.hk = damping(q(id::HP_RES));
                // amplitude
                let vel_gain = 1. - bound(q(id::INIT_LEVEL), 0., 1.) * (1. - v.velocity);
                let after_gain = 1. - 0.6 * bound(q(id::AFTER_LEVEL), 0., 1.) * (1. - press);
                let gain = s.gain * vel_gain * after_gain * scale_level * tremolo * master;
                let position = width * if c == 0 { -0.55 } else { 0.55 } + 0.4 * width * v.spread;
                ch.pan = pan(position);
                if fresh {
                    ch.dt = dt;
                    ch.pw = pw;
                    ch.lg = lg;
                    ch.hg = hg;
                    ch.gain = gain;
                }
                ch.dt_d = (dt - ch.dt) * inv;
                ch.pw_d = (pw - ch.pw) * inv;
                ch.lg_d = (lg - ch.lg) * inv;
                ch.hg_d = (hg - ch.hg) * inv;
                ch.gain_d = (gain - ch.gain) * inv;
            }
        }
    }

    fn ring_tick(&mut self, ts: f32) {
        let p = &self.p;
        let depth = bound(p[id::RING_DEPTH], 0., 1.);
        if self.ring_rising {
            self.ring_env += ts / bound(p[id::RING_ATTACK], 0.001, 20.);
            if self.ring_env >= 1. {
                self.ring_env = 1.;
                self.ring_rising = false;
            }
        } else {
            self.ring_env -= self.ring_env * smoothing(bound(p[id::RING_DECAY], 0.002, 30.) / 5., 1. / ts);
        }
        let sweep = bound(p[id::RING_SWEEP], -1., 1.) * 4.;
        let hz = bound(p[id::RING_SPEED], 0.1, 4000.) * exp2(sweep * self.ring_env);
        let dt = (hz / self.sr).min(0.45);
        let inv = 1. / TICK as f32;
        self.ring_dt_d = (dt - self.ring_dt) * inv;
        self.ring_depth_d = (depth - self.ring_depth) * inv;
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
            let setup = self.setup;
            for v in self.voices.iter_mut().filter(|v| v.active) {
                for c in 0..2 {
                    let mut s = setup[c];
                    s.attack = (s.attack / v.time).min(1.);
                    s.decay = (s.decay / v.time).min(1.);
                    s.release = (s.release / v.time).min(1.);
                    render_chan(&mut v.ch[c], &mut v.rng, &s, &self.shape, &mut left[at..at + m], &mut right[at..at + m]);
                }
                // A muted channel's envelope must not keep the voice alive.
                let done = |c: usize| v.ch[c].amp.stage == IDLE || setup[c].gain == 0. && v.ch[c].gain < 1e-7;
                if done(0) && done(1) {
                    v.active = false;
                    v.held = false;
                    v.down = false;
                }
            }
            // Ring modulator on the voice sum: amplitude modulation at low depth, full ring at 1.
            if self.ring_depth > 1e-4 || self.ring_depth_d > 0. {
                for i in at..at + m {
                    self.ring_dt += self.ring_dt_d;
                    self.ring_depth += self.ring_depth_d;
                    self.ring_phase += self.ring_dt;
                    if self.ring_phase >= 1. {
                        self.ring_phase -= 1.;
                    }
                    let g = 1. - self.ring_depth + self.ring_depth * sin_turns(self.ring_phase);
                    left[i] *= g;
                    right[i] *= g;
                }
            } else {
                self.ring_dt += self.ring_dt_d * m as f32;
                self.ring_depth = 0.;
            }
            at += m;
            self.until -= m;
        }
    }
}

#[inline(always)]
fn render_chan(ch: &mut Chan, rng: &mut Rng, s: &ChanSetup, shape: &EnvShape, left: &mut [f32], right: &mut [f32]) {
    let m = left.len();
    let rate = shape.rates(s.attack, s.decay, s.release, false);
    if s.gain == 0. && ch.gain < 1e-7 {
        // Silent channel: keep its envelopes and phase moving without the DSP.
        for _ in 0..m {
            ch.amp.run(shape, &rate, s.attack, s.decay, s.sustain, s.release, false);
        }
        ch.dt += ch.dt_d * m as f32;
        ch.pw += ch.pw_d * m as f32;
        ch.lg += ch.lg_d * m as f32;
        ch.hg += ch.hg_d * m as f32;
        ch.gain += ch.gain_d * m as f32;
        ch.phase = (ch.phase + ch.dt * m as f32).fract();
        return;
    }
    let (pl, pr) = ch.pan;
    for i in 0..m {
        ch.dt += ch.dt_d;
        ch.pw += ch.pw_d;
        ch.lg += ch.lg_d;
        ch.hg += ch.hg_d;
        ch.gain += ch.gain_d;
        let t = ch.phase;
        let dt = ch.dt;
        let mut x = 0.;
        if s.saw > 0. {
            x += s.saw * saw(t, dt);
        }
        if s.square > 0. {
            x += s.square * pulse(t, dt, ch.pw);
        }
        if s.noise > 0. {
            x += s.noise * rng.next();
        }
        let (_, high) = ch.hp.tick(0.6 * x, ch.hg, ch.hk);
        let (low, _) = ch.lp.tick(high, ch.lg, ch.lk);
        let mut y = low;
        if s.sine > 0. {
            y += s.sine * sin_turns(t);
        }
        let e = ch.amp.run(shape, &rate, s.attack, s.decay, s.sustain, s.release, false);
        let o = y * e * ch.gain * ch.onset.tick();
        left[i] += o * pl;
        right[i] += o * pr;
        let next = t + dt;
        ch.phase = if next >= 1. { next - 1. } else { next };
    }
}
