import {describe,it,expect,vi} from 'vitest';

vi.mock('../audio/context',()=>({audioContext:{}}));
vi.mock('../audio/bus',()=>({masterBus:{}}));
const pending=vi.hoisted(()=>[]);
vi.mock('./engine/bus',async importOriginal=>({
 ...await importOriginal(),
 createBusRack:vi.fn((_context,_values,destination)=>new Promise(resolve=>pending.push(rack=>{rack.connect(destination);resolve(rack);}))),
}));
import Generator from './Generator';
import {defaultBus} from './engine/bus';

function node(){
 const connections=new Set();
 return {connections,gain:{value:1,setTargetAtTime:vi.fn()},connect:vi.fn(to=>connections.add(to)),disconnect:vi.fn(to=>{
  if(to===undefined)connections.clear();
  else if(!connections.delete(to))throw new Error('No such connection');
 })};
}
function fixture(){
 const g=Object.create(Generator.prototype);
 g.AC={currentTime:0,createGain:node};g.output=node();g.settings={bus:defaultBus()};g.settings.bus.sends.lead=.5;
 g.roles=Object.fromEntries(['lead','bass'].map(role=>[role,{wander:{output:node()}}]));
 return g;
}
function rack(){const output=node();return {node:output,input:node(),connect:output.connect,patch:vi.fn(),dispose:vi.fn(()=>output.disconnect())};}
function installDesk(g){g.mixReturn=node();for(const r of Object.values(g.roles))r.mixOutput=node();g.routeSharedEffects();}

describe('generator shared effects in the All desk',()=>{
 it.each(['bus','space'])('migrates a completed %s rack and its sends to post-fader routing',async kind=>{
  const g=fixture(),r=rack();
  kind==='bus'?g.applyBus():g.applySpace(.5,0,2);
  const loading=g[kind+'Loading'];pending.shift()(r);await loading;
  const key=kind==='bus'?'send':'spaceSend';
  expect(g.roles.lead.wander.output.connections.has(g.roles.lead[key])).toBe(true);
  installDesk(g);g.routeSharedEffects();
  expect([...r.node.connections]).toEqual([g.mixReturn]);
  for(const role of Object.values(g.roles)){
   expect(role.wander.output.connections.has(role[key])).toBe(false);
   expect([...role.mixOutput.connections]).toEqual([role[key]]);
  }
  g.disposeSharedEffects();expect(r.dispose).toHaveBeenCalledOnce();
 });
 it.each(['bus','space'])('resolves %s routing against a desk installed during loading',async kind=>{
  const g=fixture(),r=rack();kind==='bus'?g.applyBus():g.applySpace(.5,0,2);
  const loading=g[kind+'Loading'];installDesk(g);pending.shift()(r);await loading;
  expect([...r.node.connections]).toEqual([g.mixReturn]);
  const key=kind==='bus'?'send':'spaceSend';
  expect(g.roles.lead.wander.output.connections.size).toBe(0);
  expect(g.roles.lead.mixOutput.connections.has(g.roles.lead[key])).toBe(true);
  g.disposeSharedEffects();
 });
 it.each(['bus','space'])('disposes a pending %s rack without recreating sends after host disposal',async kind=>{
  const g=fixture(),r=rack();kind==='bus'?g.applyBus():g.applySpace(.5,0,2);
  const loading=g[kind+'Loading'];g.disposeSharedEffects();pending.shift()(r);await loading;
  expect(r.dispose).toHaveBeenCalledOnce();expect(r.node.connections.size).toBe(0);
  expect(g.roles.lead.send).toBeUndefined();expect(g.roles.lead.spaceSend).toBeUndefined();
  g.applyBus();g.applySpace(.5,0,2);expect(pending).toHaveLength(0);
 });
});
