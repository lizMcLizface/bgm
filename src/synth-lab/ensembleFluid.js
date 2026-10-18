import {createFluid} from '../app/visuals/fluid';

const colours={pad:[.43,.22,.7],keys:[.8,.45,.17],bass:[.12,.55,.68],lead:[.7,.25,.38],percussion:[.7,.5,.25]};
/** The production solver, with a small deterministic fixture-to-emitter adapter. */
export function createEnsembleFluid(canvas,resolution){
 const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!gl)throw Error('WebGL2 is unavailable.');
 let fluid,program,vertex,fragment,lost=false;
 const fail=e=>{e.preventDefault();lost=true;};canvas.addEventListener('webglcontextlost',fail);
 const dispose=()=>{canvas.removeEventListener('webglcontextlost',fail);if(!lost){fluid?.dispose();if(program)gl.deleteProgram(program);if(vertex)gl.deleteShader(vertex);if(fragment)gl.deleteShader(fragment);}};
 try{
  fluid=createFluid(gl,innerWidth/innerHeight,{simResolution:resolution,dyeResolution:resolution*2});
  const compile=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  vertex=compile(gl.VERTEX_SHADER,'#version 300 es\nout vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}');
  fragment=compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;in vec2 uv;uniform sampler2D dye;out vec4 colour;void main(){vec3 c=1.-exp(-texture(dye,uv).rgb*1.2);colour=vec4(vec3(.06,.075,.09)+c*.55,1);}');
  program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const uniform=gl.getUniformLocation(program,'dye'),debug=gl.getExtension('WEBGL_debug_renderer_info'),renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  let accumulator=0,steps=0;
  return {renderer,get steps(){return steps;},draw(dt,plan,clock,levels){
   if(lost)throw Error('Fluid graphics context was lost; toggle the fluid workload to restart it.');
   const scale=Math.min(devicePixelRatio||1,1.5),w=Math.max(2,Math.round(innerWidth*scale)),h=Math.max(2,Math.round(innerHeight*scale));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   const emitters=[];
   if(plan&&clock>=0){const cycle=Math.floor(clock/plan.cycleSeconds);for(const previous of [0,1]){
    if(cycle<previous)continue;const t=clock-(cycle-previous)*plan.cycleSeconds;
    for(const part of plan.parts){if((levels?.[part.id]??part.gain)<=0)continue;for(const note of part.notes){const age=t-note.time;if(age<0||age>note.duration+part.release)continue;
     const held=age<=note.duration,level=held?1:(1-(age-note.duration)/part.release)**2,phase=part.id*1.71+note.midi*.17;
     emitters.push({x:.5+.32*Math.sin(clock*.13+phase)+.05*Math.sin(clock*.41+part.id),y:.5+.32*Math.cos(clock*.11+phase*.73),vx:.3*Math.cos(clock*.2+phase),vy:.3*Math.sin(clock*.17+phase),radius:part.role==='pad'?.025:.01,strength:note.velocity*level,rgb:colours[part.role]});
    }}
   }}
   accumulator+=Math.min(.05,dt);let substeps=0;
   while(accumulator>=1/60&&substeps<2){fluid.step(1/60,emitters,{aspect:w/h,simResolution:resolution,dyeResolution:resolution*2,glow:1.1,energyCap:.0015,dissipation:.35,velocityDissipation:.5,vorticity:6,fullness:.35,velocityDiffusion:0,dyeDiffusion:0});accumulator-=1/60;substeps++;steps++;}
   if(substeps===2)accumulator=Math.min(accumulator,1/60);
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,fluid.texture);gl.uniform1i(uniform,0);gl.drawArrays(gl.TRIANGLES,0,3);
  },dispose};
 }catch(e){dispose();throw e;}
}
