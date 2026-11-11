//! Dynamic message-store wrapper around the unchanged Iowa voice kernels.
//! Resource upload/reclamation is a control-message operation. The 128-frame
//! process path only traverses preallocated notes, slots and bookings.
use super::{Engine as Voices, Note, Spec, MAX_BYTES, QUANTUM};
const BANKS:usize=128;
const NOTES:usize=2000;
const BOOKINGS:usize=2000;
#[derive(Clone,Copy,Default)]
struct Bank { key:u32,visible:bool,order:u64,bytes:usize }
#[derive(Clone,Copy,Default)]
struct Booking { note:usize,owner:u32,at:f64 }
fn empty_note()->Note {Note{id:0,spec:0,midi:0.,velocity:0.,gain:0.,tune:1.,ring:false,roll:[0.;3],slide:[0.;2]}}
pub struct Engine {
    core:Voices,banks:Vec<Bank>,until:Vec<Option<f64>>,booked:Vec<Booking>,
    staging:Option<Voices>,store_order:u64,bytes:usize,frame:Option<u64>,
    rejected:u64,stores:u64,evictions:u64,skipped:u64,
}
impl Engine {
    pub fn new(rate:f64)->Option<Self>{
        if !rate.is_finite()||!(8000. ..=192000.).contains(&rate){return None;}
        let mut core=Voices::new(rate);core.configure(32);
        core.specs=(0..BANKS).map(|_|Spec::default()).collect();
        core.notes=(0..NOTES).map(|_|empty_note()).collect();core.ready=true;
        Some(Self{core,banks:vec![Bank::default();BANKS],until:vec![None;NOTES],booked:Vec::with_capacity(BOOKINGS),staging:None,store_order:0,bytes:0,frame:None,rejected:0,stores:0,evictions:0,skipped:0})
    }
    pub fn stage(&mut self,spec:Spec)->bool{
        if self.staging.is_some(){return false;}
        let mut v=Voices::new(self.core.rate);v.configure(1);
        if !v.spec(spec){return false;}self.staging=Some(v);true
    }
    pub fn data(&mut self,field:u32,data:&[f64])->bool{
        let Some(v)=&mut self.staging else{return false;};
        v.data(v.specs[0].id,field,data)
    }
    pub fn abort(&mut self){self.staging=None;}
    fn note_used(&self,index:usize)->bool{
        self.core.slots.iter().any(|s|s.note==Some(index)&&(s.alive||s.buffered))||self.booked.iter().any(|b|b.note==index)
    }
    // This function is never called from render: evicted immutable arrays are
    // reclaimed only while accepting a subsequent explicit control message.
    fn collect(&mut self){
        for i in 0..NOTES{if self.core.notes[i].id!=0&&!self.note_used(i){self.core.notes[i]=empty_note();self.until[i]=None;}}
        for i in 0..BANKS{if self.banks[i].key!=0&&!self.banks[i].visible&&!self.core.notes.iter().any(|n|n.id!=0&&n.spec==i){self.bytes-=self.banks[i].bytes;self.banks[i]=Bank::default();self.core.specs[i]=Spec::default();}}
    }
    pub fn commit(&mut self,key:u32)->bool{
        if key==0{return false;}
        let Some(mut staged)=self.staging.take() else{return false;};
        if !staged.prepare(){return false;}
        self.collect();let bytes=staged.bytes;
        if self.bytes.checked_add(bytes).is_none_or(|n|n>MAX_BYTES){self.rejected+=1;return false;}
        let Some(index)=self.banks.iter().position(|b|b.key==0)else{self.rejected+=1;return false;};
        // Match Map's eviction-before-set, including setting an existing key.
        if self.banks.iter().filter(|b|b.visible).count()>=96{
            let old=self.banks.iter().enumerate().filter(|(_,b)|b.visible).min_by_key(|(_,b)|b.order).unwrap().0;
            self.banks[old].visible=false;self.evictions+=1;
        }
        let prior=self.banks.iter().position(|b|b.visible&&b.key==key);
        self.store_order+=1;let order=prior.map(|p|self.banks[p].order).unwrap_or(self.store_order);
        if let Some(p)=prior{self.banks[p].visible=false;}
        self.core.specs[index]=staged.specs.pop().unwrap();
        self.banks[index]=Bank{key,visible:true,order,bytes};self.bytes+=bytes;self.stores+=1;true
    }
    pub fn on(&mut self,key:u32,mut note:Note,owner:u32,now:u64,at:Option<f64>,until:Option<f64>)->bool{
        if owner==0||note.id==0||!note.midi.is_finite()||!(0. ..=127.).contains(&note.midi)||!note.velocity.is_finite()||!(0. ..=1.).contains(&note.velocity)||[note.gain,note.tune,note.roll[0],note.roll[1],note.roll[2],note.slide[0],note.slide[1]].iter().any(|x|!x.is_finite())||!(0. ..=1024.).contains(&note.gain)||!(0.0625..=16.).contains(&note.tune)||!(0. ..=100.).contains(&note.roll[0])||!(0. ..=60.).contains(&note.roll[1])||!(0. ..=4.).contains(&note.roll[2])||note.slide[0].abs()>2400.||!(0. ..=30.).contains(&note.slide[1])||at.is_some_and(|x|!x.is_finite())||until.is_some_and(|x|!x.is_finite()){self.rejected+=1;return false;}
        self.collect();
        let Some(bank)=self.banks.iter().position(|b|b.visible&&b.key==key)else{self.rejected+=1;return false;};
        if note.roll[0]>0.&&!self.core.specs[bank].decay{self.rejected+=1;return false;}
        if self.core.notes.iter().any(|n|n.id==note.id){self.rejected+=1;return false;}
        let future=at.is_some_and(|x|x>now as f64/self.core.rate);
        if future&&self.booked.len()>=BOOKINGS{self.rejected+=1;return false;}
        let Some(index)=self.core.notes.iter().position(|n|n.id==0)else{self.rejected+=1;return false;};
        note.spec=bank;self.core.notes[index]=note;self.until[index]=until;
        if future{self.booked.push(Booking{note:index,owner,at:at.unwrap()});}else{self.core.note(0,self.core.notes[index].id,owner);}
        true
    }
    pub fn off(&mut self,id:u32,owner:u32){self.core.note(1,id,owner);}
    pub fn cancel(&mut self,owner:u32){self.booked.retain(|b|owner!=0&&b.owner!=owner);self.core.cancel(owner);}
    pub fn reset(&mut self){self.booked.clear();self.core.reset();self.frame=None;self.skipped=0;}
    pub fn render(&mut self,frame:u64,out:&mut [[f32;2];QUANTUM])->bool{
        if frame%QUANTUM as u64!=0||self.frame.is_some_and(|f|f>frame){return false;}
        // A disconnected or suspended native subgraph may not be pulled for
        // some context quanta. Original Iowa advances voice age only when
        // process actually runs; absolute seconds still govern bookings.
        if let Some(expected)=self.frame{self.skipped+=frame-expected;}
        let end=frame as f64/self.core.rate+QUANTUM as f64/self.core.rate;
        let mut i=0;while i<self.booked.len(){let b=self.booked[i];if b.at<end{self.core.note(0,self.core.notes[b.note].id,b.owner);self.booked.remove(i);}else{i+=1;}}
        for s in 0..self.core.slots.len(){let slot=&self.core.slots[s];if slot.alive{if let Some(n)=slot.note{if self.until[n].is_some_and(|u|u<end){let id=self.core.notes[n].id;let owner=slot.owner;self.core.note(1,id,owner);self.until[n]=None;}}}}
        self.core.render(frame,out);self.frame=Some(frame+QUANTUM as u64);true
    }
    pub fn stat(&self,id:u32)->f64{match id{8=>self.booked.len() as f64,9=>self.banks.iter().filter(|b|b.visible).count() as f64,10=>self.bytes as f64,11=>self.rejected as f64,12=>self.stores as f64,13=>self.evictions as f64,14=>self.core.seed as f64,15=>self.banks.iter().filter(|b|b.key!=0).count() as f64,16=>self.skipped as f64,_=>self.core.stat(id)}}
}
