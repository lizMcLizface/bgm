import React from 'react';
import { GROUPS, groupValue, groupReason } from './groups';

export default function GroupCard({ id, settings, book, onChange, children }) {
    const group = GROUPS.find(g => g.id === id), custom = Object.hasOwn(book.groups ?? {}, id), reason = groupReason(group, settings);
    return <article className="book-rule book-group" data-rule-role={group.role} id={`group-${id}`}>
        <div className="book-rule-heading"><h3>{group.title}</h3><span className="book-badge">{reason ? 'Overridden' : custom ? 'Your choice' : 'Preset'}</span></div>
        <p>{group.weights ? 'Weights are relative shares of phrases. Zero excludes a choice when another has weight; all zero means equal shares.' : group.description}</p>
        <label className="book-rule-choice"><span>Source</span><select aria-label={`${group.title}: source`} value={custom ? 'custom' : 'preset'} onChange={e => onChange(id, e.target.value === 'preset' ? null : groupValue(settings, group.path))}><option value="preset">Follow preset</option><option value="custom">Your choices</option></select></label>
        <div className="book-group-fields">{children}</div>
        <footer><span>{custom ? 'Your choice' : 'Preset'}</span><span>{reason ?? 'Edits shape upcoming phrases.'}</span>{custom && <button className="book-text-button" onClick={() => onChange(id, null)}>Reset</button>}</footer>
    </article>;
}
