import {describe,it,expect} from 'vitest';
import {isVisibleDeskItem,measureVisibleDesk,resetLayout} from './Desk';

describe('reset layout',()=>{
 it('resets all-page positions without deleting saved songs or generator preferences',()=>{
  localStorage.clear();
  for(const key of ['generator','mixer','keys-pos','scope-pos','win-lead','rack-bass','state','continuous-buffer'])
   localStorage.setItem('synths:all:'+key,JSON.stringify({x:1,y:2}));
  resetLayout();
  for(const key of ['generator','mixer','keys-pos','scope-pos','win-lead','rack-bass'])
   expect(localStorage.getItem('synths:all:'+key)).toBeNull();
  expect(localStorage.getItem('synths:all:state')).not.toBeNull();
  expect(localStorage.getItem('synths:all:continuous-buffer')).not.toBeNull();
  localStorage.clear();
 });

 describe('visible desk items',()=>{
  it('excludes hidden panels and their descendants from measurement',()=>{
   const panel=document.createElement('div'),child=document.createElement('div');
   panel.append(child);document.body.append(panel);
   expect(isVisibleDeskItem(panel)).toBe(true);
   panel.style.visibility='hidden';
   expect(isVisibleDeskItem(panel)).toBe(false);
   expect(isVisibleDeskItem(child)).toBe(false);
   panel.style.visibility='visible';
   panel.style.display='none';
   expect(isVisibleDeskItem(panel)).toBe(false);
   panel.remove();
  });
  it('fits visible All panels without the empty home area or hidden descendants',()=>{
   const home=document.createElement('div'),visible=document.createElement('div'),hidden=document.createElement('div'),child=document.createElement('div');
   visible.dataset.deskItem='';hidden.dataset.deskItem='';child.className='rig';
   hidden.setAttribute('aria-hidden','true');hidden.style.visibility='hidden';child.style.visibility='visible';
   hidden.append(child);home.append(visible,hidden);document.body.append(home);
   const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
   home.getBoundingClientRect=()=>rect(10,20,1500,1700);
   visible.getBoundingClientRect=()=>rect(110,220,500,300);
   hidden.getBoundingClientRect=()=>rect(10000,10000,500,300);
   child.getBoundingClientRect=()=>rect(20000,20000,500,300);
   expect(isVisibleDeskItem(child)).toBe(false);
   expect(measureVisibleDesk(home,1,false)).toEqual({l:100,t:200,r:600,b:500});
   expect(measureVisibleDesk(home,1,true)).toEqual({l:0,t:0,r:1500,b:1700});
   hidden.removeAttribute('aria-hidden');hidden.style.visibility='visible';child.style.visibility='';
   expect(measureVisibleDesk(home,1,false).r).toBe(20490);
   home.remove();
  });
 });
});
