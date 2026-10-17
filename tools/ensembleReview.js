import {joinHeldNotes} from '../src/app/composition/heldGlides';
import { slideNotes } from '../src/app/composition/noteSlides';
import { expressNotes, expressHeldNotes, connectWindNotes, timeSoundNotes } from '../src/app/composition/noteExpression';
import { findPreset } from '../src/app/editor/presetStore';
import Generator, { ROLES } from '../src/app/Generator';
import { SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { PAD_STYLES, BASS_STYLES } from '../src/app/arranger';
import { DRUMS } from '../src/app/percussion';
import { renderWav } from '../src/app/engine/render';
import { unitsPerMinute } from '../src/app/meter';

export const VARIANTS = { previous: 'Previous Latest', latest: 'Coordinated Latest', legacy: 'Original' };
const roles = ['lead', 'counter', 'pad', 'bass', 'perc'];
const colours = { lead: '#5cc896', counter: '#62bde6', pad: '#a993ea', bass: '#e9a25d', perc: '#b4bac4' };
let generator;

function configure(options) {
    const scene = SCENES.find(s => sceneSlug(s.name) === options.preset);
    if (!scene) throw new Error('Choose a musical preset.');
    const settings = sceneSettings(scene, options.seed);
    settings.harmonyScale = options.harmonyScale ?? 'selected';
    if(options.barsPerChord !== undefined)settings.barsPerChord=options.barsPerChord;
    settings.generation = options.variant === 'legacy' ? 'legacy' : 'latest';
    settings.drift = { ...settings.drift, mode: 'off' };
    settings.playMusic = true; settings.playAmbience = false;
    settings.ambience = Object.fromEntries(Object.keys(settings.ambience).map(id => [id, 0]));
    if (options.sectionMode) settings.sections = { mode: options.sectionMode, phrases: options.sectionPhrases || 2 };
    if (!options.sections) { settings.sections = { ...settings.sections, mode: 'off' }; settings.sectionTone = false; }
    if (options.straight) { settings.swing = 0; settings.humanize = { timing: 0, velocity: 0, detune: 0 }; }
    if (options.activeLead) settings.leadActivity = 1;
    if (options.counterActive) settings.counter = { mode: 'line', activity: 1 };
    if (options.performanceVelocity !== undefined) settings.humanize.velocity = options.performanceVelocity;
    if (options.performanceTiming !== undefined) settings.humanize.timing = options.performanceTiming;
    if (options.leadEnding !== undefined) settings.leadEnding = options.leadEnding;
    if (options.leadRepeat !== undefined) settings.leadRepeat = options.leadRepeat;
    if (options.leadDensity !== undefined) settings.leadDensity = options.leadDensity;
    if (options.bass !== 'preset') settings.bassWeights = Object.fromEntries(Object.keys(BASS_STYLES).map(id => [id, id === options.bass ? 1 : 0]));
    if (options.pad !== 'preset') settings.padWeights = Object.fromEntries(Object.keys(PAD_STYLES).map(id => [id, id === options.pad ? 1 : 0]));
    if (!generator) generator = new Generator(settings);
    generator.ensembleCoordination = options.coordinate ?? options.variant !== 'previous';
    generator.formDevelopment = options.developForm ?? false;
    generator.phrasePerformance = options.phrasePerformance ?? false;
    generator.themeDevelopment = options.developThemes ?? false;
    generator.phraseSearch = options.phraseSearch ?? false;
    generator.longPhrases = options.longPhrases ?? false;
    generator.noteResolution = options.resolveNotes ?? false;
    generator.contrastPhrases = options.contrastPhrases ?? false;
    generator.duetInteraction = options.duetInteraction ?? false;
    generator.rhythmDevelopment = options.rhythmDevelopment ?? false;
    generator.rhythmGrammar = options.rhythmGrammar ?? false;
    generator.partRhythmGrammar = options.partRhythmGrammar ?? false;
    generator.instrumentGroove = options.instrumentGroove ?? false;
    generator.jointCounterpoint = options.jointCounterpoint ?? false;
    generator.sectionDevelopment = options.sectionDevelopment ?? false;
    generator.sectionCadences = options.sectionCadences ?? false;
    generator.sectionBridges = options.sectionBridges ?? false;
    generator.harmonicRhythm = options.harmonicRhythm ?? false;
    generator.transitionGestures = options.transitionGestures ?? false;
    generator.leadTransitions = options.leadTransitions ?? false;
    generator.leadPickups = options.leadPickups ?? false;
    generator.sectionSuspensions = options.sectionSuspensions ?? false;
    // Historical comparisons stay fixed; the development page opts into Phase 3.
    generator.formStrategies=options.formStrategies??false;
    generator.sectionCurves=options.sectionCurves??false;
    generator.harmonicDevelopment=options.harmonicDevelopment??false;
    generator.endingDevelopment=options.endingDevelopment??false;
    generator.noteExpression=options.noteExpression??false;
    generator.heldExpression=options.heldExpression??false;
    generator.noteConnection=options.noteConnection??false;
    generator.tempoEffects=options.tempoEffects??false;
    generator.gateEnvelopes=options.gateEnvelopes??false;
    generator.heldPadGlides=options.heldPadGlides??false;
    generator.heldBassGlides=options.heldBassGlides??false;
    generator.padPitchMotion=options.padPitchMotion??false;
    generator.bassPitchMotion=options.bassPitchMotion??false;
    generator.noteSlides=options.noteSlides??false;
    generator.chordSlides=options.chordSlides??false;
    generator.formStrategy=options.formStrategy;
    generator.phraseLength = options.phraseLength;
    generator.setMany(settings);
    for (const role of Object.keys(ROLES)) {
        const voice = scene.voices[role];
        if (typeof voice === 'string') generator.loadRolePreset(role, voice, options.currentSounds ? findPreset(voice) : { ...findPreset(voice) });
        else if (voice) generator.loadRolePreset(role, voice.name, voice.synth);
        else generator.loadRolePreset(role, ROLES[role].preset);
    }
    for (const [role, sound] of Object.entries(options.sounds || {})) generator.loadRolePreset(role, sound.name, sound.preset);
    for (const role of roles) generator.setRoleMix(role, { mute: !options.parts.includes(role), solo: false });
    delete generator.planner;
    if (options.testNotes || Number.isInteger(options.endingAt)) generator.planner = function (reviewOptions) {
        const planner = Generator.prototype.planner.call(this, reviewOptions), planBar = planner.planBar.bind(planner);
        if(Number.isInteger(options.endingAt))planner.endBar=options.endingAt;
        if(!options.testNotes)return planner;
        planner.planBar = bar => {
            planBar(bar);
            const planned = planner.plan.get(bar), passage = options.testNotes[bar % options.testNotes.length];
            planned.events = passage.events.map(event => ({ ...event }));
            if (options.noteExpression) expressNotes(planned.events, { voices: planner.grooveVoices, secondsPerBeat: 60 / unitsPerMinute(planner.meter, planned.bpm), units: planner.meter.units });
            if (options.heldExpression) expressHeldNotes(planned.events, { voices: planner.grooveVoices, secondsPerBeat: 60 / unitsPerMinute(planner.meter, planned.bpm) });
            if (options.noteConnection) connectWindNotes(planned.events, { voices: planner.grooveVoices, secondsPerBeat: 60 / unitsPerMinute(planner.meter, planned.bpm), previous: planner.plan.get(bar-1)?.events ?? [], units: planner.meter.units });
            if (options.tempoEffects || options.gateEnvelopes) timeSoundNotes(planned.events, { voices:planner.grooveVoices,bpm:planned.bpm,tempoEffects:options.tempoEffects,gateEnvelopes:options.gateEnvelopes });
            if(options.noteSlides || options.padPitchMotion || options.bassPitchMotion || options.chordSlides)slideNotes(planned.events,{bar,previous:planner.plan.get(bar-1)?.events??[],units:planner.meter.units,secondsPerBeat:60/unitsPerMinute(planner.meter,planned.bpm),noteSlides:options.noteSlides,padMotion:options.padPitchMotion,bassMotion:options.bassPitchMotion,chordSlides:options.chordSlides});
            if(options.heldGlide)for(const n of planned.events)if(n.pitchTargets)n.expression={...n.expression,pitchTargets:n.pitchTargets};
            planned.chord = { ...planned.chord, name: passage.label };
        };
        return planner;
    };
    generator.reset();
    return generator;
}

export function previewEnsemble(options) {
    const gen = configure(options), planner = gen.planner(), bars = [];
    let start = 0;
    for (let bar = 0; bar < options.bars; bar++) {
        planner.planBar(bar);
        const b = planner.plan.get(bar), seconds = gen.meter.units * 60 / unitsPerMinute(gen.meter, b.bpm);
        bars.push({ bar, start, seconds, units: gen.meter.units, unitsPerBeat:gen.meter.unitsPerBeat, chord: b.chord.name, boundaries:b.boundaries, ending:b.ending, rhythm: b.state.composition?.rhythm, performance: b.state.composition?.performance, development: b.state.composition?.development, melody: b.state.composition?.melody?.destination, resolutions: b.state.composition?.melody?.resolutions, section: b.state.phrase.section, phrase: b.state.composition?.phrase,
            sectionSuspension:b.state.composition?.sectionSuspension, suspensionArrival:b.state.composition?.sectionSuspensionArrival, leadPickup:b.state.composition?.leadPickup, leadTransition:b.state.composition?.leadTransition, transitionGesture:b.state.composition?.transitionGesture, harmonySlot:planner.harmonicSlotAt(bar,b.music), cadence: b.chord.cadence, joint: b.state.composition?.joint ? { beamWidth: b.state.composition.joint.beamWidth, through: b.state.composition.joint.bars.at(-1)?.bar } : null, groove: b.state.composition?.instrumentGroove, partGrammar: b.state.composition?.partGrammar, grammar: b.state.composition?.grammar, ties: b.state.composition?.melody?.ties, duet: b.state.composition?.duet, events: b.events.map(e => ({ ...e })) });
        start += seconds;
    }
    const bass = bars.flatMap(b => b.events.filter(e => e.role === 'bass'));
    let aligned = 0;
    for (const b of bars) {
        const kicks = b.events.filter(e => e.role === 'perc' && ['kick', 'punch'].includes(DRUMS[e.midi]));
        aligned += b.events.filter(e => e.role === 'bass' && kicks.some(k => Math.abs(k.beat - e.beat) < .05)).length;
    }
    const leaps = bass.slice(1).map((e, i) => Math.abs(e.midi - bass[i].midi));
    const raw=bars.flatMap(b=>b.events.filter(e=>['pad','bass'].includes(e.role)&&(options.parts??roles).includes(e.role)).map(e=>({...e,bar:b.bar,time:b.start+e.beat*b.seconds/b.units,duration:e.length*b.seconds/b.units,section:b.section?.start,ending:b.ending})));
    const played=joinHeldNotes(raw,{pad:options.heldPadGlides===true,bass:options.heldBassGlides===true,voices:Object.fromEntries(Object.entries(gen.roles).map(([role,v])=>[role,v.instrument.preset])),legacy:options.variant==='legacy'});
    const heldConnections=played.filter(n=>n.heldMembers).map(n=>({role:n.role,midi:n.midi,duration:n.duration,notes:n.heldMembers.length}));
    return { performanceEvents:heldConnections.length?played:null, heldConnections, variant: options.variant, bars, seconds: start, seed: options.seed, preset: options.preset,
        summary: { bassNotes: bass.length, kickAlignedBass: aligned, largestBassLeap: leaps.length ? Math.max(...leaps) : 0 } };
}

export async function renderEnsemble(options, onProgress = () => {}) {
    const plan = previewEnsemble(options);
    const blob = await renderWav(generator, plan.seconds, { onProgress });
    return { ...plan, blob };
}

/** Match average PCM level by attenuation only, preserving peaks and timbre. */
export async function matchAverageLevels(results, enabled = true) {
    const buffers = await Promise.all(results.map(r => r.blob.arrayBuffer()));
    const rms = buffers.map(buffer => {
        const view = new DataView(buffer); let sum = 0;
        for (let at = 44; at < view.byteLength; at += 2) sum += (view.getInt16(at, true) / 32768) ** 2;
        return Math.sqrt(sum / ((view.byteLength - 44) / 2));
    });
    const audible = rms.filter(v => v > 1e-8), target = audible.length ? Math.min(...audible) : 0;
    return results.map((result, i) => {
        const gain = enabled && rms[i] > 1e-8 ? target / rms[i] : 1, view = new DataView(buffers[i]);
        if (gain < 1) for (let at = 44; at < view.byteLength; at += 2) view.setInt16(at, Math.round(view.getInt16(at, true) * gain), true);
        return { ...result, rms: rms[i], gain, blob: new Blob([buffers[i]], { type: 'audio/wav' }) };
    });
}

export function drawNotes(canvas, plan, parts) {
    const ctx = canvas.getContext('2d'), width = 1100, height = 260;
    canvas.width = width; canvas.height = height;
    ctx.fillStyle = '#171b20'; ctx.fillRect(0, 0, width, height);
    const left = 75, usable = width - left - 10, row = 43;
    ctx.font = '12px system-ui';
    for (const [i, role] of roles.entries()) { ctx.fillStyle = colours[role]; ctx.fillText(role, 8, 48 + i * row); }
    for (const b of plan.bars) {
        const x = left + b.start / plan.seconds * usable;
        ctx.strokeStyle = '#3a4149'; ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, height); ctx.stroke();
        ctx.fillStyle = '#c6ced7'; ctx.fillText(`${b.bar + 1} ${b.chord}`, x + 3, 15);
        const events=plan.performanceEvents
            ? [...b.events.filter(e=>!['pad','bass'].includes(e.role)),...plan.performanceEvents.filter(n=>n.bar===b.bar).map(n=>({...n,beat:(n.time-b.start)/(b.seconds/b.units),length:n.duration/(b.seconds/b.units)}))]
            : b.events;
        for (const e of events) {
            if (!parts.includes(e.role)) continue;
            const index = roles.indexOf(e.role), beatSeconds = b.seconds / b.units;
            const at = left + (b.start + e.beat * beatSeconds) / plan.seconds * usable;
            const length = Math.max(2, e.length * beatSeconds / plan.seconds * usable);
            const range = e.role === 'bass' ? [24, 60] : e.role === 'perc' ? [0, DRUMS.length] : [48, 96];
            const fraction = Math.max(0, Math.min(1, (e.midi - range[0]) / (range[1] - range[0])));
            ctx.fillStyle = colours[e.role];
            if(e.expression?.pitchTargets){
                const points=[{time:0,midi:e.midi},...e.expression.pitchTargets.filter(p=>p.time>0)];
                ctx.strokeStyle=colours[e.role];ctx.lineWidth=2;ctx.beginPath();
                const y=midi=>29+index*row+(1-Math.max(0,Math.min(1,(midi-range[0])/(range[1]-range[0]))))*24;
                ctx.moveTo(at,y(e.midi));
                for(let i=1;i<points.length;i++)for(let step=1;step<=20;step++){
                    const a=points[i-1],b=points[i],u=step/20,ease=u*u*(3-2*u);
                    ctx.lineTo(at+(a.time+(b.time-a.time)*u)/plan.seconds*usable,y(a.midi+(b.midi-a.midi)*ease));
                }
                ctx.stroke();ctx.fillRect(at-2,y(e.midi)-3,4,6);
            }else ctx.fillRect(at, 29 + index * row + (1 - fraction) * 24, length, 3);
        }
    }
}

