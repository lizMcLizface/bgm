//! Compatibility singleton ABI. Owned hosts disable legacy-abi.
use super::*;
static mut FM: Engine = Engine::new();
#[no_mangle]
pub extern "C" fn fm_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn fm_init(sr: f32) {
    unsafe {
        FM.init(sr);
    }
}
// Audit reference only; worklets use the optimized default. Allows continuous
// PCM/benchmark comparisons against the original empty-loop/FIR path.
#[no_mangle]
pub extern "C" fn fm_idle_mode(enabled: u32) {
    unsafe {
        FM.idle_reference = enabled == 0;
    }
}
#[no_mangle]
pub extern "C" fn fm_set_frame(f: f64) {
    if f.is_finite() && f >= 0. {
        unsafe {
            FM.frame = f as u64;
        }
    }
}
#[no_mangle]
pub extern "C" fn fm_param(i: u32, v: f32) {
    unsafe {
        FM.param(i as usize, v);
    }
}
#[no_mangle]
pub extern "C" fn fm_op(o: u32, i: u32, v: f32) {
    unsafe {
        FM.op(o as usize, i as usize, v);
    }
}
#[no_mangle]
pub extern "C" fn fm_route(from: u32, to: u32, v: f32) {
    if from < to && (to as usize) < OPS {
        unsafe {
            FM.routing[from as usize][to as usize] = bounded(v, 0., 2.);
        }
    }
}
#[no_mangle]
pub extern "C" fn fm_carrier(op: u32, value: f32) {
    if (op as usize) < OPS {
        unsafe {
            FM.carriers[op as usize] = bounded(value, 0., 1.);
        }
    }
}
#[no_mangle]
pub extern "C" fn fm_event(k: u32, id: u32, f: f64, a: f32, b: f32) -> u32 {
    unsafe { FM.enqueue(k, id, f, a, b) }
}
#[no_mangle]
pub extern "C" fn fm_panic() {
    unsafe {
        FM.panic();
    }
}
#[no_mangle]
pub extern "C" fn fm_render(n: u32) {
    unsafe {
        FM.render(n as usize);
    }
}
#[no_mangle]
pub extern "C" fn fm_output(c: u32) -> *const f32 {
    unsafe { FM.output[(c as usize).min(1)].as_ptr() }
}
#[no_mangle]
pub extern "C" fn fm_stat(i: u32) -> f64 {
    unsafe {
        match i {
            0 => FM.voices.iter().filter(|v| v.active).count() as f64,
            1 => FM.steals as f64,
            2 => FM.dropped as f64,
            3 => FM.late as f64,
            4 => FM.frame as f64,
            5 => FM.peak as f64,
            6 => (FM.fir_len - 1) as f64 / (2. * FM.factor() as f64),
            _ => 0.,
        }
    }
}

#[cfg(feature = "simd-voices")]
#[no_mangle]
pub extern "C" fn fm_simd_frames() -> u32 {
    unsafe { FM.simd_frames.min(u32::MAX as u64) as u32 }
}
