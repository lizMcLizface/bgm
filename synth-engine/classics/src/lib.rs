//! Classic-synth models for the /synths pages. Original, allocation-free DSP;
//! no third-party code. The host owns the ABI, the output buffers and the
//! shared space effects; each model owns its voices and parameters.
//! Events are applied at the start of the next rendered block (live play only).
#![allow(static_mut_refs)]
mod alloc;
mod cs80;
mod dsp;
mod fx;
mod dx7;
mod juno;
mod obxa;
mod vs;
mod minimoog;
mod jupiter;
mod prophet;
mod seq;
mod drums;
mod tb303;

use dsp::{soft, DcBlock, MAX_BLOCK};

pub const API: u32 = 1;
/// Parameter ids at or above this address the shared effects.
const FX_BASE: u32 = 200;
/// Envelope shapes (amplitude 180–187, filter 188–195) for the models with ADSRs.
const SHAPE_BASE: u32 = 180;
pub const MODEL_CS80: u32 = 0;
pub const MODEL_JUNO: u32 = 1;
pub const MODEL_PROPHET: u32 = 2;
pub const MODEL_JUPITER: u32 = 3;
pub const MODEL_MINIMOOG: u32 = 4;
pub const MODEL_DX7: u32 = 5;
pub const MODEL_OBXA: u32 = 6;
pub const MODEL_VS: u32 = 7;
pub const MODEL_TR808: u32 = 8;
pub const MODEL_TR909: u32 = 9;
pub const MODEL_TR606: u32 = 10;
pub const MODEL_TB303: u32 = 11;

struct Host {
    sr: f32,
    model: u32,
    cs80: cs80::Cs80,
    juno: juno::Juno,
    prophet: prophet::Prophet,
    jupiter: jupiter::Jupiter8,
    minimoog: minimoog::Minimoog,
    dx7: dx7::Dx7,
    obxa: obxa::ObXa2,
    vs: vs::Vs,
    drums: drums::Drums,
    bass: tb303::Tb303,
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
    prophet: prophet::Prophet::new(),
    jupiter: jupiter::Jupiter8::new(),
    minimoog: minimoog::Minimoog::new(),
    dx7: dx7::Dx7::new(),
    obxa: obxa::ObXa2::new(),
    vs: vs::Vs::new(),
    drums: drums::Drums::new(),
    bass: tb303::Tb303::new(),
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
            MODEL_PROPHET => {
                let $m = &mut $h.prophet;
                $body
            }
            MODEL_JUPITER => {
                let $m = &mut $h.jupiter;
                $body
            }
            MODEL_MINIMOOG => {
                let $m = &mut $h.minimoog;
                $body
            }
            MODEL_DX7 => {
                let $m = &mut $h.dx7;
                $body
            }
            MODEL_OBXA => {
                let $m = &mut $h.obxa;
                $body
            }
            MODEL_VS => {
                let $m = &mut $h.vs;
                $body
            }
            MODEL_TR808 | MODEL_TR909 | MODEL_TR606 => {
                let $m = &mut $h.drums;
                $body
            }
            MODEL_TB303 => {
                let $m = &mut $h.bass;
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
            MODEL_PROPHET => prophet::PARAMS as u32,
            MODEL_JUPITER => jupiter::PAIR_PARAMS as u32,
            MODEL_MINIMOOG => minimoog::PARAMS as u32,
            MODEL_DX7 => dx7::PARAMS as u32,
            MODEL_OBXA => obxa::PAIR_PARAMS as u32,
            MODEL_VS => vs::PARAMS as u32,
            MODEL_TR808 | MODEL_TR909 | MODEL_TR606 => drums::PARAMS as u32,
            MODEL_TB303 => tb303::PARAMS as u32,
            _ => cs80::PARAMS as u32,
        }
    }
}

