//! A wavetable synthesizer of our own design. Four editable single-cycle waves (2048 samples each, written by the
//! host through the shared wave buffer) are mixed by a joystick in the Prophet VS manner (A left, B top, C right,
//! D bottom, bilinear in the diamond's own axes). Each wave is band-limited into half-octave table levels at commit time
//! so a note reads the richest table that does not alias. Per voice: up to seven unison oscillators (detune and
//! stereo spread) → a stereo filter (24 dB ladder, or a 12 dB state-variable low-pass, band-pass or high-pass) → the
//! amplifier. Three ADSRs (filter, amplifier and a "vector" envelope that moves the joystick) and two LFOs that reach
//! pitch, cutoff, the joystick axes and the amplitude.
//! The oscillator, unison, filter and envelope behaviour is checked against Surge XT (docs/WAVETABLE.md).
use crate::alloc::{choose, Slot};
use crate::dsp::*;

pub const VOICES: usize = 8;
pub const PARAMS: usize = 52;
pub const SLOTS: usize = 4;
pub const CYCLE: usize = 2048;
/// Half-octave table levels: 1024, 724, 512, ... 1 harmonic.
const LEVELS: usize = 21;
const UNI: usize = 7;
const TICK: usize = 16;

#[allow(dead_code)]
pub mod id {
    pub const JOY_X: usize = 0;
    pub const JOY_Y: usize = 1;
    pub const COARSE: usize = 2; // 4 slots
    pub const FINE: usize = 6; // 4 slots
    pub const UNI_VOICES: usize = 10;
    pub const UNI_DETUNE: usize = 11;
    pub const UNI_SPREAD: usize = 12;
    pub const GLIDE: usize = 13;
    pub const F_TYPE: usize = 14;
    pub const CUTOFF: usize = 15;
    pub const RES: usize = 16;
    pub const F_ENV: usize = 17;
    pub const KEY_FOLLOW: usize = 18;
    pub const DRIVE: usize = 19;
    pub const F_ATTACK: usize = 20;
    pub const F_DECAY: usize = 21;
    pub const F_SUSTAIN: usize = 22;
    pub const F_RELEASE: usize = 23;
    pub const A_ATTACK: usize = 24;
    pub const A_DECAY: usize = 25;
    pub const A_SUSTAIN: usize = 26;
    pub const A_RELEASE: usize = 27;
    pub const V_ATTACK: usize = 28;
    pub const V_DECAY: usize = 29;
    pub const V_SUSTAIN: usize = 30;
    pub const V_RELEASE: usize = 31;
    pub const V_X: usize = 32;
    pub const V_Y: usize = 33;
    /// Two LFOs of seven from here: rate, shape, then depths to pitch, cutoff, joystick X, joystick Y and amplitude.
    pub const LFO1: usize = 34;
    pub const LFO2: usize = 41;
    pub const VEL_AMP: usize = 48;
    pub const VEL_FILTER: usize = 49;
    pub const VOLUME: usize = 50;
}

const DEFAULTS: [(usize, f32); 24] = [
    (id::JOY_X, 1.), (id::UNI_VOICES, 1.), (id::UNI_DETUNE, 20.), (id::UNI_SPREAD, 0.5), (id::CUTOFF, 12000.), (id::RES, 0.1),
    (id::KEY_FOLLOW, 0.5), (id::F_ATTACK, 0.005), (id::F_DECAY, 0.5), (id::F_SUSTAIN, 0.5), (id::A_ATTACK, 0.005),
    (id::A_DECAY, 0.3), (id::A_SUSTAIN, 0.8), (id::A_RELEASE, 0.3), (id::LFO1, 5.), (id::LFO2, 0.5), (id::VOLUME, 0.6),
    (id::F_RELEASE, 0.3), (id::V_ATTACK, 0.1), (id::V_DECAY, 0.5), (id::V_SUSTAIN, 0.5), (id::V_RELEASE, 0.3), (id::VEL_AMP, 0.4),
    (id::VEL_FILTER, 0.2),
];

