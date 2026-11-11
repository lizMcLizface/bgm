// @vitest-environment node
import {it,expect,vi} from 'vitest';
import Compressor from './compressor.js';
it('keeps the original native defaults and setter timestamps without a factory',()=>{
 const node=Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,{value:key==='attack'?.003:key==='release'?.25:0,setValueAtTime:vi.fn()}]));node.connect=vi.fn();
 const context={currentTime:31.5,createDynamicsCompressor:vi.fn(()=>node)},stage=new Compressor(context);
 expect(stage.getNode()).toBe(node);expect(node.attack.value).toBe(.005);expect(node.release.value).toBe(.05);
 stage.setThreshold(-6);stage.setRatio(20);stage.setKnee(0);stage.setAttack(.1);stage.setRelease(1);
 for(const[key,value]of[['threshold',-6],['ratio',20],['knee',0],['attack',.1],['release',1]])expect(node[key].setValueAtTime).toHaveBeenCalledWith(value,31.5);
});
it('forwards prepared runtime options to the explicit factory and creates no native node',()=>{
 const context={createDynamicsCompressor:vi.fn()},result={getNode:()=>null,connect:()=>{}},factory=vi.fn(()=>result),settings={threshold:-6};
 expect(new Compressor(context,{factory,hostAwake:false,settings})).toBe(result);
 expect(factory).toHaveBeenCalledWith(context,{hostAwake:false,settings});expect(context.createDynamicsCompressor).not.toHaveBeenCalled();
 expect(()=>new Compressor(context,{factory:{}})).toThrow('prepared function');
 expect(()=>new Compressor(context,{factory:()=>null})).toThrow('synchronous stage');
 expect(()=>new Compressor(context,{factory:()=>Promise.resolve(result)})).toThrow('synchronous stage');
});
