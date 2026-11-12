const topologyInt=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
/** One audio-thread transaction: validate all topology/activity declarations,
 * then clear only authored channel transitions and publish demand atomically. */
export function applyAmbienceSpatialTopology(slot,message){
 const core=slot.core,channels=message.channels,activity=message.activity,created=core.stats().created&63,owner=message.cancelOwner??0;
 if(core.e.ambience_spatial_live_topology_api?.()!==1||!Array.isArray(channels)||channels.length!==6||!channels.every(v=>topologyInt(v,0,2))||!topologyInt(owner,0,0xffffffff))throw Error('Invalid explicit spatial topology');
 for(const[k,max]of[['sourceAudio',524287],['sourceParameters',524287],['layerAudio',63],['layerParameters',63],['filterAudio',262143],['filterParameters',262143],['widthParameters',63],['bed',2]])if(!topologyInt(activity?.[k],0,max))throw Error('Invalid topology activity bounds');
 if(activity.sourceAudio&~activity.sourceParameters||activity.layerAudio&~activity.layerParameters||activity.filterAudio&~activity.filterParameters||activity.widthParameters&~activity.layerParameters||(activity.layerAudio|activity.layerParameters)&~created)throw Error('Invalid topology activity relationship');
 const connected=[0,0,0,0,0,0];let bound=0,found=false;
 for(const[source,binding]of core.bindings){if(owner&&binding.owner===owner){found=true;continue;}bound|=1<<source;connected[binding.layer]++;}
 if((activity.sourceAudio|activity.sourceParameters)&~bound||owner&&!found)throw Error('Unknown topology source owner');
 for(let i=0;i<6;i++){if(created&(1<<i)){if(channels[i]!== (connected[i]?2:1))throw Error('Declared channel count differs from authored source connections');}else if(channels[i]!==0)throw Error('Topology targets an uncreated layer');}
 if(owner&&(!topologyInt(message.observedFrame,0,1099511627648)||message.observedFrame%128||message.observedFrame<core.stats().observedFrame||!Number.isFinite(message.at)||message.at<0||message.at*core.sampleRate>1099511627648))throw Error('Invalid topology cancellation clock');
 if(owner)core.command(7,0,owner,message.at,0,[0,0,0,0,0,0],message.observedFrame);
 let transitions=0;for(let i=0;i<6;i++)if(channels[i]){const previous=core.e.ambience_spatial_live_input_channel_count(core.handle,i);if(!Number.isFinite(previous))throw Error('Unprepared topology channel state');if(previous!==channels[i])transitions++;if(!core.e.ambience_spatial_live_input_channels(core.handle,i,channels[i]))throw Error('Prevalidated topology transition refused');}
 if(!core.e.ambience_spatial_live_width_parameters(core.handle,activity.widthParameters))throw Error('Prevalidated width demand refused');
 slot.node.activity={...activity};
 return{transitions,channels:channels.slice(),activity:{...activity},core:core.stats()};
}
