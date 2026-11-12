/** Generic authored metadata: every16-bit word carries its8-bit sequence stamp.
 * No DSP coefficient generation. Raw F64 bit payloads belong to the caller's schema. */
export const STAMPED_WORD_PROFILE='stamped-authored-raw-words-v1',STAMPED_WORD_SEQUENCE_MAX=16777215,STAMPED_WORD_FRAME_MAX=1099511627648;
const BASE=65536,PERIOD=256,MAX=16777215;
function shape({wordCount,slots=32,prefix='command'}={}){if(!Number.isInteger(wordCount)||wordCount<1||wordCount>24||!Number.isInteger(slots)||slots<1||slots>64||typeof prefix!=='string'||!/^[_a-zA-Z][_a-zA-Z0-9]{0,30}$/.test(prefix))throw Error('Invalid stamped word geometry');return{wordCount,slots,prefix};}
const names=(p,slot)=>['sequence','frame0','frame1','frame2',...Array.from({length:p.wordCount},(_,i)=>'word'+i)].map(f=>p.prefix+slot+'_'+f);
export function stampedWordDescriptors(options){const p=shape(options),out=[];for(let s=0;s<p.slots;s++)for(const name of names(p,s))out.push({name,defaultValue:0,minValue:0,maxValue:MAX,automationRate:'a-rate'});return out;}
export function stampedAuthorFrame(context,seconds){const frame=Math.round(seconds*context.sampleRate);if(typeof seconds!=='number'||!Number.isFinite(seconds)||!Number.isSafeInteger(frame)||frame<0||frame>STAMPED_WORD_FRAME_MAX||frame%128||seconds!==frame/context.sampleRate)throw Error('Authored metadata requires exact canonical context seconds');return frame;}
export class StampedWordWriter{
 constructor(parameters,context,options){Object.assign(this,shape(options));this.context=context;this.sequence=0;this.observedSequence=0;this.reserved=0;this.lastAuthorFrame=null;this.failed=null;this.reservations=new Map();this.controls=Array.from({length:this.slots},(_,s)=>names(this,s).map(name=>{const p=parameters.get(name);if(typeof p?.setValueAtTime!=='function')throw Error('Stamped word AudioParam unavailable');return p;}));}
 preflight(count){if(this.failed)throw Error(this.failed);if(!Number.isInteger(count)||count<1||count>this.slots||this.sequence-this.observedSequence+this.reserved+count>this.slots)throw Error('Whole metadata reservation exceeds unobserved capacity');if(this.sequence+this.reserved+count>STAMPED_WORD_SEQUENCE_MAX)throw Error('Stamped word sequence exhausted');}
 reserve(count){this.preflight(count);const token=Object.freeze({});this.reservations.set(token,{remaining:count});this.reserved+=count;return token;}
 cancel(token){const p=this.reservations.get(token);if(!p)throw Error('Unknown metadata reservation');this.reserved-=p.remaining;this.reservations.delete(token);}
 write(token,words,{seconds}={}){
  if(this.failed)throw Error(this.failed);const r=this.reservations.get(token);if(!r||r.remaining<1)throw Error('Unknown/exhausted metadata reservation');
  if(!words||words.length!==this.wordCount)throw Error('Stamped word payload length differs');for(let i=0;i<words.length;i++)if(!Number.isInteger(words[i])||words[i]<0||words[i]>=BASE)throw Error('Invalid raw metadata word');
  const frame=stampedAuthorFrame(this.context,seconds);if(this.lastAuthorFrame!==null&&frame<this.lastAuthorFrame)throw Error('Authored metadata clock moved backwards');const sequence=this.sequence+1,stamp=(sequence%PERIOD)*BASE,controls=this.controls[(sequence-1)%this.slots];
  try{controls[1].setValueAtTime(stamp+frame%BASE,seconds);controls[2].setValueAtTime(stamp+Math.floor(frame/BASE)%BASE,seconds);controls[3].setValueAtTime(stamp+Math.floor(frame/(BASE*BASE)),seconds);for(let i=0;i<this.wordCount;i++)controls[i+4].setValueAtTime(stamp+words[i],seconds);controls[0].setValueAtTime(sequence,seconds);}
  catch(error){this.failed='Partial stamped metadata publication: '+error;throw error;}
  this.sequence=sequence;this.lastAuthorFrame=frame;this.reserved--;r.remaining--;if(!r.remaining)this.reservations.delete(token);return sequence;
 }
 acknowledge(sequence){if(!Number.isSafeInteger(sequence)||sequence<0||sequence>this.sequence)throw Error('Invalid raw-word observation watermark');if(sequence>this.observedSequence)this.observedSequence=sequence;}
 snapshot(){return{profile:STAMPED_WORD_PROFILE,sequence:this.sequence,observedSequence:this.observedSequence,reserved:this.reserved,slots:this.slots,wordCount:this.wordCount,lastAuthorFrame:this.lastAuthorFrame,failed:this.failed};}
}
export class StampedWordReader{
 constructor(options){Object.assign(this,shape(options));this.sequence=0;this.count=0;this.frames=new Float64Array(this.slots);this.words=new Uint16Array(this.slots*this.wordCount);this.tags=new Uint32Array(this.slots);this.names=Array.from({length:this.slots},(_,s)=>names(this,s));this.scratch=new Uint16Array(this.wordCount+3);this.lastAuthorFrame=null;this.lastVisibleSequence=0;this.deferredQuanta=0;this.deferredSequence=0;this.deferredWord=null;}
 scalar(parameters,name){const a=parameters[name];if(!(a instanceof Float32Array)||![1,128].includes(a.length))throw Error('Stamped metadata block shape differs');for(let i=0;i<a.length;i++)if(!Number.isInteger(a[i])||a[i]<0||a[i]>MAX)throw Error('Invalid packed stamped word');return a[a.length-1];}
 read(parameters){
  this.count=0;let last=this.sequence;for(let i=0;i<this.slots;i++){const tag=this.scalar(parameters,this.names[i][0]);this.tags[i]=tag;last=Math.max(last,tag);}this.lastVisibleSequence=last;if(last-this.sequence>this.slots)throw Error('Stamped words overwritten before observation');
  let count=0,deferred=0,word=null;
  for(let sequence=this.sequence+1;sequence<=last;sequence++){
   const slot=(sequence-1)%this.slots,n=this.names[slot],stamp=sequence%PERIOD;if(this.tags[slot]!==sequence){if(this.tags[slot]>sequence)throw Error('Stamped word slot sequence lost');deferred=sequence;break;}
   let complete=true;for(let j=1;j<n.length;j++){const packed=this.scalar(parameters,n[j]);if(Math.floor(packed/BASE)!==stamp){complete=false;deferred=sequence;word=n[j];break;}this.scratch[j-1]=packed%BASE;}if(!complete)break;
   const frame=this.scratch[0]+this.scratch[1]*BASE+this.scratch[2]*BASE*BASE;if(frame>STAMPED_WORD_FRAME_MAX||frame%128||(count?frame<this.frames[count-1]:this.lastAuthorFrame!==null&&frame<this.lastAuthorFrame))throw Error('Stamped authored frame/chronology differs');
   this.frames[count]=frame;for(let j=0;j<this.wordCount;j++)this.words[count*this.wordCount+j]=this.scratch[j+3];count++;
  }
  this.count=count;this.sequence+=count;if(count)this.lastAuthorFrame=this.frames[count-1];this.deferredSequence=deferred;this.deferredWord=word;if(deferred)this.deferredQuanta++;return count;
 }
 snapshot(){return{profile:STAMPED_WORD_PROFILE,sequence:this.sequence,lastVisibleSequence:this.lastVisibleSequence,lastAuthorFrame:this.lastAuthorFrame,count:this.count,deferredSequence:this.deferredSequence,deferredWord:this.deferredWord,deferredQuanta:this.deferredQuanta,slots:this.slots,wordCount:this.wordCount};}
}
/** Explicit little-endian words; one prepared scratch buffer, no per-value allocation. */
export class StampedFloat64Words{
 constructor(){this.buffer=new ArrayBuffer(8);this.view=new DataView(this.buffer);}
 encode(value,words,offset=0){if(typeof value!=='number'||!words||offset<0||offset+4>words.length)throw Error('Invalid Float64 word destination');this.view.setFloat64(0,value,true);for(let i=0;i<4;i++)words[offset+i]=this.view.getUint16(i*2,true);return words;}
 decode(words,offset=0){if(!words||offset<0||offset+4>words.length)throw Error('Invalid Float64 word source');for(let i=0;i<4;i++){const x=words[offset+i];if(!Number.isInteger(x)||x<0||x>65535)throw Error('Invalid Float64 raw word');this.view.setUint16(i*2,x,true);}return this.view.getFloat64(0,true);}
}
