import Instrument from './Instrument';

/** A diagnostic suite: low/central/high notes, soft/hard attacks and a tail. */
export async function measureArticulation(preset, role, { register=role==='bass'?40:72, gate=.6 }={}) {
    const sr=24000,seconds=9,ctx=new OfflineAudioContext({numberOfChannels:2,length:sr*seconds,sampleRate:sr});
    const inst=new Instrument({polyphony:8,preset,context:ctx});inst.scheduleSleep=()=>{};inst.connect(ctx.destination);
    const end=Date.now()+3000;while(!inst.reverb.settled&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,20));
    const note=(midi,at,length,velocity)=>inst.scheduleNote(Math.max(24,Math.min(100,midi)),at,length,velocity);
    note(register-12,.05,.15,.45);note(register,1,Math.min(gate,1.2),.8);note(register+12,2.6,.3,1);
    if(role==='pad')for(const interval of [0,4,7])note(register+interval,3.5,1.8,.8);
    else note(register,3.5,1.8,1);
    const buffer=await ctx.startRendering();let sum=0,peak=0,dc=0,tail=0,finite=true;
    for(let channel=0;channel<buffer.numberOfChannels;channel++){
        const data=buffer.getChannelData(channel);for(let i=0;i<data.length;i++){const x=data[i];finite&&=Number.isFinite(x);sum+=x*x;dc+=x;peak=Math.max(peak,Math.abs(x));if(i>=sr*8)tail+=x*x;}
    }
    return {finite,peak,rms:Math.sqrt(sum/(buffer.length*2)),dc:dc/(buffer.length*2),tailRms:Math.sqrt(tail/(sr*2))};
}
