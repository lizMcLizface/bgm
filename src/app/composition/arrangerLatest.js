import { arrangeBar, notesInRange, pentatonicOf } from '../arranger';
import { seeded, pick } from '../random';
import { groupStarts } from '../meter';
import { phraseRhythm, barRhythm, spaceAccompaniment, spaceCounter } from './ensembleRhythm';
import { planForm, formEnvelope, formSettings, shapeFormNotes, cutForm } from './formLatest';
import { planDevelopment, developTheme } from './themeDevelopment';
import { phraseLength } from './phraseLength';
import { planPhraseMelody } from './phraseMelody';
import { walkingBass, alignBass, counterPitches } from './ensembleVoices';
import { duetPlan, duetMotif, duetCounter } from './duet';
import { planRhythmDevelopment, developBarRhythm, shapeRhythmicPart } from './rhythmDevelopment';
import { planRhythmGrammar, grammarMotif } from './rhythmGrammar';
import { planPartGrammar, partGrammar } from './partGrammar';
import { planJointCounterpoint } from './jointCounterpoint';
import { transitionGesture, gesturePart } from './transitionGesture';
import { fragmentLead } from './leadTransition';
import { pickupLead } from './leadPickup';
import { landSectionSuspension } from './sectionSuspension';
import { subdivideSection } from './formStrategies';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rngFor = (seed, index, salt) => seeded(Math.imul(seed ^ salt, 1664525) ^ Math.imul(index + 1, 1013904223));
const nearest = (notes, target) => notes.reduce((best, note) => Math.abs(note - target) < Math.abs(best - target) ? note : best);

// Themes retain pitch degrees and rhythm even while the lead is resting.
function makeTheme(meter, seed, id, density) {
    const rng = rngFor(seed, id, 0x2c9277b5), starts = groupStarts(meter);
    let degree = id ? 2 : 0;
    return Array.from({ length: 2 }, (_, bar) => {
        const notes = [];
        meter.groups.forEach((size, group) => {
            if (group > 0 && rng() < 0.18) return;
            const unit = meter.unitsPerBeat === 3 ? 1 : density > 0.4 && rng() < density ? 0.5 : 1;
            const rhythm = density > 0.35 && rng() < density ? Array.from({ length: Math.ceil(size / unit) }, (_, i) => i * unit)
                : pick(rng, [[0], [0, Math.min(unit, size / 2)], [0, size / 2]]);
            for (let i = 0; i < rhythm.length; i++) {
                if (notes.length) degree = clamp(degree + pick(rng, [-1, -1, 1, 1, 2]), -2, 6);
                const at = starts[group] + rhythm[i], next = i + 1 < rhythm.length ? starts[group] + rhythm[i + 1] : starts[group] + size;
                notes.push({ beat: at, length: next - at, degree, accent: i === 0 });
            }
        });
        // An answer has a destination, but not the same mandatory long hold.
        if (bar === 1) notes[notes.length - 1].degree = id ? 2 : 0;
        return notes;
    });
}

export function planThemePhrase({ seed, start, section, previous, settings, contrast = false }) {
    const ordinal = previous?.ordinal !== undefined ? previous.ordinal + 1 : Math.floor(start / 4), rng = rngFor(seed, ordinal, 0x68e31da4);
    const returning = section?.type === 'full' && previous?.sectionType && previous.sectionType !== 'full';
    const ordinary = section?.form && section.type === 'breakdown' ? 'recollection' : returning ? 'return' : ['statement', 'answer', 'development', 'return'][ordinal % 4];
    let role = contrast && ordinary === 'development' && Math.floor(ordinal / 4) % 2 === 0 && section?.type !== 'intro'
        && rngFor(seed, ordinal, 0x9b05688c)() >= (settings.leadRepeat ?? 0) ? 'contrast' : ordinary;
    const retained=section?.developed&&['ostinato','gradual','speech'].includes(section.strategy);
    if(retained&&role==='contrast')role='development';
    const themeId = section?.form&&section.type==='breakdown'?section.themeId:retained?0:role === 'contrast' ? 1 : role === 'development' && rng() > (settings.leadRepeat ?? 0) ? 1 : 0;
    const shift = role === 'contrast' ? pick(rng, [-2, 2]) : role === 'development' ? pick(rng, [-1, 1, 2]) : 0;
    return { start, ordinal, role, themeId, shift, sectionType: section?.type ?? null,
        ...(section?.developed?{strategy:section.strategy,orchestration:section.orchestration}:{}) };
}

