//! A Minimoog-Model-D-inspired monophonic synth. Three oscillators (triangle,
//! shark-tooth, saw, square, wide and narrow pulse; ranges LO–2'; the third can run
//! free of the keyboard as an LFO) → mixer with noise (white or pink) and an
//! output-to-input feedback loop, driven into the filter so hot levels overload →
//! a self-oscillating 4-pole transistor-ladder low-pass with emphasis, contour
//! amount and keyboard control (off, ⅓, ⅔, full) → loudness contour. Both
//! contours are attack/decay/sustain, and one switch makes the release follow the
//! decay. Oscillator 3 or noise modulates pitch and filter through the wheel.
//! Monophonic with low-, last- or high-note priority, single or multiple
//! triggering and glide. Velocity and pressure routes are additions for piano playing.
//! An original interpretation, not a circuit model; units are estimates.
use crate::alloc::KeyStack;
use crate::dsp::*;

pub const PARAMS: usize = 52;
const TICK: usize = 16;

pub mod id {
    pub const OSC1_RANGE: usize = 0;
    pub const OSC1_WAVE: usize = 1;
    pub const OSC2_RANGE: usize = 2;
    pub const OSC2_WAVE: usize = 3;
    pub const OSC2_TUNE: usize = 4;
    pub const OSC3_RANGE: usize = 5;
    pub const OSC3_WAVE: usize = 6;
    pub const OSC3_TUNE: usize = 7;
    pub const OSC3_KBD: usize = 8;
    pub const MIX1: usize = 9;
    pub const MIX1_ON: usize = 10;
    pub const MIX2: usize = 11;
    pub const MIX2_ON: usize = 12;
    pub const MIX3: usize = 13;
    pub const MIX3_ON: usize = 14;
    pub const NOISE: usize = 15;
    pub const NOISE_ON: usize = 16;
    pub const NOISE_PINK: usize = 17;
    pub const FEEDBACK: usize = 18;
    pub const DRIVE: usize = 19;
    pub const CUTOFF: usize = 20;
    pub const EMPHASIS: usize = 21;
    pub const CONTOUR: usize = 22;
    pub const KBD_THIRD: usize = 23;
    pub const KBD_TWO_THIRDS: usize = 24;
    pub const F_ATTACK: usize = 25;
    pub const F_DECAY: usize = 26;
    pub const F_SUSTAIN: usize = 27;
    pub const A_ATTACK: usize = 28;
    pub const A_DECAY: usize = 29;
    pub const A_SUSTAIN: usize = 30;
    pub const DECAY_ON: usize = 31;
    pub const MOD_MIX: usize = 32;
    pub const MOD_AMOUNT: usize = 33;
    pub const MOD_OSC: usize = 34;
    pub const MOD_FILTER: usize = 35;
    pub const GLIDE: usize = 36;
    pub const GLIDE_ON: usize = 37;
    pub const TUNE: usize = 38;
    pub const TRIGGER: usize = 39;
    pub const PRIORITY: usize = 40;
    #[allow(dead_code)]
    pub const BEND_RANGE: usize = 41;
    pub const VEL_CONTOUR: usize = 42;
    pub const VEL_LEVEL: usize = 43;
    pub const AFTER_FILTER: usize = 44;
    pub const VOLUME: usize = 45;
    pub const OVERSAMPLE: usize = 46;
}

/// Footage → semitones from concert pitch (8'): LO, 32', 16', 8', 4', 2'.
const RANGE_ST: [f32; 6] = [-36., -24., -12., 0., 12., 24.];
/// Pulse widths: square, wide, narrow (estimates).
const WIDE: f32 = 0.33;
const NARROW: f32 = 0.17;

const DEFAULTS: [(usize, f32); 25] = [
    (id::OSC1_RANGE, 3.), (id::OSC1_WAVE, 2.), (id::OSC2_RANGE, 3.), (id::OSC2_WAVE, 2.), (id::OSC3_RANGE, 3.),
    (id::OSC3_WAVE, 2.), (id::OSC3_KBD, 1.), (id::MIX1, 0.6), (id::MIX1_ON, 1.), (id::MIX2, 0.5), (id::MIX2_ON, 1.),
    (id::MIX3, 0.5), (id::NOISE, 0.3), (id::DRIVE, 0.3), (id::CUTOFF, 900.), (id::EMPHASIS, 0.2), (id::CONTOUR, 0.4),
    (id::KBD_THIRD, 1.), (id::F_ATTACK, 0.005), (id::F_DECAY, 0.5), (id::F_SUSTAIN, 0.3), (id::A_ATTACK, 0.003),
    (id::A_DECAY, 0.5), (id::A_SUSTAIN, 0.8), (id::VOLUME, 0.75),
];

