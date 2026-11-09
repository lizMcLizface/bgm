//! Trusted, serialized owned-core handles. Prepare/free outside process().
use calmbgm_core::Engine;
#[no_mangle]
pub extern "C" fn core_owned_api() -> u32 { 1 }
#[no_mangle]
pub extern "C" fn core_owned_new(sr: f32) -> *mut Engine {
    if !sr.is_finite() || !(8000. ..=192000.).contains(&sr) { return std::ptr::null_mut(); }
    Box::into_raw(Box::new(Engine::prepared(sr)))
}
#[no_mangle]
pub unsafe extern "C" fn core_owned_free(e: *mut Engine) { if !e.is_null() { drop(Box::from_raw(e)); } }
#[no_mangle]
pub extern "C" fn core_owned_init(e: &mut Engine, sr: f32) { e.init(sr); }
#[no_mangle]
pub extern "C" fn core_owned_param(e: &mut Engine, scope: u32, i: u32, value: f32) { e.param(scope, i as usize, value); }
#[no_mangle]
pub extern "C" fn core_owned_event(e: &mut Engine, kind: u32, id: u32, frame: f64, a: f32, b: f32) -> u32 { e.enqueue(kind, id, frame, a, b) as u32 }
#[no_mangle]
pub extern "C" fn core_owned_render(e: &mut Engine, frames: u32) { e.render(frames as usize); }
#[no_mangle]
pub extern "C" fn core_owned_output(e: &Engine, channel: u32) -> *const f32 { e.output(channel as usize).as_ptr() }
#[no_mangle]
pub extern "C" fn core_owned_stat(e: &Engine, index: u32) -> f64 { e.stat(index) }
#[no_mangle]
pub extern "C" fn core_owned_panic(e: &mut Engine) { e.panic(); }
#[no_mangle]
pub extern "C" fn core_owned_set_frame(e: &mut Engine, frame: f64) { if frame.is_finite() && frame >= 0. { e.set_frame(frame as u64); } }
