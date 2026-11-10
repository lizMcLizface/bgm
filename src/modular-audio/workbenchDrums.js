import {drumStepEvents} from '../synths/all/drumSteps';
import {validateBasicKit} from '../synths/all/percussionStemTap';
import {DRUMS} from '../app/percussion';
import {drumForVoice} from '../app/percussionVoices';
import {seeded} from '../app/random';
export function compileWorkbenchDrums({project,part,bpm,source,muted=false,allowEmpty=false}){
 if(source?.kind!=='percussion'||!project?.patterns||!project.patterns.perc&&!allowEmpty)throw Error('Rust drum preview requires a captured Wasm basic kit and drum pattern.');
 if(muted)throw Error('The selected sequencer is muted or excluded by solo.');
 if(!Number.isInteger(project.stepsPerBar)||project.stepsPerBar<1||project.stepsPerBar>64||!Number.isInteger(part?.startBar)||part.startBar<0||!Number.isInteger(part.bars)||part.bars<1||part.bars>16||!Number.isFinite(bpm)||bpm<50||bpm>200)throw Error('Unsupported preview progression/tempo bounds.');
 const kit=validateBasicKit(source.kit),start=part.startBar*project.stepsPerBar,length=part.bars*project.stepsPerBar,stepSec=60/bpm/4,preroll=.125,rate=48000,pattern=structuredClone(project.patterns.perc??{mode:'drums',steps:[]}),random=seeded((project.seed??0x4a11)^0x70657263),hits=[],events=[],ignored=new Set(),tracks=new Set();let id=source.hitBase??0,audibleHitCount=0;
 if(!Number.isInteger(project.bars)||start+length>project.bars*project.stepsPerBar)throw Error('Preview progression is outside the song.');
 if(!Number.isInteger(id)||id<0||id>0xffffffff)throw Error('Invalid captured kit hit counter.');
 for(let i=0;i<length;i++){
  const row=pattern.steps?.[start+i]?.hits??[];
  if(!Array.isArray(row)||row.length>4000)throw Error('Invalid drum hit capacity.');
  for(const hit of row)if(!Number.isInteger(hit.drum)||hit.drum<0||hit.drum>=DRUMS.length||hit.track!==undefined&&(typeof hit.track!=='string'||hit.track.length>24)||!Number.isFinite(hit.duration)||hit.duration<=0||hit.duration*stepSec>30)throw Error('Invalid captured drum hit.');
  for(const e of drumStepEvents(pattern,start+i,{time:preroll+i*stepSec,stepSec,swing:.5,flam:.5,count:i,cycle:0,fill:false,length,random})){
   const h=e.hit,vary=h.vary??0,duration=h.duration*stepSec,mapped=drumForVoice(h.drum,kit.voice),d=kit.drums[mapped];
   if(!Number.isFinite(e.time)||!Number.isFinite(h.velocity)||h.velocity<0||h.velocity>1||!Number.isFinite(vary)||Math.abs(vary)>1)throw Error('Invalid expanded drum event.');
   if(!d.on)continue; // Exactly the basic kit wrapper's booking filter.
   if(++id>0xffffffff)throw Error('Private kit hit ID capacity exceeded.');
   const time=Math.max(0,e.time),frame=Math.round(time*rate),params=Object.keys(h.params??{});params.forEach(k=>ignored.add(k));if(h.track)tracks.add(h.track);
   hits.push({drum:h.drum,mappedDrum:mapped,track:h.track??null,time,duration,velocity:h.velocity,vary,hit:id,ignoredSoundParams:params});
   events.push({kind:'hit',target:6,owner:6,frame,drum:h.drum,velocity:h.velocity,duration,vary,tone:d.tone,decay:d.decay,hit:id,model:({felt:0,crisp:0,tr808:1,hand:2})[kit.voice]});
   if(d.level>0&&h.velocity>0)audibleHitCount++;
   if(events.length>4000)throw Error('Drum preview exceeds 4,000-event capacity.');
  }
 }
 if(!events.length&&!allowEmpty)throw Error('The selected progression has no enabled kit hits.');
 const seconds=Math.max(preroll+length*stepSec,...hits.map(h=>h.time))+8.1;
 if(seconds>120||!Number.isFinite(seconds))throw Error('Source preview duration exceeds 120 seconds');
 return {version:1,role:'perc',sourceId:6,kind:'percussion',part:structuredClone(part),bpm,sampleRate:rate,preroll,tailSeconds:8.1,endFrame:Math.ceil(seconds*rate),noteCount:0,hitCount:hits.length,audibleHitCount,hits,kitVoice:kit.voice,hitIdPolicy:{version:1,base:source.hitBase??0,increment:'enabled booked hits in expanded receive order',liveCounterUnchanged:true},expression:{cycle:0,fill:false,swing:.5,flam:.5,random:'captured project seed xor 0x70657263',ignoredSoundParams:[...ignored].sort(),ignoredBasicKitTrackKeys:[...tracks].sort()},graph:{version:1,modules:[{id:6,type:'legacy.percussion',version:2,parameters:{gain:1},config:kit},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:6,port:'audio.out'},to:{module:18,port:'program.in'}}],events}};
}
