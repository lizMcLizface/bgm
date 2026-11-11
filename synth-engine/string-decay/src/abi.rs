use crate::{Player, Preparation, BLOCK};
#[no_mangle]
pub extern "C" fn string_decay_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn string_decay_owned_bytes() -> u32 {
    crate::OWNED_PCM.load(std::sync::atomic::Ordering::Relaxed) as u32
}
#[no_mangle]
pub extern "C" fn string_decay_new(n: u32) -> *mut Preparation {
    Preparation::new(n as usize).map_or(std::ptr::null_mut(), Box::into_raw)
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_input(p: *mut Preparation) -> *mut f64 {
    p.as_mut().map_or(std::ptr::null_mut(), |p| {
        if p.result.is_some() {
            std::ptr::null_mut()
        } else {
            p.input.as_mut_ptr()
        }
    })
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_prepare(p: *mut Preparation) -> u32 {
    p.as_mut().is_some_and(Preparation::prepare) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_samples(p: *const Preparation) -> *const f32 {
    p.as_ref()
        .and_then(|p| p.result.as_ref())
        .map_or(std::ptr::null(), |p| p.samples.as_ptr())
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_stat(p: *const Preparation, id: u32) -> f64 {
    p.as_ref().map_or(0., |p| p.stat(id))
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_free(p: *mut Preparation) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn string_decay_player_new(n: u32) -> *mut Player {
    Player::new(n as usize).map_or(std::ptr::null_mut(), Box::into_raw)
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_player_input(p: *mut Player) -> *mut f32 {
    p.as_mut().map_or(std::ptr::null_mut(), |p| {
        if p.sealed {
            std::ptr::null_mut()
        } else {
            p.samples.as_mut_ptr()
        }
    })
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_player_seal(p: *mut Player) -> u32 {
    p.as_mut().is_some_and(Player::seal) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_player_render(p: *mut Player, n: u32) -> u32 {
    p.as_mut().is_some_and(|p| p.render(n as usize)) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_player_reset(p: *mut Player) -> u32 {
    p.as_mut().is_some_and(Player::reset) as u32
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_player_frame(p: *const Player) -> f64 {
    p.as_ref().map_or(0., |p| p.cursor as f64)
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_player_output(p: *const Player, ch: u32) -> *const f32 {
    if ch > 1 {
        return std::ptr::null();
    }
    p.as_ref().map_or(std::ptr::null(), |p| {
        p.output.as_ptr().add(ch as usize * BLOCK)
    })
}
#[no_mangle]
pub unsafe extern "C" fn string_decay_player_free(p: *mut Player) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
