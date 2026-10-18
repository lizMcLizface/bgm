const J=[128,256,512,1024],Q=[256,512,1024,2048];function W(e,E){const h=Math.max(.125,Math.min(8,e||1)),T=Math.max(16,2**Math.round(Math.log2(E/Math.max(h,1/h))));return h>=1?[E,T]:[T,E]}const Z=`#version 300 es
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`,$=`#version 300 es
precision highp float;
in vec2 uv; out vec4 result;
uniform sampler2D source, velocity, pressure, energy, forwardField, reverseField;
uniform vec2 texel;
uniform float dt, decay, cap, aspect, vorticity;
vec4 sampleLinear(sampler2D field,vec2 p){
 vec2 size=vec2(textureSize(field,0)),x=p*size-0.5,f=fract(x),a=(floor(x)+0.5)/size;
 return mix(mix(texture(field,a),texture(field,a+vec2(1,0)/size),f.x),
 mix(texture(field,a+vec2(0,1)/size),texture(field,a+1.0/size),f.x),f.y);
}
`,g={correctAdvection:`void main(){
    vec2 p=clamp(uv-dt*sampleLinear(velocity,uv).xy,vec2(0),vec2(1));
    ivec2 size=textureSize(source,0), i=ivec2(floor(p*vec2(size)-0.5));
    vec4 a=texelFetch(source,clamp(i,ivec2(0),size-1),0);
    vec4 b=texelFetch(source,clamp(i+ivec2(1,0),ivec2(0),size-1),0);
    vec4 c=texelFetch(source,clamp(i+ivec2(0,1),ivec2(0),size-1),0);
    vec4 d=texelFetch(source,clamp(i+ivec2(1,1),ivec2(0),size-1),0);
    vec4 corrected=texture(forwardField,uv)+0.5*(texture(source,uv)-texture(reverseField,uv));
    result=clamp(corrected,min(min(a,b),min(c,d)),max(max(a,b),max(c,d)))*exp(-decay*dt);
  }`,curl:`void main(){
    float l=texture(source,uv-vec2(texel.x,0)).y, r=texture(source,uv+vec2(texel.x,0)).y;
    float b=texture(source,uv-vec2(0,texel.y)).x, t=texture(source,uv+vec2(0,texel.y)).x;
    result=vec4(0.5*((r-l)/texel.x-(t-b)/texel.y),0,0,0);
  }`,confine:`void main(){
    float l=abs(texture(pressure,uv-vec2(texel.x,0)).x),r=abs(texture(pressure,uv+vec2(texel.x,0)).x);
    float b=abs(texture(pressure,uv-vec2(0,texel.y)).x),t=abs(texture(pressure,uv+vec2(0,texel.y)).x);
    vec2 n=0.5*vec2(r-l,t-b)/texel; n/=max(length(n),0.00001);
    float spin=texture(pressure,uv).x;
    vec2 force=vorticity*max(texel.x,texel.y)*spin*vec2(n.y,-n.x);
    result=vec4(clamp(texture(source,uv).xy+dt*force,vec2(-2),vec2(2)),0,0);
  }`,copy:"void main(){result=sampleLinear(source,uv);}",diffuse:`uniform vec2 weights;
  void main(){
    vec2 cell=1.0/vec2(textureSize(source,0));
    vec4 neighbours=weights.x*(texture(velocity,uv-vec2(cell.x,0))+texture(velocity,uv+vec2(cell.x,0)))
                   +weights.y*(texture(velocity,uv-vec2(0,cell.y))+texture(velocity,uv+vec2(0,cell.y)));
    result=(texture(source,uv)+neighbours)/(1.0+2.0*(weights.x+weights.y));
  }`,advect:"void main(){vec2 v=sampleLinear(velocity,uv).xy;result=sampleLinear(source,clamp(uv-dt*v,vec2(0),vec2(1)))*exp(-decay*dt);}",inject:`uniform int count; uniform vec4 points[32],forces[32],colours[32]; uniform bool dye;
 void main(){vec4 v=texture(source,uv);for(int i=0;i<32;i++){if(i>=count)break;
 vec2 d=(uv-points[i].xy)*vec2(aspect,1);float w=exp(-dot(d,d)/max(pow(dye?colours[i].w:forces[i].z,2.0),0.00000001));
 v+=vec4(dye?colours[i].rgb:vec3(forces[i].xy,0),0)*w*points[i].w*dt;}
 result=dye?clamp(v,0.0,4.0):vec4(clamp(v.xy,vec2(-2),vec2(2)),0,0);}`,divergence:`void main(){vec2 v=texture(source,uv).xy;
 float l=uv.x<texel.x?-v.x:texture(source,uv-vec2(texel.x,0)).x;
 float r=uv.x>1.0-texel.x?-v.x:texture(source,uv+vec2(texel.x,0)).x;
 float b=uv.y<texel.y?-v.y:texture(source,uv-vec2(0,texel.y)).y;
 float t=uv.y>1.0-texel.y?-v.y:texture(source,uv+vec2(0,texel.y)).y;
 result=vec4(0.5*((r-l)/texel.x+(t-b)/texel.y),0,0,0);}`,pressure:`void main(){float l=texture(pressure,uv-vec2(texel.x,0)).x,r=texture(pressure,uv+vec2(texel.x,0)).x;
 float b=texture(pressure,uv-vec2(0,texel.y)).x,t=texture(pressure,uv+vec2(0,texel.y)).x;
 vec2 w=1.0/(texel*texel);result=vec4(((l+r)*w.x+(b+t)*w.y-texture(source,uv).x)/(2.0*(w.x+w.y)),0,0,0);}`,project:`void main(){float l=texture(pressure,uv-vec2(texel.x,0)).x,r=texture(pressure,uv+vec2(texel.x,0)).x;
 float b=texture(pressure,uv-vec2(0,texel.y)).x,t=texture(pressure,uv+vec2(0,texel.y)).x;
 vec2 v=texture(source,uv).xy-0.5*vec2(r-l,t-b)/texel;
 if(uv.x<texel.x||uv.x>1.0-texel.x)v.x=0.0;if(uv.y<texel.y||uv.y>1.0-texel.y)v.y=0.0;result=vec4(v,0,0);}`,measure:"void main(){vec2 v=texture(source,uv).xy;result=vec4(0.5*dot(v,v),0,0,0);}",reduce:`void main(){ivec2 size=textureSize(source,0),base=ivec2(gl_FragCoord.xy)*2;float sum=0.0;
 for(int y=0;y<2;y++)for(int x=0;x<2;x++)sum+=texelFetch(source,min(base+ivec2(x,y),size-1),0).x;result=vec4(sum*0.25,0,0,0);}`,limit:`void main(){float e=texelFetch(energy,ivec2(0),0).x;
 float scale=min(1.0,sqrt(cap/max(e,1e-12)))*0.999;result=texture(source,uv)*scale;}`};function ee(e,E=1,h={}){if(!e.getExtension("EXT_color_buffer_float"))throw new Error("Fluid needs floating-point render targets");const T=[],w=[],z=[],C=[],B=e.createVertexArray(),X=()=>{T.forEach(f=>e.deleteTexture(f)),w.forEach(f=>e.deleteFramebuffer(f)),z.forEach(f=>e.deleteProgram(f)),C.forEach(f=>e.deleteShader(f)),e.deleteVertexArray(B)};try{const f=(c,s)=>{const r=e.createShader(c);if(C.push(r),e.shaderSource(r,s),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(r));return r},K=f(e.VERTEX_SHADER,Z),Y=Object.fromEntries(Object.entries(g).map(([c,s])=>{const r=e.createProgram();if(z.push(r),e.attachShader(r,K),e.attachShader(r,f(e.FRAGMENT_SHADER,$+s)),e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(r));const a={};for(let v=0;v<e.getProgramParameter(r,e.ACTIVE_UNIFORMS);v++){const u=e.getActiveUniform(r,v);a[u.name.replace("[0]","")]={loc:e.getUniformLocation(r,u.name),type:u.type}}return[c,{p:r,uniforms:a}]})),m=(c,s,r=!1)=>{const a=e.createTexture();T.push(a),e.bindTexture(e.TEXTURE_2D,a),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,r?e.RGBA32F:e.RGBA16F,c,s,0,e.RGBA,r?e.FLOAT:e.HALF_FLOAT,null);const v=e.createFramebuffer();if(w.push(v),e.bindFramebuffer(e.FRAMEBUFFER,v),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,a,0),e.checkFramebufferStatus(e.FRAMEBUFFER)!==e.FRAMEBUFFER_COMPLETE)throw new Error("Fluid framebuffer unsupported");return e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),{texture:a,fbo:v,w:c,h:s}},S=(c,s)=>({read:m(c,s),write:m(c,s),swap(){[this.read,this.write]=[this.write,this.read]}});let M,O,i,x,R,L,p,N,_,A,U,V="";const j=(c,s,r)=>{const a=J.includes(c)?c:256,v=Q.includes(s)?s:512,[u,t]=W(r,a),[d,n]=W(r,v),l=[u,t,d,n].join("/");if(V===l)return;const k=T.length,q=w.length;let b;try{b={velocity:S(u,t),dye:S(d,n),pressure:S(u,t),divergence:m(u,t),velocityOriginal:m(u,t),dyeOriginal:m(d,n),dyeForward:m(d,n),curl:m(u,t),reduction:[m(u,t,!0)]};for(let y=u,F=t;y>1||F>1;)y=Math.max(1,y/2),F=Math.max(1,F/2),b.reduction.push(m(y,F,!0));i&&o("copy",b.velocity.read,{source:i.read}),x&&o("copy",b.dye.read,{source:x.read})}catch(y){throw T.splice(k).forEach(F=>e.deleteTexture(F)),w.splice(q).forEach(F=>e.deleteFramebuffer(F)),y}T.splice(0,k).forEach(y=>e.deleteTexture(y)),w.splice(0,q).forEach(y=>e.deleteFramebuffer(y)),{velocity:i,dye:x,pressure:R,divergence:L,reduction:p,velocityOriginal:N,dyeOriginal:_,dyeForward:A,curl:U}=b,M=u,O=t,V=l},o=(c,s,r={})=>{const a=Y[c];e.useProgram(a.p),e.bindVertexArray(B),e.bindFramebuffer(e.FRAMEBUFFER,s.fbo),e.viewport(0,0,s.w,s.h);let v=0;Object.entries({texel:[1/M,1/O],aspect:E,...r}).forEach(([u,t])=>{const d=a.uniforms[u];if(!d)return;const{loc:n,type:l}=d;t.texture?(e.activeTexture(e.TEXTURE0+v),e.bindTexture(e.TEXTURE_2D,t.texture),e.uniform1i(n,v++)):l===e.BOOL||l===e.INT?e.uniform1i(n,t):l===e.FLOAT_VEC4?e.uniform4fv(n,t):l===e.FLOAT_VEC2?e.uniform2fv(n,t):l===e.FLOAT_VEC3?e.uniform3fv(n,t):e.uniform1f(n,t)}),e.drawArrays(e.TRIANGLES,0,3)};j(h.simResolution,h.dyeResolution,E);const G=(c,s,r,a)=>{if(!(r>0))return;o("copy",s,{source:c.read});const v=[r*a*c.read.w**2,r*a*c.read.h**2],u=Math.min(48,Math.max(12,Math.ceil(8*Math.sqrt(Math.max(...v)))));for(let t=0;t<u;t++)o("diffuse",c.write,{source:s,velocity:c.read,weights:v}),c.swap()},D=new Float32Array(128),I=new Float32Array(128),P=new Float32Array(128);let H=0;return{get texture(){return x.read.texture},get dimensions(){return{velocity:[M,O],dye:[x.read.w,x.read.h]}},get dyeTarget(){return x.read},get energyTarget(){return p[p.length-1]},get velocityTarget(){return i.read},get steps(){return H},step(c,s,r){E=r.aspect,j(r.simResolution??h.simResolution,r.dyeResolution??h.dyeResolution,E),e.disable(e.BLEND),e.disable(e.DEPTH_TEST),e.disable(e.SCISSOR_TEST),o("advect",i.write,{source:i.read,velocity:i.read,dt:c,decay:r.velocityDissipation??.35}),i.swap();const a=s.slice(0,32),v=1/Math.max(1,a.reduce((t,d)=>t+d.strength,0)/3);D.fill(0),I.fill(0),P.fill(0),a.forEach((t,d)=>{D.set([t.x,t.y,t.radius,t.strength*v],d*4),I.set([t.vx,t.vy,t.radius*1.8,0],d*4);const n=Math.max(0,Math.min(1,r.fullness??0));P.set([...t.rgb.map(l=>l*2.8*r.glow*(t.dyeGain??1)*(1+n*.5)),t.radius*(1+n*3)],d*4)});const u={dt:c,count:a.length,points:D,forces:I,colours:P};o("inject",i.write,{...u,source:i.read,dye:!1}),i.swap(),G(i,N,r.velocityDiffusion,c),(r.vorticity??12)>0&&(o("curl",U,{source:i.read}),o("confine",i.write,{source:i.read,pressure:U,dt:c,vorticity:r.vorticity??12}),i.swap()),o("divergence",L,{source:i.read}),e.bindFramebuffer(e.FRAMEBUFFER,R.read.fbo),e.clear(e.COLOR_BUFFER_BIT);for(let t=0;t<24;t++)o("pressure",R.write,{source:L,pressure:R.read}),R.swap();o("project",i.write,{source:i.read,pressure:R.read}),i.swap(),o("measure",p[0],{source:i.read});for(let t=1;t<p.length;t++)o("reduce",p[t],{source:p[t-1]});o("limit",i.write,{source:i.read,energy:p[p.length-1],cap:r.energyCap}),i.swap(),o("advect",A,{source:x.read,velocity:i.read,dt:c,decay:0}),o("advect",_,{source:A,velocity:i.read,dt:-c,decay:0}),o("correctAdvection",x.write,{source:x.read,velocity:i.read,forwardField:A,reverseField:_,dt:c,decay:r.dissipation}),x.swap(),o("inject",x.write,{...u,source:x.read,dye:!0}),x.swap(),G(x,_,r.dyeDiffusion,c),H++},clear(){e.disable(e.SCISSOR_TEST),e.clearColor(0,0,0,0),w.forEach(c=>{e.bindFramebuffer(e.FRAMEBUFFER,c),e.clear(e.COLOR_BUFFER_BIT)})},dispose:X}}catch(f){throw X(),f}}export{Q as D,J as S,ee as c};
