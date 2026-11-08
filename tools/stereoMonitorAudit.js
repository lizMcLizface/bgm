import {createOutputMonitor} from '../src/synths/effects/outputMonitor';
let result;
async function audit(rate){
 const length=32768,ctx=new OfflineAudioContext(2,length,rate),buffer=ctx.createBuffer(2,length,rate),l=buffer.getChannelData(0),r=buffer.getChannelData(1);
 for(let i=0;i<length;i++){l[i]=.4*Math.sin(2*Math.PI*440*i/rate);r[i]=-l[i];}
 const monitor=await createOutputMonitor(ctx),source=ctx.createBufferSource();source.buffer=buffer;source.connect(monitor.node);monitor.node.connect(ctx.destination);source.start();
 let pending;
 const suspended=ctx.suspend(16384/rate).then(()=>{pending=Promise.all([new Promise(resolve=>monitor.requestStereoScope(8192,resolve,'scope')),new Promise(resolve=>monitor.requestStereoScope(16384,resolve,'spectrum')),new Promise(resolve=>monitor.requestScope(100,resolve))]);return ctx.resume();});
 try{
  const output=await ctx.startRendering();await suspended;const captures=await pending;if(captures.some(x=>!x))throw Error('A monitor capture timed out');
  let error=0;for(let ch=0;ch<2;ch++){const a=buffer.getChannelData(ch),b=output.getChannelData(ch);for(let i=0;i<length;i++)error=Math.max(error,Math.abs(a[i]-b[i]));}
  const check=frame=>{let peak=0,anti=0;for(let i=0;i<frame.left.length;i++){peak=Math.max(peak,Math.abs(frame.left[i]));anti=Math.max(anti,Math.abs(frame.left[i]+frame.right[i]));}return {frames:frame.left.length,peak,anti};};
  const scope=check(captures[0]),spectrum=check(captures[1]),monoPeak=Math.max(...captures[2].samples.map(Math.abs));return {rate,error,scope,spectrum,monoPeak,passed:error===0&&scope.frames===8192&&spectrum.frames===16384&&scope.peak>.39&&spectrum.peak>.39&&scope.anti===0&&spectrum.anti===0&&monoPeak===0};
 }finally{monitor.dispose();}
}
document.querySelector('#run').onclick=async()=>{const out=document.querySelector('#result'),button=document.querySelector('#run');button.disabled=true;out.textContent='Rendering…';try{const rows=[];for(const rate of [44100,48000,96000])rows.push(await audit(rate));result={passed:rows.every(r=>r.passed),rows};out.textContent=JSON.stringify(result,null,2);document.querySelector('#save').disabled=false;}catch(error){out.textContent=error.stack;}finally{button.disabled=false;}};
document.querySelector('#save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='stereo-monitor-audit.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
