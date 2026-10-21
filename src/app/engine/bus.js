// The shared effects bus (settings.bus): every voice can send part of its sound, after its own
// effects, volume and wander, to one effects rack (synths/effects) whose return joins the mix.
// Each voice keeps its own reverb and delay; the bus is a common space on top. Nothing is
// built while every send is 0, so a setup without the bus costs and sounds as before.
import { RACK_PARAMS, cleanRack, rackPackets } from '../../synths/effects/params';
import { effectTail } from '../../synth-lab/effectsConfig';

export const BUS_ROLES = ['lead', 'counter', 'pad', 'bass', 'perc'];
// A send bus returns only what it adds: no dry level; a medium room.
export const DEFAULT_BUS_RACK = { ...cleanRack(), 'effects.dry': 0, 'effects.reverb': 0.6, 'effects.decay': 4, 'effects.size': 0.8, 'effects.damping': 5000, 'effects.predelay': 25 };
export const defaultBus = () => ({ sends: Object.fromEntries(BUS_ROLES.map((role) => [role, 0])), rack: { ...DEFAULT_BUS_RACK } });
/** Settings rules (settings.js): send levels 0..1 and the rack's own parameter ranges. */
export const BUS_RULES = {
    sends: Object.fromEntries(BUS_ROLES.map((role) => [role, (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined)])),
    rack: Object.fromEntries(RACK_PARAMS.PARAMS.map(({ key }) => [key, (v) => (typeof v === 'number' && Number.isFinite(v) ? RACK_PARAMS.clampValue(key, v) : undefined)])),
};
export const busActive = (bus) => BUS_ROLES.some((role) => bus?.sends?.[role] > 0);
/** The bus's rack, connected to `destination`. */
export async function createBusRack(context, rack, destination) {
    const { createRack } = await import('../../synths/effects/graph');
    const node = await createRack(context, rack);
    node.connect(destination);
    return node;
}
/** How long the bus rings on after its input stops (for renders). */
export const busTail = (bus) => (busActive(bus) ? effectTail(rackPackets(bus.rack).effects) : 0);
