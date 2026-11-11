//! Owned classic backends, including per-instance vector/wavetable resources.
//! Existing legacy entry points remain intact under their feature boundary.
use crate::dsp::{soft, DcBlock, MAX_BLOCK};
use crate::*;
use crate::{cs80, drums, dsp, dx7, fx, juno, jupiter, minimoog, obxa, prophet, tb303,vs,wt};

enum Core {
    Cs80(cs80::Cs80),
    Juno(juno::Juno),
    Prophet(prophet::Prophet),
    Jupiter(jupiter::Jupiter8),
    Mini(minimoog::Minimoog),
    Dx7(dx7::Dx7),
    Obxa(obxa::ObXa2),
    Drums(drums::Drums),
    Bass(tb303::Tb303),
    Vector(vs::Vs,Box<vs::Resources>),
    Wavetable(wt::Wt,Box<wt::Resources>),
}
macro_rules! call {
    ($c:expr,$m:ident=>$body:expr) => {
        match $c {
            Core::Cs80($m) => $body,
            Core::Juno($m) => $body,
            Core::Prophet($m) => $body,
            Core::Jupiter($m) => $body,
            Core::Mini($m) => $body,
            Core::Dx7($m) => $body,
            Core::Obxa($m) => $body,
            Core::Drums($m) => $body,
            Core::Bass($m) => $body,
            Core::Vector($m,_) => $body,
            Core::Wavetable($m,_) => $body,
        }
    };
}
fn buffers() -> Box<fx::Buffers> {
    // All fields are fixed arrays of floats. Allocate their valid all-zero value
    // directly on the heap; avoid a ~640 KiB constructor temporary on the stack.
    unsafe {
        let layout = std::alloc::Layout::new::<fx::Buffers>();
        let p = std::alloc::alloc_zeroed(layout) as *mut fx::Buffers;
        if p.is_null() {
            std::alloc::handle_alloc_error(layout);
        }
        Box::from_raw(p)
    }
}
pub struct Engine {
    sr: f32,
    model: u32,
    core: Core,
    buffers: Box<fx::Buffers>,
    bbd: fx::Bbd,
    space: fx::Space,
    dc: [DcBlock; 2],
    left: [f32; MAX_BLOCK],
    right: [f32; MAX_BLOCK],
    frame: u64,
    peak: f32,
}
impl Engine {
    pub fn new(sr: f32, model: u32) -> Option<Box<Self>> {
        if !sr.is_finite() || !(8000. ..=192000.).contains(&sr) {
            return None;
        }
        let core = match model {
            MODEL_CS80 => Core::Cs80(cs80::Cs80::new()),
            MODEL_JUNO => Core::Juno(juno::Juno::new()),
            MODEL_PROPHET => Core::Prophet(prophet::Prophet::new()),
            MODEL_JUPITER => Core::Jupiter(jupiter::Jupiter8::new()),
            MODEL_MINIMOOG => Core::Mini(minimoog::Minimoog::new()),
            MODEL_DX7 => Core::Dx7(dx7::Dx7::new()),
            MODEL_OBXA => Core::Obxa(obxa::ObXa2::new()),
            MODEL_TR808 | MODEL_TR909 | MODEL_TR606 | MODEL_TR707 => {
                Core::Drums(drums::Drums::new())
            }
            MODEL_TB303 => Core::Bass(tb303::Tb303::new()),
            MODEL_VS => Core::Vector(vs::Vs::new(),vs::Resources::boxed()),
            MODEL_WT => Core::Wavetable(wt::Wt::new(),wt::Resources::boxed()),
            _ => return None,
        };
        let mut s = Box::new(Self {
            sr,
            model,
            core,
            buffers: buffers(),
            bbd: fx::Bbd::new(),
            space: fx::Space::new(),
            dc: [DcBlock::ZERO; 2],
            left: [0.; MAX_BLOCK],
            right: [0.; MAX_BLOCK],
            frame: 0,
            peak: 0.,
        });
        s.reset();
        Some(s)
    }
    pub fn reset(&mut self) {
        match &mut self.core {
            Core::Cs80(m) => {*m=cs80::Cs80::new();m.init(self.sr);},
            Core::Juno(m) => {*m=juno::Juno::new();m.init(self.sr);},
            Core::Prophet(m) => {*m=prophet::Prophet::new();m.init(self.sr);},
            Core::Jupiter(m) => {*m=jupiter::Jupiter8::new();m.init(self.sr);},
            Core::Mini(m) => {*m=minimoog::Minimoog::new();m.init(self.sr);},
            Core::Dx7(m) => {*m=dx7::Dx7::new();m.init(self.sr);},
            Core::Obxa(m) => {*m=obxa::ObXa2::new();m.init(self.sr);},
            Core::Bass(m) => {*m=tb303::Tb303::new();m.init(self.sr);},
            Core::Vector(m,_) => {*m=vs::Vs::new();m.init(self.sr);},
            Core::Wavetable(m,r) => {*m=wt::Wt::new();m.init_with(self.sr,r);},
            Core::Drums(m) => {*m=drums::Drums::new();m.init(
                self.sr,
                match self.model {
                    MODEL_TR909 => drums::STYLE_909,
                    MODEL_TR606 => drums::STYLE_606,
                    MODEL_TR707 => drums::STYLE_707,
                    _ => drums::STYLE_808,
                },
            );},
        };
        self.bbd.init(self.sr);
        self.space.init(self.sr);
        self.space.clear(&mut self.buffers);
        self.dc = [DcBlock::ZERO; 2];
        self.left.fill(0.);
        self.right.fill(0.);
        self.frame = 0;
        self.peak = 0.;
    }
    pub fn parameter_count(&self) -> usize {
        match self.model {
            MODEL_CS80 => cs80::PARAMS,
            MODEL_JUNO => juno::PARAMS,
            MODEL_PROPHET => prophet::PARAMS,
            MODEL_JUPITER => jupiter::PAIR_PARAMS,
            MODEL_MINIMOOG => minimoog::PARAMS,
            MODEL_DX7 => dx7::PARAMS,
            MODEL_OBXA => obxa::PAIR_PARAMS,
            MODEL_TB303 => tb303::PARAMS,
            MODEL_VS => vs::PARAMS,
            MODEL_WT => wt::PARAMS,
            _ => drums::PARAMS,
        }
    }
    pub fn param(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        if id >= FX_BASE {
            if id - FX_BASE >= fx::PARAMS as u32 {
                return false;
            }
            self.space.set((id - FX_BASE) as usize, value);
        } else if id >= SHAPE_BASE {
            let i = (id - SHAPE_BASE) as usize;
            if i >= dsp::SHAPE_PARAMS {
                return false;
            }
            match &mut self.core {
                Core::Cs80(m) => m.set_shape(i, value),
                Core::Juno(m) => m.set_shape(i, value),
                Core::Prophet(m) => m.set_shape(i, value),
                Core::Jupiter(m) => m.set_shape(i, value),
                Core::Mini(m) => m.set_shape(i, value),
                Core::Obxa(m) => m.set_shape(i, value),
                Core::Wavetable(m,_) => m.set_shape(i,value),
                _ => return false,
            };
        } else {
            if id as usize >= self.parameter_count() {
                return false;
            }
            call!(&mut self.core,m=>m.set(id as usize,value));
        }
        true
    }
    pub fn note_on(&mut self, key: u32, note: f32, velocity: f32) -> bool {
        if key == 0
            || !note.is_finite()
            || !(0. ..=127.).contains(&note)
            || !velocity.is_finite()
            || !(0. ..=1.).contains(&velocity)
        {
            return false;
        }
        call!(&mut self.core,m=>m.note_on(key,note,velocity));
        true
    }
    pub fn note_off(&mut self, key: u32) -> bool {
        if key == 0 {
            return false;
        }
        call!(&mut self.core,m=>m.note_off(key));
        true
    }
    pub fn pressure(&mut self, key: u32, value: f32) -> bool {
        if key == 0 || !value.is_finite() || !(0. ..=1.).contains(&value) {
            return false;
        }
        call!(&mut self.core,m=>m.poly_pressure(key,value));
        true
    }
    pub fn control(&mut self, which: u32, value: f32) -> bool {
        if which > 6 || !value.is_finite() {
            return false;
        }
        call!(&mut self.core,m=>m.control(which,value));
        true
    }
    pub fn seq(&mut self, cmd: u32, a: u32, b: f32) -> bool {
        if cmd > 7 || !b.is_finite() {
            return false;
        }
        match &mut self.core {
            Core::Drums(m) => m.command(cmd, a, b),
            Core::Bass(m) => m.command(cmd, a, b),
            _ => return false,
        };
        true
    }
    pub fn panic(&mut self) {
        call!(&mut self.core,m=>m.panic());
        self.space.clear(&mut self.buffers);
        self.bbd.init(self.sr);
        self.dc = [DcBlock::ZERO; 2];
    }
    pub fn render(&mut self, n: usize) -> bool {
        if n > MAX_BLOCK {
            return false;
        }
        let (left, right) = (&mut self.left[..n], &mut self.right[..n]);
        match &mut self.core {Core::Vector(m,r)=>m.render_with(r,left,right),Core::Wavetable(m,r)=>m.render_with(r,left,right),Core::Cs80(m)=>m.render(left,right),Core::Juno(m)=>m.render(left,right),Core::Prophet(m)=>m.render(left,right),Core::Jupiter(m)=>m.render(left,right),Core::Mini(m)=>m.render(left,right),Core::Dx7(m)=>m.render(left,right),Core::Obxa(m)=>m.render(left,right),Core::Drums(m)=>m.render(left,right),Core::Bass(m)=>m.render(left,right),};
        if let Core::Juno(m) = &mut self.core {
            let (mode, noise) = m.chorus();
            self.bbd
                .render(&mut self.buffers.bbd, left, right, mode, noise);
        }
        self.space.render(&mut self.buffers, left, right);
        let r = 1. - 62.8 / self.sr;
        self.peak = 0.;
        for i in 0..n {
            let l = soft(self.dc[0].tick(left[i], r)).clamp(-1., 1.);
            let rr = soft(self.dc[1].tick(right[i], r)).clamp(-1., 1.);
            self.peak = self.peak.max(l.abs()).max(rr.abs());
            left[i] = l;
            right[i] = rr;
        }
        self.frame += n as u64;
        true
    }
    pub fn left(&self) -> &[f32] {
        &self.left
    }
    pub fn wave_ptr(&mut self)->*mut f32 {match &mut self.core {Core::Vector(_,r)=>r.raw.as_mut_ptr(),Core::Wavetable(_,r)=>r.raw.as_mut_ptr(),_=>std::ptr::null_mut()}}
    pub fn wave_len(&self)->usize {match &self.core {Core::Vector(..)=>vs::WAVES*vs::CYCLE,Core::Wavetable(..)=>wt::SLOTS*wt::CYCLE,_=>0}}
    pub fn wave_commit(&mut self)->bool {match &mut self.core {Core::Vector(_,r)=>{if r.raw.iter().any(|v|!v.is_finite()||v.abs()>64.){return false;}r.commit();r.prewarm();true},Core::Wavetable(_,r)=>{if r.raw.iter().any(|v|!v.is_finite()||v.abs()>64.){return false;}r.commit();true},_=>false}}
    pub fn joy_ptr(&self)->*const f32 {match &self.core {Core::Wavetable(m,_)=>m.trace.as_ptr(),_=>std::ptr::null()}}
    pub fn joy_info(&self,which:u32)->u32 {if !matches!(&self.core,Core::Wavetable(..)){return 0;}match which{0=>wt::VOICES as u32,1=>wt::TRACE_WIDTH as u32,_=>0}}
    pub fn right(&self) -> &[f32] {
        &self.right
    }
    pub fn stat(&self, index: u32) -> f64 {
        match index {
            0 => call!(&self.core,m=>m.active()) as f64,
            1 => call!(&self.core,m=>m.steals) as f64,
            2 => self.peak as f64,
            3 => self.frame as f64 / self.sr as f64,
            4 => self.frame as f64,
            7..=9 => match &self.core {Core::Wavetable(m,_)=>m.joy[(index-7)as usize]as f64,_=>0.},
            _ => 0.,
        }
    }
}
#[no_mangle]
pub extern "C" fn classic_owned_api() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn classic_owned_new(sr: f32, model: u32) -> *mut Engine {
    Engine::new(sr, model).map_or(std::ptr::null_mut(), Box::into_raw)
}
#[no_mangle]
pub unsafe extern "C" fn classic_owned_free(p: *mut Engine) {
    if !p.is_null() {
        drop(Box::from_raw(p));
    }
}
#[no_mangle]
pub extern "C" fn classic_owned_param(p: &mut Engine, id: u32, value: f32) -> u32 {
    (!p.param(id, value)) as u32
}
#[no_mangle]
pub extern "C" fn classic_owned_note(p: &mut Engine, kind: u32, key: u32, a: f32, b: f32) -> u32 {
    (!(match kind {
        0 => p.note_on(key, a, b),
        1 => p.note_off(key),
        2 => p.control(key, a),
        3 => p.pressure(key, a),
        4 => {
            p.panic();
            true
        }
        _ => false,
    })) as u32
}
#[no_mangle]
pub extern "C" fn classic_owned_seq(p: &mut Engine, cmd: u32, a: u32, b: f32) -> u32 {
    (!p.seq(cmd, a, b)) as u32
}
#[no_mangle]
pub extern "C" fn classic_owned_reset(p: &mut Engine) {
    p.reset();
}
#[no_mangle]
pub extern "C" fn classic_owned_render(p: &mut Engine, n: usize) -> u32 {
    (!p.render(n)) as u32
}
#[no_mangle]
pub extern "C" fn classic_owned_left(p: &Engine) -> *const f32 {
    p.left.as_ptr()
}
#[no_mangle]
pub extern "C" fn classic_owned_right(p: &Engine) -> *const f32 {
    p.right.as_ptr()
}
#[no_mangle]
pub extern "C" fn classic_owned_stat(p: &Engine, i: u32) -> f64 {
    p.stat(i)
}
#[no_mangle]pub extern "C" fn classic_owned_wave_ptr(p:&mut Engine)->*mut f32{p.wave_ptr()}
#[no_mangle]pub extern "C" fn classic_owned_wave_len(p:&Engine)->usize{p.wave_len()}
#[no_mangle]pub extern "C" fn classic_owned_wave_commit(p:&mut Engine)->u32{(!p.wave_commit())as u32}
#[no_mangle]pub extern "C" fn classic_owned_joy_ptr(p:&Engine)->*const f32{p.joy_ptr()}
#[no_mangle]pub extern "C" fn classic_owned_joy_info(p:&Engine,which:u32)->u32{p.joy_info(which)}
