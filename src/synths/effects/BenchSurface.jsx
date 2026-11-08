import React from 'react';
import useFloating from '../ui/useFloating';
import {positions,positionKey} from './deskState';
export default function BenchSurface({id,title,className='',children}){
 const floating=useFloating(positionKey(id),positions[id],{spawnOnly:true,rotatable:true});
 return <section className={'effects-desk-box '+className} aria-label={title} ref={floating.ref} style={floating.style} onPointerDownCapture={floating.raise}>
  <header className="effects-box-grip" {...floating.handle}><strong>{title}</strong><i/><small>Drag to move · right-drag to rotate</small></header>
  {children}
 </section>;
}
