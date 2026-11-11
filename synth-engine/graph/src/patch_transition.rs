//! Bounded live Core/FM control interpolation and structural output fade.
//! Mirrors the legacy host schedule; preparation allocates, tick/mix never do.
const ROWS: usize = 512;
const QUEUE: usize = 32;
const CHANGES: usize = ROWS * (QUEUE + 1) + QUEUE + 1;
const MAX_FRAME: f64 = 9007199254736896.;
#[derive(Clone, Copy)]
struct Setting { scope: u32, index: u32, value: f64 }
#[derive(Clone, Copy, PartialEq)]
struct Performance { mode: u32, portamento: f64, always: bool }
#[derive(Clone, Copy)]
struct Row { setting: Setting, from: f64, discrete: bool, logarithmic: bool }
struct Slot { settings: Vec<Setting>, frame: u64, seconds: f64, performance: Performance, pending: bool }
struct Active { start: u64, next: u64, end: u64, mid: u64, switched: bool, structural: bool, performance: Performance }
pub struct Transition {
    fm: bool, rate: f64, values: Vec<Setting>, slots: Vec<Slot>, rows: Vec<Row>, incoming: Vec<Row>, active: Option<Active>,
    performance: Performance, output_gain: f64, stage: Vec<f64>, changes: Vec<[f64; 5]>, audio: Vec<f32>,
}
fn valid_frame(n: f64) -> bool { n.is_finite() && n >= 0. && n <= MAX_FRAME && n.fract() == 0. }
fn discrete(fm: bool, s: u32, i: u32) -> bool {
    if fm { match s { 0 => [0,1,2,4,6,13,49].contains(&i) || (29..=40).contains(&i) && (i-29)%3 != 2,
        1 => [16,17,21].contains(&(i%32)), _ => false } }
    else if s == 0 { [0,1,2].contains(&i) }
    else { [0,1,11,44,48,52,53,54,58,94,99].contains(&i) || (74..=85).contains(&i) && (i-74)%3 != 2 }
}
fn logarithmic(fm: bool, s: u32, i: u32) -> bool {
    if fm { match s { 0 => [10,16,19,20,22,26,28,43,51].contains(&i), 1 => [0,1,4,5,7,10].contains(&(i%32)), _ => false } }
    else if s == 0 { i == 9 } else { [9,12,17,18,20,21,22,24,25,35,45,65,66,68,72,88,96].contains(&i) }
}
impl Transition {
    fn new(fm: bool, rate: f64, performance: Performance) -> Self {
        let slots = (0..QUEUE).map(|_| Slot { settings: Vec::with_capacity(ROWS), frame: 0, seconds: 0., performance, pending: false }).collect();
        Self { fm, rate, values: Vec::with_capacity(ROWS), slots, rows: Vec::with_capacity(ROWS), incoming: Vec::with_capacity(ROWS), active: None,
            performance, output_gain: 1., stage: vec![0.; ROWS*3], changes: Vec::with_capacity(CHANGES), audio: vec![0.; 4096] }
    }
    fn valid_setting(&self, s: f64, i: f64, v: f64) -> bool {
        if !s.is_finite() || s.fract()!=0. || !i.is_finite() || i.fract()!=0. || s<0. || i<0. || !v.is_finite() || !(v as f32).is_finite() { return false; }
        if self.fm { match s as u32 { 0 => i<60., 1 => i<256. && (i as u32)%32<22,
            2 => i<64. && ((i as u32)/8<(i as u32)%8 || v==0.), 3 => i<8., _ => false } }
        else { s<=2. && i<if s==0. {12.} else {116.} }
    }
    fn valid_stage(&self, n: usize) -> bool {
        n<=ROWS && (0..n).all(|at| { let r=&self.stage[at*3..at*3+3]; self.valid_setting(r[0],r[1],r[2]) &&
            (0..at).all(|j|self.stage[j*3]!=r[0] || self.stage[j*3+1]!=r[1]) })
    }
    fn staged(&self, at: usize) -> Setting { Setting { scope: self.stage[at*3] as u32, index: self.stage[at*3+1] as u32, value: self.stage[at*3+2] } }
    fn seed(&mut self, n: usize) -> bool {
        if !self.valid_stage(n) { return false; }
        self.values.clear(); for at in 0..n { let s=self.staged(at); self.values.push(s); } true
    }
    fn schedule(&mut self, n: usize, frame: f64, seconds: f64, performance: Performance) -> bool {
        if !self.valid_stage(n) || !valid_frame(frame) || !seconds.is_finite() || !(0. ..=2.).contains(&seconds) { return false; }
        let frame=frame as u64;
        let Some(index)=self.slots.iter().position(|s|s.pending&&s.frame==frame).or_else(||self.slots.iter().position(|s|!s.pending)) else { return false; };
        let s=&mut self.slots[index]; s.settings.clear();
        for at in 0..n { s.settings.push(Setting { scope:self.stage[at*3] as u32,index:self.stage[at*3+1] as u32,value:self.stage[at*3+2] }); }
        s.frame=frame; s.seconds=if seconds==0. {0.} else {seconds.max(0.016)}; s.performance=performance; s.pending=true; true
    }
    fn apply(&mut self, s: Setting) {
        self.changes.push([s.scope as f64,s.index as f64,s.value,0.,0.]);
        if let Some(old)=self.values.iter_mut().find(|v|v.scope==s.scope&&v.index==s.index) { *old=s; }
        else { self.values.push(s); }
    }
    fn apply_performance(&mut self, p: Performance, frame: u64) {
        self.changes.push([4.,p.mode as f64,p.portamento,frame as f64,p.always as u32 as f64]); self.performance=p;
    }
    fn update(&mut self, frame: u64) {
        let Some(a)=self.active.as_ref() else { return; };
        let t=((frame as f64-a.start as f64)/(a.end-a.start) as f64).clamp(0.,1.); let ease=t*t*(3.-2.*t);
        let switch=!a.switched&&frame>=a.mid; let perf=a.performance;
        for at in 0..self.rows.len() { let r=self.rows[at];
            if r.discrete { if switch { self.apply(r.setting); } }
            else { let value=if t==1. {r.setting.value} else if r.logarithmic {(r.from.ln()+(r.setting.value.ln()-r.from.ln())*ease).exp()} else {r.from+(r.setting.value-r.from)*ease}; self.apply(Setting{value,..r.setting}); }
        }
        if switch { self.apply_performance(perf,frame); self.active.as_mut().unwrap().switched=true; }
        if t==1. { self.active=None; }
    }
    fn pending_frame(&self) -> Option<u64> { self.slots.iter().filter(|s|s.pending).map(|s|s.frame).min() }
    fn tick(&mut self, frame: u64) {
        self.changes.clear();
        if self.active.as_ref().is_some_and(|a|frame>=a.next||frame>=a.end||(!a.switched&&frame>=a.mid)||self.pending_frame().is_some_and(|f|f<=frame)) {
            self.update(frame); if let Some(a)=self.active.as_mut() { a.next=a.start+((frame-a.start)/16+1)*16; }
        }
        while let Some(index)=self.slots.iter().enumerate().filter(|(_,s)|s.pending&&s.frame<=frame).min_by_key(|(_,s)|s.frame).map(|(i,_)|i) {
            self.incoming.clear(); let slot=&self.slots[index];
            for &s in &slot.settings { let from=self.values.iter().find(|v|v.scope==s.scope&&v.index==s.index).map_or(s.value,|v|v.value);
                if from!=s.value { self.incoming.push(Row { setting:s, from, discrete:discrete(self.fm,s.scope,s.index)||(self.fm&&s.scope==1&&s.index%32==1&&(from==0.||s.value==0.)), logarithmic:from>0.&&s.value>0.&&logarithmic(self.fm,s.scope,s.index) }); }
            }
            let perf=slot.performance; let seconds=slot.seconds; self.slots[index].pending=false;
            let perf_changed=perf!=self.performance; let structural=self.incoming.iter().any(|r|r.discrete)||perf.mode!=self.performance.mode;
            if self.incoming.is_empty()&&!perf_changed { continue; }
            if seconds==0. { for at in 0..self.incoming.len() { self.apply(self.incoming[at].setting); } if perf_changed {self.apply_performance(perf,frame);} self.performance=perf; self.active=None; }
            else { std::mem::swap(&mut self.rows,&mut self.incoming); let end=frame+(seconds*self.rate).round().max(2.) as u64; self.active=Some(Active { start:frame,next:frame+16,end,mid:((frame+end) as f64/2.).round() as u64,switched:false,structural,performance:perf }); }
        }
    }
    fn span(&self, frame: u64, count: u32) -> u32 {
        let mut n=count as u64; if let Some(f)=self.pending_frame() { n=n.min(f.saturating_sub(frame).max(1)); }
        if let Some(a)=&self.active { n=n.min(a.next.saturating_sub(frame).max(1)).min(a.end.saturating_sub(frame)); if !a.switched { n=n.min(a.mid.saturating_sub(frame).max(1)); } } n.max(1) as u32
    }
    fn mix(&mut self, frame: u64, n: usize) {
        let duration=(self.rate*0.004).max(1.); let step=1./duration;
        for at in 0..n { let target=self.active.as_ref().filter(|a|a.structural).map_or(1.,|a|(((frame+at as u64) as f64-a.mid as f64).abs()/duration).min(1.));
            self.output_gain+=(target-self.output_gain).clamp(-step,step);
            self.audio[at]=(self.audio[at] as f64*self.output_gain) as f32; self.audio[2048+at]=(self.audio[2048+at] as f64*self.output_gain) as f32;
        }
    }
    fn clear(&mut self) { for s in &mut self.slots {s.pending=false;} self.active=None; self.output_gain=1.; }
}
fn performance(mode: u32, portamento: f64, always: u32) -> Option<Performance> {
    (mode<=2&&portamento.is_finite()&&(0. ..=3.).contains(&portamento)&&always<=1).then_some(Performance{mode,portamento,always:always!=0})
}
#[no_mangle] pub extern "C" fn patch_transition_api()->u32 {1}
#[no_mangle] pub extern "C" fn patch_transition_new(fm:u32,rate:f64,mode:u32,portamento:f64,always:u32)->*mut Transition {
    let Some(p)=performance(mode,portamento,always) else{return std::ptr::null_mut();};
    if fm>1||!rate.is_finite()||!(8000. ..=192000.).contains(&rate){return std::ptr::null_mut();} Box::into_raw(Box::new(Transition::new(fm!=0,rate,p)))
}
#[no_mangle] pub unsafe extern "C" fn patch_transition_free(p:*mut Transition){if !p.is_null(){drop(Box::from_raw(p));}}
#[no_mangle] pub unsafe extern "C" fn patch_transition_stage(p:*mut Transition)->*mut f64 {p.as_mut().map_or(std::ptr::null_mut(),|p|p.stage.as_mut_ptr())}
#[no_mangle] pub unsafe extern "C" fn patch_transition_seed(p:*mut Transition,n:u32)->u32 {p.as_mut().is_some_and(|p|p.seed(n as usize)) as u32}
#[no_mangle] pub unsafe extern "C" fn patch_transition_schedule(p:*mut Transition,n:u32,frame:f64,seconds:f64,mode:u32,portamento:f64,always:u32)->u32 {
    let Some(perf)=performance(mode,portamento,always) else{return 0;}; p.as_mut().is_some_and(|p|p.schedule(n as usize,frame,seconds,perf)) as u32
}
#[no_mangle] pub unsafe extern "C" fn patch_transition_tick(p:*mut Transition,frame:f64)->u32 {let Some(p)=p.as_mut() else{return 0;};if !valid_frame(frame){return 0;}p.tick(frame as u64);1}
#[no_mangle] pub unsafe extern "C" fn patch_transition_changes(p:*const Transition)->*const f64 {p.as_ref().map_or(std::ptr::null(),|p|p.changes.as_ptr() as *const f64)}
#[no_mangle] pub unsafe extern "C" fn patch_transition_count(p:*const Transition)->u32 {p.as_ref().map_or(0,|p|p.changes.len() as u32)}
#[no_mangle] pub unsafe extern "C" fn patch_transition_span(p:*const Transition,frame:f64,n:u32)->u32 {if !valid_frame(frame)||n==0||n>2048{return 0;}p.as_ref().map_or(0,|p|p.span(frame as u64,n))}
#[no_mangle] pub unsafe extern "C" fn patch_transition_audio(p:*mut Transition)->*mut f32 {p.as_mut().map_or(std::ptr::null_mut(),|p|p.audio.as_mut_ptr())}
#[no_mangle] pub unsafe extern "C" fn patch_transition_mix(p:*mut Transition,frame:f64,n:u32)->u32 {let Some(p)=p.as_mut() else{return 0;};if !valid_frame(frame)||n>2048{return 0;}p.mix(frame as u64,n as usize);1}
#[no_mangle] pub unsafe extern "C" fn patch_transition_clear(p:*mut Transition){if let Some(p)=p.as_mut(){p.clear();}}
