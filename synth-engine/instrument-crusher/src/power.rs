//! Restricted translation of pinned fdlibm::pow(.75,y), y in[1,16].
//! Sun1993/V8/Chromium notices and verbatim source excerpt shipped beside crate.
//! x=.75 normalizes to1.5 exactly: ss,u,s_h,s_l,r,p_h,p_l,z_h are zero.
//! Preserve ALL remaining source split-log/exponent steps, no fused operations.
fn hi(v:f64)->i32{(v.to_bits()>>32)as i32}
fn set_hi(v:f64,h:i32)->f64{f64::from_bits((v.to_bits()&0xffff_ffff)|((h as u32 as u64)<<32))}
fn clear_low(v:f64)->f64{f64::from_bits(v.to_bits()&0xffff_ffff_0000_0000)}
pub fn pow075(y:f64)->f64{
 if !y.is_finite()||!(1. ..=16.).contains(&y){return f64::NAN;}
 if y==1.{return 0.75;}if y==2.{return 0.75*0.75;}
 let dp_h=5.84962487220764160156e-1;let dp_l=1.35003920212974897128e-8;
 let t1=clear_low(dp_l+dp_h-1.);let t2=dp_l-(((t1+1.)-dp_h)-0.);
 let y1=clear_low(y);let p_l=(y-y1)*t1+y*t2;let mut p_h=y1*t1;
 let z=p_l+p_h;let j=hi(z);let i=j&0x7fffffff;let mut k=(i>>20)-0x3ff;let mut n=0;
 if i>0x3fe00000{n=j+(0x00100000>>(k+1));k=((n&0x7fffffff)>>20)-0x3ff;let t=set_hi(0.,n&!(0x000fffff>>k));n=((n&0x000fffff)|0x00100000)>>(20-k);if j<0{n=-n;}p_h-=t;}
 let t=clear_low(p_l+p_h);let u=t*6.93147182464599609375e-1;let v=(p_l-(t-p_h))*6.93147180559945286227e-1+t*(-1.90465429995776804525e-9);
 let mut z=u+v;let w=v-(z-u);let t=z*z;
 let t1=z-t*(1.66666666666666019037e-1+t*(-2.77777777770155933842e-3+t*(6.61375632143793436117e-5+t*(-1.65339022054652515390e-6+t*4.13813679705723846039e-8))));
 let r=(z*t1)/((t1-2.)-(w+z*w));z=1.-(r-z);set_hi(z,hi(z).wrapping_add(n.wrapping_shl(20)))
}