const form = document.querySelector('#ensemble');
if (form) {
    const query = new URLSearchParams(location.search);
    const scenes = SCENES.filter(s => s.settings.playMusic !== false);
    for (const s of scenes) form.elements.preset.add(new Option(s.name, sceneSlug(s.name)));
    for (const [field, styles] of [['bass', BASS_STYLES], ['pad', PAD_STYLES]]) for (const [id, label] of Object.entries(styles)) form.elements[field].add(new Option(label, id));
    const defaults = { preset: 'dorian-walk', bass: 'walking', pad: 'pulse', seed: '42', bars: '8' };
    for (const [key, value] of Object.entries(defaults)) form.elements[key].value = query.get(key) || value;
    const urls = [];
    const read = () => ({ preset: form.elements.preset.value, bass: form.elements.bass.value, pad: form.elements.pad.value,
        seed: Math.max(0, Math.min(2147483647, Math.floor(Number(form.elements.seed.value) || 0))), bars: Number(form.elements.bars.value),
        parts: roles.filter(role => form.elements[`hear-${role}`].checked), sections: form.elements.sections.checked,
        straight: form.elements.straight.checked, activeLead: form.elements.activeLead.checked });
    form.addEventListener('submit', async event => {
        event.preventDefault(); const options = read(), status = document.querySelector('#status'), button = form.querySelector('button');
        if (!options.parts.length) { status.textContent = 'Choose at least one voice.'; return; }
        const params = new URLSearchParams(Object.fromEntries(Object.keys(defaults).map(key => [key, options[key]])));
        history.replaceState(null, '', location.pathname + '?' + params);
        button.disabled = true; document.querySelectorAll('audio').forEach(a => a.pause());
        try {
            const result = [];
            for (const variant of ['previous', 'latest', ...(form.elements.original.checked ? ['legacy'] : [])]) {
                status.textContent = `Rendering ${VARIANTS[variant]}…`;
                result.push(await renderEnsemble({ ...options, variant }, fraction => { status.textContent = `Rendering ${VARIANTS[variant]} ${Math.round(fraction * 100)}%`; }));
            }
            const matched = await matchAverageLevels(result, form.elements.match.checked);
            for (const url of urls) URL.revokeObjectURL(url); urls.length = 0;
            const output = document.querySelector('#results'); output.replaceChildren();
            for (const item of matched) {
                const section = document.createElement('section'), title = document.createElement('h2'), text = document.createElement('p');
                title.textContent = VARIANTS[item.variant];
                text.textContent = `${item.summary.kickAlignedBass}/${item.summary.bassNotes} bass attacks coincide with a kick · largest bass step ${item.summary.largestBassLeap} semitones · level adjustment ${(20 * Math.log10(item.gain || 1)).toFixed(1)} dB`;
                const audio = document.createElement('audio'); audio.controls = true; audio.loop = true;
                audio.src = URL.createObjectURL(item.blob); urls.push(audio.src);
                audio.addEventListener('play', () => document.querySelectorAll('audio').forEach(other => {
                    if (other !== audio && !other.paused) { audio.currentTime = Math.min(other.currentTime, Number.isFinite(audio.duration) ? audio.duration : other.currentTime); other.pause(); }
                }));
                const save = document.createElement('a'); save.href = audio.src; save.download = `${options.preset}-${options.seed}-${item.variant}.wav`; save.textContent = 'Save WAV';
                const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', `${VARIANTS[item.variant]} note map`); drawNotes(canvas, item, options.parts);
                section.append(title, text, audio, save, canvas); output.append(section);
            }
            status.textContent = `Ready: ${options.bars} bars per version, seed ${options.seed}. Switching players keeps the listening position.`;
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    });
}
