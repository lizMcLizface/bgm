export const INSERTS=[
 ['bypass','Bypass inserts',0,1,1,0],['saturation','Saturation mix',0,1,.01,0],['drive','Saturation drive · dB',0,24,.5,6],
 ['lowGain','Low shelf · dB',-12,12,.5,0],['lowFreq','Low shelf · Hz',60,600,1,180],['midGain','Mid peak · dB',-12,12,.5,0],['midFreq','Mid peak · Hz',200,6000,1,1000],['midQ','Mid peak Q',.2,4,.05,.7],['highGain','High shelf · dB',-12,12,.5,0],['highFreq','High shelf · Hz',1500,12000,1,6000],
 ['phaser','Phaser mix',0,1,.01,0],['phaserRate','Phaser rate · Hz',.02,5,.01,.15],['phaserDepth','Phaser sweep · octaves',0,3,.05,1.5],['phaserFreq','Phaser centre · Hz',100,4000,1,700],['phaserFeedback','Phaser feedback',-.75,.75,.01,.2],
 ['flanger','Flanger mix',0,1,.01,0],['flangerRate','Flanger rate · Hz',.02,5,.01,.12],['flangerDepth','Flanger depth · ms',0,4,.05,1],['flangerDelay','Flanger centre · ms',.3,20,.05,2],['flangerFeedback','Flanger feedback',-.85,.85,.01,.35],
 ['chorus','Chorus mix',0,.8,.01,0],['chorusRate','Chorus rate · Hz',.05,10,.01,.35],['chorusDepth','Chorus depth · ms',0,8,.1,3.5],['gain','Insert output trim · dB',-18,6,.5,0],
];
export const defaultInserts=()=>Object.fromEntries(INSERTS.map(([id,,,,,v])=>[id,v]));
export const sanitizeInserts=(raw={})=>Object.fromEntries(INSERTS.map(([id,,lo,hi,step,v])=>{const x=raw?.[id];return [id,typeof x==='number'&&Number.isFinite(x)?Math.max(lo,Math.min(hi,step===1?Math.round(x):x)):v];}));
export const insertsPacket=raw=>{const p=sanitizeInserts(raw);return INSERTS.map(([id],i)=>[i,p[id]]);};
export function insertsActive(raw){const p=sanitizeInserts(raw);return !p.bypass&&(p.saturation>0||p.lowGain!==0||p.midGain!==0||p.highGain!==0||p.phaser>0||p.flanger>0||p.chorus>0||p.gain!==0);}
export function insertsTail(raw){const p=sanitizeInserts(raw);if(p.bypass)return 0;const tone=p.saturation>0||p.lowGain!==0||p.midGain!==0||p.highGain!==0,minHz=Math.max(30,p.phaserFreq/2**p.phaserDepth),phase=p.phaser>0?Math.max(.5,6/(Math.PI*minHz)*(1+Math.log(1e-6)/Math.log(Math.max(.01,Math.abs(p.phaserFeedback))))+.1):0;return (tone?.5:0)+(p.chorus>0?.024:0)+phase+(p.flanger>0?Math.max(.05,(p.flangerDelay+p.flangerDepth)/1000*(1+Math.log(1e-6)/Math.log(Math.max(.01,Math.abs(p.flangerFeedback))))):0);}