// ---- the tables ---------------------------------------------------------------------------------------------------

static mut MIP: [f32; SLOTS * LEVELS * CYCLE] = [0.; SLOTS * LEVELS * CYCLE];
static mut HARM: [usize; LEVELS] = [0; LEVELS];
static mut HASH: [u32; SLOTS] = [0; SLOTS];
static mut READY: bool = false;
static mut FRE: [f64; CYCLE] = [0.; CYCLE];
static mut FIM: [f64; CYCLE] = [0.; CYCLE];
static mut SRE: [f64; CYCLE] = [0.; CYCLE];
static mut SIM: [f64; CYCLE] = [0.; CYCLE];
static mut TWC: [f64; CYCLE / 2] = [0.; CYCLE / 2];
static mut TWS: [f64; CYCLE / 2] = [0.; CYCLE / 2];

/// In-place radix-2 FFT of FRE / FIM (the inverse is unscaled; the caller divides by CYCLE).
unsafe fn fft(inverse: bool) {
    let n = CYCLE;
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            FRE.swap(i, j);
            FIM.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let step = n / len;
        for start in (0..n).step_by(len) {
            for k in 0..len / 2 {
                let (c, s) = (TWC[k * step], if inverse { TWS[k * step] } else { -TWS[k * step] });
                let (a, b) = (start + k, start + k + len / 2);
                let (tr, ti) = (FRE[b] * c - FIM[b] * s, FRE[b] * s + FIM[b] * c);
                FRE[b] = FRE[a] - tr;
                FIM[b] = FIM[a] - ti;
                FRE[a] += tr;
                FIM[a] += ti;
            }
        }
        len <<= 1;
    }
}

/// Where the host writes the four waves (2048 samples each, about ±1). The buffer is the one the vector synthesizer
/// uses; only one model runs per kernel instance.
fn raw() -> &'static mut [f32] {
    unsafe { core::slice::from_raw_parts_mut(crate::vs::wave_ptr(), SLOTS * CYCLE) }
}

/// The classic starting set: sine, triangle, saw, square.
fn default_waves() {
    let w = raw();
    for n in 0..CYCLE {
        let t = n as f64 / CYCLE as f64;
        w[n] = (t * core::f64::consts::TAU).sin() as f32;
        w[CYCLE + n] = (1. - 4. * (t - 0.5).abs()) as f32;
        w[2 * CYCLE + n] = (2. * t - 1.) as f32;
        w[3 * CYCLE + n] = if t < 0.5 { 1. } else { -1. };
    }
}

/// Builds the band-limited tables of every wave that changed since the last commit: remove the DC, scale to a peak of 1,
/// then keep the harmonics each level allows. A few milliseconds per wave.
pub fn commit() {
    unsafe {
        for k in 0..CYCLE / 2 {
            let a = core::f64::consts::TAU * k as f64 / CYCLE as f64;
            TWC[k] = a.cos();
            TWS[k] = a.sin();
        }
        for l in 0..LEVELS {
            HARM[l] = ((1024. * 0.5f64.powf(l as f64 / 2.)).round() as usize).max(1);
        }
        let w = raw();
        for s in 0..SLOTS {
            let src = &w[s * CYCLE..(s + 1) * CYCLE];
            let mut h = 0x811c_9dc5u32;
            for &x in src {
                h = (h ^ x.to_bits()).wrapping_mul(0x0100_0193);
            }
            if h == HASH[s] && READY {
                continue;
            }
            HASH[s] = h;
            let mean = src.iter().map(|&x| x as f64).sum::<f64>() / CYCLE as f64;
            let peak = src.iter().map(|&x| (x as f64 - mean).abs()).fold(0f64, f64::max);
            let scale = if peak > 1e-6 { 1. / peak } else { 0. };
            for n in 0..CYCLE {
                FRE[n] = (src[n] as f64 - mean) * scale;
                FIM[n] = 0.;
            }
            fft(false);
            SRE.copy_from_slice(&FRE);
            SIM.copy_from_slice(&FIM);
            for l in 0..LEVELS {
                for n in 0..CYCLE {
                    FRE[n] = 0.;
                    FIM[n] = 0.;
                }
                for k in 1..=HARM[l].min(CYCLE / 2 - 1) {
                    FRE[k] = SRE[k];
                    FIM[k] = SIM[k];
                    FRE[CYCLE - k] = SRE[k];
                    FIM[CYCLE - k] = -SIM[k];
                }
                fft(true);
                let base = (s * LEVELS + l) * CYCLE;
                for n in 0..CYCLE {
                    MIP[base + n] = (FRE[n] / CYCLE as f64) as f32;
                }
            }
        }
        READY = true;
    }
}

