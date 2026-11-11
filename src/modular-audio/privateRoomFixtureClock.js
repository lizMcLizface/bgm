// Preparation-only fixture authoring. This is not native timestamp import or
// an adjustment to a rendered signal. Choose an exact binary seconds epoch
// whose native BufferSource start is also a canonical integer source frame.
export function privateRoomFixtureClock(rate,minimumFrame){if(!Number.isInteger(rate)||rate<8000||rate>192000||!Number.isSafeInteger(minimumFrame)||minimumFrame<0||minimumFrame>rate*3600)throw Error('Invalid native source fixture clock');let odd=rate,power=0;while(odd%2===0){odd/=2;power++;}const phaseQuantumSeconds=2**(7-power);let seconds=Math.ceil(minimumFrame/rate/phaseQuantumSeconds)*phaseQuantumSeconds,epoch=seconds*rate;if(epoch<minimumFrame){seconds+=phaseQuantumSeconds;epoch=seconds*rate;}if(!Number.isSafeInteger(epoch)||epoch%128||seconds*rate!==epoch)throw Error('Native source fixture clock cannot be represented exactly');return{epoch,seconds,phaseQuantumSeconds};}
export const PRIVATE_ROOM_FIXTURE_ZERO_GUARD_FRAMES=128;
