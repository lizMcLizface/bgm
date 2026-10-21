//! A Jupiter-8-inspired polysynth. Per voice: VCO-1 (triangle, saw, pulse or
//! square; 16'–2') cross-modulated by VCO-2 (sine, saw, pulse or noise; continuous
//! range and fine tune, optionally synced to VCO-1 or slowed to a low-frequency
//! modulator) → source mix → non-resonant 6 dB high-pass → resonant OTA-style
//! filter with a 12 dB (second-stage tap) or 24 dB output → VCA. ENV-1 (invertible)
//! drives pitch, pulse width or the filter; ENV-2 drives the VCA and optionally the
//! filter; both shorten up the keyboard with key follow. One delayed LFO (sine,
//! saw, square, random). Assign modes Solo, Unison, Poly-1 and Poly-2, portamento,
//! and an arpeggiator (up, down, up/down, random over 1–4 octaves) clocked inside
//! the engine. Velocity and pressure routes are additions for piano playing.
//! An original interpretation, not a circuit model; units are estimates.
use crate::alloc::{choose, KeyStack, Slot};
use crate::dsp::*;

pub const VOICES: usize = 16;
/// Parameters of one layer (one Jupiter-8 patch plus the additions).
pub const PARAMS: usize = 64;
/// Both layers (upper 0–63, lower 64–127) and the key-mode controls from 128.
pub const PAIR_PARAMS: usize = 144;
const TICK: usize = 16;
/// Key number the arpeggiator plays its notes under (MIDI keys are below 128).
const ARP_KEY: u32 = 0x4000;

pub mod id {
    pub const LFO_RATE: usize = 0;
    pub const LFO_DELAY: usize = 1;
    pub const LFO_WAVE: usize = 2;
    pub const VCO_MOD_LFO: usize = 3;
    pub const VCO_MOD_ENV: usize = 4;
    pub const VCO_MOD_DEST: usize = 5;
    pub const PW: usize = 6;
    pub const PW_SOURCE: usize = 7;
    pub const CROSS_MOD: usize = 8;
    pub const VCO1_RANGE: usize = 9;
    pub const VCO1_WAVE: usize = 10;
    pub const SYNC: usize = 11;
    pub const VCO2_RANGE: usize = 12;
    pub const VCO2_FINE: usize = 13;
    pub const VCO2_WAVE: usize = 14;
    pub const VCO2_LOW: usize = 15;
    pub const SOURCE_MIX: usize = 16;
    pub const HPF: usize = 17;
    pub const CUTOFF: usize = 18;
    pub const RES: usize = 19;
    pub const SLOPE: usize = 20;
    pub const ENV_MOD: usize = 21;
    pub const ENV_SOURCE: usize = 22;
    pub const VCF_LFO: usize = 23;
    pub const KEY_FOLLOW: usize = 24;
    pub const VCA_LFO: usize = 25;
    pub const LEVEL: usize = 26;
    pub const E1_ATTACK: usize = 27;
    pub const E1_DECAY: usize = 28;
    pub const E1_SUSTAIN: usize = 29;
    pub const E1_RELEASE: usize = 30;
    pub const E1_KEY: usize = 31;
    pub const E1_INVERT: usize = 32;
    pub const E2_ATTACK: usize = 33;
    pub const E2_DECAY: usize = 34;
    pub const E2_SUSTAIN: usize = 35;
    pub const E2_RELEASE: usize = 36;
    pub const E2_KEY: usize = 37;
    pub const ASSIGN: usize = 38;
    pub const PORTAMENTO: usize = 39;
    pub const UNISON_DETUNE: usize = 40;
    pub const ARP: usize = 41;
    pub const ARP_MODE: usize = 42;
    pub const ARP_RANGE: usize = 43;
    pub const ARP_RATE: usize = 44;
    pub const ARP_HOLD: usize = 45;
    pub const BEND_RANGE: usize = 46;
    pub const BEND_VCF: usize = 47;
    pub const MOD_DEPTH: usize = 48;
    pub const VEL_VCF: usize = 49;
    pub const VEL_VCA: usize = 50;
    pub const AFTER_VCF: usize = 51;
    pub const VOLUME: usize = 52;
    pub const VOICES: usize = 53;
    pub const WIDTH: usize = 54;
    pub const SPREAD: usize = 55;
    pub const OVERSAMPLE: usize = 56;
}

pub const SOLO: u32 = 0;
pub const UNISON: u32 = 1;
pub const POLY_1: u32 = 2;
pub const POLY_2: u32 = 3;

