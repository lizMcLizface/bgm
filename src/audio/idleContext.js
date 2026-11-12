import{requestContextIdle}from'../modular-audio/contextPreparationRegistry';
// Only the main page's explicit inactive state may suspend its shared context.
// Preparation reservations also keep the Native context alive until owner ACKs.
export function idleSuspender(context,canSleep){
 let pending=false;
 return async()=>{
  if(pending)return;
  pending=true;
  try{await requestContextIdle(context,canSleep);}
  catch{/* Interruption/autoplay policy belongs to the browser. */}
  finally{pending=false;}
 };
}
