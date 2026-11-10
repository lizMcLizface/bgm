//! Prepared finite piano voices. All PCM and automation are immutable before
//! playback; render, cancel and reset allocate and free nothing.
use crate::{Piano, Settings};
pub const MAX_BYTES: usize = 64 * 1024 * 1024;
#[derive(Clone, Copy)]
pub struct Point {
    pub frame: f64,
    pub value: f64,
    pub tau: f64,
    pub kind: u32,
}
pub struct Note {
    pub id: u32,
    pub bank: usize,
    pub midi: f32,
    pub velocity: f32,
    pub gain: Vec<Point>,
    pub filter: Vec<Point>,
    voice: Option<usize>,
    onset: u64,
    fade: Option<f64>,
    cut: f64,
}
pub struct Bank {
    strike: Vec<f32>,
    body: Vec<f32>,
    rate: f64,
}
#[derive(Clone, Copy, Default)]
struct Slot {
    note: Option<usize>,
    owner: u32,
    start: u64,
    position: f64,
    body: f64,
    z1: f64,
    z2: f64,
    hz: f64,
    coefficients: [f64; 4],
}
pub struct Engine {
    sr: f64,
    pub banks: Vec<Bank>,
    pub notes: Vec<Note>,
    slots: Vec<Slot>,
    pub ready: bool,
    next: usize,
    cutoff: f64,
    q: f64,
    pitch: f64,
    pitch_tau: f64,
    pub bytes: usize,
    controls: Vec<crate::control::Control>,
    planned: bool,
    peak_active: usize,
    steals: usize,
    peak: f64,
    frame: u64,
}
impl Engine {
    pub fn new(sr: f64, planned: bool) -> Self {
        Self {
            sr,
            banks: Vec::new(),
            notes: Vec::new(),
            slots: Vec::new(),
            ready: false,
            next: 0,
            cutoff: 11000.,
            q: 1.,
            pitch: 0.,
            pitch_tau: 48.,
            bytes: 0,
            controls: Vec::new(),
            planned,
            peak_active: 0,
            steals: 0,
            peak: 0.,
            frame: 0,
        }
    }
    pub fn configure(
        &mut self,
        voices: usize,
        cutoff: f64,
        q: f64,
        pitch: f64,
        decay: f64,
    ) -> bool {
        if self.ready
            || !self.slots.is_empty()
            || !(1..=32).contains(&voices)
            || !cutoff.is_finite()
            || !(0. ..=self.sr / 2.).contains(&cutoff)
            || !q.is_finite()
            || !(0. ..=100.).contains(&q)
            || !pitch.is_finite()
            || pitch.abs() > 2400.
            || !decay.is_finite()
            || !(0. ..=30.).contains(&decay)
        {
            return false;
        }
        self.slots = vec![Slot::default(); voices];
        self.cutoff = cutoff;
        self.q = q;
        self.pitch = pitch;
        self.pitch_tau = (decay / 3.).max(0.001) * self.sr;
        true
    }
    pub fn bank(&mut self, freq: f64, kind: u32, s: Settings, sustain: f64, wear: f64) -> bool {
        if self.ready
            || self.banks.len() >= 128
            || !freq.is_finite()
            || !(10. ..=self.sr / 6.).contains(&freq)
            || kind > 18
            || !sustain.is_finite()
            || !(0. ..=1.).contains(&sustain)
            || !wear.is_finite()
            || !(0. ..=1.).contains(&wear)
            || [
                s.decay,
                s.brightness,
                s.hammer,
                s.unison,
                s.velocity,
                s.resonance,
                s.softness,
            ]
            .iter()
            .any(|x| !x.is_finite())
            || !(0.3..=5.).contains(&s.decay)
            || [
                s.brightness,
                s.hammer,
                s.unison,
                s.velocity,
                s.resonance,
                s.softness,
            ]
            .iter()
            .any(|x| !(0. ..=1.).contains(x))
            || kind >= 2 && sustain != 0.
        {
            return false;
        }
        // Worst-case bound is checked before preparing temporary buffers too.
        if self.bytes + ((self.sr * if kind>=11 {9.}else{7.}).ceil() as usize + 2048) * 4 > MAX_BYTES {
            return false;
        }
        let strike = Piano::note(self.sr, (freq * 100.).round() / 100., kind, s, wear).samples;
        let body = if sustain > 0. {
            Piano::body(
                self.sr,
                freq,
                kind == 1,
                s.brightness,
                s.velocity,
                sustain,
                s.resonance,
            )
            .samples
        } else {
            Vec::new()
        };
        self.bytes += (strike.len() + body.len()) * 4;
        self.banks.push(Bank {
            strike,
            body,
            rate: freq * 2048. / self.sr,
        });
        true
    }
    pub fn note_spec(&mut self, id: u32, bank: usize, midi: f32, velocity: f32) -> bool {
        if self.ready
            || self.notes.len() >= 2000
            || id == 0
            || self.notes.iter().any(|n| n.id == id)
            || bank >= self.banks.len()
            || !midi.is_finite()
            || !(0. ..=127.).contains(&midi)
            || !velocity.is_finite()
            || !(0. ..=1.).contains(&velocity)
        {
            return false;
        }
        self.notes.push(Note {
            id,
            bank,
            midi,
            velocity,
            gain: Vec::new(),
            filter: Vec::new(),
            voice: None,
            onset: 0,
            fade: None,
            cut: 0.,
        });
        true
    }
    pub fn point(&mut self, id: u32, p: Point) -> bool {
        if self.ready
            || !p.frame.is_finite()
            || !(0. ..=self.sr * 60.).contains(&p.frame)
            || !p.value.is_finite()
            || !p.tau.is_finite()
            || p.kind > 2
            || p.kind == 0 && !(0. ..=1.).contains(&p.value)
            || p.kind > 0 && p.value.abs() > 24000.
            || p.kind == 2 && !(self.sr * 0.00001..=self.sr * 30.).contains(&p.tau)
            || self
                .notes
                .iter()
                .map(|n| n.gain.len() + n.filter.len())
                .sum::<usize>()
                >= 65536
        {
            return false;
        }
        let Some(n) = self.notes.iter_mut().find(|n| n.id == id) else {
            return false;
        };
        let list = if p.kind == 0 {
            &mut n.gain
        } else {
            &mut n.filter
        };
        if list.last().is_some_and(|x| x.frame > p.frame) {
            return false;
        }
        list.push(p);
        true
    }
    pub fn lifetime(&mut self, id: u32, voice: usize, onset: f64, fade: f64, cut: f64) -> bool {
        if self.ready
            || voice >= self.slots.len()
            || !onset.is_finite()
            || onset.fract() != 0.
            || !(0. ..=5_760_000.).contains(&onset)
            || !fade.is_finite()
            || !cut.is_finite()
        {
            return false;
        }
        let Some(n) = self.notes.iter_mut().find(|n| n.id == id) else {
            return false;
        };
        let Some(last) = n.gain.last() else {
            return false;
        };
        if n.voice.is_some()
            || !(0. ..=last.frame).contains(&cut)
            || (fade == -1. && cut != last.frame)
            || (fade != -1. && (fade < 0. || cut - fade != 480.))
        {
            return false;
        }
        n.voice = Some(voice);
        n.onset = onset as u64;
        n.fade = if fade == -1. { None } else { Some(fade) };
        n.cut = cut;
        true
    }
    pub fn prepare(&mut self) -> bool {
        if self.slots.is_empty()
            || self.controls.iter().any(|c| !c.ready())
            || self.notes.iter().any(|n| {
                n.gain.len() < 2
                    || n.gain[0].frame != 0.
                    || n.gain.last().unwrap().value != 0.
                    || n.gain.windows(2).any(|w| w[0].frame >= w[1].frame)
                    || n.filter.is_empty()
                    || n.filter[0].frame != 0.
                    || n.filter[0].kind != 1
                    || self.planned
                        && (n.voice.is_none()
                            || n.cut > n.gain.last().unwrap().frame
                            || n.fade.is_none() && n.cut != n.gain.last().unwrap().frame)
            })
        {
            return false;
        }
        if self.planned
            && (self.notes.iter().any(|n| n.voice.is_none())
                || self.notes.iter().enumerate().any(|(i, n)| {
                    self.notes[..i].iter().any(|p| {
                        p.voice == n.voice
                            && (p.onset as f64) < n.onset as f64 + n.cut
                            && (n.onset as f64) < p.onset as f64 + p.cut
                    })
                }))
        {
            return false;
        }
        self.ready = true;
        true
    }
    pub fn valid(&self, k: u32, id: u32, a: f32, b: f32, frame: u64) -> bool {
        k == 4
            || (k == 0)
                && self.notes.iter().any(|n| {
                    n.id == id
                        && n.midi == a
                        && n.velocity == b
                        && (!self.planned || n.onset == frame)
                })
    }
    pub fn control(&mut self, c: crate::control::Control) -> bool {
        if self.ready || self.controls.len() >= 4 || !c.valid() {
            return false;
        }
        self.controls.push(c);
        true
    }
    pub fn control_point(&mut self, index: usize, frame: f64, value: f64) -> bool {
        if self.ready
            || !frame.is_finite()
            || !(0. ..=5_952_000.).contains(&frame)
            || !value.is_finite()
        {
            return false;
        }
        let Some(c) = self.controls.get_mut(index) else {
            return false;
        };
        if (if c.kind == 0 {
            !(0. ..=44100.).contains(&value)
        } else {
            value.abs() > 1.2 + f64::EPSILON
        }) || c.points.len() >= 128
            || c.points.last().is_some_and(|p| p.0 >= frame)
        {
            return false;
        }
        c.points.push((frame, value));
        true
    }
    pub fn conflict(&self, id: u32, owner: u32) -> bool {
        self.slots
            .iter()
            .any(|v| v.note.is_some_and(|i| self.notes[i].id == id) && v.owner != owner)
    }
    pub fn note(&mut self, k: u32, id: u32, owner: u32, frame: u64) -> bool {
        if k == 4 {
            self.cancel(0);
            return true;
        }
        let Some(index) = self.notes.iter().position(|n| n.id == id) else {
            return false;
        };
        let planned = self.notes[index].voice;
        let available = (0..self.slots.len())
            .map(|i| (self.next + i) % self.slots.len())
            .find(|&i| {
                self.slots[i].note.is_none_or(|n| {
                    frame as f64
                        >= self.slots[i].start as f64 + self.notes[n].gain.last().unwrap().frame
                })
            });
        let Some(v) = planned.or(available) else {
            return false;
        };
        if planned.is_some()
            && (self.notes[index].onset != frame
                || self.slots[v].note.is_some_and(|n| {
                    (frame as f64) < self.slots[v].start as f64 + self.notes[n].cut
                }))
        {
            return false;
        }
        if planned.is_some()
            && self.slots[v].note.is_some_and(|n| {
                (frame as f64)
                    < self.slots[v].start as f64 + self.notes[n].gain.last().unwrap().frame
            })
        {
            self.steals += 1;
        }
        let s = &mut self.slots[v];
        s.note = Some(index);
        s.owner = owner;
        s.start = frame;
        s.position = 0.;
        s.body = 0.;
        if planned.is_none() {
            self.next = (v + 1) % self.slots.len();
        }
        true
    }
    pub fn cancel(&mut self, owner: u32) {
        for v in &mut self.slots {
            if owner == 0 || v.owner == owner {
                v.note = None;
                v.z1 = 0.;
                v.z2 = 0.;
            }
        }
    }
    pub fn reset(&mut self) {
        self.slots.fill(Slot::default());
        self.next = 0;
        self.frame = 0;
        self.peak = 0.;
        self.peak_active = 0;
        self.steals = 0;
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self
                .slots
                .iter()
                .filter(|v| {
                    v.note
                        .is_some_and(|n| ((self.frame - v.start) as f64) < end(&self.notes[n]))
                })
                .count() as f64,
            1 => self.steals as f64,
            4 => self.frame as f64,
            5 => self.peak,
            7 => self.peak_active as f64,
            _ => 0.,
        }
    }
    pub fn render(&mut self, frame: u64, out: &mut [[f32; 2]]) {
        self.peak = 0.;
        for (i, o) in out.iter_mut().enumerate() {
            let now = frame + i as u64;
            let key_frame = now / 128 * 128;
            let mut pitch_control = 0.;
            let mut filter_control = 0.;
            for c in &self.controls {
                if c.axis == 0 {
                    pitch_control += c.at(key_frame as f64, self.sr);
                } else {
                    filter_control += c.at(now as f64, self.sr);
                }
            }
            let mut sum = 0f32;
            for v in &mut self.slots {
                if v.note.is_none() {
                    continue;
                }
                let mut input = 0.;
                let mut detune = 0.;
                if let Some(index) = v.note {
                    let n = &self.notes[index];
                    let t = (now - v.start) as f64;
                    detune = target(&n.filter, t);
                    if t < end(n) {
                        let bank = &self.banks[n.bank];
                        let strike = interpolate(&bank.strike, v.position, false);
                        let body = interpolate(&bank.body, v.body, true);
                        let amplitude = if let Some(f) = n.fade.filter(|f| t >= *f) {
                            gain(&n.gain, f) * (-(t - f) / 96.).exp()
                        } else {
                            gain(&n.gain, t)
                        };
                        input = (((strike + body) as f32 * 2.5) as f64 * amplitude) as f32 as f64;
                        detune = target(&n.filter, t);
                        // AudioBufferSource detune is k-rate, on the absolute
                        // render quantum clock; source cursors remain owned.
                        let kt = (now / 128 * 128).saturating_sub(v.start) as f64;
                        let rate = 2f64.powf(
                            (self.pitch * (-kt / self.pitch_tau).exp() + pitch_control) / 1200.,
                        );
                        v.position += rate;
                        v.body += rate * bank.rate;
                    }
                }
                let hz = (self.cutoff * 2f64.powf((detune + filter_control) / 1200.))
                    .clamp(0., self.sr / 2.);
                if hz != v.hz {
                    let w = std::f64::consts::TAU * hz / self.sr;
                    let c = w.cos();
                    let alpha = w.sin() / (2. * 10f64.powf(self.q / 20.));
                    let a0 = 1. + alpha;
                    v.coefficients = [
                        (1. - c) * 0.5 / a0,
                        (1. - c) / a0,
                        -2. * c / a0,
                        (1. - alpha) / a0,
                    ];
                    v.hz = hz;
                }
                let [b0, b1, a1, a2] = v.coefficients;
                let y = b0 * input + v.z1;
                v.z1 = b1 * input - a1 * y + v.z2;
                v.z2 = b0 * input - a2 * y;
                sum += (y as f32 * 0.2) as f32;
            }
            self.peak_active = self.peak_active.max(
                self.slots
                    .iter()
                    .filter(|v| {
                        v.note
                            .is_some_and(|n| ((now - v.start) as f64) < end(&self.notes[n]))
                    })
                    .count(),
            );
            self.peak = self.peak.max(sum.abs() as f64);
            *o = [sum, sum];
        }
        self.frame = frame + out.len() as u64;
    }
}
fn end(n: &Note) -> f64 {
    if n.voice.is_some() {
        n.cut
    } else {
        n.gain.last().unwrap().frame
    }
}
fn interpolate(a: &[f32], p: f64, looped: bool) -> f64 {
    if a.is_empty() || !looped && p >= a.len() as f64 {
        return 0.;
    }
    let p = if looped { p % a.len() as f64 } else { p };
    let i = p as usize;
    let next = if looped { (i + 1) % a.len() } else { i + 1 };
    let x = a[i] as f64;
    x + (a.get(next).copied().unwrap_or(0.) as f64 - x) * p.fract()
}
fn gain(p: &[Point], t: f64) -> f64 {
    let mut prior = p[0];
    for &next in &p[1..] {
        if t <= next.frame {
            return prior.value
                + (next.value - prior.value) * (t - prior.frame) / (next.frame - prior.frame);
        }
        prior = next;
    }
    prior.value
}
fn target(p: &[Point], t: f64) -> f64 {
    let mut value = 0.;
    let mut previous = 0.;
    let mut goal = 0.;
    let mut tau = 0.;
    for e in p {
        if e.frame > t {
            break;
        }
        if tau > 0. {
            value = goal + (value - goal) * (-(e.frame - previous) / tau).exp();
        }
        previous = e.frame;
        if e.kind == 1 {
            value = e.value;
            tau = 0.;
        } else {
            goal = e.value;
            tau = e.tau;
        }
    }
    if tau > 0. {
        goal + (value - goal) * (-(t - previous) / tau).exp()
    } else {
        value
    }
}
