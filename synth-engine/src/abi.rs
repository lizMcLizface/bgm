//! Compatibility singleton and laboratory probes only. Owned hosts disable legacy-abi.
use super::*;
static mut ENGINE: Engine = Engine::new();
static mut PROBE_INPUT: [[f32; BLOCK]; 2] = [[0.; BLOCK]; 2];
static mut PROBE_LANE: Lane = Lane::ZERO;
static mut PROBE_PARAMS: [f32; 5] = [0.; 5];
static mut COLOUR_PROBE: colour::Colour = colour::Colour::ZERO;
static mut COLOUR_PARAMS: [f32; colour::COUNT] = colour::DEFAULTS;
static mut COLOUR_SR: f32 = 48000.;
static mut COLOUR_SEED: u32 = 1;
#[no_mangle]
pub extern "C" fn engine_colour_probe_init(sr: f32, seed: u32) {
    unsafe {
        COLOUR_SR = bound(sr, 8000., 192000.);
        COLOUR_SEED = seed;
        COLOUR_PARAMS = colour::DEFAULTS;
        COLOUR_PROBE.init(COLOUR_SR, COLOUR_SEED, &COLOUR_PARAMS);
    }
}
#[no_mangle]
pub extern "C" fn engine_colour_probe_param(i: u32, v: f32) {
    let i = i as usize;
    if i < colour::COUNT && v.is_finite() {
        let (lo, hi) = colour::range(i);
        unsafe {
            COLOUR_PARAMS[i] = if i == 8 {
                v.round().clamp(lo, hi)
            } else {
                v.clamp(lo, hi)
            };
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_colour_probe_settle() {
    unsafe {
        COLOUR_PROBE.init(COLOUR_SR, COLOUR_SEED, &COLOUR_PARAMS);
    }
}
#[no_mangle]
pub extern "C" fn engine_colour_probe_process(frames: u32, left: f32, right: f32, pressure: f32) {
    unsafe {
        for i in 0..(frames as usize).min(BLOCK) {
            let output = COLOUR_PROBE.tick(
                [PROBE_INPUT[0][i], PROBE_INPUT[1][i]],
                [bound(left, 0., 4.), bound(right, 0., 4.)],
                bound(pressure, 0., 1.),
                &COLOUR_PARAMS,
                COLOUR_SR,
            );
            ENGINE.left[i] = output[0];
            ENGINE.right[i] = output[1];
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn engine_init(sr: f32) {
    unsafe {
        ENGINE.init(sr);
    }
}
// Offline laboratory comparison hook; not a musical patch parameter. The live
// worklet never calls it and therefore always uses the refined edge handling.
#[no_mangle]
pub extern "C" fn engine_edge_mode(modern: u32) {
    unsafe {
        ENGINE.modern_edges = modern != 0;
    }
}
// Independent offline comparisons leave the other refinements enabled.
#[no_mangle]
pub extern "C" fn engine_tone_mode(filters: u32, chorus: u32) {
    unsafe {
        ENGINE.modern_filters = filters != 0;
        ENGINE.modern_chorus = chorus != 0;
    }
}
#[no_mangle]
pub extern "C" fn engine_probe_input(channel: u32) -> *mut f32 {
    unsafe { PROBE_INPUT[(channel as usize).min(1)].as_mut_ptr() }
}
#[no_mangle]
pub extern "C" fn engine_filter_probe_init(
    sr: f32,
    cutoff: f32,
    resonance: f32,
    kind: u32,
    family: u32,
    modern: u32,
) {
    let sr = bound(sr, 8000., 192000.);
    unsafe {
        PROBE_LANE = Lane::ZERO;
        PROBE_PARAMS = [
            (PI * bound(cutoff, 15., sr * 0.4) / sr).tan(),
            bound(resonance, 0., 1.),
            kind.min(3) as f32,
            family.min(1) as f32,
            if modern != 0 { 1. } else { 0. },
        ];
    }
}
#[no_mangle]
pub extern "C" fn engine_filter_probe_process(frames: u32) {
    unsafe {
        let [g, res, kind, family, modern] = PROBE_PARAMS;
        for i in 0..(frames as usize).min(BLOCK) {
            let y = lowpass_tick(
                &mut PROBE_LANE,
                PROBE_INPUT[0][i],
                g,
                res,
                kind as u32,
                family >= 0.5,
                modern >= 0.5,
            );
            ENGINE.left[i] = y;
            ENGINE.right[i] = y;
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_chorus_probe_init(
    sr: f32,
    amount: f32,
    rate: f32,
    depth: f32,
    phase: f32,
    modern: u32,
) {
    unsafe {
        ENGINE.init(sr);
        ENGINE.modern_chorus = modern != 0;
        ENGINE.global[8] = bound(amount, 0., 0.8);
        ENGINE.global[9] = bound(rate, 0., 2.);
        ENGINE.global[10] = bound(depth, 0., 8.);
        ENGINE.chorus.phase = bound(phase, 0., 1.).fract();
        // Measurement starts from settled controls. Live creation/edits retain
        // their normal smoothing and are tested through the regular renderer.
        ENGINE.chorus.amount = ENGINE.global[8];
        ENGINE.chorus.rate = ENGINE.global[9];
        ENGINE.chorus.depth = ENGINE.global[10];
    }
}
#[no_mangle]
pub extern "C" fn engine_chorus_probe_process(frames: u32, wet_only: u32) {
    unsafe {
        for i in 0..(frames as usize).min(BLOCK) {
            let (mixed, wet) = ENGINE.chorus.tick(
                [PROBE_INPUT[0][i], PROBE_INPUT[1][i]],
                ENGINE.global[8],
                ENGINE.global[9],
                ENGINE.global[10],
                ENGINE.sr,
                &ENGINE.sine,
                ENGINE.modern_chorus,
            );
            let out = if wet_only != 0 { wet } else { mixed };
            ENGINE.left[i] = out[0];
            ENGINE.right[i] = out[1];
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_set_frame(frame: f64) {
    if frame.is_finite() && frame >= 0. {
        unsafe {
            ENGINE.frame = frame as u64;
        }
    }
}
#[no_mangle]
pub extern "C" fn engine_param(scope: u32, index: u32, value: f32) {
    unsafe {
        ENGINE.param(scope, index as usize, value);
    }
}
#[no_mangle]
pub extern "C" fn engine_event(kind: u32, id: u32, frame: f64, a: f32, b: f32) -> u32 {
    unsafe { ENGINE.enqueue(kind, id, frame, a, b) as u32 }
}
#[no_mangle]
pub extern "C" fn engine_panic() {
    unsafe {
        ENGINE.panic();
    }
}
#[no_mangle]
pub extern "C" fn engine_render(frames: u32) {
    unsafe {
        ENGINE.render(frames as usize);
    }
}
#[no_mangle]
pub extern "C" fn engine_left() -> *const f32 {
    unsafe { ENGINE.left.as_ptr() }
}
#[no_mangle]
pub extern "C" fn engine_right() -> *const f32 {
    unsafe { ENGINE.right.as_ptr() }
}
#[no_mangle]
pub extern "C" fn engine_stat(index: u32) -> f64 {
    unsafe {
        match index {
            0 => ENGINE.voices.iter().filter(|v| v.active).count() as f64,
            1 => ENGINE.steals as f64,
            2 => ENGINE.dropped as f64,
            3 => ENGINE.late as f64,
            4 => ENGINE.frame as f64,
            5 => ENGINE.peak as f64,
            6 => ENGINE.global[1] as f64,
            7 => ENGINE.sr as f64,
            _ => ENGINE.blocks as f64,
        }
    }
}

#[cfg(feature = "simd-voices")]
#[no_mangle]
pub extern "C" fn engine_simd_frames() -> u32 { unsafe { ENGINE.simd_frames.min(u32::MAX as u64) as u32 } }
