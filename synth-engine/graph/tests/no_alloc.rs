use calmbgm_graph::*;
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
struct Counting;
static WATCH: AtomicBool = AtomicBool::new(false);
static ALLOCS: AtomicUsize = AtomicUsize::new(0);
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        if WATCH.load(Ordering::Relaxed) {
            ALLOCS.fetch_add(1, Ordering::Relaxed);
        }
        System.alloc(l)
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        if WATCH.load(Ordering::Relaxed) {
            ALLOCS.fetch_add(1, Ordering::Relaxed);
        }
        System.dealloc(p, l)
    }
}
#[global_allocator]
static ALLOCATOR: Counting = Counting;
#[test]
fn no_allocation_or_reclamation_during_events_and_render() {
    let mut g = Graph::new(48000., 2048).unwrap();
    g.add_node(1, Kind::Tone, 1).unwrap();
    g.add_node(2, Kind::Output, 1).unwrap();
    g.connect(1, 1, 2, Link::Audio { input: 0 }).unwrap();
    g.prepare().unwrap();
    WATCH.store(true, Ordering::Relaxed);
    let event = g.enqueue(Event {
        frame: 37,
        target: 1,
        owner: 1,
        action: Action::Gate(true),
    });
    let rendered = g.render(2048);
    g.cancel_owner(1);
    g.reset();
    WATCH.store(false, Ordering::Relaxed);
    assert!(event.is_ok() && rendered.is_ok());
    assert_eq!(ALLOCS.load(Ordering::Relaxed), 0);
}
