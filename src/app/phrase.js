// Pass-phrases for the piece's seed: every seed reads as four words
// (amber-tide-lantern-moss), and typing those words gives the seed back.
// Any other text works as well - it is hashed into a seed - so a phrase
// like "rainy sunday" always makes the same piece.
//
// The list is frozen: changing a word, or the order, changes the piece
// every phrase stands for.

const WORDS = `
    acorn amber anchor apple april arbor aspen autumn bamboo basil bay beach
    beacon bell berry birch bloom blossom blue bluebell bough branch breeze
    brook bubble cabin calm candle canopy canyon cedar cello chalk cherry
    chime cider cinder citrus clay cliff cloud clover coast cobalt comet
    copper coral cotton cove creek crest cricket crystal cypress daisy dawn
    delta dew drift dune dusk eagle echo elm ember evening fable falcon fawn
    feather fern field fig finch firefly fjord flint flora foam fog forest
    fox frost garden gentle glade glen glow gold grove harbor harp haven
    hazel heath heron hill hollow honey horizon hush indigo inlet iris
    island ivory ivy jade jasmine juniper kelp kettle kite lagoon lake
    lantern larch lark laurel lavender leaf lemon lily linen lotus lullaby
    lunar maple marble marsh meadow mellow melon mint mist moon moss moth
    myrtle nectar nest nimbus north nutmeg oak oasis ocean olive opal orbit
    orchid otter owl paper path peach pearl pebble petal pine plum pond
    poppy prairie quartz quiet rain raven reed reef ridge ripple river robin
    rose rowan saffron sage sail sand satin shade shell shore silk silver
    sky slate snow solace sparrow spring spruce star still stone storm
    stream summer sun swallow swan tea thistle thyme tide timber topaz trail
    tulip twilight valley velvet violet vista wander water wave willow wind
    winter wisp wood wren yarrow zephyr breath dream lumen honeybee aurora
    bramble cascade coffee cradle daybreak driftwood dove emerald glacier
    hearth lichen marigold mulberry nocturne orchard pillow quill rainbow
    seashell snowfall starlight sunrise teal walnut wheat
`.trim().split(/\s+/);

const INDEX = new Map(WORDS.map((word, i) => [word, i]));
const SEED_LIMIT = 2 ** 31;

/** The seed (0 .. 2^31-1) as four words, joined by '-'. */
export function seedToPhrase(seed) {
    const s = seed >>> 0;
    return [24, 16, 8, 0].map((shift) => WORDS[(s >>> shift) & 0xff]).join('-');
}

// The words of a typed phrase: lower case, split on anything else.
const words = (text) => text.toLowerCase().split(/[^a-z]+/).filter(Boolean);

// FNV-1a over the normalised text, folded into a seed.
function hashSeed(text) {
    let h = 0x811c9dc5;
    for (const ch of words(text).join(' ')) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % SEED_LIMIT;
}

/**
 * The seed a phrase stands for: four list words read back exactly (what
 * seedToPhrase shows), anything else hashed. null for empty text.
 */
export function phraseToSeed(text) {
    const list = words(text);
    if (!list.length) return null;
    if (list.length === 4 && list.every((w) => INDEX.has(w))) {
        const value = list.reduce((v, w) => v * 256 + INDEX.get(w), 0);
        if (value < SEED_LIMIT) return value;
    }
    return hashSeed(text);
}

export const PHRASE_WORDS = WORDS;
