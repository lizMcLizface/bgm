//! Original native Biquad formulas, with the Mixer-proven Float32 pow10 boundary.
//! A changed native filter type resets histories (BiquadFilterHandler::SetType).
//! Derived from the accepted piano-live helper; that source is not modified.
//! Explicit original native Biquad formulas. BSD attribution/profile sources
//! are recorded in CHROMIUM_NOTICES.txt and CHROMIUM_PROFILE.json.
#[derive(Clone,Copy)]
pub struct Biquad{c:[f64;5],history:[[f64;4];2],key:[f64;4]}
impl Default for Biquad{fn default()->Self{Self{c:[1.,0.,0.,0.,0.],history:[[0.;4];2],key:[f64::NAN;4]}}}
fn pow10(value:f64)->f64{((value*std::f64::consts::LN_10)as f32).exp()as f64}
fn coefficients(kind:u32,frequency:f64,q:f64,gain:f64)->[f64;5]{
    let f=frequency.clamp(0.,1.);let theta=std::f64::consts::PI*f;let k=theta.cos();let sine=theta.sin();let a=pow10(gain/40.);
    let tuple=match kind{
        0|1=>{if f==0.{if kind==0{[0.,0.,0.,1.,0.,0.]}else{[1.,0.,0.,1.,0.,0.]}}else if f==1.{if kind==0{[1.,0.,0.,1.,0.,0.]}else{[0.,0.,0.,1.,0.,0.]}}else{let alpha=sine/(2.*pow10(q/20.));let beta=if kind==0{(1.-k)/2.}else{(1.+k)/2.};[beta,if kind==0{2.*beta}else{-2.*beta},beta,1.+alpha,-2.*k,1.-alpha]}},
        2|3|4=>{if f==0.||f==1.{if kind==2{[0.,0.,0.,1.,0.,0.]}else{[1.,0.,0.,1.,0.,0.]}}else if q==0.{if kind==2{[1.,0.,0.,1.,0.,0.]}else if kind==3{[0.,0.,0.,1.,0.,0.]}else{[a*a,0.,0.,1.,0.,0.]}}else{let alpha=sine/(2.*q);match kind{2=>[alpha,0.,-alpha,1.+alpha,-2.*k,1.-alpha],3=>[1.,-2.*k,1.,1.+alpha,-2.*k,1.-alpha],_=>[1.+alpha*a,-2.*k,1.-alpha*a,1.+alpha/a,-2.*k,1.-alpha/a]}}},
        5|6=>{if f==0.||f==1.{let level=if (kind==5&&f==1.)||(kind==6&&f==0.){a*a}else{1.};[level,0.,0.,1.,0.,0.]}else{let alpha=0.5*sine*2f64.sqrt();let k2=2.*a.sqrt()*alpha;let plus=a+1.;let minus=a-1.;if kind==5{[a*(plus-minus*k+k2),2.*a*(minus-plus*k),a*(plus-minus*k-k2),plus+minus*k+k2,-2.*(minus+plus*k),plus+minus*k-k2]}else{[a*(plus+minus*k+k2),-2.*a*(minus+plus*k),a*(plus+minus*k-k2),plus-minus*k+k2,2.*(minus-plus*k),plus-minus*k-k2]}}},
        _=>[1.,0.,0.,1.,0.,0.],
    };let inverse=1./tuple[3];[tuple[0]*inverse,tuple[1]*inverse,tuple[2]*inverse,tuple[4]*inverse,tuple[5]*inverse]
}
impl Biquad{
 pub fn sample(&mut self,input:[f32;2],channels:usize,kind:u32,hz:f64,q:f64,gain:f64,sr:f64)->[f32;2]{
  let key=[kind as f64,hz,q,gain];if self.key[0].is_finite()&&self.key[0]!=kind as f64{self.clear();}if key!=self.key{self.c=coefficients(kind,hz/(sr/2.),q,gain);self.key=key;}
  let[b0,b1,b2,a1,a2]=self.c;let mut output=[0.;2];for ch in 0..channels{let h=&mut self.history[ch];let x=input[ch]as f64;let y=(b0*x+b1*h[0]+b2*h[1]-a1*h[2]-a2*h[3])as f32;h[1]=h[0];h[0]=x;h[3]=h[2];h[2]=y as f64;output[ch]=y;}output
 }
 pub fn clear(&mut self){self.history=[[0.;4];2];}
 pub fn end_quantum(&mut self){for ch in &mut self.history{for value in ch{if value.abs()<f32::MIN_POSITIVE as f64{*value=0.;}}}}
}
