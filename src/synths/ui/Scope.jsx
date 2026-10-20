import React,{useCallback,useEffect,useRef,useState} from 'react';
import {findTrigger,levels,pitchOf,noteName,spectrumDb,spectralPeak,wavBytes} from './scopeMath';
import {load,save} from '../storage';

// Oscilloscope and spectrum analyser on the synth's output (left and right averaged). The audio
// worklet keeps the last 1.3 s; this asks for a window about thirty times a second, finds the
// trigger and draws. Single shot: arm, play, and the first trigger after arming is captured and held.
const KEY='synths:scope';
const SPANS=[1,2,5,10,20,50,100,200,500]; // ms across the whole screen
const ZOOMS=[0,1,2,5,10,20,50,100,200,500]; // 0 = auto-fit to the signal
const PRE=.1;                              // fraction of the screen before the trigger point
const FFT=8192;
const DEFAULTS={view:'both',span:4,mode:'auto',level:.1,slope:1,zoom:0,hold:false,peakHold:false};
const FILL=.92; // full height of the screen is ±FILL of the half-height
const DB_MIN=-100,F_MIN=20,F_MAX=20000;

const fmtTime=ms=>Math.abs(ms)>=100?ms.toFixed(0)+' ms':Math.abs(ms)>=10?ms.toFixed(1)+' ms':ms.toFixed(2)+' ms';
const fmtHz=hz=>hz>=1000?(hz/1000).toFixed(hz>=10000?1:2)+' kHz':hz.toFixed(hz>=100?0:1)+' Hz';
const db=v=>v>1e-6?(20*Math.log10(v)).toFixed(1)+' dB':'−∞';

function fit(canvas){
 const dpr=Math.min(2,window.devicePixelRatio||1),w=canvas.clientWidth,h=canvas.clientHeight;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);return {g,w,h};
}

function drawScope(canvas,seg,cfg,cursor,rate){
 const {g,w,h}=fit(canvas);
 g.fillStyle='#0a0c0b';g.fillRect(0,0,w,h);
 g.strokeStyle='#1f2a24';g.lineWidth=1;g.beginPath();
 for(let i=1;i<10;i++){const x=Math.round(i*w/10)+.5;g.moveTo(x,0);g.lineTo(x,h);}
 for(let i=1;i<8;i++){const y=Math.round(i*h/8)+.5;g.moveTo(0,y);g.lineTo(w,y);}
 g.stroke();
 g.strokeStyle='#33463b';g.beginPath();g.moveTo(0,h/2+.5);g.lineTo(w,h/2+.5);g.moveTo(Math.round(w*PRE)+.5,0);g.lineTo(Math.round(w*PRE)+.5,h);g.stroke();
 const zoom=cfg.zoomEff||1,mid=h/2,scale=h/2*FILL*zoom;
 // trigger level marker
 const ty=mid-cfg.level*(h/2*FILL);
 g.strokeStyle='#e3a52a88';g.setLineDash([4,4]);g.beginPath();g.moveTo(0,ty);g.lineTo(w,ty);g.stroke();g.setLineDash([]);
 if(seg&&seg.length>1){
  g.strokeStyle='#7fe39a';g.lineWidth=1.6;g.lineJoin='round';g.beginPath();
  const n=seg.length;
  // one min/max pair per pixel column when there are far more samples than pixels
  if(n>w*2){
   let prev=mid;
   for(let px=0;px<w;px++){
    const a=Math.floor(px*n/w),b=Math.max(a+1,Math.floor((px+1)*n/w));let lo=Infinity,hi=-Infinity;
    for(let i=a;i<b;i++){const v=seg[i];if(v<lo)lo=v;if(v>hi)hi=v;}
    // one connected line: visit the nearer extreme first so the trace has no gaps
    const yl=mid-lo*scale,yh=mid-hi*scale,near=px&&Math.abs(prev-yl)<Math.abs(prev-yh);
    const first=near?yl:yh,second=near?yh:yl;
    if(px)g.lineTo(px+.5,first);else g.moveTo(px+.5,first);
    g.lineTo(px+.5,second);prev=second;
   }
  }else{
   for(let i=0;i<n;i++){const x=i*(w-1)/(n-1),y=mid-seg[i]*scale;if(i)g.lineTo(x,y);else g.moveTo(x,y);}
  }
  g.stroke();
  if(n<w/3){g.fillStyle='#7fe39a';for(let i=0;i<n;i++)g.fillRect(i*(w-1)/(n-1)-1.5,mid-seg[i]*scale-1.5,3,3);} // show the samples themselves when zoomed far in
 }
 g.lineWidth=1;
 if(cursor&&seg&&seg.length>1){
  const i=Math.max(0,Math.min(seg.length-1,Math.round(cursor*(seg.length-1)))),x=i*(w-1)/(seg.length-1);
  g.strokeStyle='#f3d38a';g.beginPath();g.moveTo(x+.5,0);g.lineTo(x+.5,h);g.stroke();
  g.fillStyle='#f3d38a';g.beginPath();g.arc(x,mid-seg[i]*scale,3.5,0,7);g.fill();
 }
}

