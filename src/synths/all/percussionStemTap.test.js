import {it,expect,vi} from 'vitest';
import {defaultDrumKit} from '../../app/percussion';
import {percussionStemTap} from './percussionStemTap';
const ready=()=>({kind:'percussion',module:new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])),node:{},voicePreset:'hand',model:'hand',kit:{...defaultDrumKit(),room:0},hitCount:41,wake:vi.fn(),silence:vi.fn(),dispose:vi.fn()});
it('captures the actual ready dry Wasm kit without changing its live counters, wake state or source routes',()=>{
 const i=ready(),input={},tap=percussionStemTap(i,{input});expect(tap.input).toBe(input);expect(tap.kit.voice).toBe('hand');expect(tap.hitBase).toBe(41);expect(tap.kit.drums).toHaveLength(14);i.hitCount++;tap.assertCurrent();expect(i.wake).not.toHaveBeenCalled();expect(i.silence).not.toHaveBeenCalled();i.kit.kick.level=.2;expect(tap.kit.drums[0].level).toBe(1);expect(()=>tap.assertCurrent()).toThrow('source changed');
});
it('rejects native/classic/loading/error/wet/disposed/mismatched kits rather than substituting another engine',()=>{
 for(const edit of [i=>delete i.kind,i=>delete i.node,i=>delete i.module,i=>i.error=Error('failed'),i=>i.disposed=true,i=>i.kit.room=.1,i=>i.model='808',i=>i.voicePreset='unknown',i=>i.kit.hat.on=1,i=>i.hitCount=2**32]){const i=ready();edit(i);expect(()=>percussionStemTap(i,{input:{}})).toThrow();}
 expect(()=>percussionStemTap(ready(),{input:{},machine:true})).toThrow('Classic');const i=ready(),tap=percussionStemTap(i,{input:{}},()=>{if(i.closed)throw Error('host closed');});i.closed=true;expect(()=>tap.assertCurrent()).toThrow('host closed');
});
