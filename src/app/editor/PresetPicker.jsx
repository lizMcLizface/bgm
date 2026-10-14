import React from 'react';
import { presetGroups } from './presetStore';
import { ROLE_CATEGORY } from '../presets';

// Grouped preset <select>. Reads the store on every render, so presets
// saved/deleted elsewhere on the page show up on the next render. A loaded
// preset that isn't in any group (an import not yet saved) is still listed.
// `role` lists that role's own category first (lead -> Leads, ...).
const PresetPicker = ({ value, edited, onChange, id, role }) => {
    const groups = presetGroups(ROLE_CATEGORY[role]);
    const known = groups.some(({ presets }) => value in presets);
    return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
            {!known && <option value={value}>{value}</option>}
            {groups.map(({ group, presets }) => (
                <optgroup key={group} label={group}>
                    {Object.keys(presets).map((name) => (
                        <option key={name} value={name}>
                            {name}{edited && name === value ? ' (edited)' : ''}
                        </option>
                    ))}
                </optgroup>
            ))}
        </select>
    );
};

export default PresetPicker;
