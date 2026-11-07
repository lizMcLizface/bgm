import React from 'react';
import useFloating from '../ui/useFloating';
import './rack.css';

// A box of /synths/all placed on the desk like the other pages' floating panels (ui/useFloating): its grip, along the top edge, drags it anywhere
// on the desk; the place is remembered under `synths:all:<id>`, is kept in view and goes back with the desk's "Reset layout". `home` is where it
// starts, in the instrument's coordinates.
export default function FloatBox({id,label,home,className='',children}){
 const float=useFloating('synths:all:'+id,home);
 return <section className={'all-box '+className} aria-label={label} ref={float.ref} style={float.style} onPointerDownCapture={float.raise}>
  <div className="grip box-grip" {...float.handle} role="presentation"><i/></div>
  {children}
 </section>;
}
