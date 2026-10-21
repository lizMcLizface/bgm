//! An Oberheim-OB-Xa-inspired eight-voice polysynth. Per voice: two oscillators (saw and
//! pulse, each or both; oscillator 2 detunable, hard-syncable to oscillator 1, and
//! optionally swept by the filter envelope) → mixer with noise → a resonant
//! low-pass that switches between a two-pole state-variable filter and a four-pole
//! cascade (the OB-Xa uses separate CEM3320 circuits) → VCA. A filter ADSR and an amplifier ADSR; one LFO (sine,
//! square, sample & hold in any combination) with separate destinations for frequency
//! (oscillator 1, 2, filter) and pulse width, a wheel vibrato on its own LFO, unison,
//! polyphonic portamento and key tracking. Two complete layers sit under the key modes
//! Whole, Double (both layers on every key) and Split, sharing the eight voices half and
//! half as the original does. Velocity and pressure routes are additions for piano
//! playing. An original interpretation, not a circuit model; units are estimates.
use crate::alloc::{choose, KeyStack, Slot};
use crate::dsp::*;

pub const VOICES: usize = 16;
/// Parameters of one layer.
pub const PARAMS: usize = 64;
/// Both layers (upper 0–63, lower 64–127) and the key-mode controls from 128.
pub const PAIR_PARAMS: usize = 144;
const TICK: usize = 16;

pub mod id {
    pub const OSC1_PITCH: usize = 0;
    pub const OSC1_SAW: usize = 1;
    pub const OSC1_PULSE: usize = 2;
    pub const OSC1_ON: usize = 3;
    pub const OSC2_PITCH: usize = 4;
    pub const OSC2_SAW: usize = 5;
    pub const OSC2_PULSE: usize = 6;
    pub const OSC2_MIX: usize = 7;
    pub const OSC2_DETUNE: usize = 8;
    pub const PW: usize = 9;
    pub const SYNC: usize = 10;
    pub const FENV_OSC2: usize = 11;
    pub const NOISE_ON: usize = 12;
    pub const CUTOFF: usize = 13;
    pub const RES: usize = 14;
    pub const ENV_AMOUNT: usize = 15;
    pub const POLES: usize = 16;
    pub const TRACK: usize = 17;
    pub const F_ATTACK: usize = 18;
    pub const F_DECAY: usize = 19;
    pub const F_SUSTAIN: usize = 20;
    pub const F_RELEASE: usize = 21;
    pub const A_ATTACK: usize = 22;
    pub const A_DECAY: usize = 23;
    pub const A_SUSTAIN: usize = 24;
    pub const A_RELEASE: usize = 25;
    pub const LFO_RATE: usize = 26;
    pub const LFO_SINE: usize = 27;
    pub const LFO_SQUARE: usize = 28;
    pub const LFO_SH: usize = 29;
    pub const LFO_FREQ_DEPTH: usize = 30;
    pub const LFO_TO_OSC1: usize = 31;
    pub const LFO_TO_OSC2: usize = 32;
    pub const LFO_TO_FILTER: usize = 33;
    pub const LFO_PW_DEPTH: usize = 34;
    pub const LFO_PW_OSC1: usize = 35;
    pub const LFO_PW_OSC2: usize = 36;
    pub const PORTAMENTO: usize = 37;
    pub const UNISON: usize = 38;
    pub const UNISON_DETUNE: usize = 39;
    pub const WHEEL_RATE: usize = 40;
    pub const WHEEL_DEPTH: usize = 41;
    pub const WHEEL_OSC1: usize = 42;
    pub const WHEEL_OSC2: usize = 43;
    pub const BEND_OSC2_ONLY: usize = 44;
    pub const TRANSPOSE: usize = 45;
    pub const TUNE: usize = 46;
    pub const VEL_FILTER: usize = 47;
    pub const VEL_AMP: usize = 48;
    pub const AFTER_FILTER: usize = 49;
    pub const VOLUME: usize = 50;
    pub const VOICES: usize = 51;
    pub const WIDTH: usize = 52;
    pub const SPREAD: usize = 53;
    pub const OVERSAMPLE: usize = 54;
}

