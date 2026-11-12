import{StampedFloat64Words}from'./stampedWordTransport.js';
export const INSTRUMENT_TONE_WORD_OPTIONS=Object.freeze({wordCount:14,slots:32,prefix:'instrumentTone'});
/** One raw original insertion epoch per row. Type changes are ordered commands;
 * they cannot be collapsed merely because the final type matches an old type. */
export class InstrumentToneWordCodec{
 constructor(){this.f64=new StampedFloat64Words();this.words=new Uint16Array(14);this.op=0;this.lane=0;this.value=0;this.tau=0;this.seconds=0;}
 encode(op,lane,value,tau,seconds){
  if(![0,2,3,4,7].includes(op)||!Number.isInteger(lane)||lane<0||lane>15||typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(Math.fround(value))||typeof tau!=='number'||!Number.isFinite(tau)||tau<0||typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0)throw Error('Invalid Instrument tone control schema');
  if(op===7){if(lane!==0||!Number.isInteger(value)||value<0||value>6||tau!==0)throw Error('Invalid Instrument filter type row');}
  else if(op===3){if(value!==0||tau!==0)throw Error('Invalid Instrument tone cancel row');}
  else{const valid=lane%4===0?value>=0&&value<=11000:lane%4===1?value>=0&&value<=100:lane%4===2?value>=-40&&value<=40:value>=-153600&&value<=153600;if(!valid||op===2&&tau===0||op!==2&&tau!==0)throw Error('Invalid Instrument tone parameter row');}
  this.words[0]=op;this.words[1]=lane;this.f64.encode(value,this.words,2);this.f64.encode(tau,this.words,6);this.f64.encode(seconds,this.words,10);return this.words;
 }
 decode(words,offset=0){if(!Number.isInteger(offset)||offset<0||offset+14>words.length)throw Error('Invalid Instrument tone word offset');const op=words[offset],lane=words[offset+1],value=this.f64.decode(words,offset+2),tau=this.f64.decode(words,offset+6),seconds=this.f64.decode(words,offset+10);this.encode(op,lane,value,tau,seconds);Object.assign(this,{op,lane,value,tau,seconds});return this;}
 apply(core,author){if(this.seconds!==author/core.rate)throw Error('Instrument tone seconds differ from captured author epoch');if(this.op===7)core.setType(this.value,author);else core.command(this.lane,this.op,this.value,this.tau,author,this.seconds);}
}
