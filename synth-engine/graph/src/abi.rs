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
pub extern "C" fn graph_latency_compensation(g:&mut Graph,enabled:u32)->u32{if enabled>1{return Error::Contract as u32;}status(g.latency_compensation(enabled!=0))}
#[no_mangle]
pub extern "C" fn graph_fx_config(g:&mut Graph,id:u32,settled:u32)->u32{if settled>1{return Error::Contract as u32;}status(g.fx_config(id,settled!=0))}
#[no_mangle]
pub extern "C" fn graph_delay_config(g:&mut Graph,id:u32,frames:usize)->u32{status(g.delay_config(id,frames))}
#[no_mangle]
pub extern "C" fn graph_input_latency(g:&mut Graph,id:u32,frames:f64)->u32{status(g.input_latency(id,frames))}
#[no_mangle]
pub extern "C" fn graph_latency(g:&Graph,id:u32)->f64{g.latency(id).map_or(f64::NAN,|n|n as f64)}
#[no_mangle]
pub extern "C" fn graph_edge_latency(g:&Graph,id:u32)->f64{g.edge_latency(id).map_or(f64::NAN,|n|n as f64)}
#[no_mangle]
pub extern "C" fn graph_fx_stat(g:&Graph,id:u32,index:u32)->f64{g.effect_stat(id,index).unwrap_or(f64::NAN)}
#[no_mangle]
pub extern "C" fn graph_get_base(g:&Graph,id:u32,index:usize)->f32{g.base(id,index).unwrap_or(f32::NAN)}
#[no_mangle]
pub extern "C" fn graph_mixer_config(g:&mut Graph,id:u32,index:usize,value:f64,settled:u32)->u32{if settled>1{return Error::Contract as u32;}status(g.mixer_config(id,index,value,settled!=0))}
#[no_mangle]
pub extern "C" fn graph_mixer_value(g:&Graph,id:u32,index:usize)->f64{g.mixer_value(id,index).unwrap_or(f64::NAN)}
#[no_mangle]
pub extern "C" fn graph_mixer_reduction(g:&Graph,id:u32)->f64{g.mixer_reduction(id).unwrap_or(f64::NAN)}
#[no_mangle]
pub extern "C" fn graph_mixer_param(g:&mut Graph,frame:f64,target:u32,owner:u32,index:usize,value:f64)->u32{if !frame.is_finite()||frame<0.||frame.fract()!=0.||frame>MAX_FRAME as f64{return Error::Frame as u32;}status(g.enqueue(Event{frame:frame as u64,target,owner,action:Action::MixerParam{param:index,value}}))}
#[no_mangle]
pub extern "C" fn graph_classic_config(g:&mut Graph,id:u32,model:u32,polyphony:usize)->u32{status(g.classic_config(id,model,polyphony))}
#[no_mangle]
pub extern "C" fn graph_classic_param(g:&mut Graph,id:u32,index:u32,value:f32)->u32{match g.classic_edit(id){Ok(p)=>if p.initial_param(index,value){0}else{Error::Contract as u32},Err(e)=>e as u32}}
#[no_mangle]
pub extern "C" fn graph_classic_wave_ptr(g:&mut Graph,id:u32)->*mut f32{g.classic_edit(id).map_or(std::ptr::null_mut(),|p|p.wave_ptr())}
#[no_mangle]
pub extern "C" fn graph_classic_wave_len(g:&mut Graph,id:u32)->usize{g.classic_edit(id).map_or(0,|p|p.wave_len())}
#[no_mangle]
pub extern "C" fn graph_classic_wave_commit(g:&mut Graph,id:u32)->u32{match g.classic_edit(id){Ok(p)=>if p.wave_commit(){0}else{Error::Contract as u32},Err(e)=>e as u32}}
#[no_mangle]
pub extern "C" fn graph_classic_event(g:&mut Graph,frame:f64,target:u32,owner:u32,kind:u32,id:u32,a:f32,b:f32)->u32{if !frame.is_finite()||frame<0.||frame.fract()!=0.||frame>MAX_FRAME as f64{return Error::Frame as u32;}status(g.enqueue(Event{frame:frame as u64,target,owner,action:Action::Classic{kind,id,a,b}}))}
#[no_mangle]
pub extern "C" fn graph_voice_fx_config(g:&mut Graph,id:u32,seed:u32)->u32{status(g.voice_fx_config(id,seed))}
#[no_mangle]
pub extern "C" fn graph_fx_initial(g:&mut Graph,id:u32,index:usize,value:f64)->u32{status(g.fx_initial(id,index,value))}
#[no_mangle]
pub extern "C" fn graph_fx_value(g:&Graph,id:u32,index:usize)->f64{g.fx_value(id,index).unwrap_or(f64::NAN)}
#[no_mangle]
pub extern "C" fn graph_rack_shape_count(g:&mut Graph,id:u32,count:usize)->u32{match g.rack_edit(id){Ok(p)=>if p.shape_count(count){0}else{Error::Contract as u32},Err(e)=>e as u32}}
#[no_mangle]
pub extern "C" fn graph_rack_shape_row(g:&mut Graph,id:u32,shape:usize,section:usize,frequency:f64,bandwidth:f64,boost:f64)->u32{match g.rack_edit(id){Ok(p)=>if p.shape_row(shape,section,[frequency,bandwidth,boost]){0}else{Error::Contract as u32},Err(e)=>e as u32}}
#[no_mangle]
pub extern "C" fn graph_fx_param(g:&mut Graph,frame:f64,target:u32,owner:u32,index:usize,value:f64)->u32{if !frame.is_finite()||frame<0.||frame.fract()!=0.||frame>MAX_FRAME as f64{return Error::Frame as u32;}status(g.enqueue(Event{frame:frame as u64,target,owner,action:Action::FxParam{param:index,value}}))}
fn piano_status(g:&mut Graph,id:u32,f:impl FnOnce(&mut calmbgm_piano::voice::Engine)->bool)->u32 {
    match g.piano_edit(id){Ok(p)=>if f(p){0}else{Error::Contract as u32},Err(e)=>e as u32}
}
fn iowa_status(g:&mut Graph,id:u32,f:impl FnOnce(&mut calmbgm_iowa::Engine)->bool)->u32 {match g.iowa_edit(id){Ok(p)=>if f(p){0}else{Error::Contract as u32},Err(e)=>e as u32}}
#[no_mangle]
pub extern "C" fn graph_iowa_config(g:&mut Graph,id:u32,voices:usize)->u32{iowa_status(g,id,|p|p.configure(voices))}
#[no_mangle]
pub extern "C" fn graph_iowa_spec(g:&mut Graph,id:u32,spec:u32,kind:u32,f0:f64,seconds:f64,rate:f64,depth:f64,tremolo:f64,pitch:f64,level:f64)->u32{if kind>1{return Error::Contract as u32;}iowa_status(g,id,|p|p.spec(calmbgm_iowa::Spec::new(spec,kind==1,f0,seconds,rate,depth,tremolo,pitch,level)))}
#[no_mangle]
pub extern "C" fn graph_iowa_note_spec(g:&mut Graph,id:u32,note:u32,spec:u32,midi:f32,velocity:f32,gain:f64,tune:f64,ring:u32,roll_rate:f64,roll_level:f64,roll_timing:f64,slide_cents:f64,slide_seconds:f64)->u32{if ring>1{return Error::Contract as u32;}iowa_status(g,id,|p|p.note_spec(calmbgm_iowa::Note{id:note,spec:0,midi,velocity,gain,tune,ring:ring!=0,roll:[roll_rate,roll_level,roll_timing],slide:[slide_cents,slide_seconds]},spec))}
// Preparation-only trusted-host scratch handles. Never retained by the engine.
#[no_mangle]
pub extern "C" fn graph_iowa_buffer_new(length:usize)->*mut Vec<f64>{if length>262144{return std::ptr::null_mut();}Box::into_raw(Box::new(vec![0.;length]))}
#[no_mangle]
pub extern "C" fn graph_iowa_buffer_ptr(b:&mut Vec<f64>)->*mut f64{b.as_mut_ptr()}
#[no_mangle]
pub unsafe extern "C" fn graph_iowa_buffer_free(b:*mut Vec<f64>){if !b.is_null(){drop(Box::from_raw(b));}}
#[no_mangle]
pub extern "C" fn graph_iowa_data(g:&mut Graph,id:u32,spec:u32,field:u32,b:&Vec<f64>)->u32{iowa_status(g,id,|p|p.data(spec,field,b))}
#[no_mangle]
pub extern "C" fn graph_piano_config(g:&mut Graph,id:u32,voices:usize,cutoff:f64,q:f64,pitch:f64,decay:f64)->u32 {piano_status(g,id,|p|p.configure(voices,cutoff,q,pitch,decay))}
#[no_mangle]
pub extern "C" fn graph_piano_bank(g:&mut Graph,id:u32,freq:f64,kind:u32,decay:f64,brightness:f64,hammer:f64,unison:f64,velocity:f64,seed:u32,resonance:f64,softness:f64,sustain:f64,wear:f64)->u32 {
    piano_status(g,id,|p|p.bank(freq,kind,calmbgm_piano::Settings{electric:kind==1,decay,brightness,hammer,unison,velocity,seed,resonance,softness},sustain,wear))
}
#[no_mangle]
pub extern "C" fn graph_piano_spec(g:&mut Graph,id:u32,note:u32,bank:usize,midi:f32,velocity:f32)->u32 {piano_status(g,id,|p|p.note_spec(note,bank,midi,velocity))}
#[no_mangle]
pub extern "C" fn graph_piano_point(g:&mut Graph,id:u32,note:u32,kind:u32,frame:f64,value:f64,tau:f64)->u32 {piano_status(g,id,|p|p.point(note,calmbgm_piano::voice::Point{kind,frame,value,tau}))}
#[no_mangle]
pub extern "C" fn graph_piano_lifetime(g:&mut Graph,id:u32,note:u32,voice:usize,onset:f64,fade:f64,cut:f64)->u32 {match g.piano_lifetime_edit(id){Ok(p)=>if p.lifetime(note,voice,onset,fade,cut){0}else{Error::Contract as u32},Err(e)=>e as u32}}
#[no_mangle]
pub extern "C" fn graph_piano_control(g:&mut Graph,id:u32,axis:u32,kind:u32,phase:f64,frequency:f64,initial:f64,target:f64,tau:f64)->u32 {match g.piano_control_edit(id){Ok(p)=>if p.control(calmbgm_piano::control::Control{axis,kind,phase,frequency,initial,target,tau,points:Vec::new()}){0}else{Error::Contract as u32},Err(e)=>e as u32}}
#[no_mangle]
pub extern "C" fn graph_piano_control_point(g:&mut Graph,id:u32,index:usize,frame:f64,value:f64)->u32 {match g.piano_control_edit(id){Ok(p)=>if p.control_point(index,frame,value){0}else{Error::Contract as u32},Err(e)=>e as u32}}
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
pub extern "C" fn graph_percussion_config(g:&mut Graph,id:u32,version:u32,voice:u32)->u32 {status(g.percussion_config(id,version,KitConfig::new(voice)))}
#[no_mangle]
pub extern "C" fn graph_percussion_drum(g:&mut Graph,id:u32,drum:usize,on:u32,level:f32,tone:f32,decay:f32)->u32 {
    if on>1 {return Error::Bounds as u32;}
    status(g.percussion_drum(id,drum,DrumConfig{on:on!=0,level,tone,decay}))
}
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
