//! Owned mixer primitives with complete, f64 preparation authority.
//! No parameter target is reconstructed through the graph's f32 base metadata.

pub const PARAMETER_COUNTS: [usize; 4] = [8, 2, 1, 2];
pub const PARAMETER_NAMES: [&[&str]; 4] = [
    &[
        "trim", "highpass", "lowpass", "low", "mid", "high", "pan", "level",
    ],
    &["width", "pan"],
    &["level"],
    &["enabled", "ceiling"],
];

pub struct Adapter {
    processor: calmbgm_mixer::Processor,
    kind: usize,
    targets: [f64; 8],
    initial_mask: u16,
    settled: Option<bool>,
    prepared: bool,
    frames: u64,
}

impl Adapter {
    /// Kind codes match the portable crate: strip0, matrix1, fader2, limiter3.
    /// Limiter buffers allocate here, outside the render callback.
    pub fn new(kind: u32, rate: f64) -> Option<Box<Self>> {
        let processor = calmbgm_mixer::Processor::new(kind, rate)?;
        Some(Box::new(Self {
            processor,
            kind: kind as usize,
            targets: [0.; 8],
            initial_mask: 0,
            settled: None,
            prepared: false,
            frames: 0,
        }))
    }

    pub fn names(&self) -> &'static [&'static str] {
        PARAMETER_NAMES[self.kind]
    }

    pub fn valid(&self, index: usize, value: f64) -> bool {
        self.processor.valid(index, value)
    }

    /// Each parameter must be provided exactly once, with one consistent
    /// captured startup policy. Failed writes do not alter authority or DSP.
    pub fn initial(&mut self, index: usize, value: f64, settled: bool) -> bool {
        if self.prepared
            || index >= PARAMETER_COUNTS[self.kind]
            || self.initial_mask & (1 << index) != 0
            || self.settled.is_some_and(|s| s != settled)
            || !self.valid(index, value)
        {
            return false;
        }
        if !self.processor.set(index, value, settled) {
            return false;
        }
        self.targets[index] = value;
        self.initial_mask |= 1 << index;
        self.settled = Some(settled);
        true
    }

    pub fn can_prepare(&self) -> bool {
        if self.initial_mask != (1 << PARAMETER_COUNTS[self.kind]) - 1
            || self.settled.is_none()
            || self.frames != 0
        {
            return false;
        }
        true
    }
    /// Idempotent before processing starts, supporting graph validation retry.
    pub fn prepare(&mut self) -> bool {
        if !self.can_prepare() { return false; }
        self.prepared = true;
        true
    }

    /// Timestamped edits retain full f64 targets. Continuous mixer controls use
    /// their original 12ms law; limiter settings use the original immediate law.
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        if !self.prepared || !self.valid(index, value) {
            return false;
        }
        if !self.processor.set(index, value, false) {
            return false;
        }
        self.targets[index] = value;
        true
    }

    pub fn value(&self, index: usize) -> f64 {
        if index < PARAMETER_COUNTS[self.kind] && self.initial_mask & (1 << index) != 0 {
            self.targets[index]
        } else {
            f64::NAN
        }
    }

    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        if !self.prepared {
            return [0.; 2];
        }
        self.frames += 1;
        self.processor.tick(input)
    }

    /// Retain latest targets and the captured startup settlement policy. This
    /// clears owned histories/delay state; it is not an in-flight tail snapshot.
    pub fn reset(&mut self) {
        self.processor.reset();
        for index in 0..PARAMETER_COUNTS[self.kind] {
            if self.initial_mask & (1 << index) != 0 {
                let restored =
                    self.processor
                        .set(index, self.targets[index], self.settled.unwrap_or(false));
                debug_assert!(restored);
            }
        }
        self.frames = 0;
    }

    pub fn latency(&self) -> usize {
        self.processor.latency_frames()
    }

    pub fn reduction(&self) -> f64 {
        self.processor.reduction_gain()
    }
}
