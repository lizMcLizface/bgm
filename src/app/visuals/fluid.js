// GPU Stable Fluids: normalised-domain velocity, pressure projection, dye advection.
// Energy reduction and limiting remain on the GPU (no per-frame CPU readback).
export const SIM_RESOLUTIONS = [128, 256, 512, 1024];
export const DYE_RESOLUTIONS = [256, 512, 1024, 2048];

// Both axes remain powers of two for an equally weighted mean-energy reduction.
export function fluidDimensions(aspect, resolution) {
  const ratio = Math.max(0.125, Math.min(8, aspect || 1));
  const short = Math.max(16, 2 ** Math.round(Math.log2(resolution / Math.max(ratio, 1 / ratio))));
  return ratio >= 1 ? [resolution, short] : [short, resolution];
}

const VERTEX = `#version 300 es
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
const HEADER = `#version 300 es
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
`;
const SHADERS = {
  // Limited MacCormack dye transport restores detail lost to bilinear advection.
  correctAdvection: `void main(){
    vec2 p=clamp(uv-dt*sampleLinear(velocity,uv).xy,vec2(0),vec2(1));
    ivec2 size=textureSize(source,0), i=ivec2(floor(p*vec2(size)-0.5));
    vec4 a=texelFetch(source,clamp(i,ivec2(0),size-1),0);
    vec4 b=texelFetch(source,clamp(i+ivec2(1,0),ivec2(0),size-1),0);
    vec4 c=texelFetch(source,clamp(i+ivec2(0,1),ivec2(0),size-1),0);
    vec4 d=texelFetch(source,clamp(i+ivec2(1,1),ivec2(0),size-1),0);
    vec4 corrected=texture(forwardField,uv)+0.5*(texture(source,uv)-texture(reverseField,uv));
    result=clamp(corrected,min(min(a,b),min(c,d)),max(max(a,b),max(c,d)))*exp(-decay*dt);
  }`,
  curl: `void main(){
    float l=texture(source,uv-vec2(texel.x,0)).y, r=texture(source,uv+vec2(texel.x,0)).y;
    float b=texture(source,uv-vec2(0,texel.y)).x, t=texture(source,uv+vec2(0,texel.y)).x;
    result=vec4(0.5*((r-l)/texel.x-(t-b)/texel.y),0,0,0);
  }`,
  confine: `void main(){
    float l=abs(texture(pressure,uv-vec2(texel.x,0)).x),r=abs(texture(pressure,uv+vec2(texel.x,0)).x);
    float b=abs(texture(pressure,uv-vec2(0,texel.y)).x),t=abs(texture(pressure,uv+vec2(0,texel.y)).x);
    vec2 n=0.5*vec2(r-l,t-b)/texel; n/=max(length(n),0.00001);
    float spin=texture(pressure,uv).x;
    vec2 force=vorticity*max(texel.x,texel.y)*spin*vec2(n.y,-n.x);
    result=vec4(clamp(texture(source,uv).xy+dt*force,vec2(-2),vec2(2)),0,0);
  }`,

  copy: `void main(){result=sampleLinear(source,uv);}`,
  // Implicit diffusion: (I - coefficient*dt*Laplacian) field = original.
  // source is the fixed RHS; velocity is the previous Jacobi iterate.
  diffuse: `uniform vec2 weights;
  void main(){
    vec2 cell=1.0/vec2(textureSize(source,0));
    vec4 neighbours=weights.x*(texture(velocity,uv-vec2(cell.x,0))+texture(velocity,uv+vec2(cell.x,0)))
                   +weights.y*(texture(velocity,uv-vec2(0,cell.y))+texture(velocity,uv+vec2(0,cell.y)));
    result=(texture(source,uv)+neighbours)/(1.0+2.0*(weights.x+weights.y));
  }`,

  advect: `void main(){vec2 v=sampleLinear(velocity,uv).xy;result=sampleLinear(source,clamp(uv-dt*v,vec2(0),vec2(1)))*exp(-decay*dt);}`,
  inject: `uniform int count; uniform vec4 points[32],forces[32],colours[32]; uniform bool dye;
 void main(){vec4 v=texture(source,uv);for(int i=0;i<32;i++){if(i>=count)break;
 vec2 d=(uv-points[i].xy)*vec2(aspect,1);float w=exp(-dot(d,d)/max(pow(dye?colours[i].w:forces[i].z,2.0),0.00000001));
 v+=vec4(dye?colours[i].rgb:vec3(forces[i].xy,0),0)*w*points[i].w*dt;}
 result=dye?clamp(v,0.0,4.0):vec4(clamp(v.xy,vec2(-2),vec2(2)),0,0);}`,
  divergence: `void main(){vec2 v=texture(source,uv).xy;
 float l=uv.x<texel.x?-v.x:texture(source,uv-vec2(texel.x,0)).x;
 float r=uv.x>1.0-texel.x?-v.x:texture(source,uv+vec2(texel.x,0)).x;
 float b=uv.y<texel.y?-v.y:texture(source,uv-vec2(0,texel.y)).y;
 float t=uv.y>1.0-texel.y?-v.y:texture(source,uv+vec2(0,texel.y)).y;
 result=vec4(0.5*((r-l)/texel.x+(t-b)/texel.y),0,0,0);}`,
  pressure: `void main(){float l=texture(pressure,uv-vec2(texel.x,0)).x,r=texture(pressure,uv+vec2(texel.x,0)).x;
 float b=texture(pressure,uv-vec2(0,texel.y)).x,t=texture(pressure,uv+vec2(0,texel.y)).x;
 vec2 w=1.0/(texel*texel);result=vec4(((l+r)*w.x+(b+t)*w.y-texture(source,uv).x)/(2.0*(w.x+w.y)),0,0,0);}`,
  project: `void main(){float l=texture(pressure,uv-vec2(texel.x,0)).x,r=texture(pressure,uv+vec2(texel.x,0)).x;
 float b=texture(pressure,uv-vec2(0,texel.y)).x,t=texture(pressure,uv+vec2(0,texel.y)).x;
 vec2 v=texture(source,uv).xy-0.5*vec2(r-l,t-b)/texel;
 if(uv.x<texel.x||uv.x>1.0-texel.x)v.x=0.0;if(uv.y<texel.y||uv.y>1.0-texel.y)v.y=0.0;result=vec4(v,0,0);}`,
  measure: `void main(){vec2 v=texture(source,uv).xy;result=vec4(0.5*dot(v,v),0,0,0);}`,
  reduce: `void main(){ivec2 size=textureSize(source,0),base=ivec2(gl_FragCoord.xy)*2;float sum=0.0;
 for(int y=0;y<2;y++)for(int x=0;x<2;x++)sum+=texelFetch(source,min(base+ivec2(x,y),size-1),0).x;result=vec4(sum*0.25,0,0,0);}`,
  limit: `void main(){float e=texelFetch(energy,ivec2(0),0).x;
 float scale=min(1.0,sqrt(cap/max(e,1e-12)))*0.999;result=texture(source,uv)*scale;}`
};
export function createFluid(gl, aspect = 1, settings = {}) {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Fluid needs floating-point render targets');
  const textures = [],
    framebuffers = [],
    programs = [],
    shaders = [],
    vao = gl.createVertexArray();
  const dispose = () => {
    textures.forEach(t => gl.deleteTexture(t));
    framebuffers.forEach(f => gl.deleteFramebuffer(f));
    programs.forEach(p => gl.deleteProgram(p));
    shaders.forEach(s => gl.deleteShader(s));
    gl.deleteVertexArray(vao);
  };
  try {
    const compile = (type, text) => {
      const s = gl.createShader(type);
      shaders.push(s);
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const passes = Object.fromEntries(Object.entries(SHADERS).map(([name, body]) => {
      const p = gl.createProgram();
      programs.push(p);
      gl.attachShader(p, vertex);
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEADER + body));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const uniforms = {};
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        const info = gl.getActiveUniform(p, i);
        uniforms[info.name.replace('[0]', '')] = {
          loc: gl.getUniformLocation(p, info.name),
          type: info.type
        };
      }
      return [name, {
        p,
        uniforms
      }];
    }));
    const target = (w, h, full = false) => {
      const texture = gl.createTexture();
      textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, full ? gl.RGBA32F : gl.RGBA16F, w, h, 0, gl.RGBA, full ? gl.FLOAT : gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer();
      framebuffers.push(fbo);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Fluid framebuffer unsupported');
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        texture,
        fbo,
        w,
        h
      };
    };
    const pair = (w, h) => ({
      read: target(w, h),
      write: target(w, h),
      swap() {
        [this.read, this.write] = [this.write, this.read];
      }
    });
    let w, h, velocity, dye, pressure, divergence, reduction, velocityOriginal, dyeOriginal, dyeForward, curl;
    let dimensions = '';
    const allocate = (simResolution, dyeResolution, ratio) => {
      const sim = SIM_RESOLUTIONS.includes(simResolution) ? simResolution : 256;
      const ink = DYE_RESOLUTIONS.includes(dyeResolution) ? dyeResolution : 512;
      const [nw, nh] = fluidDimensions(ratio, sim), [dw, dh] = fluidDimensions(ratio, ink);
      const key = [nw, nh, dw, dh].join('/');
      if (dimensions === key) return;
      const oldTextures = textures.length, oldFramebuffers = framebuffers.length;
      let next;
      try {
        next = {
          velocity: pair(nw, nh), dye: pair(dw, dh), pressure: pair(nw, nh), divergence: target(nw, nh),
          velocityOriginal: target(nw, nh), dyeOriginal: target(dw, dh), dyeForward: target(dw, dh), curl: target(nw, nh), reduction: [target(nw, nh, true)],
        };
        for (let rw = nw, rh = nh; rw > 1 || rh > 1;) {
          rw = Math.max(1, rw / 2); rh = Math.max(1, rh / 2);
          next.reduction.push(target(rw, rh, true));
        }
        // Resample state when changing quality; do not restart the music or fluid.
        if (velocity) run('copy', next.velocity.read, { source: velocity.read });
        if (dye) run('copy', next.dye.read, { source: dye.read });
      } catch (error) {
        textures.splice(oldTextures).forEach((t) => gl.deleteTexture(t));
        framebuffers.splice(oldFramebuffers).forEach((f) => gl.deleteFramebuffer(f));
        throw error;
      }
      textures.splice(0, oldTextures).forEach((t) => gl.deleteTexture(t));
      framebuffers.splice(0, oldFramebuffers).forEach((f) => gl.deleteFramebuffer(f));
      ({ velocity, dye, pressure, divergence, reduction, velocityOriginal, dyeOriginal, dyeForward, curl } = next);
      w = nw; h = nh; dimensions = key;
    };
    const run = (name, out, values = {}) => {
      const pass = passes[name];
      gl.useProgram(pass.p);
      gl.bindVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
      gl.viewport(0, 0, out.w, out.h);
      let unit = 0;
      Object.entries({
        texel: [1 / w, 1 / h],
        aspect,
        ...values
      }).forEach(([key, value]) => {
        const uniform = pass.uniforms[key];
        if (!uniform) return;
        const {
          loc,
          type
        } = uniform;
        if (value.texture) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, value.texture);
          gl.uniform1i(loc, unit++);
        } else if (type === gl.BOOL || type === gl.INT) gl.uniform1i(loc, value);else if (type === gl.FLOAT_VEC4) gl.uniform4fv(loc, value);else if (type === gl.FLOAT_VEC2) gl.uniform2fv(loc, value);else if (type === gl.FLOAT_VEC3) gl.uniform3fv(loc, value);else gl.uniform1f(loc, value);
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    allocate(settings.simResolution, settings.dyeResolution, aspect);
    const diffuse = (field, original, coefficient, dt) => {
      if (!(coefficient > 0)) return;
      run('copy', original, { source: field.read });
      const weights = [coefficient * dt * field.read.w ** 2, coefficient * dt * field.read.h ** 2];
      // More iterations at fine resolutions keep diffusion consistent in domain units.
      const iterations = Math.min(48, Math.max(12, Math.ceil(8 * Math.sqrt(Math.max(...weights)))));
      for (let i = 0; i < iterations; i++) {
        run('diffuse', field.write, { source: original, velocity: field.read, weights });
        field.swap();
      }
    };
    const points = new Float32Array(128),
      forces = new Float32Array(128),
      colours = new Float32Array(128);
    let steps = 0;
    return {
      get texture() {
        return dye.read.texture;
      },
      get dimensions() { return { velocity: [w, h], dye: [dye.read.w, dye.read.h] }; },
      get dyeTarget() { return dye.read; },
      get energyTarget() {
        return reduction[reduction.length - 1];
      },
      get velocityTarget() {
        return velocity.read;
      },
      get steps() {
        return steps;
      },
      step(dt, emitters, options) {
        aspect = options.aspect;
        allocate(options.simResolution ?? settings.simResolution, options.dyeResolution ?? settings.dyeResolution, aspect);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.SCISSOR_TEST);
        run('advect', velocity.write, {
          source: velocity.read,
          velocity: velocity.read,
          dt,
          decay: options.velocityDissipation ?? 0.35
        });
        velocity.swap();
        const active = emitters.slice(0, 32),
          budget = 1 / Math.max(1, active.reduce((sum, e) => sum + e.strength, 0) / 3);
        points.fill(0);
        forces.fill(0);
        colours.fill(0);
        active.forEach((e, i) => {
          points.set([e.x, e.y, e.radius, e.strength * budget], i * 4);
          forces.set([e.vx, e.vy, e.radius * 1.8, 0], i * 4);
          const fullness = Math.max(0, Math.min(1, options.fullness ?? 0));
          colours.set([...e.rgb.map(v => v * 2.8 * options.glow * (e.dyeGain ?? 1) * (1 + fullness * 0.5)),
            e.radius * (1 + fullness * 3)], i * 4);
        });
        const inputs = {
          dt,
          count: active.length,
          points,
          forces,
          colours
        };
        run('inject', velocity.write, {
          ...inputs,
          source: velocity.read,
          dye: false
        });
        velocity.swap();
        diffuse(velocity, velocityOriginal, options.velocityDiffusion, dt);
        if ((options.vorticity ?? 12) > 0) {
          run('curl', curl, { source: velocity.read });
          run('confine', velocity.write, { source: velocity.read, pressure: curl, dt, vorticity: options.vorticity ?? 12 });
          velocity.swap();
        }
        // Projection and the hard energy cap follow confinement, so restored
        // vortices cannot increase total kinetic energy past the ceiling.
        run('divergence', divergence, {
          source: velocity.read
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.read.fbo);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (let i = 0; i < 24; i++) {
          run('pressure', pressure.write, {
            source: divergence,
            pressure: pressure.read
          });
          pressure.swap();
        }
        run('project', velocity.write, {
          source: velocity.read,
          pressure: pressure.read
        });
        velocity.swap();
        run('measure', reduction[0], {
          source: velocity.read
        });
        for (let i = 1; i < reduction.length; i++) run('reduce', reduction[i], {
          source: reduction[i - 1]
        });
        run('limit', velocity.write, {
          source: velocity.read,
          energy: reduction[reduction.length - 1],
          cap: options.energyCap
        });
        velocity.swap();
        run('advect', dyeForward, { source: dye.read, velocity: velocity.read, dt, decay: 0 });
        run('advect', dyeOriginal, { source: dyeForward, velocity: velocity.read, dt: -dt, decay: 0 });
        run('correctAdvection', dye.write, { source: dye.read, velocity: velocity.read,
          forwardField: dyeForward, reverseField: dyeOriginal, dt, decay: options.dissipation });
        dye.swap();
        run('inject', dye.write, {
          ...inputs,
          source: dye.read,
          dye: true
        });
        dye.swap();
        diffuse(dye, dyeOriginal, options.dyeDiffusion, dt);
        steps++;
      },
      clear() {
        gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0);
        framebuffers.forEach((fbo) => {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.clear(gl.COLOR_BUFFER_BIT);
        });
      },
      dispose
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
