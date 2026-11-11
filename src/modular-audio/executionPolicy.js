// Preparation-time host capability policy, independent of browser globals.
// Direct/offline ReferenceGraph remains usable for compatibility measurement.
export function workerOnlyModules(patch,contracts){
 const modules=Array.isArray(patch?.modules)?patch.modules:[],descriptors=Array.isArray(contracts?.modules)?contracts.modules:[];
 return modules.filter(n=>n.type==='voice.freeze'||descriptors.some(d=>d.type===n.type&&d.version===n.version&&d.execution==='worker-only')).map(n=>({id:n.id,type:n.type,version:n.version}));
}
export function workerRequiredMessage(modules){return `Worker executor required for ${modules.map(n=>`${n.type}${n.id===undefined?'':` (module ${n.id})`}`).join(', ')}; serial realtime playback is unavailable.`;}
export function assertSerialRealtimeAllowed(patch,contracts){const modules=workerOnlyModules(patch,contracts);if(modules.length)throw Error(workerRequiredMessage(modules));}
