//! Literal TailFrame policy from pinned Chromium Biquad::TailFrame.
//! Original1/32768 maximum tail amplitude,max30seconds and Illinois root finder.
//! See rack-native/CHROMIUM_NOTICES.txt and CHROMIUM_PROFILE.json.
pub fn tail_frame(c:[f64;5],max_frame:f64)->f64{
 let[b0,b1,b2,a1,a2]=c;if c.iter().any(|x|!x.is_finite()){return 0.;}let eps:f64=1./32768.;let discrim=a1*a1-4.*a2;
 let tail=if discrim>0.{let plus=(-a1+discrim.sqrt())/2.;let minus=(-a1-discrim.sqrt())/2.;let r1=if plus.abs()>=minus.abs(){plus}else{minus};let r2=a2/r1;let c1=(b0*r1*r1+b1*r1+b2)/(r2-r1);let c2=(b0*r2*r2+b1*r2+b2)/(r2-r1);(1.+(eps/(c1.abs()+c2.abs())).ln()/r1.abs().ln()).max(0.)
 }else if discrim<0.{let x=-a1/2.;let y=(-discrim).sqrt()/2.;let r=x.hypot(y);if r==1.{max_frame}else{let re=b0*(x*x-y*y)+b1*x+b2;let im=2.*b0*x*y+b1*y;let c1=re.hypot(im)/(2.*y.abs());let c2=c1;if c1==0.&&c2==0.{0.}else{1.+(eps/(c1+c2)).ln()/r.ln()}}
 }else{let r=-a1/2.;if r==0.{2.}else if r.abs()>=1.{f64::INFINITY}else{let c1=(b0*r*r+b1*r+b2)/(r*r);let c2=b1*r+2.*b2;if c1==0.&&c2==0.{0.}else{let log_r=r.abs().ln();let low=(-(1.+log_r)/log_r).clamp(1.,max_frame-1.);let high=max_frame;let log_eps=eps.ln();let f_low=response(low,c1,c2,r,log_eps);let f_high=response(high,c1,c2,r,log_eps);if f_low<=0.{0.}else if f_high>=0.{high}else{root(low,high,f_low,f_high,log_eps,c1,c2,r)}}}};
 tail.clamp(0.,max_frame)
}
fn response(n:f64,c1:f64,c2:f64,r:f64,log_eps:f64)->f64{(n-2.)*r.abs().ln()+(c1*(n+1.)*r*r+c2).abs().ln()-log_eps}
fn root(mut low:f64,mut high:f64,mut f_low:f64,mut f_high:f64,log_eps:f64,c1:f64,c2:f64,r:f64)->f64{let mut side=0;let mut root=0.;for _ in 0..10{root=(f_low*high-f_high*low)/(f_low-f_high);if (high-low).abs()<0.5*(high+low).abs(){break;}let fr=response(root,c1,c2,r,log_eps);if fr*f_high>0.{high=root;f_high=fr;side=-1;}else if f_low*fr>0.{low=root;f_low=fr;if side==1{f_high/=2.;}side=1;}else{break;}}root}
#[derive(Clone,Copy,Default)]pub struct Activity{pub last_non_silent_time:f64,pub tail_time:f64}
impl Activity{pub fn process(&self,silent:bool,frame:u64,rate:f64)->bool{!silent||!(self.last_non_silent_time+self.tail_time<(frame as f64/rate))}pub fn finish(&mut self,silent_input:bool,frame:u64,rate:f64,tail:Option<f64>){if !silent_input{self.last_non_silent_time=(frame+128)as f64/rate;}if let Some(t)=tail{self.tail_time=t/rate;}}}
