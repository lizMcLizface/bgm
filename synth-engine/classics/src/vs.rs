//! A Prophet-VS-inspired vector synthesizer. Per voice (eight of them) four oscillators
//! play single-cycle waves of 128 samples; a joystick position mixes them in a diamond
//! (A left, B top, C right, D bottom) by bilinear weights in 45°-rotated coordinates (fitted
//! to the manual's test points), moved over time by a five-point mix envelope with loop and
//! repeat → a resonant 4-pole low-pass → an amplifier. Five-point envelopes (filter and
//! amplifier too) run their rates and levels with forward and back-and-forth loops. Two LFOs,
//! and a modulation matrix of six sources (LFO 1/2, pressure, velocity, keyboard, filter
//! envelope, mod wheel) onto frequencies, filter, mix axes, LFO rates and depths, volume and
//! pan. Each voice has its own pan; unison stacks the voices on one key; glide.
//! The host loads the 128 waves into a shared buffer (`wave_ptr`) and calls `commit`, which
//! builds band-limited copies (a table per octave of harmonics) so the waves do not alias;
//! the `raw` switch reads the original 128 samples directly, with the original's aliasing.
//! An original interpretation, not a circuit model; units are estimates.
use crate::alloc::{choose, KeyStack, Slot};
use crate::dsp::*;

pub const VOICES: usize = 8;
pub const PARAMS: usize = 96;
pub const WAVES: usize = 128;
pub const CYCLE: usize = 128;
/// Band-limited table levels, half an octave of harmonic count apart: 63, 45, 32, 22, 16, 11, 8, 6, 4, 3, 2, 1.
const LEVELS: usize = 12;
const TABLE: usize = 512;
const TICK: usize = 16;

pub mod id {
    pub const WAVE_A: usize = 0;
    pub const COARSE_A: usize = 4;
    pub const FINE_A: usize = 8;
    pub const CUTOFF: usize = 12;
    pub const RESONANCE: usize = 13;
    pub const FILTER_ENV_AMOUNT: usize = 14;
    pub const LFO1_SHAPE: usize = 15;
    pub const LFO2_SHAPE: usize = 16;
    pub const LFO1_RATE: usize = 17;
    pub const LFO2_RATE: usize = 18;
    pub const LFO1_AMOUNT: usize = 19;
    pub const LFO2_AMOUNT: usize = 20;
    pub const AMP_RATE1: usize = 21;
    pub const AMP_LEVEL0: usize = 26;
    pub const AMP_LOOP: usize = 30;
    pub const AMP_REPEAT: usize = 31;
    pub const FILTER_RATE1: usize = 32;
    pub const FILTER_LEVEL0: usize = 37;
    pub const FILTER_LOOP: usize = 42;
    pub const FILTER_REPEAT: usize = 43;
    pub const MIX_RATE1: usize = 44;
    pub const MIX_X0: usize = 49;
    pub const MIX_Y0: usize = 54;
    pub const MIX_LOOP: usize = 59;
    pub const MIX_REPEAT: usize = 60;
    pub const PRESSURE_AMOUNT: usize = 61;
    pub const VELOCITY_AMOUNT: usize = 62;
    pub const KEYBOARD_AMOUNT: usize = 63;
    pub const FILTER_ENV_MOD_AMOUNT: usize = 64;
    pub const LFO1_DEST: usize = 65;
    pub const LFO2_DEST: usize = 66;
    pub const PRESSURE_DEST: usize = 67;
    pub const VELOCITY_DEST: usize = 68;
    pub const KEYBOARD_DEST: usize = 69;
    pub const FILTER_ENV_DEST: usize = 70;
    pub const MOD_WHEEL_DEST: usize = 71;
    pub const UNISON: usize = 72;
    pub const GLIDE: usize = 73;
    pub const VOLUME: usize = 74;
    pub const PAN0: usize = 75;
    pub const RAW: usize = 83;
    pub const JOY_X: usize = 84;
    pub const JOY_Y: usize = 85;
    pub const TUNE: usize = 86;
}

// ---------------------------------------------------------------- waves

static mut WAVE_RAW: [f32; WAVES * CYCLE] = [0.; WAVES * CYCLE];
static mut MIP: [f32; WAVES * LEVELS * TABLE] = [0.; WAVES * LEVELS * TABLE];
static mut SIN_TABLE: [f32; TABLE] = [0.; TABLE];
static mut BUILT: [bool; WAVES] = [false; WAVES];
static mut HASH: [u32; WAVES] = [0; WAVES];
static mut READY: bool = false;