/// The richest level whose harmonics all stay below the Nyquist at this phase increment.
#[inline]
fn level_for(dt: f32) -> usize {
    let allowed = (0.5 / dt.max(1e-6)) as usize;
    unsafe {
        for l in 0..LEVELS {
            if HARM[l] <= allowed {
                return l;
            }
        }
    }
    LEVELS - 1
}

/// Four-point cubic (Catmull-Rom) read of one table at a phase in turns.
#[inline(always)]
fn read(slot: usize, level: usize, phase: f32) -> f32 {
    let f = phase * CYCLE as f32;
    let i = f as usize;
    let t = f - i as f32;
    let m = CYCLE - 1;
    unsafe {
        let b = (slot * LEVELS + level) * CYCLE;
        let y0 = MIP[b + (i.wrapping_sub(1) & m)];
        let y1 = MIP[b + (i & m)];
        let y2 = MIP[b + ((i + 1) & m)];
        let y3 = MIP[b + ((i + 2) & m)];
        let c1 = 0.5 * (y2 - y0);
        let c2 = y0 - 2.5 * y1 + 2. * y2 - 0.5 * y3;
        let c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
        ((c3 * t + c2) * t + c1) * t + y1
    }
}

/// Joystick (−1…1 on both axes, y up) → weights of waves A (left), B (top), C (right), D (bottom): bilinear in the
/// diamond's own 45° axes, so a corner gives one wave and an edge two. The weights always sum to 1.
pub fn mix_weights(x: f32, y: f32) -> [f32; 4] {
    let s = (x + y).clamp(-1., 1.);
    let t = (x - y).clamp(-1., 1.);
    [(1. - s) * (1. - t) * 0.25, (1. + s) * (1. - t) * 0.25, (1. + s) * (1. + t) * 0.25, (1. - s) * (1. + t) * 0.25]
}

// ---- the synthesizer ----------------------------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Setup {
    uni: usize,
    detune: [f32; UNI],
    pan: [(f32, f32); UNI],
    coarse: [f32; SLOTS],
    ftype: u32,
    drive: f32,
    glide_k: f32,
    /// amplifier coefficients at the sample rate; filter and vector at the control rate
    amp: [f32; 4],
    fil: [f32; 4],
    vec: [f32; 4],
    lfo_turns: [f32; 2],
    lfo_shape: [u32; 2],
}

