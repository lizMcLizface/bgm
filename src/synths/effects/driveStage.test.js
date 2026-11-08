import {createDriveStage} from './driveStage';
import {clippingSample,DRIVE_PEDALS} from './driveModel';
const param=()=>({value:0,setValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
function context(){const nodes=[];return {sampleRate:48000,currentTime:1,nodes,createGain(){const n={gain:param(),connect:vi.fn(),disconnect:vi.fn()};nodes.push(n);return n;},createChannelSplitter(){return this.createGain();},createBiquadFilter(){const n=this.createGain();n.frequency=param();n.Q=param();return n;},createWaveShaper(){return this.createGain();},createAnalyser(){return {...this.createGain(),getFloatTimeDomainData:data=>data.fill(.25)};}};}
it('implements pure boost as smoothed linear gain without filters or clipping',()=>{
 const ctx=context(),stage=createDriveStage(ctx,'boost');stage.patch({params:{gain:12},enabled:true},true);
 expect(ctx.nodes.some(n=>'frequency'in n||'curve'in n)).toBe(false);expect(ctx.nodes[4].gain.setValueAtTime).toHaveBeenLastCalledWith(10**(.6),1);
 stage.patch({params:{gain:6},enabled:false});expect(ctx.nodes[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(1,1,.02);expect(ctx.nodes[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(0,1,.02);expect(stage.peak).toBe(.25);stage.dispose();stage.dispose();for(const n of ctx.nodes)expect(n.disconnect).toHaveBeenCalledOnce();
});
it('uses distinct bounded clipping, 4x oversampling, DC blocking and finite tone/level extremes',()=>{
 expect(clippingSample('overdrive',.4)).toBeCloseTo(-clippingSample('overdrive',-.4),8);expect(clippingSample('fuzz',.4)).not.toBeCloseTo(-clippingSample('fuzz',-.4),3);
 for(const kind of ['overdrive','fuzz']){
  const ctx=context(),stage=createDriveStage(ctx,kind),shape=ctx.nodes.find(n=>n.curve);expect(shape.oversample).toBe('4x');expect([...shape.curve].every(v=>Number.isFinite(v)&&Math.abs(v)<=1)).toBe(true);expect(ctx.nodes.filter(n=>n.type==='highpass').map(n=>n.frequency.value)).toContain(20);
  for(const limit of ['min','max']){const params=Object.fromEntries(DRIVE_PEDALS[kind].params.PARAMS.map(p=>[p.key,p[limit]]));stage.patch({params,enabled:true},true);for(const node of ctx.nodes)for(const p of [node.gain,node.frequency].filter(Boolean))for(const [v]of p.setValueAtTime.mock.calls)expect(Number.isFinite(v)).toBe(true);}stage.dispose();
 }
});