const DEFAULTS: [(usize, f32); 35] = [
    (id::LFO_RATE, 5.), (id::LFO_DELAY, 0.), (id::VCO1_RANGE, 1.), (id::VCO1_WAVE, 1.), (id::VCO2_WAVE, 1.),
    (id::VCO2_FINE, 6.), (id::SOURCE_MIX, 0.5), (id::HPF, 10.), (id::CUTOFF, 700.), (id::RES, 0.1), (id::SLOPE, 1.),
    (id::ENV_MOD, 0.35), (id::KEY_FOLLOW, 0.5), (id::LEVEL, 0.8), (id::E1_ATTACK, 0.005), (id::E1_DECAY, 0.6),
    (id::E1_SUSTAIN, 0.4), (id::E1_RELEASE, 0.4), (id::E2_ATTACK, 0.003), (id::E2_DECAY, 0.8), (id::E2_SUSTAIN, 0.9),
    (id::E2_RELEASE, 0.35), (id::ASSIGN, 2.), (id::UNISON_DETUNE, 0.3), (id::ARP_RANGE, 1.), (id::ARP_RATE, 8.),
    (id::BEND_RANGE, 2.), (id::VEL_VCF, 0.3), (id::VEL_VCA, 0.4), (id::VOLUME, 0.55), (id::VOICES, 8.),
    (id::MOD_DEPTH, 0.5), (id::SPREAD, 0.3), (id::WIDTH, 0.3), (id::OVERSAMPLE, 1.),
];

/// Resonance 0–1 → loop feedback; sings from about 0.9 (Chorus Organ, Jungle
/// Beasts and Birds sit at full resonance). An estimate.
fn feedback(resonance: f32) -> f32 {
    4.4 * bound(resonance, 0., 1.)
}

#[derive(Clone, Copy)]
struct Setup {
    os: usize,
    srv: f32,
    w1: Waves,
    w2: Waves,
    pulse1: bool,
    pulse2: bool,
    noise2: bool,
    sync: bool,
    xmod: f32,
    mix1: f32,
    mix2: f32,
    hp_a: f32,
    two_pole: bool,
    e1: [f32; 4],
    e2: [f32; 4],
}
impl Setup {
    const ZERO: Self = Self {
        os: 1, srv: 48000., w1: Waves::NONE, w2: Waves::NONE, pulse1: false, pulse2: false, noise2: false, sync: false,
        xmod: 0., mix1: 0., mix2: 0., hp_a: 0., two_pole: false, e1: [1., 1., 0., 1.], e2: [1., 1., 0., 1.],
    };
}

#[derive(Clone, Copy)]
struct Voice {
    onset: Onset,
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
    o1: VcOsc,
    o2: VcOsc,
    out2: f32,
    e1: Adsr,
    e2: Adsr,
    /// envelope speed-ups from key follow
    k1: f32,
    k2: f32,
    hp: f32,
    ladder: Ladder,
    dt1: f32,
    dt1_d: f32,
    dt2: f32,
    dt2_d: f32,
    pw: f32,
    pw_d: f32,
    g: f32,
    g_d: f32,
    gain: f32,
    gain_d: f32,
    k: f32,
    pan: (f32, f32),
    tune: f32,
    cut: f32,
    trim: f32,
    spread: f32,
}
impl Voice {
    const ZERO: Self = Self {
        onset: Onset::DONE,
        key: 0, note: 60., pitch: 60., velocity: 0., poly: 0., pressure: 0., down: false, held: false, active: false,
        fresh: true, stamp: 0, offset: 0., rng: Rng(1), o1: VcOsc::ZERO, o2: VcOsc::ZERO, out2: 0., e1: Adsr::ZERO,
        e2: Adsr::ZERO, k1: 1., k2: 1., hp: 0., ladder: Ladder::ZERO, dt1: 0., dt1_d: 0., dt2: 0., dt2_d: 0., pw: 0.5,
        pw_d: 0., g: 0., g_d: 0., gain: 0., gain_d: 0., k: 0., pan: (1., 1.), tune: 0., cut: 0., trim: 0., spread: 0.,
    };
}

