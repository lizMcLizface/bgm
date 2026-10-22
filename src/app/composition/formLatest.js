import { seeded, weighted } from '../random';
import { sectionShape, shapeSectionSettings, shapeSectionNotes } from './sectionShape';
import { formStrategy, strategyDuration, strategyDestination, developmentCurves } from './formStrategies';
import PROGRESSIONS from '../progressions';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const random = (seed, index) => seeded(Math.imul(seed ^ 0x243f6a88, 1664525) ^ Math.imul(index + 1, 1013904223));

// Decide the destination on entry, so the closing phrase can prepare it.
function destination(type, history, rng, quickIntro) {
    if (type === 'intro') return quickIntro ? 'full' : 'build';
    if (type === 'build') return 'full';
    if (type === 'breakdown') return 'full';
    const recentBreak = history.slice(-2).includes('breakdown');
    if (history.at(-1) === 'full') return 'breakdown';
    return weighted(rng, recentBreak ? { full: 1, build: .25, breakdown: .1 } : { full: .35, breakdown: 1, build: .2 });
}

/**
 * A section ended early (Generator.nextSectionNow, cut: { start, at }): the form as it reaches
 * `bar`, with the section starting at cut.start lasting only until cut.at.
 */
export function cutForm(form, bar, cut) {
    if (!cut || bar !== cut.at || form?.section?.start !== cut.start || bar >= form.section.start + form.section.bars) return form;
    return { ...form, section: { ...form.section, bars: bar - form.section.start } };
}

/** Small serialisable section plan; no dependency on drum presence or RNG traversal. */
export function planForm({ bar, seed, sections, previous, barsPerChord = 1, barsLeftInChord = 1, settings, previousTheme = 0, developSections = false, formStrategies = false, sectionCurves = false, strategyOverride }) {
    if (!sections || sections.mode === 'off') return null;
    // Live edits commit at the same four-bar boundaries as phrase decisions.
    if (bar % 4 !== 0) return previous ?? null;
    const profile=formStrategies||sectionCurves?formStrategy(settings,strategyOverride):null;
    const signature = `${seed}/${sections.mode}/${sections.phrases}/${!!sections.quickIntro}/${barsPerChord}${developSections?'/shapes':''}${profile?`/${!!formStrategies}/${!!sectionCurves}/${profile}`:''}`;
    let section = previous?.signature === signature ? previous.section : null;
    if (!section || bar >= section.start + section.bars) {
        const history = section ? [...section.history, section.type].slice(formStrategies?-8:-4) : [];
        const index = section ? section.index + 1 : 0;
        const rng = random(seed, index);
        const type = section?.nextType ?? (bar === 0 ? 'intro' : 'build');
        const rhythmic = (settings.bassWeights?.drive ?? 0) > (settings.bassWeights?.whole ?? 0)
            || (settings.padWeights?.sequence ?? 0) > (settings.padWeights?.sustain ?? 0);
        const strategy = profile ?? (rhythmic ? 'ostinato' : (settings.leadDensity ?? 0) < .25 ? 'gradual' : 'thematic');
        const base = Math.max(1, sections.phrases || 4);
        const multiplier = type === 'intro' ? .5 : type === 'build' ? (rng() < .5 ? .5 : 1)
            : type === 'breakdown' ? (strategy === 'gradual' ? 1 : .5) : (rng() < .45 ? 1.5 : 1);
        let bars = sections.quickIntro && type === 'intro' ? 4 : Math.max(4, Math.round(base * multiplier) * 4);
        if(formStrategies&&!(sections.quickIntro&&type==='intro'))bars=strategyDuration({strategy,type,base,bar,barsPerChord,settings,rng});
        // Prefer a chord entrance; bounded alignment keeps the phrase grid intact.
        if (!(sections.quickIntro && type === 'intro')) {
            const offset = barsPerChord - barsLeftInChord;
            for (let extra = 0; extra < barsPerChord * 4; extra += 4) {
                if ((offset + bars + extra) % barsPerChord === 0) { bars += extra; break; }
            }
        }
        const nextType = formStrategies?strategyDestination({type,strategy,history,bar,bars,base,theme:previousTheme,rng,quickIntro:sections.quickIntro})
            :destination(type, history, rng, sections.quickIntro);
        const brightnessOf = { intro: .1, build: .45, full: 1, breakdown: .3 };
        const brightnessStart = section?.brightnessEnd ?? brightnessOf[type];
        section = { type, start: bar, bars, index, history, strategy, form: true,
            ...(formStrategies?{developed:true,orchestration:['foreground','interlock','held'][index%3],readiness:(bar+bars)%(barsPerChord*(PROGRESSIONS[settings.progression]?.length??4))===0?'reference cycle entrance':'chord entrance'}:{}),
            ...(sectionCurves?{curves:true}:{}),
            ...(developSections?{shaped:true,prepareBars:strategy==='gradual'&&bars>=16?8:4}:{}),
            returning: type === 'full' && history.length > 0 && history.at(-1) !== 'full',
            themeId: type === 'breakdown' ? previousTheme : 0,
            nextType, brightnessStart, brightnessEnd: brightnessOf[nextType] };
    }
    return { signature, section };
}

