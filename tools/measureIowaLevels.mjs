// Balances the Iowa instruments the way the rest of the library is levelled (src/labs/levels/measure.js, npm run levels:measure): full velocity, each note in
// slots held for the same time, and one number per instrument, peak dBA as a power mean over its keyboard. Each instrument goes to the median of its class
// in src/labs/levels/suite.json, so it sits with the other winds or strings; the dB go into src/library/iowaLevels.json. Then it reports the check that
// follows: the level key by key across the range, and how far a note falls from its attack to its hold. A key more than 3 dB from the instrument's typical key gets a
// correction back to that line, at most 12 dB up: the rest of the library is flat across its range, and a key far under the others is a weak take, not the instrument.
//   node tools/measureIowaLevels.mjs [--report]     --report measures with the current trims and writes nothing
import { readFileSync, writeFileSync } from 'node:fs';
import { PATCHES } from '../src/app/engine/iowaModel/patches.js';
import { heldModel, heldVoice, decayModel, decayVoice, settleLevels, pitchRange } from '../src/app/engine/iowaModel/model.js';
import { HeldVoice, DecayVoice, RollVoice } from '../src/app/engine/iowaModel/voice.js';
import { SLOT, HOLD, START, SAMPLE_RATE, levelsFromChannels, summarise, pick, powerMean } from '../src/labs/levels/measure.js';

const FULL = 127, ALLOWED = 3, MOST_UP = 12, STRAY = 6, report = process.argv.includes('--report');
const FILE = 'src/library/iowaLevels.json', current = JSON.parse(readFileSync(FILE, 'utf8'));
const GROUP = { Flutes: 'winds', Reeds: 'winds', Saxophones: 'winds', Brass: 'winds', Bowed: 'strings', Plucked: 'plucks', Mallets: 'plucks' };
const groupOf = (patch) => (/^(bells|crotales)/.test(patch.uses ?? patch.id) ? 'bells' : GROUP[patch.family]);
const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];

// What the other instruments of each class come to.
const suite = JSON.parse(readFileSync('src/labs/levels/suite.json', 'utf8')), byGroup = {};
for (const voice of Object.values(suite.voices)) {
    const peak = summarise(voice.single, true)?.peak;
    if (Number.isFinite(peak)) (byGroup[voice.group] ??= []).push(peak);
}
const targets = Object.fromEntries(Object.entries(byGroup).map(([group, peaks]) => [group, median(peaks)]));

/** Plays one voice into a slot, held as the level suite holds its notes. */
function play(out, slot, voice) {
    const from = Math.round((slot * SLOT + START) * SAMPLE_RATE), to = Math.min(out.length, Math.round((slot + 1) * SLOT * SAMPLE_RATE)), hold = Math.round(HOLD * SAMPLE_RATE);
    for (let at = from; at < to; at += 128) {
        if (at - from >= hold) voice.release();
        const block = new Float32Array(Math.min(128, to - at));
        const alive = voice.render(block, block.length);
        for (let i = 0; i < block.length; i++) out[at + i] += block[i];
        if (!alive) break;
    }
}

const results = {};
for (const patch of PATCHES) {
    const table = settleLevels(JSON.parse(readFileSync(`src/library/iowaTables/${patch.uses ?? patch.id}.json`, 'utf8')));
    const [low, high] = pitchRange(table), all = Array.from({ length: high - low + 1 }, (_, i) => low + i);
    const notes = all.filter((midi) => (table.decay ? decayModel : heldModel)(table, midi, FULL)), COUNT = notes.length;
    const saved = current[patch.id] ?? {}, out = new Float32Array(Math.ceil(COUNT * SLOT * SAMPLE_RATE)), gainOf = (midi) => (report ? 10 ** (((saved.trim ?? 0) + (saved.curve?.[midi] ?? 0)) / 20) : 1);
    notes.forEach((midi, slot) => {
        const model = table.decay ? decayModel(table, midi, FULL) : heldModel(table, midi, FULL), gain = gainOf(midi);
        if (table.decay) {
            const spec = decayVoice(model, SAMPLE_RATE, midi);
            const voice = patch.roll ? new RollVoice(spec, SAMPLE_RATE, gain, table.roll, midi) : new DecayVoice(spec, SAMPLE_RATE, gain);
            if (patch.ring && !patch.roll) voice.release = () => {};        // a mallet rings on when the key comes up, as it does on the page
            play(out, slot, voice);
        } else {
            const spec = heldVoice(model, SAMPLE_RATE, { seed: midi });
            play(out, slot, new HeldVoice(spec, SAMPLE_RATE, gain * 10 ** (spec.level / 20), midi));
        }
    });
    const levels = levelsFromChannels(out, out, SAMPLE_RATE, COUNT), group = groupOf(patch);
    const keys = pick(levels, 'attack', true).map((attack, i) => Math.max(attack, pick(levels, 'hold', true)[i], pick(levels, 'average', true)[i])), typical = median(keys);
    // back to within the allowed distance of the typical key, then the whole instrument to its class
    const curve = {}, after = keys.map((level, i) => {
        const off = level - typical, fix = off > ALLOWED ? ALLOWED - off : off < -ALLOWED ? Math.min(MOST_UP, -ALLOWED - off) : 0;
        if (fix) curve[notes[i]] = Math.round(fix * 10) / 10;
        return level + fix;
    });
    const peak = powerMean(after);
    results[patch.id] = { group, peak, trim: Math.round((targets[group] - peak) * 10) / 10, curve, notes, levels, keys, after };
}

if (!report) writeFileSync(FILE, JSON.stringify(Object.fromEntries(Object.entries(results).map(([id, r]) => [id, { trim: r.trim, curve: r.curve }]))) + '\n');
console.log('class targets, peak dBA:', Object.entries(targets).filter(([g]) => Object.values(results).some((r) => r.group === g)).map(([g, v]) => `${g} ${v.toFixed(1)}`).join(', '));
for (const [id, r] of Object.entries(results)) {
    const shift = report ? 0 : r.trim, heard = (report ? r.keys : r.after).map((v) => v + shift), typical = median(heard);
    const strays = heard.map((v, i) => (Math.abs(v - typical) > STRAY ? `${r.notes[i]}:${(v - typical > 0 ? '+' : '') + Math.round(v - typical)}` : null)).filter(Boolean);
    const fall = median(pick(r.levels, 'attack', true).map((attack, i) => attack - pick(r.levels, 'hold', true)[i]));
    const peak = powerMean(report ? r.keys : r.after) + shift;
    console.log(`${id.padEnd(26)} ${r.group.padEnd(8)} peak ${peak.toFixed(1).padStart(6)}  trim ${String(report ? current[id]?.trim : r.trim).padStart(6)} dB  ${Object.keys(r.curve).length ? `${Object.keys(r.curve).length} keys corrected, ` : ''}range ${Math.round(Math.min(...heard))} to ${Math.round(Math.max(...heard))} dB(A)  attack-to-hold ${fall.toFixed(0).padStart(4)} dB${strays.length ? `  still ${STRAY}+ off: ${strays.join(' ')}` : ''}`);
}
