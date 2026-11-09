//! Handle ownership: create once, serialize access, free once off process().
//! Handles are opaque, trusted-host pointers; arbitrary/stale pointers are invalid.
use super::*;
// Preparation-only owned descriptor handle. Build tools use the actual Wasm
// contract code, without executing a separately generated native executable.
#[no_mangle]
pub extern "C" fn graph_contracts_new() -> *mut String {
    Box::into_raw(Box::new(descriptors_json()))
}
#[no_mangle]
pub extern "C" fn graph_contracts_ptr(s: &String) -> *const u8 {
    s.as_ptr()
}
#[no_mangle]
pub extern "C" fn graph_contracts_len(s: &String) -> usize {
    s.len()
}
#[no_mangle]
pub unsafe extern "C" fn graph_contracts_free(s: *mut String) {
    if !s.is_null() {
        drop(Box::from_raw(s));
    }
}
fn status(result: Result<()>) -> u32 {
    result.err().map_or(0, |e| e as u32)
}
#[no_mangle]
pub extern "C" fn graph_pitch_config(g:&mut Graph,id:u32,scope:u32,index:u32,value:f64)->u32 {status(g.pitch_config(id,scope,index,value))}
#[no_mangle]
pub extern "C" fn graph_pitch_performance(g:&mut Graph,id:u32,mode:u32,portamento:f32,always:u32)->u32 {if always>1{return Error::Contract as u32;}status(g.pitch_performance(id,mode,portamento,always!=0))}
#[no_mangle]
pub extern "C" fn graph_pitch_point(g:&mut Graph,id:u32,frame:f64,scope:u32,index:u32,value:f64,extra:f32)->u32 {
    if !frame.is_finite()||frame<0.||frame.fract()!=0.||frame>MAX_FRAME as f64{return Error::Frame as u32;}status(g.pitch_point(id,frame as u64,scope,index,value,extra))
}
#[no_mangle]
pub extern "C" fn graph_pitch_stat(g:&Graph,id:u32,index:u32)->f64 {g.pitch_stat(id,index).unwrap_or(f64::NAN)}
#[no_mangle]
pub extern "C" fn graph_percussion_stat(g:&Graph,id:u32,index:u32)->f64 {g.percussion_stat(id,index).unwrap_or(f64::NAN)}
#[no_mangle]
pub extern "C" fn graph_node_ptr(g:&Graph,id:u32)->*const f32 {g.node_buffer(id).map_or(std::ptr::null(),|b|b.as_ptr().cast())}
#[no_mangle]
pub extern "C" fn graph_note(g:&mut Graph,frame:f64,target:u32,owner:u32,kind:u32,id:u32,a:f32,b:f32)->u32 {
    if !frame.is_finite()||frame<0.||frame.fract()!=0.||frame>MAX_FRAME as f64{return Error::Frame as u32;}
    status(g.enqueue(Event{frame:frame as u64,target,owner,action:Action::Note{kind,id,a,b}}))
}
#[no_mangle]
pub unsafe extern "C" fn graph_input_ptr(g: &mut Graph, id: u32) -> *mut f32 {
    g.input_buffer(id)
        .map_or(std::ptr::null_mut(), |b| b.as_mut_ptr().cast())
}
#[no_mangle]
pub unsafe extern "C" fn graph_kick_ptr(g: &Graph, id: u32) -> *const f32 {
    g.kick_buffer(id)
        .map_or(std::ptr::null(), |b| b.as_ptr().cast())
}
#[no_mangle]
pub unsafe extern "C" fn graph_audio_port(
    g: &mut Graph,
    id: u32,
    from: u32,
    port: usize,
    to: u32,
    input: usize,
) -> u32 {
    status(g.connect_audio_port(id, from, port, to, input))
}
#[no_mangle]
pub unsafe extern "C" fn graph_detector_connection(g: &mut Graph, id: u32, enabled: u32) -> u32 {
    if enabled > 1 {
        return Error::Contract as u32;
    }
    status(g.set_detector_connection(id, enabled == 1))
}
#[no_mangle]
pub unsafe extern "C" fn graph_meter(g: &Graph, id: u32, metric: usize) -> f32 {
    g.meter(id, metric).unwrap_or(f32::NAN)
}
#[no_mangle]
pub unsafe extern "C" fn graph_hit(
    g: &mut Graph,
    frame: f64,
    target: u32,
    owner: u32,
    drum: u32,
    velocity: f32,
    duration: f32,
    vary: f32,
    tone: f32,
    decay: f32,
    id: u32,
    model: u32,
) -> u32 {
    if !frame.is_finite() || frame < 0. || frame.fract() != 0. || frame > MAX_FRAME as f64 {
        return Error::Frame as u32;
    }
    status(g.enqueue(Event {
        frame: frame as u64,
        target,
        owner,
        action: Action::Hit(Hit {
            drum,
            velocity,
            duration,
            vary,
            tone,
            decay,
            id,
            model,
        }),
    }))
}
#[no_mangle]
pub extern "C" fn graph_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn graph_new(sr: f64, block: usize) -> *mut Graph {
    Graph::new(sr, block).map_or(std::ptr::null_mut(), |g| Box::into_raw(Box::new(g)))
}
#[no_mangle]
pub unsafe extern "C" fn graph_free(g: *mut Graph) {
    if !g.is_null() {
        drop(Box::from_raw(g));
    }
}
#[no_mangle]
pub unsafe extern "C" fn graph_node(g: &mut Graph, id: u32, kind: u32, version: u32) -> u32 {
    status(Kind::from_code(kind).and_then(|k| g.add_node(id, k, version)))
}
#[no_mangle]
pub unsafe extern "C" fn graph_base(g: &mut Graph, id: u32, param: usize, value: f32) -> u32 {
    status(g.set_base(id, param, value))
}
#[no_mangle]
pub unsafe extern "C" fn graph_audio(
    g: &mut Graph,
    id: u32,
    from: u32,
    to: u32,
    input: usize,
) -> u32 {
    status(g.connect(id, from, to, Link::Audio { input }))
}
#[no_mangle]
pub unsafe extern "C" fn graph_mod(
    g: &mut Graph,
    id: u32,
    from: u32,
    to: u32,
    param: usize,
    depth: f32,
    offset: f32,
    unipolar: u32,
) -> u32 {
    if unipolar > 1 {
        return Error::Contract as u32;
    }
    status(g.connect(
        id,
        from,
        to,
        Link::Mod {
            param,
            depth,
            offset,
            unipolar: unipolar == 1,
        },
    ))
}
#[no_mangle]
pub unsafe extern "C" fn graph_prepare(g: &mut Graph) -> u32 {
    status(g.prepare())
}
#[no_mangle]
pub unsafe extern "C" fn graph_event(
    g: &mut Graph,
    frame: f64,
    target: u32,
    owner: u32,
    kind: u32,
    index: u32,
    value: f32,
) -> u32 {
    if !frame.is_finite() || frame < 0. || frame.fract() != 0. || frame > MAX_FRAME as f64 {
        return Error::Frame as u32;
    }
    let action = match kind {
        0 => Action::Param {
            param: index as usize,
            value,
        },
        1 if value == 0. || value == 1. => Action::Gate(value == 1.),
        2 if value == 0. || value == 1. => Action::ModEnabled {
            edge: index,
            enabled: value == 1.,
        },
        3 if value == 0. || value == 1. => Action::ConnectionEnabled {
            edge: index,
            enabled: value == 1.,
        },
        4 => Action::Cancel,
        _ => return Error::Contract as u32,
    };
    status(g.enqueue(Event {
        frame: frame as u64,
        target,
        owner,
        action,
    }))
}
#[no_mangle]
pub unsafe extern "C" fn graph_render(g: &mut Graph, n: usize) -> u32 {
    status(g.render(n))
}
#[no_mangle]
pub unsafe extern "C" fn graph_left(g: &Graph) -> *const f32 {
    g.left.as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn graph_right(g: &Graph) -> *const f32 {
    g.right.as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn graph_stat(g: &Graph, code: u32) -> f64 {
    match code {
        0 => g.frame as f64,
        1 => g.stats.late as f64,
        2 => g.stats.overflow as f64,
        3 => g.stats.applied as f64,
        _ => -1.,
    }
}
#[no_mangle]
pub unsafe extern "C" fn graph_cancel(g: &mut Graph, owner: u32) {
    g.cancel_owner(owner);
}
#[no_mangle]
pub unsafe extern "C" fn graph_pause(g: &mut Graph, paused: u32) {
    g.paused = paused != 0;
}
#[no_mangle]
pub unsafe extern "C" fn graph_reset(g: &mut Graph) {
    g.reset();
}
