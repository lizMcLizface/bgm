const bounded = (value, fallback, lo, hi) => Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;
export function cleanExpression(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return { pitchTargets:cleanPitchTargets(raw.pitchTargets), pitchMotion:raw.pitchMotion&&typeof raw.pitchMotion==='object'?{phase:bounded(raw.pitchMotion.phase,0,-1e9,1e9),rate:bounded(raw.pitchMotion.rate,.4,.01,4),depth:bounded(raw.pitchMotion.depth,0,0,60)}:null, slideFromMidi:Number.isFinite(raw.slideFromMidi)?Math.max(0,Math.min(127,Math.round(raw.slideFromMidi))):null,
        slideSeconds:bounded(raw.slideSeconds,.2,.02,1.5), gateAware:raw.gateAware === true, tempoBeat:bounded(raw.tempoBeat,0,0,3), connected: raw.connected === true, attackScale: bounded(raw.attackScale, 1, .65, 8), releaseScale: bounded(raw.releaseScale, 1, .7, 1),
        gateScale: bounded(raw.gateScale, 1, .9, 1), brightnessCents: bounded(raw.brightnessCents, 0, -600, 600), dynamicAttack: bounded(raw.dynamicAttack, 0, 0, 1),
        breathDepth: bounded(raw.breathDepth, 0, 0, .3), vibratoDepth: bounded(raw.vibratoDepth, 0, 0, 12),
        vibratoDelay: bounded(raw.vibratoDelay, .4, .2, .8), vibratoRate: bounded(raw.vibratoRate, 5, 4, 6) };
}
export function expressiveEnvelope(env, duration, expression) {
    if (!expression) return { env, duration };
    const soundingDuration = duration * expression.gateScale, fitted = gateEnvelope(env,soundingDuration,expression);
    return { env: { ...fitted, attack: expression.connected ? Math.min(env.attack * expression.attackScale * .55, .025) : env.attack * expression.attackScale, release: fitted.release * expression.releaseScale }, duration: soundingDuration };
}
/** Per-note source parameters; never mutate a voice's preset or shared envelope. */
export function expressiveSource(plan, expression) {
    if (!expression) return plan;
    const offset = expression.brightnessCents;
    // Physical sources are cached buffers: use a few tone layers rather
    // than generating a fresh buffer for every tiny velocity difference.
    const sourceOffset = Math.max(-240, Math.min(240, Math.round(offset / 90) * 90));
    return { ...plan,
        pitchMotion: expression.pitchMotion ? {...expression.pitchMotion,duration:Math.max(plan.duration,...(plan.gainPoints??[]).map(p=>p[0]))} : null,
        heldExpression: expression.vibratoDepth ? { depth: expression.vibratoDepth, delay: expression.vibratoDelay, rate: expression.vibratoRate, duration: plan.duration } : null,
        filterOffset: plan.filterOffset + offset,
        filterEvents: plan.filterEvents.map(e => ({ ...e, value: e.value + offset })),
        piano: plan.piano ? { ...plan.piano, brightness: bounded(plan.piano.brightness + sourceOffset / 1800, .5, 0, 1) } : null,
        string: plan.string ? { ...plan.string, damping: bounded(plan.string.damping - sourceOffset / 2400, .5, 0, 1) } : null,
    };
}

