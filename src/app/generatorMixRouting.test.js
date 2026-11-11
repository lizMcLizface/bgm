import {describe,it,expect,vi} from 'vitest';

vi.mock('../audio/context',()=>({audioContext:{}}));
vi.mock('../audio/bus',()=>({masterBus:{}}));
const pending=vi.hoisted(()=>[]);
vi.mock('./engine/bus',async importOriginal=>({
 ...await importOriginal(),
 createBusRack:vi.fn((_context,_values,destination)=>new Promise(resolve=>pending.push(rack=>{rack.connect(destination);resolve(rack);}))),
}));
import Generator from './Generator';
import {defaultBus,createBusRack} from './engine/bus';

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

it.each(['bus','space'])('passes context-bound prepared factories into a newly created shared %s rack',async kind=>{const g=fixture(),r=rack(),pluginFactory=()=>{},dynamicsFactory=()=>{};g.audioEnvironment={rackPluginFactory:pluginFactory,rackDynamicsFactory:dynamicsFactory};kind==='bus'?g.applyBus():g.applySpace(.5,0,2);expect(createBusRack).toHaveBeenLastCalledWith(g.AC,expect.any(Object),g.output,{pluginFactory,dynamicsFactory,onError:expect.any(Function)});pending.shift()(r);await g[kind+'Loading'];g.disposeSharedEffects();});

it('waits for shared preparation before arming and propagates owned bus failures',async()=>{const g=fixture(),r=rack();g.AC.state='running';g.audioEnvironment={rackDynamicsFactory:()=>{}};r.armRuntime=vi.fn(async()=>{});g.applyBus();const ready=g.awaitSharedEffectsReady();expect(r.armRuntime).not.toHaveBeenCalled();pending.shift()(r);await ready;expect(r.armRuntime).toHaveBeenCalledOnce();const error=Error('owned shared processor failed');createBusRack.mock.calls.at(-1)[3].onError(error);await expect(g.awaitSharedEffectsReady()).rejects.toBe(error);g.disposeSharedEffects();});
it('waits for a late shared owner disposal without recreating sends',async()=>{const g=fixture(),r=rack();let finish;r.dispose=vi.fn(()=>new Promise(resolve=>finish=resolve));g.applyBus();const retired=g.disposeSharedEffects();expect(g.disposeSharedEffects()).toBe(retired);pending.shift()(r);await Promise.resolve();await Promise.resolve();expect(r.dispose).toHaveBeenCalledOnce();let complete=false;retired.then(()=>complete=true);await Promise.resolve();expect(complete).toBe(false);finish();await retired;expect(g.roles.lead.send).toBeUndefined();});
it('retains the primary cleanup failure and still retires every shared owner',async()=>{const g=fixture(),first=Error('first failure'),close=vi.fn(async()=>{});g.ambience={dispose(){throw first;}};g.busRack={dispose:close};const retired=g.disposeSharedEffects();await expect(retired).rejects.toThrow('Shared effects disposal failed');expect(close).toHaveBeenCalledOnce();expect(g.sharedEffectsDisposalError.errors[0]).toBe(first);});

it('retains a failure from disposing an owner that arrives after the host has closed',async()=>{const g=fixture(),r=rack(),failure=Error('late owner cleanup failed');r.dispose=vi.fn(async()=>{throw failure;});g.applyBus();const retired=g.disposeSharedEffects(),rejected=expect(retired).rejects.toThrow('Shared effects disposal failed');pending.shift()(r);await rejected;expect(g.sharedEffectsDisposalError.errors).toContain(failure);expect(g.roles.lead.send).toBeUndefined();});
