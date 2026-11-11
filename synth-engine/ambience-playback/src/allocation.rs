use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
static WATCH: AtomicBool = AtomicBool::new(false);
static COUNT: AtomicU32 = AtomicU32::new(0);
struct Audit;
fn tick() {
    if WATCH.load(Ordering::Relaxed) {
        COUNT.fetch_add(1, Ordering::Relaxed);
    }
}
unsafe impl GlobalAlloc for Audit {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        tick();
        System.alloc(l)
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        tick();
        System.dealloc(p, l)
    }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
        tick();
        System.realloc(p, l, n)
    }
    unsafe fn alloc_zeroed(&self, l: Layout) -> *mut u8 {
        tick();
        System.alloc_zeroed(l)
    }
}
#[global_allocator]
static ALLOC: Audit = Audit;
#[no_mangle]
pub extern "C" fn ambience_play_alloc_watch(on: u32) {
    COUNT.store(0, Ordering::Relaxed);
    WATCH.store(on != 0, Ordering::Relaxed);
}
#[no_mangle]
pub extern "C" fn ambience_play_alloc_count() -> u32 {
    COUNT.load(Ordering::Relaxed)
}
