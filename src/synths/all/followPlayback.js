export function followPlayback(offset,step,part,stepsPerBar,stepSize) {
 const start=part.startBar*stepsPerBar,end=(part.startBar+part.bars)*stepsPerBar;
 const max=Math.max(start,end-16*stepSize);
 const at=Math.min(max,Math.max(start,start+Math.floor((offset-start)/stepSize)*stepSize));
 const block=4*stepSize;
 if(step<at)return Math.max(start,start+Math.floor((step-start)/block)*block);
 if(step>=at+16*stepSize)return Math.min(max,at+Math.ceil((step-at-15*stepSize)/block)*block);
 return at;
}
