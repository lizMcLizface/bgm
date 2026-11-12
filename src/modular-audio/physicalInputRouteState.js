/** A requested route is not a rendered connection. Native AWP inputs reflect
 * Input.IsConnected, never a zero-PCM test. One exact a-rate integer carries
 * both monotonically increasing request identity and requested state. */
export const PHYSICAL_ROUTE_TAG_MAX=16777215,PHYSICAL_ROUTE_SERIAL_MAX=8388607;
export class PhysicalInputRouteState{
 constructor(channels,{limit=64}={}){if(![1,2].includes(channels)||!Number.isInteger(limit)||limit<1||limit>64)throw Error('Invalid physical route geometry');this.channels=channels;this.limit=limit;this.tag=0;this.serial=0;this.requestedOn=false;this.actualChannels=0;this.actualPulled=false;this.phase='off';this.mismatchQuanta=0;this.hasBeenActive=false;this.lastActiveSerial=0;this.confirmedOffSerial=0;this.allowReanchor=false;this.frame=null;}
 observe(curve,channels){if(!(curve instanceof Float32Array)||![1,128].includes(curve.length)||![0,this.channels].includes(channels))throw Error('Physical route shape differs');let previous=this.tag,maxOff=0;for(const value of curve){if(!Number.isInteger(value)||value<0||value>PHYSICAL_ROUTE_TAG_MAX||value<previous||value===1)throw Error('Physical route tag is malformed/backward');const serial=Math.floor(value/2);if(value!==previous&&serial===Math.floor(previous/2))throw Error('Physical route identity changed its request');previous=value;if(value>0&&value%2===0)maxOff=Math.max(maxOff,serial);}const tag=curve[curve.length-1],serial=Math.floor(tag/2),on=tag%2===1;if(channels>0&&(tag===0||!on&&(!this.hasBeenActive||serial<=this.lastActiveSerial)))throw Error('Unsolicited off-route input has no realized active transition');const oldActive=this.lastActiveSerial;
 if(channels===0&&this.hasBeenActive&&maxOff>oldActive)this.confirmedOffSerial=Math.max(this.confirmedOffSerial,maxOff);
 this.tag=tag;this.serial=serial;this.requestedOn=on;this.actualChannels=channels;this.actualPulled=channels>0;this.allowReanchor=false;
 if(channels>0){if(on){this.phase='active';this.allowReanchor=this.hasBeenActive&&serial>oldActive&&this.confirmedOffSerial>oldActive&&serial>this.confirmedOffSerial;this.lastActiveSerial=serial;this.hasBeenActive=true;this.mismatchQuanta=0;}else{this.phase='drain';this.mismatchQuanta++;}}
 else if(!on){this.phase='off';this.mismatchQuanta=0;}
 else{this.phase=this.hasBeenActive&&serial===oldActive?'withdrawal-pending':'opening';this.mismatchQuanta++;}
 if(this.mismatchQuanta>this.limit)throw Error('Physical route request/connection mismatch bound');return this;
 }
 committed(frame){if(!Number.isSafeInteger(frame)||frame<0||frame%128)throw Error('Physical route receipt frame differs');this.frame=frame;}
 realized(){return this.requestedOn===this.actualPulled&&(this.requestedOn?this.phase==='active':this.phase==='off');}
 proof(){return{version:1,tag:this.tag,serial:this.serial,requestedOn:this.requestedOn,actualInputChannels:this.actualChannels,actualPulled:this.actualPulled,realized:this.realized(),phase:this.phase,frame:this.frame};}
 snapshot(){return{...this.proof(),mismatchQuanta:this.mismatchQuanta,limit:this.limit,hasBeenActive:this.hasBeenActive,lastActiveSerial:this.lastActiveSerial,confirmedOffSerial:this.confirmedOffSerial,allowReanchor:this.allowReanchor};}
}
export function validatePhysicalRouteReceipt(reply,{tag,channels}){const clock=reply?.clockReceipt,p=clock?.routeProof,on=tag%2===1;if(![1,2].includes(channels)||!Number.isInteger(tag)||tag<0||tag>PHYSICAL_ROUTE_TAG_MAX||tag===1||!Number.isSafeInteger(clock?.frame)||clock.frame<0||clock.frame%128||!p||p.version!==1||p.tag!==tag||p.serial!==Math.floor(tag/2)||p.requestedOn!==on||p.actualPulled!==on||p.actualInputChannels!==(on?channels:0)||p.realized!==true||p.phase!==(on?'active':'off')||p.frame!==clock.frame)throw Error('Missing fresh realized physical route receipt');return p;}
