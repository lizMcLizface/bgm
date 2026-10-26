// Time of year as a continuous value in [0, 4): 0 spring, 1 summer, 2 autumn,
// 3 winter. Materials belong to groups (grass, leaf, conifer, rock...) whose
// base colours are shifted per frame, so the year can turn without rebuilding.
import { hex, mix, mul } from './lighting.js';
import { clamp, smoothstep } from './noise.js';

const NAMES = ['Early spring', 'Late spring', 'Early summer', 'Late summer', 'Early autumn', 'Late autumn', 'Early winter', 'Late winter'];
export const seasonName = y => NAMES[Math.floor((((y % 4) + 4) % 4) * 2)];

// `climate` 'dry' (savanna, desert): no snow and trees keep most leaves;
// 'cold' (tundra): snow from mid autumn to late spring, a short green summer.
export function seasonAt(year, climate) {
    const y = ((year % 4) + 4) % 4;
    if (climate === 'cold') {
        const S = seasonAt(y), snow = 1 - smoothstep(0.45, 0.85, y) * (1 - smoothstep(2.05, 2.45, y));
        return { ...S, snow, bloom: 0, fresh: S.fresh * (1 - snow), dry: 0, autumn: Math.min(S.autumn, 1 - snow), leafy: Math.min(S.leafy, 1 - snow * 0.9) };
    }
    const thaw = 1 - smoothstep(3.7, 3.97, y);
    if (climate === 'dry') {
        // Wet season around spring, then a long golden dry season.
        const fresh = y < 1.2 ? 1 - smoothstep(0.6, 1.2, y) : smoothstep(3.3, 3.9, y);
        return { y, fresh, bloom: 0, dry: 1 - fresh, autumn: 0, snow: 0, leafy: 0.94 + 0.06 * fresh };
    }
    return {
        y,
        fresh: y < 1 ? 1 - smoothstep(0.35, 1, y) : smoothstep(3.75, 4, y),
        bloom: y < 1 ? smoothstep(0.05, 0.3, y) * (1 - smoothstep(0.5, 0.8, y)) : 0,
        dry: smoothstep(1.2, 1.9, y) * (1 - smoothstep(2.7, 3.1, y)),
        autumn: smoothstep(1.6, 2.35, y) * thaw,
        snow: smoothstep(2.8, 3.15, y) * (1 - smoothstep(3.65, 3.95, y)),
        // Share of leaves on deciduous trees.
        leafy: y < 1 ? 0.4 + 0.6 * smoothstep(0, 0.6, y) : y < 2 ? 1 : y < 3 ? 1 - 0.97 * smoothstep(2.15, 2.9, y) : 0.03 + 0.37 * smoothstep(3.7, 4, y),
    };
}

const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
// Keep c's lightness but take t's hue.
const hueOf = (c, t) => { const k = lum(c) / Math.max(1, lum(t)); return mul(t, [k, k, k]); };
const SNOW_LO = [138, 158, 198], SNOW_HI = [250, 252, 255];
const snowOf = c => mix(SNOW_LO, SNOW_HI, clamp((lum(c) - 25) / 140));
const FROST = hex('#948a84'), GREEN = hex('#6aa04a'), STUBBLE = hex('#c8b48a'), RAPE = hex('#f0d830'), SOIL = hex('#7a5a3c');
const OLIVE = hex('#b0a050'), STRAW = hex('#cdb27a'), RUST = hex('#c0702e'), BARE = hex('#7c6a5c'), ICE = hex('#b4cede');

