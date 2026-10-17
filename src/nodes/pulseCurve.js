/** Preserve the pulse's AC shape while removing its constant offset. */
export function dutyCycleCurve(dutyCycle=.5) {
    const duty=Number.isFinite(dutyCycle)?Math.max(.01,Math.min(.99,dutyCycle)):.5;
    const length=2048,curve=new Float32Array(length);
    for(let i=0;i<length;i++)curve[i]=i/(length-1)<duty?1:-1;
    // WaveShaper interpolates linearly: use the trapezoidal mean of its
    // transfer curve, matching the triangle carrier's uniform traversal.
    let area=(curve[0]+curve[length-1])/2;
    for(let i=1;i<length-1;i++)area+=curve[i];
    const mean=area/(length-1);
    for(let i=0;i<length;i++)curve[i]-=mean;
    return curve;
}
