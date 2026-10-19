// Only the main page's explicit inactive state may suspend its shared context.
// A silent rest during playback, held keys, and ambience keep it running.
export function idleSuspender(context,canSleep){
 let pending=false;
 return async()=>{
  if(pending||!canSleep()||context.state!=='running')return;
  pending=true;
  try{await context.suspend();if(!canSleep())await context.resume();}
  catch{/* Interruption/autoplay policy belongs to the browser. */}
  finally{pending=false;}
 };
}
