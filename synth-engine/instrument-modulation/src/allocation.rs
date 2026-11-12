use std::alloc::{GlobalAlloc,Layout,System};use std::sync::atomic::{AtomicBool,AtomicUsize,Ordering};
struct Counting;static WATCH:AtomicBool=AtomicBool::new(false);static ALLOC:AtomicUsize=AtomicUsize::new(0);static REALLOC:AtomicUsize=AtomicUsize::new(0);static FREE:AtomicUsize=AtomicUsize::new(0);static LIVE:AtomicUsize=AtomicUsize::new(0);static PEAK:AtomicUsize=AtomicUsize::new(0);
fn grow(n:usize){let live=LIVE.fetch_add(n,Ordering::Relaxed)+n;PEAK.fetch_max(live,Ordering::Relaxed);}
unsafe impl GlobalAlloc for Counting{
 unsafe fn alloc(&self,l:Layout)->*mut u8{let p=System.alloc(l);if !p.is_null(){grow(l.size());if WATCH.load(Ordering::Relaxed){ALLOC.fetch_add(1,Ordering::Relaxed);}}p}
 unsafe fn realloc(&self,p:*mut u8,l:Layout,n:usize)->*mut u8{let next=System.realloc(p,l,n);if !next.is_null(){if n>=l.size(){grow(n-l.size());}else{LIVE.fetch_sub(l.size()-n,Ordering::Relaxed);}if WATCH.load(Ordering::Relaxed){REALLOC.fetch_add(1,Ordering::Relaxed);}}next}
 unsafe fn dealloc(&self,p:*mut u8,l:Layout){LIVE.fetch_sub(l.size(),Ordering::Relaxed);if WATCH.load(Ordering::Relaxed){FREE.fetch_add(1,Ordering::Relaxed);}System.dealloc(p,l)}
}
#[global_allocator]static HEAP:Counting=Counting;
#[no_mangle]pub extern "C" fn instrument_modulation_alloc_watch(on:u32){for c in[&ALLOC,&REALLOC,&FREE]{c.store(0,Ordering::Relaxed);}PEAK.store(LIVE.load(Ordering::Relaxed),Ordering::Relaxed);WATCH.store(on!=0,Ordering::Relaxed);}
#[no_mangle]pub extern "C" fn instrument_modulation_alloc_count(kind:u32)->usize{match kind{0=>ALLOC.load(Ordering::Relaxed),1=>REALLOC.load(Ordering::Relaxed),2=>FREE.load(Ordering::Relaxed),3=>LIVE.load(Ordering::Relaxed),4=>PEAK.load(Ordering::Relaxed),_=>usize::MAX}}