#[derive(Clone, Copy)]
struct Voice {
    active: bool,
    down: bool,
    held: bool,
    fresh: bool,
    key: u32,
    note: f32,
    pitch: f32,
    velocity: f32,
    stamp: u32,
    ph: [[f32; SLOTS]; UNI],
    dt: [[f32; SLOTS]; UNI],
    dt_d: [[f32; SLOTS]; UNI],
    level: [[u8; SLOTS]; UNI],
    w: [f32; SLOTS],
    w_d: [f32; SLOTS],
    amp: Adsr,
    fenv: Adsr,
    venv: Adsr,
    lfo1: Lfo,
    lfo2: Lfo,
    ladder: [Ladder; 2],
    svf: [Svf; 2],
    g: f32,
    g_d: f32,
    k: f32,
    kd: f32,
    gain: f32,
    gain_d: f32,
    onset: Onset,
}
impl Voice {
    const ZERO: Self = Self {
        active: false, down: false, held: false, fresh: true, key: 0, note: 60., pitch: 60., velocity: 0., stamp: 0,
        ph: [[0.; SLOTS]; UNI], dt: [[0.; SLOTS]; UNI], dt_d: [[0.; SLOTS]; UNI], level: [[0; SLOTS]; UNI], w: [0.; SLOTS],
        w_d: [0.; SLOTS], amp: Adsr::ZERO, fenv: Adsr::ZERO, venv: Adsr::ZERO, lfo1: Lfo::new(0x2f6b_4a31),
        lfo2: Lfo::new(0x1c9d_7e55), ladder: [Ladder::ZERO; 2], svf: [Svf::ZERO; 2], g: 0., g_d: 0., k: 0., kd: 2., gain: 0.,
        gain_d: 0., onset: Onset::DONE,
    };
}

pub struct Wt {
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    setup: Setup,
    voices: [Voice; VOICES],
    stamp: u32,
    until: usize,
    bend: f32,
    bend_to: f32,
    pressure: f32,
    pressure_s: f32,
    modulation: f32,
    modulation_s: f32,
    expression: f32,
    expression_s: f32,
    pedal: bool,
    pub steals: u32,
}

impl Wt {
    pub const fn new() -> Self {
        Self {
            sr: 48000., p: [0.; PARAMS], dirty: true,
            setup: Setup {
                uni: 1, detune: [0.; UNI], pan: [(1., 1.); UNI], coarse: [0.; SLOTS], ftype: 0, drive: 0., glide_k: 1.,
                amp: [1.; 4], fil: [1.; 4], vec: [1.; 4], lfo_turns: [0.; 2], lfo_shape: [0; 2],
            },
            voices: [Voice::ZERO; VOICES], stamp: 0, until: 0, bend: 0., bend_to: 0., pressure: 0., pressure_s: 0., modulation: 0.,
            modulation_s: 0., expression: 1., expression_s: 1., pedal: false, steals: 0,
        }
    }

    pub fn init(&mut self, sr: f32) {
        self.sr = sr;
        self.dirty = true;
        self.p = [0.; PARAMS];
        self.voices = [Voice::ZERO; VOICES];
        self.stamp = 0;
        self.until = 0;
        self.bend = 0.;
        self.bend_to = 0.;
        self.pressure = 0.;
        self.pressure_s = 0.;
        self.modulation = 0.;
        self.modulation_s = 0.;
        self.expression = 1.;
        self.expression_s = 1.;
        self.pedal = false;
        self.steals = 0;
        for (i, v) in DEFAULTS.iter() {
            self.p[*i] = *v;
        }
        default_waves();
        unsafe {
            READY = false;
        }
        commit();
    }

    pub fn set(&mut self, i: usize, value: f32) {
        if i < PARAMS && value.is_finite() {
            self.p[i] = value;
            self.dirty = true;
        }
    }

