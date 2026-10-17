// Each look sets a complete, coordinated set of dynamics. Palette, circle,
// and grid quality stay as the user chose them.
export const FLUID_LOOKS = {
    balanced: { label: 'Balanced', description: 'Clear note trails with gentle curls.', options: {
        size: 0.7, speed: 0.85, glow: 1.15, energyCap: 0.0015, vorticity: 6,
        velocityDiffusion: 0, dyeDiffusion: 0, velocityDissipation: 0.5, dissipation: 0.4, trails: true,
    } },
    fine: { label: 'Fine trails', description: 'Narrow ribbons with more small eddies.', options: {
        size: 0.45, speed: 1.2, glow: 1.5, energyCap: 0.001, vorticity: 9.5,
        velocityDiffusion: 0, dyeDiffusion: 0, velocityDissipation: 0.35, dissipation: 0.28, trails: true,
    } },
    soft: { label: 'Soft ink', description: 'Broader, quieter flow that clears sooner.', options: {
        size: 0.9, speed: 0.55, glow: 0.85, energyCap: 0.0006, vorticity: 2,
        velocityDiffusion: 0.000004, dyeDiffusion: 0.000002, velocityDissipation: 0.8, dissipation: 0.55, trails: true,
    } },
};

export const FLUID_LIMITS = {
    fullness: [0, 1, 0.05], motionBalance: [0, 1, 0.05], balanceDrift: [0, 1, 0.05],
    spread: [10, 90, 1], size: [0.15, 3, 0.05], speed: [0.2, 3, 0.05], glow: [0, 2, 0.05],
    vorticity: [0, 30, 0.5], velocityDissipation: [0, 2, 0.02],
    velocityDiffusion: [0, 0.0002, 0.000002], dyeDiffusion: [0, 0.0002, 0.000002],
    energyCap: [0.00005, 0.012, 0.00005], dissipation: [0.08, 1, 0.02],
};

export function fluidLook(options) {
    return Object.entries(FLUID_LOOKS).find(([, look]) => Object.entries(look.options).every(([key, value]) =>
        typeof value === 'number' ? Math.abs(options[key] - value) < 1e-10 : options[key] === value))?.[0] || 'custom';
}

export function applyFluidLook(options, id) {
    return FLUID_LOOKS[id] ? { ...options, ...FLUID_LOOKS[id].options } : options;
}

// Explore useful ranges around a tuned look, keeping rendering cost and the
// user's palette/circle choices intact. Visual randomness never touches music.
export function randomFluidOptions(options, random = Math.random) {
    const pick = (values) => values[Math.floor(random() * values.length)];
    const range = (lo, hi) => lo + random() * (hi - lo);
    const look = pick(Object.values(FLUID_LOOKS)).options;
    const next = { ...options, ...look,
        fullness: range(0.25, 0.9), size: look.size * range(0.7, 1.5),
        speed: look.speed * range(0.7, 1.5), glow: look.glow * range(0.8, 1.2),
        vorticity: look.vorticity * range(0.65, 1.4),
        energyCap: look.energyCap * range(0.7, 1.4),
        dissipation: look.dissipation * range(0.7, 1.3),
        velocityDissipation: look.velocityDissipation * range(0.7, 1.3),
        velocityDiffusion: pick([0, 0, 0.000002, 0.000004]),
        dyeDiffusion: pick([0, 0, 0, 0.000002]),
        motionBalance: range(0.15, 0.85), balanceDrift: range(0, 0.5),
        jetDirection: random() < 0.75 ? 'exhaust' : 'forward', spread: range(20, 70),
    };
    for (const key of Object.keys(FLUID_LIMITS)) {
        const [min, max, step] = FLUID_LIMITS[key];
        next[key] = Math.max(min, Math.min(max, Number((min + Math.round((next[key] - min) / step) * step).toPrecision(10))));
    }
    return next;
}
