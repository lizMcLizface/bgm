// Device-local test controls, separate from the song/setup and normal backend.
export const PREVIEW_SETTINGS_KEY='synths:all:source-preview';
const ROLES=['lead','counter','rhythm','pad','bass','perc'];
export function previewSettings(value){
 const s=value?.version===1?value:{};
 return {version:1,mode:s.mode==='worker'?'worker':'serial',blocks:[6,8,12].includes(s.blocks)?s.blocks:6,
  scope:s.scope==='pitched-set'?'pitched-set':'selected',material:s.material==='voice-audition'?'voice-audition':'captured-score',
  roles:Array.isArray(s.roles)?ROLES.filter(r=>s.roles.includes(r)):[],comparisonOrder:s.comparisonOrder==='twelve-first'?'twelve-first':'six-first'};
}
