import{AudioConstructorJournal}from'../../audio/constructorJournal.js';
/** Owns only explicitly created private frontend nodes; never traverses a context. */
export function fdnFrontendConstruction(context,{capacity=16,label="Prepared FDN Native frontend"}={}){
 const journal=new AudioConstructorJournal({capacity,label}),methods=new Map();
 const view=new Proxy(context,{get(target,key){const value=Reflect.get(target,key,target);if(['createGain','createDelay','createBiquadFilter','createStereoPanner'].includes(key)){if(!methods.has(key))methods.set(key,(...args)=>journal.create('FDN '+key,()=>Reflect.apply(value,target,args),node=>node.disconnect()));return methods.get(key);}return typeof value==='function'?value.bind(target):value;}});
 return{context:view,journal,createOwner:(label,make,release)=>{let entered=false;try{return journal.create(label,()=>{entered=true;return make();},release);}catch(error){if(entered&&!error?.cleanupReady?.then){const uncertain=Object.assign(Error('Unreturned prepared FDN factory has no partial-owner proof'),{code:'FDN_FACTORY_PREFIX_UNCERTAIN'});error.cleanupReady=Promise.reject(uncertain);error.cleanupReady.catch(()=>{});}throw error;}},close:()=>journal.retire(),failure:error=>journal.failure(error),status:()=>journal.status()};
}
