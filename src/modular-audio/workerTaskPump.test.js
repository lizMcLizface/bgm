// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {WorkerTaskPump} from './workerTaskPump';
import {workerOptions} from './workerProtocol';
it('keeps timers as the default and validates the experimental scheduling contract',()=>{expect(workerOptions().scheduling).toBe('timer');expect(workerOptions({scheduling:'message'}).scheduling).toBe('message');expect(()=>workerOptions({scheduling:'microtask'})).toThrow();});
function host(){
  const tasks=[],timers=new Map();let id=0,closed=0;
  const options={makeChannel:()=>{const port1={onmessage:null,close(){closed++;}};return {port1,port2:{postMessage(){tasks.push(()=>port1.onmessage({data:0}));},close(){closed++;}}};},setTimer:(fn,delay)=>{const key=++id;timers.set(key,{fn,delay});return key;},clearTimer:key=>timers.delete(key)};
  return {options,tasks,timers,closed:()=>closed,task:()=>tasks.shift()(),timer:()=>{const [key,t]=timers.entries().next().value;timers.delete(key);t.fn();return t.delay;}};
}
it('coalesces requests into one posted task, yields after one block and never uses a zero-delay timer',()=>{
  const h=host(),order=[];let pump,blocks=0;
  pump=new WorkerTaskPump(()=>{order.push(++blocks);if(blocks<8)pump.schedule();},h.options);
  expect(pump.schedule()).toBe(true);for(let i=0;i<20;i++)expect(pump.schedule()).toBe(false);
  expect(blocks).toBe(0);expect(h.tasks).toHaveLength(1);h.task();expect(blocks).toBe(1);expect(h.tasks).toHaveLength(1);
  order.push('control between blocks');while(h.tasks.length){expect(h.tasks).toHaveLength(1);h.task();}
  expect(order).toEqual([1,'control between blocks',2,3,4,5,6,7,8]);expect(h.timers.size).toBe(0);
  expect(pump.snapshot()).toMatchObject({postedTasks:8,handledTasks:8,pendingTask:false,waitingForStall:false,stallTimers:0});pump.dispose();
});
it('uses real timers only for explicit positive stalls, then posts the next render task',()=>{
  const h=host();let blocks=0;const pump=new WorkerTaskPump(()=>blocks++,h.options);
  expect(pump.schedule(250)).toBe(true);expect(pump.schedule()).toBe(false);expect(h.tasks).toHaveLength(0);expect(h.timers.size).toBe(1);
  expect(h.timer()).toBe(250);expect(blocks).toBe(0);expect(h.tasks).toHaveLength(1);h.task();expect(blocks).toBe(1);
  expect(pump.snapshot()).toMatchObject({postedTasks:1,handledTasks:1,stallTimers:1,waitingForStall:false});pump.dispose();
});
it('cancels timer or already posted work on disposal and keeps independent pumps isolated',()=>{
  const a=host(),b=host();let first=0,second=0;
  const p=new WorkerTaskPump(()=>first++,a.options),q=new WorkerTaskPump(()=>second++,b.options);
  p.schedule();q.schedule();p.dispose();p.dispose();a.task();b.task();expect(first).toBe(0);expect(second).toBe(1);expect(a.closed()).toBe(2);expect(p.schedule()).toBe(false);
  q.schedule(250);q.dispose();expect(b.timers.size).toBe(0);expect(b.closed()).toBe(2);expect(q.snapshot()).toMatchObject({disposed:true,pendingTask:false,waitingForStall:false});
});
it('calls default host timers without rebinding their receiver to the pump',()=>{
  const h=host();
  vi.stubGlobal('setTimeout',function(fn,delay){expect(this).not.toBeInstanceOf(WorkerTaskPump);return h.options.setTimer(fn,delay);});
  vi.stubGlobal('clearTimeout',function(id){expect(this).not.toBeInstanceOf(WorkerTaskPump);h.options.clearTimer(id);});
  try{const pump=new WorkerTaskPump(()=>{}, {makeChannel:h.options.makeChannel});pump.schedule(250);expect(h.timers.size).toBe(1);pump.dispose();expect(h.timers.size).toBe(0);}finally{vi.unstubAllGlobals();}
});
