export const INSTRUMENT_FLANGER_ENTRIES=Object.freeze({input:0,delay:1});
export const INSTRUMENT_FLANGER_STATS=Object.freeze(['frame','peak','calls','commands','rejected','renderedFrames','unpulledFrames','late','mainThreadClamps','cycleEntry','channels','plannedBytesUpperBound','phase']);
const MAX=1099511627648,frame=f=>Number.isSafeInteger(f)&&f>=0&&f<=MAX&&f%128===0;
const limits=lane=>lane<=1?[0,1]:lane===2?[-.9,1]:lane===3?[0,1]:lane===4?[0,100]:[0,1000];
function validate(r,rate){if(!r||!Number.isInteger(r.lane)||r.lane<0||r.lane>=6||![0,2,3,4].includes(r.op)||!frame(r.author)||!Number.isFinite(r.seconds)||r.seconds<0||r.seconds>MAX/rate||!Number.isFinite(r.value)||!Number.isFinite(r.tau)||r.tau<0||r.op===2&&r.tau===0)throw Error('Invalid Flanger command');const[lo,hi]=limits(r.lane);if(r.op!==3&&(r.value<lo||r.value>hi))throw Error('Flanger command outside declared profile');}
/** Original setter law; no Native intrinsic getter is replaced by authored values. */
export function instrumentFlangerCommands(record,rate){if(!record||!frame(record.frame)||!Number.isFinite(record.seconds)||record.seconds<0||!Array.isArray(record.args)||record.args.length!==1||!Number.isFinite(record.args[0]))throw Error('Invalid original Flanger call');const{frame:author,seconds}=record,v=record.args[0],step=(lane,value,time=seconds)=>({lane,op:0,value,tau:0,author,seconds:time});let rows;switch(record.name){
 case'setAmount':if(v<0||v>1)throw Error('Declared amount0..1 required');rows=[step(0,1-v),step(1,v)];break;
 case'setFeedback':rows=[step(2,Math.max(-.9,Math.min(.9,v)))];break;
 case'setDelay':if(v<0||v>1)throw Error('Original Flanger delay refused');rows=[step(3,v)];break;
 case'setRate':if(v<0||v>100)throw Error('Original Flanger rate refused');rows=[{lane:4,op:3,value:0,tau:0,author,seconds:seconds+.001},step(4,v,seconds+.001)];break;
 case'setDepth':if(v<0||v>1000)throw Error('Original Flanger depth refused');rows=[step(5,v)];break;
 default:throw Error('Unsupported original Flanger method');}
 for(const row of rows)validate(row,rate);return rows;}
export class OwnedInstrumentFlanger{
 constructor(e,rate,{cycleEntry,channels=2,origin=0,seconds=origin/rate}={}){if(e.instrument_flanger_api?.()!==1||!Object.hasOwn(INSTRUMENT_FLANGER_ENTRIES,cycleEntry)||![1,2].includes(channels)||!Number.isInteger(rate)||rate<8000||rate>192000||!frame(origin)||seconds!==origin/rate)throw Error('Explicit immutable Flanger cycle profile required');Object.assign(this,{e,rate,channels,origin,seconds,records:[],methods:[]});Object.defineProperty(this,'cycleEntry',{value:cycleEntry,enumerable:true});this.handle=e.instrument_flanger_new(rate,channels,INSTRUMENT_FLANGER_ENTRIES[cycleEntry]);if(!this.handle)throw Error('Flanger resource quota refused');try{this.check(e.instrument_flanger_prepare(this.handle,origin,seconds),'prepare');this.refreshViews();}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('Flanger disposed');}
 check(ok,label){if(!ok)throw Error('Flanger rejected '+label);}
 refreshViews(){this.alive();this.memory=this.e.memory.buffer;this.input=[0,1].map(c=>new Float32Array(this.memory,this.e.instrument_flanger_input(this.handle,c),128));this.output=[0,1].map(c=>new Float32Array(this.memory,this.e.instrument_flanger_output(this.handle,c),128));}
 stat(i){this.alive();return this.e.instrument_flanger_stat(this.handle,i);}
 stats(){return Object.fromEntries(INSTRUMENT_FLANGER_STATS.map((name,i)=>[name,this.stat(i)]));}
 credit(lane,count,author=this.stat(0)){this.alive();if(!Number.isInteger(lane)||lane<0||lane>=6||!Number.isInteger(count)||count<0||count>256)throw Error('Invalid Flanger credit query');return!!this.e.instrument_flanger_credit(this.handle,lane,count,author);}
 batch(rows){this.alive();if(!Array.isArray(rows)||!rows.length||rows.length>16||this.records.length+rows.length>4096)throw Error('Flanger bounded command recipe exhausted');const needs=new Map();for(const r of rows){validate(r,this.rate);if(r.author!==rows[0].author||r.author>this.stat(0))throw Error('One actual Flanger insertion epoch required');needs.set(r.lane,(needs.get(r.lane)??0)+(r.op===3?0:1));}for(const[lane,n]of needs)if(!this.credit(lane,n,rows[0].author))throw Error('Complete Flanger lane capacity refused');for(const r of rows){this.check(this.e.instrument_flanger_command(this.handle,r.lane,r.op,r.value,r.tau,r.author,r.seconds),'command');this.records.push({...r});}}
 command(lane,op,value,tau,author=this.stat(0),seconds=author/this.rate){this.batch([{lane,op,value,tau,author,seconds}]);}
 applyOriginal(record){if(this.methods.length>=4096)throw Error('Flanger method recipe exhausted');this.batch(instrumentFlangerCommands(record,this.rate));this.methods.push({name:record.name,args:[record.args[0]],frame:record.frame,seconds:record.seconds});}
 sync(frame){this.alive();this.check(this.e.instrument_flanger_sync(this.handle,frame),'Native frame');}
 render(channels=this.channels,pulled=true){this.alive();if(!Number.isInteger(channels)||![0,this.channels].includes(channels)||typeof pulled!=='boolean'||this.e.memory.buffer!==this.memory)throw Error('Flanger render layout/memory differs');this.check(this.e.instrument_flanger_render(this.handle,channels,+pulled),'render');}
 curve(lane,i){this.alive();return this.e.instrument_flanger_curve(this.handle,lane,i);}
 reset(){this.alive();this.check(this.e.instrument_flanger_reset(this.handle),'reset');this.records.length=this.methods.length=0;}
 recipe(){this.alive();return{version:1,profile:'original-flanger-explicit-cycle-recipe-v1',cycleEntry:this.cycleEntry,rate:this.rate,channels:this.channels,origin:this.origin,seconds:this.seconds,commands:this.records.map(r=>({...r})),methods:this.methods.map(r=>({...r,args:[...r.args]})),scope:'Required explicit cycle entry; exact from-constructor PCM reconstruction, not a Native universal-output promise or mid-render snapshot.'};}
 dispose(){if(this.handle){this.e.instrument_flanger_free(this.handle);this.handle=0;this.input=this.output=this.memory=null;}}
}