const DEFAULTS: [(usize, f32); 26] = [
    (id::OSC1_SAW, 1.), (id::OSC1_ON, 1.), (id::OSC2_SAW, 1.), (id::OSC2_MIX, 2.), (id::OSC2_DETUNE, 6.), (id::PW, 0.),
    (id::CUTOFF, 1200.), (id::RES, 0.1), (id::ENV_AMOUNT, 0.35), (id::POLES, 1.), (id::F_ATTACK, 0.005), (id::F_DECAY, 0.6),
    (id::F_SUSTAIN, 0.4), (id::F_RELEASE, 0.4), (id::A_ATTACK, 0.003), (id::A_DECAY, 0.8), (id::A_SUSTAIN, 0.9),
    (id::A_RELEASE, 0.35), (id::LFO_RATE, 5.), (id::LFO_SINE, 1.), (id::UNISON_DETUNE, 0.3), (id::WHEEL_RATE, 5.),
    (id::VEL_FILTER, 0.4), (id::VEL_AMP, 0.5), (id::VOLUME, 0.57), (id::VOICES, 8.),
];

/// Resonance 0–1 → four-pole loop feedback, below self-oscillation.
fn feedback(resonance: f32) -> f32 {
    // Service manual, 3rd ed., p.18: back the resonance trimmer down until
    // oscillation stops. The 3.9 endpoint is an estimate below the k=4 threshold.
    3.9 * bound(resonance, 0., 1.)
}

#[derive(Clone, Copy)]
struct Setup {
    os: usize,
    srv: f32,
    w1: Waves,
    w2: Waves,
    mix1: f32,
    mix2: f32,
    noise: f32,
    sync: bool,
    two_pole: bool,
    e_f: [f32; 4],
    e_a: [f32; 4],
}
impl Setup {
    const ZERO: Self = Self {
        os: 1, srv: 48000., w1: Waves::NONE, w2: Waves::NONE, mix1: 0., mix2: 0., noise: 0., sync: false, two_pole: false,
        e_f: [1., 1., 0., 1.], e_a: [1., 1., 0., 1.],
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
    /// state of the pink-noise filter (the OB-Xa's noise source is pink)
    pink: [f32; 3],
    o1: VcOsc,
    o2: VcOsc,
    fenv: Adsr,
    aenv: Adsr,
    hp: f32,
    ladder: Ladder,
    svf: Svf,
    dt1: f32,
    dt1_d: f32,
    dt2: f32,
    dt2_d: f32,
    pw1: f32,
    pw1_d: f32,
    pw2: f32,
    pw2_d: f32,
    g: f32,
    g_d: f32,
    gain: f32,
    gain_d: f32,
    k: f32,
    pan: (f32, f32),
    tune: f32,
    cut: f32,
    trim: f32,
    time: f32,
    spread: f32,
}
impl Voice {
    const ZERO: Self = Self {
        onset: Onset::DONE,
        key: 0, note: 60., pitch: 60., velocity: 0., poly: 0., pressure: 0., down: false, held: false, active: false, fresh: true,
        stamp: 0, offset: 0., rng: Rng(1), pink: [0.; 3], o1: VcOsc::ZERO, o2: VcOsc::ZERO, fenv: Adsr::ZERO, aenv: Adsr::ZERO, hp: 0.,
        ladder: Ladder::ZERO, svf: Svf::ZERO, dt1: 0., dt1_d: 0., dt2: 0., dt2_d: 0., pw1: 0.5, pw1_d: 0., pw2: 0.5, pw2_d: 0., g: 0., g_d: 0.,
        gain: 0., gain_d: 0., k: 0., pan: (1., 1.), tune: 0., cut: 0., trim: 0., time: 1., spread: 0.,
    };
}

/// One layer: a complete OB-Xa patch with its own voices.
pub struct ObXa {
    sr: f32,
    pub p: [f32; PARAMS],
    dirty: bool,
    setup: Setup,
    voices: [Voice; VOICES],
    stamp: u32,
    until: usize,
    lfo: Lfo,
    wheel_lfo: f32,
    unison: bool,
    stack: KeyStack,
    playing: Option<u32>,
    dec: [HalfBand; 2],
    /// voices this layer may use (half the pool in double and split)
    limit: usize,
    bend_to: f32,
    bend: f32,
    pressure: f32,
    modulation: f32,
    modulation_s: f32,
    expression: f32,
    expression_s: f32,
    pedal: bool,
    pub steals: u32,
    shape_p: [f32; SHAPE_PARAMS],
    shapes: [EnvShape; 2],
}

impl ObXa {
    pub const fn new() -> Self {
        Self {
            sr: 48000., p: [0.; PARAMS], dirty: true, setup: Setup::ZERO, voices: [Voice::ZERO; VOICES], stamp: 0, until: 0,
            lfo: Lfo::new(0x3c6e_f372), wheel_lfo: 0., unison: false, stack: KeyStack::EMPTY, playing: None,
            dec: [HalfBand::ZERO; 2], limit: VOICES, bend_to: 0., bend: 0., pressure: 0., modulation: 0., modulation_s: 0.,
            expression: 1., expression_s: 1., pedal: false, steals: 0, shape_p: [0.; SHAPE_PARAMS], shapes: [EnvShape::NATIVE; 2],
        }
    }

