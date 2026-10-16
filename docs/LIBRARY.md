# The preset library

Two JSON files in `src/library/` hold every built-in preset. Nothing else
needs editing to add one.

| file | holds | read by |
|---|---|---|
| `voices.json` | synth sounds: `{ category: { name: { ...synth parameters } } }` | `src/app/presets.js` |
| `scenes.json` | `{ categories: [...], scenes: [...] }` - whole setups | `src/app/scenes.js` |

Voice names are what share links carry (by index): **append** a new name to
`SHAREABLE_PRESETS` in `shareCode.js` when you add a voice, never reorder or
rename (a test fails if a built-in voice is missing there).

## A setup (scene)

```json
{
  "name": "Mildly Alarmed",
  "category": "starship",
  "blurb": "Battle: a driving beat, a pounding bass and a fast sequence under a brass line",
  "tags": ["ftl", "battle"],
  "settings": { "tonic": 9, "mode": "Major-6", "bpm": 136, "...": "..." },
  "voices": { "pad": "Arp Pluck", "bass": "Drive Bass", "lead": "Fanfare Brass", "counter": "Heroic Strings" }
}
```

- `settings` is a patch over the defaults - name only what differs. A
  complete settings object works too, and is what **Copy setup** produces.
  Everything goes through the same sanitising as a share link, so a bad
  value falls back to its default rather than breaking anything.
- `voices` gives each role a built-in voice by name, **or** the voice in
  full: `{ "name": "...", "synth": { every parameter } }`.
- A scene always plays with a new seed (a pasted setup keeps its own).

## Fine-tuning a preset

1. Pick the preset, change whatever you like on the page - settings, and the
   sounds in the synth editor.
2. Open **Presets** and press **Copy setup** (or **Download .json**). The
   JSON has every setting and, per voice, every synth parameter.
3. Either keep it: **Save current** stores it in this browser under *Mine*;
   or make it built-in: paste the object into the `scenes` array of
   `scenes.json`, set its `category`, and drop the `format`/`version` keys if
   you like. To also keep a tuned *sound*, move its `synth` object into
   `voices.json` under a new name and refer to it by name (and append the name
   to `SHAREABLE_PRESETS`).
4. **Paste / open…** loads such a JSON back at any time.

Your own presets live in `localStorage` (`bgm-user-setups`). Browsers can
clear that, so Copy / Download is the durable route.

---

# What FTL-style music needed, and what the engine had

Measured by planning 64 bars of every preset and counting notes per second
per voice (a throwaway test, not kept).

| FTL trait | before | now |
|---|---|---|
| Tempo 100-140 (battle), faster for racing games | slider and links stopped at **110 BPM** | 50-170; links stay compatible (extra field only when a tempo is above 110) |
| Running 8th / 16th-note synth sequences | slowest "arpeggio" only (one note per beat, 8ths now and then) | **Running sequence** pad style: detached notes in 8ths, 16ths when the lead rests |
| Pulsing, driving bass | whole bar / per beat group / walking | **Driving pulse** bass style: root in 8ths with octave and fifth jumps, leaning into the next chord |
| Electronic drum beats | heartbeat, brushes, lo-fi, shaker, downtempo - none four-on-the-floor | **Electro pulse** (four on the floor, 16th hats, clap backbeat) and **Driving** (kick / snare-like clap+rim, 8th hats, toms), with 16th snare/tom fills |
| Explore / battle layering of one theme | sections (intro, build, full, breakdown) already do this | unchanged - used by the presets |
| Cold, wide pads; bell and signal leads; analog plucks and bass | existing voices only warm / calm | 16 new voices (see below) |
| Wandering tempo kept a fast piece | pulled any piece back under 110 | wandering stays around a home tempo above the old range |

Notes per second, calm presets vs the new ones (pad / bass / lead):
"Rainy café" 2.2 / 0.7 / 0.2, "Deep night" 0.5 / 0.4 / 0.2, against
"Mildly Alarmed" 5.1 / 2.7 / 0.4 and "Zero Fun Zone" 5.4 / 3.1 / 0.3.

