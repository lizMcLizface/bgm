import {describe,it,expect} from 'vitest';
import {movePlayhead} from './playhead';

describe('playhead',()=>{
 it('maps underlying steps to the visible grid resolution',()=>{
  const grid=document.createElement('div');
  grid.style.setProperty('--step-size','4');
  grid.style.setProperty('--off','5');
  movePlayhead(grid,{running:true,step:27});
  expect(grid.style.getPropertyValue('--step')).toBe('6');
  expect(grid.dataset.out).toBe('0');
  movePlayhead(grid,{running:true,step:19});
  expect(grid.dataset.out).toBe('1');
 });
});
