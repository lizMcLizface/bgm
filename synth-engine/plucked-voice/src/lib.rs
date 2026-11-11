//! Finite plucked voices, separate from piano source material/identity. The
//! shared control primitive is immutable numeric data, not a piano bank.
#[path = "../../piano/src/control.rs"]
pub mod control;
pub mod voice;
pub use calmbgm_plucked_string::Settings;
pub use voice::{Engine, Point};
pub struct Host {
    pub engine: Engine,
    output: [[f32; 2]; 2048],
    frame: u64,
    late: u64,
    rejected: u64,
}
#[no_mangle]
pub extern "C" fn plucked_voice_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn plucked_voice_new(
    rate: f64,
    voices: u32,
    cutoff: f64,
    q: f64,
    pitch: f64,
    decay: f64,
) -> *mut Host {
    if rate != 48000. {
        return std::ptr::null_mut();
    }
    let mut engine = Engine::new(rate, true);
    if !engine.configure(voices as usize, cutoff, q, pitch, decay) {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(Host {
        engine,
        output: [[0.; 2]; 2048],
        frame: 0,
        late: 0,
        rejected: 0,
    }))
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_free(p: *mut Host) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_bank(
    p: *mut Host,
    frequency: f64,
    decay: f64,
    damping: f64,
    position: f64,
    body: f64,
    resonance: f64,
    body_type: u32,
    seed: u32,
    softness: f64,
) -> u32 {
    p.as_mut().is_some_and(|p| {
        p.engine.bank(
            frequency,
            Settings {
                decay,
                damping,
                position,
                body,
                resonance,
                body_type,
                seed,
                softness,
            },
        )
    }) as u32
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_note_spec(
    p: *mut Host,
    id: u32,
    bank: u32,
    midi: f32,
    velocity: f32,
) -> u32 {
    p.as_mut()
        .is_some_and(|p| p.engine.note_spec(id, bank as usize, midi, velocity)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_point(
    p: *mut Host,
    id: u32,
    kind: u32,
    frame: f64,
    value: f64,
    tau: f64,
) -> u32 {
    p.as_mut().is_some_and(|p| {
        p.engine.point(
            id,
            Point {
                kind,
                frame,
                value,
                tau,
            },
        )
    }) as u32
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_lifetime(
    p: *mut Host,
    id: u32,
    slot: u32,
    onset: f64,
    fade: f64,
    cut: f64,
) -> u32 {
    p.as_mut()
        .is_some_and(|p| p.engine.lifetime(id, slot as usize, onset, fade, cut)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_control(
    p: *mut Host,
    axis: u32,
    kind: u32,
    phase: f64,
    frequency: f64,
    initial: f64,
    target: f64,
    tau: f64,
) -> u32 {
    p.as_mut().is_some_and(|p| {
        p.engine.control(control::Control {
            axis,
            kind,
            phase,
            frequency,
            initial,
            target,
            tau,
            points: Vec::new(),
        })
    }) as u32
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_control_point(
    p: *mut Host,
    index: u32,
    frame: f64,
    value: f64,
) -> u32 {
    p.as_mut()
        .is_some_and(|p| p.engine.control_point(index as usize, frame, value)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_prepare(p: *mut Host) -> u32 {
    p.as_mut().is_some_and(|p| p.engine.prepare()) as u32
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_on(p: *mut Host, id: u32, owner: u32, frame: f64) -> u32 {
    let Some(p) = p.as_mut() else {
        return 0;
    };
    if !frame.is_finite()
        || frame.fract() != 0.
        || frame < 0.
        || frame > 5760000.
        || owner == 0
        || !p.engine.ready
    {
        return 0;
    }
    if frame as u64 != p.frame {
        p.late += 1;
        return 0;
    }
    if p.engine.conflict(id, owner) || !p.engine.note(0, id, owner, p.frame) {
        p.rejected += 1;
        return 0;
    }
    1
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_cancel(p: *mut Host, owner: u32) {
    if let Some(p) = p.as_mut() {
        p.engine.cancel(owner);
    }
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_render(p: *mut Host, frames: u32) -> u32 {
    let Some(p) = p.as_mut() else {
        return 0;
    };
    if frames > 2048 || !p.engine.ready || p.frame + frames as u64 > 5952000 {
        return 0;
    }
    p.engine.render(p.frame, &mut p.output[..frames as usize]);
    p.frame += frames as u64;
    1
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_output(p: *const Host) -> *const f32 {
    p.as_ref()
        .map_or(std::ptr::null(), |p| p.output.as_ptr().cast())
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_reset(p: *mut Host) {
    if let Some(p) = p.as_mut() {
        p.engine.reset();
        p.frame = 0;
        p.late = 0;
        p.rejected = 0;
        p.output.fill([0.; 2]);
    }
}
#[no_mangle]
pub unsafe extern "C" fn plucked_voice_stat(p: *const Host, index: u32) -> f64 {
    p.as_ref().map_or(0., |p| match index {
        2 => p.rejected as f64,
        3 => p.late as f64,
        8 => p.engine.bytes as f64,
        _ => p.engine.stat(index),
    })
}

#[cfg(feature = "allocation-audit")]
mod allocation {
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
    pub extern "C" fn plucked_voice_alloc_watch(on: u32) {
        COUNT.store(0, Ordering::Relaxed);
        WATCH.store(on != 0, Ordering::Relaxed);
    }
    #[no_mangle]
    pub extern "C" fn plucked_voice_alloc_count() -> u32 {
        COUNT.load(Ordering::Relaxed)
    }
}
