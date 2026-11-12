import FdnRoom from'../app/engine/fdnRoom.js';
/** Transitional prepared FDN bus adoption; original Native frontend is explicit. */
export function createPreparedFdnRoomFactory(context,createEffectsBus){
 if(!context?.audioWorklet||typeof createEffectsBus!=='function')throw Error('Prepared FDN requires its context-bound effects factory');
 const factory=(actual,type='reverb3',options={})=>{if(actual!==context)throw Error('FDN factory belongs to another context');return new FdnRoom(actual,type,{...options,busFactory:createEffectsBus});};
 factory.backend='owned-rust-fdn-with-original-native-frontend';factory.context=context;return Object.freeze(factory);
}
