import{OwnedInstrumentDelay}from'./ownedInstrumentDelay.js';
import{InstrumentDelayWordCodec}from'./instrumentDelayLiveWords.js';
/** Same accepted Rust state/DSP, with bounded live commands rather than a
 * growing numerical replay recipe. No captured-command objects per callback. */
export class OwnedInstrumentDelayLive extends OwnedInstrumentDelay{
 constructor(...args){super(...args);this.codec=new InstrumentDelayWordCodec();}
 command(lane,op,value,tau,author=this.stat(0),seconds=author/this.rate){this.alive();this.codec.encode(op,lane,value,tau,seconds);if(this.mode==='delay'&&[1,2,6].includes(lane))throw Error('Absent original Delay lane');this.check(this.e.instrument_delay_command(this.handle,lane,op,value,tau,author,seconds),'live command');}
}
