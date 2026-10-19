// A shared room receives the same role tone, fader and stereo/level wander as
// the dry channel. Its common return joins the owner's master output.
export function createWasmRoomRoute(context,instrument,{roleWander,volume=1,tone=true,cutoff=20000}={}){
 const filter=tone?context.createBiquadFilter():null,gain=context.createGain(),motion=roleWander.createFollower();
 gain.gain.value=volume;if(filter){filter.frequency.value=cutoff;filter.Q.value=.5;instrument.roomOutput.connect(filter);filter.connect(gain);}else instrument.roomOutput.connect(gain);
 gain.connect(motion.input);motion.output.connect(instrument.roomInput);
 return {tone:filter,gain,wander:motion,dispose(){instrument.roomOutput.disconnect();filter?.disconnect();gain.disconnect();motion.dispose();}};
}
