//! Owned Iowa Held/Decay/Roll DSP. Immutable prepared specs, a canonical
//! 128-frame legacy tick, and preallocated voice/hit state. No render allocation.
use std::f64::consts::TAU;
pub const QUANTUM: usize = 128;
pub const MAX_BYTES: usize = 64 * 1024 * 1024;
const MAX_PARTIALS: usize = 128;
#[derive(Default)]
pub struct Spec {
    pub id: u32,
    pub decay: bool,
    pub f0: f64,
    pub seconds: f64,
    pub rate: f64,
    pub depth: f64,
    pub tremolo: f64,
    pub pitch_wander: f64,
    pub level_wander: f64,
    times: Vec<f64>,
    tables: Vec<f32>,
    env_times: Vec<f64>,
    env_db: Vec<f64>,
    rel_times: Vec<f64>,
    rel_db: Vec<f64>,
    noise: Vec<f32>,
    burst: Vec<f32>,
    parts: Vec<PartialSpec>,
    fields: u32,
}
impl Spec {
    pub fn new(
        id: u32,
        decay: bool,
        f0: f64,
        seconds: f64,
        rate: f64,
        depth: f64,
        tremolo: f64,
        pitch_wander: f64,
        level_wander: f64,
    ) -> Self {
        Self {
            id,
            decay,
            f0,
            seconds,
            rate,
            depth,
            tremolo,
            pitch_wander,
            level_wander,
            ..Self::default()
        }
    }
}
#[derive(Clone, Copy, Default)]
struct PartialSpec {
    frequency: f64,
    amplitude: f64,
    phase: f64,
    rise: f64,
    early: f64,
    late: f64,
}
pub struct Note {
    pub id: u32,
    pub spec: usize,
    pub midi: f32,
    pub velocity: f32,
    pub gain: f64,
    pub tune: f64,
    pub ring: bool,
    pub roll: [f64; 3],
    pub slide: [f64; 2],
}
#[derive(Clone, Copy, Default)]
struct Part {
    x: f64,
    y: f64,
    c: f64,
    s: f64,
    rise: f64,
    knee: f64,
    late: f64,
}
struct Decay {
    parts: Vec<Part>,
    count: usize,
    age: f64,
    burst_at: usize,
    damping: bool,
    gain: f64,
}
impl Decay {
    fn new() -> Self {
        Self {
            parts: vec![Part::default(); MAX_PARTIALS],
            count: 0,
            age: 0.,
            burst_at: 0,
            damping: false,
            gain: 0.,
        }
    }
    fn start(&mut self, s: &Spec, rate: f64, gain: f64, tune: f64) {
        self.count = s.parts.len();
        self.age = 0.;
        self.burst_at = 0;
        self.damping = false;
        self.gain = gain;
        for (a, p) in self.parts.iter_mut().zip(&s.parts) {
            let shrink = 10f64.powf(p.early / 20. / rate);
            let turn = TAU * p.frequency * tune / rate;
            *a = Part {
                x: p.amplitude * p.phase.cos(),
                y: p.amplitude * p.phase.sin(),
                c: shrink * turn.cos(),
                s: shrink * turn.sin(),
                rise: p.rise,
                knee: p.rise + 0.25,
                late: 10f64.powf((p.late - p.early) / 20. / rate),
            };
        }
    }
    fn render(&mut self, spec: &Spec, rate: f64, out: &mut [f32; QUANTUM]) -> bool {
        let dt = 1. / rate;
        let t0 = self.age;
        let mut p = 0;
        while p < self.count {
            let mut a = self.parts[p];
            if t0 >= a.knee {
                a.c *= a.late;
                a.s *= a.late;
                a.knee = f64::INFINITY;
            }
            for (i, o) in out.iter_mut().enumerate() {
                let sample = if a.rise > 0. && t0 < a.rise {
                    a.y * self.gain * ((t0 + i as f64 * dt) / a.rise).min(1.)
                } else {
                    a.y * self.gain
                };
                *o = (*o as f64 + sample) as f32;
                let nx = a.x * a.c - a.y * a.s;
                a.y = a.x * a.s + a.y * a.c;
                a.x = nx;
            }
            if a.x.abs() + a.y.abs() < 1e-6 && t0 >= a.rise {
                self.count -= 1;
                self.parts[p] = self.parts[self.count];
                continue;
            }
            self.parts[p] = a;
            p += 1;
        }
        if self.burst_at < spec.burst.len() {
            for o in out.iter_mut() {
                if self.burst_at >= spec.burst.len() {
                    break;
                }
                let t = self.burst_at as f64 * dt;
                *o = (*o as f64
                    + spec.burst[self.burst_at] as f64
                        * (-t / 0.008).exp()
                        * (t / 0.0005).min(1.)
                        * self.gain) as f32;
                self.burst_at += 1;
            }
        }
        if self.damping || self.age >= spec.seconds - 0.05 {
            self.gain *= (-(QUANTUM as f64) * dt / 0.05).exp();
            if self.gain < 1e-5 {
                return false;
            }
        }
        self.age = t0 + QUANTUM as f64 * dt;
        !(self.count == 0 && self.burst_at >= spec.burst.len()) && self.age < spec.seconds + 0.3
    }
}
#[derive(Default)]
struct Held {
    age: f64,
    played: f64,
    opening: f64,
    phase: f64,
    noise_at: usize,
    released: f64,
    lfo: f64,
    seed: u32,
    pitch: f64,
    pitch_goal: f64,
    level: f64,
    level_goal: f64,
}
fn random(seed: &mut u32) -> f64 {
    *seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
    *seed as f64 / 2147483648. - 1.
}
fn curve(times: &[f64], values: &[f64], t: f64) -> f64 {
    if t <= times[0] {
        return values[0];
    }
    for i in 1..times.len() {
        if t <= times[i] {
            return values[i - 1]
                + (values[i] - values[i - 1]) * (t - times[i - 1]) / (times[i] - times[i - 1]);
        }
    }
    *values.last().unwrap()
}
fn cubic(table: &[f32], x: f64) -> f64 {
    let i = x.floor() as isize;
    let t = x - i as f64;
    let a = table[((i - 1) & 2047) as usize] as f64;
    let b = table[(i & 2047) as usize] as f64;
    let c = table[((i + 1) & 2047) as usize] as f64;
    let d = table[((i + 2) & 2047) as usize] as f64;
    b + 0.5 * t * (c - a + t * (2. * a - 5. * b + 4. * c - d + t * (3. * (b - c) + d - a)))
}
fn glide(slide: [f64; 2], played: f64) -> f64 {
    if slide[1] == 0. || played >= slide[1] {
        0.
    } else {
        let x = played / slide[1];
        slide[0] * (1. - x * x * (3. - 2. * x))
    }
}
impl Held {
    fn start(&mut self, s: &Spec, seed: u32, slide: [f64; 2]) {
        *self = Self {
            age: if slide[1] > 0. {
                *s.times.last().unwrap()
            } else {
                0.
            },
            opening: if slide[1] > 0. { 0.02 } else { 0.005 },
            noise_at: (seed % 4096) as usize,
            released: -1.,
            lfo: (seed % 7) as f64,
            seed: seed.max(1),
            ..Self::default()
        };
    }
    fn release(&mut self) {
        if self.released < 0. {
            self.released = self.age;
        }
    }
    fn level_at(&self, s: &Spec, t: f64) -> (f64, bool) {
        let mut db = curve(&s.env_times, &s.env_db, t);
        if self.released >= 0. {
            let after = t - self.released;
            if after >= *s.rel_times.last().unwrap() {
                return (0., true);
            }
            db += curve(&s.rel_times, &s.rel_db, after);
        }
        (10f64.powf(db / 20.), false)
    }
    fn render(&mut self, s: &Spec, rate: f64, note: &Note, out: &mut [f32; QUANTUM]) -> bool {
        let dt = 1. / rate;
        let t0 = self.age;
        let t1 = t0 + QUANTUM as f64 * dt;
        let mut slice = 0;
        while slice < s.times.len() - 1 && t0 >= s.times[slice + 1] {
            slice += 1;
        }
        let top = (slice + 1).min(s.times.len() - 1);
        let lower = &s.tables[slice * 2048..(slice + 1) * 2048];
        let upper = &s.tables[top * 2048..(top + 1) * 2048];
        let span = s.times[top] - s.times[slice];
        let span = if span == 0. { 1. } else { span };
        let mix0 = ((t0 - s.times[slice]) / span).clamp(0., 1.);
        let mix1 = ((t1 - s.times[slice]) / span).clamp(0., 1.);
        let grown = ((t0 - 0.15) / 0.45).clamp(0., 1.);
        if (t1 * 4.).floor() != (t0 * 4.).floor() {
            self.pitch_goal = random(&mut self.seed) * s.pitch_wander * 1.4;
            self.level_goal = random(&mut self.seed) * s.level_wander * 1.4;
        }
        let follow = 1. - (-(QUANTUM as f64) * dt / 0.12).exp();
        self.pitch += (self.pitch_goal - self.pitch) * follow;
        self.level += (self.level_goal - self.level) * follow;
        let step = TAU * s.rate * dt;
        let depth = s.depth * grown;
        let tremolo = s.tremolo * grown;
        let wander = 10f64.powf(self.level / 20.) * note.gain;
        let (from, done0) = self.level_at(s, t0);
        let (to, done1) = self.level_at(s, t1);
        let burst_from = if s.burst.is_empty() {
            0.
        } else {
            (-t0 / 0.045).exp()
        };
        let burst_to = if s.burst.is_empty() {
            0.
        } else {
            (-t1 / 0.045).exp()
        };
        let rise = (t0 / 0.002).min(1.);
        let played1 = self.played + QUANTUM as f64 * dt;
        let glide0 = glide(note.slide, self.played);
        let glide1 = glide(note.slide, played1);
        let open0 = (self.played / self.opening).min(1.);
        let open1 = (played1 / self.opening).min(1.);
        for (i, o) in out.iter_mut().enumerate() {
            let u = i as f64 / QUANTUM as f64;
            self.lfo += step;
            let wave = self.lfo.sin();
            let cents = depth * wave + self.pitch + glide0 + (glide1 - glide0) * u;
            self.phase += s.f0 * note.tune * 2f64.powf(cents / 1200.) * dt;
            if self.phase >= 1. {
                self.phase -= self.phase.floor();
            }
            let x = self.phase * 2048.;
            let mix = mix0 + (mix1 - mix0) * u;
            let a = cubic(lower, x);
            let mut sample = if top == slice {
                a
            } else {
                a + (cubic(upper, x) - a) * mix
            };
            sample *= 1. + 0.115 * tremolo * wave;
            let level = from + (to - from) * u;
            sample *= level;
            self.noise_at += 1;
            if !s.noise.is_empty() {
                sample += s.noise[self.noise_at & (s.noise.len() - 1)] as f64 * level;
            }
            if !s.burst.is_empty() {
                sample += s.burst[self.noise_at & (s.burst.len() - 1)] as f64
                    * (burst_from + (burst_to - burst_from) * u)
                    * rise;
            }
            *o = (*o as f64 + sample * wander * (open0 + (open1 - open0) * u)) as f32;
        }
        self.age = t1;
        self.played = played1;
        !(done0 || done1)
    }
}
struct Slot {
    note: Option<usize>,
    owner: u32,
    order: u64,
    alive: bool,
    buffered: bool,
    pcm: [f32; QUANTUM],
    held: Held,
    hits: Vec<Decay>,
    hit_order: [usize; 12],
    hit_count: usize,
    age: f64,
    next: f64,
    stopped: bool,
    seed: u32,
}
impl Slot {
    fn new() -> Self {
        Self {
            note: None,
            owner: 0,
            order: 0,
            alive: false,
            buffered: false,
            pcm: [0.; QUANTUM],
            held: Held::default(),
            hits: (0..12).map(|_| Decay::new()).collect(),
            hit_order: [0; 12],
            hit_count: 0,
            age: 0.,
            next: 0.,
            stopped: false,
            seed: 1,
        }
    }
    fn release(&mut self, n: &Note, s: &Spec) {
        if !s.decay {
            self.held.release();
        } else if n.roll[0] > 0. {
            self.stopped = true;
        } else if !n.ring {
            self.hits[0].damping = true;
        }
    }
    fn render(&mut self, n: &Note, s: &Spec, rate: f64) {
        self.pcm.fill(0.);
        self.buffered = true;
        if !s.decay {
            self.alive = self.held.render(s, rate, n, &mut self.pcm);
            return;
        }
        if n.roll[0] == 0. {
            self.alive = self.hits[0].render(s, rate, &mut self.pcm);
            return;
        }
        if !self.stopped && self.age >= self.next {
            let mut index = (0..12)
                .find(|i| !self.hit_order[..self.hit_count].contains(i))
                .unwrap_or(self.hit_order[0]);
            if self.hit_count == 12 {
                index = self.hit_order[0];
                self.hit_order.copy_within(1..12, 0);
                self.hit_count -= 1;
            }
            self.hits[index].start(
                s,
                rate,
                n.gain * 10f64.powf(random(&mut self.seed) * n.roll[1] / 20.),
                n.tune,
            );
            self.hit_order[self.hit_count] = index;
            self.hit_count += 1;
            self.next = self.age + (1. + random(&mut self.seed) * n.roll[2].min(0.2)) / n.roll[0];
        }
        let mut i = 0;
        let mut temp = [0f32; QUANTUM];
        while i < self.hit_count {
            let index = self.hit_order[i];
            temp.fill(0.);
            let alive = self.hits[index].render(s, rate, &mut temp);
            for (o, t) in self.pcm.iter_mut().zip(temp) {
                *o += t;
            }
            if !alive {
                self.hit_order.copy_within(i + 1..self.hit_count, i);
                self.hit_count -= 1;
            } else {
                i += 1;
            }
        }
        self.age += QUANTUM as f64 / rate;
        self.alive = !self.stopped || self.hit_count > 0;
    }
}
pub struct Engine {
    rate: f64,
    specs: Vec<Spec>,
    notes: Vec<Note>,
    slots: Vec<Slot>,
    mix_order: Vec<usize>,
    ready: bool,
    bytes: usize,
    seed: u32,
    order: u64,
    quantum: Option<u64>,
    frame: u64,
    steals: u64,
    peak_active: usize,
    peak: f64,
}
impl Engine {
    pub fn new(rate: f64) -> Self {
        Self {
            rate,
            specs: Vec::new(),
            notes: Vec::new(),
            slots: Vec::new(),
            mix_order: Vec::new(),
            ready: false,
            bytes: 0,
            seed: 1,
            order: 0,
            quantum: None,
            frame: 0,
            steals: 0,
            peak_active: 0,
            peak: 0.,
        }
    }
    pub fn configure(&mut self, voices: usize) -> bool {
        if self.ready || !self.slots.is_empty() || !(1..=32).contains(&voices) {
            return false;
        }
        self.slots = (0..voices).map(|_| Slot::new()).collect();
        self.mix_order = (0..voices).collect();
        true
    }
    pub fn spec(&mut self, s: Spec) -> bool {
        if self.ready
            || self.specs.len() >= 96
            || s.id == 0
            || self.specs.iter().any(|x| x.id == s.id)
            || [
                s.f0,
                s.seconds,
                s.rate,
                s.depth,
                s.tremolo,
                s.pitch_wander,
                s.level_wander,
            ]
            .iter()
            .any(|x| !x.is_finite())
            || !(0. ..=20000.).contains(&s.f0)
            || !(0. ..=8.).contains(&s.seconds)
            || !(0. ..=30.).contains(&s.rate)
            || !(0. ..=2400.).contains(&s.depth)
            || !(0. ..=60.).contains(&s.tremolo)
            || !(0. ..=100.).contains(&s.pitch_wander)
            || !(0. ..=60.).contains(&s.level_wander)
        {
            return false;
        }
        self.specs.push(s);
        true
    }
    pub fn data(&mut self, id: u32, field: u32, a: &[f64]) -> bool {
        if self.ready
            || field > 8
            || a.len() > 262144
            || self.bytes + a.len() * 8 > MAX_BYTES
            || a.iter().any(|x| !x.is_finite())
        {
            return false;
        }
        let Some(s) = self.specs.iter_mut().find(|s| s.id == id) else {
            return false;
        };
        if s.fields & (1 << field) != 0 {
            return false;
        }
        match field {
            0 => s.times = a.to_vec(),
            1 => s.tables = a.iter().map(|v| *v as f32).collect(),
            2 => s.env_times = a.to_vec(),
            3 => s.env_db = a.to_vec(),
            4 => s.rel_times = a.to_vec(),
            5 => s.rel_db = a.to_vec(),
            6 => s.noise = a.iter().map(|v| *v as f32).collect(),
            7 => s.burst = a.iter().map(|v| *v as f32).collect(),
            8 => {
                if a.len() % 6 != 0 || a.len() / 6 > MAX_PARTIALS {
                    return false;
                }
                s.parts = a
                    .chunks_exact(6)
                    .map(|p| PartialSpec {
                        frequency: p[0],
                        amplitude: p[1],
                        phase: p[2],
                        rise: p[3],
                        early: p[4],
                        late: p[5],
                    })
                    .collect();
            }
            _ => return false,
        };
        s.fields |= 1 << field;
        self.bytes += a.len() * 8;
        true
    }
    pub fn note_spec(&mut self, mut n: Note, spec: u32) -> bool {
        if self.ready
            || self.notes.len() >= 2000
            || n.id == 0
            || self.notes.iter().any(|x| x.id == n.id)
            || !n.midi.is_finite()
            || !(0. ..=127.).contains(&n.midi)
            || !n.velocity.is_finite()
            || !(0. ..=1.).contains(&n.velocity)
            || [
                n.gain, n.tune, n.roll[0], n.roll[1], n.roll[2], n.slide[0], n.slide[1],
            ]
            .iter()
            .any(|x| !x.is_finite())
            || !(0. ..=1024.).contains(&n.gain)
            || !(0.0625..=16.).contains(&n.tune)
            || !(0. ..=100.).contains(&n.roll[0])
            || !(0. ..=60.).contains(&n.roll[1])
            || !(0. ..=4.).contains(&n.roll[2])
            || n.slide[0].abs() > 2400.
            || !(0. ..=30.).contains(&n.slide[1])
        {
            return false;
        }
        let Some(index) = self.specs.iter().position(|s| s.id == spec) else {
            return false;
        };
        n.spec = index;
        self.notes.push(n);
        true
    }
    /// Validate prepared resources without locking the remaining host writes.
    pub fn can_prepare(&self) -> bool {
        let increasing = |a: &[f64]| {
            !a.is_empty()
                && a[0] >= 0.
                && a.windows(2).all(|w| w[1] > w[0])
                && a.last().unwrap() <= &30.
        };
        if self.slots.is_empty()
            || self.specs.iter().any(|s| {
                let invalid = if s.decay {
                    s.seconds < 0.3
                        || s.fields != ((1 << 7) | (1 << 8))
                        || s.parts.iter().any(|p| {
                            p.frequency < 0.
                                || p.frequency > self.rate * 0.47
                                || p.amplitude < 0.
                                || p.amplitude > 64.
                                || !(0. ..=0.004).contains(&p.rise)
                                || p.early > 0.
                                || p.late > 0.
                                || p.early < -100000.
                                || p.late < -100000.
                        })
                        || !s.burst.is_empty() && !s.burst.len().is_power_of_two()
                } else {
                    s.f0 <= 0.
                        || s.fields != 255
                        || s.times.len() > 32
                        || !increasing(&s.times)
                        || s.tables.len() != s.times.len() * 2048
                        || !increasing(&s.env_times)
                        || s.env_times.len() > 128
                        || s.env_times.len() != s.env_db.len()
                        || !increasing(&s.rel_times)
                        || s.rel_times.len() > 128
                        || s.rel_times.len() != s.rel_db.len()
                        || s.env_db.iter().chain(&s.rel_db).any(|v| v.abs() > 240.)
                        || [&s.noise, &s.burst]
                            .iter()
                            .any(|a| !a.is_empty() && !a.len().is_power_of_two())
                };
                invalid || {
                    s.tables
                        .iter()
                        .chain(&s.noise)
                        .chain(&s.burst)
                        .any(|v| !v.is_finite() || v.abs() > 64.)
                }
            })
            || self
                .notes
                .iter()
                .any(|n| n.roll[0] > 0. && !self.specs[n.spec].decay)
        {
            return false;
        }
        true
    }
    pub fn prepare(&mut self) -> bool {
        if !self.can_prepare() { return false; }
        self.ready = true;
        true
    }
    pub fn valid(&self, k: u32, id: u32, a: f32, b: f32, frame: u64) -> bool {
        frame % 128 == 0
            && (k == 4
                || self
                    .notes
                    .iter()
                    .any(|n| n.id == id && (k == 1 || k == 0 && n.midi == a && n.velocity == b)))
    }
    pub fn conflict(&self, id: u32, owner: u32) -> bool {
        self.slots.iter().any(|s| {
            s.note.is_some_and(|i| self.notes[i].id == id)
                && s.owner != owner
                && (s.alive || s.buffered)
        })
    }
    pub fn note(&mut self, k: u32, id: u32, owner: u32) {
        if k == 4 {
            self.cancel(0);
            return;
        }
        let Some(index) = self.notes.iter().position(|n| n.id == id) else {
            return;
        };
        let n = &self.notes[index];
        if k == 1 {
            for v in &mut self.slots {
                if v.note == Some(index) && v.owner == owner {
                    v.release(n, &self.specs[n.spec]);
                }
            }
            return;
        }
        let found = self
            .slots
            .iter()
            .position(|v| v.note == Some(index) && v.alive);
        let slot = found
            .or_else(|| self.slots.iter().position(|v| !v.alive))
            .unwrap_or_else(|| {
                self.steals += 1;
                self.slots
                    .iter()
                    .enumerate()
                    .min_by_key(|(_, v)| v.order)
                    .unwrap()
                    .0
            });
        let v = &mut self.slots[slot];
        self.seed = ((self.seed as u64 * 48271) % 2147483647) as u32;
        self.order += 1;
        v.order = self.order;
        v.note = Some(index);
        v.owner = owner;
        v.alive = true;
        v.buffered = false;
        v.hit_count = 0;
        v.age = 0.;
        v.next = 0.;
        v.stopped = false;
        v.seed = self.seed;
        let s = &self.specs[n.spec];
        if s.decay {
            if n.roll[0] == 0. {
                v.hits[0].start(s, self.rate, n.gain, n.tune);
            }
        } else {
            v.held.start(s, self.seed, n.slide);
        }
        self.peak_active = self
            .peak_active
            .max(self.slots.iter().filter(|s| s.alive).count());
    }
    pub fn cancel(&mut self, owner: u32) {
        for s in &mut self.slots {
            if owner == 0 || s.owner == owner {
                s.alive = false;
                s.buffered = false;
                s.note = None;
                s.pcm.fill(0.);
            }
        }
    }
    pub fn reset(&mut self) {
        self.cancel(0);
        self.seed = 1;
        self.order = 0;
        self.quantum = None;
        self.frame = 0;
        self.steals = 0;
        self.peak_active = 0;
        self.peak = 0.;
    }
    pub fn render(&mut self, frame: u64, out: &mut [[f32; 2]]) {
        self.peak = 0.;
        for (i, o) in out.iter_mut().enumerate() {
            let now = frame + i as u64;
            let q = now / 128;
            if self.quantum != Some(q) {
                for v in &mut self.slots {
                    v.buffered = false;
                    if v.alive {
                        let n = &self.notes[v.note.unwrap()];
                        v.render(n, &self.specs[n.spec], self.rate);
                    }
                }
                self.quantum = Some(q);
                self.mix_order
                    .sort_unstable_by_key(|i| self.slots[*i].order);
            }
            let mut sum = 0f32;
            for index in &self.mix_order {
                let v = &self.slots[*index];
                if v.buffered {
                    sum += v.pcm[(now % 128) as usize];
                }
            }
            *o = [sum, sum];
            self.peak = self.peak.max(sum.abs() as f64);
        }
        self.frame = frame + out.len() as u64;
    }
    pub fn stat(&self, i: u32) -> f64 {
        match i {
            0 => self.slots.iter().filter(|v| v.alive).count() as f64,
            1 => self.steals as f64,
            4 => self.frame as f64,
            5 => self.peak,
            7 => self.peak_active as f64,
            _ => 0.,
        }
    }
}
