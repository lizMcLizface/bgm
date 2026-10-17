import { comparisonPlayheads } from './comparisonPlayhead';
import { compareSectionBars } from './sectionDiff';
import { SCENES, sceneSlug } from '../src/app/scenes';
import { previewEnsemble, renderEnsemble, matchAverageLevels, drawNotes } from './ensembleReview';

export const sectionOptions = options => ({ ...options, variant: 'latest', coordinate: true, sections: true,
    sectionMode: options.mode, sectionPhrases: options.phrases, bass: 'preset', pad: 'preset', straight:false,activeLead:false,developForm:true,sectionDevelopment:options.sectionDevelopment,currentSounds:true,phrasePerformance:true,developThemes:true,phraseSearch:true,longPhrases:true,resolveNotes:true,contrastPhrases:true,duetInteraction:true,rhythmDevelopment:true,rhythmGrammar:true,partRhythmGrammar:true,instrumentGroove:true,jointCounterpoint:true,harmonyScale:'auto' });
export const inspectSections = options => previewEnsemble(sectionOptions(options));
export const inspectCadences = options => previewEnsemble(sectionOptions({...options, sectionDevelopment:true}));
export const inspectSuspensions = options => previewEnsemble(sectionOptions({...options,sectionDevelopment:true,sectionCadences:true,sectionBridges:true,harmonicRhythm:true,transitionGestures:true,leadTransitions:true,leadPickups:true}));
export const inspectPickups = options => previewEnsemble(sectionOptions({...options,sectionDevelopment:true,sectionCadences:true,sectionBridges:true,harmonicRhythm:true,transitionGestures:true,leadTransitions:true}));
export const inspectLeadTransitions = options => previewEnsemble(sectionOptions({...options,sectionDevelopment:true,sectionCadences:true,sectionBridges:true,harmonicRhythm:true,transitionGestures:true}));
export const inspectGestures = options => previewEnsemble(sectionOptions({...options,sectionDevelopment:true,sectionCadences:true,sectionBridges:true,harmonicRhythm:true}));
export const inspectHarmonicRhythm = options => previewEnsemble(sectionOptions({...options,sectionDevelopment:true,sectionCadences:true,sectionBridges:true}));
export const inspectBridges = options => previewEnsemble(sectionOptions({...options, sectionDevelopment:true, sectionCadences:true}));

