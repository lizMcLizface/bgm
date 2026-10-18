import React,{act,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LabRouter,{labRoute} from './LabRouter';

it('keeps the same bench session through family links, the hub and browser history',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;history.replaceState(null,'','/labs/keys/?runner=keys&seed=7');
 const mounts=vi.fn(),unmounts=vi.fn();
 function Bench({family}){const [level,setLevel]=useState(0);useEffect(()=>{mounts();return unmounts;},[]);return <><h1>{family}</h1><button onClick={()=>setLevel(level+1)}>Level {level}</button><a href="/labs/strings/">Strings</a><a href="/labs/">Hub</a></>;}
 const Home=()=> <a href="/labs/drones/">Drones</a>;
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 act(()=>root.render(<LabRouter Bench={Bench} Home={Home}/>));act(()=>node.querySelector('button').click());act(()=>node.querySelector('a').click());
 expect(location.pathname).toBe('/labs/strings/');expect(location.search).toBe('?runner=keys&seed=7');expect(node.querySelector('h1').textContent).toBe('strings');expect(node.querySelector('button').textContent).toBe('Level 1');
 act(()=>[...node.querySelectorAll('a')].find(e=>e.textContent==='Hub').click());expect(node.querySelector('[hidden]')).not.toBeNull();expect(unmounts).not.toHaveBeenCalled();
 act(()=>[...node.querySelectorAll('a')].find(e=>e.textContent==='Drones').click());expect(node.querySelector('h1').textContent).toBe('drones');expect(node.querySelector('button').textContent).toBe('Level 1');
 act(()=>{history.replaceState(null,'','/labs/keys/');window.dispatchEvent(new PopStateEvent('popstate'));});expect(node.querySelector('h1').textContent).toBe('keys');expect(mounts).toHaveBeenCalledOnce();
 act(()=>root.unmount());expect(unmounts).toHaveBeenCalledOnce();node.remove();history.replaceState(null,'','/');delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
it('recognises only the lab hub and known family routes',()=>{
 expect(labRoute('/labs')).toBeNull();expect(labRoute('/labs/choir/')).toBe('choir');expect(labRoute('/labs/all/')).toBe('all');expect(labRoute('/tools/fm.html')).toBeUndefined();expect(labRoute('/labs/unknown')).toBeUndefined();expect(labRoute('/labs/keys/editor')).toBeUndefined();
});
