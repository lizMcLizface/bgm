// Calibration of printed-panel readings against the factory memory of the same programs: a
// per-control straight line, reading → value, fitted where the memory is on hand. Only the line's
// two coefficients are kept; no factory value is copied into a sound. A control is calibrated
// when the fit is trustworthy: enough programs agree with it, its slope is plausible, and it
// clearly beats the plain reading. Otherwise the reading stands.

const line=(xs,ys)=>{
 const n=xs.length,mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0;
 for(let i=0;i<n;i++){sxy+=(xs[i]-mx)*(ys[i]-my);sxx+=(xs[i]-mx)**2;}
 const a=sxx>1e-9?sxy/sxx:1;return [a,my-a*mx];
};
const mae=(xs,ys,[a,b])=>xs.reduce((s,x,i)=>s+Math.abs(ys[i]-(a*x+b)),0)/xs.length;

/**
 * pairs: {control: [[reading, memory], ...]} on a 0–1 scale. flat: controls allowed a shallow slope. Returns {control: {a, b, kept, before, after}}
 * for the controls worth calibrating, and the rest with their reason under `skipped`.
 */
export function fitCalibration(pairs,{outlier=.25,minKept=30,slope=[.5,1.7],gain=.7,flat=[]}={}){
 const out={},skipped={};
 for(const [key,list] of Object.entries(pairs)){
  const xs=list.map(p=>p[0]),ys=list.map(p=>p[1]);
  let fit=line(xs,ys);
  // one pass of outlier rejection: drawings that are simply wrong (another program's marks, a slip)
  const keep=xs.map((x,i)=>Math.abs(ys[i]-(fit[0]*x+fit[1]))<outlier);
  const kx=xs.filter((_,i)=>keep[i]),ky=ys.filter((_,i)=>keep[i]);
  if(kx.length<minKept){skipped[key]=`only ${kx.length} programs agree`;continue;}
  fit=line(kx,ky);
  const before=mae(kx,ky,[1,0]),after=mae(kx,ky,fit);
  // `flat` controls may calibrate with a shallow slope: the drawing's scatter does not predict the memory,
  // which sits near one setting (a fine-tune knob near centre), so the line pulls readings towards it
  if((fit[0]<slope[0]&&!(flat.includes(key)&&fit[0]>=0))||fit[0]>slope[1]){skipped[key]=`slope ${fit[0].toFixed(2)}: the reading and the memory do not track`;continue;}
  if(after>gain*before){skipped[key]=`no clear gain (${before.toFixed(3)} → ${after.toFixed(3)})`;continue;}
  out[key]={a:+fit[0].toFixed(3),b:+fit[1].toFixed(3),kept:kx.length,before:+before.toFixed(3),after:+after.toFixed(3)};
 }
 return {controls:out,skipped};
}

/** A reading through its calibration line, clamped to 0–1 and kept on the reading's own grid. */
export function calibrate(values,controls,grid=.05){
 const out={...values};
 for(const [key,{a,b}] of Object.entries(controls))if(typeof out[key]==='number')out[key]=+Math.min(1,Math.max(0,Math.round((a*out[key]+b)/grid)*grid)).toFixed(2);
 return out;
}