#[no_mangle]
pub extern "C" fn syn_init(sr: f32, model: u32) -> u32 {
    if !(8000. ..=384000.).contains(&sr) || model > MODEL_TB303 {
        return 0;
    }
    unsafe {
        HOST.sr = sr;
        HOST.model = model;
        match model {
            MODEL_JUNO => HOST.juno.init(sr),
            MODEL_PROPHET => HOST.prophet.init(sr),
            MODEL_JUPITER => HOST.jupiter.init(sr),
            MODEL_MINIMOOG => HOST.minimoog.init(sr),
            MODEL_DX7 => HOST.dx7.init(sr),
            MODEL_OBXA => HOST.obxa.init(sr),
            MODEL_VS => HOST.vs.init(sr),
            MODEL_TR808 => HOST.drums.init(sr, drums::STYLE_808),
            MODEL_TR909 => HOST.drums.init(sr, drums::STYLE_909),
            MODEL_TR606 => HOST.drums.init(sr, drums::STYLE_606),
            MODEL_TB303 => HOST.bass.init(sr),
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
        } else if id >= SHAPE_BASE {
            let i = (id - SHAPE_BASE) as usize;
            if i < dsp::SHAPE_PARAMS && value.is_finite() {
                match HOST.model {
                    MODEL_CS80 => HOST.cs80.set_shape(i, value),
                    MODEL_JUNO => HOST.juno.set_shape(i, value),
                    MODEL_PROPHET => HOST.prophet.set_shape(i, value),
                    MODEL_JUPITER => HOST.jupiter.set_shape(i, value),
                    MODEL_MINIMOOG => HOST.minimoog.set_shape(i, value),
                    MODEL_OBXA => HOST.obxa.set_shape(i, value),
                    _ => {}
                }
            }
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
        } else if h.model == MODEL_PROPHET {
            h.prophet.render(left, right);
        } else if h.model == MODEL_JUPITER {
            h.jupiter.render(left, right);
        } else if h.model == MODEL_MINIMOOG {
            h.minimoog.render(left, right);
        } else if h.model == MODEL_DX7 {
            h.dx7.render(left, right);
        } else if h.model == MODEL_OBXA {
            h.obxa.render(left, right);
        } else if h.model == MODEL_VS {
            h.vs.render(left, right);
        } else if matches!(h.model, MODEL_TR808 | MODEL_TR909 | MODEL_TR606) {
            h.drums.render(left, right);
        } else if h.model == MODEL_TB303 {
            h.bass.render(left, right);
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

/// Sequencer commands for the drum machines and the bass line (see `seq.rs`, `drums.rs`,
/// `tb303.rs`): 0 play/stop, 1 set a step, 2 pattern, 3 chain slot, 4 chain length,
/// 5 pattern length, 6 rewind, 7 clear a pattern.
#[no_mangle]
pub extern "C" fn syn_seq(cmd: u32, a: u32, b: f32) {
    unsafe {
        match HOST.model {
            MODEL_TR808 | MODEL_TR909 | MODEL_TR606 => HOST.drums.command(cmd, a, b),
            MODEL_TB303 => HOST.bass.command(cmd, a, b),
            _ => {}
        }
    }
}

/// The shared wave buffer (the vector synthesizer's 128 waves × 128 samples, f32): the host
/// writes it and then calls `syn_wave_commit`. Other models ignore it.
#[no_mangle]
pub extern "C" fn syn_wave_ptr() -> *mut f32 {
    vs::wave_ptr()
}

/// Builds the band-limited tables from the buffer. Takes a few tens of milliseconds.
#[no_mangle]
pub extern "C" fn syn_wave_commit() {
    vs::commit();
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
            4 | 5 | 6 => {
                let s = match HOST.model {
                    MODEL_TR808 | MODEL_TR909 | MODEL_TR606 => &HOST.drums.seq,
                    MODEL_TB303 => &HOST.bass.seq,
                    _ => return 0.,
                };
                match which {
                    4 => s.last_step as f32,
                    5 => s.last_pattern as f32,
                    _ => s.running as u32 as f32,
                }
            }
            _ => 0.,
        }
    }
}
