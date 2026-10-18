// Host-routing metadata, outside either synth's append-only Wasm parameter ABI.
// Omitted fields inherit the ensemble defaults. Explicit zero disables a send.
export function sanitizeInstrumentEffects(raw){
 const out={};
 for(const [key,lo,hi]of [['delayMs',40,2000],['feedback',0,.85],['tone',300,14000],['send',0,.8],['roomSend',0,1],['roomDecay',.3,30]]){
  const n=raw?.[key];if(typeof n==='number'&&Number.isFinite(n))out[key]=Math.max(lo,Math.min(hi,n));
 }
 if(raw?.pingPong===0||raw?.pingPong===1)out.pingPong=raw.pingPong;
 if(raw?.room==='private'||raw?.room==='shared')out.room=raw.room;
 return out;
}
