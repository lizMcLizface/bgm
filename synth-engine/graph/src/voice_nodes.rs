//! Canonical 128-frame adapters for the actual owned Shimmer/Freeze kernels.
//!
//! Message-rate f64 controls, original block-sensitive sleep/capture policy and
//! instance-seeded random state remain intact. The adapter does not make Freeze's
//! synchronous capture deadline-safe: Freeze must remain worker-only.
use calmbgm_voice_fx::{Engine, Kind};

pub const QUANTUM: usize = 128;

pub struct Adapter {
    kernel: Box<Engine>,
    kind: Kind,
    targets: [f64; 5],
    cache: [[f32; QUANTUM]; 2],
    phase: usize,
    prepared: bool,
    input_frames: u64,
}

impl Adapter {
    pub fn new(kind: Kind, rate: f64, seed: u32) -> Option<Box<Self>> {
        let kernel = Engine::new(kind, rate, seed)?;
        let targets = kernel.parameters();
        Some(Box::new(Self {
            kernel,
            kind,
            targets,
            cache: [[0.; QUANTUM]; 2],
            phase: 0,
            prepared: false,
            input_frames: 0,
        }))
    }

    pub fn kind(&self) -> Kind {
        self.kind
    }

    pub fn initial(&mut self, index: usize, value: f64) -> bool {
        if self.prepared || !self.kernel.param(index, value) {
            return false;
        }
        self.targets[index] = value;
        true
    }

    /// Parent graph validation must also require 128-frame input ticks.
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        if !self.prepared || self.phase != 0 || !self.kernel.param(index, value) {
            return false;
        }
        self.targets[index] = value;
        true
    }

    pub fn parameters(&self) -> [f64; 5] {
        self.targets
    }

    pub fn can_prepare(&self) -> bool {
        !self.prepared
    }
    pub fn prepare(&mut self) -> bool {
        if !self.can_prepare() {
            return false;
        }
        self.prepared = true;
        true
    }

    pub fn tick(&mut self, input: [f32; 2]) -> [f32; 2] {
        if !self.prepared {
            return [0.; 2];
        }
        let out = [self.cache[0][self.phase], self.cache[1][self.phase]];
        for (channel, value) in input.iter().enumerate() {
            self.kernel.input_mut(channel).unwrap()[self.phase] = *value;
        }
        if self.phase == QUANTUM - 1 {
            let rendered = self.kernel.render(QUANTUM);
            debug_assert!(rendered);
            for channel in 0..2 {
                self.cache[channel]
                    .copy_from_slice(&self.kernel.output(channel).unwrap()[..QUANTUM]);
            }
        }
        self.phase = (self.phase + 1) % QUANTUM;
        self.input_frames += 1;
        out
    }

    /// Reset is a fresh seeded run at the latest f64 targets. In particular,
    /// hold=true remains armed with an empty recording and the original retry
    /// policy; reset is not an implicit hold release or a render-time capture.
    pub fn reset(&mut self) {
        self.kernel.reset();
        self.cache.fill([0.; QUANTUM]);
        self.phase = 0;
        self.input_frames = 0;
    }

    pub fn stat(&self, index: u32) -> f64 {
        match index {
            16 => QUANTUM as f64,
            17 => self.phase as f64,
            18 => self.input_frames as f64,
            19 => self.prepared as u32 as f64,
            _ => self.kernel.stat(index),
        }
    }
}
