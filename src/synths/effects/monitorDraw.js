import {spectrumTrace} from '../ui/scopeMath';

export function drawMonitor(canvas,kind,frame,config){
 if(!canvas)return;const g=canvas.getContext('2d');if(!g)return;
 const w=canvas.clientWidth||400,h=canvas.clientHeight||132,dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr))canvas.width=Math.round(w*dpr);if(canvas.height!==Math.round(h*dpr))canvas.height=Math.round(h*dpr);g.setTransform(dpr,0,0,dpr,0,0);
 g.fillStyle='#0b1516';g.fillRect(0,0,w,h);g.strokeStyle='#273a3a';g.lineWidth=1;g.beginPath();
 for(let i=1;i<10;i++){g.moveTo(i*w/10,0);g.lineTo(i*w/10,h);}for(let i=1;i<6;i++){g.moveTo(0,i*h/6);g.lineTo(w,i*h/6);}g.stroke();
 if(!frame)return;
 for(const ch of frame.channels){
  g.strokeStyle=ch.colour;g.lineWidth=1.4;g.beginPath();
  if(kind==='scope'){
   const x=ch.samples,scale=h*.44*frame.gain;
   if(x.length>w*2){let previous=h/2;for(let px=0;px<w;px++){let lo=Infinity,hi=-Infinity;for(let i=Math.floor(px*x.length/w);i<Math.floor((px+1)*x.length/w);i++){lo=Math.min(lo,x[i]);hi=Math.max(hi,x[i]);}const a=h/2-hi*scale,b=h/2-lo*scale,first=Math.abs(previous-a)<Math.abs(previous-b)?a:b,second=first===a?b:a;if(px)g.lineTo(px,first);else g.moveTo(px,first);g.lineTo(px,second);previous=second;}}
   else for(let i=0;i<x.length;i++){const px=i/Math.max(1,x.length-1)*w,y=h/2-x[i]*scale;if(i)g.lineTo(px,y);else g.moveTo(px,y);}
   g.stroke();
  }else{
   const trace=bins=>{const points=spectrumTrace(bins,frame.rate,Math.ceil(w));g.beginPath();for(let i=0;i<points.length;i++){const y=Math.max(0,Math.min(h,points[i]/config.floor*h));if(i)g.lineTo(i,y);else g.moveTo(i,y);}g.stroke();};
   trace(ch.bins);if(ch.hold){g.globalAlpha=.5;g.setLineDash([3,3]);trace(ch.hold);g.setLineDash([]);g.globalAlpha=1;}
  }
 }
 if(kind==='scope'){g.strokeStyle='#93b6b355';g.beginPath();g.moveTo(w*.1,0);g.lineTo(w*.1,h);g.stroke();}
 else{g.fillStyle='#90aaa9';g.font='8px monospace';const top=Math.min(20000,frame.rate/2);for(const f of [100,1000,10000])if(f<top)g.fillText(f>=1000?f/1000+'k':f,Math.log(f/20)/Math.log(top/20)*w+2,h-3);}
}
