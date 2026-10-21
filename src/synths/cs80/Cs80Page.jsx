import React,{useState} from 'react';
import SynthShell,{SETUP_KEY} from '../ui/SynthShell';
import {SYNTHS} from '../models';
import {load,save} from '../storage';
import {ROW_I,ROW_II,neutralPanel,withChannel,matchChannel} from './factory';

const VIEW_KEY='synths:cs80:view';
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
 sub:{title:'Sub oscillator',tone:'violet',keys:['subFunction','subRate','subVco','subVcf','subVca','subDelay']},
 glide:{title:'Glide',tone:'amber',keys:[['portamento','Time'],['glissando','Gliss.']]},
 ring:{title:'Ring modulator',tone:'teal',keys:['ringDepth','ringSpeed','ringAttack','ringDecay','ringSweep']},
 mix:{title:'Mix',tone:'cream',keys:['volume','balance',['detune','Detune'],['brilliance','Bright'],['resonance','Reson.']]},
 character:{title:'Character',tone:'amber',keys:['width','drift','voices']},
 chorus:{title:'Chorus',tone:'blue',keys:['chorusMix','chorusRate','chorusDepth']},
 reverb:{title:'Reverb',tone:'blue',keys:['reverbMix','reverbDecay','reverbTone','reverbSize','reverbPredelay']},
};
// One page: the selected channel on top, then everything global in two rows.
const COMPLETE_ROWS=[['afterTouch','autoTouch','scaling','sub','glide'],['ring','mix','character','chorus','reverb']];
const TABS=[{id:'i',label:'Channel I'},{id:'ii',label:'Channel II'},{id:'touch',label:'Touch'},{id:'mod',label:'Sub osc · Ring'},{id:'master',label:'Master · Space'}];
const PANELS={
 touch:[touchGroup('i'),touchGroup('ii'),GROUPS.afterTouch,GROUPS.autoTouch,GROUPS.scaling],
 mod:[GROUPS.sub,GROUPS.ring,GROUPS.glide],
 master:[GROUPS.mix,GROUPS.character,GROUPS.chorus,GROUPS.reverb],
};
const other=c=>c==='i'?'ii':'i',roman=c=>c==='i'?'I':'II';

// The original's two rows of preset buttons: each loads only its own channel.
function Factory({values,choose}){
 const at={i:matchChannel(values,'i',ROW_I),ii:matchChannel(values,'ii',ROW_II)};
 const load=next=>{const i=matchChannel(next,'i',ROW_I),ii=matchChannel(next,'ii',ROW_II);choose({name:`I ${i<0?'custom':ROW_I[i].name} · II ${ii<0?'custom':ROW_II[ii].name}`,values:next});};
 return <div className="factory" title="Two rows of tones, one per channel: pick an upper and a lower tone to stack.">
  {[['i',ROW_I],['ii',ROW_II]].map(([c,row])=><div className="factory-row" key={c} role="group" aria-label={'Tones for channel '+roman(c)}>
   <span className="factory-label">{roman(c)}</span>
   {row.map((p,n)=><button type="button" key={p.name} style={{'--chip':p.colour}} className={at[c]===n?'on':''} onClick={()=>load(withChannel(values,c,p))}>{p.name}</button>)}
   {c==='ii'&&<button type="button" className="neutral" onClick={()=>load(neutralPanel(values))} title="Reset the sub oscillator, ring modulator, touch, glide and mix controls; keeps volume and space">Neutral panel</button>}
  </div>)}
 </div>;
}
const LIBRARIES=[{id:'factory',label:'Tone rows',render:props=><Factory {...props}/>}];

export default function Cs80Page(){
 // earlier versions kept the layout in the shared setup
 const [view,setView]=useState(()=>load(VIEW_KEY,null)??load(SETUP_KEY,{}).view??'complete');
 const [tab,setTab]=useState('i');
 const [channel,setChannel]=useState('i');
 const [linked,setLinked]=useState(false);
 const complete=view!=='pages';
 const choose=next=>{setView(next);save(VIEW_KEY,next);};
 const expand=key=>{const m=linked&&/^(i|ii)\.(.+)$/.exec(key);return m?[key,other(m[1])+'.'+m[2]]:[key];};
 const linkTools=(c,values,replaceValues)=><>
  <label className="toggle"><input type="checkbox" checked={linked} onChange={e=>setLinked(e.target.checked)}/> {complete?'Link I + II':'Edit I + II together'}</label>
  <button type="button" onClick={()=>{const next={...values};for(const key of Object.keys(next))if(key.startsWith(c+'.'))next[other(c)+key.slice(c.length)]=next[key];replaceValues(next);}}>Copy to {roman(other(c))}</button>
 </>;
 const viewSwitch=<span className="view-switch" role="radiogroup" aria-label="Layout">
  <button type="button" role="radio" aria-checked={complete} onClick={()=>choose('complete')}>One page</button>
  <button type="button" role="radio" aria-checked={!complete} onClick={()=>choose('pages')}>Pages</button>
 </span>;
 const channelTab=!complete&&(tab==='i'||tab==='ii');
 return <SynthShell synth={SYNTHS.cs80} className="cs80" headerExtras={viewSwitch} panelClassName={complete?'complete':''} expand={expand} libraries={LIBRARIES}
  nav={!complete&&<nav className="tabs" role="tablist">{TABS.map(t=><button type="button" role="tab" key={t.id} aria-selected={tab===t.id} onClick={()=>setTab(t.id)}>{t.label}</button>)}</nav>}>
  {({values,group,replaceValues})=>complete?<>
   <div className="panel-row">
    <section className="group channel-pick"><h3>Channel</h3>
     <div className="channel-buttons" role="radiogroup" aria-label="Channel to edit">
      {['i','ii'].map(c=><button type="button" key={c} role="radio" aria-checked={channel===c} className={'channel-'+c+(channel===c?' on':'')} onClick={()=>setChannel(c)}>{roman(c)}</button>)}
     </div>
     <div className="channel-tools">{linkTools(channel,values,replaceValues)}</div>
    </section>
    {CHANNEL.map(g=>group(g,channel+'.'))}
   </div>
   {COMPLETE_ROWS.map((row,i)=><div className="panel-row" key={i}>{i===0&&group(touchGroup(channel))}{row.map(name=>group(GROUPS[name]))}</div>)}
  </>:<>
   {channelTab&&<div className="tab-tools wide">{linkTools(tab,values,replaceValues)}</div>}
   {channelTab&&CHANNEL.map(g=>group(g,tab+'.'))}
   {PANELS[tab]?.map(g=>group(g))}
  </>}
 </SynthShell>;
}