pub struct Jupiter {
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    setup: Setup,
    voices: [Voice; VOICES],
    stamp: u32,
    until: usize,
    lfo: Lfo,
    fade: f32,
    assign: u32,
    rotate: usize,
    /// keys held for Solo/Unison
    stack: KeyStack,
    playing: Option<u32>,
    // arpeggiator
    arp_on: bool,
    arp_keys: KeyStack,
    arp_down: u32,
    arp_phase: f32,
    arp_step: u32,
    arp_sounding: bool,
    arp_velocity: f32,
    arp_rng: Rng,
    dec: [HalfBand; 2],
    /// voices this layer may use (half the pool in dual and split)
    limit: usize,
    bend_to: f32,
    bend: f32,
    pressure: f32,
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

impl Jupiter {
    pub const fn new() -> Self {
        Self {
            sr: 48000., p: [0.; PARAMS], dirty: true, setup: Setup::ZERO, voices: [Voice::ZERO; VOICES], stamp: 0, until: 0,
            lfo: Lfo::new(0x6a09_e667), fade: 1., assign: POLY_1, rotate: 0, stack: KeyStack::EMPTY, playing: None,
            arp_on: false, arp_keys: KeyStack::EMPTY, arp_down: 0, arp_phase: 0., arp_step: 0, arp_sounding: false,
            arp_velocity: 0.8, arp_rng: Rng(0x510e_527f), dec: [HalfBand::ZERO; 2], limit: VOICES, bend_to: 0., bend: 0., pressure: 0.,
            modulation: 0., modulation_s: 0., expression: 1., expression_s: 1., brightness: 0., soft: 0., pedal: false,
            steals: 0, shape_p: [0.; SHAPE_PARAMS], shapes: [EnvShape::NATIVE; 2],
        }
    }

    /// `salt` keeps the two layers' noise, tolerances and LFO apart.
    pub fn init(&mut self, sr: f32, salt: u32) {
        *self = Self::new();
        self.sr = sr;
        for &(i, v) in DEFAULTS.iter() {
            self.p[i] = v;
        }
        self.lfo = Lfo::new(0x6a09_e667 ^ salt);
        let mut rng = Rng(0x9b05_688c ^ salt);
        for (n, v) in self.voices.iter_mut().enumerate() {
            v.rng = Rng(0x1f83_d9ab ^ salt ^ (n as u32 + 1).wrapping_mul(0x9e37_79b9));
            v.tune = rng.next();
            v.cut = rng.next();
            v.trim = rng.next();
            v.spread = ((n as f32 * 0.618_034) % 1.) * 2. - 1.;
            v.o1.phase = 0.5 + 0.5 * rng.next();
            v.o2.phase = 0.5 + 0.5 * rng.next();
        }
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
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    fn count(&self) -> usize {
        (self.p[id::VOICES].round() as usize).clamp(1, VOICES).min(self.limit.max(1))
    }

    /// Lets every held note ring out and forgets held keys (assign, arpeggio or key mode changed).
    fn release_all(&mut self) {
        for v in self.voices.iter_mut().filter(|v| v.down || v.held) {
            Self::release(v);
        }
        self.stack = KeyStack::EMPTY;
        self.playing = None;
        self.arp_keys = KeyStack::EMPTY;
        self.arp_down = 0;
        self.arp_sounding = false;
    }

    fn ringing(&self) -> bool {
        feedback(self.p[id::RES]) >= 3.95
    }

    fn start(&mut self, index: usize, key: u32, note: f32, velocity: f32, offset: f32, retrigger: bool) {
        let ringing = self.ringing();
        let e1_key = self.p[id::E1_KEY] >= 0.5;
        let e2_key = self.p[id::E2_KEY] >= 0.5;
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
            v.pitch = note;
        }
        // key follow: envelopes run faster up the keyboard, ×1.41 per octave (an estimate)
        let follow = exp2((note - 60.) / 24.);
        v.k1 = if e1_key { follow } else { 1. };
        v.k2 = if e2_key { follow } else { 1. };
        v.key = key;
        v.note = note;
        v.velocity = velocity;
        v.offset = offset;
        v.poly = 0.;
        v.down = true;
        v.held = false;
        v.stamp = self.stamp;
        if retrigger || !v.active {
            v.e1.attack();
            v.e2.attack();
        }
        if !v.active {
            v.onset.arm();
        }
        v.active = true;
    }

    fn release(v: &mut Voice) {
        v.down = false;
        v.held = false;
        v.e1.release();
        v.e2.release();
    }

    fn lift(&mut self, key: u32) {
        let pedal = self.pedal && key != ARP_KEY;
        for v in self.voices.iter_mut().filter(|v| v.active && v.down && v.key == key) {
            if pedal {
                v.down = false;
                v.held = true;
            } else {
                Self::release(v);
            }
        }
    }

    /// Solo/Unison: every voice of the part follows the newest held key.
    fn mono_play(&mut self, key: u32, note: f32, velocity: f32, retrigger: bool) {
        let n = if self.assign == SOLO { 1 } else { self.count() };
        for i in 0..n {
            let offset = if n > 1 { 2. * i as f32 / (n - 1) as f32 - 1. } else { 0. };
            self.start(i, key, note, velocity, offset, retrigger);
        }
        for v in self.voices[n..].iter_mut().filter(|v| v.down || v.held) {
            Self::release(v);
        }
        self.playing = Some(key);
    }

