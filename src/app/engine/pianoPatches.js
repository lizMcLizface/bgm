const names=new Set(['Felt Keys','Soft Keys','Tine Keys','FM Rhodes']);
export const isPianoPatch=name=>names.has(name);
export function pianoPatch(name,preset,generation='latest',{resonance=true}={}) {
    if(generation==='legacy'||!isPianoPatch(name))return preset;
    const felt=name==='Felt Keys'||name==='Soft Keys';
    return {...preset,pianoResonance:resonance?(felt?.55:.65):0,pianoSustain:.28,stringModel:'piano',pianoType:felt?'felt':'electric',pianoDecay:felt?2.8:3.2,
        pianoBrightness:name==='Felt Keys'?.35:name==='Tine Keys'?.7:.55,pianoHammer:felt?.35:.15,pianoUnison:felt?.35:.15,pianoSeed:felt?109:223,
        gainAttack:.003,gainDecay:.12,gainSustain:.8,gainRelease:felt?.3:.4,pitchEnvAmount:0};
}