/** Bounded 12-path search over a bar, targeting the theme rather than a random walk. */
export function realiseThemeBar(notes, { chord, scalePcs, range, previousMidi, settings, closing }) {
    const pcs = settings.leadScale === 'pentatonic' ? pentatonicOf(scalePcs) : scalePcs;
    const allowed = notesInRange(pcs, ...range);
    const tonic = nearest(notesInRange([pcs[0]], range[0] - 12, range[1] + 12), (range[0] + range[1]) / 2 - 3);
    const anchor = pcs[0] + 12 * Math.floor(tonic / 12);
    const degreePitch = degree => anchor + ((pcs[((degree % pcs.length) + pcs.length) % pcs.length] - pcs[0] + 12) % 12) + 12 * Math.floor(degree / pcs.length);
    const stable = allowed.filter(m => [chord.pitchClasses[0], chord.pitchClasses[1]].includes(m % 12));
    const open = allowed.filter(m => [chord.pitchClasses[2], scalePcs[1]].includes(m % 12));
    let beam = [{ score: 0, pitches: [], last: previousMidi }];
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i], target = clamp(degreePitch(note.degree), ...range);
        const last = closing && i === notes.length - 1;
        const endings = settings.leadEnding === 'open' ? open : stable;
        const pool = last && endings.length ? endings : allowed;
        const candidates = [...pool].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b).slice(0, 5);
        const paths = [];
        for (const path of beam) for (const midi of candidates) {
            const leap = Math.abs(midi - path.last), chordTone = chord.pitchClasses.includes(midi % 12);
            const desiredDirection = i ? Math.sign(note.degree - notes[i - 1].degree) : 0;
            const reversed = desiredDirection && Math.sign(midi - path.last) !== desiredDirection && midi !== path.last;
            const cost = Math.abs(midi - target) * 0.7 + (note.accent && !chordTone ? 4 : 0)
                + Math.max(0, leap - (3 + (settings.leadLeaps ?? 0.5) * 6)) * 0.9
                + (reversed ? 0.8 : 0) + (midi === path.last && i ? 0.3 : 0);
            paths.push({ score: path.score + cost, pitches: [...path.pitches, midi], last: midi });
        }
        beam = paths.sort((a, b) => a.score - b.score || a.last - b.last).slice(0, 12);
    }
    return notes.map((note, i) => ({ role: 'lead', midi: beam[0].pitches[i], beat: note.beat,
        length: Math.min(note.length, i + 1 < notes.length ? notes[i + 1].beat - note.beat : note.length) * 0.94,
        velocity: (note.accent ? 0.67 : 0.55) * (0.96 + Math.sin((i + 1) / (notes.length + 1) * Math.PI) * 0.08) }));
}

