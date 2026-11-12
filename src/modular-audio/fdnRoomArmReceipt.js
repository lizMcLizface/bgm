/** Actual fresh consumer callback proof; never a constructor/control-only acknowledgement. */
export function validateFdnClockArm(reply,{identity,generation,requiredSequence}){
 const s=reply?.stats,r=reply?.clockReceipt,same=x=>x&&Object.keys(identity).every(k=>x[k]===identity[k]),integer=n=>Number.isSafeInteger(n)&&n>=0;
 if(!same(s?.identity)||r?.version!==1||r.generation!==generation||r.requiredSequence!==requiredSequence||!integer(r.minimumCoreCalls)||r.minimumCoreCalls<1||!integer(r.coreCalls)||r.coreCalls<r.minimumCoreCalls||!integer(r.clockCalls)||r.clockCalls<1||!integer(r.frame)||r.frame%128||r.frame<s.kernel?.origin||s.kernel?.calls!==r.coreCalls||s.clock?.calls!==r.clockCalls||s.clock?.lastFrame!==r.frame||s.clock?.generation!==generation||s.kernel?.frame!==r.frame+128||!integer(s.transport?.sequence)||s.transport.sequence<requiredSequence||s.error||s.disposed)throw Error('FDN live arm lacks a fresh valid Native consumer clock receipt');return r;
}