    /// One note into the voice assigner (from the keyboard or the arpeggiator).
    fn voice_on(&mut self, key: u32, note: f32, velocity: f32) {
        match self.assign {
            SOLO | UNISON => {
                let first = self.stack.len == 0;
                self.stack.push(key, note);
                // single trigger: legato while a key is held
                self.mono_play(key, note, velocity, first || !self.voices[0].down);
            }
            assign => {
                let n = self.count();
                let index = if assign == POLY_2 {
                    // rotate through the voices, preferring ones that are not held
                    let free = (0..n).map(|i| (self.rotate + i) % n).find(|&i| !self.voices[i].down && !self.voices[i].held);
                    let i = free.unwrap_or(self.rotate % n);
                    self.rotate = (i + 1) % n;
                    i
                } else {
                    let mut slots = [Slot { active: false, down: false, held: false, note: 0., stamp: 0, level: 0. }; VOICES];
                    for (slot, v) in slots.iter_mut().zip(self.voices.iter()) {
                        *slot = Slot { active: v.active, down: v.down, held: v.held, note: v.note, stamp: v.stamp, level: v.e2.value };
                    }
                    choose(&slots[..n], note)
                };
                let v = &self.voices[index];
                if v.active && v.down && v.note != note {
                    self.steals += 1;
                }
                self.start(index, key, note, velocity, 0., true);
            }
        }
    }

    fn voice_off(&mut self, key: u32) {
        match self.assign {
            SOLO | UNISON => {
                self.stack.remove(key);
                match self.stack.pick(1) {
                    Some((k, n)) if self.playing != Some(k) => {
                        let velocity = self.voices[0].velocity;
                        self.mono_play(k, n, velocity, false);
                    }
                    Some(_) => {}
                    None => {
                        self.lift_all_part();
                        self.playing = None;
                    }
                }
            }
            _ => self.lift(key),
        }
    }

    fn lift_all_part(&mut self) {
        let pedal = self.pedal;
        for v in self.voices.iter_mut().filter(|v| v.active && v.down) {
            if pedal && v.key != ARP_KEY {
                v.down = false;
                v.held = true;
            } else {
                Self::release(v);
            }
        }
    }

    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        if !note.is_finite() || key >= ARP_KEY {
            return;
        }
        if self.dirty {
            self.prepare();
        }
        let note = note.clamp(0., 127.);
        let velocity = bound(velocity, 0., 1.);
        // the LFO delay restarts when a phrase starts
        if !self.voices.iter().any(|v| v.down) && self.arp_down == 0 {
            self.fade = 0.;
        }
        if self.arp_on {
            // with hold on, a new phrase (no key physically down) replaces the latched keys
            if self.arp_down == 0 && self.p[id::ARP_HOLD] >= 0.5 {
                self.arp_keys = KeyStack::EMPTY;
            }
            if self.arp_keys.len == 0 {
                self.arp_phase = 1.;
                self.arp_step = 0;
            }
            self.arp_down += 1;
            self.arp_keys.push(key, note);
            self.arp_velocity = velocity;
            return;
        }
        self.voice_on(key, note, velocity);
    }

