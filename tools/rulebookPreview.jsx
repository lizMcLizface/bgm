import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Generator,{ROLES} from '../src/app/Generator';
import {SCENES,sceneSettings,sceneSlug} from '../src/app/scenes';
import {CHAPTERS,RULES,compileRules,ruleState,choicesFromSearch,bookSearch,muteFromSearch} from '../src/app/rulebook/model';
import {explainBar} from '../src/app/rulebook/explain';
import {readPref,writePref} from '../src/app/prefs';
import {masterBus} from '../src/audio/bus';
import Backdrop,{BACKDROP_DEFAULTS} from '../src/app/Backdrop';
import './rulebook.css';
import RuleCard from '../src/app/rulebook/RuleCard';

const query=new URLSearchParams(location.search),scenes=SCENES;
const initialScene=scenes.find(s=>sceneSlug(s.name)===query.get('preset'))??scenes.find(s=>sceneSlug(s.name)==='rainy-cafe');
const initialSeed=Math.max(0,Math.min(2147483647,Math.floor(Number(query.get('seed')??42)||0)));
const initialBase=sceneSettings(initialScene,initialSeed),initialChoices=choicesFromSearch(location.search);
initialBase.muted={...initialBase.muted,...muteFromSearch(location.search)};
const generator=new Generator(JSON.parse(JSON.stringify(initialBase)));generator.rulebookTrace=true;
for(const [role,sound]of Object.entries(initialScene.voices??{})){
    if(typeof sound==='string')generator.loadRolePreset(role,sound);else if(sound)generator.loadRolePreset(role,sound.name,sound.synth);
}
const flagKeys=[...new Set(RULES.flatMap(r=>r.flags??[]))];
function applyCompiled(compiled){
    let changed=false;for(const key of flagKeys){if(generator[key]!==compiled.flags[key])changed=true;generator[key]=compiled.flags[key];}
    const patch=Object.fromEntries(Object.entries(compiled.settings).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(generator.settings[k])));
    if(Object.keys(patch).length)generator.setMany(patch);
    if(changed)generator.replan([]);
}
applyCompiled(compileRules(initialBase,initialChoices));generator.reset();
if(import.meta.env.DEV)window.__rulebook={generator,compileRules,RULES};
if(import.meta.hot)import.meta.hot.dispose(()=>generator.stopAll());

const count=CHAPTERS.length;
const initialOpen=()=>{
    if(query.get('pages')==='all')return count-1;
    const saved=readPref('bgm-rulebook-pages-v1',readPref('bgm-stage-v2',0));
    return Number.isInteger(saved)?Math.max(0,Math.min(count-1,saved)):0;
};

