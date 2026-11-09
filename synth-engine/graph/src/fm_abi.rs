//! Owned FM handles. Trusted pointers: serialize access and free once off process().
//! The graph build does not link FM's compatibility singleton ABI.
use calmbgm_fm::Engine;
#[no_mangle]
pub extern "C" fn fm_owned_api() -> u32 { 1 }
#[no_mangle]
pub extern "C" fn fm_owned_new(sr: f32) -> *mut Engine {
    if !sr.is_finite() || !(8000. ..=192000.).contains(&sr) { return std::ptr::null_mut(); }
    Box::into_raw(Box::new(Engine::prepared(sr)))
}
#[no_mangle]
pub unsafe extern "C" fn fm_owned_free(e: *mut Engine) { if !e.is_null() { drop(Box::from_raw(e)); } }
#[no_mangle]
pub extern "C" fn fm_owned_init(e: &mut Engine, sr: f32) { e.init(sr); }
#[no_mangle]
pub extern "C" fn fm_owned_param(e: &mut Engine, i: u32, v: f32) { e.param(i as usize, v); }
#[no_mangle]
pub extern "C" fn fm_owned_op(e: &mut Engine, o: u32, i: u32, v: f32) { e.op(o as usize, i as usize, v); }
#[no_mangle]
pub extern "C" fn fm_owned_route(e: &mut Engine, from: u32, to: u32, v: f32) { e.route(from as usize, to as usize, v); }
#[no_mangle]
pub extern "C" fn fm_owned_carrier(e: &mut Engine, o: u32, v: f32) { e.carrier(o as usize, v); }
#[no_mangle]
pub extern "C" fn fm_owned_event(e: &mut Engine, k: u32, id: u32, f: f64, a: f32, b: f32) -> u32 { e.enqueue(k, id, f, a, b) }
#[no_mangle]
pub extern "C" fn fm_owned_panic(e: &mut Engine) { e.panic(); }
#[no_mangle]
pub extern "C" fn fm_owned_set_frame(e: &mut Engine, f: f64) { if f.is_finite() && f >= 0. { e.set_frame(f as u64); } }
#[no_mangle]
pub extern "C" fn fm_owned_render(e: &mut Engine, n: u32) { e.render(n as usize); }
#[no_mangle]
pub extern "C" fn fm_owned_output(e: &Engine, c: u32) -> *const f32 { e.output(c as usize).as_ptr() }
#[no_mangle]
pub extern "C" fn fm_owned_stat(e: &Engine, i: u32) -> f64 { e.stat(i) }
