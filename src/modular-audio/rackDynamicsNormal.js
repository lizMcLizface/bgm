import{prepareRackDynamicsCalls}from'./rackDynamicsCallsBrowser.js';
import{RustRackDynamics}from'./rackDynamicsRust.js';
/** Preserves each legacy lane's own currentTime read and original call order. */
export async function prepareNormalRackDynamics(context){const assets=await prepareRackDynamicsCalls(context),factory=(ac,options={})=>{if(ac!==context)throw Error('Normal rack dynamics factory belongs to another context');return new RustRackDynamics(ac,assets,{...options,transport:'calls'});};Object.defineProperties(factory,{engineVersion:{value:assets.manifest.version},controlContract:{value:'original-per-lane-currentTime'},slots:{value:32}});return Object.freeze(factory);}
