// Runs the classic-synth kernel directly (no AudioWorklet): tests and audits.
export const MODELS={cs80:0,juno:1};
export function createOfflineSynth(module,{sampleRate=48000,model=MODELS.cs80,params=[]}={}){
 const k=new WebAssembly.Instance(module,{}).exports;
 if(!k.syn_init(sampleRate,model))throw Error('Unsupported model or sample rate');
 for(const [id,value] of params)k.syn_param(id,value);
 return {
  k,sampleRate,
  render(frames,chunk=128){
   const left=new Float32Array(frames),right=new Float32Array(frames);
   for(let at=0;at<frames;at+=chunk){const n=Math.min(chunk,frames-at);k.syn_render(n);left.set(new Float32Array(k.memory.buffer,k.syn_left(),n),at);right.set(new Float32Array(k.memory.buffer,k.syn_right(),n),at);}
   return [left,right];
  },
  seconds(s,chunk){return this.render(Math.round(s*sampleRate),chunk);},
 };
}
export const rms=a=>{let s=0;for(const x of a)s+=x*x;return Math.sqrt(s/Math.max(1,a.length));};
export const peak=a=>{let m=0;for(const x of a)m=Math.max(m,Math.abs(x));return m;};
/** Rough brightness: RMS of the first difference relative to the signal RMS. */
export const brightness=a=>{let d=0,s=0;for(let i=1;i<a.length;i++){d+=(a[i]-a[i-1])**2;s+=a[i]*a[i];}return Math.sqrt(d/Math.max(1e-30,s));};
/** Frequency from positive-going zero crossings (pure tones only). */
export function pitchHz(a,sampleRate){
 const crossings=[];for(let i=1;i<a.length;i++)if(a[i-1]<0&&a[i]>=0)crossings.push(i-a[i]/(a[i]-a[i-1]));
 return crossings.length<2?0:(crossings.length-1)*sampleRate/(crossings.at(-1)-crossings[0]);
}