    pub fn active(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    fn start(&mut self, index: usize, key: u32, note: f32, velocity: f32, retrigger: bool) {
        self.stamp = self.stamp.wrapping_add(1);
        let glide = self.p[id::GLIDE] > 0.;
        let v = &mut self.voices[index];
        if !v.active {
            v.fresh = true;
            v.ladder = [Ladder::ZERO; 2];
            v.svf = [Svf::ZERO; 2];
            for u in 0..UNI {
                // spread the unison start phases so they do not begin as one pulse
                let ph = (u as f32 * 0.618_034).fract();
                v.ph[u] = [ph; SLOTS];
            }
            v.lfo1.phase = 0.;
            v.lfo2.phase = 0.;
            if !glide {
                v.pitch = note;
            }
            v.onset.arm();
        }
        v.key = key;
        v.note = note;
        v.velocity = velocity;
        v.down = true;
        v.held = false;
        v.stamp = self.stamp;
        if retrigger || !v.active {
            v.amp.attack();
            v.fenv.attack();
            v.venv.attack();
        }
        v.active = true;
    }

    fn release(v: &mut Voice) {
        v.down = false;
        v.held = false;
        v.amp.release();
        v.fenv.release();
        v.venv.release();
    }

    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        if !note.is_finite() {
            return;
        }
        if self.dirty {
            self.prepare();
        }
        let note = note.clamp(0., 127.);
        let velocity = bound(velocity, 0., 1.);
        let mut slots = [Slot { active: false, down: false, held: false, note: 0., stamp: 0, level: 0. }; VOICES];
        for (slot, v) in slots.iter_mut().zip(self.voices.iter()) {
            *slot = Slot { active: v.active, down: v.down, held: v.held, note: v.note, stamp: v.stamp, level: v.amp.value };
        }
        let index = choose(&slots, note);
        if self.voices[index].active && self.voices[index].down && self.voices[index].note != note {
            self.steals += 1;
            self.voices[index].active = false;
        }
        self.start(index, key, note, velocity, true);
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
            v.amp = Adsr::ZERO;
            v.fenv = Adsr::ZERO;
            v.venv = Adsr::ZERO;
            v.ladder = [Ladder::ZERO; 2];
            v.svf = [Svf::ZERO; 2];
        }
        self.pedal = false;
    }

    fn prepare(&mut self) {
        self.dirty = false;
        let p = &self.p;
        let sr = self.sr;
        let rate = sr / TICK as f32;
        let uni = bound(p[id::UNI_VOICES], 1., UNI as f32).round() as usize;
        let detune_ct = bound(p[id::UNI_DETUNE], 0., 100.);
        let spread = bound(p[id::UNI_SPREAD], 0., 1.);
        let mut detune = [0f32; UNI];
        let mut pans = [(1f32, 1f32); UNI];
        for u in 0..uni {
            let x = if uni > 1 { 2. * u as f32 / (uni - 1) as f32 - 1. } else { 0. };
            detune[u] = x * detune_ct;
            // alternate sides so that the outer voices are not all at one edge
            let side = if u % 2 == 0 { 1. } else { -1. };
            let width = if uni > 1 { (u as f32 / (uni - 1) as f32 * 2. - 1.).abs().max(0.35) } else { 0. };
            pans[u] = pan(side * width * spread);
        }
        let mut coarse = [0f32; SLOTS];
        for k in 0..SLOTS {
            coarse[k] = bound(p[id::COARSE + k], -48., 48.) + bound(p[id::FINE + k], -100., 100.) / 100.;
        }
        let env = |a: usize, r: f32| {
            [
                attack_coefficient(bound(p[a], 0.001, 30.), r),
                fall_coefficient(bound(p[a + 1], 0.002, 60.), r),
                bound(p[a + 2], 0., 1.),
                fall_coefficient(bound(p[a + 3], 0.002, 60.), r),
            ]
        };
        let lfo = |b: usize| (bound(p[b], 0.02, 60.) / rate, bound(p[b + 1], 0., 5.).round() as u32);
        let (t1, s1) = lfo(id::LFO1);
        let (t2, s2) = lfo(id::LFO2);
        let glide = bound(p[id::GLIDE], 0., 10.);
        self.setup = Setup {
            uni,
            detune,
            pan: pans,
            coarse,
            ftype: bound(p[id::F_TYPE], 0., 3.).round() as u32,
            drive: bound(p[id::DRIVE], 0., 1.),
            glide_k: if glide > 0. { smoothing(glide / 3., rate) } else { 1. },
            amp: env(id::A_ATTACK, sr),
            fil: env(id::F_ATTACK, rate),
            vec: env(id::V_ATTACK, rate),
            lfo_turns: [t1, t2],
            lfo_shape: [[LFO_SINE, LFO_TRIANGLE, LFO_SAW_UP, LFO_SAW_DOWN, LFO_SQUARE, LFO_SAMPLE_HOLD][s1 as usize], [LFO_SINE, LFO_TRIANGLE, LFO_SAW_UP, LFO_SAW_DOWN, LFO_SQUARE, LFO_SAMPLE_HOLD][s2 as usize]],
        };
    }

    /// The control-rate update: envelopes, LFOs, joystick, pitches, filter and gain targets for the next block.
    fn tick(&mut self) {
        if self.dirty {
            self.prepare();
        }
        let s = self.setup;
        let p = self.p;
        let sr = self.sr;
        self.bend += (self.bend_to - self.bend) * 0.2;
        self.pressure_s += (self.pressure - self.pressure_s) * 0.05;
        self.modulation_s += (self.modulation - self.modulation_s) * 0.05;
        self.expression_s += (self.expression - self.expression_s) * 0.05;
        let (bend, pressure, modulation) = (self.bend, self.pressure_s, self.modulation_s);
        let inv = 1. / TICK as f32;
        let master = bound(p[id::VOLUME], 0., 1.);
        let master = master * master * self.expression_s * 0.5 / (s.uni as f32).sqrt();
        let (vel_a, vel_f) = (bound(p[id::VEL_AMP], 0., 1.), bound(p[id::VEL_FILTER], 0., 1.));
        let ftype = s.ftype;
        for v in self.voices.iter_mut().filter(|v| v.active) {
            if s.glide_k < 1. {
                v.pitch += (v.note - v.pitch) * s.glide_k;
            } else {
                v.pitch = v.note;
            }
            let fe = v.fenv.tick(s.fil[0], s.fil[1], s.fil[2], s.fil[3]);
            let ve = v.venv.tick(s.vec[0], s.vec[1], s.vec[2], s.vec[3]);
            let l1 = v.lfo1.step(s.lfo_turns[0], s.lfo_shape[0]);
            let l2 = v.lfo2.step(s.lfo_turns[1], s.lfo_shape[1]);
            // joystick
            let x = (p[id::JOY_X] + p[id::V_X] * ve + p[id::LFO1 + 4] * l1 + p[id::LFO2 + 4] * l2).clamp(-1., 1.);
            let y = (p[id::JOY_Y] + p[id::V_Y] * ve + p[id::LFO1 + 5] * l1 + p[id::LFO2 + 5] * l2).clamp(-1., 1.);
            let w = mix_weights(x, y);
            // pitch: LFO vibrato (the mod wheel deepens LFO 1), bend, per-wave coarse and fine, then the unison spread
            let cents = (p[id::LFO1 + 2] + 50. * modulation) * l1 + p[id::LFO2 + 2] * l2;
            let base = v.pitch + bend + cents / 100.;
            for u in 0..s.uni {
                for k in 0..SLOTS {
                    let hz = note_hz(base + s.coarse[k] + s.detune[u] / 100.);
                    let dt = (hz / sr).min(0.45);
                    v.level[u][k] = level_for(dt) as u8;
                    if v.fresh {
                        v.dt[u][k] = dt;
                        v.dt_d[u][k] = 0.;
                    } else {
                        v.dt_d[u][k] = (dt - v.dt[u][k]) * inv;
                    }
                }
            }
            // filter
            let oct = log2(bound(p[id::CUTOFF], 20., 20000.))
                + 8. * bound(p[id::F_ENV], -1., 1.) * fe
                + bound(p[id::KEY_FOLLOW], 0., 1.) * (v.pitch - 60.) / 12.
                + 4. * (p[id::LFO1 + 3] * l1 + p[id::LFO2 + 3] * l2)
                + 3. * vel_f * (v.velocity - 0.5)
                + 2. * pressure;
            let hz = exp2(oct);
            let g = warp(hz, sr);
            let res = bound(p[id::RES], 0., 1.);
            v.k = ladder_feedback(res) * (1. - ((hz - 0.3 * sr) / (0.15 * sr)).clamp(0., 1.));
            v.kd = damping(res);
            // amplitude: velocity, LFO tremolo
            let trem = (1. + p[id::LFO1 + 6] * l1 + p[id::LFO2 + 6] * l2).max(0.);
            let gain = master * (1. - vel_a * (1. - v.velocity)) * trem;
            if v.fresh {
                v.fresh = false;
                v.w = w;
                v.w_d = [0.; SLOTS];
                v.g = g;
                v.g_d = 0.;
                v.gain = gain;
                v.gain_d = 0.;
            } else {
                for k in 0..SLOTS {
                    v.w_d[k] = (w[k] - v.w[k]) * inv;
                }
                v.g_d = (g - v.g) * inv;
                v.gain_d = (gain - v.gain) * inv;
            }
        }
        let _ = ftype;
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let n = left.len();
        left.fill(0.);
        right.fill(0.);
        if unsafe { !READY } {
            commit();
        }
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
                if v.amp.stage == IDLE && !v.down && !v.held {
                    v.active = false;
                }
            }
            at += m;
            self.until -= m;
        }
    }
}

