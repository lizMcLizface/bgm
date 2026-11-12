use std::alloc::{GlobalAlloc,Layout,System};use std::sync::atomic::{AtomicBool,AtomicUsize,Ordering};
struct Counting;static WATCH:AtomicBool=AtomicBool::new(false);static ALLOC:AtomicUsize=AtomicUsize::new(0);static REALLOC:AtomicUsize=AtomicUsize::new(0);static FREE:AtomicUsize=AtomicUsize::new(0);
unsafe impl GlobalAlloc for Counting{unsafe fn alloc(&self,l:Layout)->*mut u8{if WATCH.load(Ordering::Relaxed){ALLOC.fetch_add(1,Ordering::Relaxed);}System.alloc(l)}unsafe fn realloc(&self,p:*mut u8,l:Layout,n:usize)->*mut u8{if WATCH.load(Ordering::Relaxed){REALLOC.fetch_add(1,Ordering::Relaxed);}System.realloc(p,l,n)}unsafe fn dealloc(&self,p:*mut u8,l:Layout){if WATCH.load(Ordering::Relaxed){FREE.fetch_add(1,Ordering::Relaxed);}System.dealloc(p,l)}}
#[global_allocator]static HEAP:Counting=Counting;
#[no_mangle]pub extern "C" fn instrument_crusher_alloc_watch(on:u32){for c in[&ALLOC,&REALLOC,&FREE]{c.store(0,Ordering::Relaxed);}WATCH.store(on!=0,Ordering::Relaxed);}
#[no_mangle]pub extern "C" fn instrument_crusher_alloc_count(kind:u32)->usize{match kind{0=>ALLOC.load(Ordering::Relaxed),1=>REALLOC.load(Ordering::Relaxed),2=>FREE.load(Ordering::Relaxed),_=>usize::MAX}}