/// Where the host writes the 128 waves (user 0–31, ROM 32–127), 128 samples each, about ±1.
pub fn wave_ptr() -> *mut f32 {
    unsafe { WAVE_RAW.as_mut_ptr() }
}

/// The harmonics a table level keeps.
fn level_harmonics(level: usize) -> usize {
    ((63. * exp2(-(level as f32) / 2.)).round() as usize).clamp(1, 63)
}

/// Notes that the host has written the waves. Only the waves that changed are rebuilt, and only
/// when a voice first needs them (`ensure`), so a commit itself is cheap.
pub fn commit() {
    unsafe {
        for (i, s) in SIN_TABLE.iter_mut().enumerate() {
            *s = (i as f64 * core::f64::consts::TAU / TABLE as f64).sin() as f32;
        }
        for w in 0..WAVES {
            let mut h = 0x811c_9dc5u32;
            for &x in &WAVE_RAW[w * CYCLE..(w + 1) * CYCLE] {
                h = (h ^ x.to_bits()).wrapping_mul(0x0100_0193);
            }
            if h != HASH[w] || !READY {
                HASH[w] = h;
                BUILT[w] = false;
            }
        }
        READY = true;
    }
}

/// Builds one wave's band-limited tables if they are not built yet.
fn ensure(w: usize) {
    unsafe {
        if BUILT[w] {
            return;
        }
        let src = &WAVE_RAW[w * CYCLE..(w + 1) * CYCLE];
        // harmonics 1..=63 of the 128-sample cycle
        let mut a = [0f32; 64];
        let mut b = [0f32; 64];
        for h in 1..64 {
            let (mut re, mut im) = (0f32, 0f32);
            for (n, &x) in src.iter().enumerate() {
                let idx = (h * n * (TABLE / CYCLE)) & (TABLE - 1);
                re += x * SIN_TABLE[(idx + TABLE / 4) & (TABLE - 1)];
                im += x * SIN_TABLE[idx];
            }
            a[h] = re * (2. / CYCLE as f32);
            b[h] = im * (2. / CYCLE as f32);
        }
        for l in 0..LEVELS {
            let top = level_harmonics(l);
            let out = &mut MIP[(w * LEVELS + l) * TABLE..(w * LEVELS + l + 1) * TABLE];
            for (i, o) in out.iter_mut().enumerate() {
                let mut v = 0f32;
                for h in 1..=top {
                    let idx = (h * i) & (TABLE - 1);
                    v += a[h] * SIN_TABLE[(idx + TABLE / 4) & (TABLE - 1)] + b[h] * SIN_TABLE[idx];
                }
                *o = v;
            }
        }
        BUILT[w] = true;
    }
}

#[inline(always)]
fn read_mip(wave: usize, level: usize, phase: f32) -> f32 {
    unsafe {
        let t = &MIP[(wave * LEVELS + level) * TABLE..(wave * LEVELS + level + 1) * TABLE];
        let x = phase * TABLE as f32;
        let i = x as usize;
        let f = x - i as f32;
        let (i0, i1) = (i & (TABLE - 1), (i + 1) & (TABLE - 1));
        t[i0] + (t[i1] - t[i0]) * f
    }
}

/// The original 128 samples, as the hardware reads them: linear between samples, or not at all.
#[inline(always)]
fn read_raw(wave: usize, phase: f32, nearest: bool) -> f32 {
    unsafe {
        let t = &WAVE_RAW[wave * CYCLE..(wave + 1) * CYCLE];
        let x = phase * CYCLE as f32;
        let i = x as usize;
        if nearest {
            return t[i & (CYCLE - 1)];
        }
        let f = x - i as f32;
        let (i0, i1) = (i & (CYCLE - 1), (i + 1) & (CYCLE - 1));
        t[i0] + (t[i1] - t[i0]) * f
    }
}

// ---------------------------------------------------------------- envelopes

/// The envelope's rate (0–99; 0 is the fastest, as the factory programs show) → seconds for a full-range travel: 1.5 ms … 30 s. An estimate.
fn rate_seconds(rate: f32) -> f32 {
    0.0015 * exp2(14.288 * bound(rate, 0., 99.) / 99.)
}

