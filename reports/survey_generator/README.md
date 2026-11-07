# Generator preset survey

The report at `/reports/survey_generator/` inventories the browsable built-in
front-page soundscapes with music enabled, not the individual synth library. It
uses Latest generation and one fixed seed, 17321, for 256 consecutive bars per
preset. Music-off ambience-only scenes, hidden historical scenes and
user-saved scenes are excluded from all report statistics. The captured
database still contains the music-off scenes so it can be reanalysed.

To refresh the snapshot after generator or preset changes:

```powershell
npm run survey:generate
npm run survey:analyze
```

The first command plans notes without rendering audio, using the existing
offline audit's audio stubs. It writes `data/notes.jsonl.gz`, one JSON object
per preset. `SURVEY_BARS` and `SURVEY_SEED` can override the default sample;
use at least 250 bars for the published survey. The second command reads that
database, not the generator, and writes `data/survey.json`. Both files are
needed for the report. The compressed database is downloadable from the page.

The capture uses the scene's named sound and instrument-specific planning
properties where they can be resolved. External voices are reported as
unresolved because their asynchronously loaded instruments are not recreated
by the offline audit. The report separates configured rule values, the
rulebook's eligibility status, and measured events; enabled or eligible does
not imply a rule actually fired. Grouped controls are configuration only.

Counts describe this sample, not the entire generator's possible output.
Event counts omit muted roles but do not simulate zero
volume, individual drum levels, instrument envelopes or effects. Style counts
use chord-source metadata, which is not present on all events; onset
signatures include those events separately. The report explicitly documents
its grouping tolerances, denominators, and the distinction between written
gates and playback-only modifications. In particular, progression-boundary
crossings are gate/boundary intersections in time, not audio release tails or
chord-change counts.

The sequencer comparison groups tagged pad/rhythm events by role and bar,
as the current generated-chord capture does. This and the voicing analysis
exclude presets explicitly set to atonal; the rest of the report does not.
The comparison tests captured MIDI pitches and quarter-unit-rounded attacks
against both the stored raw notes and the existing generated-chord conversion
with its default inferred controls. Normal playback uses the raw captured notes;
converting to an editable placed chord occurs on editing a generated chord.
Each bar is
captured in isolation with empty following bars, so later attacks cannot cut
its ties and this is not a whole-song round trip. Untagged events
are excluded; the report counts both wholly untagged and partially tagged
role-bars. This is not a test of every possible control setting, nor of the
proposed future style selector. It does not compare gates, velocities,
detuning or expression. The database does not contain pre-transformation
events, so it cannot identify how many chords were changed by generator
transformations.
Reference diagnostics check the tagged source root and the converter's root
against the opening written chord independently per role-bar. Split bars are
excluded from the structural comparison. For agreeing roots, the complete
default generated triad is compared with the written chord's pitch-class set,
separately from the union of captured pitches actually attacked in that bar.
The default triad does not infer sevenths, ninths or other chord alterations;
the latter union can omit tones when they were never attacked in that bar.
Pitch and attack comparisons are shown separately: MIDI pitch sets preserve
octave distinctions, while attack-position sets ignore pitch and repetition.
Pitch-class differences distinguish root-only additions or removals from
other changes; the latter can still include a root difference.

The chord-parameter survey describes each tagged, tonal, single-chord pad or rhythm
role-bar the way a sequencer chord track would store it (tools/generatorSurveyParams.js).
Everything is read from pitches, attack times (clustered within 0.06 of a unit) and note
lengths, never from the generator's style names; those are only cross-tabulated with the
observed play mode as a check. The voicing is matched against every setting of the sequencer's
placed chord (complexity x colour x root voicing x inversion, via placedChordTones): an
exact fit has the same pitches, a class fit only the same pitch classes. Misfits are
split into outside notes, a chord outside the sequencer's set, doubled tones, omitted tones
the chord track cannot omit (the fifth), and wide spacing. An arpeggio's octave-up copy of
its bottom note is dropped before matching. Inversion is the lowest sounded tone's index in
the written chord's stacked order, named by its role; a root-less chord is reported
as such (the sequencer's root voicing off), not as an inversion of a complete chord.
Omissions are measured over the whole chord slot (all bars of it), since one bar of a
running figure can be shorter than the chord; doubling and spacing are per bar.
Play mode is chord (one attack), roll (quarter-unit staggered, notes ringing together),
stack (a unit apart), arp (one note at a time), pulse (the chord struck again),
split pulse (low note held, upper notes between) and varying pulse. Direction is matched against
the sequencer's and the generator's templates, allowing a start part-way round; figures that
match none are listed as composed figures. Arpeggio rate is the median gap in steps (quarter
units), snapped to whole steps within 0.2; uneven gaps are syncopated. Hold is note
length over the gap (nearest of 1, 2, 3, or the end). A later bar of a chord is compared
with the chord's first bar as same, reversed, rotated, lifted, thinned or other
(composition/padVariation.js). The first bar of a chord may itself be a variation (odd
phrase bars vary too), so "same" is a lower bound.

Split bars show mutually exclusive counts and percentages within their named
population. Scatter plots use one point per exact numeric value: horizontal
position is the value and vertical position is its count; open "Exact values"
for the underlying table. Overlapping measures, such as evolution mechanisms
and expression fields, are tables rather than normalized split bars.
The rulebook section groups rules by the page's chapters and filters their
configured on/off and value distributions by the front-page preset category.
The on/off bar includes off choices; the value distribution excludes them.
Boolean rules show only the on/off bar. Timing setting distributions use the
same rulebook off values, which are not always zero. Quick-control stack
distributions omit the Off level. Muted or overridden choices still retain
their configured on/off value; eligibility is available separately.

Correlation matrices compare configured rulebook on/off choices per preset,
including muted, overridden and not-heard permissions as on. The selected
preset-category filter applies to both chapter and all-rule matrices. Cells
show the binary phi coefficient; hover or focus for the four joint counts.
When either rule is constant, phi is undefined rather than zero: `ON` and
`OFF` mean both are always on or always off, `≠` marks opposite choices for
every preset, and `–` any other constant case. Inspect the joint counts;
correlations do not prove a rule fired or caused another. The full matrix is
computed only when opened.

Home-mode departure counts check all captured bars for a mode different from
that music preset's home mode. Home-mode chart rows count music presets,
whereas observed-mode rows count cycle starts, so each row is normalized
separately and its denominator is displayed.
