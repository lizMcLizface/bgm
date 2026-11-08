import {LabMidi} from './input';

const original=Object.fromEntries(['requestMIDIAccess','permissions'].map(k=>[k,Object.getOwnPropertyDescriptor(navigator,k)]));
let input,access,request,query,callbacks;
beforeEach(()=>{
 input={id:'piano',name:'Piano',state:'connected',onmidimessage:null};access={inputs:new Map([['piano',input]]),onstatechange:null};request=vi.fn(async()=>access);query=vi.fn(async()=>({state:'granted'}));
 Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:request});Object.defineProperty(navigator,'permissions',{configurable:true,value:{query}});
 callbacks={on:vi.fn(),off:vi.fn(),sustain:vi.fn(),control:vi.fn(),panic:vi.fn(),onStatus:vi.fn()};
});
afterEach(()=>{for(const [key,descriptor] of Object.entries(original))if(descriptor)Object.defineProperty(navigator,key,descriptor);else delete navigator[key];});

it('reconnects granted MIDI once, retains device/channel filters and handles unplug/replug',async()=>{
 const midi=new LabMidi(callbacks);midi.selected='piano';midi.channel='2';await Promise.all([midi.reconnect(),midi.reconnect()]);
 expect(query).toHaveBeenCalledWith({name:'midi',sysex:false});expect(request).toHaveBeenCalledOnce();expect(request).toHaveBeenCalledWith({sysex:false});
 input.onmidimessage({data:[144,60,127]});expect(callbacks.on).not.toHaveBeenCalled();input.onmidimessage({data:[145,60,127]});expect(callbacks.on).toHaveBeenCalledWith('midi:piano:1:60',60,1);
 input.state='disconnected';access.onstatechange();expect(input.onmidimessage).toBeNull();expect(callbacks.onStatus).toHaveBeenLastCalledWith([]);
 input.state='connected';access.onstatechange();expect(input.onmidimessage).toBeTypeOf('function');expect(await midi.reconnect()).toBe(true);expect(request).toHaveBeenCalledOnce();midi.dispose();
});
it('does not prompt when permission is unknown, denied, or cannot be queried',async()=>{
 const midi=new LabMidi(callbacks);
 for(const state of ['prompt','denied']){query.mockResolvedValueOnce({state});expect(await midi.reconnect()).toBe(false);}
 query.mockRejectedValueOnce(new TypeError('Unsupported permission'));expect(await midi.reconnect()).toBe(false);expect(request).not.toHaveBeenCalled();midi.dispose();
});
it('does not bind a MIDI access result that arrives after disposal',async()=>{
 let resolve;request.mockImplementation(()=>new Promise(r=>resolve=r));const midi=new LabMidi(callbacks),pending=midi.connect();midi.dispose();resolve(access);await pending;
 expect(input.onmidimessage).toBeNull();expect(access.onstatechange).toBeNull();expect(callbacks.onStatus).not.toHaveBeenCalled();
});
it('cancels a late permission check and allows retrying a failed access request',async()=>{
 let resolve;query.mockImplementationOnce(()=>new Promise(r=>resolve=r));const disposed=new LabMidi(callbacks),pending=disposed.reconnect();disposed.dispose();resolve({state:'granted'});expect(await pending).toBe(false);expect(request).not.toHaveBeenCalled();
 const midi=new LabMidi(callbacks);request.mockRejectedValueOnce(new Error('Device unavailable'));await expect(midi.reconnect()).rejects.toThrow('Device unavailable');expect(await midi.reconnect()).toBe(true);expect(input.onmidimessage).toBeTypeOf('function');midi.dispose();
});