const form = document.querySelector('#section-review, #cadence-review, #bridge-review, #harmonic-review, #gesture-review, #lead-transition-review, #pickup-review, #suspension-review');
const suspensionReview = form?.id === 'suspension-review';
const pickupReview = form?.id === 'pickup-review';
const leadReview = form?.id === 'lead-transition-review';
const gestureReview = form?.id === 'gesture-review';
const harmonicReview = form?.id === 'harmonic-review';
const bridgeReview = form?.id === 'bridge-review';
const cadenceReview = form?.id === 'cadence-review' || bridgeReview || harmonicReview || gestureReview || leadReview || pickupReview || suspensionReview;
const roles = ['lead', 'counter', 'pad', 'bass', 'perc'];
const urls = [];let playback;
function display(plan, title, options, differences) {
    const section = document.createElement('section'), heading = document.createElement('h2');
    heading.textContent = title; section.append(heading);
    const timeline = document.createElement('div'); timeline.className = 'sections';
    const entries = [];
    for (const b of plan.bars) {
        const s = b.section;
        if (!s) continue;
        if (entries.at(-1)?.start === s.start) entries.at(-1).end = b.bar + 1;
        else entries.push({ ...s, end: b.bar + 1, first: b.bar });
    }
    for (const s of entries) {
        const span = document.createElement('span'); span.className = s.type;
        span.style.width = `${(s.end - s.first) / options.bars * 100}%`;
        span.textContent = `${s.type} ${s.first + 1}–${s.end}`;
        span.title = `${s.type}, bars ${s.first + 1}–${s.end}${s.nextType ? `; prepares ${s.nextType}` : ''}`;
        timeline.append(span);
    }
    section.append(timeline);
    const description = document.createElement('p');
    description.textContent = `${entries.length} sections · ${(plan.seconds / 60).toFixed(1)} minutes${plan.gain === undefined ? '' : ` · level adjustment ${(20 * Math.log10(plan.gain || 1)).toFixed(1)} dB`}`;
    section.append(description);
    let audio;
    if (plan.blob) {
        const url = URL.createObjectURL(plan.blob); urls.push(url);
        audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = url;
        audio.addEventListener('play', () => {
            const other = [...document.querySelectorAll('audio')].find(a => a !== audio && !a.paused);
            if (other) { audio.currentTime = Math.min(other.currentTime, Number.isFinite(audio.duration) ? audio.duration : Infinity); other.pause(); }
        });
        const link = document.createElement('a'); link.href = url; link.download = `${suspensionReview?'section-suspensions':pickupReview?'lead-pickups':leadReview?'lead-transitions':gestureReview?'gestures':harmonicReview?'harmonic-rhythm':bridgeReview?'bridges':cadenceReview?'cadences':'sections'}-${options.preset}-${plan.enhanced ? 'new' : 'previous'}-${options.seed}.wav`; link.textContent = 'Save WAV';
        section.append(audio, link);
    }
    // Four phrases per row keep note patterns legible on long plans.
    for (let offset = 0; offset < plan.bars.length; offset += 16) {
        const bars = plan.bars.slice(offset, offset + 16), start = bars[0].start;
        const seconds = bars.at(-1).start + bars.at(-1).seconds - start;
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-label', `Notes in bars ${offset + 1}–${offset + bars.length}`);
        drawNotes(canvas, { bars: bars.map(b => ({ ...b, start: b.start - start })), seconds }, options.parts);
        if (plan.enhanced) {
            const ctx = canvas.getContext('2d');
            for (const b of bars) {
                const diff = differences.find(d => d.bar === b.bar);
                if (!diff.voices.length) continue;
                const x = 75 + (b.start - start) / seconds * 1015, width = b.seconds / seconds * 1015;
                ctx.strokeStyle = '#ffc36b'; ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, 20, width - 2, 237);
            }
        }
        section.append(canvas);if(audio)playback.add(audio,canvas,{bars:bars.map(b=>({...b,start:b.start-start})),seconds},{start});
    }
    const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Phrase decisions';
    const table = document.createElement('table');
    const row = cells => { const tr = document.createElement('tr'); for (const text of cells) { const td = document.createElement('td'); td.textContent = text; tr.append(td); } return tr; };
    table.append(row(['Bar', 'Section', 'Theme / role', 'Preparation']));
    for (const b of plan.bars.filter(b => b.bar % 4 === 0)) table.append(row([b.bar + 1, b.section?.type ?? 'off', b.phrase ? `${b.phrase.themeId + 1} / ${b.phrase.role}` : '—', b.section?.transition ? `${b.section.transition} → ${b.section.nextType}` : '—']));
    details.append(summary, table); section.append(details);
    return section;
}

