// Independent actual JS reference and stream comparator; no Rust math is reused.
import {WeatherModel}from'../src/ambient/weatherModel.js';
import {WeatherBedModel}from'../src/app/engine/weatherBedModel.js';
import {WEATHER_ENV_KEYS,WEATHER_SURFACES}from'../src/modular-audio/ownedWeatherBed.js';
const output=(layers,n)=>Array.from({length:layers},()=>[new Float32Array(n),new Float32Array(n)]);
export class WeatherBedReference{
 constructor(spec,shape={},levels={}){this.spec=spec;this.bed=new WeatherBedModel(spec.sampleRate,shape,levels,spec.seed);this.raw=new WeatherModel(spec.sampleRate,spec.environment,spec.seed);this.events=spec.events.map((e,i)=>({...e,i})).sort((a,b)=>a.frame-b.frame||a.i-b.i);this.frame=0;this.index=0;}
 apply(e){if(e.kind==='parameter'){if(e.id<=13){const key=e.id===13?'surfaceType':WEATHER_ENV_KEYS[e.id],value=e.id===13?WEATHER_SURFACES[e.value]:e.value;this.bed.model.setEnvironment({[key]:value});this.raw.setEnvironment({[key]:value});}else this.bed.targets[e.id-14]=e.value;}else{this.bed.model.trigger(e.kind);this.raw.trigger(e.kind);}}
 render(n){const result=output(15,n);let offset=0;while(offset<n){while(this.index<this.events.length&&this.events[this.index].frame<=this.frame)this.apply(this.events[this.index++]);const count=Math.min(n-offset,(this.events[this.index]?.frame??Infinity)-this.frame),raw=output(12,count),bed=output(3,count);this.raw.process(raw);this.bed.process(bed);[...raw,...bed].forEach((pair,l)=>pair.forEach((ch,c)=>result[l][c].set(ch,offset)));this.frame+=count;offset+=count;}return result;}
 stats(){return this.raw.stats();}
}
export function compareWeatherBlock(g,reference,n,aggregate){g.render(n);const expected=reference.render(n),actual=[...g.layers,...g.stems];for(let l=0;l<15;l++)for(let c=0;c<2;c++)for(let i=0;i<n;i++){const a=actual[l][c][i],b=expected[l][c][i],d=a-b;aggregate.maxSampleError=Math.max(aggregate.maxSampleError,Math.abs(d));aggregate.diff+=d*d;aggregate.energy+=b*b;aggregate.peak=Math.max(aggregate.peak,Math.abs(a));if(d!==0)aggregate.differingSamples++;}return aggregate;}
export const emptyWeatherComparison=()=>({maxSampleError:0,diff:0,energy:0,peak:0,differingSamples:0});
