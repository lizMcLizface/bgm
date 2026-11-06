import {describe,expect,it} from 'vitest';
import {KITS,ACCENT_VELOCITY,emptyPattern,foldAccent,validPattern,ARRANGEMENTS,arrangementBank} from './kits';
import {normalizeBank} from '../seq/bank';

const kit=KITS.tr808,n=kit.tracks.length,fold=foldAccent(kit);
const blank=()=>({patterns:[emptyPattern(kit)(),emptyPattern(kit)()],locks:[{},{'0:1':{velocity:.5}}],lengths:[16,16],tempos:[0,0],chain:[],current:0,names:['','']});

describe('folding the accent row into velocity',()=>{
 it('gives accented and unaccented hits the velocity that keeps their contrast, and empties the accent row',()=>{
  const bank=blank(),p=bank.patterns[0];
  p[0][0]=1;p[0][4]=1;p[0][8]=2;p[0][12]=1;      // four bass drum hits
  p[n][0]=3;p[n][4]=1;p[n][8]=2;                  // accent at steps 1, 5 and 9; none at 13
  const out=fold(bank);
  expect(out.patterns[0][n].every(v=>v===0)).toBe(true);
  expect(out.locks[0]['0:0'].velocity).toBe(ACCENT_VELOCITY[3]);
  expect(out.locks[0]['0:4'].velocity).toBe(ACCENT_VELOCITY[1]);
  expect(out.locks[0]['0:8'].velocity).toBe(ACCENT_VELOCITY[2]);
  expect(out.locks[0]['0:12'].velocity).toBe(ACCENT_VELOCITY[0]);
  expect(out.patterns[0][0][8]).toBe(2);          // a flam stays a flam
 });
 it('leaves a pattern without accents alone, and scales a velocity a step already had',()=>{
  const bank=blank();bank.patterns[1][0][1]=1;bank.patterns[1][n][5]=3;
  const out=fold(bank);
  expect(out.patterns[0]).toBe(bank.patterns[0]);
  expect(out.locks[1]['0:1'].velocity).toBe(+(.5*ACCENT_VELOCITY[0]).toFixed(2));
 });
 it('does nothing the second time, and is applied to every loaded arrangement',()=>{
  const bank=arrangementBank(kit,ARRANGEMENTS[0]);
  const once=normalizeBank(bank,{count:64,empty:emptyPattern(kit),valid:validPattern(kit),migrate:fold});
  expect(once.patterns.every(p=>p[n].every(v=>v===0))).toBe(true);
  expect(Object.keys(once.locks[0]).length).toBeGreaterThan(0);
  expect(fold(once)).toBe(once);
 });
});
