//! Original four/six-operator phase-modulation engine. Not a DX-ROM emulator.
#![allow(static_mut_refs)]
#[path = "../../common/denormal.rs"]
mod denormal;
use std::f32::consts::PI;
#[path = "../../common/colour.rs"]
mod colour;
#[path = "../../common/headroom.rs"]
mod headroom;
#[path = "../../common/notes.rs"]
mod notes;
#[cfg(any(feature = "simd-voices", feature = "simd-colour"))]
#[path = "../../common/simd.rs"]
mod simd;
#[cfg(feature = "simd-voices")]
mod simd_voices;
const VOICES: usize = 32;
const OPS: usize = 6;
const OP_PARAMS: usize = 22;
const GLOBAL: usize = 54;
const LUT: usize = 4096;
const BLOCK: usize = 2048;
const QUEUE: usize = 4096;
fn bounded(x: f32, lo: f32, hi: f32) -> f32 {
    if x.is_finite() {
        x.clamp(lo, hi)
    } else {
        lo
    }
}
#[derive(Clone, Copy)]
struct Envelope {
    value: f32,
    start: f32,
    target: f32,
    left: u32,
    total: u32,
    stage: u8,
}
impl Envelope {
    const ZERO: Self = Self {
        value: 0.,
        start: 0.,
        target: 0.,
        left: 0,
        total: 0,
        stage: 0,
    };
    fn segment(&mut self, target: f32, seconds: f32, sr: f32, stage: u8) {
        self.start = self.value;
        self.target = target;
        self.total = (seconds * sr).max(1.) as u32;
        self.left = self.total;
        self.stage = stage;
    }
    fn trigger(&mut self, p: &[f32; OP_PARAMS], sr: f32) {
        *self = Self::ZERO;
        self.segment(p[6], p[4], sr, 1);
    }
    fn release(&mut self, p: &[f32; OP_PARAMS], sr: f32) {
        if self.stage != 0 && self.stage != 4 {
            self.segment(0., p[10], sr, 4);
        }
    }
    #[cfg_attr(feature = "profile-sections", inline(never))]
    fn next(&mut self, p: &[f32; OP_PARAMS], sr: f32) -> f32 {
        if self.stage == 0 {
            return 0.;
        }
        if self.stage == 5 {
            self.value += (p[9] - self.value) * 0.001;
            return self.value;
        }
        self.left = self.left.saturating_sub(1);
        let fraction = 1. - self.left as f32 / self.total.max(1) as f32;
        // Smooth exponential-like interpolation, with exact segment endpoints.
        let shaped = if p[21] >= 0.5 {
            fraction
        } else if self.target < self.start {
            1. - (1. - fraction).powi(3)
        } else {
            fraction
        };
        let curve = p[if self.stage == 1 {
            18
        } else if self.stage == 4 {
            20
        } else {
            19
        }];
        let shaped = if curve == 1. {
            shaped
        } else {
            shaped.powf(curve)
        };
        self.value = self.start + (self.target - self.start) * shaped;
        if self.left == 0 {
            match self.stage {
                1 => self.segment(p[8], p[5], sr, 2),
                2 => self.segment(p[9], p[7], sr, 3),
                3 => self.stage = 5,
                4 => *self = Self::ZERO,
                _ => {}
            }
        }
        self.value
    }
}
#[derive(Clone, Copy)]
struct Expression {
    value: f32,
    start: f32,
    phase: f32,
    stage: u8,
    random: u32,
    random_phase: f32,
    from: f32,
    to: f32,
    routes: [f32; 11],
}
impl Expression {
    const ZERO: Self = Self {
        value: 0.,
        start: 0.,
        phase: 0.,
        stage: 0,
        random: 0,
        random_phase: 0.,
        from: 0.,
        to: 0.,
        routes: [0.; 11],
    };
    fn trigger(&mut self, id: u32) {
        *self = Self {
            stage: 1,
            random: id.wrapping_mul(2654435761).max(1),
            ..Self::ZERO
        };
        self.to = self.random();
    }
    fn random(&mut self) -> f32 {
        self.random ^= self.random << 13;
        self.random ^= self.random >> 17;
        self.random ^= self.random << 5;
        (self.random as f64 / u32::MAX as f64) as f32 * 2. - 1.
    }
    fn release(&mut self) {
        if self.stage > 0 && self.stage != 4 {
            self.start = self.value;
            self.phase = 0.;
            self.stage = 4;
        }
    }
    #[cfg_attr(feature = "profile-sections", inline(never))]
    fn tick(&mut self, p: &[f32; GLOBAL], sr: f32, alpha: f32, motion: bool) -> f32 {
        if self.stage == 1 || self.stage == 2 || self.stage == 4 {
            let time = p[match self.stage {
                1 => 19,
                2 => 20,
                _ => 22,
            }];
            self.phase = (self.phase + 1. / (time * sr)).min(1.);
            self.value = match self.stage {
                1 => self.phase.powf(p[23]),
                2 => 1. + (p[21] - 1.) * self.phase.powf(p[24]),
                _ => self.start * (1. - self.phase).powf(p[25]),
            };
            if self.phase >= 1. {
                self.phase = 0.;
                self.stage = match self.stage {
                    1 => 2,
                    2 => 3,
                    _ => 0,
                };
            }
        } else if self.stage == 3 {
            self.value += (p[21] - self.value) * alpha;
        }
        if !motion {
            return 0.;
        }
        self.random_phase += p[26] / sr;
        if self.random_phase >= 1. {
            self.random_phase -= 1.;
            self.from = self.to;
            self.to = self.random();
        }
        let t = self.random_phase * self.random_phase * (3. - 2. * self.random_phase);
        self.from + (self.to - self.from) * t
    }
}
#[derive(Clone, Copy)]
struct Voice {
    id: u32,
    active: bool,
    gate: bool,
    age: u64,
    midi: f32,
    target: f32,
    glide: u32,
    velocity: f32,
    pressure: f32,
    velocity_target: f32,
    pressure_target: f32,
    phase: [f32; OPS],
    env: [Envelope; OPS],
    expression: Expression,
    previous: [[f32; 8]; OPS],
    feedback_pos: usize,
    step: [f32; OPS],
    scale: [f32; OPS],
    rate: [f32; OPS],
    last: [f32; 2],
    tail: [f32; 2],
    fade: u32,
}
impl Voice {
    const ZERO: Self = Self {
        id: 0,
        active: false,
        gate: false,
        age: 0,
        midi: 0.,
        target: 0.,
        glide: 0,
        velocity: 0.,
        pressure: 0.,
        velocity_target: 0.,
        pressure_target: 0.,
        phase: [0.; OPS],
        env: [Envelope::ZERO; OPS],
        expression: Expression::ZERO,
        previous: [[0.; 8]; OPS],
        feedback_pos: 0,
        step: [0.; OPS],
        scale: [0.; OPS],
        rate: [0.; OPS],
        last: [0.; 2],
        tail: [0.; 2],
        fade: 0,
    };
}
#[derive(Clone, Copy)]
struct Event {
    kind: u32,
    id: u32,
    frame: u64,
    a: f32,
    b: f32,
}
impl Event {
    const ZERO: Self = Self {
        kind: 0,
        id: 0,
        frame: 0,
        a: 0.,
        b: 0.,
    };
}
struct Fm {
    colours: [colour::Colour; VOICES],
    output: [[f32; BLOCK]; 2],
    idle_reference: bool,
    note_mode: u32,
    portamento: f32,
    always_glide: bool,
    mono_seen: bool,
    notes: notes::Notes,

