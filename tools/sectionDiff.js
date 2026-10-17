const rounded = value => typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value;
const signature = events => JSON.stringify(events.map(e => [e.role, e.midi, e.beat, e.length, e.velocity, e.detune].map(rounded)).sort());

// Compare emitted events, rather than treating a changed planning curve as a note change.
export function compareSectionBars(previous, shaped, parts) {
    return shaped.bars.map((bar, index) => {
        const before = previous.bars[index];
        const voices = parts.flatMap(role => {
            const a = before.events.filter(e => e.role === role), b = bar.events.filter(e => e.role === role);
            if (signature(a) === signature(b)) return [];
            const fields = [['pitch', 'midi'], ['timing', 'beat'], ['length', 'length'], ['velocity', 'velocity'], ['detune', 'detune']];
            const changes = fields.filter(([, key]) => JSON.stringify(a.map(e => rounded(e[key])).sort()) !== JSON.stringify(b.map(e => rounded(e[key])).sort())).map(([label]) => label);
            if (a.length !== b.length) changes.unshift('attack count');
            return [{ role, before: a, after: b, changes: changes.length ? changes : ['note combinations'] }];
        });
        return { bar: bar.bar, voices };
    });
}