export function arrangeBarLatest(args) {
    const { seed = 1, bar, meter, settings, prev, chord, scalePcs } = args;
    const form = args.developForm !== false ? planForm({ bar, seed, sections: settings.sections,
        developSections: args.sectionDevelopment === true,
        formStrategies:args.formStrategies===true,sectionCurves:args.sectionCurves===true,strategyOverride:args.formStrategy,
        previous: cutForm(prev?.composition?.form, bar, args.sectionCut), barsPerChord: args.barsPerChord,
        barsLeftInChord: args.formBarsLeftInChord ?? args.barsLeftInChord, settings, previousTheme: prev?.composition?.phrase?.themeId }) : null;
    const section = formEnvelope(form, bar, settings.sections?.mode);
    const oldPhrase = prev?.composition?.phrase;
    const continuing = oldPhrase && oldPhrase.units === meter.units && bar < oldPhrase.start + (oldPhrase.bars ?? 4)
        && !(form?.section.start === bar) && !((oldPhrase.bars ?? 4) === 4 && bar % 4 === 0);
    const bars = continuing ? oldPhrase.bars : phraseLength({ choice: args.phraseLength ?? 4, seed, bar, settings, form });
    const base = arrangeBar({ ...args, scalePcs: chord.harmonyPcs ?? scalePcs, phraseBars: bars, phraseBoundary: !continuing, settings: section ? formSettings(settings, section) : args.developForm !== false
            ? { ...settings, sections: { ...settings.sections, mode: 'off' } } : settings,
        rng: rngFor(seed, bar, 0x7f4a7c15) });
    if (args.developForm !== false) base.state.phrase = { ...base.state.phrase, section };
    const developing = args.developThemes !== false;
    const key = `${seed}/${meter.units}/${meter.groups.join(',')}/${settings.leadDensity ?? 0}${developing ? '/development' : ''}`;
    const prior = prev?.composition?.key === key ? prev.composition : null;
    const themes = prior?.themes ?? [makeTheme(meter, seed, 0, settings.leadDensity ?? 0), makeTheme(meter, seed, 1, settings.leadDensity ?? 0)];
    const phrase = prior?.phrase.start === base.state.phrase.start ? prior.phrase : planThemePhrase({ seed,
        start: base.state.phrase.start, section: base.state.phrase.section, previous: prior?.phrase, settings, contrast: args.contrastPhrases === true });
    phrase.bars = bars; phrase.units = meter.units;
    const composition = { key, themes, phrase, ...(form ? { form } : {}) };
    const transitionFor=(s,at)=>(args.endBar==null||s?.start+s?.bars<args.endBar-1)?transitionGesture(s,at):null;
    const gestureFor=(s,at)=>args.transitionGestures===true?transitionFor(s,at):null;
    const gesture=gestureFor(section,bar),leadGesture=args.leadTransitions===true?transitionFor(section,bar):null;
    if(gesture)composition.transitionGesture=gesture;
    const index = bar - base.state.phrase.start;
    const grammar = args.rhythmGrammar === true ? planRhythmGrammar({ seed, phrase, ending: settings.leadEnding }) : null;
    if (grammar) composition.grammar = grammar;
    const duet = args.duetInteraction === true && args.coordinate !== false && settings.leadActivity > 0
        && base.state.phrase.leadActive && base.state.phrase.counter && base.state.phrase.counter.kind !== 'harmony'
        ? duetPlan({ phrase, seed, repeat: settings.leadRepeat ?? 0 }) : null;
    // Retain memory through silent phrases; changing meter/density invalidates it with the themes.
    const duetMemory = prior?.duetMemory ?? [null, null];
    if (args.duetInteraction === true) composition.duetMemory = duetMemory.map(slot => slot?.map(e => ({ ...e })) ?? null);
    if (duet) composition.duet = duet;
    const development = developing ? (prior?.development?.start === phrase.start ? prior.development
        : planDevelopment({ seed, phrase, density: settings.leadDensity ?? 0 })) : null;
    if (development) composition.development = development;
    const stored = themes[duet && duet.mode !== 'contrary motion' ? 0 : phrase.themeId][index % 2];
    const source = duet ? duetMotif(stored, { plan: duet, offset: index }) : development ? developTheme(stored, { operation: development.operations[index], meter,
        interval: development.interval, density: development.density }) : stored;
    const response = index >= bars / 2;
    const material = grammar ? grammarMotif(source, { plan: grammar, offset: index, meter }) : source;
    const protectedBeats=at=>[...(prior?.melody?.resolutions??[]),...(prior?.melody?.ties??[])].flatMap(r=>[r.from,r.to]).filter(p=>p?.bar===at).map(p=>p.beat);
    const shaped = shapeFormNotes(subdivideSection(material,{motion:section?.curves?section.motion:null,meter,
        protectedBeats:protectedBeats(bar),density:settings.leadDensity,index}), section, index, settings.sections?.mode === 'strong',section?.curves?protectedBeats(bar):[]);
    const fragmented=fragmentLead(shaped,{gesture:leadGesture,meter,protectedBeats:protectedBeats(bar)});
    const pickupGesture=args.leadPickups===true?transitionFor(section,bar):null;
    const picked=pickupLead(fragmented,{gesture:pickupGesture,meter,protectedBeats:protectedBeats(bar)});
    const notes = picked.map((note, i) => ({ ...note,
        degree: note.degree + (duet ? 0 : phrase.shift + (response && phrase.role === 'answer' && i === 0 ? -1 : 0)) }));
    const activeLead = base.state.phrase.leadActive && settings.leadActivity > 0;
    if(activeLead&&leadGesture)composition.leadTransition={...leadGesture,removed:shaped.length-notes.length};
    if(activeLead&&pickupGesture?.kind==='gather'&&pickupGesture.step===1)composition.leadPickup={...pickupGesture,
        changed:picked!==fragmented,from:fragmented.at(-1)?.beat,to:picked.at(-1)?.beat};
    let lead = activeLead && !args.harmonyForecast?.length ? realiseThemeBar(notes, { chord, scalePcs, range: base.state.ranges.lead,
        previousMidi: prev?.leadMidi ?? 79, settings, closing: index === bars - 1 }) : [];
    if (activeLead && args.harmonyForecast?.length) {
        const horizon = args.harmonyForecast.filter(h => h.bar < phrase.start + bars).map(h => {
            const offset = h.bar - phrase.start, memory = themes[duet && duet.mode !== 'contrary motion' ? 0 : phrase.themeId][offset % 2];
            const motif = duet ? duetMotif(memory, { plan: duet, offset }) : development ? developTheme(memory, { operation: development.operations[offset], meter,
                interval: development.interval, density: development.density }) : memory;
            const futureSection = form ? formEnvelope(form, h.bar, settings.sections?.mode) : section;
            const rhythmic = grammar ? grammarMotif(motif, { plan: grammar, offset, meter }) : motif;
            const subdivided=subdivideSection(rhythmic,{motion:futureSection?.curves?futureSection.motion:null,meter,
                protectedBeats:protectedBeats(h.bar),density:settings.leadDensity,index:offset});
            const fragment=fragmentLead(shapeFormNotes(subdivided, futureSection, offset, settings.sections?.mode === 'strong',futureSection?.curves?protectedBeats(h.bar):[]),
                {gesture:args.leadTransitions===true?transitionFor(futureSection,h.bar):null,meter,protectedBeats:protectedBeats(h.bar)});
            return { ...h, ...(futureSection?.curves?{tension:futureSection.motion.tension}:{}), midpoint: bars === 8 && offset === 3, notes: pickupLead(fragment,
                {gesture:args.leadPickups===true?transitionFor(futureSection,h.bar):null,meter,protectedBeats:protectedBeats(h.bar)}).map((note, i) => ({ ...note,
                degree: note.degree + (duet ? 0 : phrase.shift + (offset >= bars / 2 && phrase.role === 'answer' && i === 0 ? -1 : 0)) })) };
        });
        if (horizon.length) {
            const melody = planPhraseMelody({ bars: horizon, meter, rhythmGrammar: !!grammar, resolveNotes: args.resolveNotes === true, range: base.state.ranges.lead, settings, previousMidi: prev?.leadMidi ?? 79,
                seed: seed ^ phrase.themeId, closing: horizon.at(-1).bar === phrase.start + bars - 1 }, prior?.melody);
            composition.melody = melody;
            lead = melody.bars.find(b => b.bar === bar).events.map(event => ({ ...event }));
        }
    }
    const incoming=prev?.composition?.sectionSuspension;
    const landed=landSectionSuspension(lead,{pending:incoming,bar,chord,range:base.state.ranges.lead,settings,meter,previousMidi:prev?.leadMidi});
    if(landed&&composition.melody){
        lead=landed.events;
        const affected=p=>p?.bar===bar&&p.beat<=landed.resolution.to.beat;
        composition.melody={...composition.melody,
            resolutions:[...(composition.melody.resolutions??[]).filter(r=>!affected(r.from)&&!affected(r.to)),landed.resolution],
            ties:(composition.melody.ties??[]).filter(r=>!affected(r.from)&&!affected(r.to)),
            bars:composition.melody.bars.map(b=>b.bar===bar?{...b,events:lead.map(e=>({...e}))}:b)};
    }
    let events = base.events.filter(e => e.role !== 'lead');
    // Parallel harmony must follow the actual new melody, not the legacy notes.
    if (base.state.phrase.counter?.kind === 'harmony') {
        const range = base.state.ranges.counter, scale = notesInRange(scalePcs, range[0] - 12, range[1] + 12);
        events = events.filter(e => e.role !== 'counter');
        for (const e of lead) {
            const at = scale.indexOf(nearest(scale, e.midi));
            let midi = scale[Math.max(0, at - 2)];
            while (midi < range[0]) midi += 12;
            while (midi > range[1]) midi -= 12;
            events.push({ ...e, role: 'counter', midi, velocity: e.velocity * 0.78 });
        }
    }
    if (args.coordinate !== false) {
        const rhythmPhrase = prior?.rhythmPhrase?.start === phrase.start ? prior.rhythmPhrase
            : phraseRhythm({ seed, start: phrase.start, meter, bassStyle: base.state.phrase.bassStyle, role: phrase.role, section, bars });
        let rhythm = barRhythm({ phrase: rhythmPhrase, bar, meter, lead });
        if (args.rhythmDevelopment === true) {
            const plan = planRhythmDevelopment({ seed, phrase, meter, previous: prior?.rhythmDevelopment });
            composition.rhythmDevelopment = plan;
            rhythm = developBarRhythm(rhythm, plan, bar, meter);
        }
        composition.rhythmPhrase = rhythmPhrase;
        composition.rhythm = rhythm;
        const partPlan = args.partRhythmGrammar === true ? planPartGrammar({ seed, phrase, roles: rhythm.roles }) : null;
        if (partPlan) composition.partGrammar = partPlan;
        let pad = spaceAccompaniment(events.filter(e => e.role === 'pad'), { rhythm, meter,
            style: base.state.phrase.padStyle, enabled: settings.thinPadUnderLead });
        pad = shapeRhythmicPart(pad, { role: 'pad', style: base.state.phrase.padStyle, rhythm, meter, enabled: settings.thinPadUnderLead });
        if (partPlan) pad = partGrammar(pad, { plan: partPlan, role: 'pad', index, meter,
            style: base.state.phrase.padStyle, enabled: settings.thinPadUnderLead, lead });
        pad=gesturePart(pad,{gesture,meter,style:base.state.phrase.padStyle,enabled:settings.thinPadUnderLead});
        let bass = events.filter(e => e.role === 'bass');
        if (bass.length && !base.state.phrase.pedal) {
            bass = base.state.phrase.bassStyle === 'walking'
                ? walkingBass({ chord, nextChord: args.nextChord, scalePcs: chord.harmonyPcs ?? scalePcs, range: base.state.ranges.bass,
                    previousMidi: prev?.bassMidi ?? 40, meter, chordEnds: args.barsLeftInChord === 1, seed, bar, rhythm })
                : alignBass(bass, { style: base.state.phrase.bassStyle, rhythm, meter });
        }
        let counter = events.filter(e => e.role === 'counter');
        if (base.state.phrase.counter?.kind !== 'harmony') {
            if (duet) counter = duetCounter(counter, { memory: duetMemory, plan: duet, offset: index, lead,
                scalePcs, settings, range: base.state.ranges.counter, previousMidi: prev?.counterMidi ?? 72, chord });
            counter = spaceCounter(counter, { rhythm, meter, lead });
            counter = shapeRhythmicPart(counter, { role: 'counter', style: 'line', rhythm, meter });
            counter = duet ? duetCounter(counter, { plan: { ...duet, mode: 'together' }, offset: index, lead,
                scalePcs, settings, range: base.state.ranges.counter, previousMidi: prev?.counterMidi ?? 72, chord }) : counterPitches(counter, { lead, scalePcs, range: base.state.ranges.counter,
                previousMidi: prev?.counterMidi ?? 72, chord, meter });
            if (duet && counter.length && !composition.duetMemory[index % 2]?.length)
                composition.duetMemory[index % 2] = counter.map(e => ({ ...e }));
            // Store the idea before breathing changes; a rest must not erase its memory.
            if (partPlan) {
                counter = partGrammar(counter, { plan: partPlan, role: 'counter', index, meter, style: 'line', lead });
                counter = duet ? duetCounter(counter, { plan: { ...duet, mode: 'together' }, offset: index, lead,
                    scalePcs, settings, range: base.state.ranges.counter, previousMidi: prev?.counterMidi ?? 72, chord })
                    : counterPitches(counter, { lead, scalePcs, range: base.state.ranges.counter,
                        previousMidi: prev?.counterMidi ?? 72, chord, meter });
            }
        }
        counter=gesturePart(counter,{gesture,meter,style:base.state.phrase.counter?.kind==='harmony'?'harmony':'line'});
        if (args.jointCounterpoint === true && activeLead && composition.melody && base.state.phrase.counter
            && base.state.phrase.counter.kind !== 'harmony' && section?.type !== 'intro'
            && !(section?.type === 'build' && settings.sections.mode === 'strong' && section.progress < .5)) {
            const memory = composition.duetMemory ?? duetMemory;
            const horizon = composition.melody.bars.filter(b => b.bar >= bar).map(b => {
                const h = args.harmonyForecast.find(h => h.bar === b.bar);
                if (!h) return null;
                const offset = b.bar - phrase.start, foreground = b.bar === bar ? lead : b.events;
                let projected = b.bar === bar ? counter : (memory[offset % 2] ?? counter).map(e => ({ ...e }));
                if (b.bar !== bar && base.state.phrase.counter.kind === 'echo' && offset % 2 === 0) projected = [];
                if (b.bar !== bar) {
                    let reference = barRhythm({ phrase: rhythmPhrase, bar: b.bar, meter, lead: foreground });
                    if (composition.rhythmDevelopment) reference = developBarRhythm(reference, composition.rhythmDevelopment, b.bar, meter);
                    if (duet) projected = duetCounter(projected, { plan: duet, offset, lead: foreground,
                        scalePcs: h.scalePcs, settings, range: base.state.ranges.counter, previousMidi: prev?.counterMidi ?? 72, chord: h.chord });
                    projected = spaceCounter(projected, { rhythm: reference, meter, lead: foreground });
                    projected = shapeRhythmicPart(projected, { role: 'counter', style: 'line', rhythm: reference, meter });
                    if (partPlan) projected = partGrammar(projected, { plan: partPlan, role: 'counter', index: offset, meter, style: 'line', lead: foreground });
                    projected=gesturePart(projected,{gesture:gestureFor(form?formEnvelope(form,b.bar,settings.sections?.mode):section,b.bar),meter,style:'line'});
                }
                return { ...h, lead: foreground, counter: projected };
            }).filter(Boolean);
            const protectedNotes = [...(composition.melody.resolutions ?? []), ...(composition.melody.ties ?? [])]
                .flatMap(r => [r.from, r.to]).filter(Boolean);
            for (const b of horizon) if (composition.melody.destination?.closing && b.bar === composition.melody.destination.bar
                || composition.melody.stages.find(s => s.bar === b.bar)?.midpoint) {
                if (b.lead.length) protectedNotes.push({ bar: b.bar, beat: b.lead.at(-1).beat });
            }
            const carry = {}, previousBar = prior?.joint?.bars.find(b => b.bar === bar - 1);
            for (const role of ['lead', 'counter']) for (const e of previousBar?.[role] ?? []) {
                const remaining = e.length - (meter.units - e.beat), bpm = prior.joint.contexts.find(b => b.bar === bar - 1)?.bpm ?? 120;
                if (remaining > 0) carry[role] = { midi: e.midi, end: remaining * 60 / (bpm * meter.unitsPerBeat) };
            }
            if (horizon.length) {
                const joint = planJointCounterpoint({ bars: horizon, meter, ranges: base.state.ranges, settings, protectedNotes, carry,
                    previousMidi: { lead: prev?.leadMidi ?? 79, counter: prev?.counterMidi ?? 72 }, mode: duet?.mode,
                    key: JSON.stringify([seed, phrase, settings, base.state.ranges, composition.melody.signature]) }, prior?.joint);
                composition.joint = joint;
                const chosen = joint.bars.find(b => b.bar === bar);
                lead = chosen.lead.map(e => ({ ...e })); counter = chosen.counter.map(e => ({ ...e }));
                // Keep the phrase melody's expected previous pitch consistent with the joint decision.
                composition.melody = { ...composition.melody, bars: composition.melody.bars.map(b => {
                    const selected = joint.bars.find(j => j.bar === b.bar);
                    return selected ? { ...b, events: selected.lead.map(e => ({ ...e })) } : b;
                }) };
            }
        }
        events = [...pad, ...bass, ...counter];
        if (bass.length) base.state.bassMidi = bass[bass.length - 1].midi;
        if (counter.length) base.state.counterMidi = counter[counter.length - 1].midi;
    }
    if (section) {
        events = events.filter(e => !(section.type === 'intro' && (e.role === 'counter'
            || (settings.sections.mode === 'strong' && e.role === 'bass' && bar - section.start < 4)))
            && !(section.type === 'build' && settings.sections.mode === 'strong' && section.progress < .5 && e.role === 'counter'));
        for (const e of [...events, ...lead]) {
            e.velocity *= section.energy;
            // A descending section releases its last bar instead of filling every gap.
            if (section.transition === 'release' && bar === section.start + section.bars - 1) {
                e.length = Math.min(e.length, Math.max(.04, meter.units - meter.unitsPerBeat * .35 - e.beat));
                if (e.beat >= meter.units - meter.unitsPerBeat * .35) e.velocity *= .7;
            }
        }
    }
    return { events: [...events, ...lead], state: { ...base.state, composition,
        leadMidi: lead.length ? lead[lead.length - 1].midi : prev?.leadMidi ?? 79 } };
}
