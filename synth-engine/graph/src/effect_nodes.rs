//! Canonical-quantum adapters for the existing owned insert/send kernels.
//!
//! Kernel render cadence is exactly 128 captured input samples regardless of
//! graph block size or unrelated event splits. The previous completed kernel
//! block is emitted while the next block accumulates, declaring 128 frames of
//! adapter latency. Host/graph lifecycle and parameter events remain external.

const QUANTUM: usize = 128;

enum Kernel {
    Inserts(Box<calmbgm_inserts::Engine>),
    Send(Box<calmbgm_effects::Engine>),
}

pub struct Adapter {
    kernel: Kernel,
    cache: [[f32; QUANTUM]; 2],
    phase: usize,
    prepared: bool,
    settled: bool,
    input_frames: u64,
}

impl Adapter {
    /// Preparation-only construction; both large kernel state and buffers are
    /// instance-owned and boxed by the existing owned Engine constructors.
    pub fn new(send: bool, rate: f32) -> Option<Box<Self>> {
        let kernel = if send {
            Kernel::Send(calmbgm_effects::Engine::new(rate)?)
        } else {
            Kernel::Inserts(calmbgm_inserts::Engine::new(rate)?)
        };
        Some(Box::new(Self {
            kernel,
            cache: [[0.; QUANTUM]; 2],
            phase: 0,
            prepared: false,
            settled: false,
            input_frames: 0,
        }))
    }

    /// Graph event validation also enforces the canonical boundary. This local
    /// guard prevents a partial capture block from observing two parameter sets.
    pub fn param(&mut self, index: usize, value: f32) -> bool {
        if self.phase != 0 {
            return false;
        }
        match &mut self.kernel {
            Kernel::Inserts(engine) => engine.param(index, value),
            Kernel::Send(engine) => engine.param(index, value),
        }
    }

    /// Inserts can settle their initial smoothing state. Send effects preserve
    /// their original initialization/transitions and have no settle operation.
    pub fn can_prepare(&self) -> bool {
        self.phase == 0 && self.input_frames == 0
    }
    pub fn prepare(&mut self, settled: bool) -> bool {
        if !self.can_prepare() {
            return false;
        }
        self.settled = settled;
        if settled {
            if let Kernel::Inserts(engine) = &mut self.kernel {
                engine.settle();
            }
        }
        self.prepared = true;
        true
    }

    /// Stereo dry program, reverb send and delay send, in that order. Inserts
    /// consume only dry program. Requires successful preparation before render.
    pub fn tick(&mut self, inputs: [[f32; 2]; 3]) -> [f32; 2] {
        if !self.prepared {
            return [0.; 2];
        }
        // Take this sample before replacing the cache at the end of a block.
        let out = [self.cache[0][self.phase], self.cache[1][self.phase]];
        match &mut self.kernel {
            Kernel::Inserts(engine) => {
                for channel in 0..2 {
                    engine.input_mut(channel).unwrap()[self.phase] = inputs[0][channel];
                }
                if self.phase == QUANTUM - 1 {
                    let rendered = engine.render(QUANTUM);
                    debug_assert!(rendered);
                    for channel in 0..2 {
                        self.cache[channel]
                            .copy_from_slice(&engine.output(channel).unwrap()[..QUANTUM]);
                    }
                }
            }
            Kernel::Send(engine) => {
                for (bus, input) in inputs.iter().enumerate() {
                    for (channel, value) in input.iter().enumerate() {
                        engine.input_mut(bus * 2 + channel).unwrap()[self.phase] = *value;
                    }
                }
                if self.phase == QUANTUM - 1 {
                    let rendered = engine.render(QUANTUM);
                    debug_assert!(rendered);
                    for channel in 0..2 {
                        self.cache[channel]
                            .copy_from_slice(&engine.output(channel).unwrap()[..QUANTUM]);
                    }
                }
            }
        }
        self.phase = (self.phase + 1) % QUANTUM;
        self.input_frames += 1;
        out
    }

    /// Retain the kernel's latest parameter targets, clear tails/history and
    /// discard both pending capture and cached output without allocating. The
    /// owned Inserts::reset contract settles targets even if first preparation
    /// used startup smoothing; send reset retains its original transition law.
    pub fn reset(&mut self) {
        match &mut self.kernel {
            Kernel::Inserts(engine) => {
                engine.reset();
                if self.settled {
                    engine.settle();
                }
            }
            Kernel::Send(engine) => engine.reset(),
        }
        self.cache.fill([0.; QUANTUM]);
        self.phase = 0;
        self.input_frames = 0;
    }

    /// Indices 0..15 retain the owned kernel's existing meter meanings. Extra
    /// adapter metrics: 16 latency, 17 capture phase, 18 input frames, 19 ready.
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            16 => QUANTUM as f64,
            17 => self.phase as f64,
            18 => self.input_frames as f64,
            19 => self.prepared as u32 as f64,
            _ => match &self.kernel {
                Kernel::Inserts(engine) => engine.stat(index),
                Kernel::Send(engine) => engine.stat(index),
            },
        }
    }
}
