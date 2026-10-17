import {isUnsettlingProgression} from '../progressions';
import { DRUM_STYLES } from '../percussion';
// Stable rule identifiers and a reversible adapter over the current generator.
// Page visibility never enters compilation: presets use the whole rulebook.
export const CHAPTERS = [
    ['listen','Listening','Start with a soundscape. Decide what you want to hear.'],
    ['ensemble','The ensemble','Give each voice room and a role in the conversation.'],
    ['melody','Melodic ideas','Keep an idea, develop it and give it somewhere to land.'],
    ['rhythm','Rhythm & space','Share a pulse without filling every available moment.'],
    ['harmony','Harmonic colour','Choose the notes that belong, and when to step outside.'],
    ['performance','The performance','Let the playing breathe on a small scale.'],
    ['form','The long view','Shape how the piece develops across several sections.'],
    ['evolution','Slow evolution','Let the musical home and the sound move over time.'],
    ['pad','Rhythm / pad','Choose how the supporting chords are played, patterned and voiced.'],
    ['bass','Bass / support','Choose the bass’s rhythmic vocabulary and register.'],
    ['percussion','Percussion patterns','Choose a groove and how it varies around its anchors.'],
    ['melodic-composition','Melodic development','Retain an idea, plan its phrases and shape a longer conversation.'],
    ['duet','Voice dialogue','Coordinate the two melodic voices without forcing them to move together.'],
    ['ambient-dynamics','Ambient dynamics','Let the ambient bed breathe around the levels set in the mixer.'],
].map(([id,title,intro],index)=>({id,title,intro,index}));
const flag=(id,chapter,title,description,flags,extra={})=>({id,chapter,title,description,flags:[flags].flat(),...extra});
const setting=(id,chapter,title,description,path,off,on,extra={})=>({id,chapter,title,description,path,off,on,...extra});
export const RULES=[
    setting('music','listen','Generate music','Let the instruments play the generated piece.','playMusic',false,true),
    setting('ambience','listen','Play an ambient bed','Keep rain, wind and other preset layers around the music.','playAmbience',false,true),
    setting('second-lead','ensemble','Invite a second lead','Let another melodic voice answer or accompany the foreground.','counter.mode','off','answer',{role:'counter',options:['off','answer','line','harmony']}),
    flag('duet-dialogue','duet','Let the two leads converse','Retain, answer and exchange ideas between independent melodic voices.','duetInteraction',{needs:'counter',role:'counter'}),
    flag('joint-counterpoint','duet','Consider both lines together','Choose pitches with attention to crossings, spacing and held clashes.','jointCounterpoint',{needs:'counter',role:'counter'}),
    setting('lead-presence','melody','Make room for the lead','Choose how often a phrase contains a lead. Zero explicitly leaves it out.','leadActivity',0,.6,{role:'lead',parameter:{min:0,max:1,step:.05,unit:'%',label:'Lead presence'}}),
    setting('backing-space','pad','Leave space under the lead','Thin suitable rhythmic pad patterns while the lead is active; held pads keep their character.','thinPadUnderLead',false,true,{role:'pad'}),
    flag('motif-development','melodic-composition','Develop a remembered idea','Sequence, stretch or fragment a retained motif instead of replacing it each bar.','themeDevelopment',{role:'lead'}),
    flag('phrase-planning','melodic-composition','Think across a phrase','Choose a connected pitch path over the harmony already known.','phraseSearch',{role:'lead'}),
    flag('melodic-grammar','melodic-composition','Phrase with gaps and holds','Allow bounded pickups, breathing gaps and connected repeated notes.','rhythmGrammar',{role:'lead'}),
    flag('long-phrases','melodic-composition','Allow a longer thought','Let phrase planning choose an eight-bar span when the material suits it. Off keeps four-bar planning.','longPhrases',{role:'lead'}),
    flag('phrase-contrast','melodic-composition','Contrast successive phrases','Vary register, density and shape across a question, answer or return.','contrastPhrases',{role:'lead'}),
    setting('lead-busyness','melody','Allow shorter note values','Raise the share of quicker rhythms without requiring the lead to play in every phrase.','leadDensity',0,.35,{role:'lead',parameter:{min:0,max:1,step:.05,unit:'%',label:'Rhythmic detail'}}),
    setting('repeat-a-phrase','melody','Prefer a familiar idea','Favour retained melodic material over contrast. Original generation can repeat the previous active phrase’s tune.','leadRepeat',0,.3,{role:'lead',parameter:{min:0,max:1,step:.05,unit:'%',label:'Repeat chance'}}),
    flag('note-resolution','melodic-composition','Resolve melodic tension','Plan a step away from a non-chord tone when a suitable landing is available.','noteResolution',{role:'lead',needs:'phrase'}),
    flag('shared-rhythm','rhythm','Share a reference pulse','Coordinate bass, percussion and supporting parts around common accents.','ensembleCoordination'),
    flag('groove-development','rhythm','Let the groove evolve','Keep rhythmic anchors while varying a limited number of weak slots.','rhythmDevelopment',{needs:'coordination'}),
    flag('backing-breath','rhythm','Give the backing breathing room','Shape rhythmic accompaniment and independent counter lines without thinning held pads.','partRhythmGrammar',{needs:'coordination'}),
    setting('percussion-presence','percussion','Invite percussion','Choose a drum style. Individual drum switches and the percussion mute still take priority.','drums.style','off','brushes',{role:'perc',options:Object.keys(DRUM_STYLES)}),
    setting('percussion-activity','percussion','Add drum ornaments','Allow extra hits and fills around the style’s rhythmic anchors. Zero keeps the anchors.','drums.activity',0,.6,{role:'perc',needs:'percussion',parameter:{min:0,max:1,step:.05,unit:'%',label:'Extra drum activity'}}),
    setting('percussion-variation','percussion','Vary the drum pattern','Allow the selected drum style to change its ornaments and fills.','drums.variation',0,.35,{role:'perc',needs:'percussion',parameter:{min:0,max:1,step:.05,unit:'%',label:'Pattern variation'}}),
    setting('swing','performance','Swing the pulse','Delay suitable offbeat notes while preserving the bar’s length.','swing',0,.2,{parameter:{min:0,max:.6,step:.01,unit:'%',label:'Swing amount'}}),
    setting('harmonic-language','harmony','Choose a different tonal language','Use chromatic pitch sets without a home chord, or put the melodic voices in a second key above the backing.','tonality.mode','tonal','atonal',{options:['tonal','atonal','bitonal']}),
    setting('borrowed-chords','harmony','Borrow a chord','Allow eligible chords from the parallel major or minor while keeping the melodic scale.','chordBorrow',0,.25,{parameter:{min:0,max:1,step:.05,unit:'%',label:'Chance of borrowing'}}),
    setting('chord-colour','harmony','Colour the chords','Use suspended or added-note colours where the preset permits them.','chordColour.mode','plain','add9',{options:['plain','sus2','sus4','floating','add9','add6','flat2','major7']}),
    setting('pentatonic-melody','harmony','Keep the melody pentatonic','Restrict melodic notes to five notes of the scale. Harmony can use its parent scale.','leadScale','full','pentatonic',{role:'lead'}),
    setting('harmonic-parent','harmony','Give harmony its own scale','Use automatic parent harmony for familiar pentatonic modes, or choose major or minor harmony.','harmonyScale','selected','auto',{options:['selected','auto','major','minor']}),
    setting('human-timing','performance','Vary timing slightly','Related attacks share a small timing movement, with smaller individual differences.','humanize.timing',0,12,{parameter:{min:0,max:40,step:1,unit:'ms',label:'Timing variation'}}),
    setting('human-dynamics','performance','Vary how strongly notes are played','Add correlated phrase expression and restrained individual variation.','humanize.velocity',0,.08,{parameter:{min:0,max:.25,step:.01,unit:'%',label:'Dynamic variation'}}),
    flag('melodic-slides','performance','Let melodic pitch meander','A slow, gentle pitch contour continues through lead and second-lead note changes instead of scooping into each note. Starts off; follows its own continuous musical clock.','noteSlides',{defaultOn:false}),
    flag('held-pad-glides','pad','Glide held chords without new attacks','Connect long, nearly adjacent notes on sustaining synth pads. Common tones hold; nearby tones glide across changes. Rests, short patterns, acoustic decays and section boundaries keep separate attacks. Starts off.','heldPadGlides',{defaultOn:false,role:'pad'}),
    flag('held-bass-glides','bass','Glide a held bass between roots','Connect long bass notes on sustaining sounds such as Dark Drone with one attack and slow pitch changes. Short bass patterns and rests retain their attacks. Starts off.','heldBassGlides',{defaultOn:false,role:'bass'}),
    flag('pad-pitch-motion','pad','Let rhythm pitch meander','Carry a slow pitch contour through arpeggios and chord changes. Simultaneous chord tones move together; attacks and long tails keep their shape. Starts off.','padPitchMotion',{defaultOn:false,role:'pad'}),
    flag('bass-pitch-motion','bass','Let bass pitch meander','Carry gentle pitch motion across bass notes, including sustained pad-like sounds. Starts off.','bassPitchMotion',{defaultOn:false,role:'bass'}),
    flag('chord-slides','pad','Let one chord tone slide','Glide one changing tone into the next chord while other tones keep their pitches. This starts off; use it for haunted or deliberately unsettled music.','chordSlides',{defaultOn:false,role:'pad'}),
    flag('tempo-effects','performance','Link echoes and motion to the beat','Snap active delays, tremolo, auto-pan and filter motion to nearby felt-beat divisions. Patch times and rates remain saved; Off restores free timing. This starts off.','tempoEffects',{defaultOn:false}),
    flag('gate-envelopes','performance','Fit envelopes to short notes','Shorten excessive decay and release for short oscillator notes; long holds retain their release. Piano, plucked and chip envelopes keep their character. Off preserves the patch’s longer tails; this starts off.','gateEnvelopes',{defaultOn:false}),
    flag('note-connection','performance','Connect stepwise wind phrases','Nearby stepwise lead and second-lead wind notes use a quicker, softer onset and their full written gate. Rests, repeated notes and larger leaps keep separate attacks.','noteConnection'),
    flag('held-expression','performance','Let held wind notes breathe','Held lead and second-lead wind notes swell gently and develop delayed vibrato. Existing patch vibrato takes priority; written notes and lengths stay the same.','heldExpression'),
    flag('note-articulation','performance','Shape each note’s articulation','Let note length, dynamics and sound family shape its onset, release and tone. Held notes keep their written span; chip/classic voices keep their existing character.','noteExpression'),
    flag('phrase-expression','performance','Perform a phrase as a whole','Give a phrase a connected dynamic contour and shared timing movement rather than only independent note jitter.','phrasePerformance',{needs:'coordination'}),
    flag('instrument-groove','performance','Give instruments their own feel','Let voices interpret the shared pulse according to their sound and role.','instrumentGroove',{needs:'coordination'}),
    setting('pitch-wander','performance','Let tuning wander slowly','Move tuning smoothly around its centre for the voices enabled by the preset.','wander.pitch',0,5,{parameter:{min:0,max:30,step:1,unit:'cents',label:'Pitch depth'}}),
    setting('sections','form','Develop through sections','Use intro, build, full and breakdown to shape the piece over time.','sections.mode','off','gentle',{options:['off','gentle','strong']}),
    flag('form-strategies','form','Choose a form for the material','Use gradual, thematic, ostinato, cinematic or speech-bed development.','formStrategies',{needs:'sections'}),
    flag('tension-curves','form','Shape tension and subdivision','Give musical tension and rhythmic detail their own curves within a section.','sectionCurves',{needs:'sections'}),
    flag('harmonic-pacing','form','Vary the harmonic pace','Vary whole-bar chord durations and allow guarded interior destinations, preserving cycle length and closing slots.',['harmonicRhythm','harmonicDevelopment'],{needs:'sections'}),
    flag('section-gestures','form','Mark a change with the backing','Use bounded accompaniment gestures around an eligible section boundary.','transitionGestures',{needs:'sections'}),
    flag('lead-transitions','form','Let the lead shape an arrival','Adapt a lead phrase around a planned section transition.','leadTransitions',{needs:'sections',role:'lead'}),
    flag('lead-pickups','form','Lead into a new section','Allow a prepared lead pickup before a section arrival when the phrase has room.','leadPickups',{needs:'sections',role:'lead'}),
    flag('shaped-endings','form','Bring the piece to rest','Prepare the final chord and release the accompaniment when an ending has been requested.','endingDevelopment'),
    flag('section-cadences','form','Prepare harmonic arrivals','Use a modal fifth and tonic on suitable section boundaries.','sectionCadences',{needs:'sections'}),
    flag('common-tone-bridges','form','Connect chords through shared notes','Choose an improving common-tone bridge into an eligible section cadence.','sectionBridges',{needs:'cadences'}),
    flag('section-suspensions','form','Carry a tone across a section change','Hold a prepared lead tone into the new harmony, then resolve it by step.','sectionSuspensions',{needs:'resolutions',role:'lead'}),
    setting('chord-colour-chance','harmony','Choose how often chords are coloured','Keep the chosen colour for this share of eligible chords.','chordColour.amount',0,.35,{needs:'colour',parameter:{min:0,max:1,step:.05,unit:'%',label:'Coloured chords'}}),
    setting('open-voicing','harmony','Spread the chord voicing','Drop the second note from the top by an octave for a more open pad voicing.','chordSpread','close','open',{role:'pad',options:['close','open']}),
    setting('bass-pedal','harmony','Hold a bass pedal','Hold the tonic or fifth while the chords above it change.','pedal.mode','off','tonic',{role:'bass',options:['off','tonic','fifth']}),
    setting('bass-pedal-chance','harmony','Choose how often to hold a pedal','Use the selected pedal note for this share of phrases.','pedal.amount',0,.5,{role:'bass',needs:'pedal',parameter:{min:0,max:1,step:.05,unit:'%',label:'Pedal phrases'}}),
    setting('lead-leaps','melody','Allow melodic leaps','Choose how strongly the lead can favour leaps over nearby steps.','leadLeaps',0,.5,{role:'lead',parameter:{min:0,max:1,step:.05,unit:'%',label:'Leap preference'}}),
    setting('open-phrase-endings','melody','Leave a phrase open','Prefer an open fifth or second to a settled chord-tone ending.','leadEnding','settled','open',{role:'lead',options:['settled','open']}),
    setting('counter-presence','ensemble','Choose second-lead activity','Choose how often an independent second lead answers or plays its own line.','counter.activity',0,.5,{role:'counter',needs:'independent-counter',parameter:{min:0,max:1,step:.05,unit:'%',label:'Second-lead activity'}}),
    setting('section-tone','form','Let sections change the tone','Darken intros and breakdowns and open the sound in full sections.','sectionTone',false,true,{needs:'sections'}),
    setting('human-detune','performance','Vary individual note tuning','Add a small tuning difference to individual attacks. Slow tuning drift stays in Wander.','humanize.detune',0,3,{parameter:{min:0,max:15,step:.5,unit:'cents',label:'Note tuning variation'}}),
    setting('percussion-sprinkle','percussion','Scatter occasional drum colours','Allow bounded crash, bell, ride and tom accents around the selected groove.','drums.sprinkle',0,.35,{role:'perc',needs:'percussion',parameter:{min:0,max:1,step:.05,unit:'%',label:'Colour accents'}}),
    setting('ambient-bed-drift','ambient-dynamics','Let the whole bed breathe','Vary the whole ambient bed around its mixer level.','ambienceWander.total',0,.08,{needs:'ambient',parameter:{min:0,max:.5,step:.01,unit:'%',label:'Whole-bed level drift'}}),
    setting('ambient-layer-drift','ambient-dynamics','Let layers breathe independently','Vary each ambient layer around the level set in the mixer.','ambienceWander.layers',0,.2,{needs:'ambient',parameter:{min:0,max:.8,step:.01,unit:'%',label:'Layer level drift'}}),
    setting('harmonic-drift','evolution','Let the musical home move','Allow the preset’s key, mode, progression and tempo drift choices.','drift.mode','off','centered',{options:['off','centered','wandering']}),
];
const get=(s,path)=>path.split('.').reduce((v,k)=>v?.[k],s);
const put=(s,path,value)=>{const parts=path.split('.'),key=parts.pop();let target=s;for(const p of parts)target=target[p];target[key]=value;};
export function cleanChoices(raw) {
    const out={};if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
    for(const rule of RULES){const entry=raw[rule.id];if(!entry||typeof entry!=='object'||typeof entry.enabled!=='boolean')continue;
        const choice={enabled:entry.enabled};
        if(rule.parameter&&Number.isFinite(entry.value)){
            const p=rule.parameter,v=Math.max(p.min,Math.min(p.max,entry.value));choice.value=Number((Math.round(v/p.step)*p.step).toFixed(4));
        }else if(rule.options?.includes(entry.value))choice.value=entry.value;
        out[rule.id]=choice;
    }return out;
}
export function compileRules(base,raw={},inherited={}) {
    inherited=cleanChoices(inherited);
    const choices=cleanChoices(raw),settings=JSON.parse(JSON.stringify(base)),flags={};
    for(const rule of RULES)if(rule.flags&&inherited[rule.id])for(const key of rule.flags)flags[key]=inherited[rule.id].enabled;
    for(const rule of RULES){const choice=choices[rule.id];if(!choice)continue;
        if(rule.flags)for(const key of rule.flags)flags[key]=choice.enabled;
        else {const original=get(base,rule.path),value=choice.enabled?(choice.value??(original!==rule.off?original:rule.on)):rule.off;put(settings,rule.path,value);}
    }return {settings,flags,choices,inherited};
}
export function ruleState(rule,compiled) {
    const {settings:s,flags}=compiled;
    const enabled=rule.flags?rule.flags.every(f=>(flags[f] ?? rule.defaultOn ?? true) !== false):get(s,rule.path)!==rule.off;
    const result={enabled,source:compiled.choices[rule.id]?'Your choice':'Preset',value:rule.path?get(s,rule.path):undefined,status:enabled?'Enabled':'Off',reason:rule.description};
    if(!enabled)return result;
    if((rule.flags||rule.id==='harmonic-parent')&&s.generation==='legacy')return {...result,status:'Unavailable',reason:'Original generation keeps its earlier algorithms. This permission is retained for Latest.'};
    if(isUnsettlingProgression(s.progression)&&['section-cadences','common-tone-bridges'].includes(rule.id))return {...result,status:'Overridden',reason:'The unresolved progression keeps tonic arrivals out. This choice is retained for tonal progressions.'};
    const nonfunctional=s.tonality?.mode==='atonal';
    if(nonfunctional&&['borrowed-chords','harmonic-parent','pentatonic-melody','bass-pedal','bass-pedal-chance','section-cadences','common-tone-bridges'].includes(rule.id))return {...result,status:'Overridden',reason:'Atonal pitch sets replace functional harmony, scale restrictions and tonic pedals. The choice is retained.'};
    const blocked=rule.needs==='colour'&&s.chordColour.mode==='plain'?'Chord colour is plain.':rule.needs==='pedal'&&s.pedal.mode==='off'?'The bass pedal is off.':rule.needs==='independent-counter'&&!['answer','line'].includes(s.counter.mode)?'This needs an independent second lead.':rule.needs==='sections'&&s.sections.mode==='off'?'Sections are off.':rule.needs==='coordination'&&flags.ensembleCoordination===false?'The shared reference pulse is off.'
        :rule.needs==='percussion'&&s.drums.style==='off'?'The percussion style is off.':rule.needs==='phrase'&&flags.phraseSearch===false?'Phrase planning is off.'
        :rule.needs==='counter'&&(s.counter.mode==='off'||s.counter.mode==='harmony')?'This rule needs an independent second lead.':rule.needs==='cadences'&&(s.sections.mode==='off'||flags.sectionCadences===false)?'Section cadences are off.'
        :rule.needs==='resolutions'&&(s.sections.mode==='off'||flags.phraseSearch===false||flags.noteResolution===false)?'This needs sections, phrase planning and note resolution.':null;
    if(blocked)return {...result,status:'Overridden',reason:blocked+' Your enabled choice is retained.'};
    if(rule.needs==='counter'&&(flags.ensembleCoordination===false||s.leadActivity===0||s.counter.activity===0||rule.id==='joint-counterpoint'&&flags.phraseSearch===false))return {...result,status:'Overridden',reason:'This needs an active lead, an active independent counter and shared coordination. Joint pitch planning also needs phrase planning.'};
    if(rule.role==='perc'&&!Object.values(s.drumKit).some(v=>v&&typeof v==='object'&&v.on&&v.level>0))return {...result,status:'Overridden',reason:'All drum sources are switched off or their levels are zero.'};
    if(['phrase-expression','instrument-groove'].includes(rule.id)&&s.humanize.timing===0&&s.humanize.velocity===0)return {...result,status:'Overridden',reason:'Timing and dynamic variation are both zero.'};
    if((rule.id==='ambience'||rule.needs==='ambient')&&(!Object.values(s.ambience).some(v=>v>0)||s.ambienceVolume===0))return {...result,status:'Overridden',reason:'The ambient layers or their master level are zero. The permission is retained.'};
    if(rule.id!=='music'&&rule.id!=='ambience'&&rule.needs!=='ambient'&&!s.playMusic)return {...result,status:'Not heard',reason:'Music playback is off. This rule is retained for when music returns.'};
    if(rule.needs==='ambient'&&!s.playAmbience)return {...result,status:'Not heard',reason:'Ambience playback is off. Its level drift is retained.'};
    if(rule.role&&s.muted?.[rule.role])return {...result,status:'Muted',reason:'This voice is still generated, but its output is muted.'};
    if(rule.role==='lead'&&s.leadActivity===0)return {...result,status:'Overridden',reason:'Lead activity is explicitly zero. This rule cannot add a lead.'};
    if(rule.id==='pitch-wander'&&!Object.values(s.wander.voices).some(Boolean))return {...result,status:'Overridden',reason:'No voices are enabled for wander.'};
    return result;
}
export function choicesFromSearch(search) {
    try{const text=new URLSearchParams(search).get('book');if(!text||text.length>12000)return {};const payload=JSON.parse(text);return payload.version===1?cleanChoices(payload.rules):{};}catch{return {};}
}
const MIX_ROLES=['lead','counter','pad','bass','perc'];
export function muteFromSearch(search) {
    const query=new URLSearchParams(search);if(!query.has('mute'))return null;
    const text=query.get('mute');if(text.length>100)return null;const names=text?text.split(','):[];
    if(names.some(n=>!MIX_ROLES.includes(n)))return null;return Object.fromEntries(MIX_ROLES.map(r=>[r,names.includes(r)]));
}
export function bookSearch({preset,seed,choices,muted}) {
    const query=new URLSearchParams({preset,seed:String(seed)}),rules=cleanChoices(choices);
    if(Object.keys(rules).length)query.set('book',JSON.stringify({version:1,rules}));
    if(muted)query.set('mute',MIX_ROLES.filter(r=>muted[r]===true).join(','));return '?'+query;
}