    /// `salt` keeps the two layers' noise, tolerances and LFO apart.
    pub fn init(&mut self, sr: f32, salt: u32) {
        *self = Self::new();
        self.sr = sr;
        for &(i, v) in DEFAULTS.iter() {
            self.p[i] = v;
        }
        self.lfo = Lfo::new(0x3c6e_f372 ^ salt);
        let mut rng = Rng(0x2545_f491 ^ salt);
        for (n, v) in self.voices.iter_mut().enumerate() {
            let seed = (n as u32 + 1).wrapping_mul(0x9e37_79b9);
            v.rng = Rng(0x68e3_1da4 ^ salt ^ seed);
            v.tune = rng.next();
            v.cut = rng.next();
            v.trim = rng.next();
            v.time = rng.next();
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

    fn release_all(&mut self) {
        for v in self.voices.iter_mut().filter(|v| v.down || v.held) {
            Self::release(v);
        }
        self.stack = KeyStack::EMPTY;
        self.playing = None;
    }

    fn start(&mut self, index: usize, key: u32, note: f32, velocity: f32, offset: f32, retrigger: bool) {
        let porta = self.p[id::PORTAMENTO] > 0.;
        self.stamp = self.stamp.wrapping_add(1);
        let v = &mut self.voices[index];
        if !v.active {
            v.fresh = true;
            v.pressure = 0.;
            v.hp = 0.;
            v.ladder = Ladder::ZERO;
            v.svf = Svf::ZERO;
            // polyphonic portamento: a voice glides from the note it last played
            if !porta {
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
            v.fenv.attack();
            v.aenv.attack();
        }
        if !v.active {
            v.onset.arm();
        }
        v.active = true;
    }

    fn release(v: &mut Voice) {
        v.down = false;
        v.held = false;
        v.fenv.release();
        v.aenv.release();
    }

    fn lift(&mut self, key: u32) {
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

    /// Unison: every voice of the layer follows the newest held key, spread by the detune.
    fn unison_play(&mut self, key: u32, note: f32, velocity: f32, retrigger: bool) {
        let n = self.count();
        for i in 0..n {
            let offset = if n > 1 { 2. * i as f32 / (n - 1) as f32 - 1. } else { 0. };
            self.start(i, key, note, velocity, offset, retrigger);
        }
        for v in self.voices[n..].iter_mut().filter(|v| v.down || v.held) {
            Self::release(v);
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
        let n = self.count();
        let mut slots = [Slot { active: false, down: false, held: false, note: 0., stamp: 0, level: 0. }; VOICES];
        for (slot, v) in slots.iter_mut().zip(self.voices.iter()) {
            *slot = Slot { active: v.active, down: v.down, held: v.held, note: v.note, stamp: v.stamp, level: v.aenv.value };
        }
        let index = choose(&slots[..n], note);
        if self.voices[index].active && self.voices[index].down && self.voices[index].note != note {
            self.steals += 1;
        }
        self.start(index, key, note, velocity, 0., true);
    }

    pub fn note_off(&mut self, key: u32) {
        if self.unison {
            self.stack.remove(key);
            match self.stack.pick(1) {
                Some((k, n)) if self.playing != Some(k) => {
                    let velocity = self.voices[0].velocity;
                    self.unison_play(k, n, velocity, false);
                }
                Some(_) => {}
                None => {
                    let pedal = self.pedal;
                    for v in self.voices.iter_mut().filter(|v| v.active && v.down) {
                        if pedal {
                            v.down = false;
                            v.held = true;
                        } else {
                            Self::release(v);
                        }
                    }
                    self.playing = None;
                }
            }
            return;
        }
        self.lift(key);
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
            v.fenv = Adsr::ZERO;
            v.aenv = Adsr::ZERO;
            v.hp = 0.;
            v.ladder = Ladder::ZERO;
            v.svf = Svf::ZERO;
        }
        self.stack = KeyStack::EMPTY;
        self.playing = None;
        self.dec = [HalfBand::ZERO; 2];
        self.pedal = false;
    }

    fn prepare(&mut self) {
        let p = &self.p;
        let on = |i: usize| if p[i] >= 0.5 { 1. } else { 0. };
        let sync = p[id::SYNC] >= 0.5;
        let os = match bound(p[id::OVERSAMPLE], 0., 2.).round() as u32 {
            0 => 1,
            2 => 2,
            _ => if sync { 2 } else { 1 },
        };
        if os != self.setup.os {
            self.dec = [HalfBand::ZERO; 2];
        }
        if (p[id::POLES] < 0.5) != self.setup.two_pole {
            // The inactive topology must not replay stale integrator state.
            for v in self.voices.iter_mut() {
                v.ladder = Ladder::ZERO;
                v.svf = Svf::ZERO;
            }
        }
        let srv = self.sr * os as f32;
        let env = |a: usize| [
            attack_coefficient(bound(p[a], 0.0005, 20.), srv),
            fall_coefficient(bound(p[a + 1], 0.001, 30.), srv),
            bound(p[a + 2], 0., 1.),
            fall_coefficient(bound(p[a + 3], 0.001, 30.), srv),
        ];
        // oscillator 2's mixer: off, half, full
        let mix2 = [0., 0.5, 1.][bound(p[id::OSC2_MIX], 0., 2.).round() as usize];
        self.setup = Setup {
            os,
            srv,
            w1: Waves { saw: on(id::OSC1_SAW), pulse: on(id::OSC1_PULSE), tri: 0., sine: 0. },
            w2: Waves { saw: on(id::OSC2_SAW), pulse: on(id::OSC2_PULSE), tri: 0., sine: 0. },
            mix1: on(id::OSC1_ON),
            mix2,
            noise: 0.5 * on(id::NOISE_ON),
            sync,
            two_pole: p[id::POLES] < 0.5,
            e_f: env(id::F_ATTACK),
            e_a: env(id::A_ATTACK),
        };
        let unison = p[id::UNISON] >= 0.5;
        if unison != self.unison {
            self.release_all();
            self.unison = unison;
        }
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
        let ts = TICK as f32 / sr;
        let rate = sr / TICK as f32;
        let p = self.p;
        let fast = smoothing(0.006, rate);
        self.bend += (self.bend_to - self.bend) * fast;
        self.expression_s += (self.expression - self.expression_s) * fast;
        self.modulation_s += (self.modulation - self.modulation_s) * fast;
        // the LFO: sine, square and sample & hold, summed when more than one is on
        let held = self.lfo.step(bound(p[id::LFO_RATE], 0.01, 50.) * ts, LFO_SAMPLE_HOLD);
        let t = self.lfo.phase;
        let on = |i: usize| p[i] >= 0.5;
        let (mut lfo, mut count) = (0., 0.);
        if on(id::LFO_SINE) {
            lfo += sin_turns(t);
            count += 1.;
        }
        if on(id::LFO_SQUARE) {
            lfo += if t < 0.5 { 1. } else { -1. };
            count += 1.;
        }
        if on(id::LFO_SH) {
            lfo += held;
            count += 1.;
        }
        if count > 1. {
            lfo /= count;
        }
        // the wheel has its own vibrato LFO
        self.wheel_lfo = (self.wheel_lfo + bound(p[id::WHEEL_RATE], 0.1, 20.) * ts).fract();
        let vibrato = bound(p[id::WHEEL_DEPTH], 0., 1.) * self.modulation_s * sin_turns(self.wheel_lfo);
        let depth = bound(p[id::LFO_FREQ_DEPTH], 0., 1.);
        // Calibrated on the factory patch book: most programs set the knob near 2 for a gentle vibrato
        // (about ±10 cents here) and a full knob makes sirens (±1 octave), hence the cube law.
        let pitch_mod = 12. * depth * depth * depth * lfo;
        let (lfo1, lfo2) = (if on(id::LFO_TO_OSC1) { pitch_mod } else { 0. }, if on(id::LFO_TO_OSC2) { pitch_mod } else { 0. });
        let wheel1 = if on(id::WHEEL_OSC1) { 1.0 * vibrato } else { 0. };
        let wheel2 = if on(id::WHEEL_OSC2) { 1.0 * vibrato } else { 0. };
        // filter sweeps: up to 5 octaves, square law (knob 2-3 is a slow wah, not a full octave)
        let filter_mod = if on(id::LFO_TO_FILTER) { 5. * depth * depth * lfo } else { 0. };
        let pw_depth = bound(p[id::LFO_PW_DEPTH], 0., 1.) * lfo;
        let (pw_l1, pw_l2) = (if on(id::LFO_PW_OSC1) { 0.45 * pw_depth } else { 0. }, if on(id::LFO_PW_OSC2) { 0.45 * pw_depth } else { 0. });
        // the host sends the bend in semitones; "osc 2 only" bends just the second oscillator
        let (bend1, bend2) = if on(id::BEND_OSC2_ONLY) { (0., self.bend) } else { (self.bend, self.bend) };
        let transpose = bound(p[id::TRANSPOSE], -24., 24.);
        let tune = bound(p[id::TUNE], -100., 100.) / 100.;
        let pitch1 = bound(p[id::OSC1_PITCH], -24., 72.);
        let pitch2 = bound(p[id::OSC2_PITCH], -24., 72.) + bound(p[id::OSC2_DETUNE], -100., 100.) / 100.;
        // service manual, voice card calibration: with the filter modulation knob full, the envelope moves
        // oscillator 2 exactly one octave
        let fenv_osc2 = if on(id::FENV_OSC2) { 12. * bound(p[id::ENV_AMOUNT], 0., 1.) } else { 0. };
        // [est, from the factory patch book] Without sync the envelope's rise above its sustain moves the
        // pitch, so held notes settle back in tune: the book's unsynced programs with full sustain (Sax,
        // F-ENV Horns, Soft Piano) are tuned instruments, which a sustained offset of semitones is not.
        // With sync the offset is timbre, and the whole envelope sweeps.
        let fenv_floor = if on(id::SYNC) { 0. } else { bound(p[id::F_SUSTAIN], 0., 1.) };
        let width = 0.5 - 0.46 * bound(p[id::PW], 0., 1.);
        let porta = bound(p[id::PORTAMENTO], 0., 10.);
        let porta_k = if porta > 0. { smoothing(porta / 3., rate) } else { 1. };
        let detune = 0.25 * bound(p[id::UNISON_DETUNE], 0., 1.);
        let spread = bound(p[id::SPREAD], 0., 1.);
        let track = bound(p[id::TRACK], 0., 1.2);
        let base = log2(bound(p[id::CUTOFF], 10., 30000.)) + filter_mod;
        let env_oct = 10. * bound(p[id::ENV_AMOUNT], 0., 1.);
        let (vel_f, vel_a) = (bound(p[id::VEL_FILTER], 0., 1.), bound(p[id::VEL_AMP], 0., 1.));
        let after_f = bound(p[id::AFTER_FILTER], 0., 1.);
        let k = feedback(p[id::RES]);
        let stereo = bound(p[id::WIDTH], 0., 1.);
        let volume = bound(p[id::VOLUME], 0., 1.);
        // The SVF has unity small-signal DC gain at every resonance; it does
        // not need the cascade's estimated passband-loss compensation.
        let compensation = if s.two_pole { 1. } else { 1. + 0.3 * k };
        let master = volume * volume * self.expression_s * 0.5 * compensation;
        let press_k = smoothing(0.025, rate);
        let channel_pressure = self.pressure;
        let inv = 1. / (TICK * s.os) as f32;
        for v in self.voices.iter_mut().filter(|v| v.active) {
            v.pressure += (v.poly.max(channel_pressure) - v.pressure) * press_k;
            v.pitch += (v.note - v.pitch) * porta_k;
            let fe = v.fenv.value;
            let pitch = v.pitch + transpose + tune + detune * v.offset + 0.06 * spread * v.tune;
            let dt1 = (note_hz(pitch + pitch1 + bend1 + lfo1 + wheel1) / srv).min(0.45);
            let dt2 = (note_hz(pitch + pitch2 + bend2 + lfo2 + wheel2 + fenv_osc2 * (fe - fenv_floor).max(0.)) / srv).min(0.45);
            let pw1 = (width + pw_l1).clamp(0.02, 0.98);
            let pw2 = (width + pw_l2).clamp(0.02, 0.98);
            // key tracking counts from the lowest key (C2 on the 61-key keyboard)
            let cut = base + track * (v.pitch - 36.) / 12. + env_oct * (1. - vel_f * (1. - v.velocity)) * fe + 3. * after_f * v.pressure
                + 0.3 * spread * v.cut;
            let hz = exp2(cut);
            let g = warp(hz, srv);
            let gain = master * (1. - vel_a * (1. - v.velocity)) * (1. + 0.08 * spread * v.trim);
            v.pan = pan(stereo * v.spread);
            v.k = if s.two_pole {
                // Positive damping: a resonant peak, never a free oscillator.
                // The control taper and maximum Q remain estimates.
                damping(p[id::RES])
            } else {
                k * (1. - ((hz - 0.3 * sr) / (0.15 * sr)).clamp(0., 1.))
            };
            if v.fresh {
                v.fresh = false;
                v.dt1 = dt1;
                v.dt2 = dt2;
                v.pw1 = pw1;
                v.pw2 = pw2;
                v.g = g;
                v.gain = gain;
            }
            v.dt1_d = (dt1 - v.dt1) * inv;
            v.dt2_d = (dt2 - v.dt2) * inv;
            v.pw1_d = (pw1 - v.pw1) * inv;
            v.pw2_d = (pw2 - v.pw2) * inv;
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
            let vintage = 1.;
            let mut l2 = [0f32; 2 * TICK];
            let mut r2 = [0f32; 2 * TICK];
            let len = m * s.os;
            for v in self.voices.iter_mut().filter(|v| v.active) {
                if s.os == 2 {
                    render_voice(v, &s, &self.shapes, vintage, &mut l2[..len], &mut r2[..len]);
                } else {
                    render_voice(v, &s, &self.shapes, vintage, &mut left[at..at + m], &mut right[at..at + m]);
                }
                if v.aenv.stage == IDLE {
                    v.active = false;
                    v.down = false;
                    v.held = false;
                    v.fenv = Adsr::ZERO;
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

#[inline(always)]
fn render_voice(v: &mut Voice, s: &Setup, shapes: &[EnvShape; 2], vintage: f32, left: &mut [f32], right: &mut [f32]) {
    let time = 1. + 0.12 * vintage * v.time;
    let c = |x: f32| (x / time).min(1.);
    let [fa, fd, fs, fr] = s.e_f;
    let [aa, ad, as_, ar] = s.e_a;
    let (fa, fd, fr, aa, ad, ar) = (c(fa), c(fd), c(fr), c(aa), c(ad), c(ar));
    let (rf, ra) = (shapes[1].rates(fa, fd, fr, false), shapes[0].rates(aa, ad, ar, false));
    let (pl, pr) = v.pan;
    for i in 0..left.len() {
        v.dt1 += v.dt1_d;
        v.dt2 += v.dt2_d;
        v.pw1 += v.pw1_d;
        v.pw2 += v.pw2_d;
        v.g += v.g_d;
        v.gain += v.gain_d;
        // oscillator 1 is the master; oscillator 2 resets with it when synced
        let (o1, wrap) = v.o1.step(v.dt1, v.pw1, &s.w1, 0.);
        let (o2, _) = v.o2.step(v.dt2, v.pw2, &s.w2, if s.sync { wrap } else { 0. });
        let white = v.rng.next();
        // Paul Kellet's three-pole pink filter, scaled to the white noise's loudness
        v.pink[0] = 0.99765 * v.pink[0] + white * 0.099_046;
        v.pink[1] = 0.963 * v.pink[1] + white * 0.296_516_4;
        v.pink[2] = 0.57 * v.pink[2] + white * 1.052_691_3;
        let noise = 0.35 * (v.pink[0] + v.pink[1] + v.pink[2] + white * 0.1848);
        let x = 0.45 * (s.mix1 * o1 + s.mix2 * o2 + s.noise * noise);
        // The two-pole circuit (voice schematic 1520C, U5) is an SVF, not
        // an output tap of the four-pole circuit (U6), unlike the Jupiter-8.
        let filtered = if s.two_pole { v.svf.tick(x, v.g, v.k).0 } else { v.ladder.tick(x, v.g, v.k) };
        v.fenv.run(&shapes[1], &rf, fa, fd, fs, fr, false);
        let e = v.aenv.run(&shapes[0], &ra, aa, ad, as_, ar, false);
        let o = filtered * e * v.gain;
        let o = o * v.onset.tick();
        left[i] += o * pl;
        right[i] += o * pr;
    }
}

pub mod key_mode {
    pub const MODE: usize = 128;
    pub const SPLIT_POINT: usize = 129;
    pub const BALANCE: usize = 130;
    pub const WHOLE: u32 = 0;
    pub const DOUBLE: u32 = 1;
    pub const SPLIT: u32 = 2;
}

/// The whole instrument: an upper and a lower layer. Whole plays the upper layer alone;
/// Double sounds both on every key; Split sends keys below the split point to the lower
/// layer. In Double and Split the layers share the voices half and half, and Balance sets
/// their levels.
pub struct ObXa2 {
    pub upper: ObXa,
    pub lower: ObXa,
    mode: u32,
    split: f32,
    balance: f32,
    pub steals: u32,
}

impl ObXa2 {
    pub const fn new() -> Self {
        Self { upper: ObXa::new(), lower: ObXa::new(), mode: key_mode::WHOLE, split: 60., balance: 0.5, steals: 0 }
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
            key_mode::DOUBLE => {
                self.upper.note_on(key, note, velocity);
                self.lower.note_on(key, note, velocity);
            }
            key_mode::SPLIT if note < self.split => self.lower.note_on(key, note, velocity),
            _ => self.upper.note_on(key, note, velocity),
        }
    }

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
