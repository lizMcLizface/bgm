# Tymoczko (2011) — A Geometry of Music: five features, macroharmony, centricity

Source PDF: `docs/ref/A Geometry of Music_ Harmony and Counterpoint in the ... .pdf`
(Oxford). Read: ch. 1 intro (book pp. 3–5, the five features), ch. 5.3 (pitch-class
circulation, pp. 158–160) and 5.7 (where centricity comes from, pp. 177–181). Not read:
ch. 2–4 (voice-leading geometry, scales), ch. 5.5–5.6, part II (history, functional
harmony, ch. 7.4 modulation and key distance). Those would bear on key-lift/drift.

## The five features (jointly "tonality")
1. **Conjunct melodic motion** — short steps between notes.
2. **Acoustic consonance** — consonant harmonies preferred, used at points of stability.
3. **Harmonic consistency** — the chords in a passage are structurally similar.
4. **Limited macroharmony** — the total set of notes heard over a moderate span stays
   small, often 5–8 pitch classes.
5. **Centricity** — over a moderate span one note is more prominent and serves as a
   goal of motion.
Claim: the five features constrain each other heavily; combining conjunct motion with
harmonic consistency leaves few options (consonant sonorities), and combining consistency
with limited macroharmony leads to the familiar scales and modes. So all tonal styles
(jazz, rock, minimalism included) reuse the same few techniques. Other features can be
dropped on purpose (chromatic, acentric music).

## Pitch-class circulation (5.3): a measurable macroharmony size
For a piece, slide a window of N consecutive note attacks and average the number of
distinct pitch classes. Bach's F-major invention averages 1.9, 2.4, 2.9, 3.4 … distinct
pitch classes for windows of 2, 3, 4, 5 notes (rising ~0.5 per note), reaching 5.6 at 10
notes. Curves for known pieces:
- Palestrina rises fast then flattens at ≈ 7 (diatonic) with a slight slope;
- Mozart, Beethoven, Brahms, Wagner rise quickly then level off much more gradually
  (modulation brings fresh pitch classes slowly; "a typical 10-note excerpt contains
  roughly half the pitch classes of a 100-note excerpt");
- Webern's twelve-tone Op. 27 plateaus at 12.
Caveat in the book: attack-based counts are affected by tempo, repeated notes and
tremolo, and need simultaneous attacks to be linearised.

## Where centricity comes from (5.7)
Tymoczko favours the *external* view: a note becomes the centre because of how it is
used, not because of the scale. Seven means (E1–E7):
- E1 appear more frequently; E2 be held longer; E3 be accented dynamically;
- E4 be accented rhythmically; E5 be melodic high or low points;
- E6 be the target of stepwise motion, especially converging contrary-motion steps;
- E7 be doubled at the octave or paired with the fifth above.
Internal cues exist but are weak (a note with a consonant fifth above is a likely
tonic: Huovinen's experiments; avoiding tritone and minor-second clashes with the
rest of the collection). He reports being able to make "virtually any note of virtually
any collection sound like a tonic" by repetition, duration, loudness and stepwise
approach; diatonic music can be acentric, chromatic music can be centric.

## What it means for us
1. **Centricity is a controllable recipe for any mode.** For Dorian, Phrygian, pentatonic
   and invented scales, build tonic feel with E1–E7: put the centre note on strong beats
   and in the bass, hold it longer, make it the target of stepwise approaches and of
   the melodic range's high/low points, and double it at the octave/fifth in the pad.
   This is the concrete form of the centricity rule in `../MUSIC_THEORY_GROUNDING.md`
   §2.4, and works without relying on any major/minor profile.
2. **Measure macroharmony in the audit.** Compute pitch-class circulation (average distinct
   pitch classes in windows of 2–100 notes) for each preset and compare to known
   curves: diatonic presets should plateau near 7 with a gentle slope; pentatonic near
   5; "atonal" presets should hit 12 quickly. A preset that drifts upward in the
   long window is modulating or leaking foreign tones, intentionally or not.
3. **Key drift/lift as macroharmony change.** Prefer moves that change only a note or
   two of the pitch-class set (circle-of-fifths neighbours share most notes; recalled from
   the book's scale chapter, unverified here), and let the rate of fresh pitch classes per bar be
   a tunable "harmonic activity" curve (cf. Medina-Gray's 5-second/1-second rule).
4. **Consonance at stability points.** Use consonant sonorities where the music rests
   (phrase ends, section arrivals) and allow the dissonances in passing positions; this
   matches the Plomp–Levelt audit and the resolution rules.
5. **Harmonic consistency.** Keep chord types in a passage similar (all triads, all
   sevenths, all sus/add9) instead of mixing densities randomly. Our `chord-colour` rule
   could be forced consistent within a phrase rather than per chord.
