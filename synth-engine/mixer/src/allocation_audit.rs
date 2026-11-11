//! Counting allocator exists only in the standalone audit Wasm build.
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
struct Counting;
static WATCH: AtomicBool = AtomicBool::new(false);
static COUNT: AtomicUsize = AtomicUsize::new(0);
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        if WATCH.load(Ordering::Relaxed) {
            COUNT.fetch_add(1, Ordering::Relaxed);
        }
        System.alloc(l)
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        if WATCH.load(Ordering::Relaxed) {
            COUNT.fetch_add(1, Ordering::Relaxed);
        }
        System.dealloc(p, l)
    }
}
#[global_allocator]
static ALLOCATOR: Counting = Counting;
#[no_mangle]
pub extern "C" fn mixer_alloc_watch(on: u32) {
    COUNT.store(0, Ordering::Relaxed);
    WATCH.store(on != 0, Ordering::Relaxed);
}
#[no_mangle]
pub extern "C" fn mixer_alloc_count() -> usize {
    COUNT.load(Ordering::Relaxed)
}
// Audit-only observation of the actual rendered AudioParam curve. The main ABI
// exposes requested targets, not this private Float32 calculation state.
pub struct CurveProbe {curve:super::Smooth}
#[no_mangle]
pub extern "C" fn mixer_curve_probe_new(rate:f64,initial:f64)->*mut CurveProbe{
    if !rate.is_finite()||!(8000. ..=192000.).contains(&rate)||!initial.is_finite()||!(initial as f32).is_finite(){return std::ptr::null_mut();}
    Box::into_raw(Box::new(CurveProbe{curve:super::Smooth::new(initial,rate)}))
}
#[no_mangle]
pub extern "C" fn mixer_curve_probe_set(p:&mut CurveProbe,target:f64){p.curve.set(target,false);}
#[no_mangle]
pub extern "C" fn mixer_curve_probe_tick(p:&mut CurveProbe)->f64{p.curve.tick()}
#[no_mangle]
pub unsafe extern "C" fn mixer_curve_probe_free(p:*mut CurveProbe){if !p.is_null(){drop(Box::from_raw(p));}}
