import React, { useRef, useState } from 'react';
import { RULES, compileRules, ruleState } from './model';
import { baseSettings } from './session';
import './trialRules.css';

// A home for rules still being tried by ear (docs/COMPOSITION_PLAN.md): add a rule's id here while it is new, so it
// is in one place instead of hunted for across the rulebook pages, and take it out again once it has settled (it stays
// in the rulebook either way). While the list is empty the panel is not shown.
export const TRIAL_RULE_IDS = [];

const LABELS = { bank: 'Fixed', generated: 'Generated', even: 'Even', corpus: 'Corpus', always: 'Keep root', unlessBass: 'Leave to bass', never: 'Never', uniform: 'Uniform', functional: 'By function' };
// a slider's amount in named steps: the effects are small and a few percent apart cannot be told apart by ear
const STEPS = [['Off', 0], ['Light', 0.25], ['Medium', 0.5], ['Strong', 1]];
const nearestStep = value => STEPS.reduce((best, step, i) => (Math.abs(step[1] - value) < Math.abs(STEPS[best][1] - value) ? i : best), 0);

function Tile({ rule, compiled, onChoice }) {
    const state = ruleState(rule, compiled), choice = compiled.choices[rule.id], p = rule.parameter;
    const blocked = state.enabled && state.status === 'Overridden';
    const pick = v => onChoice(rule.id, v === rule.off ? { enabled: false } : { enabled: true, value: v });
    const step = p ? nearestStep(state.enabled ? state.value : 0) : null;
    return <div className={`trial-tile${state.enabled ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}${choice ? ' is-chosen' : ''}`} id={`rule-${rule.id}`} title={`${rule.description}${blocked ? `\n\n${state.reason}` : ''}`}>
        <div className="trial-tile-head">
            <span className="trial-tile-name">{p?.label ?? rule.title}</span>
            {choice && <button type="button" className="trial-tile-reset" aria-label={`Reset ${rule.title}`} title="Back to the preset's value" onClick={() => onChoice(rule.id, null)}>✕</button>}
        </div>
        {p
            ? <div className="trial-steps" role="group" aria-label={p.label}>
                {STEPS.map(([label, amount], i) => <button key={label} type="button" aria-pressed={i === step} className={i === step ? 'is-picked' : ''}
                    onClick={() => onChoice(rule.id, amount === 0 ? { enabled: false } : { enabled: true, value: Math.min(p.max, amount) })}>{label}</button>)}
            </div>
            : <select aria-label={rule.title} value={state.enabled ? state.value : rule.off} onChange={e => pick(e.target.value)}>
                {rule.options.map(v => <option key={v} value={v}>{LABELS[v] ?? v}</option>)}
            </select>}
    </div>;
}

export default function TrialRules({ settings, book, onChoice }) {
    const base = baseSettings(settings, book), compiled = compileRules(base, book.rules, book.inherited);
    const saved = useRef(null), [bypassed, setBypassed] = useState(false);
    const rules = TRIAL_RULE_IDS.map(id => RULES.find(r => r.id === id)).filter(Boolean);
    // one switch for the whole panel, so a setup can be heard with and without all of its trial rules
    const toggle = () => {
        if (!bypassed) {
            saved.current = Object.fromEntries(rules.map(r => [r.id, book.rules?.[r.id] ?? null]));
            rules.forEach(r => onChoice(r.id, { enabled: false }));
        } else rules.forEach(r => onChoice(r.id, saved.current?.[r.id] ?? null));
        setBypassed(!bypassed);
    };
    return <div className="trial-rules">
        <div className="trial-toggle"><button type="button" aria-pressed={bypassed} onClick={toggle}>{bypassed ? 'Trial rules are off: turn them back on' : 'Turn all trial rules off'}</button></div>
        {rules.map(rule => <Tile key={rule.id} rule={rule} compiled={compiled} onChoice={onChoice} />)}
    </div>;
}