/// Emphasis 0–1 → ladder feedback; sings from about 0.9 and keeps its level when it does.
fn feedback(emphasis: f32) -> f32 {
    4.4 * bound(emphasis, 0., 1.)
}

/// Waveform choice → oscillator mix: triangle, shark-tooth, saw (reverse saw on osc 3), square, wide, narrow.
fn waves(choice: u32, reverse_saw: bool) -> (Waves, f32) {
    let none = Waves::NONE;
    match choice {
        0 => (Waves { tri: 1., ..none }, 0.5),
        // shark-tooth: a triangle with one slope steeper — a triangle plus a saw
        1 => (Waves { tri: 0.6, saw: if reverse_saw { -0.6 } else { 0.6 }, ..none }, 0.5),
        2 => (Waves { saw: if reverse_saw { -1. } else { 1. }, ..none }, 0.5),
        3 => (Waves { pulse: 1., ..none }, 0.5),
        4 => (Waves { pulse: 1., ..none }, WIDE),
        _ => (Waves { pulse: 1., ..none }, NARROW),
    }
}

#[derive(Clone, Copy)]
struct Setup {
    os: usize,
    srv: f32,
    w: [Waves; 3],
    pw: [f32; 3],
    mix: [f32; 3],
    noise: f32,
    pink: bool,
    fb: f32,
    mod_osc: bool,
    mod_filter: bool,
    kbd3: bool,
    f_attack: f32,
    f_decay: f32,
    f_sustain: f32,
    a_attack: f32,
    a_decay: f32,
    a_sustain: f32,
    release: [f32; 2],
}

pub struct Minimoog {
    onset: Onset,
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    setup: Setup,
    osc: [VcOsc; 3],
    keys: KeyStack,
    playing: Option<u32>,
    note: f32,
    pitch: f32,
    velocity: f32,
    gate: bool,
    sounding: bool,
    fenv: Adsr,
    aenv: Adsr,
    ladder: Ladder,
    dec: HalfBand,
    rng: Rng,
    pink: [f32; 3],
    out: f32,
    until: usize,
    fresh: bool,
    // per-block targets, interpolated per sample
    dt: [f32; 3],
    dt_d: [f32; 3],
    cut: f32,
    cut_d: f32,
    g: f32,
    g_d: f32,
    gain: f32,
    gain_d: f32,
    k: f32,
    pm_semis: f32,
    fm_oct: f32,
    bend_to: f32,
    bend: f32,
    pressure: f32,
    pressure_s: f32,
    modulation: f32,
    modulation_s: f32,
    expression: f32,
    expression_s: f32,
    brightness: f32,
    soft: f32,
    pedal: bool,
    pub steals: u32,
    shape_p: [f32; SHAPE_PARAMS],
    shapes: [EnvShape; 2],
}

