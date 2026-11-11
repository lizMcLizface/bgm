import {SYNTHS} from '../models';
import {validateClassicConfig} from '../../modular-audio/classicConfig';
import {CLASSIC_STACK_ALLOCATION} from '../../modular-audio/classicCompiler';

// Finite release allowance, followed by native space and the existing external
// rack's allowance. Exceptionally slow/nonzero-floor envelopes are cut at120s.
export function classicTailSeconds(instrument,capture){
 const synth=SYNTHS[instrument.preset.classics.synth],pairs=new Map(capture.parameters);
 let release=.25;
 for(const p of synth.params.PARAMS)if(p.unit==='s'&&/release|(?:^|\.)[fa]?r$|^aDecay$/i.test(p.key))release=Math.max(release,pairs.get(p.id)??p.default);
 if(capture.model===7)release=Math.max(release,[24,25].reduce((sum,id)=>sum+.0015*2**(14.288*(pairs.get(id)??99)/99),0));
 if(capture.model===5)for(let op=0;op<6;op++){const rate=Math.max(0,Math.min(99,pairs.get(op*21+3)??99)),q=Math.min(63,rate*41>>6),inc=(4+(q&3))*2**(8+(q>>2));release=Math.max(release,2**28/inc*64/44100);}
 return Math.min(120,release*1.5+Math.max(0,instrument.tailSeconds())+1);
}
export function classicStemTap(instrument,assertHost=()=>{}){
 const live=instrument?.live,spec=instrument?.preset?.classics;
 function current(){assertHost();if(!spec||instrument.disposed||instrument.loading||instrument.error||instrument.live!==live||instrument.preset?.classics?.synth!==spec.synth||!live?.sourceInput||instrument.drums)throw Error('Select a ready pitched classic voice');return instrument.captureSource();}
 const captured=current(),revision=captured.revision,signature=JSON.stringify(instrument.preset),patch={...validateClassicConfig({version:1,model:captured.model,parameters:captured.parameters,polyphony:captured.polyphony,...(captured.waves?{waves:captured.waves}:{})}),controls:captured.controls,tailSeconds:classicTailSeconds(instrument,captured)};
 const assertCurrent=()=>{assertHost();if(instrument.disposed||instrument.loading||instrument.error||instrument.live!==live||live.closed||live.sourceRevision!==revision||instrument.lives?.length!==1||JSON.stringify(instrument.preset)!==signature||instrument.held.size)throw Error('The classic source changed; prepare a new preview');};
 return {kind:'classic',input:live.sourceInput,patch,assertCurrent,activate(){assertCurrent();return instrument.holdSourceInput();}};
}

/** Multiple native outputs must retain their own existing nonlinear racks. */
export function compositeClassicStemTap(instrument,assertHost=()=>{}){
 const lives=instrument?.lives?.slice(),spec=instrument?.preset?.classics;
 assertHost();if(!spec||spec.synth!=='minimoog'||instrument.disposed||instrument.loading||instrument.error||instrument.drums||!lives||lives.length<2||lives.length>8)throw Error('Select a ready classic mono-stack');
 const snapshots=instrument.captureSources(),signature=JSON.stringify(instrument.preset),slots=snapshots.map(c=>({...validateClassicConfig({version:1,model:c.model,parameters:c.parameters,polyphony:c.polyphony,...(c.waves?{waves:c.waves}:{})}),controls:c.controls,tailSeconds:classicTailSeconds(instrument,c)}));
 if(slots.length!==lives.length||slots.some(c=>c.model!==4))throw Error('Unsupported classic mono-stack layout');
 const assertCurrent=()=>{assertHost();if(instrument.disposed||instrument.loading||instrument.error||instrument.lives?.length!==lives.length||instrument.held.size||JSON.stringify(instrument.preset)!==signature||lives.some((l,i)=>instrument.lives[i]!==l||l.closed||l.sourceRevision!==snapshots[i].revision))throw Error('The classic source stack changed; prepare a new preview');};
 return {kind:'classic-composite',inputs:lives.map(l=>l.sourceInput),patch:{version:1,allocation:CLASSIC_STACK_ALLOCATION,slots},assertCurrent,activate(){assertCurrent();return instrument.holdSourceInputs();}};
}
