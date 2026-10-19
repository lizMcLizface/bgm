import React from 'react';
import {ruleState,compileRules} from './model';
const format=(value,p)=>p.unit==='%'?`${Math.round(value*100)}%`:`${value} ${p.unit}`;
export default function RuleCard({rule,compiled,base,onChoice}){
    const state=ruleState(rule,compiled),choice=compiled.choices[rule.id],preset=ruleState(rule,compileRules(base,{},compiled.inherited));
    const setMode=mode=>onChoice(rule.id,mode==='preset'?null:{...choice,enabled:mode==='on'});
    return <article className={`book-rule ${state.status==='Overridden'?'is-overridden':''}`} id={`rule-${rule.id}`} data-rule-role={rule.role}>
        <div className="book-rule-heading"><span className={`book-dot ${state.enabled?'is-enabled':''}`} aria-hidden="true"/><h3>{rule.title}</h3><span className={`book-badge status-${state.status.toLowerCase().replace(' ','-')}`}>{state.status}</span></div>
        <p>{rule.description}</p>
        <div className="book-rule-choice"><label htmlFor={`choice-${rule.id}`}>Permission</label><select id={`choice-${rule.id}`} value={choice?(choice.enabled?'on':'off'):'preset'} onChange={e=>setMode(e.target.value)}>
            <option value="preset">Follow preset ({preset.enabled?'on':'off'})</option><option value="on">Allow</option><option value="off">Do not allow</option></select></div>
        {rule.parameter&&<label className="book-parameter"><span>{rule.parameter.label}</span><output>{format(state.value,rule.parameter)}</output><input aria-label={rule.parameter.label} type="range" {...{min:rule.parameter.min,max:rule.parameter.max,step:rule.parameter.step}} value={choice?.value??state.value} disabled={choice?.enabled===false} onChange={e=>onChoice(rule.id,{enabled:true,value:Number(e.target.value)})}/></label>}
        {rule.options&&state.enabled&&<label className="book-rule-choice"><span>Approach</span><select aria-label={`${rule.title}: approach`} value={state.value} onChange={e=>onChoice(rule.id,{enabled:true,value:e.target.value})}>{rule.options.filter(x=>x!==rule.off).map(v=><option key={v} value={v}>{rule.optionLabels?.[v]??(v==='auto'?'Automatic parent':v==='major'?'Major harmony':v==='minor'?'Minor harmony':v==='centered'?'Stay near home':v==='wandering'?'Wander freely':v==='answer'?'Answer the lead':v==='line'?'An independent line':v==='harmony'?'Parallel harmony':v==='add9'?'Added ninth':v==='add6'?'Added sixth':v==='floating'?'Floating suspension':v==='sus2'?'Suspended second':v==='sus4'?'Suspended fourth':v[0].toUpperCase()+v.slice(1))}</option>)}</select></label>}
        <footer><span>{state.source}</span>{!['Enabled','Off'].includes(state.status)?<strong>{state.reason}</strong>:<span>{state.enabled?'Allowed on suitable passages.':choice?.enabled&&rule.parameter?'Its amount is zero.':'This rule is not permitted.'}</span>}{choice&&<button className="book-text-button" onClick={()=>onChoice(rule.id,null)}>Reset</button>}</footer>
    </article>;
}