function differenceSummary(previous, shaped, differences) {
    const box = document.createElement('section'); box.className = 'difference-summary';
    const heading = document.createElement('h2'); heading.textContent = 'What actually changed?';
    const changed = differences.filter(b => b.voices.length);
    const structureSame = previous.bars.every((b,i) => ['type','start','bars'].every(k => b.section?.[k] === shaped.bars[i].section?.[k]));
    const text = document.createElement('p');
    text.textContent = `${changed.length} of ${differences.length} bars have different emitted notes in the selected parts. ${structureSame ? 'Section order and lengths are identical: this comparison shapes the music inside those sections.' : 'Section order or lengths also differ.'} Amber outlines on the shaped note maps mark changed bars.`;
    box.append(heading, text);
    if(suspensionReview){
        const p=document.createElement('p');p.textContent='Only the section handoff is toggled. The held tone is committed before playback, then tracked as resolved or cancelled on arrival. Source pitch adjustment, if needed, is shown explicitly.';box.append(p);
        const table=document.createElement('table'),names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
        const pitch=m=>`${names[((m%12)+12)%12]}${Math.floor(m/12)-1}`;
        for(const values of [['Preparation','Held tone','Resolution','Status'],...shaped.bars.filter(b=>b.sectionSuspension).map(b=>{
            const s=b.sectionSuspension,arrival=shaped.bars.find(b=>b.bar===s.to.bar)?.suspensionArrival;
            return [`Bar ${b.bar+1}`,`${pitch(s.originalMidi)} → ${pitch(s.from.midi)}`,
                `${pitch(arrival?.to.midi??s.to.midi)} · bar ${s.to.bar+1}, beat ${1+s.to.beat/(b.unitsPerBeat??1)}`,
                arrival?.status??'Arrival outside excerpt'];
        })]){
            const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);
        }
        box.append(table);
    }
    if(pickupReview){
        const p=document.createElement('p');p.textContent='Only the rhythmic pickup layer is toggled. Pitch search, ties and ensemble responses can adapt to the new articulation. The table reports source timing; note maps show the realised result.';box.append(p);
        const table=document.createElement('table');
        const beat=(at,b)=>Number.isFinite(at)?(1+at/(b.unitsPerBeat??1)).toFixed(2).replace(/\.00$/,''):'—';
        for(const values of [['Bar','Closing attack','Return'],...shaped.bars.filter(b=>b.leadPickup).map(b=>[b.bar+1,b.leadPickup.changed?`Beat ${beat(b.leadPickup.from,b)} → ${beat(b.leadPickup.to,b)}`:'Retained',`Full at bar ${b.leadPickup.end+1}`])]){
            const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);
        }
        box.append(table);
    }
    if(leadReview){
        const p=document.createElement('p');p.textContent='Both versions include backing gestures. Only the lead-fragment layer is toggled; phrase pitch planning and ensemble responses follow the realised rhythm. Planned fragments below are distinct from measured note changes.';box.append(p);
        const table=document.createElement('table');
        for(const values of [['Bar','Transition','Source attacks removed','Destination'],...shaped.bars.filter(b=>b.leadTransition).map(b=>[b.bar+1,b.leadTransition.kind==='release'?'Release fragment':'Arrival fragment',b.leadTransition.removed||'0 · retained',`${b.leadTransition.destination} at bar ${b.leadTransition.end+1}`])]){
            const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);
        }
        box.append(table);
    }
    if(gestureReview){
        const description=document.createElement('p');description.textContent='Only rhythmic backing parts are shaped. Held pad textures and parallel counter harmony are preserved; no attacks are added. A planned gesture may have no effect when those parts are silent or held.';box.append(description);
        const table=document.createElement('table');
        for(const values of [['Bar','Planned gesture','Destination'],...shaped.bars.filter(b=>b.transitionGesture).map(b=>[b.bar+1,b.transitionGesture.kind==='release'?'Release backing':'Gather before return',`${b.transitionGesture.destination} at bar ${b.transitionGesture.end+1}`])]){
            const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);
        }
        box.append(table);
    }
    if(harmonicReview){
        const p=document.createElement('p');p.textContent='Chord order and cycle length are preserved. Compare slot boundaries below; durations are in bars. Section decisions are committed at cycle entry, so a held chord is not cut short when the section label changes.';box.append(p);
        const slots=plan=>plan.bars.filter(b=>b.harmonySlot.start===b.bar);
        const a=slots(previous),b=slots(shaped),table=document.createElement('table');
        const row=(values,header=false)=>{const tr=document.createElement('tr');for(const value of values){const td=document.createElement(header?'th':'td');td.textContent=value;tr.append(td);}return tr;};
        table.append(row(['Even slots','Section-shaped slots'],true));
        const describe=b=>b?`${b.harmonySlot.bars===1?'Bar':'Bars'} ${b.harmonySlot.start+1}${b.harmonySlot.bars===1?'':`–${b.harmonySlot.end}`}: ${b.chord} · ${b.harmonySlot.bars} ${b.harmonySlot.bars===1?'bar':'bars'}`:'—';
        for(let i=0;i<Math.max(a.length,b.length);i++)table.append(row([describe(a[i]),describe(b[i])]));
        box.append(table);
    }
    if (cadenceReview) {
        const p=document.createElement('p');
        const changedChords=shaped.bars.filter((b,i)=>b.chord!==previous.bars[i].chord);
        p.textContent=`${changedChords.length} ${changedChords.length===1?'bar has':'bars have'} different chords. ${harmonicReview?'Both versions use the same cadence and bridge algorithms; their musical context follows the realised chord durations.':bridgeReview?'Both versions include the fifth/tonic cadence. The new version can replace the preceding chord with a connection that shares notes on both sides; an already good connection stays as it is.':'Fifth-chord preparation and tonic arrival use the existing mode, chord colours and chord-slot length. A modal fifth need not be a major dominant.'}`;
        box.append(p);
        const table=document.createElement('table'), head=document.createElement('thead'), body=document.createElement('tbody');
        const row=(values,header=false)=>{const tr=document.createElement('tr');for(const value of values){const cell=document.createElement(header?'th':'td');cell.textContent=value;tr.append(cell);}return tr;};
        head.append(row(['Bar','Harmonic role','Previous chord','Prepared chord',...(bridgeReview?['Shared with preceding / next chord']:[])],true));
        const names=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
        for(const b of shaped.bars.filter(b=>b.cadence)) {
            const c=b.cadence;
            const role=c.kind==='bridge'?`Bridge → ${c.target}`:c.kind==='prepare'?`Prepare bar ${c.arrivalBar+1}`:'Tonic arrival';
            const shared=c.kind==='bridge'?`${c.sharedBefore.map(pc=>names[pc]).join(', ')} / ${c.sharedAfter.map(pc=>names[pc]).join(', ')}`:'—';
            body.append(row([b.bar+1,role,previous.bars[b.bar].chord,`${b.chord}${b.chord===previous.bars[b.bar].chord?' (unchanged)':''}`,...(bridgeReview?[shared]:[])]));
        }
        table.append(head,body);box.append(table);
    }
    if (!changed.length) { const p=document.createElement('p');p.textContent='This layer produces no note changes for this selection. Existing musical choices are retained where no eligible improvement is found.';box.append(p);return box; }
    const table = document.createElement('table'), head = document.createElement('thead'), body = document.createElement('tbody');
    const row = (cells, header=false) => { const tr=document.createElement('tr');for(const value of cells){const cell=document.createElement(header?'th':'td');cell.textContent=value;tr.append(cell);}return tr; };
    head.append(row(['Bar / section','Voice / changes','Previous notes','Shaped notes'],true));
    const describe = events => {
        if (!events.length) return 'Silent';
        const pitches=[...new Set(events.map(e=>e.midi))].sort((a,b)=>a-b);
        const average=events.reduce((sum,e)=>sum+e.length,0)/events.length;
        return `${events.length} attacks · mean length ${average.toFixed(2)} beats · MIDI ${pitches.join(', ')}`;
    };
    for (const b of changed) for(const voice of b.voices) body.append(row([`${b.bar+1} / ${shaped.bars.find(x=>x.bar===b.bar).section?.type ?? 'off'}`,`${voice.role}: ${voice.changes.join(', ')}`,describe(voice.before),describe(voice.after)]));
    table.append(head,body);const scroll=document.createElement('div');scroll.className='table-scroll';scroll.append(table);box.append(scroll);
    const explanation=document.createElement('p');explanation.textContent='These are measured event differences, not predicted activity. Held pads and fixed style choices can remain unchanged even when section curves differ. Lengths use the planner’s beat units.';box.append(explanation);
    return box;
}

