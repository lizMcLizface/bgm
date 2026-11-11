// @vitest-environment node
import fs from'node:fs';import{it,expect}from'vitest';import{auditPhysicalBufferSourceTargets}from'../../tools/auditPhysicalBufferSourceTargets.mjs';
it('preserves16 actual native scalar cursors, source pull age and atomic live ledger admission',()=>{const module=new WebAssembly.Module(fs.readFileSync(process.env.PHYSICAL_BUFFER_LIVE_WASM??'public/physical-buffer-live/buffer.wasm')),report=auditPhysicalBufferSourceTargets(module);expect(report.cases).toHaveLength(18);expect(report.pass).toBe(true);expect(report.maxNativePositionError).toBeLessThanOrEqual(1/512);});
