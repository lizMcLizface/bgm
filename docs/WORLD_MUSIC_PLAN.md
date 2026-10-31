# Beyond the major scale: a less Western-centred generator

31 October 2026. Survey and plan, nothing built, nothing heard. Status marks: `[ ]` open, `[~]` in progress, `[x]` done and checked.

**How reliable this is.** Counts and code facts come from the repo and were measured. The traditions are summarised from a web search whose sources were mostly teaching pages, encyclopedias and a few papers, with several weak ones; where a point rests on one weak source or on memory, it says so. This is a map of what to ask musicians and listen to, not a settled account of any tradition. The aim is to build fundamentals inspired by these traditions, not to imitate any of them (see [Labelling](#6-labelling)).

## 1. Where the generator stands

**Scales.** `src/scales/scaleTables.js` holds 75 named scales: the seven modes of the major scale, harmonic and melodic minor and their modes, harmonic major, double harmonic major, Neapolitan, Hungarian, "Ukrainian Dorian", Phrygian dominant (also named Hijaz and Freygish), Raga Kumud, several hexatonics, blues, Egyptian, and pentatonics including one called Japanese. Every scale is a set of 12-tone-equal-temperament steps (whole, half, augmented second and so on). Tuning is always 12-TET (the temperament code covers only the piano).

**What presets actually use** (183 presets with a mode set):

| Mode | Presets |
| --- | --- |
| Aeolian (natural minor) | 83 |
| Ionian (major) | 56 |
| Dorian | 24 |
| Lydian | 7 |
| Mixolydian | 2 |
| Phrygian | 2 |
| Harmonic minor | 6 |
| Pentatonic | 3 |

So 174 of 183 (95%) sit in the seven modes of the major scale; nine use anything else, and none uses double harmonic, Phrygian dominant, Hungarian, the Japanese scale or any of the others.

**What happens around the scale is Western too:**
- **Harmony:** progressions are lists of Roman numerals (`progressions.js`), such as I–V–vi–IV or i–VI–III–VII. Chords are stacked thirds. A pentatonic scale is given a major or minor parent for its harmony (`harmonyScale.js`).
- **Form:** four-bar phrases (`PHRASE_BARS`) and pop-style sections: intro, build, full, breakdown.
- **Rhythm:** bar and beat grouping; odd meters (5/8, 7/8) exist, and Euclidean patterns exist for the bass, but there are no rhythmic cycles with structural beats.
- **Ornaments:** grace notes, mordents, turns and trills (`ornaments.js`), plus note slides and portamento.
- **Texture:** the second lead can answer, harmonise or play its own line; the pad plays chords; the bass has a pedal option (tonic or fifth for a share of phrases).
- **Percussion:** drum styles are Western pop and jazz and electronic (bossa, jazz, broken beat, two-step, breaks, synthwave, hand percussion). No timeline or cycle styles.

The generator therefore makes "a Western tune with a different set of notes" if you change the scale. That is the poor imitation you described.

## 2. What the traditions bring, beyond the scale
Summaries from the search, with the weakest points marked.

- **Arabic and Turkish maqam.** A maqam is built from smaller units, ajnas (singular jins), of about three to five notes: a lower jins on the tonic and an upper one on the dominant. Its melodic course (sayr) specifies where to begin, where to rest, ascending and descending forms and closing formulas. Moving to another maqam is usually done by swapping one jins while keeping the other. Notation writes 24 steps to the octave, but the sources stress this is a convention: the "quarter tone" is higher or lower depending on the maqam, and in melody three-quarter tones and semitones are the steps, not quarter tones. One paper argues a maqam is better seen as a network of paths between ajnas than as a single scale. Improvisation (taqsim) rests on jins, sayr and modulation.
- **Hindustani raga.** Standard elements: ascent and descent (aroha and avaroha, often different, and the difference often identifies the raga), a signature phrase (pakad), the most important note (vadi) and the next (samvadi, a fourth or fifth away), classification by notes used (seven, six or five) and a time of day. A drone (tanpura) fixes the tonic so each note is heard against it. Performance moves from a slow, unmetred exploration (alap) through jor to jhala; gamak is a strong oscillation. I did not find a usable source on tala here; what I know of it (cycles such as the 16-beat teental, with marked first and "empty" beats) is from memory.
- **Javanese gamelan.** Two tunings, slendro (five roughly equal steps) and pelog (seven notes, unequal, five emphasised); each set of instruments has its own tuning, and neither matches 12-TET. Paired instruments are deliberately slightly mistuned so they beat (ombak). Colotomic instruments (gongs) mark the commas and full stops of a repeating cycle (gongan). A core melody (balungan) is elaborated by other parts, and kotekan is interlocking, two players sharing one line by alternating notes. (One source for kotekan is a commercial site.)
- **Japanese and Chinese.** Both sit on pentatonic cores (gong, shang, jue, zhi, yu in Chinese music; sources disagree on whether ritsu and ryo are pentatonic or heptatonic). Miyako-bushi is a hemitonic (semitone-containing) pentatonic. Heterophony, several players varying one melody at the same time, is described as typical of Gagaku and Arabic classical music (the term itself is a Western coinage). I did not find sources linking heterophony to particular scales.
- **West African and Balkan rhythm.** West African bell patterns are built on 12 or 16 pulses split into two contrasting halves; the seven-stroke standard pattern appears in both a 12/8 and a 4/4 form. Balkan and Turkish music uses additive meters such as the 9-cycle (aksak). I found no source comparing them; the 2+2+2+3 grouping of the 9 is from memory.
- **Drone versus pedal.** Sources agree these overlap: a pedal in tonal music carries harmonic function, while a drone in modal music mainly fixes the centre and makes no local harmonic demands. Harmony in drone music lacks strong functional pulls.

**The common thread:** most of these are not "a scale plus chords". They are a tonic fixed by a drone, a melody governed by rules about direction, emphasis and phrases (raga, maqam), tuning that is not 12-TET, rhythm in cycles with marked beats, and textures where parts elaborate one line (heterophony, balungan, kotekan) and do not harmonise it.

## 3. What is missing

### 3.1 Scales and tuning
- **Scale families not in the table:** maqam families (Rast, Bayati, Saba, Sikah, Nahawand and Kurd are close to major, minor and Phrygian), many ragas (Todi, Marwa, Purvi, Bageshree, Bhimpalasi and others), the Japanese in/yo and ritsu/ryo families (Hirajoshi, Iwato, Kumoi, Miyako-bushi), slendro and pelog (and their pathet subsets), and the Chinese heptatonic extensions. The table's single "Japanese" scale (intervals 2, 1, 4, 1, 4 from the tonic) is Hirajoshi as I remember it, with the alternative names Insen and Ryukyu, which I believe belong to other scales; verify the labelling before showing it to a user.
- **Scales with direction and emphasis:** a scale is only a set of notes. Raga and maqam need an ascending set, a descending set, a start note, resting notes and an emphasised note. The scale entries have none of these.
- **Tuning.** Every scale is 12-TET. Maqam needs neutral thirds and seconds (a "half-flat" note about 50 cents below the equal-tempered step, its exact size depending on maqam), gamelan needs non-12 sets, raga and Western folk often use pure ratios. The per-note `detune` hook (see stage 8 of [SPLIT_LAYERS_PLAN.md](SPLIT_LAYERS_PLAN.md)) makes this a table of cents per scale degree. A fixed-pitch voice (piano, mallets, struck bells) cannot bend, so the voice choice constrains the scale.
- **Preset coverage:** 95% of presets are in the major family (section 1). Non-diatonic scales that already exist are untouched by presets.

### 3.2 Compositional style
1. **A harmony model that is not chords-on-the-scale.**
   - Drone plus melody with no chords at all, as an alternative to the pad (a continuous tonic-and-fifth drone voice, always on; the existing `pedal` option is only the bass, for a share of phrases).
   - Modal vamps: two chords, or one, with no tonic-dominant pull (partly there: `i–VII`, `i–iv`, `I–IV` exist).
   - Non-tertian voicings: stacked fourths or fifths, open fifths, clusters, or a scale-based ostinato cell rather than chord tones. This is the main hook into the voicing rework: the pad and rhythm layer currently assume a chord (root first, pitch classes), and `voicing` and the layer's pitch source should be a choice, not an assumption.
2. **Melody that follows the idiom:** ascent and descent sets, an emphasised note, signature phrases, and a course that moves from the tonic region to the upper jins and back (maqam sayr), or an exploration that starts low and opens up note by note (alap). Today the lead follows chords, leaps, repeats, inertia and tendency, none of which are idiom rules.
3. **Ornament and gesture vocabulary:** gliding between notes (meend, quarter-tone slides), oscillation around a note (gamak, andolan), grace notes that belong to the scale. The generator has grace, mordent, turn and trill, plus note slides and portamento; the slides would need to land on microtonal pitches.
4. **Rhythm in cycles:** a cycle with structural beats (tala's first beat, a gong stroke every cycle, a bell timeline of 12 or 16 pulses), additive meters (2+2+3, 2+2+2+3), and phrases whose length is the cycle's, not four bars. Euclidean bass patterns and odd meters are the nearest existing pieces.
5. **Textures built for one line:** heterophony (a variant of the lead on the counter voice at the same time, a new counter mode beside answer, harmony and line), interlocking (two voices alternating notes of one line, which the new rhythm layer plus counter could do), and a core melody elaborated by other parts (balungan).
6. **Form that is not intro, build, full, breakdown:** an unmetred opening that slowly establishes the tonic (rubato exists) moving into a metred part that speeds up while pitch stays fixed (raga's alap, jor, jhala), a cycle that repeats and builds toward a gong. The existing sections can be reused with different names and shapes.
7. **Timbre.** See the instrument inventory in section 3.3. In short: plucked, struck, bowed, wind and hand-percussion families all have a few members, but nothing with the sustained-drone lute character, no hammered or plucked zithers, no double reeds, no tuned gongs, no pitched or bendable hand drums, and no voice is marked as able to bend its pitch.

### 3.3 Instrument inventory (library names, 31 October 2026)
From `src/library/voices.json` (8 categories, 142 voices), the breath and string patch lists, and the drum kits. This is by name and description only: I have not listened to them, so "close to" means "plausible stand-in", not "sounds like".

**What the library has, by family**

| Family | Voices | Notes for world idioms |
| --- | --- | --- |
| Plucked strings | Kalimba Pluck, Harp Pluck, Soft Harp, Nylon Guitar, Upright Pluck (bass), Measured Cello Pizzicato | A real plucked-string model exists (`pluckedString.js`); nylon guitar and harp use it or similar. Nearest to a lute or harp family |
| Struck / mallet | Music Box, Soft Marimba, Glass Mallet, Celesta, Measured Celesta, Bell Lead, FM Bell, Tine Keys, FM Rhodes | Closest to gamelan keys, kalimba-likes and bells. Fixed pitch (cannot bend) |
| Keys | the 22 pianos, Felt / Soft Keys, Pixel Piano, Starmap Piano | The piano alone has temperaments (`Parlour Meantone`, `Baroque Grand`); it cannot bend |
| Winds | Soft Flute, Pan Flute, Ocarina, Sine Whistle, Clarinet Lead, Reed Lead, Organ Whistle, Measured Flute, Clarinet, Trumpet, Horn | Breath noise and a vowel formant (`breathPatches.js`) give them a breathy character; flutes are the nearest to a bansuri, shakuhachi or ney, a clarinet or reed to a shehnai or duduk |
| Bowed | Measured Violin, Cello, String Section, Chamber and Epic Strings, Haunted Viola, Warm / Heroic Strings | Violin and cello are the nearest to erhu, kamancheh, sarangi and rebab; slides would come from portamento |
| Voice | Choir Ah, Breathy Choir, Measured Choir Ah | Usable for chant-like drones |
| Organ / reed keyboard | Warm Organ, Tremolo Organ, Squeezebox | Nearest to a harmonium or accordion; useful for drones |
| Drones and beds | Dark Drone, Hollow Air, Void Pad, Wind Pad, Starlight Pad | Existing sustained textures that could serve as a drone voice |
| Hand percussion (`hand` kit) | low and muted conga, bongo, woodblock, tambourine tap and shake, seed shaker, cabasa, palm clap, seed sweep | A start for timeline and cycle rhythms |
| Machines | felt, crisp, 808 (cowbell, clave) | 808 cowbell and clave are what a bell timeline could use |

The /synths sandbox has more (Juno, CS-80, Jupiter, Prophet, FM and others), but only 12 classic presets are in the main picker, and the others are known to sound wrong (see the classic-synth item in the roadmap), so I did not count them.

**What it lacks**

| Missing | Needed for |
| --- | --- |
| A sustained-drone lute with sympathetic strings and a buzzing bridge (tanpura, sitar) | Raga's drone; the clearest gap for a drone layer, a drone voice that is a plucked cycle (Sa-Pa-Sa-Sa) and not a pad |
| Oud, saz, bouzouki, tar, shamisen, pipa, kora | Plucked lutes for maqam and other lines; the nylon guitar and harp stand in |
| Hammered and plucked zithers: santoor, dulcimer, koto, guzheng, cimbalom, qanun | Struck and plucked sets of strings; also suited to scale tunings with fixed pitches |
| Double reeds and bent flutes: duduk, shehnai, zurna, ney, shakuhachi, bagpipe chanter | Melodic lines with bent notes and breath noise; the library's flutes have breath and vowel but no overblowing or lip bends |
| Spike fiddles (erhu, kamancheh, sarangi, rebab) as a distinct character | The Measured violin and cello are Western bowed instruments |
| Tuned gongs and metallophones: gong ageng, kenong, bonang, gender, saron, balafon | Gamelan layers, colotomic gong marks and cycle structure; Glass Mallet, Marimba and the bells are stand-ins, and none can be tuned to a non-12 scale |
| Pitched, bendable hand drums: tabla, doumbek and darbuka, frame drums (riq, bendir), djembe, dhol, taiko, kendang | Cycle rhythms; the hand kit has conga, bongo, wood, tambourine and shaker only, with no pitch bend and no distinct hand strokes |
| Timeline instruments: agogo and double bell, claves, shekere, udu | A bell timeline of 12 or 16 pulses; only an 808 cowbell and clave exist |
| A "bendable" property | None of the voices is marked as able to glide to arbitrary pitches; vibrato exists as a preset field, and `portamento` and note slides exist as composition features, but the engine would also need to know that a voice cannot bend (piano, marimba, bells) so a microtonal scale is not offered with it |
| Sympathetic or resonating strings | The character of sitar, tanpura and several lutes; the piano model has string resonance but the plucked strings do not appear to |

**What this means for the stages.** Everything up to W0 to W2 works with what is there: a drone from `Dark Drone`, `Choir Ah` or `Tremolo Organ`; lines on the flutes, `Measured Violin` or `Nylon Guitar`; rhythm on the hand kit. The first new voices with the most value would be a plucked drone string (tanpura-like), a hammered or plucked zither, a double reed and a pair of pitched hand drums, in that order, because they unlock a drone layer, a fixed-pitch tuned set, a bent-pitch melody voice and cycle rhythm. They are new voice builds, not a change to the engine, and each should be judged by a listening test and not by its name.

## 4. Stages and goals
Each stage ships alone, does nothing until turned on, and ends in listening. The order is cheapest and most fixed first.

### W0: no code, existing scales
- [ ] **W0.1** Preset pass: new presets in the scales that exist and are unused (Phrygian, Lydian, Mixolydian, harmonic minor, Phrygian dominant, double harmonic, Hungarian, Egyptian, Japanese, pentatonic and blues variants), written as modal vamps (one or two chords) on the current engine. Establishes the baseline, shows what the scale alone gives, and says what is still missing. Label them by scale name, not by culture.
- [ ] **W0.2** Voice audit by ear: the inventory in 3.3 is by name only. Listen to the candidate stand-ins (drone voices, flutes, bowed, plucked, hand kit) and mark each one bendable or fixed-pitch; confirm the missing list.
- [ ] **W0.4** A `bendable` flag on voices, so scales that need bent or microtonal notes are only offered with voices that can play them.
- [ ] **W0.3** Check the scale table's labels (Japanese, Insen, Ryukyu, Raga Kumud, Egyptian, Oriental) against a reference.

### W1: drone and non-tertian texture
- [ ] **W1.1** A drone layer: a held tonic (and fifth) on its own voice, always on, as a texture beside the pad rather than the bass pedal; settings for pitches (tonic, tonic and fifth, tonic and fourth) and level.
- [ ] **W1.2** A `padKind` or `voicing` family: stacked thirds (today), stacked fourths or fifths, open fifths, cluster, and "scale cell" (an ostinato of scale notes); goes with `voicing` in stage 7 of the layers plan and the rhythm layer's pitch source.
- [ ] **W1.3** Drone-aware rules: with a drone on, the pad and bass do not restate the tonic; chord changes become a second centre or are skipped (a modal vamp).

### W2: scale tuning (shares stage 8 of the layers plan)
- [ ] **W2.1** Per-scale cents tables added to the scale entries: a small offset per degree (neutral third, half-flat second, pure ratios for drone-based scales), applied through `detune`.
- [ ] **W2.2** Slides and ornaments end on the tuned pitch.
- [ ] **W2.3** Guard: scales that need bending are only offered with, or default to, voices that can bend; fixed-pitch voices ignore the table.
- [ ] **W2.4** Gamelan tunings as a separate case (no 12-tone reference at all): a scale defined in cents from the tonic, with paired voices slightly mistuned to beat. Defer until the rest works.

### W3: melodic idioms
- [ ] **W3.1** A scale becomes an idiom: ascending and descending sets, start and rest notes, an emphasised note, optional signature phrases.
- [ ] **W3.2** Lead generation uses it: direction-dependent note sets, resting on the emphasised note, a course through the registers (low, then opening upward) over a phrase or section.
- [ ] **W3.3** Maqam as jins: a lower and an upper jins on tonic and dominant, a course between them, modulation by swapping one jins. Do this after W3.1 and 3.2 are heard.

### W4: gestures
- [ ] **W4.1** New ornament kinds: meend (a slide between non-adjacent notes), gamak (an oscillation), kan (a grace note from a scale neighbour), applied to the lead and second lead per voice suitability (the groove profile already separates swell, keys, plucked, breath).
- [ ] **W4.2** Microtonal landings for slides (needs W2).

### W5: rhythm cycles
- [ ] **W5.1** A cycle model: length in pulses, grouping, marked beats; phrase length follows it.
- [ ] **W5.2** Timeline and cycle patterns for the hand-percussion kit: a bell timeline of 12 or 16 pulses, an additive 9, a 7, a 10, a 16-beat cycle with a marked first beat.
- [ ] **W5.3** Bass and rhythm layer lock to the cycle's marked beats.

### W6: textures for a single line
- [ ] **W6.1** Heterophony: a counter mode that plays a decorated variant of the lead, slightly displaced.
- [ ] **W6.2** Interlocking: the rhythm layer and counter alternate the notes of one line.
- [ ] **W6.3** Core melody with elaboration: a slow line plus faster parts that outline it (needs the layers plan's rhythm layer).

### W7: form
- [ ] **W7.1** An unmetred opening (rubato at its extreme, drone only, lead exploring) leading into the metred part.
- [ ] **W7.2** A "gathering" shape: pulse and density rise over a section while pitch and tempo stay fixed.
- [ ] **W7.3** Cycle-based sections (a gong cycle repeats and builds).

### W8: presets and interface
- [ ] **W8.1** A small set of presets per stage, each with a plain description of what it borrows and what it does not.
- [ ] **W8.2** The scale picker groups by family and shows the idiom and any tuning, not just note names.
- [ ] **W8.3** Quests and tours stay unchanged until the features exist.

## 5. How it fits the voicing and layers work
- **The pitch source of a layer should be a choice.** Today the pad plays chord tones. For `split` and for W1, each layer picks among chord tones, scale tones, an ostinato cell, or a drone. Design the rhythm layer's input as "a set of pitches for this bar" and not "the chord", and the rest follows.
- **Voicing options beyond thirds.** The `voicing` setting (stage 7) is where fourths, fifths, open fifths and clusters belong, beside `hand` and `guitar`. Guitar open-string shapes already suit drones and open fifths.
- **Tuning is shared** with stage 8: the same `detune` hook serves temperament now and scale tuning later.
- **Layers as parts:** heterophony, interlocking and balungan-style texture are all "two or three voices, one line", which the separate rhythm role and the counter role make possible.
- **Playable voicings and idioms interact** (a drone is easy to play; a six-note cluster is not), so the playability metric from 7.1 should be applied to the new voicing kinds too.

## 6. Labelling
The aim is to build the fundamentals (drones, idioms, cycles, tuning, textures), the same way presets are inspired by a game or a genre without claiming to reproduce it. So presets are named for what they sound like, as the existing ones are, not for the tradition that inspired them. Where the inspiration is a style with strong cultural ties, it matters more to describe what the preset does and not to claim it is the thing itself. One thing worth remembering: the same scale has several homes (Phrygian dominant is Hijaz, Freygish and a flamenco staple), so the scale table's alternative names are the better framing than one scale per culture.

## 7. Decisions for the author
- **Scope and order:** W0 to W2 give the most for the least (existing scales, a drone, tuning). W3 to W7 are the real stylistic work and are large; pick one tradition to do properly first (raga with its drone and idiom fits the engine best, maqam next) and not several shallowly.
- **Tuning as a feature:** whether scale-specific tuning is wanted at all, since much of the audience may hear microtones as "out of tune" without context.
- **Whether to do W1 and W2 at the same time as the voicing rework** (they touch the same code: the pitch source, voicing and `detune`) or afterwards.

## 8. Sources
[Maqam analysis, Abu Shumays](https://maqamlessons.com/analysis/media/MaqamAnalysisAPrimer_2013WebFormat.pdf), [Arabic maqam overview](https://EN.wikipedia.com/wiki/Arab_maqam), [Introducing maqamat](https://www.artsrn.ualberta.ca/ccewiki/index.php/Introducing_maqamat), [Hindustani raga elements, NIOS](https://www.nios.ac.in/media/documents/Hindustani_Music_242/hindustanimusictheorybook1/HMB1Ch2.pdf), [Hindustani ragas overview](https://artiumacademy.com/music-theory/hindustani-classical/ragas), [Music of Java](https://en.wikipedia.org/wiki/Music_of_Java), [Britannica, gamelan](https://www.britannica.com/art/gamelan), [Ritsu and ryo scales](https://en.wikipedia.org/wiki/Ritsu_and_ryo_scales), [Britannica, Japanese tonal system](https://www.britannica.com/art/Japanese-music/Tonal-system), [Chinese heptatonic scales, EPFL](https://www.epfl.ch/labs/dcml/tong-yun-san-gong-a-step-by-step-demonstration-of-the-evolution-of-chinese-heptatonic-scales/), [Bell pattern](https://Www.Wikipedia.org/wiki/Bell_pattern), [Meter, feel and phrasing in West African bell patterns (Asante Kete)](https://journal.ru.ac.za/index.php/africanmusic/article/view/2196), [Heterophony](https://en.Wikipedia.com/wiki/Heterophony), [Modal harmony in Andalusian, Eastern European and Turkish music](https://www.cambridge.org/core/journals/yearbook-for-traditional-music/article/abs/modal-harmony-in-andalusian-eastern-european-and-turkish-syncretic-musics/11C81128E97F27F2B2202511A25E9909). A proper study would add primary texts (for example Marcus on maqam, Bor on raga, Becker on gamelan, Nketia and Agawu on African rhythm); those were not reached here.
