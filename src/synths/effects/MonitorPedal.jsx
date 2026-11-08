import React,{useCallback,useEffect,useRef,useState} from 'react';
import Encoder from '../seq/Encoder';
import useFloating from '../ui/useFloating';
import {VIEWS,SPANS,GAINS,SIZES,MONITOR_DEFAULTS,scopeFrame,spectrumFrame,stereoWavBytes} from './monitorModel';
import {drawMonitor} from './monitorDraw';

const db=x=>x>1e-6?(20*Math.log10(x)).toFixed(1)+' dBFS':'−∞';
function MonitorPedal({kind,engine,audio,config,onChange,onClose,positionKey,home}){
 const name=kind==='scope'?'Scope':'Spectrum',floating=useFloating(positionKey,home,{spawnOnly:true,rotatable:true}),canvas=useRef(null),cfg=useRef(config),run=useRef({raw:null,frame:null,after:-Infinity,engine:null}),[frame,setFrame]=useState(null),[capture,setCapture]=useState('armed'),[waiting,setWaiting]=useState(false);cfg.current=config;
 const resetCapture=()=>{run.current.prime=true;setCapture('armed');};
 const publish=useCallback(data=>{
  if(!data?.left?.length||data.left.length!==data.right?.length||!Number.isFinite(data.rate))return;
  const r=run.current,c=cfg.current;r.raw=data;
  // Captured/paused readers may have an old frame clock. Prime from a fresh
  // snapshot on re-arm, then search only beyond that boundary.
  if(kind==='scope'&&c.mode===2&&r.prime){r.prime=false;r.after=data.end;return;}
  const next=kind==='scope'?scopeFrame(data,c,{after:r.after,single:c.mode===2}):spectrumFrame(data,c,r.frame);
  if(!next){setWaiting(true);return;}setWaiting(false);r.frame=next;drawMonitor(canvas.current,kind,next,c);setFrame(next);if(kind==='scope'&&c.mode===2)setCapture('captured');
 },[kind]);
 useEffect(()=>{
  const r=run.current;r.frame=null;
  if(kind==='scope'){r.prime=true;r.after=r.raw?.end??-Infinity;setCapture('armed');if(r.raw){const next=scopeFrame(r.raw,{...cfg.current,mode:0});r.frame=next;setFrame(next);}}
  else if(r.raw)publish(r.raw);
 },[kind,config.view,config.size,config.peakHold,config.span,config.gain,config.level,config.source,config.mode]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(audio!=='on'){run.current.engine=null;setCapture('armed');}},[audio]);
 useEffect(()=>{
  if(audio!=='on'||config.paused||kind==='scope'&&config.mode===2&&capture==='captured')return;
  let alive=true,timer,cancel,busy=false;
  const tick=()=>{
   if(!alive)return;timer=setTimeout(tick,50);const live=engine.current,c=cfg.current,r=run.current;if(!live?.requestStereoScope||busy)return;
   if(r.engine!==live){r.engine=live;r.raw=null;r.frame=null;r.after=-Infinity;r.prime=true;}
   const n=kind==='scope'?Math.min(65536,Math.max(4096,Math.ceil(SPANS[c.span]*live.context.sampleRate/1000)+2048)):SIZES[c.size];
   busy=true;cancel=live.requestStereoScope(n,data=>{busy=false;if(alive)publish(data);},'pedal:'+kind);
  };
  tick();return ()=>{alive=false;clearTimeout(timer);cancel?.();};
 },[audio,engine,config.paused,config.mode,capture,kind,publish]);
 useEffect(()=>{
  const redraw=()=>drawMonitor(canvas.current,kind,run.current.frame,cfg.current);redraw();const observer=typeof ResizeObserver==='function'?new ResizeObserver(redraw):null;observer?.observe(canvas.current);window.addEventListener('resize',redraw);return ()=>{observer?.disconnect();window.removeEventListener('resize',redraw);};
 },[kind]);
 useEffect(()=>{drawMonitor(canvas.current,kind,run.current.frame,config);},[kind,config]);
 const set=patch=>onChange(kind,patch),choice=(key,label,options)=>({key,label,value:config[key],display:options[config[key]],position:config[key]/(options.length-1),step:1/(options.length-1),set:p=>set({[key]:Math.round(p*(options.length-1))})});
 const controls=[choice('view','View',VIEWS),...(kind==='scope'?[choice('span','Time',SPANS.map(n=>n+' ms')),choice('gain','Gain',GAINS.map(n=>n?'×'+n:'Auto')),{key:'level',label:'Trigger',display:(config.level*100).toFixed(0)+'%',position:(config.level+1)/2,step:.01,set:p=>set({level:Number((p*2-1).toFixed(3))})},choice('source','Trig ch.',['Left','Right']),choice('mode','Mode',['Auto','Normal','Single'])]:[choice('size','FFT',SIZES.map(String)),{key:'floor',label:'Floor',display:config.floor+' dB',position:(config.floor+120)/80,step:.025,set:p=>set({floor:Math.round(-120+p*80)})},{key:'smoothing',label:'Smooth',display:Math.round(config.smoothing*100)+'%',position:config.smoothing/.95,step:.025,set:p=>set({smoothing:Number((p*.95).toFixed(3))})}])];
 const running=audio==='on'&&!config.paused,status=config.paused?'Paused':audio!=='on'?'Audio stopped':kind==='scope'&&config.mode===2?(capture==='captured'?'Captured':'Armed'):kind==='scope'&&waiting?'Waiting for trigger':frame?'Live':'Waiting for signal';
 const clearPeaks=()=>{run.current.frame=null;if(run.current.raw)publish(run.current.raw);};
 const saveWav=()=>{if(!run.current.frame?.stereo)return;const url=URL.createObjectURL(new Blob([stereoWavBytes(run.current.frame)],{type:'audio/wav'})),a=document.createElement('a');a.href=url;a.download='scope-stereo.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
 return <section className={'effect-box physical-effect effect-large monitor-pedal '+kind+'-pedal'} data-monitor-id={kind} aria-label={`${name} monitor pedal`} ref={floating.ref} style={floating.style} onPointerDownCapture={floating.raise}>
  <header className="effects-box-grip effect-box-grip" {...floating.handle}><strong>{name}</strong><span className="effect-header-state"><i className={running?'lit':''}/></span><span className="monitor-input" title="Read-only stereo tap after the output gain">L/R ← Output</span><button type="button" className="effect-box-close" aria-label={`Close ${name} monitor`} onClick={onClose}>×</button></header>
  <div className="monitor-screen"><div className="monitor-legend"><span>{(frame?.channels??[]).map(ch=><b key={ch.label} style={{color:ch.colour}}>{ch.label}</b>)}</span><span role="status" aria-label={`${name} status`}>{status}</span>{kind==='scope'&&<button type="button" disabled={!frame?.stereo} aria-label="Scope save stereo WAV" onClick={saveWav}>Save WAV</button>}{kind==='spectrum'&&<button type="button" disabled={!config.peakHold} onClick={clearPeaks}>Clear peaks</button>}</div><canvas ref={canvas} aria-label={name==='Scope'?'Stereo waveform':'Stereo spectrum'}/><div className="monitor-readout" aria-label={`${name} readings`}>{frame?<><span>L {db(frame.levels.left.peak)}</span><span>R {db(frame.levels.right.peak)}</span><span>Corr {frame.levels.correlation==null?'—':frame.levels.correlation.toFixed(2)}</span>{kind==='scope'&&<span>{(frame.channels[0].samples.length*1000/frame.rate).toFixed(1)} ms</span>}{kind==='spectrum'&&frame.channels.map(ch=><span key={ch.label}>{ch.label} peak {ch.peak.db>config.floor?Math.round(ch.peak.hz)+' Hz':'—'}</span>)}</>:<span>Stereo output · monitor only</span>}</div></div>
  <div className="monitor-knobs" style={{'--monitor-count':controls.length}}>{controls.map(c=><div className="effect-knob pedal-knob is-secondary-knob" key={c.key} style={{'--knob-colour':'#8fcbdc'}}><Encoder label={c.label} ariaLabel={`${name} · ${c.label}`} display={c.display} tooltip={`${c.label}: ${c.display}`} position={c.position} step={c.step} onPosition={c.set} onReset={()=>set({[c.key]:MONITOR_DEFAULTS[kind][c.key]})}/></div>)}</div>
  <div className="effect-foot-area"><button type="button" className="effect-foot" aria-label={`${name} monitoring`} aria-pressed={!config.paused} title="Pause or resume this monitor; audio keeps playing" onClick={()=>set({paused:!config.paused})}><i className={'effect-foot-led'+(running?' lit':'')}/><span className="effect-foot-metal"/><span className="effect-foot-label">Monitor</span></button>
   {kind==='scope'?<button type="button" className="effect-foot" aria-label="Scope arm capture" disabled={config.mode!==2||config.paused} onClick={resetCapture}><i className={'effect-foot-led'+(config.mode===2&&capture==='armed'?' lit':'')}/><span className="effect-foot-metal"/><span className="effect-foot-label">Capture</span></button>:<button type="button" className="effect-foot" aria-label="Spectrum peak hold" aria-pressed={config.peakHold} onClick={()=>set({peakHold:!config.peakHold})}><i className={'effect-foot-led'+(config.peakHold?' lit':'')}/><span className="effect-foot-metal"/><span className="effect-foot-label">Peak hold</span></button>}
  </div>
 </section>;
}
export default React.memo(MonitorPedal,(a,b)=>a.kind===b.kind&&a.config===b.config&&a.audio===b.audio&&a.engine===b.engine);
