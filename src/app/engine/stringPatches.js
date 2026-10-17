const names=new Set(['Nylon Guitar','Soft Harp','Harp Pluck','Kalimba Pluck','Upright Pluck']);
export const isStringPatch=name=>names.has(name);
export function stringPatch(name,preset,generation='latest') {
    if(generation==='legacy'||!isStringPatch(name))return preset;
    const bass=name==='Upright Pluck',harp=/Harp/.test(name);
    return {...preset,stringModel:'plucked',stringDecay:bass?1.8:harp?2.8:1.9,stringDamping:bass?.7:harp?.35:.55,
        stringPosition:harp?.26:.17,stringBody:bass?.5:.3,stringSeed:bass?73:harp?127:41,
        gainAttack:.003,gainDecay:.12,gainSustain:.78,gainRelease:bass?.14:.32};
}
