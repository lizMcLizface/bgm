// @vitest-environment node
import {execFileSync} from 'node:child_process';
import {it,expect} from 'vitest';
it('preserves the original Space DSP/state/RNG at six rates and reports real positive/negative JS terminal outcomes',()=>{const output=execFileSync(process.execPath,['tools/verifyNativeSpaceLifecycle.mjs'],{encoding:'utf8'}),proof=JSON.parse(output.trim());expect(proof.checksPassed).toBe(true);expect(proof.cases).toBe(12);expect(proof.negativeTerminal).toBe(2);expect(proof.originalSHA).toBe('83d8ac422832326383efdbf8248f512d698abfe6ed538f5390a1a29ba058766f');},15000);

it('pins the original successful Native constructor/settings/API chronology',()=>{const output=execFileSync(process.execPath,['tools/verifyNativeSpaceHost.mjs'],{encoding:'utf8'}),proof=JSON.parse(output.trim());expect(proof.checksPassed).toBe(true);expect(proof.healthySections).toBe(17);expect(proof.nativeOperations).toBe(31);});
