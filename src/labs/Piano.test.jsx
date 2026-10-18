import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import Piano from './Piano';
it('shows scale tones, chord intervals and held notes with unCAGED key geometry',()=>{
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 act(()=>root.render(<Piano low={60} high={71} scale={[0,2,4,5,7,9,11]} chord={[0,4,7]} active={[64]} root={0}/>));expect(node.querySelectorAll('.white')).toHaveLength(7);expect(node.querySelectorAll('.black')).toHaveLength(5);expect(node.querySelectorAll('.chord')).toHaveLength(3);expect(node.querySelectorAll('.scale')).toHaveLength(4);expect(node.querySelector('[data-midi="64"]').getAttribute('aria-pressed')).toBe('true');expect(node.querySelector('[data-midi="64"] span').textContent).toBe('M3');expect(node.querySelector('[data-midi="61"]').style.left).toMatch(/9\.714/);act(()=>root.unmount());node.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