/** Multiply the existing gain envelope; never add gain, duration or a new source. */
export function breathEnvelope(points, duration, expression) {
    const depth = expression?.breathDepth ?? 0;
    if (!depth || duration <= 0) return points;
    const times = [...new Set([...points.map(p => p[0]), ...[.14,.3,.5,.7,.88,1].map(t => t * duration)])].sort((a,b) => a-b);
    let index = 0;
    return times.map(time => {
        while (index + 1 < points.length && points[index+1][0] <= time) index++;
        const a = points[index], b = points[Math.min(index+1, points.length-1)];
        const value = a[1] + (b[1]-a[1]) * (b[0] > a[0] ? (time-a[0])/(b[0]-a[0]) : 0);
        const phase = Math.min(1, time / duration);
        return [time, value * (1 - depth * (1 - Math.sin(Math.PI * phase) ** 2))];
    });
}
/** Bounded note-local pitch automation, combined with the existing pitch envelope. */
export function heldPitchPoints(expression, env = {}, slide = null, motion = null, path = null) {
    const { duration, delay, depth, rate } = expression;
    const end = Math.min(30, Math.max(0, duration, motion?.duration || 0, path?.at(-1)?.time || 0)), count = Math.max(1, Math.ceil(end * 60));
    const times=Array.from({length:count+1},(_,i)=>i*end/count);
    if(slide && slide.seconds<end && !times.some(t=>Math.abs(t-slide.seconds)<1e-8))times.push(slide.seconds);
    for(const p of path??[])if(p.time<=end&&!times.some(t=>Math.abs(t-p.time)<1e-8))times.push(p.time);
    return times.sort((a,b)=>a-b).map(t => {
        const onset = Math.max(0, Math.min(1, (t-delay)/.5));
        const release = Math.max(0, Math.min(1, (end-t)/.15));
        const pitch = (env.amount || 0) * Math.exp(-3*t/Math.max(.001, env.decay || .001));
        return [t, pitch + depth * onset * release * Math.sin(2*Math.PI*rate*Math.max(0,t-delay)) + (path ? pitchPathCents(path,t) : 0) + (motion ? pitchMotionCents(motion,t) : 0) + (slide?slide.cents*Math.max(0,1-t/slide.seconds):0)];
    });
}

/** Only shorten decay/release; held notes retain their original release and sustain. */
export function gateEnvelope(env, duration, expression) {
    if (!expression?.gateAware) return env;
    return {...env, decay: Math.min(env.decay,Math.max(.03,duration*.6)),
        release: duration < .85 ? Math.min(env.release,Math.max(.06,duration*.65)) : env.release };
}

/** Shared pitch automation for oscillator voices and physical buffer sources. */
export function expressivePitchPoints(plan) {
    if(!plan.heldExpression&&!plan.slide&&!plan.pitchMotion&&!plan.pitchPath?.length)return null;
    const held=plan.heldExpression??{duration:Math.max(plan.slide?.seconds||0,plan.pitchMotion?.duration||0,plan.pitchPath?.at(-1)?.time||0,(plan.pitchEnv?.decay||0)*4),depth:0,delay:0,rate:0};
    return heldPitchPoints(held,plan.pitchEnv,plan.slide,plan.pitchMotion,plan.pitchPath);
}

/** Slow, non-repeating-over-a-phrase detuning; no note-on or note-off reset. */
export function pitchMotionCents({phase,rate,depth},time) {
 const p=phase+time*rate;
 return depth*(.62*Math.sin(p)+.38*Math.sin(p*.431+1.7));
}

/** Finite, ordered target pitches in seconds after the one initial attack. */
export function cleanPitchTargets(raw) {
 if(!Array.isArray(raw))return null;
 const points=new Map();
 for(const p of raw.slice(0,64))if(Number.isFinite(p?.time)&&Number.isFinite(p?.midi)&&p.time>=0&&p.time<=30)
  points.set(p.time,{time:p.time,midi:Math.max(0,Math.min(127,Math.round(p.midi)))});
 return points.size?[...points.values()].sort((a,b)=>a.time-b.time):null;
}
/** Smooth glides hit each target exactly, then hold until the next segment. */
export function pitchPathCents(path,time) {
 let a=path[0];
 if(time<=a.time)return a.cents;
 for(const b of path.slice(1)) {
  if(time<=b.time){const u=(time-a.time)/(b.time-a.time),ease=u*u*(3-2*u);return a.cents+(b.cents-a.cents)*ease;}
  a=b;
 }
 return a.cents;
}
