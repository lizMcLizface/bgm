import fs from'node:fs';import assert from'node:assert/strict';import{spawnSync}from'node:child_process';
const build=spawnSync(process.execPath,['tools/buildAmbienceControlPreparation.mjs','--audit'],{stdio:'inherit'});if(build.status)process.exit(build.status);
const e=new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync('.tmp/ambience-control-preparation-audit/preparation.wasm')),{}).exports,h=e.ambience_control_preparation_new(6101,73,1e6),memory=e.memory.buffer;assert(h);
e.ambience_control_preparation_alloc_watch(1);assert.equal(e.ambience_control_preparation_first(h,101),1);
let n=0;const max=e.ambience_control_preparation_stat(h,19),p=new Float64Array(e.memory.buffer,e.ambience_control_preparation_points(h),max*2),birth=130176/48000;
while(n<max&&birth+p[2*n]*2-1e6<=birth+90)n++;assert.equal(e.ambience_control_preparation_commit(h,e.ambience_control_preparation_stat(h,16),n,birth),1);
for(let i=1;i<80;i++){assert.equal(e.ambience_control_preparation_refill(h,birth+i*15),1);assert.equal(e.ambience_control_preparation_commit(h,e.ambience_control_preparation_stat(h,16),e.ambience_control_preparation_stat(h,19),birth),1);}
assert.equal(e.ambience_control_preparation_refill(h,birth+100000),0);assert.equal(e.ambience_control_preparation_reset(h),1);assert.equal(e.ambience_control_preparation_alloc_count(),0);assert.equal(e.memory.buffer,memory);e.ambience_control_preparation_alloc_watch(0);e.ambience_control_preparation_free(h);console.log('Original control first/79refills/refusal/reset: zero allocation/free/growth after creation.');
