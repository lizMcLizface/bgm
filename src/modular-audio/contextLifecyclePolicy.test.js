import{describe,it,expect,vi}from'vitest';
import{CONTINUOUS_PREPARED_CONTEXT as policy,validateContextLifecyclePolicy,preparedContextAllowsIdleSuspend}from'./contextLifecyclePolicy.js';
import{idleSuspender}from'../audio/idleContext.js';
describe('explicit continuous prepared context policy',()=>{
 it('leaves Native and omitted prepared policies eligible for idle sleep',()=>{expect(preparedContextAllowsIdleSuspend(null)).toBe(true);expect(preparedContextAllowsIdleSuspend({})).toBe(true);expect(Object.isFrozen(policy)).toBe(true);});
 it('prevents actual automatic suspend admission without replacing context methods',async()=>{const context={state:'running',currentTime:0,resume:vi.fn(async()=>{context.state='running';}),suspend:vi.fn(async()=>{context.state='suspended';})},suspend=context.suspend;await idleSuspender(context,()=>preparedContextAllowsIdleSuspend({contextLifecycle:policy}))();expect(context.suspend).toBe(suspend);expect(suspend).not.toHaveBeenCalled();await idleSuspender(context,()=>preparedContextAllowsIdleSuspend(null))();expect(suspend).toHaveBeenCalledOnce();});
 it('rejects unknown, mutable-in-place and falsely permissive authority declarations',()=>{for(const candidate of[null,{}, {...policy,autoSuspend:true},{...policy,authorityVersion:'8ca7d41660b2a010'},{...policy,version:2},{...policy,extra:true}])expect(()=>validateContextLifecyclePolicy(candidate)).toThrow('lifecycle policy');expect(validateContextLifecyclePolicy({...policy})).toEqual(policy);});
});
