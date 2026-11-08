import React from 'react';
import useFloating from './useFloating';

// A hosted instrument can own its normal case and grip on the desk. Mount the
// adapter with the loaded panel so its ref is ready for object measurement.
export default function FloatingInstrumentCase({object,className='',children}){
 const floating=useFloating(object.key,object.home,{spawnOnly:true,rotatable:true});
 return <div className={'synth instrument bound '+className+' '+(object.className??'')} aria-label={object.label} ref={floating.ref} style={floating.style} onPointerDownCapture={floating.raise}>
  <div className="rig">
   <div className="grip rig-grip" {...floating.handle}><i/></div>
   {children}
  </div>
 </div>;
}