export function seasonColor(c, g, S) {
    switch (g) {
        case 'grass':
            c = mix(c, mul(c, [1.04, 1.14, 0.88]), S.fresh * 0.5);
            c = mix(c, hueOf(c, OLIVE), S.dry * 0.45);
            c = mix(c, hueOf(c, STRAW), S.autumn * 0.4);
            return mix(c, snowOf(c), S.snow);
        case 'blade':
            c = mix(c, mul(c, [1.04, 1.14, 0.88]), S.fresh * 0.5);
            c = mix(c, hueOf(c, OLIVE), S.dry * 0.5);
            c = mix(c, hueOf(c, STRAW), Math.max(S.autumn * 0.55, S.snow * 0.85));
            return mix(c, snowOf(c), S.snow * 0.35);
        case 'canopy':
            c = mix(c, hueOf(c, RUST), S.autumn * 0.75);
            return mix(c, mix(hueOf(c, BARE), snowOf(c), 0.45), S.snow);
        case 'conifer': return mix(c, snowOf(c), S.snow * 0.45 * clamp(lum(c) / 70));
        case 'moss':
            c = mix(c, hueOf(c, OLIVE), S.autumn * 0.3);
            return mix(c, snowOf(c), S.snow * 0.6);
        case 'rock': return mix(c, snowOf(c), S.snow * 0.35);
        case 'ground': return mix(c, snowOf(c), S.snow * 0.6);
        case 'water': return mix(c, hueOf(c, ICE), S.snow * 0.5);
        // Crops: wheat greens in spring, ripens gold, is stubble after harvest.
        case 'wheat':
            c = mix(c, hueOf(c, GREEN), clamp(1 - smoothstep(0.6, 1.5, S.y)) * (S.y < 3.5 ? 1 : 0) * 0.8);
            c = mix(c, hueOf(c, STUBBLE), smoothstep(1.9, 2.2, S.y) * (1 - S.snow));
            return mix(c, snowOf(c), S.snow);
        // Rapeseed: blazing yellow in late spring.
        case 'rape':
            c = mix(c, hueOf(c, RAPE), S.y < 1.2 ? smoothstep(0.3, 0.55, S.y) * (1 - smoothstep(0.85, 1.15, S.y)) : 0);
            c = mix(c, hueOf(c, SOIL), smoothstep(1.8, 2.2, S.y) * (1 - S.snow));
            return mix(c, snowOf(c), S.snow);
        case 'soil': return mix(c, snowOf(c), S.snow * 0.9);
        // Savanna grass: green in the wet season, gold the rest of the year.
        case 'savanna': return mix(c, hueOf(c, GREEN), S.fresh * 0.55);
        // Bark frosts over in winter; caps are the top pixel of a level branch,
        // bark-coloured most of the year and holding a line of snow in winter.
        case 'bark': return mix(c, mix(mul(hueOf(c, FROST), [1.35, 1.35, 1.35]), snowOf(c), 0.3), S.snow * 0.8);
        case 'snowcap': return mix(seasonColor(c, 'bark', S), SNOW_HI, S.snow * 0.9);
        default: return c;
    }
}

// Leaf tones: variant 0-2 turn yellow / orange / red at staggered times,
// variant 3 blossoms pink in spring and goes yellow in autumn.
const AUTUMN = [
    ['#2a2410', '#463a14', '#6e5a1a', '#9a7e20', '#c4a22a', '#e2c442', '#f4e27a'],
    ['#2e1a0c', '#4e2812', '#7a3c16', '#a8561c', '#d07a22', '#eca232', '#f8cc58'],
    ['#2e100c', '#4e1812', '#7a2414', '#a8381a', '#d0561e', '#ec8a2c', '#f8c450'],
    ['#2a2410', '#463a14', '#6e5a1a', '#9a7e20', '#c4a22a', '#e2c442', '#f4e27a'],
].map(p => p.map(hex));
const FRESH = ['#12301c', '#1c4a26', '#2c6a2e', '#459034', '#6eb43e', '#a2d452', '#d2ec7a'].map(hex);
const BLOSSOM = ['#4a2a3a', '#6e3a52', '#9a5272', '#c47494', '#e49ab4', '#f6c4d6', '#fff0f4'].map(hex);
const DEAD = hex('#6b4a30');

export function leafColor(c, i, v, S) {
    const turn = smoothstep(1.5 + v % 3 * 0.12, 2.25 + v % 3 * 0.12, S.y) * (1 - smoothstep(3.7, 3.95, S.y));
    let col = mix(c[i], FRESH[i], S.fresh * 0.6);
    if (v === 3) col = mix(col, BLOSSOM[i], S.bloom * (i >= 3 ? 0.9 : 0.4));
    col = mix(col, AUTUMN[v][i], turn);
    return mix(col, hueOf(col, DEAD), S.snow * 0.7);
}