    pub fn note_off(&mut self, key: u32) {
        if self.arp_on {
            if self.arp_keys.keys[..self.arp_keys.len].iter().any(|k| k.0 == key) {
                self.arp_down = self.arp_down.saturating_sub(1);
                if self.p[id::ARP_HOLD] < 0.5 {
                    self.arp_keys.remove(key);
                }
            }
            return;
        }
        self.voice_off(key);
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
            v.e1 = Adsr::ZERO;
            v.e2 = Adsr::ZERO;
            v.hp = 0.;
            v.ladder = Ladder::ZERO;
        }
        self.stack = KeyStack::EMPTY;
        self.arp_keys = KeyStack::EMPTY;
        self.arp_down = 0;
        self.arp_sounding = false;
        self.playing = None;
        self.dec = [HalfBand::ZERO; 2];
        self.pedal = false;
    }

    fn prepare(&mut self) {
        let p = &self.p;
        let pick = |i: usize, n: f32| bound(p[i], 0., n).round() as u32;
        let w1 = pick(id::VCO1_WAVE, 3.);
        let w2 = pick(id::VCO2_WAVE, 3.);
        let sync = p[id::SYNC] >= 0.5;
        let xmod = bound(p[id::CROSS_MOD], 0., 1.);
        let os = match pick(id::OVERSAMPLE, 2.) {
            0 => 1,
            2 => 2,
            _ => if sync || xmod > 0. { 2 } else { 1 },
        };
        if os != self.setup.os {
            self.dec = [HalfBand::ZERO; 2];
        }
        let srv = self.sr * os as f32;
        let one = |on: bool| if on { 1. } else { 0. };
        let mix = bound(p[id::SOURCE_MIX], 0., 1.);
        let env = |a: usize| [
            attack_coefficient(bound(p[a], 0.0005, 20.), srv),
            fall_coefficient(bound(p[a + 1], 0.001, 30.), srv),
            bound(p[a + 2], 0., 1.),
            fall_coefficient(bound(p[a + 3], 0.001, 30.), srv),
        ];
        self.setup = Setup {
            os,
            srv,
            // VCO-1: triangle, saw, pulse (width from the PW section), square (fixed ½)
            w1: Waves { tri: one(w1 == 0), saw: one(w1 == 1), pulse: one(w1 >= 2), sine: 0. },
            pulse1: w1 == 2,
            // VCO-2: sine, saw, pulse, noise
            w2: Waves { sine: one(w2 == 0), saw: one(w2 == 1), pulse: one(w2 == 2), tri: 0. },
            pulse2: w2 == 2,
            noise2: w2 == 3,
            sync,
            // linear FM index from VCO-2 (an interpretation; the original's depth is not measured)
            xmod: 4. * xmod * xmod,
            // a balance control: both sources full in the centre
            mix1: (2. * (1. - mix)).min(1.),
            mix2: (2. * mix).min(1.),
            hp_a: 1. - (-core::f32::consts::TAU * bound(p[id::HPF], 5., 4000.) / srv).exp(),
            two_pole: p[id::SLOPE] < 0.5,
            e1: env(id::E1_ATTACK),
            e2: env(id::E2_ATTACK),
        };
        let assign = pick(id::ASSIGN, 3.);
        let arp = p[id::ARP] >= 0.5;
        if assign != self.assign || arp != self.arp_on {
            // changing how keys are assigned: let everything ring out and start clean
            self.release_all();
            self.assign = assign;
            self.arp_on = arp;
        }
        self.shapes = [EnvShape::new(&self.shape_p[..SHAPE_PER_ENV], srv), EnvShape::new(&self.shape_p[SHAPE_PER_ENV..], srv)];
        self.dirty = false;
    }

    /// Advances the arpeggiator by one control tick.
    fn arpeggiate(&mut self, ts: f32) {
        if !self.arp_on {
            return;
        }
        let rate = bound(self.p[id::ARP_RATE], 0.5, 40.);
        let before = self.arp_phase;
        self.arp_phase += rate * ts;
        // gate: half a step
        if self.arp_sounding && before < 0.5 && self.arp_phase >= 0.5 {
            self.voice_off(ARP_KEY);
            self.arp_sounding = false;
        }
        if self.arp_keys.len == 0 {
            if self.arp_sounding {
                self.voice_off(ARP_KEY);
                self.arp_sounding = false;
            }
            return;
        }
        if self.arp_phase < 1. {
            return;
        }
        self.arp_phase -= self.arp_phase.floor();
        if self.arp_sounding {
            self.voice_off(ARP_KEY);
            self.arp_sounding = false;
        }
        let mut notes = [0f32; 16];
        let n = self.arp_keys.len;
        for (slot, k) in notes.iter_mut().zip(self.arp_keys.keys[..n].iter()) {
            *slot = k.1;
        }
        notes[..n].sort_by(|a, b| a.total_cmp(b));
        let octaves = bound(self.p[id::ARP_RANGE], 1., 4.).round() as u32;
        let len = n as u32 * octaves;
        let at = |i: u32| notes[(i % n as u32) as usize] + 12. * (i / n as u32) as f32;
        let step = self.arp_step;
        let index = match bound(self.p[id::ARP_MODE], 0., 3.).round() as u32 {
            1 => len - 1 - step % len,
            2 => {
                let period = (2 * len).saturating_sub(2).max(1);
                let s = step % period;
                if s < len { s } else { period - s }
            }
            3 => ((0.5 + 0.5 * self.arp_rng.next()) * len as f32) as u32 % len,
            _ => step % len,
        };
        self.arp_step = step.wrapping_add(1);
        let velocity = self.arp_velocity;
        self.voice_on(ARP_KEY, at(index).min(127.), velocity);
        self.arp_sounding = true;
    }

    fn tick(&mut self) {
        if self.dirty {
            self.prepare();
        }
        let sr = self.sr;
        let ts = TICK as f32 / sr;
        self.arpeggiate(ts);
        let s = self.setup;
        let srv = s.srv;
        let rate = sr / TICK as f32;
        let p = self.p;
        let fast = smoothing(0.006, rate);
        self.bend += (self.bend_to - self.bend) * fast;
        self.expression_s += (self.expression - self.expression_s) * fast;
        self.modulation_s += (self.modulation - self.modulation_s) * fast;
        let shape = [LFO_SINE, LFO_SAW_DOWN, LFO_SQUARE, LFO_SAMPLE_HOLD][bound(p[id::LFO_WAVE], 0., 3.).round() as usize];
        let raw = self.lfo.step(bound(p[id::LFO_RATE], 0.02, 50.) * ts, shape);
        let delay = bound(p[id::LFO_DELAY], 0., 10.);
        self.fade = if delay > 0. { (self.fade + ts / delay).min(1.) } else { 1. };
        let lfo = raw * smoothstep(self.fade);
        let on = |i: usize| p[i] >= 0.5;
        let sq = |i: usize| {
            let x = bound(p[i], 0., 1.);
            x * x
        };
        let invert = if on(id::E1_INVERT) { -1. } else { 1. };
        // VCO modulation (depths are estimates; square law for fine control of vibrato)
        let vm_lfo = 12. * sq(id::VCO_MOD_LFO) * lfo + bound(p[id::MOD_DEPTH], 0., 3.) * self.modulation_s * raw;
        let vm_env = 48. * sq(id::VCO_MOD_ENV) * invert;
        let dest = bound(p[id::VCO_MOD_DEST], 0., 2.).round() as u32;
        let (to1, to2) = (if dest <= 1 { 1. } else { 0. }, if dest >= 1 { 1. } else { 0. });
        let pw = bound(p[id::PW], 0., 1.);
        let pw_source = bound(p[id::PW_SOURCE], 0., 2.).round() as u32;
        let range1 = [-12., 0., 12., 24.][bound(p[id::VCO1_RANGE], 0., 3.).round() as usize];
        let range2 = bound(p[id::VCO2_RANGE], -24., 36.);
        let fine2 = bound(p[id::VCO2_FINE], -100., 100.) / 100.;
        let low2 = on(id::VCO2_LOW).then(|| 3. * exp2(range2 / 6.));
        // the host sends the bend in semitones, already scaled by its wheel range setting
        let bend = self.bend;
        let porta = bound(p[id::PORTAMENTO], 0., 10.);
        let porta_k = if porta > 0. { smoothing(porta / 3., rate) } else { 1. };
        let detune = 0.25 * bound(p[id::UNISON_DETUNE], 0., 1.);
        let spread = bound(p[id::SPREAD], 0., 1.);
        let base = log2(bound(p[id::CUTOFF], 10., 30000.)) + 4. * bound(p[id::VCF_LFO], 0., 1.) * lfo
            + bound(p[id::BEND_VCF], 0., 1.) * self.bend / 6. + 1.5 * self.brightness - self.soft;
        let env_oct = 10. * bound(p[id::ENV_MOD], 0., 1.);
        let env2_filter = on(id::ENV_SOURCE);
        let follow = bound(p[id::KEY_FOLLOW], 0., 1.2);
        let (vel_vcf, vel_vca, after_vcf) = (bound(p[id::VEL_VCF], 0., 1.), bound(p[id::VEL_VCA], 0., 1.), bound(p[id::AFTER_VCF], 0., 1.));
        let k = feedback(p[id::RES]);
        let tremolo = [0., 0.2, 0.45, 0.8][bound(p[id::VCA_LFO], 0., 3.).round() as usize] * lfo;
        let level = bound(p[id::LEVEL], 0., 1.);
        let volume = bound(p[id::VOLUME], 0., 1.);
        let master = level * volume * volume * self.expression_s * (1. - 0.35 * self.soft) * 0.6 * (1. + 0.3 * k) * (1. + tremolo);
        let stereo = bound(p[id::WIDTH], 0., 1.);
        let press_k = smoothing(0.025, rate);
        let channel_pressure = self.pressure;
        let inv = 1. / (TICK * s.os) as f32;
        for v in self.voices.iter_mut().filter(|v| v.active) {
            v.pressure += (v.poly.max(channel_pressure) - v.pressure) * press_k;
            v.pitch += (v.note - v.pitch) * porta_k;
            let e1 = v.e1.value * invert;
            let vm = vm_lfo + vm_env * v.e1.value;
            let pitch = v.pitch + bend + detune * v.offset + 0.06 * spread * v.tune;
            let dt1 = (note_hz(pitch + range1 + to1 * vm) / srv).min(0.45);
            let dt2 = match low2 {
                Some(hz) => hz / srv,
                None => note_hz(pitch + range2 + fine2 + to2 * vm) / srv,
            }
            .min(0.45);
            let width = match pw_source {
                0 => 0.5 - 0.45 * pw * 0.5 * (lfo + 1.),
                2 => 0.5 - 0.45 * pw * e1.abs(),
                _ => 0.5 - 0.45 * pw,
            };
            let env = if env2_filter { v.e2.value } else { e1 };
            // key follow counts from the lowest key (C2 on the 61-key keyboard)
            let cut = base + follow * (v.pitch - 36.) / 12. + env_oct * env + vel_vcf * 3. * (v.velocity - 0.6)
                + after_vcf * 3. * v.pressure + 0.25 * spread * v.cut;
            let hz = exp2(cut);
            let g = warp(hz, srv);
            let gain = master * (1. - vel_vca * (1. - v.velocity)) * (1. + 0.1 * spread * v.trim);
            v.pan = pan(stereo * v.spread);
            v.k = k * (1. - ((hz - 0.3 * sr) / (0.15 * sr)).clamp(0., 1.));
            if v.fresh {
                v.fresh = false;
                v.dt1 = dt1;
                v.dt2 = dt2;
                v.pw = width;
                v.g = g;
                v.gain = gain;
            }
            v.dt1_d = (dt1 - v.dt1) * inv;
            v.dt2_d = (dt2 - v.dt2) * inv;
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
            let mut l2 = [0f32; 2 * TICK];
            let mut r2 = [0f32; 2 * TICK];
            let len = m * s.os;
            for v in self.voices.iter_mut().filter(|v| v.active) {
                if s.os == 2 {
                    render_voice(v, &s, &self.shapes, &mut l2[..len], &mut r2[..len]);
                } else {
                    render_voice(v, &s, &self.shapes, &mut left[at..at + m], &mut right[at..at + m]);
                }
                if v.e2.stage == IDLE {
                    v.active = false;
                    v.down = false;
                    v.held = false;
                    v.e1 = Adsr::ZERO;
                }
            }
            if s.os == 2 {
                for j in 0..m {
                    left[at + j] = self.dec[0].tick(l2[2 * j], l2[2 * j + 1]);
                    right[at + j] = self.dec[1].tick(r2[2 * j], r2[2 * j + 1]);
                }
            }
            at += m;
            self.until -= m;
        }
    }
}

