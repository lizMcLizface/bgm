export const RAW_NATIVE_RATES=Object.freeze([8000,24000,44100,48000,96000,192000]);
export const RAW_NATIVE_CASES=Object.freeze(RAW_NATIVE_RATES.flatMap(rate=>[1,2].flatMap(channels=>['defaults','synthMix','kneeEdge'].flatMap(profile=>['continuous','stopped-source','disconnected'].map(mode=>({rate,channels,profile,mode}))))).map((entry,index)=>Object.freeze({index,...entry})));
/** A document creates at most18 OfflineAudioContexts. Close it between shards. */
export function rawNativeShard(search=''){
 const params=new URLSearchParams(search),rate=Number(params.get('rate')??48000),from=Number(params.get('from')??0),take=Number(params.get('take')??18);
 if(!RAW_NATIVE_RATES.includes(rate)||!Number.isInteger(from)||from<0||from>=108||!Number.isInteger(take)||take<1||take>18)throw Error('Raw native shard requires a supported rate, from0..107 and take1..18');
 const cases=RAW_NATIVE_CASES.filter(entry=>entry.rate===rate&&entry.index>=from).slice(0,take);
 if(!cases.length)throw Error('Raw native shard has no selected cases');
 return{rate,from,take,matrixCases:108,maxCasesPerDocument:18,cases,globalCaseIndices:cases.map(entry=>entry.index)};
}
