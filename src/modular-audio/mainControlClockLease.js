import{reserveContextPreparation}from'./contextPreparationRegistry.js';
import{prepareNativeContextClock}from'./nativeContextClock.js';
const leases=new WeakSet(),KEY='generator-main-control-native-clock-v1';
const acquire=async({context})=>{const value=await prepareNativeContextClock(context);return{context,value,release:()=>value.dispose()};};
/** The session holds the clock itself. Metadata consumers only retain their
 * own wires; they cannot stand in for this shared controller lifetime. */
async function retain(context,{signal,cold=false}={}){
 if(cold&&(context?.state!=='suspended'||context.currentTime!==0))throw Error('Main session clock must be retained before first Native wake');
 const ticket=reserveContextPreparation(context,{label:'generator-main-control-clock',allowCold:true,signal});let scope;
 try{await ticket.ready;const value=await ticket.shared(KEY,acquire);if(cold&&(context.state!=='suspended'||context.currentTime!==0))throw Error('Main session clock lost its cold prerequisite');scope=ticket.publish(()=>value);let closed=false,closing;const lease=Object.freeze({profile:KEY,context,value,retain(options){if(closed)throw Error('Retired Main clock lease');return retain(context,options);},release(){if(!closing){closed=true;closing=scope.retire();}return closing;},status:()=>({closed,scope:scope.snapshot()})});leases.add(lease);return lease;}catch(primary){try{if(scope)await scope.retire();else await ticket.cancel(primary);}catch(cleanupError){primary.cleanupError=cleanupError;}throw primary;}
}
export const prepareMainControlClock=(context,options={})=>retain(context,{...options,cold:true});
export const isMainControlClockLease=value=>leases.has(value);
