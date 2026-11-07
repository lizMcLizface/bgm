import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Meter} from './deskParts';

it('lights the low segments first and the high segments last',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.createElement('div'),root=createRoot(container);
 act(()=>root.render(<Meter level={3/14}/>));
 const leds=[...container.querySelectorAll('.dk-meter i')];
 expect(leds.slice(0,3).every(led=>led.className==='on')).toBe(true);
 expect(leds.slice(3).every(led=>led.className==='')).toBe(true);
 expect(leds.every(led=>!led.style.order)).toBe(true);
 act(()=>root.render(<Meter level={1}/>));
 expect(leds.at(-1).className).toBe('hot');
 act(()=>root.unmount());
 delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
