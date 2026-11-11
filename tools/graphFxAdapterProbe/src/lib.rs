//! Private Wasm functional/allocation probe; never a production graph ABI.
#[path = "../../../synth-engine/graph/src/rack_nodes.rs"]
mod rack_nodes;
#[path = "../../../synth-engine/graph/src/voice_nodes.rs"]
mod voice_nodes;
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
    unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
        if WATCH.load(Ordering::Relaxed) {
            COUNT.fetch_add(1, Ordering::Relaxed);
        }
        System.realloc(p, l, n)
    }
}
#[global_allocator]
static ALLOCATOR: Counting = Counting;
#[no_mangle]
pub extern "C" fn probe_alloc_watch(enabled: u32) {
    COUNT.store(0, Ordering::Relaxed);
    WATCH.store(enabled != 0, Ordering::Relaxed);
}
#[no_mangle]
pub extern "C" fn probe_alloc_count() -> usize {
    COUNT.load(Ordering::Relaxed)
}

enum Backend {
    Rack(Box<rack_nodes::Adapter>),
    Voice(Box<voice_nodes::Adapter>),
    DirectRack(Box<calmbgm_rack_fx::Engine>),
    DirectVoice(Box<calmbgm_voice_fx::Engine>),
}
pub struct Probe {
    backend: Backend,
    input: [[f32; 2048]; 2],
    output: [[f32; 2048]; 2],
    prepared: bool,
}
#[no_mangle]
pub extern "C" fn probe_new(kind: u32, rate: f64, seed: u32, direct: u32) -> *mut Probe {
    let backend = if let Some(k) = calmbgm_rack_fx::Kind::from_code(kind) {
        if direct != 0 {
            calmbgm_rack_fx::Engine::new(k, rate).map(Backend::DirectRack)
        } else {
            rack_nodes::Adapter::new(k, rate).map(Backend::Rack)
        }
    } else if let Some(k) = kind
        .checked_sub(3)
        .and_then(calmbgm_voice_fx::Kind::from_code)
    {
        if direct != 0 {
            calmbgm_voice_fx::Engine::new(k, rate, seed).map(Backend::DirectVoice)
        } else {
            voice_nodes::Adapter::new(k, rate, seed).map(Backend::Voice)
        }
    } else {
        None
    };
    backend
        .map(|backend| {
            Box::into_raw(Box::new(Probe {
                backend,
                input: [[0.; 2048]; 2],
                output: [[0.; 2048]; 2],
                prepared: false,
            }))
        })
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub unsafe extern "C" fn probe_free(p: *mut Probe) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn probe_initial(p: &mut Probe, index: usize, value: f64) -> u32 {
    if p.prepared {
        return 0;
    }
    (match &mut p.backend {
        Backend::Rack(d) => d.initial(index, value),
        Backend::Voice(d) => d.initial(index, value),
        Backend::DirectRack(d) => d.param(index, value),
        Backend::DirectVoice(d) => d.param(index, value),
    }) as u32
}
#[no_mangle]
pub extern "C" fn probe_param(p: &mut Probe, index: usize, value: f64) -> u32 {
    if !p.prepared {
        return 0;
    }
    (match &mut p.backend {
        Backend::Rack(d) => d.param(index, value),
        Backend::Voice(d) => d.param(index, value),
        Backend::DirectRack(d) => d.param(index, value),
        Backend::DirectVoice(d) => d.param(index, value),
    }) as u32
}
#[no_mangle]
pub extern "C" fn probe_target(p: &Probe, index: usize) -> f64 {
    match &p.backend {
        Backend::Rack(d) => d.parameters().get(index).copied(),
        Backend::Voice(d) => d.parameters().get(index).copied(),
        Backend::DirectRack(d) => d.parameters().get(index).copied(),
        Backend::DirectVoice(d) => d.parameters().get(index).copied(),
    }
    .unwrap_or(f64::NAN)
}
#[no_mangle]
pub extern "C" fn probe_kind(p: &Probe) -> u32 {
    match &p.backend {
        Backend::Rack(d) => d.kind() as u32,
        Backend::Voice(d) => d.kind() as u32 + 3,
        Backend::DirectRack(d) => d.kind() as u32,
        Backend::DirectVoice(_) => 0,
    }
}
#[no_mangle]
pub extern "C" fn probe_shape_count(p: &mut Probe, count: usize) -> u32 {
    if p.prepared {
        return 0;
    }
    (match &mut p.backend {
        Backend::Rack(d) => d.shape_count(count),
        Backend::DirectRack(d) => d.shape_count(count),
        _ => false,
    }) as u32
}
#[no_mangle]
pub extern "C" fn probe_shape_row(
    p: &mut Probe,
    shape: usize,
    section: usize,
    f: f64,
    bw: f64,
    db: f64,
) -> u32 {
    if p.prepared {
        return 0;
    }
    (match &mut p.backend {
        Backend::Rack(d) => d.shape_row(shape, section, [f, bw, db]),
        Backend::DirectRack(d) => d.shape_row(shape, section, [f, bw, db]),
        _ => false,
    }) as u32
}
#[no_mangle]
pub extern "C" fn probe_prepare(p: &mut Probe) -> u32 {
    if p.prepared {
        return 0;
    }
    let ok = match &mut p.backend {
        Backend::Rack(d) => d.prepare(),
        Backend::Voice(d) => d.prepare(),
        Backend::DirectRack(d) => d.prepare(),
        Backend::DirectVoice(_) => true,
    };
    p.prepared = ok;
    ok as u32
}
#[no_mangle]
pub extern "C" fn probe_input(p: &mut Probe, ch: usize) -> *mut f32 {
    p.input
        .get_mut(ch)
        .map(|v| v.as_mut_ptr())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "C" fn probe_output(p: &Probe, ch: usize) -> *const f32 {
    p.output
        .get(ch)
        .map(|v| v.as_ptr())
        .unwrap_or(std::ptr::null())
}
#[no_mangle]
pub extern "C" fn probe_render(p: &mut Probe, n: usize) -> u32 {
    if !p.prepared || n > 2048 {
        return 0;
    }
    match &mut p.backend {
        Backend::Rack(d) => {
            for i in 0..n {
                let out = d.tick([p.input[0][i], p.input[1][i]]);
                p.output[0][i] = out[0];
                p.output[1][i] = out[1];
            }
        }
        Backend::Voice(d) => {
            for i in 0..n {
                let out = d.tick([p.input[0][i], p.input[1][i]]);
                p.output[0][i] = out[0];
                p.output[1][i] = out[1];
            }
        }
        Backend::DirectRack(d) => {
            for ch in 0..2 {
                d.input_mut(ch).unwrap()[..n].copy_from_slice(&p.input[ch][..n]);
            }
            if !d.render(n) {
                return 0;
            }
            for ch in 0..2 {
                p.output[ch][..n].copy_from_slice(&d.output(ch).unwrap()[..n]);
            }
        }
        Backend::DirectVoice(d) => {
            for ch in 0..2 {
                d.input_mut(ch).unwrap()[..n].copy_from_slice(&p.input[ch][..n]);
            }
            if !d.render(n) {
                return 0;
            }
            for ch in 0..2 {
                p.output[ch][..n].copy_from_slice(&d.output(ch).unwrap()[..n]);
            }
        }
    };
    1
}
#[no_mangle]
pub extern "C" fn probe_reset(p: &mut Probe) {
    match &mut p.backend {
        Backend::Rack(d) => d.reset(),
        Backend::Voice(d) => d.reset(),
        Backend::DirectRack(d) => d.reset(),
        Backend::DirectVoice(d) => d.reset(),
    };
    p.input.fill([0.; 2048]);
    p.output.fill([0.; 2048]);
}
#[no_mangle]
pub extern "C" fn probe_stat(p: &Probe, index: u32) -> f64 {
    match &p.backend {
        Backend::Rack(d) => d.stat(index),
        Backend::Voice(d) => d.stat(index),
        Backend::DirectRack(d) => d.stat(index),
        Backend::DirectVoice(d) => d.stat(index),
    }
}
