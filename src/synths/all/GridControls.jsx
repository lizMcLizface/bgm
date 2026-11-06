import React from 'react';
import Encoder from '../seq/Encoder';

export default function GridControls({horizontal,vertical}) {
 return <div className="lane-scroll grid-controls">
  {[horizontal,vertical].map((control,i)=><div className="grid-control" key={i}>
   <Encoder {...control}/>
   <span className="scroll-more" aria-hidden="true">{control.display}</span>
  </div>)}
 </div>;
}
