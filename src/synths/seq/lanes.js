// An eight-lane view of a pattern. The sequencer device has eight tracks, as most hardware sequencers do; a lane is
// one of them, and says which row of the stored pattern it edits. A drum machine with more than eight voices is
// shown a page of eight at a time (the 808's sixteen are two pages). The same view will later carry eight parallel
// sequencers, each lane then being a track with its own target, length and pattern.

export const LANES = 8;

/** How many pages of eight lanes `count` rows need (at least one). */
export const pageCount = (count) => Math.max(1, Math.ceil(count / LANES));

/** The page that holds row `index`. */
export const pageOf = (index) => Math.floor(Math.max(0, index) / LANES);

/**
 * The eight lanes of one page of a drum kit: { index, key, short, long } for each voice on the page, null for the
 * empty places at the end of the last page.
 */
export function drumLanes(kit, page) {
    const first = Math.max(0, page) * LANES;
    return Array.from({ length: LANES }, (_, i) => {
        const t = first + i;
        if (t >= kit.tracks.length) return null;
        const [key, short, long] = kit.tracks[t];
        return { index: t, key, short, long };
    });
}

/** A short name for a page, e.g. "BD–MT" or, for a single page, "1–8". */
export function pageLabel(kit, page) {
    const lanes = drumLanes(kit, page).filter(Boolean);
    return lanes.length ? `${lanes[0].short}–${lanes[lanes.length - 1].short}` : '';
}

/** The window of eight rows slid over `count` rows: how far it can go, and the offset that shows row `t` (nearest to where it was). */
export const maxOffset = (count) => Math.max(0, count - LANES);
export const clampOffset = (count, offset) => Math.min(maxOffset(count), Math.max(0, Math.round(offset)));
export const revealRow = (count, offset, t) => clampOffset(count, t < offset ? t : t >= offset + LANES ? t - LANES + 1 : offset);
export const windowLabel = (count, offset) => `${offset + 1}–${Math.min(count, offset + LANES)}`;

/** The eight lanes of a drum kit starting at row `offset`: { index, key, short, long }, null for places past the last voice. */
export function drumLaneWindow(kit, offset) {
    return Array.from({ length: LANES }, (_, i) => {
        const t = clampOffset(kit.tracks.length, offset) + i;
        if (t >= kit.tracks.length) return null;
        const [key, short, long] = kit.tracks[t];
        return { index: t, key, short, long };
    });
}
