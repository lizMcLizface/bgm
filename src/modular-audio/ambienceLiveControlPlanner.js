import {OwnedAmbienceControlPreparation} from './ownedAmbienceControlPreparation.js';

export const LIVE_AMBIENCE_RECEIPTS = 256;
/** Fixed-capacity diagnostics. These receipts are not a replay DTO. The actual
 * RNG, period, next knot and pending candidate remain in the accepted Rust unit. */
class ReceiptRing {
    constructor() { this.entries = Array(LIVE_AMBIENCE_RECEIPTS).fill(null); this.length = 0; this.next = 0; this.total = 0; }
    push(value) { this.entries[this.next] = value; this.next = (this.next + 1) % LIVE_AMBIENCE_RECEIPTS; this.length = Math.min(this.length + 1, LIVE_AMBIENCE_RECEIPTS); this.total++; }
    recent() { return Array.from({length:this.length}, (_,i) => this.entries[(this.next - this.length + i + LIVE_AMBIENCE_RECEIPTS) % LIVE_AMBIENCE_RECEIPTS]); }
}
export class AmbienceLiveControlPlanner extends OwnedAmbienceControlPreparation {
    constructor(module, recipe) { super(module, recipe); this.journal = new ReceiptRing(); }
    capacity() { this.alive(); }
    refill(now) { if (Number.isFinite(now) && now > this.stats().lastRefill + 90) throw Error('Live control refill exceeded the retained ninety-second horizon'); return super.refill(now); }
    reset() { super.reset(); this.journal = new ReceiptRing(); }
    save() { throw Error('Live control receipts are diagnostics, not a captured replay or mid-render state'); }
    receiptStatus() { this.alive(); return {profile:'bounded-live-ambience-control-v1', capacity:LIVE_AMBIENCE_RECEIPTS, retained:this.journal.length, total:this.journal.total, recent:this.journal.recent(), state:this.stats()}; }
}
