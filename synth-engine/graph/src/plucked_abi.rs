//! Preparation-only bridge for distinct generator plucked voices. Graph owns
//! all clocks/events; these methods are rejected after Graph preparation.
use crate::{Error, Graph};

fn edit(
    graph: &mut Graph,
    id: u32,
    apply: impl FnOnce(&mut calmbgm_plucked_voice::voice::Engine) -> bool,
) -> u32 {
    match graph.plucked_edit(id) {
        Ok(source) => if apply(source) { 0 } else { Error::Contract as u32 },
        Err(error) => error as u32,
    }
}

#[no_mangle]
pub extern "C" fn graph_plucked_config(graph:&mut Graph,id:u32,voices:usize,cutoff:f64,q:f64,pitch:f64,decay:f64)->u32 {
    edit(graph,id,|source|source.configure(voices,cutoff,q,pitch,decay))
}
#[no_mangle]
pub extern "C" fn graph_plucked_bank(graph:&mut Graph,id:u32,frequency:f64,decay:f64,damping:f64,position:f64,body:f64,resonance:f64,body_type:u32,seed:u32,softness:f64)->u32 {
    edit(graph,id,|source|source.bank(frequency,calmbgm_plucked_voice::Settings{decay,damping,position,body,resonance,body_type,seed,softness}))
}
#[no_mangle]
pub extern "C" fn graph_plucked_spec(graph:&mut Graph,id:u32,note:u32,bank:usize,midi:f32,velocity:f32)->u32 {
    edit(graph,id,|source|source.note_spec(note,bank,midi,velocity))
}
#[no_mangle]
pub extern "C" fn graph_plucked_point(graph:&mut Graph,id:u32,note:u32,kind:u32,frame:f64,value:f64,tau:f64)->u32 {
    edit(graph,id,|source|source.point(note,calmbgm_plucked_voice::Point{kind,frame,value,tau}))
}
#[no_mangle]
pub extern "C" fn graph_plucked_lifetime(graph:&mut Graph,id:u32,note:u32,voice:usize,onset:f64,fade:f64,cut:f64)->u32 {
    edit(graph,id,|source|source.lifetime(note,voice,onset,fade,cut))
}
#[no_mangle]
pub extern "C" fn graph_plucked_control(graph:&mut Graph,id:u32,axis:u32,kind:u32,phase:f64,frequency:f64,initial:f64,target:f64,tau:f64)->u32 {
    edit(graph,id,|source|source.control(calmbgm_plucked_voice::control::Control{axis,kind,phase,frequency,initial,target,tau,points:Vec::new()}))
}
#[no_mangle]
pub extern "C" fn graph_plucked_control_point(graph:&mut Graph,id:u32,index:usize,frame:f64,value:f64)->u32 {
    edit(graph,id,|source|source.control_point(index,frame,value))
}
