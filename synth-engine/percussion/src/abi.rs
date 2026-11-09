#![allow(static_mut_refs)]
use super::*;
const BLOCK: usize = 128;
static mut ENGINE: Option<Box<Engine>> = None;
static mut OUTPUT: [f32; BLOCK * 2] = [0.; BLOCK * 2];
#[no_mangle]
pub extern "C" fn init(rate: f32) {
    unsafe {
        ENGINE = Some(Box::new(Engine::new(
            clean(rate, 48000.).clamp(8000., 192000.),
        )));
    }
}
#[no_mangle]
pub extern "C" fn output_ptr() -> *const f32 {
    unsafe { OUTPUT.as_ptr() }
}
#[no_mangle]
pub extern "C" fn set_frame(frame: f64) {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            if frame.is_finite() && frame >= e.frame as f64 {
                e.frame = frame as u64;
            }
        }
    }
}
#[no_mangle]
pub extern "C" fn level(drum: u32, value: f32) {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            if drum < 14 {
                e.targets[drum as usize] = clean(value, 0.).clamp(0., 2.);
            }
        }
    }
}
#[no_mangle]
pub extern "C" fn voice_preset(value: u32) {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            e.voice_preset = value.min(4);
        }
    }
}
#[no_mangle]
pub extern "C" fn tone_param(drum: u32, value: f32) {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            if drum < 14 {
                e.tones[drum as usize] = clean(value, 0.).clamp(-1., 1.);
            }
        }
    }
}
#[no_mangle]
pub extern "C" fn decay_param(drum: u32, value: f32) {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            if drum < 14 {
                e.decays[drum as usize] = clean(value, 1.).clamp(0.5, 2.);
            }
        }
    }
}
#[no_mangle]
pub extern "C" fn hit(
    drum: u32,
    frame: f64,
    duration: f32,
    velocity: f32,
    vary: f32,
    tone: f32,
    decay: f32,
    hit: u32,
    model: u32,
) -> u32 {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            if drum >= 14 || !frame.is_finite() || frame < 0. || frame > 9007199254740991. {
                return 0;
            }
            return e.push(Event {
                frame: frame as u64,
                serial: 0,
                drum: drum as usize,
                velocity: clean(velocity, 0.).clamp(0., 1.),
                vary: clean(vary, 0.).clamp(-1., 1.),
                duration: clean(duration, 0.25).clamp(0., 30.),
                tone: clean(tone, 0.).clamp(-1., 1.),
                decay: clean(decay, 1.).clamp(0.5, 2.),
                hit,
                model: model.min(2),
                owner: 0,
                stop: false,
            }) as u32;
        }
    }
    0
}
#[no_mangle]
pub extern "C" fn silence(frame: f64) {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            if !frame.is_finite() {
                return;
            }
            let at = (frame.max(e.frame as f64)) as u64;
            e.queue.retain(|event| event.frame < at);
            e.push(Event {
                frame: at,
                serial: 0,
                drum: 0,
                velocity: 0.,
                vary: 0.,
                duration: 0.,
                tone: 0.,
                decay: 1.,
                hit: 0,
                model: 0,
                owner: 0,
                stop: true,
            });
        }
    }
}
#[no_mangle]
pub extern "C" fn clear() {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            e.queue.clear();
            e.voices.fill(Voice::default());
            e.residual = [0.; 2];
            e.residual_left = 0;
        }
    }
}
#[no_mangle]
pub extern "C" fn process(frames: u32) {
    unsafe {
        if let Some(e) = ENGINE.as_mut() {
            for i in 0..(frames as usize).min(BLOCK) {
                let out = e.tick();
                OUTPUT[i] = out[0];
                OUTPUT[BLOCK + i] = out[1];
            }
        }
    }
}
#[no_mangle]
pub extern "C" fn stat(which: u32) -> f64 {
    unsafe {
        if let Some(e) = ENGINE.as_ref() {
            return match which {
                0 => e.voices.iter().filter(|v| v.count > 0).count() as f64,
                1 => e.queue.len() as f64,
                2 => e.steals as f64,
                3 => e.dropped as f64,
                4 => e.late as f64,
                5 => e.frame as f64,
                6 => e.peak_active as f64,
                _ => 0.,
            };
        }
    }
    0.
}
