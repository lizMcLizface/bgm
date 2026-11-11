//! Trusted-host owned handles. Pointers are not a sandbox boundary.
use super::*;
#[derive(Clone, Copy)]
struct Event {
    frame: u64,
    owner: u32,
    parameter: usize,
    value: f64,
}
pub struct Handle {
    processor: Processor,
    inputs: [Vec<f32>; 2],
    outputs: [Vec<f32>; 2],
    events: Vec<Event>,
    frame: u64,
    late: u64,
    applied: u64,
    overflow: u64,
    paused: bool,
    peak: f64,
}
#[no_mangle]
pub extern "C" fn mixer_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn mixer_new(kind: u32, rate: f64, block: usize) -> *mut Handle {
    if !(1..=2048).contains(&block) {
        return std::ptr::null_mut();
    }
    let Some(processor) = Processor::new(kind, rate) else {
        return std::ptr::null_mut();
    };
    Box::into_raw(Box::new(Handle {
        processor,
        inputs: std::array::from_fn(|_| vec![0.; block]),
        outputs: std::array::from_fn(|_| vec![0.; block]),
        events: Vec::with_capacity(MAX_EVENTS),
        frame: 0,
        late: 0,
        applied: 0,
        overflow: 0,
        paused: false,
        peak: 0.,
    }))
}
#[no_mangle]
pub unsafe extern "C" fn mixer_free(p: *mut Handle) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn mixer_input(p: &mut Handle, channel: usize) -> *mut f32 {
    if channel > 1 {
        return std::ptr::null_mut();
    }
    p.inputs[channel].as_mut_ptr()
}
#[no_mangle]
pub extern "C" fn mixer_output(p: &Handle, channel: usize) -> *const f32 {
    if channel > 1 {
        return std::ptr::null();
    }
    p.outputs[channel].as_ptr()
}
#[no_mangle]
pub extern "C" fn mixer_param(p: &mut Handle, parameter: usize, value: f64, settle: u32) -> u32 {
    if settle > 1 || !p.processor.set(parameter, value, settle == 1) {
        return 1;
    }
    0
}
#[no_mangle]
pub extern "C" fn mixer_event(
    p: &mut Handle,
    frame: f64,
    owner: u32,
    parameter: usize,
    value: f64,
) -> u32 {
    if !frame.is_finite()
        || frame < 0.
        || frame > MAX_FRAME as f64
        || frame.fract() != 0.
        || owner == 0
        || !p.processor.valid(parameter, value)
    {
        return 1;
    }
    if p.events.len() == MAX_EVENTS {
        p.overflow += 1;
        return 2;
    }
    let mut frame = frame as u64;
    if frame < p.frame {
        frame = p.frame;
        p.late += 1;
    }
    let at = p.events.partition_point(|e| e.frame <= frame);
    p.events.insert(
        at,
        Event {
            frame,
            owner,
            parameter,
            value,
        },
    );
    0
}
#[no_mangle]
pub extern "C" fn mixer_cancel(p: &mut Handle, owner: u32) {
    p.events.retain(|e| owner != 0 && e.owner != owner);
}
#[no_mangle]
pub extern "C" fn mixer_pause(p: &mut Handle, paused: u32) -> u32 {
    if paused > 1 {
        return 1;
    }
    p.paused = paused != 0;
    0
}
#[no_mangle]
pub extern "C" fn mixer_reset(p: &mut Handle) {
    p.processor.reset();
    p.events.clear();
    p.inputs.iter_mut().for_each(|v| v.fill(0.));
    p.outputs.iter_mut().for_each(|v| v.fill(0.));
    p.frame = 0;
    p.late = 0;
    p.applied = 0;
    p.overflow = 0;
    p.peak = 0.;
    p.paused = false;
}
#[no_mangle]
pub extern "C" fn mixer_render(p: &mut Handle, frames: usize) -> u32 {
    if frames > p.inputs[0].len() || p.frame + frames as u64 > MAX_FRAME {
        return 1;
    }
    p.peak = 0.;
    if p.paused {
        for c in &mut p.outputs {
            c[..frames].fill(0.);
        }
        return 0;
    }
    for i in 0..frames {
        while p.events.first().is_some_and(|e| e.frame == p.frame) {
            let e = p.events.remove(0);
            p.processor.set(e.parameter, e.value, false);
            p.applied += 1;
        }
        let x = [p.inputs[0][i], p.inputs[1][i]].map(|v| if v.is_finite() { v } else { 0. });
        let out = p.processor.tick(x);
        for c in 0..2 {
            p.outputs[c][i] = out[c];
            p.peak = p.peak.max(out[c].abs() as f64);
        }
        p.frame += 1;
    }
    0
}
#[no_mangle]
pub extern "C" fn mixer_stat(p: &Handle, index: usize) -> f64 {
    match index {
        0 => p.frame as f64,
        1 => p.applied as f64,
        2 => p.late as f64,
        3 => p.overflow as f64,
        4 => p.events.len() as f64,
        5 => p.peak,
        6 => p.processor.latency_frames() as f64,
        7 => p.processor.reduction_gain(),
        _ => 0.,
    }
}
