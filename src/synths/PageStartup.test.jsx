import React,{act,lazy} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,afterEach,beforeAll,afterAll} from 'vitest';
import PageStartup,{freshPageUrl} from './PageStartup';
let root,container;
const previousActEnvironment=globalThis.IS_REACT_ACT_ENVIRONMENT;
beforeAll(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;});
afterAll(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=previousActEnvironment;});
function mount(element){container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);act(()=>root.render(element));}
afterEach(()=>{act(()=>root?.unmount());container?.remove();root=null;vi.useRealTimers();vi.restoreAllMocks();});
it('offers recovery for a stalled page while allowing its late import to finish without resetting the page',async()=>{
 vi.useFakeTimers();let resolve;const Page=lazy(()=>new Promise(r=>resolve=r)),reload=vi.fn();localStorage.setItem('startup-test','keep');
 mount(<PageStartup reload={reload}><Page/></PageStartup>);expect(container.textContent).toContain('Warming up');
 act(()=>vi.advanceTimersByTime(10000));expect(container.querySelector('[data-startup-state="slow"]')).not.toBeNull();act(()=>container.querySelector('button').click());expect(reload).toHaveBeenCalledTimes(1);expect(localStorage.getItem('startup-test')).toBe('keep');localStorage.removeItem('startup-test');
 await act(async()=>resolve({default:()=> <p>Workbench ready</p>}));expect(container.textContent).toBe('Workbench ready');
});
it('shows the actual failed import instead of leaving an unexplained warmup or blank page',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});const Page=lazy(()=>Promise.reject(Error('Failed to fetch dynamically imported module: /assets/AllPage-old.js'))),reload=vi.fn();
 await act(async()=>mount(<PageStartup reload={reload}><Page/></PageStartup>));expect(container.querySelector('[data-startup-state="error"]')).not.toBeNull();expect(container.textContent).toContain('/assets/AllPage-old.js');act(()=>container.querySelector('button').click());expect(reload).toHaveBeenCalledTimes(1);
});
it('cancels the slow notice timer when leaving a pending page',()=>{vi.useFakeTimers();const Page=lazy(()=>new Promise(()=>{}));mount(<PageStartup><Page/></PageStartup>);act(()=>root.unmount());root=null;expect(vi.getTimerCount()).toBe(0);});
it('requests fresh HTML without losing routing, front-page links or hashes and replaces an old reload marker',()=>{const url=new URL(freshPageUrl('http://127.0.0.1:4175/synths/all/?perf=1&_reload=old#song',123));expect(url.pathname).toBe('/synths/all/');expect(url.searchParams.get('perf')).toBe('1');expect(url.searchParams.getAll('_reload')).toEqual(['123']);expect(url.hash).toBe('#song');});
