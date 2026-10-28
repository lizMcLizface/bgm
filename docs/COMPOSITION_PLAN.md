# Composition plan

28 October 2026. The one place that lists what to build, in what order, and how to check each piece.
It draws on [MUSIC_THEORY_GROUNDING.md](MUSIC_THEORY_GROUNDING.md) (literature synthesis),
[COMPOSITION_AUDIT.md](COMPOSITION_AUDIT.md) (what the generator does now, measured) and
[theory-notes/](theory-notes/README.md) (per-source detail), plus the author's listening observations.
Nothing below has been checked by ear unless it says so.

## Ground rules (decided)
1. **Unsettled is a feature.** Progression and scale pickers exist so people can hear unusual or open harmony. Melody
   and texture follow the chosen chord. We do not pull phrase endings or notes toward the tonic. (The closure rule was
   built, measured and reverted for this reason.)
2. **Published norms are priors, not targets.** Most corpora are folk or classical. Many presets are neither, so a
   norm is used to find a *control* worth having, never as a default for every preset.
3. **Every change is an amount or a switch.** Default is off or zero, which sounds exactly as today. Presets opt in.
4. **Each piece names its test.** An audit metric, a unit test, or (for taste) a listening note. Numbers show what to
   try, not whether it sounds good.
5. **Demos live in the app**: a "Demo:" preset plus the dev server (`npm run dev`), not a separate page. Existing
   "Demo:" presets stay at defaults for every setting they do not demonstrate.

