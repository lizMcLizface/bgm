const patches={
 'Soft Flute':{breathAmount:.18,formantAmount:.16,formantVowel:'oo'},
 'Pan Flute':{breathAmount:.28,formantAmount:.12,formantVowel:'oo'},
 'Ocarina':{breathAmount:.09,formantAmount:.13,formantVowel:'oo'},
 'Reed Lead':{breathAmount:.12,formantAmount:.22,formantVowel:'ee',formantShift:-3},
 'Clarinet Lead':{breathAmount:.08,formantAmount:.2,formantVowel:'oo'},
 'Breathy Choir':{breathAmount:.16,formantAmount:.65,formantVowel:'ah'},
 'Choir Ah':{breathAmount:.09,formantAmount:.8,formantVowel:'ah'},
};
export const isBreathPatch=name=>Object.hasOwn(patches,name);
export function breathPatch(name,preset,generation='latest'){
 return generation==='legacy'||!isBreathPatch(name)?preset:{...preset,noiseMix:0,...patches[name]};
}