/// An envelope definition: five points (levels, or X/Y positions) with four rates.
#[derive(Clone, Copy)]
struct EnvDef<const C: usize> {
    p: [[f32; C]; 5],
    secs: [f32; 4],
    loop_mode: u32,
    repeat: u32,
    /// full-range distance in point units (so a segment's time scales with how far it goes)
    scale: f32,
}
impl<const C: usize> EnvDef<C> {
    const ZERO: Self = Self { p: [[0.; C]; 5], secs: [0.01; 4], loop_mode: 0, repeat: 0, scale: 1. };
    fn start_point(&self) -> usize {
        match self.loop_mode {
            1..=3 => self.loop_mode as usize - 1,
            4..=6 => self.loop_mode as usize - 4,
            _ => 0,
        }
    }
}

const ATTACK: u8 = 0;
const HOLD: u8 = 1;
const RELEASE_STAGE: u8 = 2;
const DONE: u8 = 3;

#[derive(Clone, Copy)]
struct EnvState<const C: usize> {
    stage: u8,
    seg: usize,
    dir: i32,
    s: f32,
    dur: f32,
    from: [f32; C],
    to: [f32; C],
    val: [f32; C],
    loops: u32,
    last_pass: bool,
    /// a quick glide back to the loop's start point (forward loops)
    slew: bool,
}
impl<const C: usize> EnvState<C> {
    const ZERO: Self = Self {
        stage: DONE, seg: 0, dir: 1, s: 1., dur: 0.01, from: [0.; C], to: [0.; C], val: [0.; C], loops: 0, last_pass: false, slew: false,
    };

    fn travel(&mut self, d: &EnvDef<C>, to: [f32; C], rate_ix: usize) {
        self.from = self.val;
        self.to = to;
        let dist = (0..C).map(|c| (to[c] - self.val[c]).abs()).fold(0., f32::max) * d.scale;
        self.dur = (d.secs[rate_ix] * dist).max(0.002);
        self.s = 0.;
    }

    fn begin_segment(&mut self, d: &EnvDef<C>) {
        let to = if self.dir > 0 { d.p[self.seg + 1] } else { d.p[self.seg] };
        self.travel(d, to, self.seg);
    }

    fn start(&mut self, d: &EnvDef<C>) {
        self.val = d.p[0];
        self.stage = ATTACK;
        self.seg = 0;
        self.dir = 1;
        self.loops = 0;
        self.last_pass = false;
        self.slew = false;
        self.begin_segment(d);
    }

    fn release(&mut self, d: &EnvDef<C>) {
        if self.stage == DONE {
            return;
        }
        self.stage = RELEASE_STAGE;
        self.slew = false;
        self.travel(d, d.p[4], 3);
    }

    fn arrive(&mut self, d: &EnvDef<C>) {
        self.val = self.to;
        if self.stage == RELEASE_STAGE {
            self.stage = DONE;
            return;
        }
        let start = d.start_point();
        if self.slew {
            // back at the loop's start: carry on forward from there
            self.slew = false;
            self.seg = start;
            self.dir = 1;
            self.begin_segment(d);
            return;
        }
        if self.dir > 0 {
            if self.seg < 2 {
                self.seg += 1;
                self.begin_segment(d);
                return;
            }
            // reached the top point (3)
            let continuous = d.repeat == 0;
            match d.loop_mode {
                1..=3 if continuous || self.loops < d.repeat => {
                    self.loops += 1;
                    self.slew = true;
                    self.travel(d, d.p[start], 0);
                    self.dur = 0.004;
                }
                4..=6 if !self.last_pass => {
                    self.dir = -1;
                    self.seg = 2;
                    self.begin_segment(d);
                }
                _ => self.stage = HOLD,
            }
        } else if self.seg > start {
            self.seg -= 1;
            self.begin_segment(d);
        } else {
            // bottom of a back-and-forth cycle: one repeat done
            self.loops += 1;
            if d.repeat != 0 && self.loops >= d.repeat {
                self.last_pass = true;
            }
            self.dir = 1;
            self.seg = start;
            self.begin_segment(d);
        }
    }

    /// Advances by `dt` seconds and returns the value.
    fn tick(&mut self, d: &EnvDef<C>, dt: f32) -> [f32; C] {
        if self.stage == ATTACK || self.stage == RELEASE_STAGE {
            self.s += dt / self.dur;
            if self.s >= 1. {
                self.arrive(d);
            } else {
                for c in 0..C {
                    self.val[c] = self.from[c] + (self.to[c] - self.from[c]) * self.s;
                }
            }
        }
        self.val
    }
}

// ---------------------------------------------------------------- voice

