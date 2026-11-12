export const FDN_ROOM_LIVE_PROFILE='original-fdn-room-live-v1';
export const FDN_LIVE_STATS=Object.freeze(['frame','peak','origin','calls','commands','rejected','renderedFrames','unpulledFrames','wetFrames','late','maxLate','roomType','decay','fdnStarted','fdnFrame','fdnReverbFrames']);
export class OwnedFdnRoomLive{
 constructor(e,rate,origin=0){if(e.fdn_live_api?.()!==1||!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('FDN live ABI/rate differs');this.e=e;this.rate=rate;this.handle=e.fdn_live_new(rate);if(!this.handle)throw Error('FDN live allocation failed');try{this.check(e.fdn_live_prepare(this.handle,origin),'prepare');this.memory=e.memory.buffer;this.input=[0,1].map(c=>new Float32Array(this.memory,e.fdn_live_input(this.handle,c),128));this.output=[0,1].map(c=>new Float32Array(this.memory,e.fdn_live_output(this.handle,c),128));}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('FDN live disposed');}
 check(ok,operation){if(!ok)throw Error('FDN live rejected '+operation);}
 sync(frame){this.alive();this.check(this.e.fdn_live_sync(this.handle,frame),'sync');}
 lane(index,value,author,seconds=author/this.rate){this.alive();this.check(this.e.fdn_live_lane(this.handle,index,value,author,seconds),'lane');}
 amountLane(index,value,author,seconds=author/this.rate){this.alive();this.check(this.e.fdn_live_amount_lane(this.handle,index,value,author,seconds),'amount-lane');}
 room(kind,decay,start=false){this.alive();if(typeof start!=='boolean')throw Error('FDN start must be Boolean');this.check(this.e.fdn_live_room(this.handle,kind,decay,+start),'room');}
 capacity(lane,count,author){this.alive();return!!this.e.fdn_live_capacity(this.handle,lane,count,author);}
 render(channels,pulled){this.alive();if(typeof pulled!=='boolean'||this.e.memory.buffer!==this.memory)throw Error('FDN live render contract differs');this.check(this.e.fdn_live_render(this.handle,channels,+pulled),'render');}
 clear(){this.alive();this.e.fdn_live_clear(this.handle);}
 stat(index){this.alive();return this.e.fdn_live_stat(this.handle,index);}
 stats(){this.alive();return Object.fromEntries(FDN_LIVE_STATS.map((k,i)=>[k,this.e.fdn_live_stat(this.handle,i)]));}
 dispose(){if(this.handle){this.e.fdn_live_free(this.handle);this.handle=0;this.input=this.output=this.memory=null;}}
}