if (form) {
    if(suspensionReview)for(const role of roles)form.elements[`hear-${role}`].checked=['lead','pad'].includes(role);
    if(leadReview||pickupReview)for(const role of roles)form.elements[`hear-${role}`].checked=role==='lead';
    if (bridgeReview || harmonicReview || gestureReview) for (const role of ['lead','counter','perc']) form.elements[`hear-${role}`].checked = false;
    for (const scene of SCENES.filter(s => s.settings.playMusic !== false)) form.elements.preset.add(new Option(scene.name, sceneSlug(scene.name)));
    const defaults = { preset: suspensionReview?'boss-fight-politely':pickupReview?'boss-fight-politely':leadReview?'boss-fight-politely':gestureReview?'fireside-folk':harmonicReview?'rainy-cafe':bridgeReview?'rainy-cafe':cadenceReview?'quiet-room-waltz':'rainy-cafe', seed: suspensionReview||pickupReview?'4':leadReview?'6':'42', bars: harmonicReview||gestureReview||leadReview||pickupReview||suspensionReview?'16':'32', mode: suspensionReview?'gentle':cadenceReview?'strong':'gentle', phrases: leadReview||pickupReview||suspensionReview?'1':bridgeReview||harmonicReview?'4':'2', ...(harmonicReview?{barsPerChord:'2'}:{}) };
    const query = new URLSearchParams(location.search);
    for (const [key, fallback] of Object.entries(defaults)) {
        form.elements[key].value = query.get(key) || fallback;
        if (!form.elements[key].value) form.elements[key].value = key === 'preset' ? form.elements[key].options[0].value : fallback;
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const options = { preset: form.elements.preset.value, seed: Math.max(0, Math.min(2147483647, Math.floor(Number(form.elements.seed.value) || 0))),
            bars: Number(form.elements.bars.value), mode: form.elements.mode.value, phrases: Number(form.elements.phrases.value),
            parts: roles.filter(role => form.elements[`hear-${role}`].checked), ...(harmonicReview?{barsPerChord:Number(form.elements.barsPerChord.value)}:{}) };
        const status = document.querySelector('#status'), buttons = [...form.querySelectorAll('button')];
        if (!options.parts.length) { status.textContent = 'Choose at least one voice.'; return; }
        history.replaceState(null, '', location.pathname + '?' + new URLSearchParams(Object.fromEntries(Object.keys(defaults).map(k => [k, options[k]]))));
        buttons.forEach(b => b.disabled = true); document.querySelectorAll('audio').forEach(a => a.pause());
        try {
            const render = event.submitter?.value === 'render', plans = [];
            const titles = suspensionReview ? ['Separate section entrances','Prepared section suspensions'] : pickupReview ? ['Previous closing articulation','Lead upbeats into section returns'] : leadReview ? ['Previous lead transitions','Lead fragments before section changes'] : gestureReview ? ['Previous transition backing','Backing gestures before section changes'] : harmonicReview ? ['Even chord durations','Section-shaped chord durations'] : bridgeReview ? ['Prepared cadences only','Common-tone bridges into cadences'] : cadenceReview ? ['Previous section harmony','Prepared section cadences'] : ['Previous form envelopes','Section shapes and preparation'];
            for (const enhanced of [false, true]) {
                const title = titles[Number(enhanced)];
                status.textContent = `${render ? 'Rendering' : 'Inspecting'} ${title}…`;
                const p = sectionOptions({ ...options, sectionDevelopment:cadenceReview?true:enhanced, sectionCadences:suspensionReview||pickupReview||leadReview||gestureReview||harmonicReview||bridgeReview?true:cadenceReview?enhanced:false, sectionBridges:suspensionReview||pickupReview||leadReview||gestureReview||harmonicReview?true:bridgeReview?enhanced:false, harmonicRhythm:suspensionReview||pickupReview||leadReview||gestureReview?true:harmonicReview?enhanced:false, transitionGestures:suspensionReview||pickupReview||leadReview?true:gestureReview?enhanced:false, leadTransitions:suspensionReview||pickupReview?true:leadReview?enhanced:false, leadPickups:suspensionReview?true:pickupReview?enhanced:false, sectionSuspensions:suspensionReview?enhanced:false });
                let active = true, plan;
                try {
                    plan = render ? await renderEnsemble(p, n => { if (active) status.textContent = `Rendering ${title} ${Math.round(n * 100)}%`; }) : previewEnsemble(p);
                } finally { active = false; }
                plans.push({ ...plan, enhanced, sectionDevelopment:p.sectionDevelopment, sectionCadences:p.sectionCadences });
            }
            const matched = render ? await matchAverageLevels(plans, form.elements.match.checked) : plans;
            urls.splice(0).forEach(url => URL.revokeObjectURL(url));
            const differences = compareSectionBars(matched[0], matched[1], options.parts);
            playback?.dispose();playback=comparisonPlayheads();document.querySelector('#results').replaceChildren(differenceSummary(matched[0],matched[1],differences),...matched.map((plan, i) => display(plan, titles[i], options, differences)));
            status.textContent = `Ready: ${options.bars} bars per version, seed ${options.seed}.${render ? ' Switching players keeps the listening position.' : ' Render audio to hear this pair.'}`;
        } catch (error) { status.textContent = error.message; }
        finally { buttons.forEach(b => b.disabled = false); }
    });
}