function drawSpectrum(canvas,bins,hold,rate,cursor){
 const {g,w,h}=fit(canvas);
 g.fillStyle='#0a0c0b';g.fillRect(0,0,w,h);
 const fx=f=>Math.log(f/F_MIN)/Math.log(F_MAX/F_MIN)*w,dy=d=>(d/DB_MIN)*h;
 g.strokeStyle='#1f2a24';g.lineWidth=1;g.fillStyle='#6d7a72';g.font='10px system-ui,sans-serif';g.beginPath();
 for(const f of [50,100,200,500,1000,2000,5000,10000]){const x=Math.round(fx(f))+.5;g.moveTo(x,0);g.lineTo(x,h);}
 for(let d=-20;d>DB_MIN;d-=20){g.moveTo(0,dy(d)+.5);g.lineTo(w,dy(d)+.5);}
 g.stroke();
 for(const f of [100,1000,10000])g.fillText(f>=1000?f/1000+'k':f,fx(f)+3,h-3);
 for(let d=-20;d>DB_MIN;d-=20)g.fillText(d+'',3,dy(d)-2);
 if(!bins)return;
 const size=bins.length*2,binHz=rate/size;
 const trace=(arr,fill)=>{
  g.beginPath();g.moveTo(0,h);
  let px=0;
  for(;px<w;px++){
   // the strongest bin under this pixel column (log axis: many bins per pixel at the top)
   const f0=F_MIN*Math.pow(F_MAX/F_MIN,px/w),f1=F_MIN*Math.pow(F_MAX/F_MIN,(px+1)/w);
   let a=Math.floor(f0/binHz),b=Math.max(a,Math.floor(f1/binHz)),v=-200;
   if(b===a){ // between bins: interpolate
    const p=f0/binHz,i=Math.floor(p),t=p-i;v=(arr[i]??-200)*(1-t)+(arr[i+1]??-200)*t;
   }else for(let i=a;i<=Math.min(b,arr.length-1);i++)if(arr[i]>v)v=arr[i];
   g.lineTo(px,Math.max(0,Math.min(h,dy(Math.max(DB_MIN,Math.min(0,v))))));
  }
  g.lineTo(w,h);g.closePath();
  if(fill){g.fillStyle='#7fe39a33';g.fill();}
  g.stroke();
 };
 if(hold){g.strokeStyle='#e3a52a';g.lineWidth=1;trace(hold,false);}
 g.strokeStyle='#7fe39a';g.lineWidth=1.4;trace(bins,true);
 g.lineWidth=1;
 if(cursor!=null){
  const hz=F_MIN*Math.pow(F_MAX/F_MIN,cursor),x=cursor*w,k=Math.round(hz/binHz),v=bins[Math.max(0,Math.min(bins.length-1,k))];
  g.strokeStyle='#f3d38a';g.beginPath();g.moveTo(x+.5,0);g.lineTo(x+.5,h);g.stroke();
  g.fillStyle='#f3d38a';g.font='11px system-ui,sans-serif';
  const label=`${fmtHz(hz)}  ${v.toFixed(1)} dB`;g.fillText(label,Math.min(w-g.measureText(label).width-4,x+6),14);
 }
}

