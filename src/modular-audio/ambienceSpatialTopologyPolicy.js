/** Declared owned profile: constructed downstream-pulled layers keep their
 * control/DSP clocks. It does not reproduce Native deferred disable flags. */
export function ambienceSpatialTopologyPlan(session,{cancelOwner=0}={}){
 const channels=Array(6).fill(0),counts=Array(6).fill(0);let sourceAudio=0,sourceParameters=0,layerAudio=0,layerParameters=0,filterAudio=0,filterParameters=0,widthParameters=0;
 const had=new Set(session.topologyHadInputs??[]),nextHadInputs=new Set(had);
 const whole=session.bed.edges.some(e=>e.bus===6),wanted=new Set(whole?session.layers.keys():session.bed.edges.map(e=>e.bus).filter(i=>i<6));
 for(const c of session.contributions.values())if(c.owner!==cancelOwner&&c.attached){counts[c.layer]++;nextHadInputs.add(c.layer);if(wanted.has(c.layer)){if(c.sourceAudio)sourceAudio|=1<<c.slot;if(c.sourceParameters)sourceParameters|=1<<c.slot;}}
 for(const i of session.layers.keys()){channels[i]=counts[i]?2:1;if(wanted.has(i)){layerAudio|=1<<i;layerParameters|=1<<i;const filters=([0,1,3].includes(i)?7:1)<<(3*i);if(counts[i]||!had.has(i)){filterAudio|=filters;filterParameters|=filters;widthParameters|=1<<i;}}}
 return{channels,activity:{sourceAudio,sourceParameters,layerAudio,layerParameters,filterAudio,filterParameters,widthParameters,bed:whole?2:0},wanted,nextHadInputs};
}