pub mod key_mode {
    pub const MODE: usize = 128;
    pub const SPLIT_POINT: usize = 129;
    pub const BALANCE: usize = 130;
    pub const WHOLE: u32 = 0;
    pub const DUAL: u32 = 1;
    pub const SPLIT: u32 = 2;
}

/// The whole instrument: an upper and a lower layer, each a complete patch. Whole
/// plays the upper layer alone; Dual sounds both on every key; Split sends keys
/// below the split point to the lower layer. In Dual and Split the layers share the
/// voices half and half (the original's 4 + 4), and Balance sets their levels.
pub struct Jupiter8 {
    pub upper: Jupiter,
    pub lower: Jupiter,
    mode: u32,
    split: f32,
    balance: f32,
    pub steals: u32,
}

impl Jupiter8 {
    pub const fn new() -> Self {
        Self { upper: Jupiter::new(), lower: Jupiter::new(), mode: key_mode::WHOLE, split: 60., balance: 0.5, steals: 0 }
    }

    pub fn init(&mut self, sr: f32) {
        self.upper.init(sr, 0);
        self.lower.init(sr, 0x2d35_8dcc);
        self.mode = key_mode::WHOLE;
        self.split = 60.;
        self.balance = 0.5;
        self.steals = 0;
        self.limits();
    }

