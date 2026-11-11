//! Exact dry string-voices worklet, with explicit captured initial LFO phases.
//! Canonical128 cache preserves its voice-major shared RNG independent of host
//! render partition. Native body convolution is a separate downstream boundary.
mod abi;
#[cfg(feature = "allocation-audit")]
mod allocation;
use std::f64::consts::PI;
const QUANTUM: usize = 128;
const OUTPUT: usize = 2048;
const BANKS: usize = 128;
const NOTES: usize = 2000;
const EVENTS: usize = 4000;
const MAX_FRAME: u64 = 9007199254740991;
pub struct Bank {
    id: u32,
    f0: f64,
    vib_rate: f64,
    table: Vec<f32>,
    dark: Vec<f32>,
    release: Vec<[f64; 2]>,
    vibrato: Vec<[f64; 2]>,
}
#[derive(Clone, Copy)]
pub struct On {
    pub id: u32,
    pub bank: u32,
    pub lfo: f64,
    pub gain: f64,
    pub noise: f64,
    pub attack: f64,
    pub open: f64,
    pub hiss: f64,
    pub rel_scale: f64,
}
#[derive(Clone, Copy)]
pub struct Event {
    pub frame: u64,
    pub owner: u32,
    pub kind: u32,
    pub id: u32,
}
#[derive(Clone, Copy, Default)]
struct Voice {
    id: u32,
    bank: usize,
    phase: f64,
    age: f64,
    n: u32,
    lfo: f64,
    wander: f64,
    wander_target: f64,
    lp: f64,
    released_at: f64,
    gain: f64,
    noise: f64,
    attack: f64,
    open: f64,
    hiss: f64,
    rel_scale: f64,
}
fn interpolate(points: &[[f64; 2]], t: f64) -> f64 {
    if t <= points[0][0] {
        return points[0][1];
    }
    for i in 1..points.len() {
        if t <= points[i][0] {
            return points[i - 1][1]
                + (points[i][1] - points[i - 1][1]) * (t - points[i - 1][0])
                    / (points[i][0] - points[i - 1][0]);
        }
    }
    points.last().unwrap()[1]
}
fn cubic(table: &[f32], x: f64) -> f64 {
    let i = x.floor() as usize;
    let t = x - i as f64;
    let a = table[(i.wrapping_sub(1)) & 4095] as f64;
    let b = table[i & 4095] as f64;
    let c = table[(i + 1) & 4095] as f64;
    let d = table[(i + 2) & 4095] as f64;
    b + 0.5 * t * (c - a + t * (2. * a - 5. * b + 4. * c - d + t * (3. * (b - c) + d - a)))
}
fn random(seed: &mut u32) -> f64 {
    *seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
    *seed as f64 / 2147483648. - 1.
}
pub struct Engine {
    rate: f64,
    owner: u32,
    banks: Vec<Bank>,
    notes: Vec<On>,
    prepared: bool,
    voices: [Voice; 24],
    order: [usize; 24],
    count: usize,
    seed: u32,
    cache: [f32; QUANTUM],
    cache_at: usize,
    output: Vec<f32>,
    queue: Vec<Event>,
    head: usize,
    consumed: u64,
    generated: u64,
    applied: u64,
    late: u64,
    overflow: u64,
    steals: u64,
    peak_active: usize,
}
impl Engine {
    pub fn new(rate: f64, owner: u32) -> Option<Box<Self>> {
        if !rate.is_finite() || !(8000. ..=192000.).contains(&rate) || owner == 0 {
            return None;
        }
        Some(Box::new(Self {
            rate,
            owner,
            banks: Vec::with_capacity(BANKS),
            notes: Vec::with_capacity(NOTES),
            prepared: false,
            voices: [Voice::default(); 24],
            order: [0; 24],
            count: 0,
            seed: 12345,
            cache: [0.; QUANTUM],
            cache_at: QUANTUM,
            output: vec![0.; OUTPUT * 2],
            queue: Vec::with_capacity(EVENTS),
            head: 0,
            consumed: 0,
            generated: 0,
            applied: 0,
            late: 0,
            overflow: 0,
            steals: 0,
            peak_active: 0,
        }))
    }
    pub fn bank(&mut self, id: u32, f0: f64, rate: f64) -> bool {
        if self.prepared
            || id == 0
            || self.banks.len() >= BANKS
            || self.banks.iter().any(|b| b.id == id)
            || !f0.is_finite()
            || !(10. ..=12000.).contains(&f0)
            || !rate.is_finite()
            || !(0. ..=120.).contains(&rate)
        {
            return false;
        }
        self.banks.push(Bank {
            id,
            f0,
            vib_rate: rate,
            table: vec![0.; 4096],
            dark: vec![0.; 4096],
            release: Vec::with_capacity(64),
            vibrato: Vec::with_capacity(16),
        });
        true
    }
    pub fn wave(&mut self, id: u32, dark: u32) -> Option<&mut [f32]> {
        if self.prepared || dark > 1 {
            return None;
        }
        let b = self.banks.iter_mut().find(|b| b.id == id)?;
        Some(if dark == 0 { &mut b.table } else { &mut b.dark })
    }
    pub fn point(&mut self, id: u32, kind: u32, time: f64, value: f64) -> bool {
        if self.prepared
            || kind > 1
            || !time.is_finite()
            || !(0. ..=120.).contains(&time)
            || !value.is_finite()
            || if kind == 0 {
                !(0. ..=1.).contains(&value)
            } else {
                !(0. ..=1000.).contains(&value)
            }
        {
            return false;
        }
        let Some(b) = self.banks.iter_mut().find(|b| b.id == id) else {
            return false;
        };
        let points = if kind == 0 {
            &mut b.release
        } else {
            &mut b.vibrato
        };
        let limit = if kind == 0 { 64 } else { 16 };
        if points.len() >= limit
            || points.last().is_some_and(|p| p[0] >= time)
            || points.is_empty() && time != 0.
        {
            return false;
        }
        points.push([time, value]);
        true
    }
    pub fn note(&mut self, on: On) -> bool {
        if self.prepared
            || self.notes.len() >= NOTES
            || on.id == 0
            || !self.banks.iter().any(|b| b.id == on.bank)
            || ![
                on.lfo,
                on.gain,
                on.noise,
                on.attack,
                on.open,
                on.hiss,
                on.rel_scale,
            ]
            .iter()
            .all(|v| v.is_finite())
            || !(0. ..2. * PI).contains(&on.lfo)
            || !(0. ..=1e9).contains(&on.gain)
            || !(0. ..=1e9).contains(&on.noise)
            || !(0.00001..=10.).contains(&on.attack)
            || !(0.01..=10.).contains(&on.open)
            || !(0. ..=10.).contains(&on.hiss)
            || !(0.01..=10.).contains(&on.rel_scale)
        {
            return false;
        }
        self.notes.push(on);
        true
    }
    pub fn prepare(&mut self) -> bool {
        if self.prepared
            || self.banks.iter().any(|b| {
                b.release.len() < 2
                    || b.release.last().unwrap()[1] != 0.
                    || b.release.last().unwrap()[0] <= 0.
                    || b.table.iter().chain(&b.dark).any(|v| !v.is_finite())
                    || b.vibrato.len() == 1
            })
        {
            return false;
        }
        self.prepared = true;
        true
    }
    fn compact(&mut self) {
        if self.head > 0 {
            self.queue.drain(..self.head);
            self.head = 0;
        }
    }
    pub fn enqueue(&mut self, e: Event) -> bool {
        if !self.prepared
            || e.owner != self.owner
            || e.frame % 128 != 0
            || e.frame > MAX_FRAME - QUANTUM as u64
            || match e.kind {
                0 => e.id as usize >= self.notes.len(),
                1 => e.id == 0,
                2 => e.id != 0,
                _ => true,
            }
        {
            return false;
        }
        if e.frame < self.generated {
            self.late += 1;
            return false;
        }
        self.compact();
        if self.queue.len() >= EVENTS {
            self.overflow += 1;
            return false;
        }
        let at = self.queue.partition_point(|v| v.frame <= e.frame);
        self.queue.insert(at, e);
        true
    }
    fn remove(&mut self, position: usize) {
        for i in position..self.count - 1 {
            self.order[i] = self.order[i + 1];
        }
        self.count -= 1;
    }
    fn on(&mut self, index: usize) {
        let on = self.notes[index];
        if self.count >= 24 {
            self.remove(0);
            self.steals += 1;
        }
        let existing = self.order[..self.count]
            .iter()
            .position(|slot| self.voices[*slot].id == on.id);
        let slot = if let Some(i) = existing {
            self.order[i]
        } else {
            let slot = (0..24)
                .find(|i| !self.order[..self.count].contains(i))
                .unwrap();
            self.order[self.count] = slot;
            self.count += 1;
            slot
        };
        let bank = self.banks.iter().position(|b| b.id == on.bank).unwrap();
        self.voices[slot] = Voice {
            id: on.id,
            bank,
            lfo: on.lfo,
            released_at: -1.,
            gain: on.gain,
            noise: on.noise,
            attack: on.attack,
            open: on.open,
            hiss: on.hiss,
            rel_scale: on.rel_scale,
            ..Voice::default()
        };
        self.peak_active = self.peak_active.max(self.count);
    }
    fn apply(&mut self, e: Event) {
        match e.kind {
            0 => self.on(e.id as usize),
            1 => {
                if let Some(slot) = self.order[..self.count]
                    .iter()
                    .find(|i| self.voices[**i].id == e.id)
                {
                    let v = &mut self.voices[*slot];
                    if v.released_at < 0. {
                        v.released_at = v.age;
                    }
                }
            }
            2 => self.count = 0,
            _ => {}
        }
        self.applied += 1;
    }
    fn generate(&mut self) -> bool {
        if self.generated > MAX_FRAME - QUANTUM as u64 {
            return false;
        }
        while self
            .queue
            .get(self.head)
            .is_some_and(|e| e.frame <= self.generated)
        {
            let e = self.queue[self.head];
            self.head += 1;
            self.apply(e);
        }
        if self.head == self.queue.len() {
            self.queue.clear();
            self.head = 0;
        }
        self.cache.fill(0.);
        let dt = 1. / self.rate;
        let mut position = 0;
        while position < self.count {
            let slot = self.order[position];
            let v = &mut self.voices[slot];
            let bank = &self.banks[v.bank];
            let mut done = false;
            for i in 0..QUANTUM {
                let t = v.age;
                let depth = if bank.vibrato.is_empty() {
                    0.
                } else {
                    interpolate(&bank.vibrato, t)
                };
                v.lfo += 2.
                    * PI
                    * if bank.vibrato.is_empty() {
                        0.
                    } else {
                        bank.vib_rate
                    }
                    * dt;
                let old = v.n;
                v.n = v.n.wrapping_add(1);
                if old & 2047 == 0 {
                    v.wander_target = random(&mut self.seed) * 1.5;
                }
                v.wander += (v.wander_target - v.wander) * 0.0004;
                let cents = depth * v.lfo.sin() + v.wander;
                v.phase += bank.f0 * 2f64.powf(cents / 1200.) * dt;
                if v.phase >= 1. {
                    v.phase -= v.phase.floor();
                }
                let x = v.phase * 4096.;
                let bright = (t / v.open).min(1.);
                let mix = bright * bright * (3. - 2. * bright);
                let mut s = cubic(&bank.table, x) * mix + cubic(&bank.dark, x) * (1. - mix);
                v.lp += (random(&mut self.seed) - v.lp) * 0.35;
                s += v.lp * v.noise * (1. + v.hiss * (-t / 0.12).exp());
                let rise = (t / v.attack).min(1.);
                let env = rise * rise * (3. - 2. * rise);
                let mut rel = 1.;
                if v.released_at >= 0. {
                    let r = t - v.released_at;
                    if r >= bank.release.last().unwrap()[0] * v.rel_scale {
                        done = true;
                        break;
                    }
                    rel = interpolate(&bank.release, r / v.rel_scale);
                }
                self.cache[i] = (self.cache[i] as f64 + s * env * rel * v.gain) as f32;
                v.age += dt;
            }
            if done {
                self.remove(position);
            } else {
                position += 1;
            }
        }
        self.generated += QUANTUM as u64;
        self.cache_at = 0;
        true
    }
    pub fn render(&mut self, n: usize) -> bool {
        if !self.prepared || n > OUTPUT || self.consumed > MAX_FRAME - n as u64 {
            return false;
        }
        for i in 0..n {
            if self.cache_at == QUANTUM && !self.generate() {
                return false;
            }
            let sample = self.cache[self.cache_at];
            self.output[i] = sample;
            self.output[OUTPUT + i] = sample;
            self.cache_at += 1;
            self.consumed += 1;
        }
        true
    }
    pub fn cancel(&mut self, owner: u32) {
        if owner != self.owner {
            return;
        }
        self.count = 0;
        self.queue.clear();
        self.head = 0;
        self.cache[self.cache_at..].fill(0.);
    }
    pub fn reset(&mut self) -> bool {
        if !self.prepared {
            return false;
        }
        self.voices.fill(Voice::default());
        self.order.fill(0);
        self.count = 0;
        self.seed = 12345;
        self.cache.fill(0.);
        self.cache_at = QUANTUM;
        self.output.fill(0.);
        self.queue.clear();
        self.head = 0;
        self.consumed = 0;
        self.generated = 0;
        self.applied = 0;
        self.late = 0;
        self.overflow = 0;
        self.steals = 0;
        self.peak_active = 0;
        true
    }
    pub fn stat(&self, id: u32) -> f64 {
        match id {
            0 => self.consumed as f64,
            1 => self.generated as f64,
            2 => self.count as f64,
            3 => self.steals as f64,
            4 => self.applied as f64,
            5 => self.late as f64,
            6 => self.overflow as f64,
            7 => (self.queue.len() - self.head) as f64,
            8 => self.owner as f64,
            9 => self.seed as f64,
            10 => self.peak_active as f64,
            _ => 0.,
        }
    }
}