function Rulebook(){
    const [scene,setScene]=useState(initialScene),[base,setBase]=useState(initialBase),[choices,setChoices]=useState(initialChoices);
    const [unlocked,setUnlocked]=useState(initialOpen),[chapter,setChapter]=useState(()=>{const n=CHAPTERS.findIndex(c=>c.id===query.get('page'));return n>=0&&n<=initialOpen()?n:0;});
    const [running,setRunning]=useState(false),[plan,setPlan]=useState(generator.getPlan()),[heard,setHeard]=useState(0);
    const [hover,setHover]=useState(null),[pinned,setPinned]=useState(null),[notice,setNotice]=useState('');
    const [fluid,setFluid]=useState(false),[volume,setVolume]=useState(()=>readPref('bgm-volume',1));
    const compiled=compileRules(base,choices),current=CHAPTERS[chapter],rules=RULES.filter(r=>r.chapter===current.id);
    const selected=(hover===null?null:plan.find(b=>b.bar===hover))??pinned??plan.find(b=>b.bar===heard)??plan[0];
    const reasons=explainBar(selected),overrides=RULES.map(r=>({rule:r,...ruleState(r,compiled)})).filter(r=>r.status==='Overridden');
    useEffect(()=>{const refresh=()=>{setRunning(generator.anyRunning);setHeard(Math.max(0,Math.floor(generator.position()/generator.beatsPerBar)));setPlan(generator.getPlan());};const timer=setInterval(refresh,200);const off=generator.onPlanChange(refresh),offRunning=generator.onRunningChange(refresh);refresh();return()=>{clearInterval(timer);off();offRunning();generator.stopAll();};},[]);
    useEffect(()=>{masterBus.gain.setTargetAtTime(volume,generator.AC.currentTime,.02);},[volume]);
    useEffect(()=>{const q=new URLSearchParams(bookSearch({preset:sceneSlug(scene.name),seed:base.seed,choices,muted:base.muted}));q.set('page',current.id);if(query.get('pages')==='all')q.set('pages','all');history.replaceState(null,'',location.pathname+'?'+q);},[scene,base.seed,base.muted,choices,current.id]);
    const showError=error=>setNotice(error.message??String(error));
    const changeChoices=next=>{
        const nextCompiled=compileRules(base,next),wasRunning=generator.anyRunning;applyCompiled(nextCompiled);setChoices(nextCompiled.choices);setHover(null);setPinned(null);
        if(wasRunning){if(!nextCompiled.settings.playMusic&&generator.isRunning)generator.stop();else if(nextCompiled.settings.playMusic&&!generator.isRunning)generator.start().catch(showError);
            if(!nextCompiled.settings.playAmbience)generator.stopAmbience();else if(!generator.ambienceRunning)generator.startAmbience().catch(showError);}
    };
    const choose=(id,choice)=>{const next={...choices};if(choice===null)delete next[id];else next[id]=choice;changeChoices(next);};
    const pickScene=async slug=>{
        const next=scenes.find(s=>sceneSlug(s.name)===slug);if(!next)return;const play=generator.anyRunning;generator.stopAll();
        const settings=sceneSettings(next,base.seed);for(const key of flagKeys)generator[key]=undefined;
        generator.setMany(JSON.parse(JSON.stringify(settings)));for(const role of Object.keys(ROLES)){const sound=next.voices?.[role];if(typeof sound==='string')generator.loadRolePreset(role,sound);else if(sound)generator.loadRolePreset(role,sound.name,sound.synth);else generator.loadRolePreset(role,ROLES[role].preset);}
        generator.reset();setScene(next);setBase(settings);setChoices({});setPinned(null);setHover(null);setNotice('');if(play){if(settings.playMusic)await generator.start();if(settings.playAmbience)await generator.startAmbience();}
    };
    const unlock=()=>{const next=Math.min(count-1,unlocked+1);setUnlocked(next);setChapter(next);writePref('bgm-rulebook-pages-v1',next);};
    const openRule=id=>{const rule=RULES.find(r=>r.id===id);if(!rule)return;const at=CHAPTERS.findIndex(c=>c.id===rule.chapter);
        if(at>unlocked){setNotice(`“${rule.title}” is on the ${CHAPTERS[at].title} page. Its explanation is available here; open more pages to edit its permission.`);return;}
        setChapter(at);requestAnimationFrame(()=>document.getElementById(`rule-${id}`)?.scrollIntoView({behavior:'smooth',block:'center'}));
    };
    const toggle=async()=>{if(generator.anyRunning)generator.stopAll();else{if(compiled.settings.playMusic)await generator.start();if(compiled.settings.playAmbience)await generator.startAmbience();if(!compiled.settings.playMusic&&!compiled.settings.playAmbience)setNotice('Music and ambience are both off. Allow either on the Listening page to hear it.');}};
    const bars=plan.filter(b=>b.bar>=Math.max(0,heard-1)).slice(0,8);
    return <main className="rulebook">
        {fluid&&<Backdrop generator={generator} options={BACKDROP_DEFAULTS}/>}
        <header className="book-transport"><a className="book-brand" href="/">calm<b>bgm</b><span>THE RULEBOOK</span></a><button className="book-play" onClick={()=>toggle().catch(showError)} aria-label={running?'Pause soundscape':'Play soundscape'}>{running?'Ⅱ Pause':'▶ Play'}</button>
            <label className="book-preset"><span>Soundscape</span><select aria-label="Soundscape" value={sceneSlug(scene.name)} onChange={e=>pickScene(e.target.value).catch(showError)}>{scenes.map(s=><option value={sceneSlug(s.name)} key={s.name}>{s.name}</option>)}</select></label>
            <label className="book-volume">Volume<input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label><span className="book-preview">Design preview</span>
        </header>
        <div className="book-layout"><nav className="book-contents" aria-label="Rulebook pages"><p className="book-eyebrow">CONTENTS</p><p className="book-nav-note">Open a page.<br/>Explore a little further.</p>
            {CHAPTERS.map((c,i)=><button key={c.id} className={chapter===i?'is-current':''} disabled={i>unlocked} aria-current={chapter===i?'page':undefined} onClick={()=>setChapter(i)}><span>{String(i+1).padStart(2,'0')}</span>{c.title}<small>{i>unlocked?'Locked':RULES.filter(r=>r.chapter===c.id).length+' rules'}</small></button>)}
            <div className="book-unlock-note"><strong>The music already uses the whole book.</strong><p>Opening pages reveals choices. It never limits what a preset can do.</p></div>
            {unlocked<count-1&&<><button className="book-unlock" onClick={unlock}>Open {CHAPTERS[unlocked+1].title} →</button><button className="book-text-button" onClick={()=>{setUnlocked(count-1);writePref('bgm-rulebook-pages-v1',count-1);}}>Open every page</button></>}
            <a className="book-back" href="/">Back to the current interface ↗</a>
        </nav>
        <div className="book-paper"><div className="book-chapter-heading"><p className="book-eyebrow">CHAPTER {String(chapter+1).padStart(2,'0')} / {count}</p><h1>{current.title}</h1><p>{current.intro}</p><div className="book-caption"><span>{scene.name}{Object.keys(choices).length?' · your variation':''}</span><button className="book-text-button" disabled={!Object.keys(choices).length} onClick={()=>changeChoices({})}>Restore preset rules</button></div></div>
            <section className="book-score" aria-label="Planned chords"><div><h2>A few bars ahead</h2><p>Hover or focus to read. Select a bar to keep its explanation.</p></div><div className="book-chords">{bars.map(b=><button key={b.bar} aria-label={`Bar ${b.bar+1}: ${b.chord.name}`} aria-pressed={pinned?.bar===b.bar} className={`${heard===b.bar?'is-playing':''} ${selected?.bar===b.bar?'is-inspected':''}`} onMouseEnter={()=>setHover(b.bar)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(b.bar)} onBlur={()=>setHover(null)} onClick={()=>{setPinned(b);setHover(null);if(window.matchMedia('(max-width:1150px)').matches)requestAnimationFrame(()=>document.querySelector('.book-inspector').scrollIntoView({behavior:'smooth',block:'start'}));}}><span>{b.bar+1}</span><strong>{b.chord.name}</strong><small>{b.chord.provenance?.borrowed?'borrowed':b.chord.cadence?.kind==='bridge'?'bridge':b.chord.numeral}</small></button>)}</div></section>
            <div className="book-priority"><strong>Explicit choices come first.</strong><span>{!compiled.settings.playMusic?'Music is off.':compiled.settings.leadActivity===0?'Lead activity is zero.':compiled.settings.counter.mode==='off'?'The second lead is off.':'The preset’s voice and scale choices still apply.'} {overrides.length?`${overrides.length} allowed ${overrides.length===1?'rule is':'rules are'} currently overridden.`:'Rules act where their conditions fit.'}</span><span>Changes shape upcoming music. A phrase already in progress can finish.</span></div>
            <section className="book-rules" aria-label={`${current.title} rules`}>{rules.map(rule=><RuleCard key={rule.id} rule={rule} compiled={compiled} base={base} onChoice={choose}/>)}
                {current.id==='listen'&&<article className="book-rule book-fluid"><p className="book-eyebrow">A WINDOW INTO THE MUSIC</p><h3>See the sound move</h3><p>Short notes make quick trails. Held notes make broader plumes. Harmony and ambience shape the colour and motion.</p><button className="book-secondary" aria-pressed={fluid} onClick={()=>setFluid(!fluid)}>{fluid?'Hide the fluid':'Show the fluid'}</button></article>}
            </section>
            <section className="book-overrides" aria-label="Voice overrides"><div><h2>Voice overrides</h2><p>Muting changes what you hear. Its notes and rules remain in the plan.</p></div><div>{Object.keys(generator.roles).map(role=><button key={role} aria-label={`${compiled.settings.muted[role]?'Unmute':'Mute'} ${role}`} aria-pressed={compiled.settings.muted[role]} onClick={()=>{const next={...base,muted:{...base.muted,[role]:!compiled.settings.muted[role]}};setBase(next);applyCompiled(compileRules(next,choices));}}>{role==='perc'?'Drums':role[0].toUpperCase()+role.slice(1)} {compiled.settings.muted[role]?'· muted':'· audible'}</button>)}</div></section>
            <footer className="book-page-foot"><span>{String(chapter+1).padStart(2,'0')} — {current.title}</span>{chapter<unlocked?<button className="book-text-button" onClick={()=>setChapter(chapter+1)}>Next page →</button>:unlocked<count-1?<button className="book-text-button" onClick={unlock}>Open the next page →</button>:<span>The whole book is open.</span>}</footer>
        </div>
        <aside className="book-inspector" aria-label="Why this chord"><p className="book-eyebrow">WHY THIS CHORD?</p><div className="book-inspector-heading"><div><small>{hover!==null?'Previewing':pinned?'Selected':'Following'} bar {(selected?.bar??0)+1}</small><h2>{selected?.chord.name??'—'}</h2><p>{selected?.chord.keyName}</p></div><button className="book-text-button" onClick={()=>{setPinned(null);setHover(null);}}>Follow playback</button></div>
            <ol>{reasons.map((reason,i)=><li key={i} className={`reason-${reason.kind}`}><span className="book-reason-kind">{reason.kind==='override'?'TAKES PRIORITY':reason.kind==='context'?'CONTEXT':'RECORDED DECISION'}</span><h3>{reason.title}</h3><p>{reason.text}</p>{RULES.some(r=>r.id===reason.rule)&&<button className="book-text-button" onClick={()=>openRule(reason.rule)}>View this rule →</button>}</li>)}</ol><p className="book-inspector-note">An allowed rule is a possibility. These explanations describe decisions recorded for this bar.</p>
        </aside></div>
        {notice&&<div className="book-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice('')}>×</button></div>}
    </main>;
}
createRoot(document.getElementById('root')).render(<Rulebook/>);
