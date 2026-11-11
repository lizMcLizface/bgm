use std::alloc::{GlobalAlloc,Layout,System};use std::sync::atomic::{AtomicBool,AtomicUsize,Ordering};
struct Counting;static WATCH:AtomicBool=AtomicBool::new(false);static COUNT:AtomicUsize=AtomicUsize::new(0);
unsafe impl GlobalAlloc for Counting{unsafe fn alloc(&self,l:Layout)->*mut u8{if WATCH.load(Ordering::Relaxed){COUNT.fetch_add(1,Ordering::Relaxed);}System.alloc(l)}unsafe fn dealloc(&self,p:*mut u8,l:Layout){if WATCH.load(Ordering::Relaxed){COUNT.fetch_add(1,Ordering::Relaxed);}System.dealloc(p,l)}unsafe fn realloc(&self,p:*mut u8,l:Layout,n:usize)->*mut u8{if WATCH.load(Ordering::Relaxed){COUNT.fetch_add(1,Ordering::Relaxed);}System.realloc(p,l,n)}}
#[global_allocator]static ALLOCATOR:Counting=Counting;
#[no_mangle]pub extern "C" fn ambience_loop_alloc_watch(on:u32){COUNT.store(0,Ordering::Relaxed);WATCH.store(on!=0,Ordering::Relaxed);}
#[no_mangle]pub extern "C" fn ambience_loop_alloc_count()->usize{COUNT.load(Ordering::Relaxed)}
