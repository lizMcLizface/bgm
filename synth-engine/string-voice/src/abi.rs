use crate::{Engine, Event, On, OUTPUT};
#[no_mangle]
pub extern "C" fn string_voice_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn string_voice_new(rate: f64, owner: u32) -> *mut Engine {
    Engine::new(rate, owner).map_or(std::ptr::null_mut(), Box::into_raw)
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_free(p: *mut Engine) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_bank(p: *mut Engine, id: u32, f0: f64, rate: f64) -> u32 {
    p.as_mut().is_some_and(|p| p.bank(id, f0, rate)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_wave(p: *mut Engine, id: u32, dark: u32) -> *mut f32 {
    p.as_mut()
        .and_then(|p| p.wave(id, dark))
        .map_or(std::ptr::null_mut(), |v| v.as_mut_ptr())
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_point(
    p: *mut Engine,
    id: u32,
    kind: u32,
    time: f64,
    value: f64,
) -> u32 {
    p.as_mut().is_some_and(|p| p.point(id, kind, time, value)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_note(
    p: *mut Engine,
    id: u32,
    bank: u32,
    lfo: f64,
    gain: f64,
    noise: f64,
    attack: f64,
    open: f64,
    hiss: f64,
    rel_scale: f64,
) -> u32 {
    p.as_mut().is_some_and(|p| {
        p.note(On {
            id,
            bank,
            lfo,
            gain,
            noise,
            attack,
            open,
            hiss,
            rel_scale,
        })
    }) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_prepare(p: *mut Engine) -> u32 {
    p.as_mut().is_some_and(|p| p.prepare()) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_enqueue(
    p: *mut Engine,
    frame: f64,
    owner: u32,
    kind: u32,
    id: u32,
) -> u32 {
    if !frame.is_finite() || frame < 0. || frame > crate::MAX_FRAME as f64 || frame.fract() != 0. {
        return 0;
    }
    p.as_mut().is_some_and(|p| {
        p.enqueue(Event {
            frame: frame as u64,
            owner,
            kind,
            id,
        })
    }) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_render(p: *mut Engine, n: u32) -> u32 {
    p.as_mut().is_some_and(|p| p.render(n as usize)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_output(p: *const Engine, ch: u32) -> *const f32 {
    if ch > 1 {
        return std::ptr::null();
    }
    p.as_ref().map_or(std::ptr::null(), |p| {
        p.output.as_ptr().add(ch as usize * OUTPUT)
    })
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_cancel(p: *mut Engine, owner: u32) {
    if let Some(p) = p.as_mut() {
        p.cancel(owner);
    }
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_reset(p: *mut Engine) -> u32 {
    p.as_mut().is_some_and(Engine::reset) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_voice_stat(p: *const Engine, id: u32) -> f64 {
    p.as_ref().map_or(0., |p| p.stat(id))
}
