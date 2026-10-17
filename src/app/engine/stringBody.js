const profiles={
 guitar:[[110,.09,.48],[210,.065,.34],[430,.04,.18]],
 harp:[[180,.1,.4],[440,.07,.35],[860,.045,.25]],
 bass:[[70,.11,.5],[125,.08,.32],[250,.05,.18]],
 kalimba:[[480,.07,.45],[1150,.045,.35],[2400,.025,.2]],
};
/** Stable feed-forward bandpass modes, outside the string's pitch/feedback loop. */
export function stringBodyModes(sampleRate,type='guitar'){
 return (Object.hasOwn(profiles,type)?profiles[type]:profiles.guitar).map(([frequency,decay,weight])=>{
  const f=Math.min(sampleRate*.4,frequency),r=Math.exp(-1/(sampleRate*decay));
  return {frequency:f,weight,c:2*r*Math.cos(2*Math.PI*f/sampleRate),r2:r*r,b:(1-r*r)/2,y1:0,y2:0};
 });
}
