import {sourcePerformance} from '../../audio/wasmPerformance';
// Lease only the raw source seam; existing gain/inserts/sends and keyboard
// backend stay connected. Replacing/editing the captured source invalidates it.
export function sourceStemTap(instrument,assertHost=()=>{}){
 const voice=instrument?.voice;
 function current(){assertHost();if(!voice||instrument.disposed||voice.disposed||instrument.loading||instrument.voice!==voice||!voice.sourceInput||!['subtractive','fm'].includes(voice.spec?.kind))throw Error('Select a ready core or FM voice for the Rust source preview.');const patch=structuredClone(sourcePerformance(voice.effectivePatch??voice.patch));if(voice.spec.kind==='fm'&&patch.global.quality!==1)throw Error('Rust FM source preview currently requires 2x (quality 1).');return patch;}
 const patch=current(),signature=JSON.stringify(patch);
 return {input:voice.sourceInput,kind:voice.spec.kind,patch,assertCurrent(){if(JSON.stringify(current())!==signature)throw Error('The source changed; stop and prepare a new preview.');}};
}