#[inline(always)]
fn render_voice(v: &mut Voice, s: &Setup, left: &mut [f32], right: &mut [f32]) {
    // the drive stage clips a scaled copy of the signal so it is linear (unity) with the drive at zero
    let pre = 0.3 * (1. + 9. * s.drive);
    let post = 1. / (0.3 * (1. + 9. * s.drive).sqrt());
    for i in 0..left.len() {
        for u in 0..s.uni {
            for k in 0..SLOTS {
                v.dt[u][k] += v.dt_d[u][k];
            }
        }
        for k in 0..SLOTS {
            v.w[k] += v.w_d[k];
        }
        v.g += v.g_d;
        v.gain += v.gain_d;
        let a = v.amp.tick(s.amp[0], s.amp[1], s.amp[2], s.amp[3]);
        let (mut l, mut r) = (0f32, 0f32);
        for u in 0..s.uni {
            let mut x = 0.;
            for k in 0..SLOTS {
                let mut ph = v.ph[u][k] + v.dt[u][k];
                if ph >= 1. {
                    ph -= 1.;
                }
                v.ph[u][k] = ph;
                if v.w[k] > 1e-5 {
                    x += v.w[k] * read(k, v.level[u][k] as usize, ph);
                }
            }
            l += x * s.pan[u].0;
            r += x * s.pan[u].1;
        }
        // the filters' input stage saturates (the ladder's does by design), so they get an eighth-scale signal (their saturation then aliases less than -70 dB even on the top octave) and the gain is
        // restored after them: clean at normal levels, saturating when the drive control asks for it
        let (xl, xr) = if s.drive > 0.001 { (0.125 * soft(l * pre) * post, 0.125 * soft(r * pre) * post) } else { (0.125 * l, 0.125 * r) };
        let (yl, yr) = match s.ftype {
            0 => (v.ladder[0].tick(xl, v.g, v.k), v.ladder[1].tick(xr, v.g, v.k)),
            1 => (v.svf[0].tick(xl, v.g, v.kd).0, v.svf[1].tick(xr, v.g, v.kd).0),
            2 => {
                let (lpl, hpl) = v.svf[0].tick(xl, v.g, v.kd);
                let (lpr, hpr) = v.svf[1].tick(xr, v.g, v.kd);
                (xl - lpl - hpl, xr - lpr - hpr)
            }
            _ => (v.svf[0].tick(xl, v.g, v.kd).1, v.svf[1].tick(xr, v.g, v.kd).1),
        };
        let o = 8. * a * v.gain * v.onset.tick();
        left[i] += yl * o;
        right[i] += yr * o;
    }
}
