import data from './data/chords.json';
import '../survey_generator/survey.css';
import './chords.css';
import { splitChart } from '../survey_generator/charts';

const ROLES = ['pad', 'rhythm'];
const n = value => Number(value).toLocaleString('en-US');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const total = object => Object.values(object).reduce((sum, v) => sum + v, 0);
const pct = (a, b) => b ? `${(100 * a / b).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—';
const table = (heads, rows, numeric = []) => `<div class="scroll"><table><thead><tr>${heads.map((h, i) => `<th class="${numeric.includes(i) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const tr = (cells, numeric = []) => `<tr>${cells.map((c, i) => `<td class="${numeric.includes(i) ? 'num' : ''}">${c}</td>`).join('')}</tr>`;
const supportCell = value => `<span class="support-${value === 'yes' ? 'yes' : value === 'no' ? 'no' : 'new'}">${value === 'yes' ? '✓ yes' : esc(value)}</span>`;
const THRESHOLD = 0.01;

const roleTotals = Object.fromEntries(ROLES.map(role => [role, data.roles[role].parts]));
const knobRows = data.knobs.map(knob => {
    const counts = Object.fromEntries(ROLES.map(role => [role, data.roles[role].knobs[knob.id]]));
    const base = Object.fromEntries(ROLES.map(role => [role, total(counts[role])]));
    const values = [...new Set(ROLES.flatMap(role => Object.keys(counts[role])))];
    const share = (role, value) => base[role] ? (counts[role][value] ?? 0) / base[role] : 0;
    const peak = value => Math.max(...ROLES.map(role => share(role, value)));
    const needed = values.filter(v => peak(v) >= THRESHOLD).sort((a, b) => peak(b) - peak(a));
    const tail = values.filter(v => !needed.includes(v));
    const cover = role => {
        let sum = 0, k = 0;
        for (const [, count] of Object.entries(counts[role]).sort((a, b) => b[1] - a[1])) { sum += count; k++; if (sum >= 0.95 * base[role]) break; }
        return base[role] ? k : 0;
    };
    return { knob, counts, base, values, needed, tail, cover };
});

const chart = (title, counts) => {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]), head = entries.slice(0, 8), rest = entries.slice(8).reduce((s, [, c]) => s + c, 0);
    return splitChart(title, Object.fromEntries(rest ? [...head, ['other values', rest]] : head));
};
const knobSection = ({ knob, counts, base, needed, tail, cover }) => `<section class="knob" id="knob-${knob.id}">
<h4>${esc(knob.title)}</h4><p class="note">${esc(knob.note)}</p>
<p class="legend-line">Applies to ${ROLES.map(role => `${role} ${n(base[role])} of ${n(roleTotals[role])} parts (${pct(base[role], roleTotals[role])})`).join(' · ')}. Options for 95% of parts: ${ROLES.map(role => `${role} ${cover(role)}`).join(', ')}.</p>
<div class="chart-grid">${ROLES.map(role => chart(role, counts[role])).join('')}</div>
${table(['Option needed (1% or more of either voice)', 'Pad', 'Rhythm', 'In the sequencer today'], [
    ...needed.map(v => tr([esc(v), pct(counts.pad[v] ?? 0, base.pad), pct(counts.rhythm[v] ?? 0, base.rhythm), supportCell(knob.support[v])], [1, 2])),
    ...(tail.length ? [tr([`<i>${n(tail.length)} rarer option${tail.length === 1 ? '' : 's'}</i>`, pct(tail.reduce((s, v) => s + (counts.pad[v] ?? 0), 0), base.pad), pct(tail.reduce((s, v) => s + (counts.rhythm[v] ?? 0), 0), base.rhythm), ''], [1, 2])] : [])], [1, 2])}
${tail.length ? `<details><summary>The ${n(tail.length)} rarer options</summary>${table(['Option', 'Pad parts', 'Rhythm parts', 'In the sequencer today'], [...tail].sort((a, b) => ((counts.pad[b] ?? 0) + (counts.rhythm[b] ?? 0)) - ((counts.pad[a] ?? 0) + (counts.rhythm[a] ?? 0))).slice(0, 60).map(v => tr([esc(v), n(counts.pad[v] ?? 0), n(counts.rhythm[v] ?? 0), supportCell(knob.support[v])], [1, 2])), [1, 2])}</details>` : ''}
</section>`;

const summaryRows = knobRows.filter(r => r.knob.page > 0).map(r => tr([
    `<a href="#knob-${r.knob.id}">${esc(r.knob.title)}</a>`, String(r.knob.page), String(r.needed.length),
    `${r.cover('pad')} / ${r.cover('rhythm')}`,
    esc(r.needed.filter(v => r.knob.support[v] !== 'yes').slice(0, 5).join(', ') || '—'),
], [1, 2]));

const pages = [[1, 'First page: the chord'], [2, 'Second page: how it is played'], [3, 'Third page: rhythm flavour and tones'], [4, 'Fourth page: custom per-note edits'], [0, 'Placement (not knobs)']];
const line = Object.fromEntries(ROLES.map(role => [role, data.roles[role].line]));
const lineParts = role => total(line[role].reasons);
const lineSection = `<h2 id="lines">Parts that are note lines, not chords</h2>
<p>A part becomes a note line when a chord track cannot hold it: a figure with repeated tones and no standard direction, a single note, or notes outside the written chord. Every part counted here would otherwise need one custom strike per note. Syncopated arpeggios with a standard direction are <b>kept as chords</b> (rate flavour); the fifth column shows the share if they were lines too.</p>
${table(['Voice', 'Parts', 'Note lines', 'Share', 'Share if syncopated arpeggios were lines too', 'Lines with only chord tones'], ROLES.map(role => tr([role, n(roleTotals[role]), n(lineParts(role)), pct(lineParts(role), roleTotals[role]), pct(lineParts(role) + line[role].ifSyncopatedToo, roleTotals[role]), pct(line[role].chordToneOnly['every note is a chord tone'] ?? 0, lineParts(role))], [1, 2, 3, 4, 5])), [1, 2, 3, 4, 5])}
<div class="chart-grid">${ROLES.map(role => splitChart(`${role}: why it is a line`, line[role].reasons)).join('')}</div>
<p>A line whose notes are all chord tones can be stored as chord-tone index plus octave, so it follows the chord when the chord changes.</p>
<div class="chart-grid">${ROLES.map(role => `<details open><summary>${esc(role)}: commonest line figures (tone rank in the chord, 0 = lowest)</summary>${table(['Figure', 'Parts'], Object.entries(line[role].figures).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, c]) => tr([esc(k), n(c)], [1])), [1])}</details>`).join('')}</div>
<details><summary>Presets with the most note lines</summary>${table(['Preset', 'Pad lines', 'Rhythm lines'], [...new Set(ROLES.flatMap(role => Object.keys(line[role].byPreset)))]
    .sort((a, b) => ROLES.reduce((s, r) => s + (line[r].byPreset[b] ?? 0) - (line[r].byPreset[a] ?? 0), 0)).slice(0, 40)
    .map(name => tr([esc(name), n(line.pad.byPreset[name] ?? 0), n(line.rhythm.byPreset[name] ?? 0)], [1, 2])), [1, 2])}</details>
<h3>Later bars of a chord</h3>
<p>Running figures replay the chord’s first bar differently on later bars. Baked into placed chords each bar is its own chord, so this only matters if the sequencer must also generate.</p>
<div class="chart-grid">${ROLES.map(role => splitChart(`${role}: later bars compared with the first`, data.roles[role].variation)).join('')}</div>`;

document.querySelector('#report').innerHTML = `<h1>Chord track knob survey</h1>
<p class="lead">For each knob of the proposed four-page chord track: how generated parts are distributed over its values, separately for the <b>pad</b> and the <b>rhythm</b> voice, and which options the knob needs. Seed ${esc(data.meta.seed)}, ${n(data.meta.bars)} bars per preset, ${n(data.meta.presets)} presets with music and a key (excluded: ${esc(data.meta.excluded.join('; ') || 'none')}).</p>
<div class="cards">${ROLES.map(role => `<div class="card"><strong>${n(roleTotals[role])}</strong>${esc(role)} parts (a voice over one chord slot)<br>${pct(lineParts(role), roleTotals[role])} are note lines</div>`).join('')}
<div class="card"><strong>${n(data.roles.pad.splitBars + data.roles.rhythm.splitBars)}</strong>split bars left out (two chords in one bar)</div></div>
<h2>Knob summary</h2>
<p>An option is “needed” when it covers ${THRESHOLD * 100}% or more of either voice’s parts. The last column lists needed options the sequencer’s placed chord cannot play today (“new knob” means it is in the proposed pages).</p>
${table(['Knob', 'Page', 'Options needed', 'Options for 95% (pad / rhythm)', 'Needed but not available today'], summaryRows, [1, 2])}
<p><a href="#lines">Note lines</a></p>
${pages.map(([page, title]) => `<h2>${esc(title)}</h2>${knobRows.filter(r => r.knob.page === page).map(knobSection).join('')}`).join('')}
${lineSection}
<h2>Method</h2>
<p>A part is one voice (pad or rhythm) over one chord slot, read from the generator’s planned notes. Every knob but one is read from the first bar the voice plays in the slot (the statement); the tones left out are measured over all bars of the slot, so a short arpeggio bar is not counted as an omission. The pad leaves out the root when the bass plays it; as the chord track is written from the generated result, that is recorded as an omitted root. Inversion is the position of the lowest sounded tone in the written chord’s stacked order. Direction, rate and note length are read from attack times and note lengths, never from the generator’s style names. A pulse is described by its hit rhythm because each hit would be a placed chord. Parts in split bars (two chords in one bar), music-off presets and the atonal preset are excluded. Counts describe this sample, not every possible generator output. Rebuild with <code>npm run survey:generate</code> then <code>npm run survey:chords</code>.</p>`;
