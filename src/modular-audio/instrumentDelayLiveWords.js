import{StampedFloat64Words}from'./stampedWordTransport.js';
export const INSTRUMENT_DELAY_WORD_OPTIONS=Object.freeze({wordCount:14,slots:32,prefix:'instrumentDelay'});
/** Raw scheduled seconds and metadata author frames are distinct: a hold
 * inserts future restoration steps at the actual current author epoch. */
export class InstrumentDelayWordCodec{
 constructor(){this.f64=new StampedFloat64Words();this.words=new Uint16Array(14);this.op=0;this.lane=0;this.value=0;this.tau=0;this.seconds=0;}
 encode(op,lane,value,tau,seconds){
  if(![0,2,3,4].includes(op)||!Number.isInteger(lane)||lane<0||lane>10||typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(Math.fround(value))||typeof tau!=='number'||!Number.isFinite(tau)||tau<0||typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0)throw Error('Invalid Instrument Delay control schema');
  if(op===3){if(value!==0||tau!==0)throw Error('Invalid Instrument Delay cancel row');}
  else{const [lo,hi]=lane<=6?[0,1]:lane===7?[0,11000]:lane===8?[0,100]:lane===9?[-40,40]:[-153600,153600];if(value<lo||value>hi||op===2&&(tau===0||Math.fround(tau)===0)||op!==2&&tau!==0)throw Error('Invalid Instrument Delay parameter row');}
  this.words[0]=op;this.words[1]=lane;this.f64.encode(value,this.words,2);this.f64.encode(tau,this.words,6);this.f64.encode(seconds,this.words,10);return this.words;
 }
 decode(words,offset=0){if(!Number.isInteger(offset)||offset<0||offset+14>words.length)throw Error('Invalid Instrument Delay word offset');const op=words[offset],lane=words[offset+1],value=this.f64.decode(words,offset+2),tau=this.f64.decode(words,offset+6),seconds=this.f64.decode(words,offset+10);this.encode(op,lane,value,tau,seconds);Object.assign(this,{op,lane,value,tau,seconds});return this;}
 apply(core,author){core.command(this.lane,this.op,this.value,this.tau,author,this.seconds);}
}