    /// Whole: the upper layer has the pool to itself. Dual/Split: half each, rounded up.
    fn limits(&mut self) {
        let pool = (self.upper.p[id::VOICES].round() as usize).clamp(1, VOICES);
        let share = if self.mode == key_mode::WHOLE { VOICES } else { (pool + 1) / 2 };
        self.upper.limit = share;
        self.lower.limit = share;
    }

    /// One set of envelope shapes for both layers.
    pub fn set_shape(&mut self, i: usize, value: f32) {
        self.upper.set_shape(i, value);
        self.lower.set_shape(i, value);
    }

    pub fn set(&mut self, i: usize, value: f32) {
        if !value.is_finite() {
            return;
        }
        match i {
            _ if i < PARAMS => self.upper.set(i, value),
            _ if i < 2 * PARAMS => self.lower.set(i - PARAMS, value),
            key_mode::MODE => {
                let mode = bound(value, 0., 2.).round() as u32;
                if mode != self.mode {
                    self.upper.release_all();
                    self.lower.release_all();
                    self.mode = mode;
                }
            }
            key_mode::SPLIT_POINT => self.split = bound(value, 0., 127.).round(),
            key_mode::BALANCE => self.balance = bound(value, 0., 1.),
            _ => {}
        }
        self.limits();
    }

