export const INSTRUMENT_MODULATION_MODES=Object.freeze({chorus:0,phaser:1});
export const INSTRUMENT_MODULATION_STATS=Object.freeze(['frame','peak','calls','commands','rejected','renderedFrames','unpulledFrames','late','mainThreadClamps','mode','channels','plannedBytesUpperBound','phase0','phase1','phase2']);
const MAX=1099511627648,validFrame=f=>Number.isSafeInteger(f)&&f>=0&&f<=MAX&&f%128===0;
const defaults=mode=>mode==='chorus'?{amount:0,rate:.6,depth:.002,feedback:0}:{amount:0,rate:.5,depth:800,feedback:.3,frequency:800};
const laneValid=(lane,mode)=>Number.isInteger(lane)&&lane>=0&&lane<24&&(mode==='chorus'?lane<=13:[0,1,2,5,14,15,16,17,18,19,20,21].includes(lane));
const bounds=lane=>lane<=1||lane>=11&&lane<=14?[0,1]:lane<=4?[0,100]:lane<=7?[0,1000]:lane<=10?[0,.03]:lane<=20?[0,20000]:[0,100];
function validate(row,mode,rate){if(!row||!laneValid(row.lane,mode)||![0,2,3,4].includes(row.op)||!validFrame(row.author)||!Number.isFinite(row.seconds)||row.seconds<0||row.seconds>MAX/rate||!Number.isFinite(row.tau)||row.tau<0||row.op===2&&row.tau===0||!Number.isFinite(row.value))throw Error('Invalid modulation command');const[lo,hi]=bounds(row.lane);if(row.op!==3&&(row.value<lo||row.value>hi))throw Error('Modulation command outside declared range');}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
/** Literal public method law and authored getter fields, never Native AudioParam values. */
export function instrumentModulationCommands(record,mode,rate,current=defaults(mode)){
 if(!record||!Object.hasOwn(INSTRUMENT_MODULATION_MODES,mode)||!Number.isInteger(rate)||!Number.isFinite(record.args?.[0]))throw Error('Invalid original modulation method');
 const{frame:author,seconds}=record,value=record.args[0],next={...current},step=(lane,v,time=seconds)=>({lane,op:0,value:v,tau:0,author,seconds:time}),rows=[];
 switch(record.name){
 case'setAmount':next.amount=clamp(value,0,1);rows.push(step(0,1-next.amount),step(1,next.amount));break;
 case'setRate':next.rate=clamp(value,0,10);for(let i=0;i<(mode==='chorus'?3:1);i++){const time=seconds+.001;rows.push({lane:2+i,op:3,value:0,tau:0,author,seconds:time},step(2+i,next.rate+i*.1,time));}break;
 case'setDepth':next.depth=clamp(value,0,mode==='chorus'?.01:1000);if(mode==='chorus')for(let i=0;i<3;i++)rows.push(step(5+i,next.depth));else rows.push(step(5,Math.min(next.depth,next.frequency*.8)));break;
 case'setFeedback':next.feedback=clamp(value,0,mode==='chorus'?.95:.75);if(mode==='phaser')rows.push(step(14,next.feedback));break;
 case'setFrequency':if(mode!=='phaser')throw Error('Chorus has no frequency setter');next.frequency=clamp(value,20,20000);for(let i=0;i<6;i++)rows.push(step(15+i,next.frequency));rows.push(step(5,Math.min(next.depth,next.frequency*.8)));break;
 default:throw Error('Unsupported original modulation setter');
 }
 if(!validFrame(author)||!Number.isFinite(seconds)||seconds<0||seconds>MAX/rate)throw Error('Invalid original modulation epoch');for(const row of rows)validate(row,mode,rate);return{rows,fields:next};
}
export class OwnedInstrumentModulation{
 constructor(e,rate,{mode='chorus',channels=2,origin=0,seconds=origin/rate}={}){if(e.instrument_modulation_api?.()!==1||!Object.hasOwn(INSTRUMENT_MODULATION_MODES,mode)||![1,2].includes(channels)||!Number.isInteger(rate)||rate<8000||rate>192000||!validFrame(origin)||seconds!==origin/rate)throw Error('Modulation ABI/profile differs');Object.assign(this,{e,rate,mode,channels,origin,seconds,records:[],methods:[],fields:defaults(mode)});this.handle=e.instrument_modulation_new(rate,channels,INSTRUMENT_MODULATION_MODES[mode]);if(!this.handle)throw Error('Modulation resource quota refused');try{this.check(e.instrument_modulation_prepare(this.handle,origin,seconds),'prepare');this.refreshViews();}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('Modulation disposed');}
 check(ok,what){if(!ok)throw Error('Modulation rejected '+what);}
 refreshViews(){this.alive();this.memory=this.e.memory.buffer;this.input=[0,1].map(c=>new Float32Array(this.memory,this.e.instrument_modulation_input(this.handle,c),128));this.output=[0,1].map(c=>new Float32Array(this.memory,this.e.instrument_modulation_output(this.handle,c),128));this.voices=[0,1,2].map(v=>[0,1].map(c=>new Float32Array(this.memory,this.e.instrument_modulation_voice(this.handle,v,c),128)));}
 stat(i){this.alive();return this.e.instrument_modulation_stat(this.handle,i);}
 stats(){return Object.fromEntries(INSTRUMENT_MODULATION_STATS.map((name,i)=>[name,this.stat(i)]));}
 credit(lane,count,author=this.stat(0)){this.alive();if(!laneValid(lane,this.mode)||!Number.isInteger(count)||count<0||count>256)throw Error('Invalid modulation credit query');return!!this.e.instrument_modulation_credit(this.handle,lane,count,author);}
 preflight(rows){this.alive();if(!Array.isArray(rows)||rows.length>16||this.records.length+rows.length>4096)throw Error('Modulation bounded recipe exhausted');const needs=new Map();for(const row of rows){validate(row,this.mode,this.rate);if(row.author!==rows[0].author||row.author>this.stat(0))throw Error('One actual insertion epoch required');needs.set(row.lane,(needs.get(row.lane)??0)+(row.op===3?0:1));}for(const[lane,count]of needs)if(!this.credit(lane,count,rows[0].author))throw Error('Modulation complete command capacity refused');}
 batch(rows){this.preflight(rows);for(const row of rows){this.check(this.e.instrument_modulation_command(this.handle,row.lane,row.op,row.value,row.tau,row.author,row.seconds),'command');this.records.push({...row});}}
 command(lane,op,value,tau,author=this.stat(0),seconds=author/this.rate){this.batch([{lane,op,value,tau,author,seconds}]);}
 applyOriginal(record){if(this.methods.length>=4096)throw Error('Modulation method recipe exhausted');const plan=instrumentModulationCommands(record,this.mode,this.rate,this.fields);this.preflight(plan.rows);if(record.frame>this.stat(0))throw Error('Modulation future author refused');this.batch(plan.rows);this.fields=plan.fields;this.methods.push({...record,args:[...record.args]});}
 sync(frame){this.alive();this.check(this.e.instrument_modulation_sync(this.handle,frame),'Native frame');}
 render(channels=this.channels,pulled=true){this.alive();if(!Number.isInteger(channels)||![0,this.channels].includes(channels)||typeof pulled!=='boolean'||this.memory!==this.e.memory.buffer)throw Error('Modulation render layout/memory differs');this.check(this.e.instrument_modulation_render(this.handle,channels,+pulled),'render');}
 curve(lane,index){this.alive();return this.e.instrument_modulation_curve(this.handle,lane,index);}
 lfo(voice,index){this.alive();return this.e.instrument_modulation_lfo(this.handle,voice,index);}
 reset(){this.alive();this.check(this.e.instrument_modulation_reset(this.handle),'reset');this.records.length=this.methods.length=0;this.fields=defaults(this.mode);}
 recipe(){this.alive();return{version:1,profile:'original-chorus-phaser-recipe-v1',rate:this.rate,mode:this.mode,channels:this.channels,origin:this.origin,seconds:this.seconds,commands:this.records.map(r=>({...r})),methods:this.methods.map(r=>({...r,args:[...r.args]})),scope:'From constructor and same PCM with declared pulled windows; not a mid-render state snapshot.'};}
 dispose(){if(this.handle){this.e.instrument_modulation_free(this.handle);this.handle=0;this.input=this.output=this.voices=this.memory=null;}}
}
