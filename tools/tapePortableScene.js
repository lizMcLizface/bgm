const KINDS=['continuous','explicit-gap','portable-retirement'],SHA=/^[a-f0-9]{64}$/;
export const TAPE_COMPOSED_SCENE_KEY='pianote.tape.composed.scene.v1';
/** Only explicit passing fixtures become replay authority; Native PCM hashes are not compared. */
export function portableTapeScene(report){
 if(report?.kind!=='tape.actual-composed-offline-reference'||report.version!==2||!report.complete||!report.checksPassed||report.cases?.length!==6||!report.preset)throw Error('A complete passing composed Tape fixture is required');
 const cases=[];let index=0;
 for(const kind of KINDS)for(const channels of [1,2]){
  const row=report.cases[index++];
  if(row.kind!==kind||row.channels!==channels||row.rate!==report.rate||!row.checksPassed||!row.components||row.ownedHashes?.length!==2||row.ownedHashes.some(pair=>pair.length!==2||pair.some(hash=>!SHA.test(hash))))throw Error('Composed Tape scene case/hash authority differs');
  cases.push({kind,channels,rate:row.rate,length:row.length,retirementPlan:row.retirementPlan,components:row.components,ownedHashes:row.ownedHashes});
 }
 return JSON.parse(JSON.stringify({kind:'tape.composed.cold-scene',version:1,fixtureVersion:report.version,rate:report.rate,preset:report.preset,cases}));
}
export function comparePortableTapeScene(report,saved){
 const actual=portableTapeScene(report);
 if(saved?.kind!=='tape.composed.cold-scene'||saved.version!==1)throw Error('Saved composed Tape scene is unsupported');
 return{checksPassed:JSON.stringify(actual)===JSON.stringify(saved),scope:'Exact fixed fixture/settings/components and both independent owned PCM hashes after document reload. Native PCM remains checked by its declared numerical bounds.'};
}
