import React,{useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import {ROW_I,ROW_II,neutralChannel,withChannel,matchChannel} from './factory';

const CHANNEL=[
 {title:'VCO',tone:'cream',keys:['feet','pw','pwm','pwmRate','saw','square','noise','sine']},
 {title:'VCF',tone:'red',keys:['hpf','hpRes','lpf','lpRes','keytrack']},
 {title:'Filter EG',tone:'amber',keys:['il','al','fa','fd','fr','hpEg']},
 {title:'VCA',tone:'blue',keys:['a','d','s','r','level'],shape:{env:'amp',a:'a',d:'d',s:'s',r:'r'}},
];
const touchGroup=c=>({title:'Touch '+(c==='i'?'I':'II'),tone:c==='i'?'green':'teal',keys:[[c+'.initBrill','Initial bright'],[c+'.initLevel','Initial level'],[c+'.afterBrill','After bright'],[c+'.afterLevel','After level']]});
const GROUPS={
 afterTouch:{title:'After touch',tone:'violet',keys:[['atPitch','→ Pitch'],['atVibrato','→ Vibrato']]},
 autoTouch:{title:'Auto touch',tone:'violet',keys:[['autoTouch','Amount'],['autoTime','Time']]},
 scaling:{title:'Keyboard scaling',tone:'cream',keys:['brillLow','brillHigh','levelLow','levelHigh']},
 sub:{title:'Sub oscillator',tone:'violet',keys:['subRate','subVco','subVcf','subVca','subDelay','subFunction']},
 glide:{title:'Glide',tone:'amber',keys:[['portamento','Time'],['glissando','Gliss.']]},
 ring:{title:'Ring modulator',tone:'teal',keys:['ringDepth','ringSpeed','ringAttack','ringDecay','ringSweep']},
 mix:{title:'Mix',tone:'cream',keys:['volume','balance',['detune','Detune'],['brilliance','Bright'],['resonance','Reson.']]},
 character:{title:'Character',tone:'amber',keys:['width','drift','voices']},
 chorus:{title:'Chorus',tone:'blue',keep:true,keys:[['chorusMix','Mix'],['chorusRate','Rate'],['chorusDepth','Depth']]},
 reverb:{title:'Reverb',tone:'blue',keys:['reverbMix','reverbDecay','reverbTone','reverbSize','reverbPredelay']},
};
// One page: the selected channel's own controls stacked in a frame on the left (oscillator; filter and amplifier; filter
// envelope and touch), everything global in three rows beside it, each row next to the part of the frame it belongs with.
// beside the oscillator: mix and the sub oscillator; beside the filter and amp: character and the ring modulator; beside the
// channel's touch: everything that follows the keys
const COMPLETE_ROWS=[['mix','sub'],['character','ring','chorus'],['afterTouch','autoTouch','scaling','glide']];
const [VCO,VCF,FILTER_EG,VCA]=CHANNEL;
const other=c=>c==='i'?'ii':'i',roman=c=>c==='i'?'I':'II';

// The original's two rows of preset buttons: each loads only its own channel.
function Factory({values,choose}){
 const at={i:matchChannel(values,'i',ROW_I),ii:matchChannel(values,'ii',ROW_II)};
 const load=next=>{const i=matchChannel(next,'i',ROW_I),ii=matchChannel(next,'ii',ROW_II);choose({name:`I ${i<0?'custom':ROW_I[i].name} · II ${ii<0?'custom':ROW_II[ii].name}`,values:next});};
 return <div className="factory" title="Two rows of tones, one per channel: pick an upper and a lower tone to stack.">
  {[['i',ROW_I],['ii',ROW_II]].map(([c,row])=><div className="factory-row" key={c} role="group" aria-label={'Tones for channel '+roman(c)}>
   <span className="factory-label">{roman(c)}</span>
   {row.map((p,n)=><button type="button" key={p.name} style={{'--chip':p.colour}} className={at[c]===n?'on':''} onClick={()=>load(withChannel(values,c,p))}>{p.name}</button>)}
   <button type="button" className="neutral" onClick={()=>load(neutralChannel(values,c))} title={`Channel ${roman(c)} back to its plain starting tone, and the sub oscillator, ring modulator, touch, glide and mix controls at rest; keeps volume and space`}>Neutral</button>
  </div>)}
 </div>;
}
const LIBRARIES=[{id:'factory',label:'Tone rows',render:props=><Factory {...props}/>}];

export default function Cs80Page(){
 const [channel,setChannel]=useState('i');
 const [linked,setLinked]=useState(false);
 const expand=key=>{const m=linked&&/^(i|ii)\.(.+)$/.exec(key);return m?[key,other(m[1])+'.'+m[2]]:[key];};
 const linkTools=(c,values,replaceValues)=><>
  <label className="toggle"><input type="checkbox" checked={linked} onChange={e=>setLinked(e.target.checked)}/> Link I + II</label>
  <button type="button" onClick={()=>{const next={...values};for(const key of Object.keys(next))if(key.startsWith(c+'.'))next[other(c)+key.slice(c.length)]=next[key];replaceValues(next);}}>Copy to {roman(other(c))}</button>
 </>;
 return <SynthShell synth={SYNTHS.cs80} className="cs80" helpInBar panelClassName="complete" expand={expand} libraries={LIBRARIES}>
  {({values,group,replaceValues})=><>
   <div className="cs-layout">
    <div className="voice-frame" role="group" aria-label={'Channel '+roman(channel)}>
     <div className="vf-row">
      <section className="group channel-pick"><h3>Channel</h3>
       <div className="channel-buttons" role="radiogroup" aria-label="Channel to edit">
        {['i','ii'].map(c=><button type="button" key={c} role="radio" aria-checked={channel===c} className={'channel-'+c+(channel===c?' on':'')} onClick={()=>setChannel(c)}>{roman(c)}</button>)}
       </div>
       <div className="channel-tools">{linkTools(channel,values,replaceValues)}</div>
      </section>
      {group(VCO,channel+'.')}
     </div>
     <div className="vf-row">{group(VCF,channel+'.')}{group(VCA,channel+'.')}</div>
     <div className="vf-row">{group(FILTER_EG,channel+'.')}{group(touchGroup(channel))}</div>
    </div>
    <div className="globals">
     {COMPLETE_ROWS.map((row,i)=><div className="g-row" key={i}>{row.map(name=>group(GROUPS[name]))}</div>)}
    </div>
   </div>
  </>}
 </SynthShell>;
}
