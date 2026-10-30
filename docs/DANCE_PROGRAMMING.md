# House, tech house and trance programming: what the guides agree on

Read 2026-10-30 for the step sequencer presets (`src/app/sequencer.js`). Most are tutorial blogs, so these are conventions, not rules. The Ben Rainey tech-house page is a sales page and has no technique content.

Sources: [Violet Recording, how to make house beats](https://violetrecording.com/how-to-make-house-beats/), [Sample Focus, tech house in the style of Chris Lake](https://samplefocus.com/blog/make-tech-house-track-chris-lake/), [Beatportal, producing tech house](https://www.beatportal.com/articles/692607-step-by-step-guide-to-producing-tech-house-like-fisher-chris-lake-cloonee-and-michael-bibi), [MusicRadar, techno effects](https://musicradar.com/how-to/techno-effects), [MusicRadar, progressive house eighth-note chords](https://musicradar.com/how-to/how-to-program-progressive-house-eighth-note-chords) (search summary only), plus trance and arrangement search summaries.

| Topic | Convention | In the sequencer |
|---|---|---|
| Tempo | house and tech house 120-128 (126 common), trance 128-145 | presets 116-138 |
| Drums | kick on every beat, clap on 2 and 4, open hat on the off-beat eighths, closed hat on sixteenths or eighths, syncopated shakers | beat recipes plus a default syncopated shaker for House and Techno |
| Groove | swing 8-20% on the sixteenths (about 10 to start); hat velocities vary | House and Techno swing at least 0.55; hats and small percussion get accent/off-beat/random velocities |
| Variation | a fill or roll every 8 or 16 bars; drop the kick for a bar before it returns | `fills`: Fill stage every 8th bar, kick out on every 16th; kick cut on the last bar of a Build chord |
| Bass | syncopated into the gaps between kicks (off-beat eighths, sixteenth pickups); trance: off-beat eighths; round and low-passed; sidechained to the kick | House/Techno bass default `..x...xx..x...xf`, the rolling run only on Drop; kick pump |
| Chords and stabs | short stabs, sevenths and ninths, pulsing eighths; simple repeated motif with a small change every 4-8 bars | lanes with variation, add9 colour, short-decay stab voices |
| Delay | tempo-synced eighth, 20-30% feedback; automate feedback up for a transition and back before the next section | bus delay at an eighth; Build moves run dotted eighth to sixteenth |
| Arrangement | intro 8-16 bars (drums, FX), build 16, drop 16, breakdown 8-16 and short; remove and restore parts by automation instead of adding melodies; filter sweep over the last 8-16 bars of a build; reverb/delay swell, then cut at the drop | stage per chord; moves per stage |

Added after: a sweepable low-pass / high-pass on the whole mix (`filter.*` moves, `engine/sweepFilter.js`, off unless a move uses it) and portamento (`settings.portamento` per lead / second lead / bass, `composition/portamento.js`, a slider per voice). Not done: a snare roll that accelerates, filter moves in offline renders, and 8-16 bar section lengths (a stage lasts as long as its chord).

## Melody in dance music (2026-10-30)

The sequencer presets were all rhythm: the chord lane played 4-12 notes a second at a median of 0.08 s, so the stabs were the tune and the lead had no room. Sources are thin, again tutorial blogs ([EDMProd, melody guide](https://www.edmprod.com/ultimate-melody-guide/), [Future Proof, EDM songwriting](https://futureproofmusicschool.com/blog/how-to-write-an-edm-song), [Icon Collective, melodies](https://www.iconcollective.edu/writing-melodies-tips), [Production Music Live, progressive house](https://www.productionmusiclive.com/blogs/news/tagged/progressive-house)). What they agree on:

- A hook is a short motif, four to eight notes, repeated with a small change (a rise after a fall, a different last note), not a long line.
- Mix long and short notes; rests and a held last note make a phrase. Write the rhythm first, keep strong notes on chord tones.
- Call and response: a 2- or 4-bar phrase, then an answer that changes a note or a rhythm.
- Deep house and trance melodies are chord-based; trance hooks are long supersaw notes over the plucks, and the chords hold in the breakdown.

How the presets use it (trance uses the chord row's held `h`, stacked `s` and arpeggio `a` steps, see `sequencerLanes`): the lead plays quarter notes and longer (`leadDensity` 0.1-0.25, `leadRepeat` 0.75-0.85), the chord lane has 2-3 hits a bar (`edits` rows) instead of a run, and trance and progressive use the `thematic` form (statement, answer, development, return) by keeping `bassWeights` off `drive`. The chord lane is what the sequencer plays, so `padWeights` does nothing in these presets; the rows, `gate` (up to 4 beats) and `variation` do. Open: the lead's note lengths come from the rhythm model (about a beat), so half- and whole-note trance hooks need a lead-length setting.
