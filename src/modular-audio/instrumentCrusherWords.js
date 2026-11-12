import{StampedFloat64Words}from'./stampedWordTransport.js';
export const CRUSHER_WORD_OPTIONS=Object.freeze({wordCount:14,slots:32,prefix:'crusher'});
export function validateCrusherValue(v,label='control'){if(typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(Math.fround(v)))throw Error('Invalid original BitCrusher '+label);return v;}
export function validateCrusherPreset(p={}){if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid original BitCrusher preset');const bits=p.bits??8,amount=p.amount??0;validateCrusherValue(bits,'bits');validateCrusherValue(amount,'amount');const dry=amount<.5?1:1-((amount-.5)*2),wet=amount<.5?amount*2:1;validateCrusherValue(dry,'dry');validateCrusherValue(wet,'wet');return p;}
/** TARGET, BIRTH, RETIRE; raw Float64 control values + literal authored seconds.
 * BIRTH preserves constructor parameterData clamps and resets only raw history. */
export class InstrumentCrusherWordCodec{
 constructor(){this.f64=new StampedFloat64Words();this.words=new Uint16Array(14);this.op=0;this.lane=0;this.value=0;this.extra=0;this.seconds=0;}
 encode(op,lane,value,extra,seconds){if(![0,1,2].includes(op)||!Number.isInteger(lane)||lane<0||lane>3||op!==0&&lane!==0||op===2&&(value!==0||extra!==0)||op===0&&extra!==0)throw Error('Invalid original BitCrusher control schema');validateCrusherValue(value);validateCrusherValue(extra);if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0)throw Error('Invalid original BitCrusher seconds');this.words[0]=op;this.words[1]=lane;this.f64.encode(value,this.words,2);this.f64.encode(extra,this.words,6);this.f64.encode(seconds,this.words,10);return this.words;}
 decode(words,offset=0){if(!Number.isInteger(offset)||offset<0||offset+14>words.length)throw Error('Invalid original BitCrusher word offset');const op=words[offset],lane=words[offset+1],value=this.f64.decode(words,offset+2),extra=this.f64.decode(words,offset+6),seconds=this.f64.decode(words,offset+10);this.encode(op,lane,value,extra,seconds);Object.assign(this,{op,lane,value,extra,seconds});return this;}
 apply(core,author){if(this.seconds!==author/core.rate)throw Error('Original BitCrusher seconds differ from authored epoch');if(this.op===0)core.set(this.lane,this.value,author,this.seconds);else if(this.op===1)core.birth(this.value,this.extra);else core.retire();}
}
