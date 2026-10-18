import {createEffectsBus,effectsMemoryBytes} from './effects';
import {sanitizeEffects,EFFECTS} from './effectsConfig';
import {createNativeEcho} from './nativeEcho';
import {sanitizeInstrumentEffects} from './instrumentEffectsConfig';

/** Three independent inputs: dry, room and echo, before global send levels. */
export async function createRoutedEffects(context,raw,{kind='wasm',onStats=()=>{},onError=()=>{}}={}){
 if(!['wasm','hybrid','local','dry'].includes(kind))throw Error('Unknown routed effects path.');
 const p=sanitizeEffects(raw),nodes=[],own=n=>(nodes.push(n),n),level=value=>{const n=own(context.createGain());n.gain.value=value;return n;};
 const inputs=[level(1),level(1),level(1)];let room,echo,echoRoomInput;
 try{
  if(kind==='dry'||p.bypass){
   const out=level(p.dry);inputs[0].connect(out);
   return {inputs,connect:d=>out.connect(d),memoryBytes:0,dispose:()=>nodes.forEach(n=>n.disconnect())};
  }
  if(kind==='wasm'){
   room=await createEffectsBus(context,p,{onStats,onError});inputs.forEach((n,i)=>n.connect(room.node,0,i));
  }else{
   // The kernel's send range stops at .8. Scale the external room sum so it
   // enters the FDN at unity, independently of the direct reverb-send setting.
   const unitySend=EFFECTS.find(([key])=>key==='reverb')[3];
   room=await createEffectsBus(context,{...p,dry:1,reverb:unitySend,delay:0,delayToReverb:0},{onStats,onError});
   const dry=level(p.dry),send=level(p.reverb/unitySend);inputs[0].connect(dry);dry.connect(room.node,0,0);inputs[1].connect(send);send.connect(room.node,0,1);
   if(kind==='local'){
    // External echoes have their own wet send and room send. Do not apply
    // either global send again; dry=0 must not mute the echo's room return.
    inputs[2].connect(room.node,0,0);echoRoomInput=level(1/unitySend);echoRoomInput.connect(room.node,0,1);
   }else if(p.delay>0){echo=await createNativeEcho(context,p);inputs[2].connect(echo.input);echo.output.connect(room.node,0,0);
    const intoRoom=level(p.delayToReverb/unitySend);echo.output.connect(intoRoom);intoRoom.connect(room.node,0,1);
   }
  }
  return {inputs,echoRoomInput,connect:d=>room.connect(d),clear(){room.clear();echo?.clear?.();},memoryBytes:await effectsMemoryBytes(),nativeDelayCount:echo?1:0,nativeDelayCompensationFrames:echo?.compensationFrames??0,dispose(){nodes.forEach(n=>n.disconnect());echo?.dispose();room.dispose();}};
 }catch(e){nodes.forEach(n=>n.disconnect());echo?.dispose();room?.dispose();throw e;}
}

/** One instrument's delay feeds a selected room without allocating another FDN. */
export async function createInstrumentEffects(context,room,settings){
 if(!room.echoRoomInput)throw Error('Instrument delays require a local-effects room.');
 settings={send:0,roomSend:0,...sanitizeInstrumentEffects(settings)};
 const input=context.createGain(),send=context.createGain();send.gain.value=settings.roomSend;
 let echo;
 try{
  if(settings.send>0){
   echo=await createNativeEcho(context,{delay:settings.send,delayMs:settings.delayMs,feedback:settings.feedback,tone:settings.tone,pingPong:settings.pingPong});
   input.connect(echo.input);echo.output.connect(room.inputs[2]);echo.output.connect(send);send.connect(room.echoRoomInput);
  }
  return {inputs:[room.inputs[0],room.inputs[1],input],sendLevels:{delay:1},clear:()=>echo?.clear?.(),nativeDelayCount:echo?1:0,nativeDelayCompensationFrames:echo?.compensationFrames??0,dispose(){input.disconnect();send.disconnect();echo?.dispose();}};
 }catch(e){input.disconnect();send.disconnect();echo?.dispose();throw e;}
}

export function connectEnsembleChannel(context,source,bus,part){
 const amp=context.createGain(),pan=context.createStereoPanner(),sends=[];
 amp.gain.value=part.gain;pan.pan.value=part.pan;source.connect(amp);amp.connect(pan);
 ['dry','reverb','delay'].forEach((key,i)=>{const n=context.createGain();n.gain.value=bus.sendLevels?.[key]??part.sends[key];pan.connect(n);n.connect(bus.inputs[i]);sends.push(n);});
 return {gain:amp.gain,dispose(){source.disconnect(amp);amp.disconnect();pan.disconnect();sends.forEach(n=>n.disconnect());}};
}
