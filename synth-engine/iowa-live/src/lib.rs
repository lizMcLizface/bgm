use calmbgm_iowa::{live::Engine,Note,Spec};
#[cfg(feature="allocation-audit")]
mod allocation;
pub struct Host{engine:Engine,output:[[f32;2];128]}
#[no_mangle]pub extern "C" fn iowa_live_api()->u32{1}
#[no_mangle]pub extern "C" fn iowa_live_new(rate:f64)->*mut Host{Engine::new(rate).map(|engine|Box::into_raw(Box::new(Host{engine,output:[[0.;2];128]}))).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn iowa_live_free(p:*mut Host){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub unsafe extern "C" fn iowa_live_store(p:*mut Host,decay:u32,f0:f64,seconds:f64,rate:f64,depth:f64,tremolo:f64,pitch:f64,level:f64)->u32{let Some(p)=p.as_mut()else{return 0;};if decay>1{return 0;}p.engine.stage(Spec::new(1,decay!=0,f0,seconds,rate,depth,tremolo,pitch,level)) as u32}
#[no_mangle]pub unsafe extern "C" fn iowa_live_abort(p:*mut Host){if let Some(p)=p.as_mut(){p.engine.abort();}}
#[no_mangle]pub extern "C" fn iowa_live_buffer_new(n:u32)->*mut Vec<f64>{if n>262144{return std::ptr::null_mut();}Box::into_raw(Box::new(vec![0.;n as usize]))}
#[no_mangle]pub unsafe extern "C" fn iowa_live_buffer_ptr(p:*mut Vec<f64>)->*mut f64{p.as_mut().map(|p|p.as_mut_ptr()).unwrap_or(std::ptr::null_mut())}
#[no_mangle]pub unsafe extern "C" fn iowa_live_buffer_free(p:*mut Vec<f64>){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle]pub unsafe extern "C" fn iowa_live_data(p:*mut Host,field:u32,b:*const Vec<f64>)->u32{match(p.as_mut(),b.as_ref()){(Some(p),Some(b))=>p.engine.data(field,b) as u32,_=>0}}
#[no_mangle]pub unsafe extern "C" fn iowa_live_commit(p:*mut Host,key:u32)->u32{p.as_mut().is_some_and(|p|p.engine.commit(key)) as u32}
#[no_mangle]pub unsafe extern "C" fn iowa_live_on(p:*mut Host,key:u32,id:u32,owner:u32,now:f64,midi:f32,velocity:f32,gain:f64,tune:f64,ring:u32,rr:f64,rl:f64,rt:f64,sc:f64,ss:f64,at:f64,until:f64)->u32{let Some(p)=p.as_mut()else{return 0;};if !now.is_finite()||now<0.||now.fract()!=0.||now>9007199254740864.||ring>1{return 0;}p.engine.on(key,Note{id,spec:0,midi,velocity,gain,tune,ring:ring!=0,roll:[rr,rl,rt],slide:[sc,ss]},owner,now as u64,if at.is_nan(){None}else{Some(at)},if until.is_nan(){None}else{Some(until)}) as u32}
#[no_mangle]pub unsafe extern "C" fn iowa_live_off(p:*mut Host,id:u32,owner:u32){if let Some(p)=p.as_mut(){p.engine.off(id,owner);}}
#[no_mangle]pub unsafe extern "C" fn iowa_live_cancel(p:*mut Host,owner:u32){if let Some(p)=p.as_mut(){p.engine.cancel(owner);}}
#[no_mangle]pub unsafe extern "C" fn iowa_live_reset(p:*mut Host){if let Some(p)=p.as_mut(){p.engine.reset();}}
#[no_mangle]pub unsafe extern "C" fn iowa_live_render(p:*mut Host,frame:f64)->u32{let Some(p)=p.as_mut()else{return 0;};if !frame.is_finite()||frame<0.||frame.fract()!=0.||frame>9007199254740864.{return 0;}p.engine.render(frame as u64,&mut p.output) as u32}
#[no_mangle]pub unsafe extern "C" fn iowa_live_output(p:*mut Host)->*const f32{p.as_ref().map(|p|p.output.as_ptr() as *const f32).unwrap_or(std::ptr::null())}
#[no_mangle]pub unsafe extern "C" fn iowa_live_stat(p:*const Host,id:u32)->f64{p.as_ref().map(|p|p.engine.stat(id)).unwrap_or(f64::NAN)}
