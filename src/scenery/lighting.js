// Time-of-day lighting: sky, haze, cloud and sun colours plus a tint every
// material is multiplied by. Scenes only store palette slots, so the whole
// picture relights by recomputing these colours each frame.
import { clamp, smoothstep } from './noise.js';

export const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

const KEYS = [
    { h: 0, skyTop: '#060a1c', skyHor: '#16224a', haze: '#18234a', tint: [0.3, 0.36, 0.6], sun: '#ffffff', cloudLit: '#36446e', cloudDark: '#121a36' },
    { h: 4.6, skyTop: '#0b1230', skyHor: '#26315e', haze: '#252f5a', tint: [0.34, 0.38, 0.62], sun: '#ff9a6a', cloudLit: '#3e4876', cloudDark: '#161d3a' },
    { h: 5.8, skyTop: '#2a3a78', skyHor: '#d98a7c', haze: '#a77d8e', tint: [0.7, 0.6, 0.7], sun: '#ffb37a', cloudLit: '#e8a094', cloudDark: '#4e4a7c' },
    { h: 7, skyTop: '#4a74c0', skyHor: '#f3c49a', haze: '#dcb8a6', tint: [1, 0.86, 0.78], sun: '#ffe0a8', cloudLit: '#fff0dc', cloudDark: '#8e94b8' },
    { h: 9.5, skyTop: '#4386d4', skyHor: '#b8e0f0', haze: '#b4d6e8', tint: [1, 0.98, 0.95], sun: '#fff6e0', cloudLit: '#ffffff', cloudDark: '#9fb4d0' },
    { h: 14, skyTop: '#3d88d8', skyHor: '#a8daf2', haze: '#acd6ec', tint: [1, 1, 1], sun: '#fffbea', cloudLit: '#ffffff', cloudDark: '#a2bad6' },
    { h: 16.8, skyTop: '#4a84c8', skyHor: '#e6dcb2', haze: '#d6d0b6', tint: [1, 0.93, 0.82], sun: '#fff0c0', cloudLit: '#fff2d8', cloudDark: '#a6aac4' },
    { h: 18.4, skyTop: '#34467e', skyHor: '#f0905e', haze: '#c8857a', tint: [0.9, 0.64, 0.6], sun: '#ffb070', cloudLit: '#ffb88e', cloudDark: '#685a88' },
    { h: 19.6, skyTop: '#1e2a5c', skyHor: '#6476b0', haze: '#56629a', tint: [0.52, 0.55, 0.8], sun: '#ff9060', cloudLit: '#8a92c2', cloudDark: '#323a68' },
    { h: 21.2, skyTop: '#0a1028', skyHor: '#20305c', haze: '#202d58', tint: [0.33, 0.38, 0.62], sun: '#ffffff', cloudLit: '#38466e', cloudDark: '#141b38' },
].map(k => ({ ...k, skyTop: hex(k.skyTop), skyHor: hex(k.skyHor), haze: hex(k.haze), sun: hex(k.sun), cloudLit: hex(k.cloudLit), cloudDark: hex(k.cloudDark) }));

const FIELDS = ['skyTop', 'skyHor', 'haze', 'tint', 'sun', 'cloudLit', 'cloudDark'];

export function lightAt(hour) {
    const h = ((hour % 24) + 24) % 24;
    let i = KEYS.length - 1;
    while (KEYS[i].h > h) i--;
    const a = KEYS[i], b = KEYS[(i + 1) % KEYS.length];
    const span = (b.h <= a.h ? b.h + 24 : b.h) - a.h;
    const t = smoothstep(0, 1, (h - a.h) / span);
    const L = {};
    for (const f of FIELDS) L[f] = mix(a[f], b[f], t);

    const angle = Math.PI * (h - 6) / 12;
    L.sunElev = Math.sin(angle);
    L.sunX = -Math.cos(angle);
    L.moonElev = -L.sunElev;
    L.moonX = -L.sunX;
    L.day = smoothstep(-0.12, 0.22, L.sunElev);
    // Faces are lit from whichever body is up; contrast is lower by moonlight.
    L.lightX = L.sunX * L.day + L.moonX * (1 - L.day);
    L.contrast = 0.5 + 0.5 * L.day;
    L.stars = 1 - smoothstep(-0.25, 0.03, L.sunElev);
    L.lights = 1 - smoothstep(-0.05, 0.28, L.sunElev);
    L.glow = clamp(1 - Math.abs(L.sunElev) * 2.2) * 0.6 + 0.4;
    L.fog = 0;
    L.veil = 0;
    return L;
}

const grey = c => { const v = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return [v, v, v]; };

// Weather on top of time of day: `grey` desaturates and flattens the light,
// `dark` dims it, `fog` pulls everything toward the haze colour (distant
// things first), `tint` recolours the haze (dust, smog), `veil` hides the sky
// bodies, `flash` is a lightning flash in [0, 1].
export function applyAtmos(L, A, flash = 0) {
    const sky = ['skyTop', 'skyHor', 'haze', 'cloudLit', 'cloudDark'];
    for (const f of sky) L[f] = mix(L[f], mul(grey(L[f]), [0.97, 1, 1.05]), A.grey ?? 0);
    const dim = 1 - (A.dark ?? 0);
    for (const f of sky) L[f] = mul(L[f], [dim, dim, dim]);
    L.tint = mul(L.tint, [dim, dim, dim]);
    if (A.tint) {
        const c = mul(A.tint, L.tint);
        L.haze = mix(L.haze, c, A.tintAmt);
        L.skyHor = mix(L.skyHor, c, A.tintAmt * 0.9);
        L.skyTop = mix(L.skyTop, c, A.tintAmt * 0.6);
        L.cloudLit = mix(L.cloudLit, c, A.tintAmt * 0.5);
    }
    L.contrast *= 1 - (A.grey ?? 0) * 0.75;
    L.fog = A.fog ?? 0;
    L.veil = A.veil ?? 0;
    L.stars *= 1 - L.veil;
    if (flash) {
        const w = [235, 238, 255];
        for (const f of sky) L[f] = mix(L[f], w, flash * 0.6);
        L.tint = mix(L.tint, [1.1, 1.1, 1.2], flash * 0.7);
    }
    return L;
}