impl Minimoog {
    pub const fn new() -> Self {
        Self {
            onset: Onset::DONE, sr: 48000., p: [0.; PARAMS], dirty: true,
            setup: Setup {
                os: 1, w: [Waves::NONE; 3], pw: [0.5; 3], mix: [0.; 3], noise: 0., pink: false, fb: 0., mod_osc: false,
                mod_filter: false, kbd3: true, srv: 48000., f_attack: 1., f_decay: 1., f_sustain: 0., a_attack: 1.,
                a_decay: 1., a_sustain: 0., release: [1., 1.],
            },
            osc: [VcOsc::ZERO; 3], keys: KeyStack::EMPTY, playing: None, note: 60., pitch: 60., velocity: 0.8, gate: false,
            sounding: false, fenv: Adsr::ZERO, aenv: Adsr::ZERO, ladder: Ladder::ZERO, dec: HalfBand::ZERO, rng: Rng(0x7a3c_91e5),
            pink: [0.; 3], out: 0., until: 0, fresh: true, dt: [0.; 3], dt_d: [0.; 3], cut: 10., cut_d: 0., g: 0., g_d: 0.,
            gain: 0., gain_d: 0., k: 0., pm_semis: 0., fm_oct: 0., bend_to: 0., bend: 0., pressure: 0., pressure_s: 0.,
            modulation: 0., modulation_s: 0., expression: 1., expression_s: 1., brightness: 0., soft: 0., pedal: false, steals: 0, shape_p: [0.; SHAPE_PARAMS], shapes: [EnvShape::NATIVE; 2],
        }
    }

    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
        for &(i, v) in DEFAULTS.iter() {
            self.p[i] = v;
        }
        self.p[id::OVERSAMPLE] = 1.;
        self.osc[0].phase = 0.31;
        self.osc[1].phase = 0.67;
        self.osc[2].phase = 0.11;
    }

    /// Envelope shapes: amplitude 0–7, filter 8–15 (see [`EnvShape`]).
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

    pub fn active(&self) -> u32 {
        self.sounding as u32
    }

    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        if !note.is_finite() {
            return;
        }
        if self.dirty {
            self.prepare();
        }
        let note = note.clamp(0., 127.);
        let first = self.keys.len == 0 && !self.pedal_hold();
        self.keys.push(key, note);
        let priority = bound(self.p[id::PRIORITY], 0., 2.).round() as u32;
        let (k, n) = self.keys.pick([0, 1, 4][priority as usize]).unwrap_or((key, note));
        // a key that does not win the priority leaves the sounding note alone
        if k != key {
            return;
        }
        let legato = !first && self.gate && self.p[id::TRIGGER] < 0.5;
        self.start(k, n, velocity, !legato);
    }

    fn pedal_hold(&self) -> bool {
        self.pedal && self.sounding && !self.gate
    }

    fn start(&mut self, key: u32, note: f32, velocity: f32, retrigger: bool) {
        if !self.sounding {
            self.onset.arm();
            self.fresh = true;
            self.pitch = note;
            self.ladder = Ladder::ZERO;
            if feedback(self.p[id::EMPHASIS]) >= 3.95 {
                self.ladder.ring();
            }
        }
        if self.gate && retrigger && self.playing.is_some() && self.playing != Some(key) {
            self.steals += 1;
        }
        self.playing = Some(key);
        self.note = note;
        self.velocity = bound(velocity, 0., 1.);
        self.gate = true;
        self.sounding = true;
        if retrigger {
            self.fenv.attack();
            self.aenv.attack();
        } else if self.aenv.stage == IDLE || self.aenv.stage == RELEASE {
            self.fenv.attack();
            self.aenv.attack();
        }
    }

    fn release(&mut self) {
        self.gate = false;
        self.fenv.release();
        self.aenv.release();
    }

    pub fn note_off(&mut self, key: u32) {
        self.keys.remove(key);
        let priority = bound(self.p[id::PRIORITY], 0., 2.).round() as u32;
        match self.keys.pick([0, 1, 4][priority as usize]) {
            Some((k, n)) => {
                // back to a key still held: the pitch moves, the contours carry on
                if self.playing != Some(k) {
                    self.playing = Some(k);
                    self.note = n;
                }
            }
            None => {
                self.playing = None;
                if !self.pedal {
                    self.release();
                }
            }
        }
    }

    pub fn poly_pressure(&mut self, _key: u32, _value: f32) {}

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
                if !self.pedal && self.keys.len == 0 && self.gate {
                    self.release();
                }
            }
            _ => {}
        }
    }

    pub fn panic(&mut self) {
        self.keys = KeyStack::EMPTY;
        self.playing = None;
        self.gate = false;
        self.sounding = false;
        self.fenv = Adsr::ZERO;
        self.aenv = Adsr::ZERO;
        self.ladder = Ladder::ZERO;
        self.dec = HalfBand::ZERO;
        self.out = 0.;
        self.pedal = false;
    }

    fn prepare(&mut self) {
        let p = &self.p;
        let pick = |i: usize, n: f32| bound(p[i], 0., n).round() as u32;
        let on = |i: usize| p[i] >= 0.5;
        let os = if on(id::OVERSAMPLE) { 2 } else { 1 };
        if os != self.setup.os {
            self.dec = HalfBand::ZERO;
        }
        let srv = self.sr * os as f32;
        let (w0, p0) = waves(pick(id::OSC1_WAVE, 5.), false);
        let (w1, p1) = waves(pick(id::OSC2_WAVE, 5.), false);
        let (w2, p2) = waves(pick(id::OSC3_WAVE, 5.), true);
        let level = |amount: usize, switch: usize| if on(switch) { bound(p[amount], 0., 1.) } else { 0. };
        let fall = |i: usize| fall_coefficient(bound(p[i], 0.002, 30.), srv);
        let release = if on(id::DECAY_ON) { [fall(id::F_DECAY), fall(id::A_DECAY)] } else { [fall_coefficient(0.012, srv); 2] };
        self.setup = Setup {
            os,
            srv,
            w: [w0, w1, w2],
            pw: [p0, p1, p2],
            mix: [level(id::MIX1, id::MIX1_ON), level(id::MIX2, id::MIX2_ON), level(id::MIX3, id::MIX3_ON)],
            noise: level(id::NOISE, id::NOISE_ON),
            pink: on(id::NOISE_PINK),
            fb: bound(p[id::FEEDBACK], 0., 1.),
            mod_osc: on(id::MOD_OSC),
            mod_filter: on(id::MOD_FILTER),
            kbd3: on(id::OSC3_KBD),
            f_attack: attack_coefficient(bound(p[id::F_ATTACK], 0.001, 20.), srv),
            f_decay: fall(id::F_DECAY),
            f_sustain: bound(p[id::F_SUSTAIN], 0., 1.),
            a_attack: attack_coefficient(bound(p[id::A_ATTACK], 0.001, 20.), srv),
            a_decay: fall(id::A_DECAY),
            a_sustain: bound(p[id::A_SUSTAIN], 0., 1.),
            release,
        };
        self.shapes = [EnvShape::new(&self.shape_p[..SHAPE_PER_ENV], srv), EnvShape::new(&self.shape_p[SHAPE_PER_ENV..], srv)];
        self.dirty = false;
    }

    fn tick(&mut self) {
        if self.dirty {
            self.prepare();
        }
        let s = self.setup;
        let sr = self.sr;
        let srv = s.srv;
        let rate = sr / TICK as f32;
        let p = self.p;
        let fast = smoothing(0.006, rate);
        self.bend += (self.bend_to - self.bend) * fast;
        self.expression_s += (self.expression - self.expression_s) * fast;
        self.modulation_s += (self.modulation - self.modulation_s) * fast;
        self.pressure_s += (self.pressure - self.pressure_s) * smoothing(0.025, rate);
        let glide = bound(p[id::GLIDE], 0., 10.);
        let glide_k = if p[id::GLIDE_ON] >= 0.5 && glide > 0. { smoothing(glide / 3., rate) } else { 1. };
        self.pitch += (self.note - self.pitch) * glide_k;
        let tune = bound(p[id::TUNE], -100., 100.) / 100.;
        let pitch = self.pitch + self.bend + tune;
        let range = |i: usize| RANGE_ST[bound(p[i], 0., 5.).round() as usize];
        let n1 = pitch + range(id::OSC1_RANGE);
        let n2 = pitch + range(id::OSC2_RANGE) + bound(p[id::OSC2_TUNE], -7., 7.);
        let t3 = bound(p[id::OSC3_TUNE], -7., 7.);
        let r3 = bound(p[id::OSC3_RANGE], 0., 5.).round() as usize;
        // free of the keyboard on the low range, oscillator 3 is a modulator of about 0.35–45 Hz
        let (n3, lfo_hz) = if s.kbd3 {
            (pitch + RANGE_ST[r3] + t3, None)
        } else if r3 == 0 {
            (0., Some(4. * exp2(t3 * 0.5)))
        } else {
            (60. + RANGE_ST[r3] + t3, None)
        };
        let notes = [n1, n2, n3];
        let hz = |n: f32| (note_hz(n) / srv).min(0.45);
        let dt = [hz(notes[0]), hz(notes[1]), match lfo_hz { Some(h) => h / srv, None => hz(notes[2]) }];
        let inv = 1. / (TICK * s.os) as f32;
        // the three keyboard-control stages: ⅓ and ⅔ add up to full tracking
        let track = (if p[id::KBD_THIRD] >= 0.5 { 1. / 3. } else { 0. }) + (if p[id::KBD_TWO_THIRDS] >= 0.5 { 2. / 3. } else { 0. });
        let contour = bound(p[id::CONTOUR], 0., 1.);
        let velocity = self.velocity;
        let vel_c = bound(p[id::VEL_CONTOUR], 0., 1.);
        // the 204D's contour amount is 0 to 4 octaves (Moog's specifications)
        let amount = 4. * contour * (1. - vel_c * (1. - velocity));
        let cut = log2(bound(p[id::CUTOFF], 10., 24000.)) + track * (self.pitch - 60.) / 12. + 1.5 * self.brightness - self.soft
            + 3. * bound(p[id::AFTER_FILTER], 0., 1.) * self.pressure_s + amount * self.fenv.value;
        let hzc = exp2(cut);
        let g = warp(hzc, srv);
        let k = feedback(p[id::EMPHASIS]);
        self.k = k * (1. - ((hzc - 0.3 * sr) / (0.15 * sr)).clamp(0., 1.));
        let vol = bound(p[id::VOLUME], 0., 1.);
        let vel_l = bound(p[id::VEL_LEVEL], 0., 1.);
        // the ladder loses passband as emphasis rises; give back part of it
        let gain = vol * vol * self.expression_s * (1. - 0.35 * self.soft) * (1. - vel_l * (1. - velocity)) * (1. + 0.45 * k);
        let mod_amount = (bound(p[id::MOD_AMOUNT], 0., 1.) + self.modulation_s).min(1.);
        self.pm_semis = if s.mod_osc { 12. * mod_amount * mod_amount } else { 0. };
        self.fm_oct = if s.mod_filter { 4. * mod_amount } else { 0. };
        if self.fresh {
            self.fresh = false;
            self.dt = dt;
            self.cut = cut;
            self.g = g;
            self.gain = gain;
        }
        for i in 0..3 {
            self.dt_d[i] = (dt[i] - self.dt[i]) * inv;
        }
        self.cut_d = (cut - self.cut) * inv;
        self.g_d = (g - self.g) * inv;
        self.gain_d = (gain - self.gain) * inv;
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let n = left.len();
        left.fill(0.);
        right.fill(0.);
        if !self.sounding {
            return;
        }
        let mut at = 0;
        while at < n {
            if self.until == 0 {
                self.tick();
                self.until = TICK;
            }
            let m = self.until.min(n - at);
            let s = self.setup;
            let mut buf = [0f32; 2 * TICK];
            let len = m * s.os;
            self.run(&s, &mut buf[..len]);
            if s.os == 2 {
                for j in 0..m {
                    left[at + j] = self.dec.tick(buf[2 * j], buf[2 * j + 1]);
                }
            } else {
                left[at..at + m].copy_from_slice(&buf[..m]);
            }
            for j in 0..m {
                left[at + j] *= self.onset.tick();
                right[at + j] = left[at + j];
            }
            if self.aenv.stage == IDLE {
                self.sounding = false;
                self.gate = false;
                self.fenv = Adsr::ZERO;
                self.out = 0.;
                break;
            }
            at += m;
            self.until -= m;
        }
    }

    #[inline(always)]
    fn run(&mut self, s: &Setup, out: &mut [f32]) {
        let drive = 0.6 + 2.5 * bound(self.p[id::DRIVE], 0., 1.);
        let (fa, fd, fr) = (s.f_attack, s.f_decay, s.release[0]);
        let (aa, ad, ar) = (s.a_attack, s.a_decay, s.release[1]);
        let (rf, ra) = (self.shapes[1].rates(fa, fd, fr, false), self.shapes[0].rates(aa, ad, ar, false));
        let audio_cut = s.mod_filter && self.fm_oct != 0.;
        let pm = self.pm_semis != 0.;
        let mod_mix = bound(self.p[id::MOD_MIX], 0., 1.);
        for o in out.iter_mut() {
            for i in 0..3 {
                self.dt[i] += self.dt_d[i];
            }
            self.cut += self.cut_d;
            self.g += self.g_d;
            self.gain += self.gain_d;
            // oscillator 3 first: it is the modulator
            let (o3, _) = self.osc[2].step(self.dt[2], s.pw[2], &s.w[2], 0.);
            let white = self.rng.next();
            let noise = if s.pink {
                self.pink[0] = 0.99765 * self.pink[0] + white * 0.099_046;
                self.pink[1] = 0.963 * self.pink[1] + white * 0.296_516_4;
                self.pink[2] = 0.57 * self.pink[2] + white * 1.052_691_3;
                0.25 * (self.pink[0] + self.pink[1] + self.pink[2] + white * 0.1848)
            } else {
                white
            };
            let m = (1. - mod_mix) * o3 + mod_mix * noise;
            let bend = if pm { exp2(self.pm_semis * m / 12.) } else { 1. };
            let (o1, _) = self.osc[0].step((self.dt[0] * bend).min(0.45), s.pw[0], &s.w[0], 0.);
            let (o2, _) = self.osc[1].step((self.dt[1] * bend).min(0.45), s.pw[1], &s.w[1], 0.);
            let mixed = s.mix[0] * o1 + s.mix[1] * o2 + s.mix[2] * o3 + s.noise * noise + s.fb * self.out;
            // hot mixer levels overload the filter input: asymmetric soft clip
            let driven = mixed * drive;
            let x = 0.5 * (soft(driven + 0.12) - soft(0.12));
            let g = if audio_cut { warp(exp2(self.cut + self.fm_oct * m), s.srv) } else { self.g };
            let y = self.ladder.tick(x + 1e-5 * white, g, self.k);
            self.fenv.run(&self.shapes[1], &rf, fa, fd, s.f_sustain, fr, false);
            let e = self.aenv.run(&self.shapes[0], &ra, aa, ad, s.a_sustain, ar, false);
            let v = y * e * self.gain;
            self.out = 0.7 * self.out + 0.3 * v;
            *o = v;
        }
    }
}
