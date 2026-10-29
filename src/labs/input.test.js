import {bindLabKeyboard,LabMidi,mapVelocity} from './input';
afterEach(()=>document.body.replaceChildren());
it('uses home-row naturals and row-above accidentals, ignores repeats and text entry, and releases after focus changes',()=>{
 const on=vi.fn(),off=vi.fn(),panic=vi.fn(),shift=vi.fn();const cleanup=bindLabKeyboard(window,{on,off,panic,shift});
 window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA'}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA',repeat:true}));
 expect(on.mock.calls.map(c=>c[1])).toEqual([60,61]);
 const input=document.createElement('input');document.body.append(input);input.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS',bubbles:true}));input.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyA',bubbles:true}));
 expect(on).toHaveBeenCalledTimes(2);expect(off).toHaveBeenCalledWith('key:KeyA');window.dispatchEvent(new Event('blur'));expect(off).toHaveBeenCalledWith('key:KeyW');
 window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyX'}));expect(shift).toHaveBeenCalledWith(1);cleanup();
});
it('keeps velocity-zero silent and lets quiet piano attacks use a floor/curve or fixed velocity',()=>{
 expect(mapVelocity(0,{fixed:true})).toBe(0);expect(mapVelocity(.1,{floor:.2,curve:.5})).toBeGreaterThan(.4);expect(mapVelocity(.1,{fixed:true,keyboard:.8})).toBe(.8);expect(mapVelocity(1,{gain:1.5})).toBe(1);
});
it('switches engines with B without playing a note, respecting editing, modifiers and hidden benches',()=>{
 const on=vi.fn(),off=vi.fn(),switchEngine=vi.fn();let visible=true;
 const cleanup=bindLabKeyboard(window,{on,off,panic:vi.fn(),switchEngine,enabled:()=>visible});
 const key=(target=window,extra={})=>target.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB',bubbles:true,cancelable:true,...extra}));
 expect(key()).toBe(false);expect(switchEngine).toHaveBeenCalledOnce();expect(on).not.toHaveBeenCalled();
 for(const extra of [{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true}])key(window,extra);
 for(const tag of ['input','textarea','select','div']){const node=document.createElement(tag);if(tag==='div')node.setAttribute('contenteditable','true');document.body.append(node);key(node);}
 visible=false;key();expect(switchEngine).toHaveBeenCalledOnce();
 visible=true;key();expect(switchEngine).toHaveBeenCalledTimes(2);
 window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA'}));expect(on).toHaveBeenCalledWith('key:KeyA',60,.7);
 visible=false;window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyA'}));expect(off).toHaveBeenCalledWith('key:KeyA');
 cleanup();key();expect(switchEngine).toHaveBeenCalledTimes(2);
});
it('handles MIDI channels, zero-velocity note-off, pedal and expression without aftertouch',()=>{
 const cb={on:vi.fn(),off:vi.fn(),sustain:vi.fn(),control:vi.fn(),panic:vi.fn()},m=new LabMidi(cb);m.channel='2';m.message([144,60,90]);expect(cb.on).not.toHaveBeenCalled();m.message([145,60,64],'piano');expect(cb.on).toHaveBeenCalledWith('midi:piano:1:60',60,64/127);m.message([145,60,0],'piano');expect(cb.off).toHaveBeenCalledWith('midi:piano:1:60');m.message([177,64,127]);expect(cb.sustain).toHaveBeenCalledWith(true);m.message([177,74,127]);expect(cb.control).toHaveBeenCalledWith('brightness',1);m.message([225,0,64]);expect(cb.control).toHaveBeenCalledWith('bend',0);m.message([177,123,0]);expect(cb.panic).toHaveBeenCalledOnce();
});
it('detaches disconnected MIDI inputs and releases notes on refresh and disposal',async()=>{
 const input={id:'piano',name:'Piano',state:'connected'},access={inputs:new Map([['piano',input]])};Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:vi.fn().mockResolvedValue(access)});
 const cb={on:vi.fn(),off:vi.fn(),sustain:vi.fn(),control:vi.fn(),panic:vi.fn(),onStatus:vi.fn()},m=new LabMidi(cb);await m.connect();input.onmidimessage({data:[144,60,127]});expect(cb.on).toHaveBeenCalledOnce();input.state='disconnected';access.onstatechange();expect(input.onmidimessage).toBeNull();m.dispose();expect(access.onstatechange).toBeNull();expect(cb.panic).toHaveBeenCalledTimes(3);delete navigator.requestMIDIAccess;
});
it('passes poly aftertouch and the soft pedal only to pages that ask for them',()=>{
 const cb={on:vi.fn(),off:vi.fn(),sustain:vi.fn(),control:vi.fn(),panic:vi.fn()};
 const plain=new LabMidi(cb);plain.message([160,60,64],'piano');plain.message([176,67,127],'piano');expect(cb.control).not.toHaveBeenCalled();
 const polyPressure=vi.fn(),soft=vi.fn(),m=new LabMidi({...cb,polyPressure,soft});
 m.message([161,60,127],'piano');expect(polyPressure).toHaveBeenCalledWith('midi:piano:1:60',1);
 m.message([176,67,127],'piano');expect(soft).toHaveBeenCalledWith(1);
});
it('steps through voices with , and . without playing a note, and not while typing',()=>{
 const on=vi.fn(),cycleVoice=vi.fn(),cleanup=bindLabKeyboard(window,{on,off:vi.fn(),panic:vi.fn(),cycleVoice});
 const press=(code,target=window)=>target.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true}));
 press('Comma');press('Period');expect(cycleVoice.mock.calls).toEqual([[-1],[1]]);expect(on).not.toHaveBeenCalled();
 const field=document.createElement('input');document.body.append(field);press('Period',field);expect(cycleVoice).toHaveBeenCalledTimes(2);
 cleanup();
});