    pub fn active(&self) -> u32 {
        self.upper.active() + self.lower.active()
    }

    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) {
        match self.mode {
            key_mode::DUAL => {
                self.upper.note_on(key, note, velocity);
                self.lower.note_on(key, note, velocity);
            }
            key_mode::SPLIT if note < self.split => self.lower.note_on(key, note, velocity),
            _ => self.upper.note_on(key, note, velocity),
        }
    }

    /// Releases go to both layers: a layer ignores a key it never received.
    pub fn note_off(&mut self, key: u32) {
        self.upper.note_off(key);
        self.lower.note_off(key);
    }

    pub fn poly_pressure(&mut self, key: u32, value: f32) {
        self.upper.poly_pressure(key, value);
        self.lower.poly_pressure(key, value);
    }

    pub fn control(&mut self, which: u32, value: f32) {
        self.upper.control(which, value);
        self.lower.control(which, value);
    }

    pub fn panic(&mut self) {
        self.upper.panic();
        self.lower.panic();
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        let layered = self.mode != key_mode::WHOLE;
        if !layered && self.lower.active() == 0 {
            self.upper.render(left, right);
        } else {
            // Balance: both full in the centre; in Whole the lower layer is only ringing out
            let (gu, gl) = if layered { ((2. * (1. - self.balance)).min(1.), (2. * self.balance).min(1.)) } else { (1., 1.) };
            const CHUNK: usize = 128;
            let mut at = 0;
            while at < left.len() {
                let m = CHUNK.min(left.len() - at);
                let (mut ll, mut lr) = ([0f32; CHUNK], [0f32; CHUNK]);
                self.upper.render(&mut left[at..at + m], &mut right[at..at + m]);
                self.lower.render(&mut ll[..m], &mut lr[..m]);
                for j in 0..m {
                    left[at + j] = gu * left[at + j] + gl * ll[j];
                    right[at + j] = gu * right[at + j] + gl * lr[j];
                }
                at += m;
            }
        }
        self.steals = self.upper.steals + self.lower.steals;
    }
}

#[inline(always)]
fn render_voice(v: &mut Voice, s: &Setup, shapes: &[EnvShape; 2], left: &mut [f32], right: &mut [f32]) {
    let c = |x: f32, k: f32| (x * k).min(1.);
    let [a1, d1, s1, r1] = s.e1;
    let [a2, d2, s2, r2] = s.e2;
    let (a1, d1, r1) = (c(a1, v.k1), c(d1, v.k1), c(r1, v.k1));
    let (a2, d2, r2) = (c(a2, v.k2), c(d2, v.k2), c(r2, v.k2));
    let (rf, ra) = (shapes[1].rates(a1, d1, r1, false), shapes[0].rates(a2, d2, r2, false));
    let (pl, pr) = v.pan;
    for i in 0..left.len() {
        v.dt1 += v.dt1_d;
        v.dt2 += v.dt2_d;
        v.pw += v.pw_d;
        v.g += v.g_d;
        v.gain += v.gain_d;
        let pw1 = if s.pulse1 { v.pw } else { 0.5 };
        let pw2 = if s.pulse2 { v.pw } else { 0.5 };
        // cross-mod: VCO-2 (one sample back) moves VCO-1's frequency linearly; it never runs backwards
        let dt1 = if s.xmod != 0. { (v.dt1 * (1. + s.xmod * v.out2)).clamp(0., 0.45) } else { v.dt1 };
        let (o1, wrap) = v.o1.step(dt1, pw1, &s.w1, 0.);
        let noise = v.rng.next();
        let o2 = if s.noise2 { noise } else { v.o2.step(v.dt2, pw2, &s.w2, if s.sync { wrap } else { 0. }).0 };
        v.out2 = o2;
        let mut x = 0.5 * (s.mix1 * o1 + s.mix2 * o2);
        v.hp += (x - v.hp) * s.hp_a;
        x -= v.hp;
        let (y2, y4) = v.ladder.taps(x + 1e-5 * noise, v.g, v.k);
        v.e1.run(&shapes[1], &rf, a1, d1, s1, r1, false);
        let e = v.e2.run(&shapes[0], &ra, a2, d2, s2, r2, false);
        let o = if s.two_pole { y2 } else { y4 } * e * v.gain;
        let o = o * v.onset.tick();
        left[i] += o * pl;
        right[i] += o * pr;
    }
}
