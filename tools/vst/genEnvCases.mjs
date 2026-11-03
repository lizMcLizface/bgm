// Writes attack / decay / release sweeps from a pair's first sweep (its base patch). Usage:
//   OPEN='{"vst":{...},"ours":{...}}' node tools/vst/genEnvCases.mjs base.json out.json attack:aAttack decay:aDecay release:aRelease sustain:aSustain
// Each arg is <VST param>:<our key>. OPEN overrides the base so the filter is wide open and the envelope is all that is measured.
import fs from 'node:fs';
const [pairFile,out,A,D,R,S,aKeys]=[process.argv[2],process.argv[3],...process.argv.slice(4)];
// A,D,R,S = "vstParam:oursKey" ; S = "vstSustainParam:oursSustainKey"
const base=JSON.parse(fs.readFileSync(pairFile,'utf8')).sweeps[0];
const [av,ao]=A.split(':'),[dv,dof]=D.split(':'),[rv,ro]=R.split(':'),[sv,so]=S.split(':');
const OPEN=JSON.parse(process.env.OPEN||'{}');
const mk=(name,vstParam,norms,vstExtra,oursExtra,fit,hold,tail,window)=>({name,vstParam,norms,hold,tail,window,
 vst:{params:{...base.vst.params,...OPEN.vst,...vstExtra}},ours:{...base.ours,...OPEN.ours,...oursExtra},fit});
const sus=(n)=>({[sv]:{norm:n}});
const spec={pair:JSON.parse(fs.readFileSync(pairFile,'utf8')).pair,defaults:{note:60,velocity:100},sweeps:[
 mk('attack',av,[.2,.35,.5,.65,.8],{...sus(1),[dv]:{norm:.3}},{[so]:1},[ao],3,.3,[0,3]),
 mk('decay',dv,[.2,.35,.5,.65,.8],{...sus(0),[av]:{norm:0}},{[so]:0,[ao]:.001},[dof],3,.3,[0,3]),
 mk('release',rv,[.2,.35,.5,.65,.8],{...sus(1),[av]:{norm:0}},{[so]:1,[ao]:.001},[ro],.8,3,[.75,3.8])]};
fs.writeFileSync(out,JSON.stringify(spec,null,1));
