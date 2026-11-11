//! Canonical 128-frame adapters around the preserved owned rack worklet DSP.
//!
//! Native rack controls are k-rate Float32 AudioParams. The target ledger keeps
//! the complete requested f64 configuration; the owned kernel performs the same
//! Float32 conversion as the original worklet. Graph V1 shapes are immutable
//! after preparation, including both custom banks.
use calmbgm_rack_fx::{Engine, Kind};

pub const QUANTUM: usize = 128;

pub struct Adapter {
    kernel: Box<Engine>,
    targets: [f64; 6],
    cache: [[f32; QUANTUM]; 2],
    phase: usize,
    prepared: bool,
    input_frames: u64,
}

impl Adapter {
    pub fn new(kind: Kind, rate: f64) -> Option<Box<Self>> {
        let kernel = Engine::new(kind, rate)?;
        let targets = kernel.parameters();
        Some(Box::new(Self {
            kernel,
            targets,
            cache: [[0.; QUANTUM]; 2],
            phase: 0,
            prepared: false,
            input_frames: 0,
        }))
    }

    pub fn kind(&self) -> Kind {
        self.kernel.kind()
    }

    /// Complete initial controls are configured before graph preparation.
    pub fn initial(&mut self, index: usize, value: f64) -> bool {
        if self.prepared || !self.kernel.param(index, value) {
            return false;
        }
        self.targets[index] = value;
        true
    }

    /// A complete capture block must see one coherent k-rate control set.
    pub fn param(&mut self, index: usize, value: f64) -> bool {
        if !self.prepared || self.phase != 0 || !self.kernel.param(index, value) {
            return false;
        }
        self.targets[index] = value;
        true
    }

    pub fn parameters(&self) -> [f64; 6] {
        self.targets
    }

    pub fn shape_count(&mut self, count: usize) -> bool {
        !self.prepared && self.kernel.shape_count(count)
    }

    pub fn shape_row(&mut self, shape: usize, section: usize, row: [f64; 3]) -> bool {
        !self.prepared && self.kernel.shape_row(shape, section, row)
    }

    pub fn can_prepare(&self) -> bool {
        !self.prepared && self.kernel.can_prepare()
    }
    pub fn prepare(&mut self) -> bool {
        if !self.can_prepare() || !self.kernel.prepare() {
            return false;
        }
        self.prepared = true;
        true
    }

    /// Emit the previous completed block while capturing this block. Both
    /// channels share one capture phase and the declared adapter latency is 128.
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

    /// Keep latest controls and prepared shapes; discard pending capture,
    /// cached output, phase, DSP history and clocks without allocation.
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
