// Interpretation of the supplied stems, not claims about their recording setup.
const rain = [
    ['rumble', 'Sub pressure', 'Narrow, almost mono bass; slowly modulated brown noise.'],
    ['rumble', 'Distant thuds', 'Bass wash with occasional pressure pulses.'],
    ['body', 'Downpour body', 'Broad low body; correlated wash plus dull impacts.'],
    ['body', 'Low-mid wash', 'Wide, overlapping rain; smoothly varying density.'],
    ['body', 'Mid wash', 'Dense impact cloud rather than isolated pitched drops.'],
    ['mist', 'Mist / distant sheet', 'Mid-frequency wash, with a moving amplitude envelope.'],
    ['drops', 'Near impacts', 'Transition from continuous wash to audible droplets.'],
    ['drops', 'Sparse patter', 'Foreground bursts; varied sizes and inter-arrival times matter.'],
    ['hiss', 'Splash / hiss', 'Broadband splash tails over a continuous bright bed.'],
    ['hiss', 'Air / sizzle', 'Very high-frequency wash; increases with intensity.'],
];
const tin = [
    ['rumble', 'Deep roof rumble', 'Very narrow stereo bass; shared low-frequency excitation.'],
    ['rumble', 'Low roof rumble', 'Distant pressure and low structural resonance.'],
    ['body', 'Roof body', 'Broad low body, partly shared between channels.'],
    ['drops', 'Roof thump', 'Low plate modes excited by overlapping impacts.'],
    ['drops', 'Roof thump / wash', 'Damped structural modes plus dense low-mid excitation.'],
    ['mist', 'Dense roof midrange', 'Correlated impact wash; some shared stereo excitation.'],
    ['mist', 'Roof density', 'Dense midrange with fluctuating impact energy.'],
    ['drops', 'Metallic patter', 'Short, damped noise strikes with a brighter plate colour.'],
    ['drops', 'Sharp roof strikes', 'Sparse, strongly peaked metallic impacts; preserve the envelope.'],
    ['sheet', 'Bright roof patter', 'Bright impact transients and short splash tails.'],
];
export const REFERENCES = Object.entries({ rain, tin }).flatMap(([family, bands]) => bands.map(([layer, title, description], band) => ({
    family, band, layer, title, description, reference: `${family}_band${band}_ref.wav`, previous: `${family}_band${band}_synth.wav`,
})));
