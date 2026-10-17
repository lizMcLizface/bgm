import React, { useEffect, useState } from 'react';
import { CHAPTERS, RULES, compileRules } from './model';
import { baseSettings } from './session';
import RuleCard from './RuleCard';
import { RULE_ROWS, initialPages, pageTitle, pageRole, pageRules } from './navigation';
import { readPref, writePref } from '../prefs';
import './embedded.css';

export default function Rulebook({ generator, settings, book, onChoice, preset, stage = 0, pageControls = {}, focusRule }) {
    const [open, setOpen] = useState(false);
    const [chapter, setChapter] = useState('melody');
    const [pages, setPages] = useState(() => initialPages(readPref('bgm-rulebook-pages-v2', null), readPref('bgm-rulebook-pages-v1', null), stage));
    useEffect(() => { setPages(previous => initialPages(previous, null, stage)); }, [stage]);
    const reveal = id => { setPages(previous => { const next = [...new Set([...previous, id])]; writePref('bgm-rulebook-pages-v2', next); return next; }); setChapter(id); };

    useEffect(() => {
        if (!focusRule) return;
        if (focusRule.reset) {
            const initial = initialPages(null, null, 0);
            setOpen(false); setChapter('melody'); setPages(initial);
            writePref('bgm-rulebook-pages-v2', initial);
            return;
        }
        const rule = RULES.find(r => r.id === focusRule.id);
        const page = focusRule.page ?? rule?.chapter;
        if (!page) return;
        setOpen(true); reveal(page);
        if (!rule) return;
        const frame = requestAnimationFrame(() => document.getElementById(`rule-${rule.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        return () => cancelAnimationFrame(frame);
    }, [focusRule]);
    const base = baseSettings(settings, book), compiled = compileRules(base, book.rules, book.inherited);
    const current = CHAPTERS.find(c => c.id === chapter);

    return <section className="gen-rulebook" data-tour="rulebook">
        <button className="embedded-book-toggle" aria-expanded={open} aria-controls="embedded-rulebook" onClick={() => setOpen(v => !v)}>
            <span><strong>The Rules</strong></span><span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
        {open && <div id="embedded-rulebook" data-rule-role={pageRole(chapter)}>
            <nav className="embedded-book-chapters" aria-label="Rulebook pages">
                {RULE_ROWS.map(row => <div key={row.id} className="embedded-book-row" role="group" aria-label={row.title}>
                    <strong>{row.title}</strong><div>{row.pages.map(id => { const c = CHAPTERS.find(c => c.id === id), revealed = pages.includes(id); return <button key={id} data-rule-role={pageRole(id)} className={revealed ? '' : 'embedded-book-unlock'} aria-current={chapter === id ? 'page' : undefined} onClick={() => reveal(id)}>{revealed ? '' : '+ '}{pageTitle(c)}</button>; })}</div>
                </div>)}
            </nav>
            <div className="embedded-book-intro"><h2>{pageTitle(current)}</h2><p>{current.intro}</p><p>{preset || 'Your current settings'} · Rules apply to upcoming music; a phrase in progress can finish. Unopened pages still take part in generation.</p></div>
            <div className="embedded-book-layout">
                <div className="embedded-book-rules">
                    {pageRules(chapter).map(rule => <RuleCard key={rule.id} rule={rule} base={base} compiled={compiled} onChoice={onChoice}/>)}
                    {pageControls[chapter] && (['melody', 'ensemble', 'pad', 'bass', 'form', 'ambient-dynamics'].includes(chapter) ? pageControls[chapter] : <section className="embedded-book-controls" aria-label={`${pageTitle(current)} parameters`}><h3>{['pad', 'bass'].includes(chapter) ? 'Playing rules' : 'Parameters'}</h3>{['pad', 'bass'].includes(chapter) && <p className="gen-hint">Style weights are relative shares of phrases. Zero excludes a style; patterns apply when their style is chosen.</p>}{pageControls[chapter]}</section>)}
                </div>

            </div>
        </div>}
    </section>;
}
