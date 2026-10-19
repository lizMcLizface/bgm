// @vitest-environment node
import vm from 'node:vm';import {TICKER_WORKER_SOURCE} from './ticker';
it('allows at most one queued background wake-up until the page acknowledges it',()=>{let tick;const scope={postMessage:vi.fn(),setInterval:f=>(tick=f,1),clearInterval:vi.fn()};vm.runInNewContext(TICKER_WORKER_SOURCE,scope);scope.onmessage({data:50});for(let i=0;i<10000;i++)tick();expect(scope.postMessage).toHaveBeenCalledOnce();scope.onmessage({data:'ack'});tick();expect(scope.postMessage).toHaveBeenCalledTimes(2);scope.onmessage({data:0});expect(scope.clearInterval).toHaveBeenCalled();});
