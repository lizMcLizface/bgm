# Mood cues, microtiming and sleep music

Source PDFs: `docs/ref/fpsyg-04-00487.pdf` (Eerola, Friberg & Bresin 2013, *Frontiers in
Psychology* 4:487, "Emotional expression in music: contribution, linearity, and
additivity of primary musical cues"), `docs/ref/fpsyg-06-01232.pdf` (Kilchenmann &
Senn 2015, *Frontiers in Psychology* 6:1232, "Microtiming in swing and funk affects the
body movement behavior of music expert listeners"), `docs/ref/frsle-4-1707162.pdf`
(Pan & Wang 2025, *Frontiers in Sleep* 4:1707162, "Elements of music that work to
improve sleep, a narrative review"). Eerola: methods and Tables 1, 3 read; Kilchenmann:
abstract and design only; Pan & Wang: results and discussion on musical elements.

## Eerola et al. 2013 — which cues carry which emotion
200 synthesised excerpts (four short pieces), six cues varied in an optimal factorial
design; 46 listeners (Stockholm and Jyväskylä) rated happy, sad, peaceful, scary.
Cue definitions, directly usable:
- **Tempo** as notes per second over all voices: 1.2, 2, 2.8, 4.4, 6 NPS.
- **Dynamics** ±10 dB in 5 steps (−10, −5, 0, +5, +10 dB).
- **Articulation** = note duration / inter-onset interval: 1, 0.75, 0.5, 0.25
  (legato → staccatissimo).
- **Register** (mean melody pitch): F3, B3, F4, B4, F5, B5 (MIDI 53, 59, 65, 71, 77, 83).
- **Timbre** by brightness (energy below 1500 Hz): flute (darkest), horn, trumpet.
- **Mode:** major ↔ minor (Aeolian) with the same key; the V–I progression became v–i.

Linear models explained 77–89% of the variance; interactions were non-existent (additive).
Standardised betas for **peaceful** (R² adj = .77), with squared semi-partial sr²:
| cue | beta | sr² | direction |
| --- | --- | --- | --- |
| tempo | −0.27 | .15 | slower → more peaceful |
| dynamics | −0.28 | .14 | quieter → more peaceful |
| timbre | −0.45 | .13 | darker (flute) → more peaceful |
| mode | +0.43 | .05 | **major** slightly more peaceful than minor |
| register | +0.15 | .06 | higher → slightly more peaceful |
| articulation | −0.10 | .01 | more legato → slightly more peaceful |
Contrasts: **happy** is mostly mode (major, β = 1.77, sr² .48) and tempo (+); **sad** is
mode (minor, β = −1.6) and slow tempo (β = −0.32); **scary** is mostly the musical
example (structure), then minor mode (β −0.74), lower register (−0.23), louder
(+0.20) and brighter timbre (+0.15).
**Table 3 (predicted / observed direction), read from the page image.** ∧ = high, ∨ = low,
= moderate, — = not significant, ▲ minor, ▼ major, open symbol = not significant:
| cue | Scary | Happy | Sad | Peaceful |
| --- | --- | --- | --- | --- |
| Register | ∧ / ∨ | ∧ / ∧ | ∨ / ∨ | ∨ / **∧** |
| Tempo | ∧ / = | ∧ / ∧ | ∨ / ∨ | ∨ / ∨ |
| Dynamics | ∧ / ∧ | ∧ / ∧ | ∨ / ∨ | ∨ / ∨ |
| Articulation | ∧ / — | ∧ / ∧ | ∨ / ∨ | ∨ / ∨ |
| Timbre | ∧ / ∧ | = / = | ∨ / ∨ | ∨ / ∨ |
| Mode | ▲ / △ | ▼ / ☐ | ▲ / △ | ▼ / ▽ |
For articulation and timbre, "low" is the legato end and the darkest timbre (flute), which
is consistent with the Table 1 signs above. Two points to handle with care:
- **Register:** the paper predicted low register for peaceful, but the observed effect was
  *high* (as in β = +0.15). Calm music is not "low" by this evidence.
- **Mode for peaceful:** Table 1 reports β = +0.43, p < .001 (major), while Table 3 marks
  the mode result for peaceful with an open symbol (not significant). The paper's own
  tables disagree; treat mode as at best a weak calm cue.

## Kilchenmann & Senn 2015 — does microtiming help groove?
160 listeners (79 experts), funk and swing clips; the asynchronies between drums and
bass (participatory discrepancies, PDs) were scaled from 0% (quantised) up to 200% of
the performed size. Experts moved more with PDs **scaled down by 60%** than with
fully quantised ones; the effect was small to moderate and only for experts.
The source performance was tight: bass-drum timing SD ≈ 10.5 ms.
Conclusion: PDs of a modest size help, quantising entirely loses some of the effect
for experts; the larger-than-performed series is not reported here (only the abstract
and design were read).

## Pan & Wang 2025 — sleep music (narrative review of RCTs and meta-analyses)
- Most effective: **slow tempo 60–80 bpm, minor tonalities (as reported), soft and smooth
  melodies, instrumental, simple structure**; 30–45 min before bed; volume 50–60 dB.
- Studies deliberately **avoided** lyrics, accented beats, percussive characteristics and
  syncopation. Rationale given: sudden stimuli startle; syncopation costs attention.
- The heart-rate "mimicry" explanation is the authors' hypothesis (cited, not tested
  here). Familiarity helps in some trials. Brain-wave music and binaural beats
  are called promising but unvalidated.
- Evidence quality: narrative review; heterogeneous populations (insomnia, ICU,
  dialysis, pregnancy). Music was usually selected by researchers' assumptions about
  what is relaxing, a bias the authors themselves flag.

## What it means for us
1. **A cue vector with real units.** Express each preset's mood in the six measured cues:
   notes/second, dynamic offset in dB, articulation ratio, mean melody register,
   timbre brightness, mode. Eerola gives usable scales; the additive model means a
   linear "calm score" is fair: low NPS, low level, dark timbre, legato, mildly
   high register.
2. **Don't equate minor with calm.** Eerola finds major slightly *more* peaceful than
   minor, while sleep trials favour minor. Treat mode as a happy/sad axis and use
   tempo, level and timbre for calm. The randomizer should not force minor for
   "calm" presets.
3. **Sleep mode / ending:** target ≈ 60–80 bpm, quiet (the review's 50–60 dB is a
   playback level, not our mix level), no accented beats, no syncopation, no percussion
   transients, few layers, simple form. This matches the existing sleep timer plus the
   syncopation-target and cadence-stability rules.
4. **Microtiming:** keep it, keep it small. Quantising to zero loses a little for
   expert listeners; exaggerating is not rewarded. A tight rhythm section (bass drum
   SD ≈ 10 ms) shows what real tightness looks like; the rulebook's "vary timing
   slightly" default (12 ms, range 0–40) is of the same order.
5. **Limit the claims.** Mood ratings come from short synthesised excerpts rated by
   46 listeners; the sleep review is narrative. Use as priors for presets,
   not as guarantees.
