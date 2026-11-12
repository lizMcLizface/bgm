import{captureOwnedRoleWanderSource}from'./ownedRoleWanderNode.js';
import{declareIndexedOrderedSendSource,declareOrderedSendSource,ORDERED_SEND_SOURCE_PROFILE}from'./orderedSendSources.js';
import{generatorMasterScalarRoot}from'./generatorMasterScalarRoot.js';
import{verifyMainScalarClockCertificate}from'./mainScalarColdGroup.js';
/** Factory-private fixed bus zero, before its untouched unity output wrapper.
 * The underlying five-output worklet always returns true while this borrow lives. */
export function declareGeneratorOrderedWander(host){const actual=captureOwnedRoleWanderSource(host,{outputIndex:0});return declareIndexedOrderedSendSource(actual.node,{outputIndex:actual.outputIndex,channels:actual.channels,profile:ORDERED_SEND_SOURCE_PROFILE,check:actual.check,borrow:actual.borrow});}
/** Only the registered actual Generator scalar root and its privately branded
 * certificate can authorize skipping the original unity program-output bridge. */
export function declareGeneratorOrderedMasterSources(g,clock){const root=generatorMasterScalarRoot(g),context=g?.AC;if(!root||root.context!==context||clock?.context!==context)throw Error('Actual registered scalar root and same-context clock required');const group=root.group;
 const check=()=>{root.check();const proof=root.verifyClock();verifyMainScalarClockCertificate(proof,{group,context,clock});if(proof.state!=='active'||proof.firstFrame!==0||proof.scalars!==2||proof.clockVersion!=='7a0838a735108706')throw Error('Actual active scalar clock authority differs');};check();
 return Object.freeze(['trim','ambience'].map(name=>{const node=group.sourceDestination(name);const inspect=()=>{check();if(group.sourceDestination(name)!==node||node.context!==context)throw Error('Actual scalar program endpoint changed');};return declareOrderedSendSource(node,{channels:2,profile:ORDERED_SEND_SOURCE_PROFILE,check:inspect,borrow(){inspect();const lease=root.borrow(),release=lease.release,borrowCheck=lease.check;return Object.freeze({source:node,channels:2,profile:ORDERED_SEND_SOURCE_PROFILE,check(){inspect();borrowCheck.call(lease);},release:()=>release.call(lease)});}});}));
}

/** The actual application global master bus remains Native, including its own
 * volume automation and other app contributors. It is not an owned sum source. */
export async function captureGeneratorOrderedMasterRouting(g){const{masterBus}=await import('../audio/bus.js');const root=generatorMasterScalarRoot(g);root?.check();if(!root||masterBus?.context!==g.AC)throw Error('Actual application scalar/master destinations required');return Object.freeze(['trim','ambience'].map(name=>Object.freeze({from:root.group.postControlsOutput(name),to:masterBus})));}
