// Tempo means felt beats, including dotted-quarter beats in 6/8.
const nearest = (values, value) => values.reduce((a,b) => Math.abs(Math.log(b/value)) < Math.abs(Math.log(a/value)) ? b : a);
export function effectTiming(p, beatSeconds = 0) {
    const linked = Number.isFinite(beatSeconds) && beatSeconds >= .15 && beatSeconds <= 3;
    const delay = time => linked && time > 0 ? nearest([.25,.5,.75,1,1.5,2,3,4].map(n=>n*beatSeconds).filter(n=>n<=1),time) : time;
    const rate = hz => linked && hz > 0 ? nearest([.5,1,2,3,4,6,8,12,16,24,32].map(n=>1/(n*beatSeconds)),hz) : hz;
    return { delayTime:delay(p.delayTime),pingPongDelayTime:delay(p.pingPongDelayTime),
        tremoloRate:rate(p.tremoloRate),autoPanRate:rate(p.autoPanRate),filterLfoRate:rate(p.filterLfoRate) };
}
// These parameters affect existing nodes only. Patch values and wet/depth stay intact.
export function effectTimingParams(inst) {
    return { delayTime:[inst.delay.delay.delayTime],
        pingPongDelayTime:[inst.pingPong.leftDelay.delayTime,inst.pingPong.preDelay.delayTime,inst.pingPong.rightDelay.delayTime],
        tremoloRate:[inst.motion.tremoloLfo.frequency],autoPanRate:[inst.motion.panLfo.frequency],filterLfoRate:[inst.filterLfo.frequency] };
}
export function scheduleEffectTiming(inst, beatSeconds, start) {
    if (!beatSeconds && !inst.tempoTimingTouched) return;
    if (beatSeconds >= .15 && beatSeconds <= 3) inst.tempoTailReserve = true;
    const p=inst.preset, target=effectTiming(p,beatSeconds), params=effectTimingParams(inst);
    for(const [key,list] of Object.entries(params)) {
        const active=key==='delayTime'?p.delayAmount>0:key==='pingPongDelayTime'?p.pingPongAmount>0:key==='tremoloRate'?p.tremoloDepth>0:key==='autoPanRate'?p.autoPanDepth>0:p.filterLfoDepth>0;
        // Reset bypassed parameters too after a previously linked passage.
        if (!active && !inst.tempoTimingTouched) continue;
        for(const param of list) {param.cancelScheduledValues(start);param.setTargetAtTime(active?target[key]:p[key],start,.025);}
    }
    inst.tempoTimingTouched = true;
}
