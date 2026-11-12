import{MainStripLiveRust}from'./mainStripLiveRust.js';
import{StampedWordReader,StampedFloat64Words}from'./stampedWordTransport.js';
import{mainControlGeometry,decodeMainControl}from'./mainControlWords.js';
/** Continuous Main strip. The read-only Rust credit ledger never guesses
 * reclamation from elapsed time or the already-advanced engine end frame. */
export class MainStripControlCore{
 constructor(module,configuration,{emit=()=>{}}={}){
  this.unit=new MainStripLiveRust(module,configuration);this.rate=configuration.sampleRate;this.emit=emit;this.reader=new StampedWordReader(mainControlGeometry());this.codec=new StampedFloat64Words();this.frames=new Float64Array(32);this.sequences=new Uint32Array(32);this.words=new Uint16Array(32*14);this.head=0;this.queued=0;this.frame=null;this.appliedSequence=0;this.free=(configuration.initialAssignments??[true,true,false]).map(v=>256-Number(v));this.lastReportedSequence=-1;this.lastReportedFree=null;this.deferredStreak=0;this.error=null;
 }
 sync(frame){if(this.error||!this.unit)throw Error(this.error??'Disposed Main controller');if(!Number.isSafeInteger(frame)||frame<0||frame%128)throw Error('Noncanonical Main Native frame');if(this.frame===null)this.unit.firstFrame(frame);else if(frame!==this.frame+128)throw Error('Main Native clock discontinuity');this.frame=frame;}
 receive(parameters){
  if(this.frame===null)throw Error('Main controls require an actual Native frame');
  const count=this.reader.read(parameters),first=this.reader.sequence-count+1;if(this.queued+count>32)throw Error('Main pending command capacity');
  this.deferredStreak=this.reader.deferredSequence?this.deferredStreak+1:0;if(this.deferredStreak>64)throw Error('Main torn command exceeded64 quanta');
  for(let i=0;i<count;i++){const at=(this.head+this.queued)%32;this.frames[at]=this.reader.frames[i];this.sequences[at]=first+i;this.words.set(this.reader.words.subarray(i*14,i*14+14),at*14);this.queued++;}

  while(this.queued&&this.frames[this.head]<=this.frame){const at=this.head,c=decodeMainControl(this.rate,this.words,at*14,this.codec);this.unit.command({...c,authorFrame:this.frames[at]});this.appliedSequence=this.sequences[at];this.head=(this.head+1)%32;this.queued--;}
  if(this.queued&&this.frames[this.head]>this.frame+8192)throw Error('Main author metadata exceeds current Native clock bound');

 }
 render(input,{pulled=true}={}){if(this.frame===null||this.error||!this.unit)throw Error(this.error??'Main render has no Native frame');try{if(typeof pulled!=='boolean'||!Array.isArray(input)||input.length&&input.length!==this.unit.spec.channels||input.some(p=>!(p instanceof Float32Array)||p.length!==128)||!pulled&&input.length)throw Error('Main input layout or pull authority differs');for(let c=0;c<this.unit.input.length;c++)if(input.length)this.unit.input[c].set(input[c]);else this.unit.input[c].fill(0,0,128);this.unit.render(128);this.unit.freeSlots(this.frame,this.free);if(this.lastReportedSequence!==this.appliedSequence||!this.lastReportedFree||this.free.some((n,i)=>n!==this.lastReportedFree[i])){this.emit({kind:'observed',sequence:this.appliedSequence,frame:this.frame,freeSlots:[...this.free]});this.lastReportedSequence=this.appliedSequence;this.lastReportedFree=[...this.free];}return this.unit.output;}catch(e){this.error=String(e);throw e;}}
 stats(){return{frame:this.frame,unit:this.unit?.stats()??null,appliedSequence:this.appliedSequence,queued:this.queued,freeSlots:[...this.free],reader:this.reader.snapshot(),error:this.error,scope:'Continuous Native-frame Main; exact read-only Rust credits at the observed Native frame, no inferred reclamation'};}
 dispose(){this.unit?.dispose();this.unit=null;this.frames=this.sequences=this.words=null;}
}