## How a new control is added (recipe from the syncopation work)
| Step | Where |
| --- | --- |
| Setting, default, clamp | `src/app/settings.js` (default and validator), destructure and pass in `Generator.js` (two places) |
| Share code, randomizer | `src/app/shareCode.js`, `src/app/randomize.js` |
| Rulebook rule | `src/app/rulebook/model.js`; **append** the id at the end of `BOOK_RULE_IDS` in `rulebook/bookCodec.js` (ids are append-only) |
| Per-preset values | `src/library/scenes.json`; hidden variants (`comparisonOf`) must share their base preset's settings (`percussionScenes.test.js`) |
| Demo | a "Demo:" preset with the control set mid-way |
| Measurement | a metric in `tools/compositionMetrics.js`, shown in `tools/compositionAudit.audit.js`; `AUDIT_<NAME>=x` forces a value for sweeps |
| Tests | a unit test for the pure function; `npm test` must stay green |
| Suitability | a row in [Where each rule belongs](#where-each-rule-belongs): styles and ensembles that suit it, those that do not, presets using it now, presets that would benefit later |
| Share code | append a **new group** at the end of `MUSIC_GROUPS` in `shareCode.js`; never add to an existing group (the layout is append-only) |

## Checking that defaults are unchanged
With a new rule off, a preset must plan exactly the notes it planned before the rule existed. Check it against a git ref:
make a worktree of the ref (`git worktree add <dir> <ref>`, with `node_modules` linked or junctioned in), copy
`tools/planDump.audit.js`, `tools/auditSetup.js` and `tools/vitest.audit.config.js` into it, run
`PLAN_OUT=<file> npx vitest run --config tools/vitest.audit.config.js tools/planDump.audit.js` in both trees, and compare the two
JSON files (a sha1 of each preset's planned notes, for presets that carry none of the new settings). On 28 October 2026
all 158 entries (79 presets, 2 seeds, 48 bars) matched the last commit. The check found one real difference when first run:
voice leading across a change of chord size, which now only applies when the pad rules are on.

## Status
| Item | State |
| --- | --- |
| Offline audit (`npm run audit:composition`), pad audit (`tools/padAudit.audit.js`) | done |
| A1 Syncopation control `leadSyncopation`, 44 presets seeded, Demo: Groove slider | done, heard and liked; uncommitted |
| C1 Pad root rule `padRoot`, C2 chord size by function `chordSize`, voice leading across size changes; 38 and 15 presets seeded; Demo: Pad and bass | built, tests green, **not yet heard**; uncommitted |
| B1+B2 Melodic inertia `leadInertia` (step carry-on, descending bias, leap lengthening); no presets seeded yet | built, tests green, **not yet heard**; uncommitted |
| C3+C4 Pad contour `padContour` (register arc over a phrase, top voice against the bass); no presets seeded yet | built, tests green, **not yet heard**; uncommitted |
| B5 Tendency tones `leadTendency` (held leading tone to the tonic, held fourth down to the third); no presets seeded yet | built, tests green, **not yet heard**; uncommitted |
| A6 Longuet-Higgins & Lee syncopation metric, E6 section-seam scoring, tendency metric (all in the audit) | done |
| A4 Euclidean bass figures `bassEuclid` (share of phrases whose grouped or driving bass plays an evenly spread figure); no presets seeded | built, tests green, **not yet heard**; uncommitted |
| E2 Corpus-weighted borrowing `borrowStyle` (even / corpus; weights the flat VII and VI above the minor iv); no presets seeded | built, tests green, **not yet heard**; uncommitted |
| D1 Slow pad vibrato `padVibrato` (pads and second leads that are oscillator sounds with no vibrato); no presets seeded | built, tests green, **not yet heard**; uncommitted |
| G1 Generated progressions (`progressionMode`, `progressionMood`, `progressionWander`; `composition/progressionGen.js`; Demo: Generated chords) | built, tests green, **not yet heard**; uncommitted |
| Rule-suitability registry `src/app/rulebook/suitability.js` (data + `suggestRules`, validated against the rulebook and library) | done |
| Unchanged-defaults guard `tools/planDump.audit.js` (see below) | done: 158 of 158 plans identical to the last commit with the rules off |
| Conflict check `tools/ruleConflicts.audit.js` (all rules alone and together over every music preset) | done: no crashes, no new violations (see Interactions and limits) |
| Everything else below | not started |

## Baseline measurements (current output)
From the audit, 118 music presets unless noted:

| Measure | Now | Reference |
| --- | --- | --- |
| Lead steps that continue downward after a descending step | .40 | ≈ .70 folk (Huron 2006) |
| Lead: unison / step / leap ≥ 5 semitones | .23 / .45 / .08 | Vos & Troost .12–.18 / .53–.55 / .10–.19 |
| Lead pitch variance in a 4-bar window; median pitch | 3.4; MIDI 79 | folk melody 10.6; MIDI 68 |
| Lead syncopation per bar, lead alone, dense presets, amount 0 / 1 | 0.43 / 1.22 | no target; Witek: medium is best for groove |
| V→I arrivals preceded by a seventh chord | .53 | .76–.88 classical final cadences |
| Exact bar repeats, all tracks (per layer) | .055 (perc .92, bass .65, pad .42, lead .18) | game music .63 |
| Chord size: triad / seventh / ninth / mixed (119 presets, music only) | 58 / 33 / 3 / 25 | – |
| Pad contains the chord root; and bass sounds it the same bar | .96; .93 (before the root rule was seeded on 38 presets) | – |
| Same measures after seeding (current library) | pad span 10.75, voices move 1.83 semitones per chord change | – |
| Pad span (semitones); lowest pad note (mean MIDI) | 9.9 (p10–p90 7.9–13.1); 60 | – |
| Mean voice movement at a chord change (semitones) | 1.41 | – |
| Bars with a close low pair below C4 | median .12 (worst presets .55–.86) | Huron/Plomp–Levelt: avoid |
| Pitch-class circulation at 100 attacks | 7.7 (diatonic should plateau near 7) | Tymoczko |

## Workstreams

### A. Rhythm and groove
| # | Change | Evidence | Where | Default and test |
| --- | --- | --- | --- | --- |
| A1 | **Syncopation amount** (anticipation, late downbeat; bass at 60%; cadence bar least) | Witek; Longuet-Higgins & Lee; GTTM MPR 7 | `composition/syncopation.js`, `arrangerLatest.js` | **Done.** 0 default; lead-alone Keith .43→1.22 |
| A2 | Sentence-style density: lead onsets rise across the continuation bars, strip at the cadence | Caplin 2013; audit shows flat .97/1.03/.89/.97 | `arrangerLatest.js`, `themeDevelopment.js` | New `leadDensityArc` 0–1; audit density by phrase position |
| A3 | Couple rubato to syncopation: less rubato as the score rises | Temperley 2007 | `rubato.js` | Lint in the audit first; change only if it clashes by ear |
| A4 (built, bass only) | Euclidean cells as a source for new groove and bass cells | Toussaint 2013 | `percussion.js`, `ensembleRhythm.js` | Optional; unit test that cells are maximally even |
| A5 | Merged-grid syncopation band for groove presets (mutation accepted only inside a band) | Witek | `rhythmDevelopment.js` | After A1 has been lived with |
| A6 (built) | Longuet-Higgins & Lee syncopation as a second metric | syncopation note | `tools/compositionMetrics.js` | Audit-only |

### B. Melody
| # | Change | Evidence | Where | Default and test |
| --- | --- | --- | --- | --- |
| B1 (built) | **Melodic inertia** `leadInertia` 0–1: continue a step in the same direction, with a mild extra pull toward the descending side; penalise reversals right after a step | Huron 2006 (≈ .70 continue after a descending step); Schellenberg proximity; Vos & Troost | `phraseMelody.js` (`searchPhrase` cost), `arrangerLatest.js` (`realiseThemeBar` cost); signature in `planPhraseMelody` | 0 default. Audit: descend-after-descend and ascend-after-ascend shares; unison and step shares must not collapse |
| B2 (built, in `leadInertia`) | Leap lengthening: a large leap lands on, or leaves from, a longer note | Huron PR12 | `phraseMelody.js` | Same switch as B1 or `leadLeaps`; audit short-to-short leap share |
| B3 | Central pitch per phrase and range curve, so lines drift less and use their register | Temperley 2007; audit variance 3.4 vs 10.6 | `phraseMelody.js` | Option `leadCompass`; only meaningful for lead voices with a range; listen first |
| B4 | Graded tonal stability prior on strong beats and the fifth/tonic balance (optional) | Krumhansl; audit degree profile (tonic .31, fifth .08 in major-like presets) | `phraseMelody.js` | Off by default so open, modal and unsettled presets keep their colour; offer for folk, game and classical-leaning presets only |
| B5 (built) | Tendency-tone resolution inside the beam (7̂→1̂, 4̂→3̂) | Krumhansl; Huron | `resolution.js` | Opt-in per preset |
| B6 | Surprise meter: n-gram entropy along phrases, used as a lint, not a generator | Pearce | `tools/` | Audit-only |

### C. Pad, chord texture and voicing (from listening notes, 28 Oct)
| # | Change | Evidence | Where | Default and test |
| --- | --- | --- | --- | --- |
| C1 (built) | **Pad root rule** `padRoot`: *always* (today), *unless the bass plays it*, *never*. Sevenths drop to 3-5-7(-9); triads replace the root with the third or ninth doubled | Huron: octave doubling fuses voices (PR19–23); root is the most doubled tone in common practice (Huron 1993 via Aarden & von Hippel); rootless voicings are standard jazz practice (convention, not research). Measured: root in pad .96, in both pad and bass .93 | `arranger.js` (pad voicing, `voiceLead` in `theory.js`); the pad keeps its previous voicing between chords, so a changing note count needs care | Per preset: piano or keys with bass may keep *always*; guitar or pad with bass use *unless*. Audit: root-in-both share; unit tests for the voicings |
| C2 (built) | **Chord size by function** `chordSize` *uniform* (today) / *functional*: `padNotes` is the maximum; V (and dominant-function chords) take the seventh, other chords take triads, a major seventh only where chord colour asks | Classical final cadences carry V7 .76–.88; Mauch et al. 2015 on seventh types in pop; Tymoczko: keep chord types consistent *within a passage*, so choose by function, not at random | `Generator.js` `buildChord` (size is global `padNotes` today) | Audit: seventh share by numeral; V→I seventh share (.53 now) |
| C3 (built, in `padContour`) | **Register arc and span**: per-phrase rise and relax; widen the pad span toward a target (today ≈ 10 semitones) | Tymoczko E5 (high and low points as goals); Huron spacing | `arranger.js` (`padLift` and the target in `voiceLead`), `chordSpread` | Audit: span, lowest note, register over a phrase |
| C4 (built, in `padContour`) | **Outer-voice contrary motion**: prefer the pad's top voice moving against the bass | Huron PR17 | `theory.js` `voiceLead` score | Audit: share of chord changes with contrary outer voices |
| C5 | **Pad subset per attack**: play root and fifth on the beat, upper tones on offbeats, instead of the full chord every time | Mood cues (density drives arousal); Margulis (varied repetition) | pad styles in `arranger.js` and `padVariation.js` | Option per pad style; audit pad onsets per bar and notes per attack |
| C6 | Roughness-based low spacing for close pairs below C4 | Plomp–Levelt; Huron PR4/5 | `theory.js` `voiceLead`, bass-under-pad | Presets listed in COMPOSITION_AUDIT.md §7 (Mild Vacuum, Open Mic Pad, Soft Landing …) |

### G. Generated progressions (from the author, 28 Oct)
| # | Change | Evidence | Where | Default and test |
| --- | --- | --- | --- | --- |
| G1 (built) | **Generated progression**: chords drawn from the rock corpus's chord-to-chord counts (first-order chain over root classes), bent by three mood controls, checked against hard limits, one new draw per cycle with a chosen chance | de Clercq & Temperley 2011 Tables 2-3 (symmetric, distance-weighted, not directional); Eerola (mode is the main happy/sad axis, so brightness here moves chords within the chosen mode, not the mode); Tymoczko (consonant, small chord vocabulary) | `composition/progressionGen.js`, `Generator.generateCycle`, `chordAt` | `bank` default. Tests: determinism, hard limits, mood statistics, corpus fidelity, 6 planner integration tests, conflict sweep, unchanged-defaults guard |
| G2 | Functional grammar mode for classical-leaning and jazz presets (Rohrmeier, Steedman expansions) as a second generator | Rohrmeier 2011; Steedman 1984 | new module beside `progressionGen.js` | Not started; the corpus chain is wrong for these styles (see below) |
| G3 | Cycle-length change: let a generated cycle be longer or shorter than the library progression | – | `Generator` cycle bookkeeping (about ten places assume one length) | Not started; the cycle currently keeps the bank progression's length so nothing else has to change |
| G4 | Mood presets in the rulebook UI (a named mood sets the three sliders) | `MOODS` in `progressionGen.js` | `rulebook/model.js` | Not started; the registry already suggests a mood per style |

### D. Expression
| # | Change | Evidence | Where | Default and test |
| --- | --- | --- | --- | --- |
| D1 (built, vibrato only) | **Slow modulation for pads and strings**: vibrato, tremolo or filter motion scheduled per section on the existing effect board | No direct study found. Listeners judge a vibrato tone's pitch by its mean (Brown & Vaughn), so depth is safe for intonation; how much movement is preferred is a taste question | voice effect board, `timbreDrift`, `heldExpression` | Per voice, small by default; listen and tune. No audit metric yet |

### E. Harmony and form
| # | Change | Evidence | Where | Default and test |
| --- | --- | --- | --- | --- |
| E1 | Cadence seventh at V→I arrivals as an *option* (functional presets) | Temperley; .53 vs .76–.88 | `sectionCadence.js` | Folded into C2 |
| E2 (built) | Corpus-weighted borrowing and destinations for modal-loop presets (IV, bVII, bVI more often than random) | de Clercq & Temperley | `harmonicDestinations.js`, `progressions.js` | Audit: root shares vs corpus. Only where a preset asks for it; leave the unsettled banks alone |
| E3 | `harmonicStyle`: modal-loop vs functional grammar; backward cadence expansion | Rohrmeier; Steedman | `progressions.js`, `harmonicRhythm.js` | Large; after C and B |
| E4 | Centricity recipe for modal presets (centre by use, hold, stepwise target, double) | Tymoczko E1–E7 | `arranger.js` bass and pad, `phraseMelody.js` | Medium |
| E5 | Sentence/period function plans for phrase form | Caplin | `phrase.js`, `formStrategies.js` | With A2 |
| E6 (built, audit-only) | Seam scoring at section changes and the loop wrap | Medina-Gray | `formLatest.js`, `commonToneBridge.js` | Audit-only first |
| E7 | Exact-repeat as an *option*: repeat whole bars more where a preset wants a game feel | Hunt 2020 (.63) | `leadRepeat` already exists for the lead | Leave until heard |

### F. Mood and presets
| # | Change | Evidence | Where | Default and test |
| --- | --- | --- | --- | --- |
| F1 | Mood-cue lint for presets and the randomizer (tempo, level, timbre, articulation; minor is not a calm cue) | Eerola; sleep review | `randomize.js`, tools | Lint only |

## Where each rule belongs
For every rule: the music it suits, where to leave it off, which presets use it now, and which presets could
benefit later. This is the start of a rule-to-style map for choosing rules when presets are generated rather than
hand-made; new rules add a row, and older rules (not yet covered) should be added when they are next touched.
Preset lists were taken from `src/library/scenes.json` on 28 October 2026 (current presets only, not "previous"
or v1 copies).

### Syncopation amount (`leadSyncopation`, A1)
- **Suits.** Groove-led music with a felt pulse and a drum or bass pattern to push against: electro, synthwave,
  two-step, breaks, bossa, funk-leaning hand-percussion and swung lo-fi; game music with a driving bass (use a small
  amount, .15–.3, since folk-dance and march feels want straight lines).
- **Avoid.** Sleep, podcast-bed, ambient, drone, solo-piano and meditative presets (the sleep review lists
  syncopation as something to avoid); rubato-heavy presets (Temperley: syncopation and rubato trade off); very sparse
  leads (one note per bar cannot be pushed); compound metres, which the measure does not score.
- **Amount by style.** Straight 0; lo-fi, cozy and walking-bass jazz .2–.3; game and cinematic drive .2–.35; electro,
  two-step and breaks .3–.55.
- **Use now (38).** Wet Pavement Two-Step .55, Rainfall Breaks .5, Bossa in Seven .4, Neon Overpass .35, Oxygen
  Debt .35, Tape memories .35, Tine and Tide .35, Pint-Sized Saloon .35, and the game, electro and lo-fi presets from
  .15 to .3 (Rainy café, Late-night brushes, Desert dusk, Morning coffee, Night drive, Slightly Slower Than Light,
  Hull Breach Brunch, Mildly Alarmed, Zero Fun Zone, Big Blue-ish, Heroic Field Trip, Dark Mirror Dimension, Turnip
  Town, Block Forest, Mushroom Kingdom Commute, Tall Grass Route, Falling Blocks Folk Dance, Haunted Staircase, Robot
  Factory Rush, Boss Fight Politely, Island Shop Hours, Getaway Driver, Nightcall, Pocket Circuit, Orbital Afterglow,
  Long Way to Sunrise, Rooms Above the Clouds, Lantern Circuit, Odd-Time Lamplight, Outrun After Midnight).
- **Could benefit later.** Bittersweet Sunday and Quiet-room waltz (swung brushes, try .15), Fireside folk (try
  .1 for a lilt), Clockwork and Glass garden (shaker pulse), Sunrise in seven. Not the sleep, podcast, piano and
  drone families.

### Pad root rule (`padRoot`, C1)
- **Suits.** A sustained, plucked or rolled pad over a bass that plays the root: guitar, harp, kalimba and music-box
  pads with an upright or round bass; synth and string pads over a drive, pulse or sequenced bass (the bass owns
  the root and the pad becomes the upper structure). Works best with sevenths, where the three upper tones make a
  complete shell voicing. Widens the pad (span 9.9 to 12.2 semitones in the audit).
- **Avoid.** Piano, Rhodes and organ played with a bass (the root in both is the sound; the player would do it);
  drones, where the bass root under a string or choir pad is the point (Seaside Hearth, Altman, Wide Open Plains);
  sections where the bass drops out (the rule only acts while the bass plays, so the pad takes its root back
  there); arpeggio and sequence pad styles (they keep the
  full chord, because three notes repeat pitches).
- **Setting by style.** *Always* for piano, keys and drones; *unlessBass* for guitar, harp, plucked and synth pads
  with a bass; *never* for deliberately ambiguous or floating harmony.
- **Use now (38).** Guitar, harp and pluck: Turnip Town, Block Forest, Soggy Home Planet, Fireside folk, Slightly Lost
  Forest, Nervous Chicken Village, Glass garden. Synth and string over a bass: Neon Overpass, Outrun After Midnight,
  Outrun Lullaby, Oxygene Sunrise, Real Hero Hours, Getaway Driver, Nightcall, Oxygen Debt, Pastel Coastline,
  Pocket Circuit, Orbital Afterglow, Long Way to Sunrise, Rooms Above the Clouds, Lantern Circuit, Rainfall Breaks,
  Boss Fight Politely, Bounty Hunter Basement, Heroic Field Trip, Dark Mirror Dimension, Zero Fun Zone, Big
  Blue-ish, Robot Factory Rush, Tall Grass Route, Haunted Staircase, Falling Blocks Folk Dance, Hull Breach
  Brunch, Mildly Alarmed, Slightly Slower Than Light, Night drive, Study session, Tape memories.
- **Could benefit later.** Any new guitar, harp, kalimba or plucked-pad preset; any preset whose
  pad is swapped from keys to a pluck. The keys-with-bass presets that keep *always* (Rainy café, Late-night brushes,
  Dorian walk, Pint-Sized Saloon) are worth an A/B once the rule has been heard.

### Chord size by function (`chordSize`, C2)
- **Suits.** Styles where the dominant seventh does harmonic work and the other chords should stay clear:
  functional or classical-leaning progressions (ii–V–I, I–vi–IV–V), ragtime and saloon, waltz, heroic game music,
  driving cinematic and electro with a V chord. Needs `padNotes` 4 or 5, since 3 already means triads.
- **Avoid.** Jazz, bossa, lo-fi and neo-soul presets, where sevenths or ninths on every chord are the idiom (Late-night
  brushes, Late Show Lounge, Rainy café, Morning coffee, Whiteboard, Wet Pavement Two-Step); modal and unresolved
  banks with no V or vii chord (nothing would get a seventh, so the preset becomes all triads); drones and
  clusters, where thick chords are the point; sparse sleep beds (Soft Landing, Open Mic Pad), where a seventh
  on every chord is the soft colour.
- **Setting by style.** *Uniform* for jazz-like, lo-fi and ambient; *functional* for pop-functional, game, saloon
  and cinematic drive.
- **Use now (15).** Pint-Sized Saloon, Boss Fight Politely, Mildly Alarmed, Hull Breach Brunch, Slightly Slower Than
  Light, Getaway Driver, Nightcall, Real Hero Hours, Rooms Above the Clouds, Island Shop Hours, Quiet-room waltz,
  Sunday Reading, Glass garden, Night drive, Study session.
- **Could benefit later.** Chapel organ and Altman (both n4/5 with a V), Soft Landing only if a clearer cadence
  is wanted. Check with a listening A/B before adding: the effect on a progression with few V chords is small.

### Melodic inertia (`leadInertia`, B1 and B2)
- **Suits.** Lead lines that should sing as one connected line: folk, waltz, pastoral, game themes with a stepwise tune,
  lullaby and cinematic melodies. At `.5` descending steps carry on 50% of the time (41% at 0, 61% at 1, folk 70%) in
  the audit and keeps big leaps off short notes.
- **Avoid.** Arpeggiated, chip, sequence-driven and angular leads, where jumping about is the idiom (Robot Factory
  Rush, Haunted Staircase, Altman); very sparse leads (few steps to carry on); bell or percussive timbres.
- **Cost to know about.** Steps become less common (45% to 36% of intervals at full) because the beam keeps direction
  with thirds between chord tones; repeated notes stay near the baseline (22% to 26%).
- **Use now.** None yet: nothing is seeded until it has been heard.
- **Could benefit.** Fireside folk, Nervous Chicken Village, Slightly Lost Forest, Quiet-room waltz, Bittersweet
  Sunday, Mushroom Kingdom Commute, Heroic Field Trip, Tears in Weather, Sunday Reading, the piano presets; start at .4.

### Pad contour (`padContour`, C3 and C4)
- **Suits.** Sustained, rolled or pulsing chord pads that stay put for a whole phrase: strings, choirs, organs, soft
  keys, synth pads with a moving bass. It lifts the pad toward the middle of a phrase and eases it down at the
  cadence (about 0.9 semitone at full) and raises the share of chord changes where the top voice moves against the bass
  from 51% to 60%.
- **Avoid.** Drones and one-chord beds (nothing to shape); arpeggio and sequence pads (the voicing is rebuilt around
  a running figure); anything that wants the flattest, smoothest voice leading, such as sleep and podcast beds.
- **Cost to know about.** Voices move farther per chord (1.8 to 2.05 semitones on average at full).
- **Use now.** None yet.
- **Could benefit.** Wide Open Plains, Choir at sea, Seaside Hearth, Chapel organ, Piano and Pads, Real Hero Hours,
  Outrun Lullaby, Oxygene Sunrise, Heroic Strings game presets (Boss Fight Politely, Heroic Field Trip); start at .4.

### Tendency tones (`leadTendency`, B5)
- **Suits.** Tonal, resolving melodies in which a held leading tone or fourth should go where it leans: folk, pastoral,
  waltz, saloon, classical-leaning game and cinematic themes, piano, jazz-leaning lines at a light setting.
- **Avoid.** Modal, atonal or deliberately unresolved presets (leaning tones leaning nowhere is the point); drones and
  ambient beds; chip and arpeggio leads. It only acts while note resolution is on and never moves a phrase's last note.
- **Effect.** A held leading tone goes to the tonic 33% of the time at 0, 47% at 0.5 and 62% at 1; a held fourth
  steps down 13%, 34% and 58%. Strong-beat chord tones are unchanged.
- **Use now.** None yet.
- **Could benefit.** Fireside folk, Quiet-room waltz, Heroic Field Trip, Solo Grand, Pure Piano, Tears in Weather,
  Pint-Sized Saloon; start at .5 (.3 for jazz-like presets).

### Euclidean bass figures (`bassEuclid`, A4)
- **Suits.** Grid-based music with a grouped or driving bass: electro, synthwave, two-step, breaks, bossa, game drive
  and lo-fi. Three or five hits across eight steps (the tresillo and cinquillo family) spread the weight evenly, so it
  reads as a groove without the bass sitting on every beat.
- **Avoid.** Walking, whole-note and drone basses (the rule leaves them alone anyway), jazz and saloon, sleep and podcast beds.
- **Effect.** Bars whose bass onsets form an evenly spread set go from 55% to 78% at 0.5 and 96% at 1. The bar's first hit is kept and the
  last hit keeps the original approach note into the next chord.
- **Not done.** Drum patterns are untouched; Euclidean cells for percussion would be a separate piece of work in `percussion.js`.
- **Use now.** None yet. **Could benefit.** Demo: Bass figures, Pastel Coastline, Island Shop Hours, Turnip Town, Sunrise in seven; start at .3.

### Corpus-weighted borrowing (`borrowStyle`, E2)
- **Suits.** Functional or modal-loop presets that already borrow chords (`chordBorrow` above 0) and want the borrowed chords to be
  the ones pop and rock use: the flat VII most, then the flat VI, with the minor iv least.
- **Avoid.** Jazz, atonal and deliberately unresolved presets, where any chord may be borrowed on purpose.
- **Effect.** Small on the library as a whole, because progressions set most chords and borrowing only touches eligible slots: at
  `chordBorrow` .5 the flat VII share goes from 10.1% to 10.4% and the flat VI from 13.4% to 12.8% (corpus 8.1% and 4.0%). It changes
  which chord is borrowed, not how often. The ordering weights come from the corpus counts for VII and VI; the iv weight is a judgement.
- **Use now.** None. **Could benefit.** Heroic Field Trip, Boss Fight Politely, Outrun After Midnight, Neon Overpass, once borrowing is on in them.

### Slow pad vibrato (`padVibrato`, D1)
- **Suits.** Sustained oscillator pads and second leads that have no vibrato of their own: ambient and cinematic beds, synthwave and drone pads. Up to 6 cents
  at 0.3–0.8 Hz at full, so it reads as a slow shimmer, changing every 8 bars like the timbre drift.
- **Avoid.** Podcast and sleep beds that should not move, chip and arpeggio pads, sounds that already have vibrato. FM, piano, plucked,
  Wasm, classic and DIY sounds are skipped by the same safety rule as the timbre drift, so it reaches 39 of the 133 scene pads.
- **Not done.** Tremolo and auto-pan: the motion stage is only in the signal chain when a preset already has it, and the drift path does not rewire the chain.
- **Use now.** None. **Could benefit.** Deep night, Slow motion, Breathing room, Mild Vacuum, Dig Straight Down, Wide Open Plains, Seaside Hearth, Lamplight,
  Tears in Weather, Oxygene Sunrise, Real Hero Hours, Outrun Lullaby, Getaway Driver, Nightcall, Altman; start at .3.

### Generated progressions (`progressionMode`, G1)
- **How it works.** A first-order chain over chord states, with the weight of each move taken from the corpus count for that root pair, scaled by the
  state's share and by a mood factor. 240 candidate cycles are drawn per request; any that repeat a chord next to itself (the wrap from last to first
  included), have too few distinct chords, too many borrowed chords or the wrong number of tonic visits for the mood are dropped; the better half by
  log-probability (wrap included) are kept and one is picked at random. Each cycle has the length of the chosen library progression.
- **Mood controls.** `brightness` -1..1 (dark favours the flat VI, flat VII and minor iv, bright favours IV, V and ii), `stability` 0..1 (below .25 the
  tonic chord is never played and the harmony is marked unresolved, so cadences, endings and key lifts treat it as the unresolved bank entries are treated;
  above .66 every cycle contains the tonic and the loop closes weighted toward it), `adventure` 0..1 (flatter probabilities, up to 3 borrowed chords and more
  different chords), and `progressionWander`, the chance that each new cycle is a fresh draw (0 keeps the first for ever). Named starting points are in `MOODS`.
- **What it produces** (400 seeds, cycles of 4 and 6 in a major key, root shares in percent against the corpus I 33, IV 23, V 16, bVII 8, bVI 4, vi 7):
  neutral I 44, IV 23, V 18, bVII 9, bVI 1, vi 4, with 63% of moves by a fourth or fifth (corpus 49%). It is more tonic-heavy and more circle-of-fifths
  than the corpus, as loops are, and it comes closer at lower stability (dreamy: I 35, vi 9, 52% by fifths). Dark gives more bVI, bVII and iv (borrowed
  1.0 per cycle against .6 neutral); tense and wandering never play the tonic.
- **Suits.** Pop, rock, game and electronic loops, ambient and sleep beds that want to drift, cinematic and lo-fi presets. Suggested moods per style are in the registry.
- **Avoid.** Jazz, saloon, waltz and bossa (the corpus is symmetric, not the directional ii-V-I of functional music: G2); presets built around a particular
  unresolved bank entry; atonal and modal-only presets. Scales without seven notes keep their library progression.
- **Minor keys.** The corpus is mostly major-key rock; for a minor key the same counts are read by scale degree (I as i, bIII as III, IV as iv with the major
  IV a quarter of the time, V as v half the time and major V half, bVI as VI, bVII as VII). That is a judgement, not a measurement.
- **Known limits.** In the library audit, generated progressions leave the strong-beat chord-tone share at 0.988 (p10 .947) against 1.000, so a few accented
  notes fall off the chord at chord changes. Key drift still moves the key and the bank index (the length is kept); Keep this stores only the bank index.
- **Use now.** Demo: Generated chords only. **Could benefit.** Deep night, Slow motion, Getaway Driver, Outrun After Midnight, Neon Overpass, Morning coffee,
  Heroic Field Trip, Fireside folk, Wet Pavement Two-Step; start with `wistful` or `dreamy` and wander .5.

### Seeded on 28 October 2026 (starting amounts, from the "could benefit" lists; heard in general, not preset by preset)
- `leadInertia` .4: Fireside folk, Nervous Chicken Village, Slightly Lost Forest, Quiet-room waltz, Bittersweet Sunday, Mushroom Kingdom Commute, Heroic Field Trip, Tears in Weather, Sunday Reading, Solo Grand, Pure Piano.
- `padContour` .4: Wide Open Plains, Choir at sea, Seaside Hearth, Chapel organ, Piano and Pads, Real Hero Hours, Outrun Lullaby, Oxygene Sunrise, Boss Fight Politely, Heroic Field Trip.
- `leadTendency` .5 (Pint-Sized Saloon .3): Fireside folk, Quiet-room waltz, Heroic Field Trip, Solo Grand, Pure Piano, Tears in Weather.
- `bassEuclid` .3: Pastel Coastline, Island Shop Hours, Turnip Town, Sunrise in seven (their hidden comparison variants share it).
- `padVibrato` .3: Deep night, Slow motion, Breathing room, Mild Vacuum, Dig Straight Down, Lamplight, Wide Open Plains, Seaside Hearth, Tears in Weather, Oxygene Sunrise, Real Hero Hours, Outrun Lullaby, Getaway Driver, Nightcall, Altman.
- `leadSyncopation` added: Bittersweet Sunday and Quiet-room waltz .15, Fireside folk .1, Clockwork, Glass garden and Sunrise in seven .2.
- Generated progressions (`dreamy`, wander .5): Deep night and Slow motion only. `borrowStyle` is not seeded (no preset has borrowing on).
- Not seeded: `padRoot` and `chordSize` beyond the earlier 38 and 15, and Demo presets, which stay as they were.

The same information is in code form in `src/app/rulebook/suitability.js` (`SUITABILITY`, `suggestRules`), with a test that
keeps it consistent with the rulebook and the preset library. Add an entry there whenever a rule is added above.

## Interactions and limits
Found by running every rule alone and together (`tools/ruleConflicts.audit.js`, every music preset, 2 seeds, 64 bars; totals go to
`.tmp/rule-conflicts.json`) and by the audit sweeps.

**Clean.** No crashes, no non-finite numbers, no pitches outside the piano, no lead overlaps (0 in all eight
configurations). Notes outside the bar are the same as without the rules (205 baseline, 190 with everything on:
long tails of running figures that already existed). Pads are empty in fewer bars with the root rule (3670 to 3288).
Strong-beat chord-tone share stays at 1.00 (p10 .957) with everything on.

**Interactions to know about.**
1. **Root rule and running figures.** A rootless chord has three distinct tones, so arpeggio and sequence pads
   repeat pitches and the existing shaping shortens one of the repeats (caught by `arpeggioContinuity.test.js`). The
   rule is skipped for those two styles; they keep the full chord.
2. **Chord size by function and cadences.** With it on, every V is a seventh chord: V→I arrivals preceded by a seventh
   go from .54 to 1.00 (classical final cadences .76–.88). Fine for functional music; a little too absolute for
   a looser feel, so a probability may be wanted.
3. **Root rule and pad movement.** The doubled-third rootless voicings have no common tone with the next chord as
   often, so voices move farther (1.4 to 2.4 semitones; 3.2 with chord size by function). This is the intended
   widening, and also the thing most likely to feel restless by ear.
4. **Inertia and step share.** Inertia raises direction carry-on but lowers the step share (see above); the repeat
   penalty keeps unisons in check.
5. **Pad contour and the register guard.** The arc target only applies while the pad is inside its register; the
   existing "one jump at a time" guard switches the target off for a bar after an octave move, so the effect is
   smaller than the setting suggests (0.9 semitone at full).
6. **Syncopation measure.** The merged-onset Keith score is hidden by a kick on every beat, so syncopation is judged
   on the lead alone; it also cannot score compound metres.
7. **Tendency tones.** Four more notes extend past the bar than without them (209 against 205 of about 215,000);
   a recorded resolution seems to protect beats from later tie handling. Harmless so far; worth a look if ties sound odd.
8. **Euclidean bass.** It plays 3–5 hits where the usual cells play 4–8, about 3% fewer bass notes overall (209,525 against 215,681).
   The bar's first hit and the approach note are kept. Not checked against percussion by ear: a bass figure that avoids the kick may
   leave gaps, or may lock to it.
9. **Pad vibrato** acts in the live engine through the drift path, so the planning sweep cannot see it. Its safety comes from reusing the
   timbre drift's `canDrift` rule and from unit tests of the values (at most 6 cents, 0.3–0.8 Hz, smooth between bars). It has not been run in the browser.
10. **Borrowing style** has a small effect on the whole library (see its entry above).
11. **Generated progressions and cadences.** An unresolved (no-tonic) generated cycle goes through the same code as the unresolved bank entries, so section cadences, endings and
    key lifts treat it as having no home. Wander above 0 changes the chords each cycle, so a form that expects a cycle to repeat (sections, bridges) sees different
    chords; it plans without errors in the sweep but the musical effect is unheard.
12. **Share codes.** New fields go in new groups at the end of the music layout; adding to an existing group would shift
   older links.

**Not checked.** Anything that depends on how it sounds: whether rootless pads are thin with a given pad voice,
whether syncopated bass fights a percussion pattern, whether inertia makes lines dull.

## Suggested order
1. **C1 and C2** (pad root, chord size by function). Small, audible, measured today, requested.
2. **B1 and B2** (melodic inertia, leap lengthening). Same pattern as A1; the audit already measures the target.
3. **C3, C4, C6** (register arc, contrary outer voices, low spacing). Touch the same `voiceLead` code.
4. **C5 and A2** (pad subsets, density arc). Texture and phrase shape.
5. **D1** (slow modulation). Listen-first.
6. **B3–B5, E1–E2, A3–A6, F1** as the earlier pieces settle.
7. **E3–E7, B6** large or speculative; revisit after a listening round.

After each step: run the audit and compare the relevant row in the baseline table, set the amount on a few
presets, listen in the dev server, then decide which presets carry it.

## Ruled out or reversed
- **Closure rule** (tonic-triad phrase endings): built, raised tonic-triad endings from .29 to .67 only by overriding the
  chosen progression's chords, and reverted. Phrase endings follow the sounding chord.
- **Folk norms as global defaults** for contour, range or degree use. Used only to size controls.
- **Directional predominant→dominant→tonic table** and an explicit **reversal-after-leap bonus** (see
  MUSIC_THEORY_GROUNDING.md §5).

## Open questions
- How much of the conductor's voice-leading (drift, lift) is already active, and why is it off in many presets? Not yet read.
- Which presets should carry which amount for each new control? Decide by ear, a few at a time.
- Pad root rule for triads: double the third, or add a ninth? Needs a listening comparison.
