//! Prepared classic source boundary. A canonical 128-frame native callback is
//! split only by this source's prebooked events; unrelated graph boundaries do
//! not change BBD/space/native rendering partitions. No render allocation.
use calmbgm_classics::owned::Engine as Native;

pub const QUANTUM: usize = 128;
pub const MAX_EVENTS: usize = 4000;
const MAX_FRAME: u64 = (1u64 << 53) - 1;

/// kind0 note-on(id=key,a=MIDI,b=velocity);1 off(id=key);2 control(id=0..6,a);
///3 poly-pressure(id=key,a);4 panic/clear future source events;5 native parameter
///(id=0..215,a);6 sequence(id=command0..7,a=integer argument index,b=value).
#[derive(Clone, Copy, Debug)]
pub struct Event {
    pub frame: u64,
    pub owner: u32,
    pub kind: u32,
    pub id: u32,
    pub a: f32,
    pub b: f32,
}

pub struct Source {
    native: Box<Native>,
    model: u32,
    initial: [f32; 216],
    configured: [bool; 216],
    waves: Vec<f32>,
    events: Vec<Event>,
    cache: [[f32; 2]; QUANTUM],
    consumed: u64,
    generated: u64,
    owner: u32,
    ready: bool,
    cancelled: bool,
    polyphony: usize,
    held: [u32; 32],
    held_len: usize,
    late: u64,
    overflow: u64,
    rejected: u64,
    applied: u64,
    peak: f32,
    peak_active: f64,
}
impl Source {
    pub fn new(rate: f64, model: u32) -> Option<Box<Self>> {
        if !rate.is_finite() || rate.fract() != 0. || !(8000. ..=192000.).contains(&rate) {
            return None;
        }
        Some(Box::new(Self {
            native: Native::new(rate as f32, model)?,
            model,
            initial: [0.; 216],
            configured: [false; 216],
            waves: Vec::new(),
            events: Vec::with_capacity(MAX_EVENTS),
            cache: [[0.; 2]; QUANTUM],
            consumed: 0,
            generated: 0,
            owner: 0,
            ready: false,
            cancelled: false,
            polyphony: 32,
            held: [0; 32],
            held_len: 0,
            late: 0,
            overflow: 0,
            rejected: 0,
            applied: 0,
            peak: 0.,
            peak_active: 0.,
        }))
    }
    pub fn initial_param(&mut self, id: u32, value: f32) -> bool {
        if self.ready || id >= 216 || !self.native.param(id, value) {
            return false;
        }
        self.initial[id as usize] = value;
        self.configured[id as usize] = true;
        true
    }
    /// Match the classic worklet's held-key Set cap independently of native
    /// voice capacity/release tails. The fixed storage never allocates in render.
    pub fn initial_polyphony(&mut self, voices: usize) -> bool {
        if self.ready || !(1..=32).contains(&voices) {
            return false;
        }
        self.polyphony = voices;
        true
    }
    /// Preparation-only upload seam. Call wave_commit() before prepare().
    pub fn wave_ptr(&mut self) -> *mut f32 {
        if self.ready {
            std::ptr::null_mut()
        } else {
            self.native.wave_ptr()
        }
    }
    pub fn wave_len(&self) -> usize {
        self.native.wave_len()
    }
    pub fn wave_commit(&mut self) -> bool {
        if self.ready || !self.native.wave_commit() {
            return false;
        }
        let len = self.native.wave_len();
        self.waves.resize(len, 0.);
        unsafe {
            self.waves
                .copy_from_slice(core::slice::from_raw_parts(self.native.wave_ptr(), len));
        }
        true
    }
    pub fn initial_waves(&mut self, data: &[f32]) -> bool {
        if self.ready
            || data.len() != self.wave_len()
            || data.is_empty()
            || data.iter().any(|v| !v.is_finite() || v.abs() > 64.)
        {
            return false;
        }
        unsafe {
            core::slice::from_raw_parts_mut(self.native.wave_ptr(), data.len())
                .copy_from_slice(data);
        }
        self.wave_commit()
    }
    pub fn can_prepare(&self) -> bool {
        if self.ready {
            return false;
        }
        // VS has no built-in ROM in the original kernel; a complete resource is
        // required rather than claiming a prepared silent/unready source.
        if self.model == 7 && self.waves.len() != self.wave_len() {
            return false;
        }
        true
    }
    pub fn prepare(&mut self) -> bool {
        if !self.can_prepare() { return false; }
        self.ready = true;
        true
    }
    fn valid_parameter(&self, id: u32) -> bool {
        id < self.native.parameter_count() as u32
            || (180..196).contains(&id) && matches!(self.model, 0 | 1 | 2 | 3 | 4 | 6 | 12)
            || (200..216).contains(&id)
    }
    pub fn valid(&self, e: &Event) -> bool {
        e.frame <= MAX_FRAME
            && e.owner != 0
            && e.a.is_finite()
            && e.b.is_finite()
            && match e.kind {
                0 => e.id != 0 && (0. ..=127.).contains(&e.a) && (0. ..=1.).contains(&e.b),
                1 => e.id != 0,
                2 => e.id <= 6,
                3 => e.id != 0 && (0. ..=1.).contains(&e.a),
                4 => true,
                5 => self.valid_parameter(e.id),
                6 => {
                    matches!(self.model, 8 | 9 | 10 | 11 | 13)
                        && e.id <= 7
                        && e.a >= 0.
                        && e.a <= 16_777_215.
                        && e.a.fract() == 0.
                }
                _ => false,
            }
    }
    pub fn enqueue(&mut self, mut event: Event) -> bool {
        if !self.ready || !self.valid(&event) || (self.owner != 0 && event.owner != self.owner) {
            self.rejected += 1;
            return false;
        }
        if self.events.len() >= MAX_EVENTS {
            self.overflow += 1;
            return false;
        }
        if event.frame < self.generated {
            event.frame = self.generated;
            self.late += 1;
        }
        if event.frame > MAX_FRAME {
            self.rejected += 1;
            return false;
        }
        self.owner = event.owner;
        let at = self.events.partition_point(|e| e.frame <= event.frame);
        self.events.insert(at, event);
        true
    }
    pub fn generated_frame(&self) -> u64 {
        self.generated
    }
    pub fn consumed_frame(&self) -> u64 {
        self.consumed
    }
    fn apply(&mut self, e: Event) -> bool {
        let ok = match e.kind {
            0 => {
                if self.held_len >= self.polyphony {
                    let _ = self.native.note_off(self.held[0]);
                    self.held.copy_within(1..self.held_len, 0);
                    self.held_len -= 1;
                }
                if !self.held[..self.held_len].contains(&e.id) {
                    self.held[self.held_len] = e.id;
                    self.held_len += 1;
                }
                self.native.note_on(e.id, e.a, e.b)
            }
            1 => {
                if let Some(i) = self.held[..self.held_len].iter().position(|id| *id == e.id) {
                    self.held.copy_within(i + 1..self.held_len, i);
                    self.held_len -= 1;
                }
                self.native.note_off(e.id)
            }
            2 => self.native.control(e.id, e.a),
            3 => self.native.pressure(e.id, e.a),
            4 => {
                self.native.panic();
                self.events.clear();
                self.held_len = 0;
                true
            }
            5 => self.native.param(e.id, e.a),
            6 => self.native.seq(e.id, e.a as u32, e.b),
            _ => false,
        };
        if ok {
            if e.kind == 0 || e.kind == 6 {
                self.cancelled = false;
            }
            self.applied += 1;
            self.peak_active = self.peak_active.max(self.native.stat(0));
        } else {
            self.rejected += 1;
        }
        ok
    }
    fn fill(&mut self) -> bool {
        let start = self.generated;
        let end = start + QUANTUM as u64;
        let mut at = start;
        self.cache.fill([0.; 2]);
        while at < end {
            while self.events.first().is_some_and(|e| e.frame <= at) {
                let event = self.events.remove(0);
                if !self.apply(event) {
                    return false;
                }
            }
            let next = self.events.first().map_or(end, |e| e.frame.min(end));
            let n = (next - at) as usize;
            if n == 0 {
                return false;
            }
            if !self.native.render(n) {
                return false;
            }
            for i in 0..n {
                if !self.cancelled {
                    self.cache[(at - start) as usize + i] =
                        [self.native.left()[i], self.native.right()[i]];
                }
            }
            self.peak_active = self.peak_active.max(self.native.stat(0));
            at = next;
        }
        self.generated = end;
        true
    }
    pub fn render(&mut self, frame: u64, out: &mut [[f32; 2]]) -> bool {
        if !self.ready
            || frame != self.consumed
            || frame > MAX_FRAME
            || out.len() as u64 > MAX_FRAME - frame
        {
            return false;
        }
        self.peak = 0.;
        for sample in out {
            if self.consumed == self.generated && !self.fill() {
                return false;
            }
            *sample = self.cache[(self.consumed % QUANTUM as u64) as usize];
            self.peak = self.peak.max(sample[0].abs()).max(sample[1].abs());
            self.consumed += 1;
        }
        true
    }
    pub fn cancel(&mut self, owner: u32) {
        if owner == 0 || owner != self.owner {
            return;
        }
        self.events.clear();
        self.native.panic();
        self.cancelled = true;
        self.held_len = 0;
        self.cache.fill([0.; 2]);
        self.peak = 0.;
    }
    pub fn reset(&mut self) {
        self.native.reset();
        for id in 0..216 {
            if self.configured[id] {
                let _ = self.native.param(id as u32, self.initial[id]);
            }
        }
        if !self.waves.is_empty() {
            unsafe {
                core::slice::from_raw_parts_mut(self.native.wave_ptr(), self.waves.len())
                    .copy_from_slice(&self.waves);
            }
            let _ = self.native.wave_commit();
        }
        self.events.clear();
        self.cache.fill([0.; 2]);
        self.consumed = 0;
        self.generated = 0;
        self.owner = 0;
        self.cancelled = false;
        self.held_len = 0;
        self.late = 0;
        self.overflow = 0;
        self.rejected = 0;
        self.applied = 0;
        self.peak = 0.;
        self.peak_active = 0.;
    }
    /// Indices0..7 follow graph pitched stats. Rendering can have generated one
    /// quantum ahead, exposed separately as8; its voices/meters share that scope.
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => self.native.stat(0),
            1 => self.native.stat(1),
            2 => self.rejected as f64,
            3 => self.late as f64,
            4 => self.consumed as f64,
            5 => self.peak as f64,
            6 => 0.,
            7 => self.peak_active,
            8 => self.generated as f64,
            9 => self.applied as f64,
            10 => self.overflow as f64,
            11 => self.events.len() as f64,
            12 => self.owner as f64,
            13 => self.held_len as f64,
            14 => self.polyphony as f64,
            _ => 0.,
        }
    }
}
