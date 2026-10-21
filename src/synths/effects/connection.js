// A control connection, not an audio stream. Only the explicitly selected
// session accepts an edit; two tabs playing the same synth stay independent.
export const RACK_CHANNEL='calmbgm:synth-effects:v1';
export function serveRack({id,snapshot,edit,clear,Channel=globalThis.BroadcastChannel}){
 if(!Channel)return {publish(){},close(){}};
 let channel;try{channel=new Channel(RACK_CHANNEL);}catch{return {publish(){},close(){}};}
 let closed=false;
 const publish=()=>{if(!closed)channel.postMessage({type:'state',id,...snapshot()});};
 channel.onmessage=({data})=>{
  if(data?.type==='discover')publish();
  else if(data?.target===id&&data.type==='edit'&&data.values&&typeof data.values==='object'&&!Array.isArray(data.values))edit(data.values);
  else if(data?.target===id&&data.type==='clear')clear();
 };
 const heartbeat=setInterval(publish,2000);publish();
 return {publish,close(){if(closed)return;closed=true;clearInterval(heartbeat);channel.postMessage({type:'gone',id});channel.close();}};
}
