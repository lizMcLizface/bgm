# Krumhansl (1990) — Cognitive Foundations of Musical Pitch: probe-tone profiles

Source PDF: `docs/ref/Cognitive foundations of musical pitch (Krumhansl, Carol L) ....pdf`.
Read: ch. 2 probe-tone method and Table 2.1 (book pp. 29–31). Not yet read: chord and
key-distance chapters (ch. 7–8), the Krumhansl–Schmuckler key-finding algorithm,
melodic/hierarchy studies.

## Method
Listeners hear a key-defining context (a scale or chord cadence), then one probe tone
from the chromatic octave, and rate how well it fits (1 = very bad, 7 = very good).
Result (Krumhansl & Kessler 1982): a stable *tonal hierarchy* that follows music
theory and also correlates with how often tones occur in music.

## Table 2.1 — probe-tone ratings (tonic = C)
| pitch class (relative to tonic) | major context | minor context |
| --- | --- | --- |
| 0 tonic | **6.35** | **6.33** |
| 1 (♭2) | 2.23 | 2.68 |
| 2 | 3.48 | 3.52 |
| 3 (♭3) | 2.33 | **5.38** |
| 4 (3) | **4.38** | 2.60 |
| 5 | 4.09 | 3.53 |
| 6 | 2.52 | 2.54 |
| 7 (5) | **5.19** | **4.75** |
| 8 (♭6) | 2.39 | 3.98 |
| 9 (6) | 3.66 | 2.69 |
| 10 (♭7) | 2.29 | 3.34 |
| 11 (7) | 2.88 | 3.17 |

(Checked against the rendered page of the book.)

Ordering for major: tonic > fifth > third > fourth > sixth > second > leading tone >
other chromatic tones. For minor: tonic > ♭3 > fifth > ♭6 > ♭7/4 > the rest. In minor
the third scale degree outranks the fifth; the text suggests this reflects the
relative major being close.

Four-tier hierarchy for major: (1) tonic, (2) the other tonic-triad tones (3, 5), (3) other
diatonic tones, (4) chromatic tones.

## What it means for us
1. **A ready-made stability weight for strong beats.** Replace the binary
   "chord tone or pay `chordCost`" in `searchPhrase` with a graded cost: tonic-
   triad tones < other chord tones < other scale tones < chromatic. Rank by this
   table (or its four-tier simplification). Mixing it with the chord-tone test
   keeps non-tonic harmonies working: stability relative to the *key* matters at
   phrase ends; stability relative to the *current chord* matters mid-phrase.
2. **Ending note.** Probe-tone ratings are consistent with Temperley's need for a ×20 tonic
   boost at phrase endings (see his note). Use tonic or the strongest available scale
   tone at closing phrase ends; use third or fifth for settled open endings.
   `leadEnding: 'open'` already prefers the chord's fifth or the scale's second; the table
   supports fifth > second (5.19 vs 3.48) as the more stable of the two.
3. **Modes beyond major and minor.** The profiles exist for Ionian and Aeolian only.
   For other modes (Dorian, Mixolydian, Phrygian, pentatonics) a defensible
   approximation is: tonic, then the mode's third and fifth, then the other scale
   degrees, then non-scale tones, using the major or minor profile as a template
   according to the mode's third. Flag this as unverified for those modes.
4. **Do not over-apply.** The ratings come from Western listeners hearing a key
   context; for deliberately unresolved or atonal presets they should be switched
   off, as the existing atonal and "unresolved" progressions already do.
