export function grooveProfile({ name = '', preset = {} } = {}) {
    if (/classic|pixel|chip|8.bit|arcade|pulse lead/i.test(name)) return 'tight';
    if (preset.stringModel === 'plucked' || /guitar|harp|kalimba|pluck/i.test(name)) return 'plucked';
    if (preset.stringModel === 'piano' || /piano|rhodes|tine|keys/i.test(name)) return 'keys';
    if (/flute|ocarina|reed|wind/i.test(name)) return 'breath';
    if ((preset.gainAttack ?? 0) >= .3 || /pad|swell|texture/i.test(name)) return 'swell';
    return 'neutral';
}

export function instrumentGroovePlan(start, voices) {
    return { start, profiles: Object.fromEntries(Object.entries(voices).map(([role, voice]) => [role, grooveProfile(voice)])) };
}

// Fractions of the existing Timing setting, not new milliseconds controls.
export function grooveFeel(plan, role, name) {
    if (role === 'bass' || role === 'perc' && ['kick', 'punch'].includes(name)) return { delay: 0, scatter: 0, common: 1 };
    if (role === 'perc') return { delay: ['brush', 'snare', 'clap', 'rim'].includes(name) ? .28
        : ['hat', 'sizzle', 'shaker'].includes(name) ? -.06 : 0, scatter: .09, common: .65 };
    const profile = plan.profiles[role] ?? 'neutral';
    const delay = { tight: 0, plucked: -.14, keys: .18, breath: .3, swell: .36, neutral: 0 }[profile];
    return { delay: delay + (profile !== 'tight' && role === 'counter' ? .08 : 0),
        scatter: profile === 'tight' ? .025 : profile === 'swell' ? .05 : .09,
        common: profile === 'tight' ? .12 : 1 };
}