#[derive(Clone, Copy)]
struct Setup {
    amp: EnvDef<1>,
    filter: EnvDef<1>,
    mix: EnvDef<2>,
    wave: [usize; 4],
    coarse: [f32; 4],
    fine: [f32; 4],
    raw: u32,
    pan: [f32; 8],
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
    stamp: u32,
    offset: f32,
    rng: Rng,
    ph: [f32; 4],
    amp: EnvState<1>,
    fenv: EnvState<1>,
    mix: EnvState<2>,
    ladder: Ladder,
    dt: [f32; 4],
    dt_d: [f32; 4],
    g: [f32; 4],
    g_d: [f32; 4],
    level: [usize; 4],
    gf: f32,
    gf_d: f32,
    k: f32,
    gain: f32,
    gain_d: f32,
    pan: (f32, f32),
    index: usize,
}
impl Voice {
    const ZERO: Self = Self {
        key: 0, note: 60., pitch: 60., velocity: 0., poly: 0., pressure: 0., down: false, held: false, active: false, fresh: true,
        stamp: 0, offset: 0., rng: Rng(1), ph: [0.; 4], amp: EnvState::ZERO, fenv: EnvState::ZERO, mix: EnvState::ZERO, ladder: Ladder::ZERO,
        dt: [0.; 4], dt_d: [0.; 4], g: [0.; 4], g_d: [0.; 4], level: [0; 4], gf: 0., gf_d: 0., k: 0., gain: 0.,
        gain_d: 0., pan: (1., 1.), index: 0,
    };
}

pub struct Vs {
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    setup: Setup,
    voices: [Voice; VOICES],
    stamp: u32,
    until: usize,
    lfo1: Lfo,
    lfo2: Lfo,
    l1: f32,
    l2: f32,
    d1: f32,
    d2: f32,
    unison: bool,
    stack: KeyStack,
    playing: Option<u32>,
    bend_to: f32,
    bend: f32,
    pressure: f32,
    pressure_s: f32,
    modulation: f32,
    modulation_s: f32,
    expression: f32,
    expression_s: f32,
    pedal: bool,
    pub steals: u32,
}

/// Joystick position (−64…63 on both axes) → weights of the four oscillators: bilinear in the
/// diamond's own 45° axes, so a vertex gives one oscillator and an edge two (fitted to the manual).
pub fn mix_weights(x: f32, y: f32) -> [f32; 4] {
    let s = ((x + y) / 63.).clamp(-1., 1.);
    let t = ((x - y) / 63.).clamp(-1., 1.);
    [(1. - s) * (1. - t) * 0.25, (1. - s) * (1. + t) * 0.25, (1. + s) * (1. + t) * 0.25, (1. + s) * (1. - t) * 0.25]
}

const LFO_SHAPES: [u32; 5] = [LFO_TRIANGLE, LFO_SQUARE, LFO_SAW_DOWN, LFO_SAW_UP, LFO_SAMPLE_HOLD];

fn lfo_hz(rate: f32) -> f32 {
    0.03 * exp2(9.966 * bound(rate, 0., 99.) / 99.)
}

impl Vs {
    pub const fn new() -> Self {
        Self {
            sr: 48000., p: [0.; PARAMS], dirty: true,
            setup: Setup { amp: EnvDef::ZERO, filter: EnvDef::ZERO, mix: EnvDef::ZERO, wave: [0; 4], coarse: [0.; 4], fine: [0.; 4], raw: 0, pan: [0.; 8] },
            voices: [Voice::ZERO; VOICES], stamp: 0, until: 0, lfo1: Lfo::new(0x1234_5671), lfo2: Lfo::new(0x2345_6782), l1: 0., l2: 0., d1: 0., d2: 0.,
            unison: false, stack: KeyStack::EMPTY, playing: None, bend_to: 0., bend: 0., pressure: 0., pressure_s: 0., modulation: 0., modulation_s: 0.,
            expression: 1., expression_s: 1., pedal: false, steals: 0,
        }
    }

