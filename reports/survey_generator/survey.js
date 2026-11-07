import data from './data/survey.json';
import databaseUrl from './data/notes.jsonl.gz?url';
import './survey.css';
import { correlationMatrix, countBars, numericDistribution, ruleDistribution, scatterChart, splitChart, stackedRows } from './charts';

const n = value => Number(value).toLocaleString('en-US');
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sorted = object => Object.entries(object).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const list = object => sorted(object).map(([key, count]) => `${esc(key)}: ${n(count)}`).join(' · ') || 'None';
const table = (heads, rows) => `<div class="scroll"><table><thead><tr>${heads.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const tr = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
const dist = (title, object, description = '') => {
    if (numericDistribution(object) && Object.keys(object).length > 4) return scatterChart(title, object, description);
    if (Object.keys(object).length <= 12) return splitChart(title, object, description);
    return `<details><summary>${esc(title)} (${n(Object.keys(object).length)} values)</summary>${description ? `<p>${esc(description)}</p>` : ''}${table(['Value', 'Count'], sorted(object).map(([key, count]) => tr([esc(key), n(count)])))}</details>`;
};
const category = id => data.metadata.categories[id] ?? id;
const styles = ['sustain', 'pulse', 'arpeggio', 'sequence', 'rolled', 'stacked'];
const colors = ['#60a5fa', '#fbbf24', '#a78bfa', '#34d399', '#fb7185', '#f97316'];
const patterns = {
    sustain: ['none'], pulse: ['groups', 'beats', 'push', 'split'],
    arpeggio: ['bounce', 'up', 'down', 'broken'], sequence: ['bounce', 'up', 'down', 'broken'],
    rolled: ['up', 'down', 'out', 'in'], stacked: ['up', 'down', 'out', 'in'],
};
const patternCharts = Object.entries(patterns).map(([style, names]) => {
    const values = Object.fromEntries(names.map(pattern => [pattern, Object.entries(data.chord.combinations)
        .filter(([key]) => key.startsWith(`${style} / ${pattern} /`)).reduce((sum, [, count]) => sum + count, 0)]));
    return splitChart(style, values);
}).join('');
const styleTotals = Object.fromEntries(styles.map(style => [style, Object.entries(data.chord.combinations)
    .filter(([key]) => key.startsWith(`${style} /`)).reduce((sum, [, count]) => sum + count, 0)]));
const soundRows = Object.entries(data.chord.sounds).sort((a, b) => a[0].localeCompare(b[0])).map(([name, counts]) => {
    const total = styles.reduce((sum, style) => sum + (counts[style] ?? 0), 0);
    return `<div class="bar-row"><span>${esc(name)}</span><div class="bar" aria-label="${esc(`${name}: ${list(counts).replaceAll('&amp;', '&')}`)}">${styles.map((style, i) => `<span style="width:${100 * (counts[style] ?? 0) / total}%;background:${colors[i]}" title="${esc(`${style}: ${n(counts[style] ?? 0)}`)}"></span>`).join('')}</div><span class="number">${n(total)}</span></div>`;
}).join('');
const roleRows = Object.entries(data.timing.voices).map(([role, v]) => tr([
    esc(role), n(v.presets.length), n(v.notes), `${n(v.offBeat)} (${pct(v.offBeat, v.notes)})`, `${n(v.offGrid)} (${pct(v.offGrid, v.notes)})`,
    `<details><summary>Preset names</summary>${esc(v.presets.join(', '))}</details>`,
]));
const timingRows = (key) => Object.entries(data.timing.voices).map(([role, v]) => [role, { 'On': v.notes - v[key], 'Off': v[key] }]);
const homeModes = Object.fromEntries(Object.entries(data.harmony.homeModes).map(([name, count]) => [name.split(' (')[0], count]));
const coveredRulePaths = new Set([...Object.keys(data.timing.settings), 'drift.mode']);
function renderRules(selectedCategory, query) {
    const chapters = Object.entries(data.metadata.chapters);
    const presets = data.presets.filter(p => selectedCategory === 'all' || p.category === selectedCategory);
    return chapters.map(([chapterId, title]) => {
        const chapterRules = data.rules.filter(rule => rule.chapter === chapterId);
        const rules = chapterRules.filter(rule => !coveredRulePaths.has(rule.path) && `${rule.title} ${rule.id} ${rule.chapter} ${rule.effect}`.toLowerCase().includes(query));
        if (!chapterRules.length || (query && !rules.length)) return '';
        return `<section class="rule-chapter"><h3>${esc(title)}</h3><div class="rule-grid">${rules.map(rule => {
            const { values, statuses, onOff, members } = ruleDistribution(rule, selectedCategory);
            const valueChart = rule.binary ? '' : numericDistribution(values) && Object.keys(values).length > 4
                ? scatterChart('Values when on', values) : splitChart('Values when on', values);
            const names = members.map(({ category: id, status, value, names }) => `<p><b>${esc(category(id))} · ${esc(status)} · ${esc(value)}</b> (${n(names.length)}): ${esc(names.join(', '))}</p>`).join('');
            return `<article class="rule"><h4>${esc(rule.title)}</h4><p>${esc(rule.description)}</p><p class="rule-meta">${esc(rule.effect)} · ${esc(rule.path ?? 'permission flag')}</p>
                ${splitChart('Configured on / off', onOff)}${valueChart}<details><summary>Eligibility and preset names</summary><p>${list(statuses)}</p>${names}</details></article>`;
        }).join('')}</div>${!rules.length ? '<p>All values in this chapter are summarized above.</p>' : ''}
        <h4>On/off correlation · ${esc(title)}</h4>${correlationMatrix(chapterRules, presets)}</section>`;
    }).join('') || '<p>No matching rules.</p>';
}
const groupRows = data.groups.map(group => `<details><summary>${esc(group.title)} (${esc(group.id)})</summary><p><b>Path:</b> ${esc(group.path)} · <b>Values across presets:</b> ${list(group.values)}</p>${Object.entries(group.categories).map(([id, groups]) => `<details><summary>${esc(category(id))}</summary>${Object.entries(groups).map(([key, names]) => `<p><b class="wide">${esc(key)}</b> (${n(names.length)}): ${esc(names.join(', '))}</p>`).join('')}</details>`).join('')}</details>`).join('');
const presetRows = data.presets.map(p => `<div class="preset" data-search="${esc(`${p.name} ${category(p.category)} ${Object.values(p.voices).join(' ')}`.toLowerCase())}"><details><summary>${esc(p.name)} · ${esc(category(p.category))}${p.playMusic ? '' : ' · music off'}</summary><p>${esc(p.mode)} · ${esc(p.meter)} · ${n(p.bpm)} BPM · ${esc(p.progression)} · ${esc(p.barsPerChord)} bars/chord</p><p><b>Voices:</b> ${esc(Object.entries(p.voices).map(([role, name]) => `${role}: ${name}`).join(' · '))}</p><p><b>Observed chord bar-styles:</b> ${list(p.styles)}</p><p><b>Progression-boundary note crossings:</b> ${list(p.crossings)}</p>${table(['Voice', 'Events', 'Off felt beat', 'Off sixteenth-unit grid'], Object.entries(p.roles).map(([role, v]) => tr([esc(role), n(v.notes), n(v.offBeat), n(v.offGrid)])))}</details></div>`).join('');
const active = data.presets.length;
const presentCategories = Object.entries(data.metadata.categories).filter(([id]) => data.presets.some(p => p.category === id));

document.querySelector('#report').innerHTML = `
<header><p><a href="/">← Generator</a></p><h1>Front-page generator survey</h1>
<p class="lead">An inventory of the built-in soundscapes, their rulebook settings and the notes planned by the current generator. No audio was rendered.</p>
<nav><a href="#method">Method</a><a href="#chords">Chords & bass</a><a href="#timing">Timing</a><a href="#harmony">Harmony</a><a href="#evolution">Evolution</a><a href="#rules">Rules</a><a href="#presets">Presets</a></nav></header>
<div class="cards"><div class="card"><strong>${n(data.presets.length)}</strong> music presets</div><div class="card"><strong>${n(data.metadata.barsPerPreset)}</strong> bars per preset</div><div class="card"><strong>${n(data.notes.total)}</strong> unmuted planned events</div><div class="card"><strong>${n(Object.keys(data.harmony.homeModes).length)}</strong> home modes</div><div class="card"><strong>${n(data.notes.crossingNotes)}</strong> notes cross a cycle boundary</div></div>
<section id="method"><h2>Method and limits</h2>
<p>Latest generation, seed ${n(data.metadata.seed)}, one continuous ${n(data.metadata.barsPerPreset)}-bar run for each of ${n(active)} browsable built-in presets with music enabled. The ${n(data.metadata.excludedMusicOff.length)} music-off ambience-only presets, hidden historical presets and user-saved setups are excluded from all analysis. The downloadable database still contains the original complete capture. This is one reproducible sample, not a probability estimate or an exhaustive enumeration of all seeds. Preset settings include defaults and inherited rulebook permissions.</p>
<p>All event metrics count planned events excluding muted roles; they do not prove audibility after zero mixer levels, individual drum levels, instrument envelopes or effects. ${n(data.limitations.mutedEvents)} muted-role events are excluded. Sequencer events are included. “Off beat” means more than 0.02 meter units from a felt-beat start; “off grid” uses the same tolerance from a quarter of a meter unit. In compound meter a unit is an eighth note, not a felt beat. These are geometric measurements, not attribution to swing or any single rule.</p>
<p>One external voice cannot be fully resolved in this offline capture: ${esc(data.limitations.unresolvedVoices.join('; ') || 'none')}. Its sound-specific planning may differ from playback. Written gates exclude release tails and playback-only joining/glides. Source style metadata is unavailable for ${n(data.chord.unclassifiedNotes)} pad/rhythm events, including sequencer and transformed events; shapes still include them.</p>
<p><a href="${esc(databaseUrl)}" download="notes.jsonl.gz">Download note database (JSON Lines, gzip)</a>. Each line is a preset with full settings, voices, flags, and per-bar events, harmony, meter, phrase and rule trace. See the accompanying README for reproduction and interpretation.</p></section>
<section id="chords"><h2>Chord playing, bass and layers</h2>
<p>Six chord styles are weighted per phrase. Sustain holds a voicing on a chord start; pulse repeats groups or beats, pushes them early, or holds the low note while upper notes strike; arpeggio plays one note at a time; sequence is a more detached, usually faster arpeggio; rolled strums at quarter-unit intervals; stacked introduces one tone per unit. Running figures can reverse, rotate, thin or lift on later bars. Directions are up, down, middle-out or outside-in; arpeggios use bounce, up, down or broken.</p>
<p>Counts below are <b>role-bar/style combinations with at least one sourced event</b>, not random choices or individual chords. A split bar can contribute multiple combinations. Patterns with zero observations are included. Later arrangement can alter an issued figure.</p>
${dist('Issued phrase choices, including muted roles', data.chord.choices, 'One selected style/pattern/step per active layer when a phrase starts, in music-enabled presets. A choice can produce no notes.')}
<h3>Playing patterns and directions</h3>${splitChart('Overall chord styles', styleTotals, 'Pooled observed role-bar/style combinations; a role-bar can contain more than one style.')}
<p>Each split bar shows the distribution within that style; counts are role-bars. Zero-count choices remain in the legend. Step-level counts are available below.</p><div class="chart-grid">${patternCharts}</div>
${dist('All observed combinations and steps', data.chord.combinations)}
<details><summary>Sound presets × chord styles</summary><p>Each bar is normalized within its sound/role; the number at right is its observed role-bar combinations. This is a mapping of the chosen sound to generated chord styles, not a property of the sound in isolation.</p>
<div class="legend">${styles.map((style, i) => `<span><i class="swatch" style="background:${colors[i]}"></i>${esc(style)}</span>`).join('')}</div>${soundRows}</details>
<h3>Observed attack shapes</h3><p>All pad/rhythm events, including unclassified events: within each role-bar, onsets rounded to quarter meter units are shown as <code>position=number of notes</code>. A multi-note onset, gap, then another onset is visible in the signatures. Rounding can merge or split expressive attacks; signatures are descriptive rather than named generator rules.</p>
${dist('All observed role-bar attack signatures', data.chord.shapes)}
<p>Additional approximate consecutive-attack motifs, pooled within each role and preset, including across bars: attacks within 50 ms form a cluster; a “chord” has at least three simultaneous notes; a held single lasts at least 250 ms; a pause exceeds 20 ms. Nested “same chord” is a subset, not an additional disjoint class. These heuristics do not identify compositional intent.</p>
${countBars('Held-single / chord and chord / pause / chord motifs', data.chord.gestures, 'Attack-pair counts share a common scale. Same-chord counts overlap their chord-pause-chord parent.')}
<h3>Bass</h3><p>Whole holds the root, half follows beat groups, walking moves through chord tones and approaches the next root, and drive pulses roots with octave/fifth and approach notes. Pedal holds tonic or fifth across changing chords. Euclidean replacement can reshape half/drive; song, syncopation and variation can further alter the result. Counts are bars containing bass events by phrase style; a pedal overrides the named style.</p>
${splitChart('Observed bass styles', data.bass.styles, 'Bars with bass events, by phrase style.')}
${dist('Observed bass attack and pitch-class shapes', data.bass.shapes, 'Each position:interval is an onset rounded to a quarter meter unit and its pitch class in semitones above the bar’s opening chord root. Split bars can change chord mid-bar. Counts are role-bars.')}
<h3>Sequencer conversion and chord voicing</h3>
<p>These conversion and voicing analyses exclude the atonal ${esc(data.chord.conversion.excludedAtonal.join(', ') || 'none')} preset; other report statistics retain it. They compare pad/rhythm role-bars with tagged chord-source notes. <b>Raw captured notes are not replaced with the default chord during ordinary playback:</b> the conversion is triggered when a generated chord is edited as an editable voicing. The “raw captured notes” row checks stored pitches and quarter-unit-quantized attack positions. The other rows simulate that conversion with its default inferred settings, not the available editable settings or proposed style controls.</p>
<h4>Is the comparison using the right chord?</h4>
<p>For each isolated role-bar, compare the recorded source root and the root selected by the converter with that bar’s opening chord root. Split bars are reported separately because they contain more than one chord. This validates the reference within this isolated test, not a whole-song playback round trip. Every role-bar uses its own recorded root, not one progression-wide root.</p>
${splitChart('Per-bar chord root reference', data.chord.conversion.reference)}
<p>For bars whose roots agree, compare the written chord’s pitch classes with the converter’s complete default triad <b>before</b> deciding which notes actually attack. The converter defaults to a plain diatonic triad: it does not infer a written seventh, ninth, borrowed quality or suspension. The captured-note row compares the union of tagged notes actually attacked in that bar with the written chord; it does not say all chord tones must sound at once.</p>
<div class="chart-grid">${splitChart('Default triad versus written chord', data.chord.conversion.structures)}${splitChart('Captured note pitch classes versus written chord', data.chord.conversion.capturedHarmony)}</div>
${stackedRows('Default triad versus written chord size', Object.entries(data.chord.conversion.chordSizes), 'Only non-split tagged role-bars with matching roots; each row is normalized separately.')}
${stackedRows('Emitted pitch classes by chord-structure comparison', Object.entries(data.chord.conversion.structureVsPlayback), 'A matching triad can still emit different notes from the captured bar, for example when an arpeggio plays only some tones.')}
<p>Each bar is captured in isolation with empty following bars; ties interrupted by later bars and whole-song conversion can differ. Pitch and pitch-class rows compare sets (not repetitions), while the final row compares every pitch/attack pair. Durations, velocity, detune and expression are not compared. A difference is neither proof that another control setting cannot represent the notes nor that a generator transformation caused it.</p>
${stackedRows('Capture and conversion diagnostics', Object.entries(data.chord.conversion.diagnostics), 'All rows have the same tagged tonal role-bar denominator; matching a set alone does not imply matching the sequence.')}
<div class="chart-grid">${splitChart('Conversion: exact pitch sets', data.chord.conversion.diagnostics['Default chord: exact pitches'], 'Compares distinct MIDI pitches regardless of timing and repetition; octave changes and doublings matter.')}
${splitChart('Conversion: attack-position sets', data.chord.conversion.diagnostics['Default chord: attack positions'], 'Compares quantized attack positions regardless of which pitches play there or how many notes strike.')}</div>
${stackedRows('Pitch sets by recorded style', Object.entries(data.chord.conversion.pitchByStyle), 'Each row is tagged role-bars, not individual notes.')}
${stackedRows('Attack-position sets by recorded style', Object.entries(data.chord.conversion.attacksByStyle), 'Each row is tagged role-bars, not individual notes.')}
${splitChart('Pitch-class differences and root changes', data.chord.conversion.pitchDifferences, 'Compared with the captured notes: root added or removed only means all other pitch classes agree. Other changes can also include a changed root.')}
<details><summary>Exact pitch-and-attack pairs</summary>${splitChart('Conversion: full attack/pitch pairs', data.chord.conversion.outcomes)}${stackedRows('Full pair comparison by recorded style', Object.entries(data.chord.conversion.byStyle))}</details>
<details><summary>Inspect conversion examples</summary><p>Pairs are quantized step:MIDI pitch; step 0 is the bar start. Output can extend beyond the bar because the isolated comparison preserves its generated length.</p>${table(['Style', 'Preset / bar / role / chord', 'Captured pairs', 'Default conversion pairs'], Object.entries(data.chord.conversion.examples).map(([style, e]) => tr([esc(style), `${esc(e.preset)} / ${n(e.bar + 1)} / ${esc(e.role)} / ${esc(e.chord)}`, esc(e.expected), esc(e.actual)])))}</details>
<p>${n(data.chord.conversion.untaggedRoleBars)} role-bars contain only untagged events and cannot be compared; ${n(data.chord.conversion.partiallyTaggedRoleBars)} compared role-bars also contain untagged events, which are excluded from the comparison. The database does not retain pre-transformation chord events, so the count changed from the original prescription is unknown.</p>
<h3>Chord parameters for the sequencer</h3>
<p>Every role-bar of pad or rhythm chord notes (${n(data.chord.params.instances)} tonal, single-chord bars; ${n(data.chord.params.excluded['Split bar (more than one chord)'])} split bars left out) is described by what a sequencer chord track would store: the chord (voicing and harmonic colour), its inversion and root voicing, and how it is played (mode, direction, rate, hold, length). Everything is <b>observed from pitches, attack times and note lengths</b>, not from the generator’s style names, which are only compared with the observed mode as a check. The voicing is matched against every setting the sequencer’s placed chord can produce (complexity × colour × root voicing × inversion), so “exact” means the sequencer would play exactly those pitches.</p>
${splitChart('How well the sequencer’s chord settings reproduce the sounded voicing', data.chord.params.fit, 'Exact: the same pitches for some complexity, colour, root and inversion. Right tones, different spacing: same pitch classes but another register arrangement. No fit: the tones differ or are doubled.')}
${splitChart('Why a voicing does not fit', data.chord.params.fitReason)}
${splitChart('Parts the sequencer chord track can describe completely', data.chord.params.gapCount, 'No gap: exact voicing, and a play mode, direction, rate and hold it offers.')}
${countBars('Individual gaps', data.chord.params.gaps, 'A part can have more than one. Pulse and roll are play modes the chord track does not have; syncopated arpeggios are hit patterns, not a rate.')}
<h4>Chord: voicing and harmonics</h4>
<div class="chart-grid">${splitChart('Written chord', data.chord.params.family)}${splitChart('Sequencer complexity / colour for the written chord', data.chord.params.chordFit, 'The chord’s own tones with the root voicing on and no inversion.')}</div>
<div class="chart-grid">${splitChart('Best-fit complexity', data.chord.params.best.complexity, 'Exact fits only.')}${splitChart('Best-fit colour', data.chord.params.best.colour)}${splitChart('Best-fit root voicing', data.chord.params.best.rootVoicing)}</div>
<h4>Inversion</h4>
<p>The lowest sounding tone, named by its role in the written chord. “Root omitted” means the lowest sounded tone is a higher chord tone because the root is not played in the part (usually left to the bass), which the sequencer expresses as root voicing off, not as an inversion of a complete chord. Inversion is the index of that tone in the chord’s stacked order.</p>
<div class="chart-grid">${splitChart('Lowest tone', data.chord.params.bassTone)}${splitChart('Inversion (index of the lowest tone)', data.chord.params.inversion)}${splitChart('Best-fit inversion setting', data.chord.params.best.inversion, 'Exact fits only; with the root off, inversion 0 and 1 sound the same and the lower setting is reported.')}</div>
${stackedRows('Lowest tone by what the part leaves out', Object.entries(data.chord.params.bassToneByOmission).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0)).slice(0, 8), 'The eight commonest omission sets.')}
${stackedRows('Lowest tone by play mode', Object.entries(data.chord.params.inversionByMode))}
${stackedRows('Lowest tone by written chord', Object.entries(data.chord.params.bassToneByFamily).filter(([, v]) => Object.values(v).reduce((s, x) => s + x, 0) > 100))}
<h4>Tones left out</h4>
<p>Over a whole chord (every bar of the chord’s slot), because one bar of a running figure can be shorter than the chord. Omitting the <b>root</b> is the sequencer’s root voicing off and the third its power chord; omitting the seventh is the triad. Omitting the <b>fifth</b>, or doubling a tone, cannot be said by a chord track.</p>
<div class="chart-grid">${splitChart('Tones left out over the chord’s slot', data.chord.params.slotOmitted)}${splitChart('Doubled tones in one bar', data.chord.params.doubledRoles, 'Mostly the third of a root-less triad, which the pad doubles to keep three voices.')}</div>
${stackedRows('Left out, by play mode', Object.entries(data.chord.params.slotOmittedByMode))}
${stackedRows('Left out, by voice', Object.entries(data.chord.params.slotOmittedByRole))}
${stackedRows('Left out, by written chord', Object.entries(data.chord.params.slotOmittedByFamily).filter(([, v]) => Object.values(v).reduce((s, x) => s + x, 0) > 100))}
<div class="chart-grid">${splitChart('Spacing of the voicing (highest minus lowest)', data.chord.params.spacing)}${stackedRows('Spacing by play mode', Object.entries(data.chord.params.spacingByMode))}</div>
<details><summary>Presets that leave tones out most</summary>${table(['Preset', 'Parts with a tone left out'], sorted(data.chord.params.omittedByPreset).slice(0, 40).map(([name, count]) => tr([esc(name), n(count)])))}</details>
<h4>Play style</h4>
<div class="chart-grid">${splitChart('Observed play mode', data.chord.params.mode, 'Chord: one attack. Roll: a strum of quarter-unit steps with every note ringing to the end. Stack: one tone a unit. Arp: one note at a time. Pulse: the whole chord struck again; split pulse: low note held, upper notes strike between.')}${stackedRows('Generator style name versus observed mode', Object.entries(data.chord.params.modeByStyle), 'A check that the observation reads the generator’s intent.')}</div>
<div class="chart-grid">${stackedRows('Direction, by mode (first bar of a chord)', Object.entries(data.chord.params.direction), 'Arpeggio figures that follow no standard direction are composed figures: a rhythm shaped on top, with the pitches chosen note by note.')}${splitChart('Arpeggio hit rhythm', data.chord.params.arpRhythm)}</div>
${stackedRows('Rate (steps between attacks; a step is a quarter of a unit)', Object.entries(data.chord.params.rate))}
<div class="chart-grid">${stackedRows('Hold (note length: ×rate for an arpeggio, or to the next hit, or the chord’s end)', Object.entries(data.chord.params.hold))}${stackedRows('Attacks per bar', Object.entries(data.chord.params.hits))}</div>
<div class="chart-grid">${stackedRows('Chord length as a share of its slot', Object.entries(data.chord.params.lengthShare), 'Held chords and rolls last about 95% of the slot.')}${splitChart('Slot length', data.chord.params.slotBars)}</div>
${countBars('Pulse hit positions in a bar (units)', Object.fromEntries(sorted(data.chord.params.hitPattern).slice(0, 14)), 'The chord rhythm a pulse plays; a chord track would need these as separate chords or a hit pattern.')}
<h4>Variation within a chord</h4>
<p>Running figures play the first bar of a chord as the statement and later bars differently (reversed, started from another note, a step let go, the top lifted an octave). The later bar is compared with the chord’s first bar.</p>
<div class="chart-grid">${splitChart('Later bars compared with the first', data.chord.params.variation, 'Other: not one of the four known variations (a recomposed figure or a register move).')}${stackedRows('Variation by direction of the first bar', Object.entries(data.chord.params.variationByDirection))}</div>
<details><summary>Irregular arpeggio figures (rank of each note, 0 = lowest)</summary>${table(['Figure', 'Count'], sorted(data.chord.params.otherFigures).slice(0, 40).map(([k, c]) => tr([esc(k), n(c)])))}</details>
<details><summary>Commonest complete descriptions (${n(Object.keys(data.chord.params.vectors).length)} distinct)</summary>${table(['Chord · lowest tone · left out · mode · direction · rate', 'Count'], sorted(data.chord.params.vectors).slice(0, 60).map(([k, c]) => tr([esc(k), n(c)])))}</details>
<p>A pitch-spread control could complement inversion, but a single span value does not specify which notes move or double. Rolled and stacked playing also need a separate time-spacing control; inversion, pitch spread and attack spacing are independent dimensions.</p>
<h3>Pad versus rhythm</h3><p>Combined uses the pad role for all styles. Pad-only restricts to held styles; rhythm-only uses running styles; split layers both. Split-layer rules can separate register, root ownership and attacks, cap density and avoid lead pitches. Journey or sections can change the active layer. Both parts share chord-style machinery, but have independent voices, ranges, and phrase choices. A bass pedal is separate from the pad’s low-note/chord split pulse.</p></section>
<section id="timing"><h2>Timing, groove and note variation</h2>
<p>Counts include straight subdivisions as off-beat; they do not mean mistakes or notes outside a time signature. Each row is normalized within its voice.</p>
${stackedRows('Felt-beat alignment by voice', timingRows('offBeat'), 'Event counts; On and Off use the felt-beat tolerance described above.')}
${stackedRows('Quarter-unit grid alignment by voice', timingRows('offGrid'), 'Event counts; this finer grid is distinct from felt beats.')}
<details><summary>Timing counts and preset names</summary>${table(['Voice', 'Presets with off-beat notes', 'Events', 'Off felt beat', 'Off quarter-unit grid', 'Drill down'], roleRows)}</details>
<h3>What changes notes, and what changes playback?</h3><p><b>Composition:</b> syncopation pushes melody/bass, Euclidean bass alters attack patterns, ornaments add grace, mordent, turn and trill notes. Swing moves suitable half-beat attacks and shortens their gates in simple meters. Human timing and instrument/phrase groove change stored event beats; velocity and detune change stored per-note values. Sequencer events deliberately bypass these looseners.</p><p><b>Playback timing:</b> rubato stores per-unit tempo scales without moving the written beats; the scheduler and renderer apply the scales. <b>Sound only:</b> pad vibrato, timbre drift and wander modulate sound; attack/release/gate expression, slides, held-note joining, and tempo-linked effects are playback metadata or scheduling. Some rules do both, including slow-attack compensation and long energy arcs.</p>
<p>Flair is a linked control for ornaments, rubato, pad vibrato and timbre drift; Groove links swing, syncopation, human timing and Euclidean bass. Stack levels below are exact preset matches within the app’s tolerance; “Custom” is not a fifth control level. Off stack choices are excluded.</p>
${stackedRows('Quick-control stacks', Object.entries(data.timing.stacks), 'Each row is a separate control among presets where that stack is not Off.')}
${scatterChart('Allow shorter note values: percentages when configured on', data.timing.leadDensityEnabled, 'Counts presets with leadDensity above zero, including settings that may be muted or not heard.')}
<p>Rule-controlled settings below count configured values only when the rule is on; settings without a corresponding on/off rule include all music presets. A retained value can still be inaudible or overridden.</p>
<div class="chart-grid">${Object.entries(data.timing.settings).map(([name, values]) => dist(`${name} (${data.rules.some(rule => rule.path === name) ? 'presets when on' : 'all music presets'})`, values)).join('')}</div>
<h3>Per-note detail</h3><p>Durations are written gates in meter units; velocity buckets are tenths (0.9 includes 1.0); detune is rounded cents. Expression keys are not mutually exclusive and can include default-valued metadata. Complexity counts distinct expression fields, not independent audible effects. Ornament counts are extra event tags, not complete ornament occurrences.</p>
<div class="chart-grid">${dist('Gate length buckets', data.notes.lengths)}${scatterChart('Velocity buckets', data.notes.velocity)}${scatterChart('Detune (rounded cents)', data.notes.detune)}${dist('Ornament-tagged events', data.notes.ornaments)}${scatterChart('Expression field count per event', data.notes.expressionComplexity)}${dist('Pitch-target point counts', data.notes.pitchTargets)}</div>
<h4>Expression fields on events (overlapping)</h4>${table(['Field', 'Events'], sorted(data.notes.expression).map(([field, count]) => tr([esc(field), n(count)])))}
<h3>Progression boundaries</h3><p>${n(data.notes.crossingNotes)} distinct planned notes cross at least one of ${n(data.notes.boundaryCount)} observed progression-cycle boundaries; ${n(data.notes.crossingBoundaries)} boundaries have at least one crossing. There are ${n(data.notes.crossings)} note–boundary crossings, by voice: ${list(data.notes.crossingsByRole)}. A note must start strictly before and end strictly after the cycle boundary; mere touches do not count. Time is computed using each bar’s tempo, meter and rubato. This is not a chord-change or release-tail count; playback-only joined gates are not simulated.</p></section>
<section id="harmony"><h2>Scales, progressions, meter and tempo</h2>
<p>Home distributions count music presets. Observed mode/progression distributions count cycle starts; generated progressions may change on each cycle, and chord borrowing, cadence substitutions and bar splits can change actual sounding chords independently of the progression numerals.</p>
${stackedRows('Home and observed modes', [['Home · presets', homeModes], ['Observed · cycles', data.harmony.heardModes]], 'Rows have different denominators: music-enabled presets versus their observed cycles.')}
${splitChart('Presets departing from their home mode', data.harmony.modeDepartures, 'Music-enabled presets only; a departure is any sampled bar with a mode different from home.')}
${dist('Home progression and length (presets)', data.harmony.homeProgressions)}${dist('Observed actual progression and length (cycles)', data.harmony.heardProgressions)}
<div class="chart-grid">${dist('Configured bars per chord (presets)', data.harmony.homeBarsPerChord)}${dist('Planned harmonic slot length in bars (slot starts)', data.harmony.playedSlotBars, 'Meter adjustment and harmonic development can change slot length; a split bar can add an interior chord.')}
${dist('Home meter (presets)', data.harmony.meter)}${dist('Observed meter (bars)', data.harmony.playedMeter)}${dist('Home BPM (presets)', data.harmony.tempo)}${dist('Observed BPM (bars)', data.harmony.playedTempo)}</div></section>
<section id="evolution"><h2>Evolution and wander</h2><p>${n(data.evolution.any)} presets configure at least one of the following: sections, layer flow, long energy arc, changing generated progression or song, key lift, conductor drift, pad shimmer or timbre drift. Mechanisms overlap; settings may be blocked by other controls. ${n(data.evolution.enabledDrift)} configure conductor drift (key, mode, progression and tempo); ${n(data.evolution.enabledWander)} configure at least one voice and a nonzero wander range. These are configuration counts, including muted setups, not proof of an audible change.</p>
<p>Voice wander is playback modulation, not harmonic drift: sine mode is indeed a bank of very slow LFOs with independent per-role/per-parameter phases and periods, modulating pan, level, filter and pitch. Brownian mode instead uses a seeded, bounded mean-reverting random walk interpolated between two-second knots. Ambient level wander is separate and has its own mode and period.</p>
<h4>Configured evolution mechanisms (overlapping)</h4>${table(['Mechanism', 'Presets'], sorted(data.evolution.mechanisms).map(([name, count]) => tr([esc(name), n(count)])))}
<div class="chart-grid">${dist('Conductor drift mode', data.evolution.drift)}${dist('Voice wander mode', data.evolution.wanderMode)}${dist('Ambient wander mode', data.evolution.ambienceWanderMode)}</div></section>
<section id="rules"><h2>Rulebook distributions and correlations</h2><p>Rules are grouped by their front-page rulebook chapters. Rules whose setting values already appear above are omitted from the distribution cards but included in the matrices. Select a soundscape category to compare its presets. Each on/off chart counts configured choices; for other rules the value distribution excludes off choices. Muted, overridden and not-heard choices retain their configured on/off value. Eligibility is available in the details. Effect classes are based on code inspection, not a causal experiment.</p>
<p><b>Correlation:</b> each cell compares configured on/off choices across presets, not audible use. Blue is positive and pink negative phi correlation (−1 to +1). Hover or focus a cell for both-on, both-off and the two mismatches. For a constant rule phi is undefined: ON and OFF mean both are always on or always off, ≠ means they are always opposite, and – means neither. These are sample associations, not causes; default-on rules can produce many constant cells.</p>
<div class="rule-controls"><label>Preset category <select id="rule-category"><option value="all">All preset categories</option>${presentCategories.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('')}</select></label><label>Filter rules <input id="rule-search" type="search" placeholder="Name, ID, chapter or effect"></label></div><div id="rule-results"></div>
<h3>Grouped controls and weights</h3><p>These are configured group values, not observed probabilities or eligibility; the category drilldowns show all presets.</p>${groupRows}</section>
<section id="presets"><h2>Per-preset drilldown</h2><label>Filter presets <input id="preset-search" type="search" placeholder="Name, category or sound"></label>${presetRows}</section>
<section id="all-correlations"><h2>All-rule correlation matrix</h2><p>All ${n(data.rules.length)} rules, using the preset-category selection above; the rule search does not limit this matrix.</p><details id="all-matrix"><summary>Show all-rule correlation matrix</summary><div id="all-matrix-content"></div></details></section>`;

const ruleSearch = document.querySelector('#rule-search'), ruleCategory = document.querySelector('#rule-category');
const updateFullMatrix = () => {
    const target = document.querySelector('#all-matrix-content');
    target.innerHTML = document.querySelector('#all-matrix').open
        ? correlationMatrix(data.rules, data.presets.filter(p => ruleCategory.value === 'all' || p.category === ruleCategory.value)) : '';
};
const updateRules = () => { document.querySelector('#rule-results').innerHTML = renderRules(ruleCategory.value, ruleSearch.value.toLowerCase().trim()); };
ruleSearch.addEventListener('input', updateRules);
ruleCategory.addEventListener('change', () => { updateRules(); updateFullMatrix(); });
updateRules();
document.querySelector('#all-matrix').addEventListener('toggle', updateFullMatrix);
document.querySelector('#preset-search').addEventListener('input', event => {
    const query = event.target.value.toLowerCase().trim();
    document.querySelectorAll('.preset').forEach(row => { row.hidden = !row.dataset.search.includes(query); });
});
