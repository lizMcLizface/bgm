import {BASE_UNITS,TAIL_UNITS,orderFromCode,codeFromOrder,cleanOrder,chainUnits,maskFromUnits,stagesFor} from './order';

// Append-only adapter: existing order codes and chain bits keep their meaning.
export const BOX_BASE=BASE_UNITS.flatMap(id=>id==='space'?['delay','reverb']:[id]);
export const BOX_UNITS=[...BOX_BASE,...TAIL_UNITS];
const factorial=[1];for(let i=1;i<=BOX_BASE.length;i++)factorial[i]=factorial[i-1]*i;
export const BOX_ORDER_COUNT=factorial[BOX_BASE.length],BOX_CHAIN_MAX=2**BOX_UNITS.length-1;
const withTail=base=>base.at(-1)==='limiter'?[...base.slice(0,-1),...TAIL_UNITS,'limiter']:[...base,...TAIL_UNITS];
export function boxOrderFromCode(code){
 let n=Math.max(0,Math.min(BOX_ORDER_COUNT-1,Math.round(code)||0));const pool=[...BOX_BASE],result=[];
 for(let i=pool.length-1;i>=0;i--){const at=Math.floor(n/factorial[i]);n%=factorial[i];result.push(pool.splice(at,1)[0]);}
 return withTail(result);
}
export function boxCodeFromOrder(order){
 const pool=[...BOX_BASE];let code=0;
 for(const id of order.filter(id=>BOX_BASE.includes(id))){const at=pool.indexOf(id);if(at<0)throw Error('Duplicate effect in order');code+=at*factorial[pool.length-1];pool.splice(at,1);}
 if(pool.length)throw Error('Incomplete effect order');return code;
}
const expand=(ids,first=false)=>ids.flatMap(id=>id==='space'?(first?['reverb','delay']:['delay','reverb']):[id]);
export const logicalOrder=values=>values['master.routing']===1?boxOrderFromCode(values['master.boxOrder']):expand(orderFromCode(values['master.order']),values['master.reverbFirst']>=.5);
export const logicalChain=values=>values['master.routing']===1?BOX_UNITS.filter((id,i)=>(values['master.boxChain']>>i)&1):expand(chainUnits(values['master.chain']));
export const boxMask=ids=>BOX_UNITS.reduce((mask,id,i)=>mask|(ids.includes(id)?1<<i:0),0);
export function routingPatch(values,{order=logicalOrder(values),chain=logicalChain(values)}={}){
 const legacy=ids=>[...new Set(ids.map(id=>id==='delay'||id==='reverb'?'space':id))];
 return {'master.routing':1,'master.boxOrder':boxCodeFromOrder(order),'master.boxChain':boxMask(chain),
  'master.order':codeFromOrder(cleanOrder(legacy(order))),'master.chain':maskFromUnits(legacy(chain)),
  'master.reverbFirst':order.indexOf('reverb')<order.indexOf('delay')?1:0};
}
export function rackStages(values){
 if(values['master.routing']!==1)return stagesFor(orderFromCode(values['master.order']),chainUnits(values['master.chain']),values['master.reverbFirst']>=.5);
 const ids=logicalOrder(values).filter(id=>logicalChain(values).includes(id));
 return stagesFor(ids,ids);
}
