//! Sample-accurate step sequencer shared by the drum machines and the bass line.
//! The clock lives inside the kernel, so a step lands on its exact frame instead of the
//! next 128-frame block. Patterns themselves belong to each model; this holds time,
//! pattern selection and the chain.

pub const MAX_PATTERNS: usize = 8;
pub const MAX_STEPS: usize = 16;
pub const MAX_CHAIN: usize = 16;

pub struct Seq {
    sr: f32,
    pub bpm: f32,
    /// Position of the off-beat 16th inside its pair: 0.5 straight, 0.667 triplet shuffle.
    pub swing: f32,
    pub running: bool,
    /// Steps per pattern and a tempo of its own (0 = the global tempo).
    pub lens: [u8; MAX_PATTERNS],
    pub tempos: [f32; MAX_PATTERNS],
    /// Pattern the engine is playing and the one queued for the next bar.
    pub current: usize,
    pub queued: Option<usize>,
    pub chain: [u8; MAX_CHAIN],
    pub chain_len: usize,
    chain_pos: usize,
    first: bool,
    step: usize,
    /// Frames from the start of the block to the next unswung step.
    base: f64,
    /// The step and pattern fired last (for the playhead display).
    pub last_step: usize,
    pub last_pattern: usize,
}

impl Seq {
    pub const fn new() -> Self {
        Self {
            sr: 48000.,
            bpm: 120.,
            swing: 0.5,
            running: false,
            lens: [MAX_STEPS as u8; MAX_PATTERNS],
            tempos: [0.; MAX_PATTERNS],
            current: 0,
            queued: None,
            chain: [0; MAX_CHAIN],
            chain_len: 0,
            chain_pos: 0,
            first: true,
            step: 0,
            base: 0.,
            last_step: 0,
            last_pattern: 0,
        }
    }
    pub fn init(&mut self, sr: f32) {
        *self = Self::new();
        self.sr = sr;
    }
    pub fn step_frames(&self) -> f64 {
        let own = self.tempos[self.current.min(MAX_PATTERNS - 1)];
        let bpm = if own > 0. { own } else { self.bpm };
        self.sr as f64 * 60. / (bpm.clamp(30., 300.) as f64 * 4.)
    }
    /// Length in steps of a pattern.
    pub fn len_of(&self, pattern: usize) -> usize {
        (self.lens[pattern.min(MAX_PATTERNS - 1)] as usize).clamp(1, MAX_STEPS)
    }
    pub fn play(&mut self) {
        if !self.running {
            self.running = true;
            self.step = 0;
            self.base = 0.;
            self.first = true;
            self.chain_pos = 0;
        }
    }
    pub fn stop(&mut self) {
        self.running = false;
    }
    pub fn rewind(&mut self) {
        self.step = 0;
        self.base = 0.;
        self.first = true;
        self.chain_pos = 0;
    }
    /// Selects a pattern: at once when stopped, at the next bar while running.
    pub fn select(&mut self, pattern: usize) {
        let p = pattern.min(MAX_PATTERNS - 1);
        if self.running {
            self.queued = Some(p);
        } else {
            self.current = p;
            self.queued = None;
        }
    }
    /// Handles the commands every model shares. Returns false for the others.
    pub fn command(&mut self, cmd: u32, a: u32, b: f32) -> bool {
        match cmd {
            0 => {
                if a != 0 {
                    self.play()
                } else {
                    self.stop()
                }
            }
            2 => self.select(a as usize),
            3 => {
                if (a as usize) < MAX_CHAIN {
                    self.chain[a as usize] = (b.max(0.) as usize).min(MAX_PATTERNS - 1) as u8;
                }
            }
            4 => self.chain_len = (a as usize).min(MAX_CHAIN),
            5 => self.lens[(b.max(0.) as usize).min(MAX_PATTERNS - 1)] = (a as usize).clamp(1, MAX_STEPS) as u8,
            8 => self.tempos[(a as usize).min(MAX_PATTERNS - 1)] = if b > 0. { b.clamp(30., 300.) } else { 0. },
            6 => self.rewind(),
            _ => return false,
        }
        true
    }
    /// Frame (within this block) of the next step, with swing applied.
    pub fn next_frame(&self) -> f64 {
        let off = if self.step % 2 == 1 { (self.swing.clamp(0.5, 0.75) as f64 - 0.5) * 2. * self.step_frames() } else { 0. };
        self.base + off
    }
    /// Fires the step that is due: returns (pattern, step) and moves on.
    pub fn fire(&mut self) -> (usize, usize) {
        let step = self.step;
        if step == 0 {
            if let Some(q) = self.queued.take() {
                self.current = q;
            } else if self.chain_len > 0 {
                if !self.first {
                    self.chain_pos = (self.chain_pos + 1) % self.chain_len;
                }
                self.current = self.chain[self.chain_pos] as usize;
            }
            self.first = false;
        }
        let pattern = self.current;
        self.last_step = step;
        self.last_pattern = pattern;
        self.step = (step + 1) % self.len_of(pattern);
        self.base += self.step_frames();
        (pattern, step)
    }
    /// Call once per block after the steps have been fired.
    pub fn end_block(&mut self, frames: usize) {
        if self.running {
            self.base -= frames as f64;
        }
    }
    /// The frame at which to stop rendering for the next event, or `usize::MAX` if none is due.
    #[inline]
    pub fn due(&self) -> usize {
        if self.running {
            self.next_frame().max(0.).ceil() as usize
        } else {
            usize::MAX
        }
    }
}
