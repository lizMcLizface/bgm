import {startTicker,stopTicker} from './ticker';
it('uses a worker and terminates it on stop, revoking the temporary script URL',()=>{
 const worker={postMessage:vi.fn(),terminate:vi.fn()},create=vi.fn(()=>'blob:ticker'),revoke=vi.fn();vi.stubGlobal('Worker',vi.fn(()=>worker));vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke});
 try{const tick=vi.fn(),timer=startTicker(tick,25);worker.onmessage({data:0});expect(tick).toHaveBeenCalledOnce();expect(worker.postMessage).toHaveBeenCalledWith('ack');expect(worker.postMessage).toHaveBeenCalledWith(25);expect(revoke).toHaveBeenCalledWith('blob:ticker');stopTicker(timer);expect(worker.onmessage).toBeNull();expect(worker.terminate).toHaveBeenCalledOnce();}finally{vi.unstubAllGlobals();}
});
it('falls back to an interval if worker creation fails, and cleans that up too',()=>{
 vi.useFakeTimers();vi.stubGlobal('Worker',vi.fn(()=>{throw Error('blocked');}));vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fallback',revokeObjectURL:vi.fn()});
 try{const tick=vi.fn(),timer=startTicker(tick,25);vi.advanceTimersByTime(50);expect(tick).toHaveBeenCalledTimes(2);stopTicker(timer);vi.advanceTimersByTime(100);expect(tick).toHaveBeenCalledTimes(2);}finally{vi.useRealTimers();vi.unstubAllGlobals();}
});
