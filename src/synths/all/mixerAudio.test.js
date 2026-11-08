import {createMixerAudio,stripDefaults,masterDefaults,cleanDesk,faderGain} from './mixerAudio';

function context(){
 const nodes=[];
 const param=value=>({value,cancelScheduledValues:vi.fn(),setTargetAtTime:vi.fn(function(v){this.value=v;})});
 const make=()=>{const node={gain:param(1),frequency:param(1000),Q:param(1),pan:param(0),connect:vi.fn(),disconnect:vi.fn()};nodes.push(node);return node;};
 return {nodes,currentTime:0,sampleRate:48000,createGain:make,createBiquadFilter:make,createStereoPanner:make,createChannelSplitter:make,createChannelMerger:make};
}
const state=()=>({strips:Object.fromEntries(['lead','bass','ambience','headroom'].map(id=>[id,stripDefaults()])),master:masterDefaults()});
it('uses neutral faders, trims subgroup and ambience, and implements solo/mute precedence',()=>{
 const c=context(),limiter={connect:vi.fn(),disconnect:vi.fn(),port:{postMessage:vi.fn()}},m=createMixerAudio(c,['lead','bass'],limiter),s=state();
 m.patch(s);expect(m.channels.lead.output.gain.value).toBe(1);expect(m.channels.headroom.input.gain.value).toBe(1);
 s.strips.lead.solo=true;m.patch(s);
 expect(m.channels.lead.output.gain.value).toBe(1);expect(m.channels.bass.output.gain.value).toBe(0);expect(m.channels.ambience.output.gain.value).toBe(0);expect(m.channels.headroom.output.gain.value).toBe(1);
 s.strips.lead.mute=true;m.patch(s);expect(m.channels.lead.output.gain.value).toBe(0);
 s.strips.lead.solo=false;s.strips.headroom.solo=true;m.patch(s);expect(m.channels.bass.output.gain.value).toBe(1);expect(m.channels.ambience.output.gain.value).toBe(0);
 s.strips.headroom.mute=true;m.patch(s);expect(m.channels.headroom.output.gain.value).toBe(0);
 m.dispose();m.dispose();expect(limiter.disconnect).toHaveBeenCalledOnce();expect(c.nodes.every(n=>n.disconnect.mock.calls.length===1)).toBe(true);
});
it('updates filters, EQ, pan, stereo matrix, master dim and limiter ceiling',()=>{
 const c=context(),limiter={connect:vi.fn(),port:{postMessage:vi.fn()}},m=createMixerAudio(c,['lead','bass'],limiter),s=state();
 m.patch(s);s.strips.lead={...s.strips.lead,hpOn:true,hp:.5,lpOn:true,lp:.3,lo:1,mid:0,hi:.75,pan:1,vol:0};
 s.master={...s.master,mono:true,dim:true,bal:0,ceil:.5};m.patch(s);
 const lead=c.nodes.slice(0,8);expect(lead[1].type).toBe('highpass');expect(lead[1].frequency.value).toBeCloseTo(Math.sqrt(20*600));expect(lead[2].frequency.value).toBeCloseTo(1000*20**.3);
 expect([lead[3].gain.value,lead[4].gain.value,lead[5].gain.value,lead[6].pan.value,lead[7].gain.value]).toEqual([12,-12,6,1,0]);
 const ending=c.nodes.slice(-12);expect(ending.filter(n=>n.gain.value===.5).length).toBe(4);
 expect(c.nodes.some(n=>n.pan.value===-1)).toBe(true);expect(c.nodes.some(n=>Math.abs(n.gain.value-.1)<1e-10)).toBe(true);
 expect(limiter.port.postMessage).toHaveBeenLastCalledWith({enabled:true,ceiling:10**(-6/20)});
});
it('sanitizes restored state and uses the displayed fader law',()=>{
 expect(cleanDesk({strips:{lead:{vol:NaN,pan:4,mute:'yes'}}},['lead']).strips.lead).toMatchObject({vol:.75,pan:1,mute:false});
 expect(faderGain(0)).toBe(0);expect(faderGain(.75)).toBe(1);expect(faderGain(1)).toBeCloseTo(10**.5);
});
it('supports exactly three trimmed inputs and a master outboard insert before the final limiter',()=>{
 const c=context(),limiter={connect:vi.fn(),disconnect:vi.fn(),port:{postMessage:vi.fn()}},insert={input:{},connect:vi.fn()},m=createMixerAudio(c,['dry','drive','wet'],limiter,{auxiliary:false,trimRoles:true,masterInsert:insert});
 const s={strips:Object.fromEntries(['dry','drive','wet'].map(id=>[id,stripDefaults()])),master:masterDefaults()};m.patch(s);
 expect(Object.keys(m.channels)).toEqual(['dry','drive','wet']);const masterFader=insert.connect.mock.lastCall[0];expect(masterFader.connect).toHaveBeenCalledWith(limiter);expect(c.nodes.some(n=>n.connect.mock.calls.some(([to])=>to===insert.input))).toBe(true);
 s.strips.dry.gain=.5;s.strips.wet.solo=true;m.patch(s);expect(m.channels.dry.input.gain.value).toBeCloseTo(10**(12/20));expect(m.channels.dry.output.gain.value).toBe(0);expect(m.channels.wet.output.gain.value).toBe(1);
 s.master.vol=0;m.patch(s);expect(masterFader.gain.value).toBe(0);
 m.dispose();expect(limiter.disconnect).toHaveBeenCalledOnce();
});