    sr: f32,
    frame: u64,
    g: [f32; GLOBAL],
    p: [[f32; OP_PARAMS]; OPS],
    routing: [[f32; OPS]; OPS],
    carriers: [f32; OPS],
    voices: [Voice; VOICES],
    queue: [Event; QUEUE],
    head: usize,
    len: usize,
    pedal: bool,
    steals: u32,
    dropped: u32,
    late: u32,
    peak: f32,
    sine: [f32; LUT + 1],
    lfo: f32,
    lfo2: f32,
    bend: f32,
    fir: [f32; 63],
    history: [[f32; 64]; 2],
    fir_pos: usize,
    fir_len: usize,
    headroom: headroom::Headroom,
    dc_in: [f32; 2],
    dc_out: [f32; 2],
    pan: [[f32; 2]; OPS],
    smooth: [f32; 3],
    levels: [f32; OPS],
}
impl Fm {
    const fn new() -> Self {
        Self {
            colours: [colour::Colour::ZERO; VOICES],
            output: [[0.; BLOCK]; 2],
            idle_reference: false,
            note_mode: 0,
            portamento: 0.,
            always_glide: false,
            mono_seen: false,
            notes: notes::Notes::new(),
            sr: 0.,
            frame: 0,
            g: [0.; GLOBAL],
            p: [[0.; OP_PARAMS]; OPS],
            routing: [[0.; OPS]; OPS],
            carriers: [0.; OPS],
            voices: [Voice::ZERO; VOICES],
            queue: [Event::ZERO; QUEUE],
            head: 0,
            len: 0,
            pedal: false,
            steals: 0,
            dropped: 0,
            late: 0,
            peak: 0.,
            sine: [0.; LUT + 1],
            lfo: 0.,
            lfo2: 0.,
            bend: 0.,
            fir: [0.; 63],
            history: [[0.; 64]; 2],
            fir_pos: 0,
            fir_len: 0,
            headroom: headroom::Headroom::new(),
            dc_in: [0.; 2],
            dc_out: [0.; 2],
            pan: [[0.; 2]; OPS],
            smooth: [0.; 3],
            levels: [0.; OPS],
        }
    }
    fn factor(&self) -> usize {
        match self.g[4] as u32 {
            1 => 2,
            2 => 4,
            _ => 1,
        }
    }
    fn count(&self) -> usize {
        if self.g[0] >= 5. {
            6
        } else {
            4
        }
    }
    fn init(&mut self, sr: f32) {
        self.idle_reference = false;
        self.note_mode = 0;
        self.portamento = 0.;
        self.always_glide = false;
        self.mono_seen = false;
        self.notes.clear();
        self.sr = bounded(sr, 8000., 192000.);
        self.headroom.init(self.sr);
        self.g = [0.; GLOBAL];
        self.g[..41].copy_from_slice(&[
            6., 2., 16., 0.22, 1., 0.1, 0., 1., 0., 0., 5., 0., 0., 1., 0.7, 0., 0.15, 0., 0., 1.5,
            2., 0.5, 2., 1., 1., 2., 0.15, 0., 0.15, 0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0.,
            0.,
        ]);
        self.g[41..54].copy_from_slice(&colour::DEFAULTS);
        self.smooth = [self.g[3], self.g[5], self.g[7]];
        for i in 0..=LUT {
            self.sine[i] = (i as f32 * 2. * PI / LUT as f32).sin();
        }
        for op in 0..OPS {
            self.p[op] = [
                1., 0., 0., 1., 0.005, 0.6, 1., 2., 0.5, 0.3, 0.8, 0.5, 0., 0., 0., 0., 1., 0., 1.,
                1., 1., 0.,
            ];
            self.levels[op] = self.p[op][3];
            self.carriers[op] = if op % 2 == 1 { 1. } else { 0. };
            for j in 0..OPS {
                self.routing[op][j] = if op % 2 == 0 && j == op + 1 { 1. } else { 0. };
            }
            self.refresh(op);
        }
        self.frame = 0;
        self.lfo = 0.;
        self.lfo2 = 0.;
        self.bend = 0.;
        self.steals = 0;
        self.dropped = 0;
        self.late = 0;
        self.panic();
        self.filter();
    }
    fn refresh(&mut self, op: usize) {
        let p = self.p[op][15] * self.g[14];
        self.pan[op] = [((1. - p) * 0.5).sqrt(), ((1. + p) * 0.5).sqrt()];
    }
    fn filter(&mut self) {
        let factor = self.factor();
        self.history = [[0.; 64]; 2];
        self.fir_pos = 0;
        self.fir_len = if factor == 1 {
            1
        } else if factor == 2 {
            31
        } else {
            63
        };
        self.fir.fill(0.);
        if factor == 1 {
            self.fir[0] = 1.;
            return;
        }
        let cutoff = 0.45 / factor as f32;
        let m = (self.fir_len - 1) as f32 * 0.5;
        let mut sum = 0.;
        for i in 0..self.fir_len {
            let x = i as f32 - m;
            let ideal = if x.abs() < 0.001 {
                2. * cutoff
            } else {
                (2. * PI * cutoff * x).sin() / (PI * x)
            };
            let w = 0.42 - 0.5 * (2. * PI * i as f32 / (self.fir_len - 1) as f32).cos()
                + 0.08 * (4. * PI * i as f32 / (self.fir_len - 1) as f32).cos();
            self.fir[i] = ideal * w;
            sum += self.fir[i];
        }
        for i in 0..self.fir_len {
            self.fir[i] /= sum;
        }
    }
    fn param(&mut self, index: usize, value: f32) {
        if index >= GLOBAL || !value.is_finite() {
            return;
        }
        let bounds = [
            (4., 6.),
            (0., 5.),
            (1., 32.),
            (0., 0.6),
            (0., 2.),
            (0., 1.),
            (0., 5.),
            (0., 3.),
            (-12., 12.),
            (0., 1.),
            (0.01, 10.),
            (0., 100.),
            (0., 1.),
            (0., 1.),
            (0., 1.),
            (-24., 24.),
            (0., 8.),
            (0., 1.),
            (0., 1.),
        ];
        let (lo, hi) = if index < 19 {
            bounds[index]
        } else {
            match index {
                19 | 20 | 22 => (0.002, 12.),
                21 => (0., 1.),
                23..=25 => (0.25, 4.),
                26 => (0.01, 2.),
                27 => (0., 20.),
                28 => (0.01, 10.),
                41..=53 => colour::range(index - 41),
                _ => match (index - 29) % 3 {
                    0 => (0., 8.),
                    1 => (0., 11.),
                    _ => (-1., 1.),
                },
            }
        };
        let discrete = ((29..=40).contains(&index) && (index - 29) % 3 != 2) || index == 49;
        let v = if discrete {
            value.round().clamp(lo, hi)
        } else {
            value.clamp(lo, hi)
        };
        if self.g[index] == v {
            return;
        }
        self.g[index] = v;
        if !self.voices.iter().any(|v| v.active) {
            match index {
                3 => self.smooth[0] = v,
                5 => self.smooth[1] = v,
                7 => self.smooth[2] = v,
                _ => {}
            }
        }
        if index == 14 {
            for op in 0..OPS {
                self.refresh(op);
            }
        }
        if index == 4 {
            self.filter();
        }
    }
    fn op(&mut self, op: usize, index: usize, value: f32) {
        if op >= OPS || index >= OP_PARAMS || !value.is_finite() {
            return;
        }
        let bounds = [
            (0.25, 32.),
            (0., 16000.),
            (-50., 50.),
            (0., 8.),
            (0.002, 8.),
            (0., 12.),
            (0., 1.),
            (0.002, 16.),
            (0., 1.),
            (0., 1.),
            (0.002, 12.),
            (0., 1.),
            (-1., 1.),
            (0., 1.),
            (0., 2.),
            (-1., 1.),
            (0., 1.),
            (0., 3.),
        ];
        self.p[op][index] = if index < 18 {
            value.clamp(bounds[index].0, bounds[index].1)
        } else if index == 21 {
            value.round().clamp(0., 1.)
        } else {
            value.clamp(0.25, 4.)
        };
        if index == 3 && !self.voices.iter().any(|v| v.active) {
            self.levels[op] = self.p[op][3];
        }
        self.refresh(op);
    }
    fn enqueue(&mut self, kind: u32, id: u32, frame: f64, a: f32, b: f32) -> u32 {
        if !frame.is_finite() || frame < 0. || !a.is_finite() || !b.is_finite() {
            return 0;
        }
        if self.len == QUEUE && self.head > 0 {
            self.queue.copy_within(self.head..self.len, 0);
            self.len -= self.head;
            self.head = 0;
        }
        if self.len == QUEUE {
            self.dropped += 1;
            return 0;
        }
        let frame = frame as u64;
        if frame < self.frame {
            self.late += 1;
        }
        let event = Event {
            kind,
            id,
            frame: frame.max(self.frame),
            a,
            b,
        };
        let mut at = self.len;
        while at > self.head && self.queue[at - 1].frame > event.frame {
            self.queue[at] = self.queue[at - 1];
            at -= 1;
        }
        self.queue[at] = event;
        self.len += 1;
        1
    }
    fn release(&mut self, index: usize) {
        self.voices[index].gate = false;
        if !self.pedal {
            self.voices[index].expression.release();
            for op in 0..OPS {
                let sr = self.sr * self.factor() as f32 / self.voices[index].rate[op].max(0.01);
                self.voices[index].env[op].release(&self.p[op], sr);
            }
        }
    }
    fn event(&mut self, mut e: Event) {
        // Event 6 is an additive, sample-timed note-behavior configuration.
        if e.kind == 6 {
            let mode = e.id.min(2);
            if mode != self.note_mode {
                self.voices = [Voice::ZERO; VOICES];
                self.notes.clear();
                self.mono_seen = false;
                self.pedal = false;
            }
            self.note_mode = mode;
            self.portamento = e.a.clamp(0., 3.);
            self.always_glide = e.b >= 0.5;
            return;
        }
        if self.note_mode != 0 && e.kind <= 2 {
            match self.notes.event(e.kind, e.id, e.a, e.b) {
                notes::Action::None => return,
                notes::Action::Release => {
                    self.release(0);
                    return;
                }
                notes::Action::Select(key) => {
                    if !self.voices[0].active {
                        e = Event {
                            kind: 0,
                            id: key.id,
                            a: key.midi,
                            b: key.velocity,
                            ..e
                        };
                    } else {
                        let factor = self.factor();
                        let v = &mut self.voices[0];
                        let overlap = v.gate;
                        let seconds = if overlap || self.always_glide {
                            self.portamento
                        } else {
                            0.
                        };
                        // A legato voice is already sounding: never add a
                        // second copy of its last sample over the continuing tone.
                        v.id = key.id;
                        v.gate = true;
                        v.velocity_target = key.velocity;
                        v.pressure_target = 0.;

                        v.target = key.midi;
                        v.glide = (seconds * self.sr * factor as f32) as u32;
                        if v.glide == 0 {
                            v.midi = key.midi;
                        }
                        if self.note_mode == 1 || !overlap {
                            v.velocity = v.velocity_target;
                            v.pressure = v.pressure_target;
                            v.age = self.frame;
                            v.tail = v.last;
                            v.fade = 64 * factor as u32;
                            v.expression.trigger(key.id);
                            if self.g[13] >= 0.5 {
                                v.phase = [0.; OPS];
                                v.previous = [[0.; 8]; OPS];
                                v.feedback_pos = 0;
                            }
                            for op in 0..OPS {
                                v.rate[op] = 2_f32.powf(self.p[op][13] * (key.midi - 60.) / 24.);
                                v.env[op].trigger(
                                    &self.p[op],
                                    self.sr * factor as f32 / v.rate[op].max(0.01),
                                );
                            }
                        }
                        return;
                    }
                }
            }
        }
        if self.note_mode != 0 && e.kind == 5 {
            self.notes.retune(e.id, e.a.clamp(0., 127.));
        }
        match e.kind {
            0 => {
                if e.id == 0 {
                    return;
                }
                let cap = if self.note_mode == 0 {
                    self.g[2] as usize
                } else {
                    1
                };
                let index = (0..cap)
                    .find(|&i| !self.voices[i].active)
                    .unwrap_or_else(|| {
                        self.steals += 1;
                        (0..cap)
                            .min_by(|&a, &b| {
                                let score = |v: &Voice| {
                                    let level = (0..OPS)
                                        .map(|op| {
                                            v.env[op].value
                                                * self.p[op][3]
                                                * self.carriers[op]
                                                * v.velocity
                                        })
                                        .sum::<f32>()
                                        .min(1.);
                                    (if v.gate { 2. } else { 0. }) + level
                                };
                                score(&self.voices[a])
                                    .partial_cmp(&score(&self.voices[b]))
                                    .unwrap()
                                    .then(self.voices[a].age.cmp(&self.voices[b].age))
                            })
                            .unwrap_or(0)
                    });
                let mut v = Voice::ZERO;
                v.id = e.id;
                v.active = true;
                v.gate = true;
                v.midi = bounded(e.a, 0., 127.);
                v.target = v.midi;
                v.velocity = bounded(e.b, 0., 1.);
                v.velocity_target = v.velocity;
                v.age = self.frame;
                v.tail = self.voices[index].last;
                v.fade = 64 * self.factor() as u32;
                v.expression.trigger(e.id);
                self.colours[index].init(self.sr * self.factor() as f32, e.id, &self.g[41..54]);
                for op in 0..OPS {
                    let p = &self.p[op];
                    v.rate[op] = 2_f32.powf(p[13] * (v.midi - 60.) / 24.);
                    v.env[op].trigger(p, self.sr * self.factor() as f32 / v.rate[op]);
                    if self.g[13] < 0.5 {
                        v.phase[op] = ((self.frame as f32 * 0.00019
                            + op as f32 * 0.131
                            + e.id as f32 * 0.177)
                            .fract()
                            + 1.)
                            .fract();
                    }
                }
                if self.note_mode != 0 {
                    if self.mono_seen && self.always_glide && self.portamento > 0. {
                        v.midi = self.voices[0].midi;

                        v.glide = (self.portamento * self.sr * self.factor() as f32) as u32;
                    }
                    self.mono_seen = true;
                }
                self.voices[index] = v;
            }
            1 => {
                for i in 0..VOICES {
                    if self.voices[i].active && self.voices[i].id == e.id {
                        self.release(i);
                    }
                }
            }
            2 => {
                let old = self.pedal;
                self.pedal = e.a >= 0.5;
                if old && !self.pedal {
                    for i in 0..VOICES {
                        if self.voices[i].active && !self.voices[i].gate {
                            self.release(i);
                        }
                    }
                }
            }
            3 => {
                for v in &mut self.voices {
                    if e.id == 0 || v.id == e.id {
                        v.pressure = bounded(e.a, 0., 1.);
                        v.pressure_target = v.pressure;
                    }
                }
            }
            4 => self.panic(),
            5 => {
                let factor = self.factor();
                for v in &mut self.voices {
                    if v.active && v.id == e.id {
                        v.target = bounded(e.a, 0., 127.);
                        v.glide = (bounded(e.b, 0., 8.) * self.sr * factor as f32) as u32;
                        if v.glide == 0 {
                            v.midi = v.target;
                        }
                    }
                }
            }
            _ => {}
        }
    }
    fn panic(&mut self) {
        self.notes.clear();
        self.mono_seen = false;
        self.headroom.clear();
        self.voices = [Voice::ZERO; VOICES];
        self.colours = [colour::Colour::ZERO; VOICES];
        self.head = 0;
        self.len = 0;
        self.pedal = false;
        self.history = [[0.; 64]; 2];
        self.dc_in = [0.; 2];
        self.dc_out = [0.; 2];
    }
    fn render(&mut self, frames: usize) {
        denormal::flush(&mut self.dc_in);
        denormal::flush(&mut self.dc_out);
        #[cfg(feature = "simd-voices")]
        if self.simd_eligible() {
            unsafe {
                SIMD_FRAMES += frames.min(BLOCK) as u64;
            }
            self.render_simd(frames);
            return;
        }
        let n = frames.min(BLOCK);
        let factor = self.factor();
        let sr = self.sr * factor as f32;
        let count = self.count();
        // Empty instruments still advance their clock, smooth controls and LFOs.
        // Avoid scanning every voice twice per output sample before the first
        // scheduled note (or after panic), while keeping event boundaries exact.
        let voice_idle = !self.idle_reference
            && !self.voices.iter().any(|v| v.active)
            && (self.head >= self.len || self.queue[self.head].frame >= self.frame + n as u64);
        // Zero FIR history and a residual DC state are independent. Keep the
        // exact DC recurrence running without convolving an all-zero history.
        let mut fir_idle = !self.idle_reference && self.history.iter().flatten().all(|x| *x == 0.);
        let mut filter_idle = fir_idle
            && self
                .dc_in
                .iter()
                .chain(self.dc_out.iter())
                .all(|x| *x == 0.);
        let norm = self.carriers[..count].iter().sum::<f32>().max(1.);
        let dc = (-2. * PI * 8. / self.sr).exp();
        self.peak = 0.;
        let smoothing = 1. - (-1. / (self.sr * 0.008)).exp();
        let expression_alpha = 1. - (-1. / (sr * 0.005)).exp();
        let routes = (0..4).any(|slot| {
            let at = 29 + slot * 3;
            self.g[at] > 0. && self.g[at + 1] > 0. && self.g[at + 2] != 0.
        });
        let motion = self.g[27] > 0.
            || (0..4).any(|slot| {
                let at = 29 + slot * 3;
                self.g[at] == 8. && self.g[at + 1] > 0. && self.g[at + 2] != 0.
            });
        for sample in 0..n {
            for (i, param) in [3, 5, 7].iter().enumerate() {
                self.smooth[i] += (self.g[*param] - self.smooth[i]) * smoothing;
            }
            for op in 0..OPS {
                self.levels[op] += (self.p[op][3] - self.levels[op]) * smoothing;
            }
            while self.head < self.len && self.queue[self.head].frame <= self.frame {
                let e = self.queue[self.head];
                self.head += 1;
                self.event(e);
            }
            for sub in 0..factor {
                self.bend += (self.g[8] - self.bend) * 0.002 / factor as f32;
                let lfo = sin(&self.sine, self.lfo);
                self.lfo = (self.lfo + self.g[10] / sr).fract();
                let lfo2 = sin(&self.sine, self.lfo2);
                self.lfo2 = (self.lfo2 + self.g[28] / sr).fract();
                let control = self.frame % 16 == 0 && sub == 0;
                let mut out = [0.; 2];
                if !voice_idle {
                    for (voice_index, v) in self.voices.iter_mut().enumerate() {
                        if !v.active {
                            continue;
                        }
                        // Only handoffs set different targets; ordinary/polyphonic
                        // voices keep their sample-identical path. Five-ms slew avoids
                        // a replacement amplitude/filter step when key velocity changes.
                        let handoff_dynamics =
                            v.velocity != v.velocity_target || v.pressure != v.pressure_target;
                        if v.velocity != v.velocity_target {
                            v.velocity += (v.velocity_target - v.velocity) * expression_alpha;
                            if (v.velocity_target - v.velocity).abs() < 1e-6 {
                                v.velocity = v.velocity_target;
                            }
                        }
                        if v.pressure != v.pressure_target {
                            v.pressure += (v.pressure_target - v.pressure) * expression_alpha;
                            if (v.pressure_target - v.pressure).abs() < 1e-6 {
                                v.pressure = v.pressure_target;
                            }
                        }
                        if v.glide > 0 {
                            v.midi += (v.target - v.midi) / v.glide as f32;
                            v.glide -= 1;
                        }
                        let update = control || self.frame == v.age;
                        let pressure = v.pressure.max(self.g[12]);
                        let random = v.expression.tick(&self.g, sr, expression_alpha, motion);
                        let mut targets = [0.; 11];
                        if routes {
                            for slot in 0..4 {
                                let at = 29 + slot * 3;
                                let destination = self.g[at + 1] as usize;
                                if destination == 0 || self.g[at] == 0. || self.g[at + 2] == 0. {
                                    continue;
                                }
                                let source = match self.g[at] as u32 {
                                    1 => lfo,
                                    2 => lfo2,
                                    3 => v.expression.value,
                                    4 => v.velocity,
                                    5 => ((v.midi - 60.) / 36.).clamp(-1., 1.),
                                    6 => pressure,
                                    7 => self.g[9],
                                    8 => random,
                                    _ => 0.,
                                };
                                targets[destination - 1] += source * self.g[at + 2];
                            }
                        }
                        for k in 0..11 {
                            if targets[k] != 0. || v.expression.routes[k] != 0. {
                                v.expression.routes[k] += (targets[k].clamp(-1., 1.)
                                    - v.expression.routes[k])
                                    * expression_alpha;
                                if v.expression.routes[k].abs() < 1e-12 {
                                    v.expression.routes[k] = 0.;
                                }
                            }
                        }
                        let expression = v.expression.routes;
                        if update {
                            let age = (self.frame - v.age) as f32 / self.sr;
                            let transient = self.g[15] * (1. - age / self.g[16]).max(0.);
                            let hz = 440.
                                * ((v.midi - 69.
                                    + self.bend
                                    + transient
                                    + lfo * (self.g[11] + self.g[9] * 35.) / 100.
                                    + (random * self.g[27] + expression[0] * 100.) / 100.)
                                    / 12.)
                                    .exp2();
                            for op in 0..count {
                                let p = &self.p[op];
                                let freq = if p[1] > 0. { p[1] } else { hz * p[0] };
                                v.step[op] = (freq * (p[2] / 1200.).exp2() / sr).clamp(0., 0.45);
                            }
                        }
                        // A handoff's slewed velocity/pressure must not turn back
                        // into 16-sample amplitude steps at the operator scaler.
                        if update || handoff_dynamics {
                            for op in 0..count {
                                let p = &self.p[op];
                                v.scale[op] = (1. - p[11] + p[11] * v.velocity)
                                    * 2_f32.powf(p[12] * (v.midi - 60.) / 24.).clamp(0.25, 4.)
                                    * (1. + pressure * p[14]);
                            }
                        }
                        let mut output = [0.; OPS];
                        let mut voice_out = [0.; 2];
                        let colour = &mut self.colours[voice_index];
                        let coloured = colour::enabled(&self.g[41..54]) || colour.engaged();
                        let mut noise_gain = [0.; 2];
                        let mut alive = false;
                        for op in 0..count {
                            let p = &self.p[op];
                            let env = v.env[op].next(p, sr / v.rate[op]);
                            if self.carriers[op] > 0. && v.env[op].stage > 0 {
                                alive = true;
                            }
                            let mut modulation = 0.;
                            for source in 0..op {
                                modulation += output[source] * self.routing[source][op];
                            }
                            if op == self.g[6] as usize {
                                let feedback = if expression[2] == 0. {
                                    self.smooth[1]
                                } else {
                                    (self.smooth[1] + expression[2] * 0.5).clamp(0., 1.)
                                };
                                modulation += (v.previous[op][(v.feedback_pos + 8 - factor) % 8]
                                    + v.previous[op][(v.feedback_pos + 8 - 2 * factor) % 8])
                                    * 0.5
                                    * feedback
                                    * feedback
                                    * 6.;
                            }
                            let raw = sin(
                                &self.sine,
                                v.phase[op]
                                    + modulation
                                        * self.smooth[2]
                                        * (1. + expression[1])
                                        * (1. + lfo * self.g[18])
                                        / (2. * PI),
                            );
                            let shaped = match p[17] as u32 {
                                1 => raw.max(0.) * 2. - 0.63662,
                                2 => raw.abs() * 2. - 1.27324,
                                3 => raw * raw * 2. - 1.,
                                _ => raw,
                            };
                            output[op] = shaped
                                * env
                                * self.levels[op]
                                * v.scale[op]
                                * p[16]
                                * (1. + expression[5 + op]);
                            v.phase[op] = (v.phase[op] + v.step[op]).fract();
                            v.previous[op][v.feedback_pos] = output[op];
                            if self.carriers[op] > 0. {
                                let x = output[op] * self.carriers[op] / norm
                                    * (1. - self.g[17] * (lfo + 1.) * 0.5);
                                voice_out[0] += x * self.pan[op][0];
                                voice_out[1] += x * self.pan[op][1];
                                if coloured {
                                    let level = env
                                        * self.levels[op]
                                        * v.scale[op]
                                        * p[16]
                                        * (1. + expression[5 + op])
                                        * self.carriers[op]
                                        / norm
                                        * (1. - self.g[17] * (lfo + 1.) * 0.5);
                                    noise_gain[0] += level * self.pan[op][0];
                                    noise_gain[1] += level * self.pan[op][1];
                                }
                            }
                        }
                        v.feedback_pos = (v.feedback_pos + 1) % 8;
                        if expression[3] != 0. || expression[4] != 0. {
                            voice_out[0] *= (1. + expression[3]) * (1. - expression[4].max(0.));
                            voice_out[1] *= (1. + expression[3]) * (1. + expression[4].min(0.));
                            noise_gain[0] *= (1. + expression[3]) * (1. - expression[4].max(0.));
                            noise_gain[1] *= (1. + expression[3]) * (1. + expression[4].min(0.));
                        }
                        if coloured {
                            voice_out =
                                colour.tick(voice_out, noise_gain, pressure, &self.g[41..54], sr);
                            alive |= colour.ringing();
                        }
                        if v.fade > 0 {
                            let t = v.fade as f32 / (64. * factor as f32);
                            voice_out[0] += v.tail[0] * t;
                            voice_out[1] += v.tail[1] * t;
                            v.fade -= 1;
                        }
                        v.last = voice_out;
                        out[0] += voice_out[0];
                        out[1] += voice_out[1];
                        if !alive && v.fade == 0 {
                            v.active = false;
                        }
                    }
                }
                for ch in 0..2 {
                    let value = out[ch] * self.smooth[0] * 0.98;
                    if value != 0. {
                        filter_idle = false;
                        fir_idle = false;
                    }
                    self.history[ch][self.fir_pos] = value;
                }
                self.fir_pos = (self.fir_pos + 1) % 64;
            }
            let mut clean = [0.; 2];
            // Only exact zero is skipped: no tail truncation or new silence
            // threshold. As soon as any sample enters the FIR, use its original
            // arithmetic and DC state for the rest of this block.
            if !filter_idle {
                for ch in 0..2 {
                    let mut x = 0.;
                    if !fir_idle {
                        for i in 0..self.fir_len {
                            x += self.history[ch][(self.fir_pos + 63 - i) % 64] * self.fir[i];
                        }
                    }
                    let filtered = x - self.dc_in[ch] + dc * self.dc_out[ch];
                    self.dc_in[ch] = x;
                    self.dc_out[ch] = filtered;
                    clean[ch] = filtered;
                }
            }
            let protected = self.headroom.tick(clean);
            for ch in 0..2 {
                let y = protected[ch];
                self.output[ch][sample] = y;
                self.peak = self.peak.max(y.abs());
            }
            self.frame += 1;
        }
        if self.head == self.len {
            self.head = 0;
            self.len = 0;
        }
    }
}
#[cfg_attr(feature = "profile-sections", inline(never))]
fn sin(table: &[f32; LUT + 1], phase: f32) -> f32 {
    let t = phase - phase.floor();
    let x = (t * LUT as f32).min(LUT as f32 - 0.0005);
    let i = x as usize;
    table[i] + (table[i + 1] - table[i]) * (x - i as f32)
}
static mut FM: Fm = Fm::new();
#[no_mangle]
pub extern "C" fn fm_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn fm_init(sr: f32) {
    unsafe {
        FM.init(sr);
    }
}
// Audit reference only; worklets use the optimized default. Allows continuous
// PCM/benchmark comparisons against the original empty-loop/FIR path.
#[no_mangle]
pub extern "C" fn fm_idle_mode(enabled: u32) {
    unsafe {
        FM.idle_reference = enabled == 0;
    }
}
#[no_mangle]
pub extern "C" fn fm_set_frame(f: f64) {
    if f.is_finite() && f >= 0. {
        unsafe {
            FM.frame = f as u64;
        }
    }
}
#[no_mangle]
pub extern "C" fn fm_param(i: u32, v: f32) {
    unsafe {
        FM.param(i as usize, v);
    }
}
#[no_mangle]
pub extern "C" fn fm_op(o: u32, i: u32, v: f32) {
    unsafe {
        FM.op(o as usize, i as usize, v);
    }
}
#[no_mangle]
pub extern "C" fn fm_route(from: u32, to: u32, v: f32) {
    if from < to && to < 6 {
        unsafe {
            FM.routing[from as usize][to as usize] = bounded(v, 0., 2.);
        }
    }
}
#[no_mangle]
pub extern "C" fn fm_carrier(op: u32, value: f32) {
    if op < 6 {
        unsafe {
            FM.carriers[op as usize] = bounded(value, 0., 1.);
        }
    }
}
#[no_mangle]
pub extern "C" fn fm_event(k: u32, id: u32, f: f64, a: f32, b: f32) -> u32 {
    unsafe { FM.enqueue(k, id, f, a, b) }
}
#[no_mangle]
pub extern "C" fn fm_panic() {
    unsafe {
        FM.panic();
    }
}
#[no_mangle]
pub extern "C" fn fm_render(n: u32) {
    unsafe {
        FM.render(n as usize);
    }
}
#[no_mangle]
pub extern "C" fn fm_output(c: u32) -> *const f32 {
    unsafe { FM.output[(c as usize).min(1)].as_ptr() }
}
#[no_mangle]
pub extern "C" fn fm_stat(i: u32) -> f64 {
    unsafe {
        match i {
            0 => FM.voices.iter().filter(|v| v.active).count() as f64,
            1 => FM.steals as f64,
            2 => FM.dropped as f64,
            3 => FM.late as f64,
            4 => FM.frame as f64,
            5 => FM.peak as f64,
            6 => (FM.fir_len - 1) as f64 / (2. * FM.factor() as f64),
            _ => 0.,
        }
    }
}

#[cfg(feature = "simd-voices")]
static mut SIMD_FRAMES: u64 = 0;
#[cfg(feature = "simd-voices")]
#[no_mangle]
pub extern "C" fn fm_simd_frames() -> u32 {
    unsafe { SIMD_FRAMES.min(u32::MAX as u64) as u32 }
}
