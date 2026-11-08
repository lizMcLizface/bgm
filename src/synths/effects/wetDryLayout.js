// Physical bench arrangement: branch pedals above the source, keybed below;
// mixer, master pedals and final analysers form the right-hand column.
import {busBinding} from './parallelModel';

export function wetDryPoses(layout){
 const objects=new Map(layout.objects.map(o=>[o.binding,o]));
 const size=(id,w,h)=>{const s=objects.get(id)?.size;return {w:s?.w||w,h:s?.h||h};};
 const source=size('source',1840,860),keys=size('keyboard',1802,250),mixer=size('mixer',980,710),sounds=size('sounds',980,94);
 const drive=busBinding('drive','overdrive'),zplane=busBinding('wet','zplane'),chorus=busBinding('wet','chorus'),vibrato=busBinding('wet','vibrato'),delay=busBinding('wet','delay');
 const zp=size(zplane,540,337),ch=size(chorus,264,322),vb=size(vibrato,192,322),dl=size(delay,440,337),od=size(drive,192,322);
 const row=Math.max(zp.h,ch.h,dl.h,od.h),sourceY=row+64,right=source.w+48;
 const masterY=Math.max(mixer.h+64,sourceY+source.h-337),scopeY=Math.max(sourceY+source.h+64,masterY+337+64);
 const point=(x,y)=>({x,y,angle:0});
 // The shorter keybed leaves room for Sounds within the analysers' footprint.
 return {
  source:point(0,sourceY),keyboard:point((source.w-keys.w)/2,sourceY+source.h+Math.max(64,sounds.h+56)),mixer:point(right,0),sounds:point((source.w-sounds.w)/2,sourceY+source.h+32),
  [drive]:point(24,(row-od.h)/2),[zplane]:point(source.w-zp.w-ch.w-vb.w-dl.w-72,0),
  [chorus]:point(source.w-ch.w-vb.w-dl.w-48,(row-ch.h)/2),[vibrato]:point(source.w-vb.w-dl.w-24,(row-vb.h)/2),[delay]:point(source.w-dl.w,0),
  [busBinding('master','reverb')]:point(right,masterY),[busBinding('master','delay')]:point(right+540,masterY),
  scope:point(right,scopeY),spectrum:point(right+540,scopeY),
  rack:point(right+980+64,0),output:point(right+980+64,900),setup:point(right+980+64,1250),
 };
}
export function placeWetDryRig(store){
 const layout=store.snapshot(),poses=wetDryPoses(layout);
 store.restore({...layout,objects:layout.objects.map(o=>poses[o.binding]?{...o,pose:poses[o.binding]}:o)});
}
