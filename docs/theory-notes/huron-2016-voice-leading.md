# Huron (2016) — Voice Leading: The Science Behind a Musical Art

Source PDF: `docs/ref/Voice Leading_ The Science behind a Musical Art ...pdf` (MIT Press).
Read: ch. 5 (auditory masking, pp. 41–47) and ch. 7 (preference rules, pp. 87–~100).
Not yet read: ch. 8 (extra principles), ch. 9 (embellishing tones — passing, neighbour,
suspension, anticipation), ch. 10 (feeling of leading), ch. 11 (doubling), ch. 13–14
(streams, scene setting), ch. 16.

## Goal and two corollaries
"The goal of voice leading is to facilitate the listener's mental construction of
coherent auditory scenes." C1: parts must be **segregated** from each other.
C2: each part must be **integrated** (heard as one line). The author says this
is one goal among many, not a universal imperative. Chs. 13–14 use the same rules
to design non-chorale textures.

## Perceptual facts → preference rules (numbering is Huron's; [ ] = nontraditional)
| rule | statement (condensed) | basis |
| --- | --- | --- |
| [PR1] Toneness | Prefer harmonic complex tones for line-writing; drums/bells/inharmonic sounds are poor melody carriers | clear pitch needs a harmonic spectrum |
| PR2 Compass | Preferred region E2–G5, centred near D4 | toneness peaks 80–800 Hz, around 300 Hz |
| [PR3] Sustained sound | Prefer sustained tones in close succession; gaps over ~800 ms break a stream | continuity; fast-decay instruments play faster tunes |
| PR4 / [PR5] Spacing, Tessitura | Wider intervals between lower voices, increasingly so as the chord sits lower | critical bands widen below middle C |
| PR6–PR9 Fusion | Resist unisons > octaves > twelfths > fifths > other intervals between concurrent voices | harmonic fusion |
| PR10 Common tone | Keep a shared pitch class in one voice | |
| PR11 Conjunct | If a voice must move, prefer stepwise motion | trill boundary (~2 semitones) keeps one stream |
| [PR12] Leap lengthening | When a large leap is unavoidable, lengthen one or both notes | Fitts's law; seen cross-culturally |
| PR13 Proximity | Move to the nearest chord tone in the next chord | |
| PR14 Crossing | Resist part crossing | crossing lines are heard as a bouncing V / inverted V |
| PR15 Overlap | Resist overlap (a voice moving past the previous position of its neighbour) | |
| [PR16] Leap away | Put large leaps in the highest or lowest voice and leap away from the others | |
| [PR17] / [PR18] Semblant / parallel | Prefer contrary or oblique over similar or parallel motion; if similar motion is needed, similar rather than strictly parallel | parallel motion at a fixed interval fuses the voices |
| PR19–PR23 | Approach fused intervals (unison, octave, twelfth, fifth) obliquely or stepwise; avoid parallel perfect intervals and direct approaches | |

## Numbers worth keeping
- **Critical band** near middle C ≈ 3 semitones (a minor third), narrowing to ~2 in
  upper registers and widening quickly below middle C. Partials within one band
  mask each other. A close triad is fine in the middle and high registers and
  "muddy" in the bass.
- Fig. 5.4 (Huron 2001): average spacing of tenor, alto and soprano for four-note
  sonorities with fixed bass pitches from C4 down to C2, from over ten thousand
  sonorities in Haydn string quartets and Bach keyboard works. It is printed as musical
  notation, not a table, so only the trend can be read: the voices above a low bass are
  spaced much more widely than above a bass near C4, where they sit close together.
- **Trill boundary:** pitch jumps of ~2 semitones or less keep one stream.
- **Stream gap:** silence over ~800 ms breaks a stream.

## What it means for us
1. **Low-register spacing is real and quantified.** Our pad `voiceLead` and the
   bass-under-pad pairing should widen the bottom interval as the sonority drops.
   The book gives no cutoff; since a critical band is about a minor third near middle C
   and wider below it, close thirds and seconds in the octave below middle C are the
   cases to check first (my reading, to be set from the roughness audit).
2. **Parallel voices fuse.** The duet "line" mode with parallel thirds should be
   counted as one voice in density budgets; "answer" and contrary modes stay
   as two. `jointCounterpoint.js` penalises parallel 5ths/8ves already (PR22);
   add a small cost for any semblant motion (PR17) and a larger one for strict
   parallel (PR18), skip it for the intentional parallel mode.
3. **Leap lengthening (PR12).** Leaps should land on or leave from longer notes.
   Cheap rule for `phraseMelody.js`: leaps ≥ 5–6 semitones add a duration
   requirement, or at least penalise short-to-short leaps.
4. **Leap away (PR16)** is already close to what we want for the outer voices.
5. **Sustained-sound rule** gives a principled limit on rests in a lead that should
   read as one line: gaps beyond ~0.8 s split the stream, which is fine at phrase ends
   and wrong inside a phrase at slow tempi. Check the `rhythmGrammar` rest lengths
   in seconds, not beats.
6. **Toneness (PR1)** argues for keeping percussion and bell timbres out of the
   melodic role, or giving them short, sparse figures.
7. Treat these as defaults for clarity of lines. Ambient and pad-heavy presets that
   want blur can relax them deliberately (Temperley makes the same point).
