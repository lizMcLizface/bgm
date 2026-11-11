//! Actual finite measured-string preparation and separately owned PCM playback.
mod abi;
#[cfg(feature = "allocation-audit")]
mod allocation;
#[path = "../../string-preparation/src/fft.rs"]
pub mod fft;
pub mod model;
pub mod render;
use std::sync::atomic::{AtomicUsize, Ordering};
const MAX_PCM: usize = 64 * 1024 * 1024;
const MAX_SAMPLES: usize = 768000;
const BLOCK: usize = 2048;
static OWNED_PCM: AtomicUsize = AtomicUsize::new(0);
fn reserve(bytes: usize) -> bool {
    OWNED_PCM
        .try_update(Ordering::Relaxed, Ordering::Relaxed, |old| {
            old.checked_add(bytes).filter(|v| *v <= MAX_PCM)
        })
        .is_ok()
}
fn release(bytes: usize) {
    OWNED_PCM.fetch_sub(bytes, Ordering::Relaxed);
}
pub struct Preparation {
    input: Vec<f64>,
    result: Option<render::Rendered>,
    reserved: usize,
    rate: f64,
    seconds: f64,
    gain: f64,
    seed: u32,
}
impl Preparation {
    fn new(n: usize) -> Option<Box<Self>> {
        if n < 16 || n > 8192 {
            return None;
        }
        Some(Box::new(Self {
            input: vec![0.; n],
            result: None,
            reserved: 0,
            rate: 0.,
            seconds: 0.,
            gain: 0.,
            seed: 0,
        }))
    }
    fn prepare(&mut self) -> bool {
        if self.result.is_some() {
            return false;
        }
        let Some(m) = model::Model::parse(&self.input) else {
            return false;
        };
        let bytes = (m.rate * m.seconds).ceil() as usize * 4;
        if !reserve(bytes) {
            return false;
        }
        let Some(result) = render::render(&m) else {
            release(bytes);
            return false;
        };
        self.reserved = bytes;
        self.rate = m.rate;
        self.seconds = m.seconds;
        self.gain = m.gain;
        self.seed = if m.seed == 0 { 1 } else { m.seed };
        self.result = Some(result);
        self.input = Vec::new();
        true
    }
    fn stat(&self, id: u32) -> f64 {
        let Some(r) = &self.result else { return 0. };
        match id {
            0 => r.samples.len() as f64,
            1 => r.rng.state as f64,
            2 => r.rng.calls as f64,
            3 => self.seed as f64,
            4 => self.gain,
            5 => self.rate,
            6 => self.seconds,
            7 => r.workspace as f64,
            _ => 0.,
        }
    }
}
impl Drop for Preparation {
    fn drop(&mut self) {
        if self.reserved > 0 {
            release(self.reserved);
        }
    }
}
pub struct Player {
    samples: Vec<f32>,
    output: Vec<f32>,
    cursor: u64,
    sealed: bool,
}
impl Player {
    fn new(n: usize) -> Option<Box<Self>> {
        if n == 0 || n > MAX_SAMPLES || !reserve(n * 4) {
            return None;
        }
        Some(Box::new(Self {
            samples: vec![0.; n],
            output: vec![0.; BLOCK * 2],
            cursor: 0,
            sealed: false,
        }))
    }
    fn seal(&mut self) -> bool {
        if self.sealed || self.samples.iter().any(|v| !v.is_finite()) {
            return false;
        }
        self.sealed = true;
        true
    }
    fn render(&mut self, n: usize) -> bool {
        if !self.sealed || n > BLOCK || self.cursor > 9007199254740991 - n as u64 {
            return false;
        }
        for i in 0..n {
            let at = self.cursor + i as u64;
            let s = if at < self.samples.len() as u64 {
                self.samples[at as usize]
            } else {
                0.
            };
            self.output[i] = s;
            self.output[BLOCK + i] = s;
        }
        self.cursor += n as u64;
        true
    }
    fn reset(&mut self) -> bool {
        if !self.sealed {
            return false;
        }
        self.cursor = 0;
        self.output.fill(0.);
        true
    }
}
impl Drop for Player {
    fn drop(&mut self) {
        release(self.samples.len() * 4);
    }
}
