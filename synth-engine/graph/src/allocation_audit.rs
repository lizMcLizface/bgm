//! Opt-in Wasm audit build only. No OS policy changes or native test runner.
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
pub extern "C" fn graph_alloc_watch(watch: u32) {
    COUNT.store(0, Ordering::Relaxed);
    WATCH.store(watch != 0, Ordering::Relaxed);
}
#[no_mangle]
pub extern "C" fn graph_alloc_count() -> usize {
    COUNT.load(Ordering::Relaxed)
}

// Audit-only access to the same owned compressor used by Graph. Allows exact
// analytic anti-phase/envelope tests without a native executable or fake ports.
pub struct Probe {
    dsp: super::compressor::Compressor,
    params: [f32; 10],
    out: [f32; 2],
}
#[no_mangle]
pub extern "C" fn graph_probe_new(sr: f32) -> *mut Probe {
    Box::into_raw(Box::new(Probe {
        dsp: super::compressor::Compressor::new(sr),
        params: [-24., 4., 6., 0.005, 0.12, 0., 1., 0., 2., 0.],
        out: [0.; 2],
    }))
}
#[no_mangle]
pub extern "C" fn graph_probe_params(p: &mut Probe) -> *mut f32 {
    p.params.as_mut_ptr()
}
#[no_mangle]
pub extern "C" fn graph_probe_tick(
    p: &mut Probe,
    l: f32,
    r: f32,
    kl: f32,
    kr: f32,
    connected: u32,
) -> f32 {
    p.out = p.dsp.tick([l, r], [kl, kr], connected != 0, &p.params);
    p.out[0]
}
#[no_mangle]
pub extern "C" fn graph_probe_output(p: &Probe, ch: usize) -> f32 {
    p.out[ch]
}
#[no_mangle]
pub extern "C" fn graph_probe_meter(p: &Probe, metric: usize) -> f32 {
    p.dsp.meter[metric]
}
#[no_mangle]
pub unsafe extern "C" fn graph_probe_free(p: *mut Probe) {
    drop(Box::from_raw(p));
}