export default function Scope({engine,audio,onClose}){
 const [cfg,setCfg]=useState(()=>({...DEFAULTS,...(load(KEY,{})||{})}));
 const [status,setStatus]=useState({text:'',read:null});
 const [cursor,setCursor]=useState(null);       // scope cursor, 0..1 across the segment
 const [fcursor,setFcursor]=useState(null);     // spectrum cursor, 0..1 across the log axis
 const scopeRef=useRef(null),specRef=useRef(null);
 const cfgRef=useRef(cfg),cursorRef=useRef(null),fcursorRef=useRef(null);
 const run=useRef({seg:null,rate:48000,bins:null,hold:null,armed:null,captured:null,last:0,busy:false,lastSpec:0,frozen:null,live:null,trigSeg:null});
 cfgRef.current=cfg;cursorRef.current=cursor;fcursorRef.current=fcursor;
 useEffect(()=>{const t=setTimeout(()=>save(KEY,cfg),300);return ()=>clearTimeout(t);},[cfg]);
 const set=patch=>setCfg(c=>({...c,...patch}));

 const arm=useCallback(()=>{
  const r=run.current;r.captured=null;r.frozen=null;r.armed={end:r.lastEnd??0};
  setStatus(s=>({...s,text:'Armed — waiting for a trigger'}));
 },[]);
 // changing mode away from single clears a held capture
 useEffect(()=>{
  const r=run.current;
  if(cfg.mode==='single'){if(!r.captured&&!r.armed)arm();}
  else{r.captured=null;r.armed=null;setStatus(s=>({...s,text:''}));}
 },[cfg.mode,arm]);

 const redraw=useCallback(()=>{
  const r=run.current,c=cfgRef.current;
  if(scopeRef.current)drawScope(scopeRef.current,r.seg,{...c,zoomEff:r.zoomEff},cursorRef.current,r.rate);
  if(specRef.current)drawSpectrum(specRef.current,r.bins,c.peakHold?r.hold:null,r.rate,fcursorRef.current);
 },[]);

 const process=useCallback(data=>{
  const r=run.current,c=cfgRef.current,rate=data.rate,x=data.samples,startAbs=data.end-x.length;
  r.rate=rate;r.lastEnd=data.end;r.live=x;
  const span=SPANS[c.span]/1000,spanN=Math.round(span*rate),pre=Math.round(PRE*spanN);
  const lastStart=x.length-(spanN-pre)-1;
  const slope=c.slope;
  // vertical scale: auto-fit to the newest span of signal (shrinks at once, grows slowly), or fixed
  if(c.zoom===0){
   const pk=levels(x.subarray(Math.max(0,x.length-Math.max(spanN,2048)))).peak;
   if(pk>1e-5){const target=Math.min(500,Math.max(1,1/(pk*1.15)));r.autoZoom=target<(r.autoZoom??8)?target:(r.autoZoom??8)+(target-(r.autoZoom??8))*.08;}
   r.autoZoom??=8;
  }
  const zoomNow=c.zoom===0?r.autoZoom:ZOOMS[c.zoom];
  r.zoomEff=r.captured?.zoom??zoomNow;
  const trigAmp=c.level/zoomNow;     // the level slider is a fraction of the screen height
  const frozen=c.hold||r.captured;
  let seg=r.seg,specSrc=null,trigged=false;
  if(!frozen){
   let t=-1;
   if(c.mode==='single'&&r.armed){
    const from=Math.max(pre,r.armed.end-startAbs);
    t=findTrigger(x,trigAmp,slope,from,lastStart,false);
    if(t>=0){
     r.captured={seg:x.slice(t-pre,t-pre+spanN),spec:x.slice(t-pre,Math.min(x.length,t-pre+FFT)),zoom:zoomNow,rate,at:startAbs+t};
     r.armed=null;r.bins=null;r.hold=null;seg=r.captured.seg;
     setStatus({text:`Captured at frame ${(startAbs+t).toLocaleString()} (${(( startAbs+t)/rate).toFixed(3)} s) — Arm to capture again`,read:null});
    }
   }else if(c.mode!=='single'){
    t=findTrigger(x,trigAmp,slope,pre,lastStart,true);
    if(t>=0){seg=x.subarray(t-pre,t-pre+spanN);trigged=true;}
    else if(c.mode==='auto')seg=x.subarray(Math.max(0,x.length-spanN));
   }
   r.trigged=trigged;
   if(c.mode!=='single'||!r.captured)specSrc=x.subarray(Math.max(0,x.length-FFT));
  }
  if(r.captured){seg=r.captured.seg;specSrc=r.captured.spec;}
  r.seg=seg;
  // readouts from what is on screen
  if(seg){
   const l=levels(seg),now=performance.now();
   // the pitch search is the costly part: five times a second is plenty
   if(now-(r.lastPitch??0)>200||r.captured&&r.pitchFor!==r.captured){r.lastPitch=now;r.pitchFor=r.captured;r.hz=pitchOf(r.captured?.spec??x.subarray(Math.max(0,x.length-3072)),rate);}
   const hz=r.hz??0;
   setStatus(s=>({text:s.text,read:{pp:l.pp,peak:l.peak,rms:l.rms,hz,note:noteName(hz)}}));
  }
  const now=performance.now();
  if(specSrc&&now-r.lastSpec>60){
   r.lastSpec=now;
   const fresh=spectrumDb(specSrc,FFT);
   if(!r.bins||r.captured||r.bins.length!==fresh.length)r.bins=fresh;
   else for(let k=0;k<fresh.length;k++)r.bins[k]=r.bins[k]*.55+fresh[k]*.45;
   if(!r.hold||r.hold.length!==fresh.length)r.hold=Float32Array.from(r.bins);
   else for(let k=0;k<fresh.length;k++)if(r.bins[k]>r.hold[k])r.hold[k]=r.bins[k];
   const p=spectralPeak(r.bins,rate,FFT);
   r.peak=p;
  }
  redraw();
 },[redraw]);

 // the polling loop: one outstanding request at a time, about thirty a second
 useEffect(()=>{
  if(audio!=='on')return;
  let raf=0,alive=true;
  const tick=()=>{
   raf=requestAnimationFrame(tick);
   const r=run.current,live=engine.current,now=performance.now();
   if(!live||r.busy||now-r.last<30)return;
   r.busy=true;r.last=now;
   const need=Math.min(65000,Math.round(SPANS[cfgRef.current.span]/1000*(live.context.sampleRate))+Math.round(live.context.sampleRate*.2)+FFT);
   const timeout=setTimeout(()=>{r.busy=false;},500);
   live.requestScope(need,data=>{clearTimeout(timeout);r.busy=false;if(alive)process(data);});
  };
  raf=requestAnimationFrame(tick);
  return ()=>{alive=false;cancelAnimationFrame(raf);run.current.busy=false;};
 },[audio,engine,process]);
 useEffect(()=>{redraw();},[cfg,cursor,fcursor,redraw]);
 useEffect(()=>{const on=()=>redraw();window.addEventListener('resize',on);return ()=>window.removeEventListener('resize',on);},[redraw]);

 const r=run.current,read=status.read;
 const point=e=>{const b=e.currentTarget.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-b.left)/b.width));};
 const seg=r.seg,span=SPANS[cfg.span];
 let cursorText='';
 if(cursor!=null&&seg&&seg.length>1){const i=Math.round(cursor*(seg.length-1));cursorText=`${fmtTime((i/(seg.length-1)-PRE)*span)} from trigger · ${seg[i].toFixed(4)} (${db(Math.abs(seg[i]))})`;}
 const saveWav=()=>{
  const data=r.captured?.seg??r.seg;if(!data)return;
  const url=URL.createObjectURL(new Blob([wavBytes(data,r.rate)],{type:'audio/wav'}));
  const a=document.createElement('a');a.href=url;a.download=`scope-${Date.now()}.wav`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
 };
 const showScope=cfg.view!=='spectrum',showSpec=cfg.view!=='scope';
 return <section className="scope" aria-label="Oscilloscope and spectrum">
  <div className="scope-bar">
   <span className="seg" role="radiogroup" aria-label="View">{[['both','Both'],['scope','Scope'],['spectrum','Spectrum']].map(([v,l])=><button type="button" key={v} role="radio" aria-checked={cfg.view===v} className={cfg.view===v?'on':''} onClick={()=>set({view:v})}>{l}</button>)}</span>
   {showScope&&<>
    <label>Time<select value={cfg.span} onChange={e=>set({span:Number(e.target.value)})}>{SPANS.map((s,i)=><option key={s} value={i}>{s} ms</option>)}</select></label>
    <label>Zoom<select value={cfg.zoom} onChange={e=>set({zoom:Number(e.target.value)})}>{ZOOMS.map((z,i)=><option key={z} value={i}>{z?'×'+z:'Auto'}</option>)}</select></label>
    <span className="seg" role="radiogroup" aria-label="Trigger mode">{[['auto','Auto'],['normal','Normal'],['single','Single']].map(([v,l])=><button type="button" key={v} role="radio" aria-checked={cfg.mode===v} className={cfg.mode===v?'on':''} onClick={()=>set({mode:v})}>{l}</button>)}</span>
    {cfg.mode==='single'&&<button type="button" className={'arm'+(r.armed?' on':'')} onClick={arm}>{r.captured?'Re-arm':'Arm'}</button>}
    <button type="button" aria-pressed={cfg.slope<0} onClick={()=>set({slope:-cfg.slope})} title="Trigger on a rising or falling edge">{cfg.slope>0?'↗ rising':'↘ falling'}</button>
    <label className="level">Level<input type="range" min="-100" max="100" step="1" title="Trigger level as a fraction of the screen height" value={Math.round(cfg.level*100)} onChange={e=>set({level:Number(e.target.value)/100})}/><b>{Math.round(cfg.level*100)}%</b></label>
    <button type="button" aria-pressed={cfg.hold} onClick={()=>set({hold:!cfg.hold})} title="Freeze the display">{cfg.hold?'Run':'Stop'}</button>
    <button type="button" onClick={saveWav} title="Save what is on screen as a WAV file">Save WAV</button>
   </>}
   {showSpec&&<button type="button" aria-pressed={cfg.peakHold} onClick={()=>{set({peakHold:!cfg.peakHold});run.current.hold=null;}} title="Keep the highest level seen at each frequency">Peak hold</button>}
   <button type="button" className="close" onClick={onClose} aria-label="Close the scope">×</button>
  </div>
  <div className={'scope-views'+(cfg.view==='both'?' both':'')}>
   {showScope&&<div className="scope-view">
    <canvas ref={scopeRef} onPointerDown={e=>{setCursor(point(e));e.currentTarget.setPointerCapture?.(e.pointerId);}} onPointerMove={e=>e.buttons&&setCursor(point(e))} aria-label="Waveform"/>
    <div className="scope-read">
     {read?<><span>{fmtTime(span)} across</span><span>×{(r.zoomEff||1).toFixed(r.zoomEff>=10?0:1)}{cfg.zoom===0?' auto':''} · trigger {db(Math.abs(cfg.level)/(r.zoomEff||1))}</span><span>peak {read.peak.toFixed(3)} ({db(read.peak)})</span><span>p-p {read.pp.toFixed(3)}</span><span>rms {db(read.rms)}</span>{read.hz>0&&<span>{fmtHz(read.hz)} · {read.note}</span>}</>:<span>Play something.</span>}
     {cursorText&&<span className="cur">{cursorText}</span>}
     {status.text&&<span className="state">{status.text}</span>}
    </div>
   </div>}
   {showSpec&&<div className="scope-view">
    <canvas ref={specRef} onPointerDown={e=>{setFcursor(point(e));e.currentTarget.setPointerCapture?.(e.pointerId);}} onPointerMove={e=>e.buttons&&setFcursor(point(e))} aria-label="Spectrum"/>
    <div className="scope-read">{r.peak&&r.bins?<><span>peak {fmtHz(r.peak.hz)} · {noteName(r.peak.hz)}</span><span>{r.peak.db.toFixed(1)} dB</span><span>{FFT} point FFT · {(r.rate/FFT).toFixed(1)} Hz bins</span></>:<span>Play something.</span>}</div>
   </div>}
  </div>
 </section>;
}