    pub fn init(&mut self, sr: f32) {
        // (not `*self = Self::new()`: that would build a large temporary on the Wasm stack)
        self.sr = sr;
        self.dirty = true;
        self.p = [0.; PARAMS];
        self.voices = [Voice::ZERO; VOICES];
        self.stamp = 0;
        self.until = 0;
        self.lfo1 = Lfo::new(0x1234_5671);
        self.lfo2 = Lfo::new(0x2345_6782);
        self.l1 = 0.;
        self.l2 = 0.;
        self.unison = false;
        self.stack = KeyStack::EMPTY;
        self.playing = None;
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
        for (i, v) in [(id::CUTOFF, 99.), (id::VOLUME, 70.), (id::AMP_LEVEL0 + 1, 99.), (id::AMP_LEVEL0 + 2, 99.), (id::AMP_LEVEL0 + 3, 99.),
            (id::AMP_RATE1 + 3, 29.), (id::AMP_RATE1 + 4, 29.)].iter() {
            self.p[*i] = *v;
        }
        for (n, v) in self.voices.iter_mut().enumerate() {
            v.index = n;
            v.rng = Rng(0x68e3_1da4 ^ (n as u32 + 1).wrapping_mul(0x9e37_79b9));
            v.ph = [0.; 4];
        }
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

    fn start(&mut self, index: usize, key: u32, note: f32, velocity: f32, offset: f32, retrigger: bool) {
        self.stamp = self.stamp.wrapping_add(1);
        let setup = self.setup;
        let glide = self.p[id::GLIDE] > 0.;
        let v = &mut self.voices[index];
        if !v.active {
            v.fresh = true;
            v.pressure = 0.;
            v.ladder = Ladder::ZERO;
            if !glide {
                v.pitch = note;
            }
        }
        v.key = key;
        v.note = note;
        v.velocity = velocity;
        v.offset = offset;
        v.poly = 0.;
        v.down = true;
        v.held = false;
        v.stamp = self.stamp;
        if retrigger || !v.active {
            v.amp.start(&setup.amp);
            v.fenv.start(&setup.filter);
            v.mix.start(&setup.mix);
        }
        v.active = true;
    }

    fn release(v: &mut Voice, s: &Setup) {
        v.down = false;
        v.held = false;
        v.amp.release(&s.amp);
        v.fenv.release(&s.filter);
        v.mix.release(&s.mix);
    }

    fn unison_play(&mut self, key: u32, note: f32, velocity: f32, retrigger: bool) {
        for i in 0..VOICES {
            let offset = 2. * i as f32 / (VOICES - 1) as f32 - 1.;
            self.start(i, key, note, velocity, offset, retrigger);
        }
        self.playing = Some(key);
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
        if self.unison {
            let first = self.stack.len == 0;
            self.stack.push(key, note);
            self.unison_play(key, note, velocity, first || !self.voices[0].down);
            return;
        }
        let mut slots = [Slot { active: false, down: false, held: false, note: 0., stamp: 0, level: 0. }; VOICES];
        for (slot, v) in slots.iter_mut().zip(self.voices.iter()) {
            *slot = Slot { active: v.active, down: v.down, held: v.held, note: v.note, stamp: v.stamp, level: v.amp.val[0] };
        }
        let index = choose(&slots, note);
        if self.voices[index].active && self.voices[index].down && self.voices[index].note != note {
            self.steals += 1;
        }
        self.start(index, key, note, velocity, 0., true);
    }

    pub fn note_off(&mut self, key: u32) {
        let s = self.setup;
        let pedal = self.pedal;
        if self.unison {
            self.stack.remove(key);
            match self.stack.pick(1) {
                Some((k, n)) if self.playing != Some(k) => {
                    let velocity = self.voices[0].velocity;
                    self.unison_play(k, n, velocity, false);
                }
                Some(_) => {}
                None => {
                    for v in self.voices.iter_mut().filter(|v| v.active && v.down) {
                        if pedal {
                            v.down = false;
                            v.held = true;
                        } else {
                            Self::release(v, &s);
                        }
                    }
                    self.playing = None;
                }
            }
            return;
        }
        for v in self.voices.iter_mut().filter(|v| v.active && v.down && v.key == key) {
            if pedal {
                v.down = false;
                v.held = true;
            } else {
                Self::release(v, &s);
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
        let s = self.setup;
        match which {
            BEND => self.bend_to = value.clamp(-48., 48.),
            PRESSURE => self.pressure = value.clamp(0., 1.),
            MOD => self.modulation = value.clamp(0., 1.),
            EXPRESSION => self.expression = value.clamp(0., 1.),
            SUSTAIN => {
                self.pedal = value >= 0.5;
                if !self.pedal {
                    for v in self.voices.iter_mut().filter(|v| v.active && v.held) {
                        Self::release(v, &s);
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
            v.amp = EnvState::ZERO;
            v.fenv = EnvState::ZERO;
            v.mix = EnvState::ZERO;
            v.ladder = Ladder::ZERO;
        }
        self.stack = KeyStack::EMPTY;
        self.playing = None;
        self.pedal = false;
    }

    fn prepare(&mut self) {
        let p = &self.p;
        let env1 = |rate: usize, level: usize, levels: usize, lp: usize, rep: usize, last_fixed: bool| {
            let mut d = EnvDef::<1>::ZERO;
            for i in 0..5 {
                d.p[i][0] = if i < levels { bound(p[level + i], 0., 99.) / 99. } else if last_fixed { 0. } else { d.p[levels - 1][0] };
            }
            for i in 0..4 {
                d.secs[i] = rate_seconds(p[rate + i]);
            }
            let m = bound(p[lp], 0., 7.).round() as u32;
            d.loop_mode = if m > 6 { 0 } else { m };
            d.repeat = bound(p[rep], 0., 7.).round() as u32;
            d
        };
        let amp = env1(id::AMP_RATE1, id::AMP_LEVEL0, 4, id::AMP_LOOP, id::AMP_REPEAT, true);
        let filter = env1(id::FILTER_RATE1, id::FILTER_LEVEL0, 5, id::FILTER_LOOP, id::FILTER_REPEAT, false);
        let mut mix = EnvDef::<2>::ZERO;
        for i in 0..5 {
            mix.p[i] = [bound(p[id::MIX_X0 + i], -64., 63.) / 64., bound(p[id::MIX_Y0 + i], -64., 63.) / 64.];
        }
        for i in 0..4 {
            mix.secs[i] = rate_seconds(p[id::MIX_RATE1 + i]);
        }
        let m = bound(p[id::MIX_LOOP], 0., 7.).round() as u32;
        mix.loop_mode = if m > 6 { 0 } else { m };
        mix.repeat = bound(p[id::MIX_REPEAT], 0., 7.).round() as u32;
        mix.scale = 0.5;
        let mut s = Setup { amp, filter, mix, wave: [0; 4], coarse: [0.; 4], fine: [0.; 4], raw: bound(p[id::RAW], 0., 2.).round() as u32, pan: [0.; 8] };
        for k in 0..4 {
            s.wave[k] = bound(p[id::WAVE_A + k], 0., 127.).round() as usize;
            s.coarse[k] = bound(p[id::COARSE_A + k], 0., 24.).round();
            s.fine[k] = bound(p[id::FINE_A + k], 0., 99.) / 99.;
        }
        for k in 0..8 {
            s.pan[k] = bound(p[id::PAN0 + k], -63., 63.) / 63.;
        }
        self.setup = s;
        let unison = p[id::UNISON] >= 0.5;
        if unison != self.unison {
            for v in self.voices.iter_mut().filter(|v| v.down || v.held) {
                Self::release(v, &s);
            }
            self.stack = KeyStack::EMPTY;
            self.playing = None;
            self.unison = unison;
        }
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
        self.modulation_s += (self.modulation - self.modulation_s) * fast;
        self.pressure_s += (self.pressure - self.pressure_s) * smoothing(0.025, rate);
        let wheel = self.modulation_s;
        let chan_pressure = self.pressure_s;
        let bits = |i: usize| bound(p[i], 0., 1_000_000.) as u32;
        let (m_l1, m_l2, m_press, m_vel, m_kbd, m_fe, m_wheel) =
            (bits(id::LFO1_DEST), bits(id::LFO2_DEST), bits(id::PRESSURE_DEST), bits(id::VELOCITY_DEST), bits(id::KEYBOARD_DEST), bits(id::FILTER_ENV_DEST), bits(id::MOD_WHEEL_DEST));
        let amt = |i: usize| bound(p[i], -99., 99.) / 99.;
        let (press_a, vel_a, kbd_a, fe_a) = (amt(id::PRESSURE_AMOUNT), amt(id::VELOCITY_AMOUNT), amt(id::KEYBOARD_AMOUNT), amt(id::FILTER_ENV_MOD_AMOUNT));
        // LFO rates and depths, with the cross routes (from the previous values) and the wheel
        let (mut r1, mut r2, mut a1, mut a2) = (1f32, 1f32, 1f32, 1f32);
        let (b1, b2) = (self.d1 * self.l1, self.d2 * self.l2);
        if m_l1 & 0x80 != 0 { r2 *= exp2(4. * b1); }
        if m_l1 & 0x100 != 0 { a2 *= (1. + b1).max(0.); }
        if m_l2 & 0x80 != 0 { r1 *= exp2(4. * b2); }
        if m_l2 & 0x100 != 0 { a1 *= (1. + b2).max(0.); }
        let pp = press_a * chan_pressure;
        if m_press & 0x80 != 0 { r1 *= exp2(4. * pp); }
        if m_press & 0x100 != 0 { a1 += pp; }
        if m_press & 0x200 != 0 { r2 *= exp2(4. * pp); }
        if m_press & 0x400 != 0 { a2 += pp; }
        if m_wheel & 1 != 0 { a1 *= wheel; }
        if m_wheel & 2 != 0 { a2 *= wheel; }
        self.l1 = self.lfo1.step(lfo_hz(p[id::LFO1_RATE]) * r1 * ts, LFO_SHAPES[bound(p[id::LFO1_SHAPE], 0., 4.).round() as usize]);
        self.l2 = self.lfo2.step(lfo_hz(p[id::LFO2_RATE]) * r2 * ts, LFO_SHAPES[bound(p[id::LFO2_SHAPE], 0., 4.).round() as usize]);
        self.d1 = (bound(p[id::LFO1_AMOUNT], 0., 99.) / 99. * a1).clamp(0., 2.);
        self.d2 = (bound(p[id::LFO2_AMOUNT], 0., 99.) / 99. * a2).clamp(0., 2.);
        let (d1, d2, l1, l2) = (self.d1, self.d2, self.l1, self.l2);
        let bend = self.bend;
        let tune = bound(p[id::TUNE], -100., 100.) / 100.;
        let glide = bound(p[id::GLIDE], 0., 99.);
        let glide_k = if glide > 0. { smoothing(0.003 + 2. * (glide / 99.) * (glide / 99.), rate) } else { 1. };
        let unison_detune = 0.25 * bound(p[id::UNISON], 0., 7.) / 7.;
        let cutoff = bound(p[id::CUTOFF], 0., 99.) / 99.;
        let env_amount = bound(p[id::FILTER_ENV_AMOUNT], 0., 99.) / 99.;
        let res = bound(p[id::RESONANCE], 0., 99.) / 99.;
        let kfb = ladder_feedback(res * 0.95);
        let volume = bound(p[id::VOLUME], 0., 99.) / 99.;
        let (joy_x, joy_y) = (bound(p[id::JOY_X], -64., 63.), bound(p[id::JOY_Y], -64., 63.));
        let press_vol = if m_press & 0x800 != 0 { (1. + pp).clamp(0., 2.) } else { 1. };
        let press_pan = if m_press & 0x1000 != 0 { pp } else { 0. };
        let inv = 1. / TICK as f32;
        let setup = self.setup;
        if setup.raw == 0 {
            for &w in setup.wave.iter() {
                ensure(w);
            }
        }
        for v in self.voices.iter_mut().filter(|v| v.active) {
            v.pressure += (v.poly.max(chan_pressure) - v.pressure) * smoothing(0.025, rate);
            v.pitch += (v.note - v.pitch) * glide_k;
            let mix = v.mix.tick(&setup.mix, ts);
            let fe = v.fenv.tick(&setup.filter, ts)[0];
            let amp = v.amp.tick(&setup.amp, ts)[0];
            // modulation offsets for this voice
            let mut fr = [0f32; 4];
            let (mut filt, mut mx, mut my, mut pan_o, mut fe_add, mut amp_scale) = (0f32, 0f32, 0f32, press_pan, 0f32, 1f32);
            let pr = press_a * v.pressure;
            let vel = v.velocity;
            let key_n = ((v.note - 60.) / 36.).clamp(-1., 1.);
            let dd = |m: u32, depth: f32, value: f32, fr: &mut [f32; 4], filt: &mut f32, mx: &mut f32, my: &mut f32, pan_o: &mut f32| {
                let x = depth * value;
                for k in 0..4 {
                    if m & (1 << k) != 0 { fr[k] += 12. * depth * x; }
                }
                if m & 0x10 != 0 { *filt += 5. * x; }
                if m & 0x20 != 0 { *mx += 63. * x; }
                if m & 0x40 != 0 { *my += 63. * x; }
                if m & 0x200 != 0 { *pan_o += x; }
            };
            dd(m_l1, d1, l1, &mut fr, &mut filt, &mut mx, &mut my, &mut pan_o);
            dd(m_l2, d2, l2, &mut fr, &mut filt, &mut mx, &mut my, &mut pan_o);
            for k in 0..4 {
                if m_press & (1 << k) != 0 { fr[k] += 12. * pr; }
                if m_fe & 1 != 0 { fr[k] += 24. * fe_a * fe; }
            }
            if m_press & 0x10 != 0 { filt += 6. * pr; }
            if m_press & 0x20 != 0 { mx += 63. * pr; }
            if m_press & 0x40 != 0 { my += 63. * pr; }
            if m_vel & 1 != 0 { fe_add += vel_a * vel; }
            if m_vel & 2 != 0 { mx += 63. * vel_a * vel; }
            if m_vel & 4 != 0 { my += 63. * vel_a * vel; }
            if m_vel & 8 != 0 { amp_scale = if vel_a >= 0. { 1. - vel_a * (1. - vel) } else { 1. + vel_a * vel }; }
            if m_vel & 16 != 0 { pan_o += vel_a * (vel - 0.5) * 2.; }
            if m_kbd & 1 != 0 { filt += kbd_a * (v.note - 60.) / 12.; }
            if m_kbd & 2 != 0 { mx += 63. * kbd_a * key_n; }
            if m_kbd & 4 != 0 { my += 63. * kbd_a * key_n; }
            if m_kbd & 8 != 0 { pan_o += kbd_a * key_n; }
            if m_fe & 2 != 0 { pan_o += fe_a * fe; }
            // vector position and the four oscillator gains
            let x = (mix[0] * 64. + joy_x + mx).clamp(-64., 63.);
            let y = (mix[1] * 64. + joy_y + my).clamp(-64., 63.);
            let w = mix_weights(x, y);
            let base = v.pitch + bend + tune + unison_detune * v.offset;
            let mut dt = [0f32; 4];
            for k in 0..4 {
                let semis = base + setup.coarse[k] + setup.fine[k] + fr[k];
                dt[k] = (note_hz(semis) / sr).min(0.45);
            }
            // band-limiting: the first table level whose top harmonic stays below Nyquist
            let mut level = [0usize; 4];
            for k in 0..4 {
                let allowed = 0.5 / dt[k].max(1e-6);
                level[k] = if allowed >= 63. { 0 } else { ((2. * log2(63. / allowed)).ceil() as usize).min(LEVELS - 1) };
            }
            let cut = log2(30.) + cutoff * 9.23 + (env_amount + fe_add).clamp(-1., 1.) * 8. * fe + filt;
            let hz = exp2(cut);
            let gf = warp(hz, sr);
            let volv = volume * volume * press_vol;
            let gain = volv * self.expression_s * amp * amp_scale * 1.0 * (1. + 0.3 * kfb);
            let pn = (setup.pan[v.index] + pan_o).clamp(-1., 1.);
            v.pan = pan(pn);
            v.k = kfb * (1. - ((hz - 0.3 * sr) / (0.15 * sr)).clamp(0., 1.));
            if v.fresh {
                v.fresh = false;
                v.dt = dt;
                v.g = w;
                v.gf = gf;
                v.gain = gain;
            }
            v.level = level;
            for k in 0..4 {
                v.dt_d[k] = (dt[k] - v.dt[k]) * inv;
                v.g_d[k] = (w[k] - v.g[k]) * inv;
            }
            v.gf_d = (gf - v.gf) * inv;
            v.gain_d = (gain - v.gain) * inv;
        }
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let n = left.len();
        left.fill(0.);
        right.fill(0.);
        if unsafe { !READY } {
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
            for v in self.voices.iter_mut().filter(|v| v.active) {
                render_voice(v, &s, &mut left[at..at + m], &mut right[at..at + m]);
                if v.amp.stage == DONE && v.amp.val[0] < 1e-4 {
                    v.active = false;
                    v.down = false;
                    v.held = false;
                }
            }
            at += m;
            self.until -= m;
        }
    }
}

#[inline(always)]
fn render_voice(v: &mut Voice, s: &Setup, left: &mut [f32], right: &mut [f32]) {
    let (pl, pr) = v.pan;
    let raw = s.raw;
    for i in 0..left.len() {
        let mut x = 0.;
        for k in 0..4 {
            v.dt[k] += v.dt_d[k];
            v.g[k] += v.g_d[k];
            let mut ph = v.ph[k] + v.dt[k];
            if ph >= 1. {
                ph -= 1.;
            }
            v.ph[k] = ph;
            if v.g[k] > 1e-5 {
                let o = if raw == 0 {
                    read_mip(s.wave[k], v.level[k], ph)
                } else {
                    read_raw(s.wave[k], ph, raw == 2)
                };
                x += v.g[k] * o;
            }
        }
        v.gf += v.gf_d;
        v.gain += v.gain_d;
        let y = v.ladder.tick(x + 1e-5 * v.rng.next(), v.gf, v.k);
        let o = y * v.gain;
        left[i] += o * pl;
        right[i] += o * pr;
    }
}