## Still missing

- **Lead density (partly done).** The lead used to play only 0.3-0.5 notes per
  second. "Lead busyness" (`leadDensity`) now mixes eighth- and sixteenth-note
  cells into its rhythms: the fast presets reach about 1-1.3 notes per second
  and the slower ones roughly double. A battle or racing lead plays 3-6, and the
  lead still rests between phrases and holds the last note of every motif, so
  the next step is phrases that run without those holds. Busy cells are not used
  in 6/8, where the unit is already an eighth.
- **Drums (partly done).** The *Crisp and electronic* kit (Percussion panel,
  `drums.kit`) swaps a snare, a punchy kick and a bright hat in for the brush,
  felt kick and soft hat; clap, rim, toms and cymbals stay. Still missing: tom
  rolls tuned like a kit, a gated reverb, an open hat.
- **Tempo-synced effects.** Delay times are in seconds, so an echo set for one
  tempo (0.375 s is a dotted eighth at 120 BPM) drifts off the beat at others.
  Voices cannot know the tempo; the delay time would have to follow it.
- **Sidechain pump** under the kick, **risers, reverse cymbals and impacts**
  at section changes, and **tempo or meter changes within a piece** (a battle
  theme that doubles the tempo for its chorus).
- **Composed themes.** Everything is generated from chords and rhythm cells; a
  recognisable written melody, or a specific chord progression beyond the 25 in
  the bank, is not something the generator can reproduce.
- **Orchestral and choir sounds** are synth approximations (saw strings, vocal
  waveforms), not samples.

## The new presets

Written to evoke, not copy: none of it is transcribed music. Each is a
starting point to tune with the steps above.

- **Sub-light Cruising (FTL-style):** Slightly Slower Than Light (exploring), Mild Vacuum, Distress
  beacon, Mildly Alarmed (battle).
- **Console Nostalgia:** Bounty Hunter Basement and Damp Crater (Metroid), Hyperspeed
  circuit and Big Blue-ish (F-Zero), Heroic Field Trip, Slightly Lost Forest, Kakariko
  village and Dark Mirror Dimension (A Link to the Past).
- **Sandbox worlds:** Turnip Town, Rainy Day, Chickens Inside, Pint-Sized Saloon
  (Stardew Valley), Block Forest, Dig Straight Down, Falling Stars, Mostly Harmless
  (Terraria).

New voices: Void Pad, Starlight Pad, Spore Haze, Heroic Strings, Drive
Bass, Chip Bass, Deep Throb, Racer Lead, Chip Lead, Fanfare Brass, Pan Flute,
Squeezebox, Signal Lead, Arp Pluck, Pixel Piano, Nylon Guitar.

**Not yet listened to or loudness-matched.** The tests and a browser run check
that every preset loads, plans and plays without errors, but the sounds were
written from the existing presets' parameters, and their `masterVolume`
values are estimates by analogy. Expect to adjust levels and taste by ear; the
loudness tool in `engine/loudness.js` (the same one that levels generated
sounds) can level a voice against its role.

Added later: Cold Drifts, Warm Socks and Ice Cave Echoes (icy caves) and Soggy Home Planet and Ruins in the Drizzle (rainy overworld), in the spirit of Metroid Prime's Phendrana Drifts and Tallon Overworld.

Added later still: **Synth Cinema**, film-score synth moods in the spirit of Vangelis (Replicant Blues, Tears in Weather), Jean-Michel Jarre (Oxygen Debt, Oxygene Sunrise), Cliff Martinez (Real Hero Hours, Getaway Driver, Off Duty) and Kavinsky (Nightcall, Voicemail, Outrun Lullaby), with eight new voices: CS-80 Brass, Neon Saw Pad, Night Glass, Neon Pulse Bass, Seq Bass, Lament Lead, Ghost Sweep, Outrun Lead. Written to evoke, not copy; not listened to or loudness-matched.