export function formEnvelope(form, bar, mode) {
    if (!form) return null;
    const s = form.section, strong = mode === 'strong';
    const progress = clamp((bar - s.start) / Math.max(1, s.bars - 1), 0, 1);
    const smooth = progress * progress * (3 - 2 * progress);
    const range = s.type === 'intro' ? [strong ? .42 : .7, .82] : s.type === 'build' ? [.78, 1]
        : s.type === 'breakdown' ? [strong ? .67 : .82, strong ? .57 : .76] : [.98, .92];
    const curves=s.curves?developmentCurves({...s,progress}):null;
    const energy = (range[0] + (range[1] - range[0]) * smooth)*(curves?.energy??1);
    const preparing = bar >= s.start + s.bars - (s.prepareBars??4);
    const transition = preparing ? (s.nextType === 'breakdown' ? 'release' : s.nextType === 'full' ? 'arrival' : 'gather') : null;
    return { ...s, progress, energy, brightness: s.brightnessStart + (s.brightnessEnd - s.brightnessStart) * smooth, transition,
        ...(s.shaped||curves?{motion:{...sectionShape({...s,progress}),...(curves??{})}}:{}),
        leadActivity: s.type === 'intro' ? (strong ? 0 : .4) : s.type === 'build' ? .8 : s.type === 'breakdown' ? .8 : 1 };
}

export function formSettings(settings, section) {
    if(section.motion)settings=shapeSectionSettings(settings,section.motion);
    if(section.developed&&section.returning){
        const held=section.orchestration==='held',interlock=section.orchestration==='interlock';
        const weights=(w,keys)=>Object.fromEntries(Object.entries(w??{}).map(([k,v])=>[k,v*(keys.includes(k)?held?1.5:interlock?.8:1:held?.7:interlock?1.35:1)]));
        settings={...settings,padWeights:weights(settings.padWeights,['sustain','rolled','stacked']),bassWeights:weights(settings.bassWeights,['whole','half'])};
    }
    if(section.curves){
        const m=section.motion;
        settings={...settings,padMotion:{...settings.padMotion,fast:(settings.padMotion?.fast??0)*Math.min(1,m.subdivision)},
            pulseWeights:Object.fromEntries(Object.entries(settings.pulseWeights??{}).map(([k,v])=>[k,v*(k==='groups'?2-m.subdivision:m.subdivision)])),
            counter:{...settings.counter,activity:(settings.counter?.activity??0)*m.counterLevel}};
    }
    return { ...settings, sections: { ...settings.sections, mode: 'off' },
        leadActivity: settings.leadActivity * section.leadActivity };
}

/** Keep musical space in a breakdown without discarding the retained theme. */
export function shapeFormNotes(notes, section, index, strong, protectedBeats=[]) {
    if(section?.motion)notes=shapeSectionNotes(notes,section.motion,index,protectedBeats);
    if (section?.type !== 'breakdown') return notes;
    const stride = strong ? 3 : 2;
    const keep=(n,i)=>i%stride===0||protectedBeats.includes(n.beat);
    return notes.filter(keep).map(note => {
        const next = notes.find((n,i) => n.beat > note.beat && keep(n,i));
        return { ...note, length: next ? next.beat - note.beat : note.length,
            accent: note.accent || index === 0 };
    });
}
