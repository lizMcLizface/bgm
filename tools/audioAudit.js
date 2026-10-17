/** Pure fixtures and measurements shared by the Phase 4 review and its tests. */
export const AUDIT_CASES = ['soft','medium','hard','low','high','short','held','chord','dense','steal','silence','cancel','resume'];
export function auditCase(id, role='lead') {
    if (![...AUDIT_CASES,'lead-slide','chord-slide','arpeggio-motion','held-glide'].includes(id)) throw Error('Unknown audit case.');
    const root={lead:72,counter:67,pad:60,bass:36}[role];
    const note=(midi=root,time=.05,duration=.7,velocity=.7)=>({role,midi,time,duration,velocity});
    let notes=[note()], actions=[];
    if (['soft','medium','hard'].includes(id)) notes=[note(root,.05,.7,{soft:.2,medium:.6,hard:1}[id])];
    if (id==='low'||id==='high') notes=[note(root+(id==='low'?-12:12))];
    if (id==='short') notes=Array.from({length:8},(_,i)=>note(root+[0,2,4,5][i%4],.05+i*.3,.12));
    if (id==='held') notes=[note(root,.05,4)];
    if (id==='chord') notes=[0,4,7,12].map(offset=>note(root+offset,.05,2,.7));
    if (id==='dense') notes=Array.from({length:48},(_,i)=>note(root+[0,2,4,5,7][i%5],.05+i*.045,.35,.85));
    if (id==='steal') notes=Array.from({length:24},(_,i)=>note(root+[0,2,4,5,7][i%5],.05+i*.06,1.5,.75));
    if(id==='lead-slide')notes=[0,2,5,4,7,5,2,0].map((offset,i)=>note(root+offset,.05+i*.6,.59,.7));
    if(id==='arpeggio-motion')notes=Array.from({length:16},(_,i)=>note(root+[0,4,7,12,7,4][i%6],.05+i*.4,1.2,.7));
    if(id==='held-glide')notes=(role==='pad'?[0,4,7]:[0]).map((offset,voice)=>{
     const pitches=(role==='pad'?[[0,4,7],[0,5,9],[2,5,9],[0,4,7]].map(chord=>chord[voice]):[0,5,2,0]).map(offset=>root+offset);
     return {...note(root+offset,.05,12,.65),pitchTargets:[{time:0,midi:pitches[0]},...pitches.slice(1).flatMap((midi,i)=>[{time:3*(i+1)-.8,midi:pitches[i]},{time:3*(i+1)+.8,midi}]),{time:12,midi:pitches[3]}]};
    });
    if(id==='chord-slide')notes=[0,1,2].flatMap(i=>[0,i===1?5:4,7].map(offset=>note(root+offset,.05+i*1.5,1.48,.7)));
    if (id==='silence') notes=[];
    if (id==='cancel'||id==='resume') {notes=[note(root,.05,1.5),note(root+4,.55,1),note(root+7,1,1)];actions=[{time:.32,type:'cancel'},{time:.9,type:'flush'}];}
    if (id==='resume') actions.push({time:1.6,type:'resume',note:note(root+2,1.65,.4)});
    return {id,role,notes,actions,lastGate:Math.max(0,...notes.map(n=>n.time+n.duration),...actions.filter(a=>a.note).map(a=>a.note.time+a.note.duration))};
}
export const db = value => 20*Math.log10(Math.max(1e-12,Math.abs(value)));
export function windowRms(channels, sampleRate, start=0, end=Infinity) {
    let sum=0,count=0;
    for(const channel of channels) for(let i=Math.max(0,Math.floor(start*sampleRate));i<Math.min(channel.length,Math.floor(end*sampleRate));i++) {
        if(Number.isFinite(channel[i])) {sum+=channel[i]**2;count++;}
    }
    return count?Math.sqrt(sum/count):0;
}
export function measureAudio(channels, sampleRate, {lastGate=0}={}) {
    let peak=0,nonFinite=0,over=0,dc=0;
    for(const channel of channels) {let sum=0;for(const x of channel){if(!Number.isFinite(x)){nonFinite++;continue;}sum+=x;peak=Math.max(peak,Math.abs(x));if(Math.abs(x)>=1)over++;}dc=Math.max(dc,Math.abs(sum/Math.max(1,channel.length)));}
    const seconds=channels[0].length/sampleRate;
    return {seconds,rms:windowRms(channels,sampleRate),peak,dc,nonFinite,over,
        earlyTailRms:windowRms(channels,sampleRate,lastGate,lastGate+1),
        lateTailRms:windowRms(channels,sampleRate,Math.max(lastGate,seconds-.5),seconds)};
}
export function auditWarnings(row) {
    const warnings=[];
    if(row.nonFinite)warnings.push('Non-finite samples');if(row.over)warnings.push('Raw output reaches full scale');
    if(row.dc>.01)warnings.push('DC offset above 0.01');
    if(row.id==='silence'&&row.peak>1e-6)warnings.push('Output without notes');
    if(row.id==='cancel'&&row.afterCancelRms>1e-4)warnings.push('Sound remains after cancellation / tail flush');
    if(!['silence','cancel'].includes(row.id)&&row.rms<1e-6)warnings.push('Unexpected silence');
    if(row.lateTailRms>.002)warnings.push('Tail remains at audit horizon');
    return warnings;
}
