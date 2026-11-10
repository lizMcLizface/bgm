import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,afterEach} from 'vitest';
import PianoPreparationControls from './PianoPreparationControls';
import {PIANO_PREPARATION_KEY,recordPianoPreparation,resetPianoPreparationStats} from '../../app/engine/pianoPreparation';
let root,node;
afterEach(()=>{act(()=>root?.unmount());node?.remove();localStorage.removeItem(PIANO_PREPARATION_KEY);resetPianoPreparationStats();});
it('requires an explicit preparation choice, remembers it and shows actual Rust/fallback counters',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.append(node);root=createRoot(node);act(()=>root.render(<PianoPreparationControls/>));let select=node.querySelector('select');expect(select.value).toBe('legacy');act(()=>{select.value='rust';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(localStorage.getItem(PIANO_PREPARATION_KEY)).toBe('rust');recordPianoPreparation({renderer:'rust',body:true,version:'sample-version'});recordPianoPreparation({error:'test fallback'});act(()=>root.unmount());root=createRoot(node);act(()=>root.render(<PianoPreparationControls disabled/>));expect(node.querySelector('select').value).toBe('rust');expect(node.querySelector('select').disabled).toBe(true);expect(node.textContent).toContain('Rust notes: 1');expect(node.textContent).toContain('Rust bodies: 1');expect(node.textContent).toContain('fallbacks: 1');expect(node.textContent).toContain('test fallback');
});
