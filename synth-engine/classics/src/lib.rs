//! Classic-synth models for the /synths pages. Original, allocation-free DSP;
//! no third-party code. The host owns the ABI, the output buffers and the
//! shared space effects; each model owns its voices and parameters.
//! Events are applied at the start of the next rendered block (live play only).
#![allow(static_mut_refs)]
mod alloc;
mod cs80;
mod dsp;
mod fx;
mod juno;

use dsp::{soft, DcBlock, MAX_BLOCK};

pub const API: u32 = 1;
/// Parameter ids at or above this address the shared effects.
const FX_BASE: u32 = 200;
pub const MODEL_CS80: u32 = 0;
pub const MODEL_JUNO: u32 = 1;

struct Host {
    sr: f32,
    model: u32,
    cs80: cs80::Cs80,
    juno: juno::Juno,
    bbd: fx::Bbd,
    space: fx::Space,
    dc: [DcBlock; 2],
    left: [f32; MAX_BLOCK],
    right: [f32; MAX_BLOCK],
    peak: f32,
    frames: f64,
}

static mut HOST: Host = Host {
    sr: 48000.,
    model: MODEL_CS80,
    cs80: cs80::Cs80::new(),
    juno: juno::Juno::new(),
    bbd: fx::Bbd::new(),
    space: fx::Space::new(),
    dc: [DcBlock::ZERO; 2],
    left: [0.; MAX_BLOCK],
    right: [0.; MAX_BLOCK],
    peak: 0.,
    frames: 0.,
};
static mut BUFFERS: fx::Buffers = fx::Buffers::ZERO;

/// Forwards one call to whichever model is active.
macro_rules! model {
    ($h:expr, $m:ident => $body:expr) => {
        match $h.model {
            MODEL_JUNO => {
                let $m = &mut $h.juno;
                $body
            }
            _ => {
                let $m = &mut $h.cs80;
                $body
            }
        }
    };
}

#[no_mangle]
pub extern "C" fn syn_api() -> u32 {
    API
}

/// Number of parameter slots of the active model (ids 0..count); effect ids start at 200.
#[no_mangle]
pub extern "C" fn syn_param_count() -> u32 {
    unsafe {
        match HOST.model {
            MODEL_JUNO => juno::PARAMS as u32,
            _ => cs80::PARAMS as u32,
        }
    }
}

#[no_mangle]
pub extern "C" fn syn_init(sr: f32, model: u32) -> u32 {
    if !(8000. ..=384000.).contains(&sr) || model > MODEL_JUNO {
        return 0;
    }
    unsafe {
        HOST.sr = sr;
        HOST.model = model;
        match model {
            MODEL_JUNO => HOST.juno.init(sr),
            _ => HOST.cs80.init(sr),
        }
        HOST.bbd.init(sr);
        HOST.space.init(sr);
        HOST.space.clear(&mut BUFFERS);
        HOST.dc = [DcBlock::ZERO; 2];
        HOST.peak = 0.;
        HOST.frames = 0.;
    }
    1
}

#[no_mangle]
pub extern "C" fn syn_param(id: u32, value: f32) {
    unsafe {
        if id >= FX_BASE {
            HOST.space.set((id - FX_BASE) as usize, value);
        } else {
            model!(HOST, m => m.set(id as usize, value));
        }
    }
}

#[no_mangle]
pub extern "C" fn syn_note_on(key: u32, note: f32, velocity: f32) {
    unsafe { model!(HOST, m => m.note_on(key, note, velocity)) }
}

#[no_mangle]
pub extern "C" fn syn_note_off(key: u32) {
    unsafe { model!(HOST, m => m.note_off(key)) }
}

#[no_mangle]
pub extern "C" fn syn_pressure(key: u32, value: f32) {
    unsafe { model!(HOST, m => m.poly_pressure(key, value)) }
}

#[no_mangle]
pub extern "C" fn syn_control(which: u32, value: f32) {
    unsafe { model!(HOST, m => m.control(which, value)) }
}

/// Silence everything immediately, including effect tails.
#[no_mangle]
pub extern "C" fn syn_panic() {
    unsafe {
        model!(HOST, m => m.panic());
        HOST.space.clear(&mut BUFFERS);
        HOST.bbd.init(HOST.sr);
        HOST.dc = [DcBlock::ZERO; 2];
    }
}

#[no_mangle]
pub extern "C" fn syn_render(frames: u32) {
    unsafe {
        let n = (frames as usize).min(MAX_BLOCK);
        let h = &mut HOST;
        let (left, right) = (&mut h.left[..n], &mut h.right[..n]);
        if h.model == MODEL_JUNO {
            h.juno.render(left, right);
            let (mode, noise) = h.juno.chorus();
            h.bbd.render(&mut BUFFERS.bbd, left, right, mode, noise);
        } else {
            h.cs80.render(left, right);
        }
        h.space.render(&mut BUFFERS, left, right);
        let r = 1. - 62.8 / h.sr; // ~10 Hz DC blocker
        let mut peak = 0f32;
        for i in 0..n {
            let l = soft(h.dc[0].tick(left[i], r)).clamp(-1., 1.);
            let rr = soft(h.dc[1].tick(right[i], r)).clamp(-1., 1.);
            peak = peak.max(l.abs()).max(rr.abs());
            left[i] = l;
            right[i] = rr;
        }
        h.peak = peak;
        h.frames += n as f64;
    }
}

#[no_mangle]
pub extern "C" fn syn_left() -> *const f32 {
    unsafe { HOST.left.as_ptr() }
}

#[no_mangle]
pub extern "C" fn syn_right() -> *const f32 {
    unsafe { HOST.right.as_ptr() }
}

/// 0 active voices, 1 steals, 2 last block peak, 3 rendered seconds.
#[no_mangle]
pub extern "C" fn syn_stat(which: u32) -> f32 {
    unsafe {
        match which {
            0 => model!(HOST, m => m.active()) as f32,
            1 => model!(HOST, m => m.steals) as f32,
            2 => HOST.peak,
            3 => (HOST.frames / HOST.sr as f64) as f32,
            _ => 0.,
        }
    }
}
