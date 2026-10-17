# The interactive rulebook

Status: core UI revamp complete locally, 17 October 2026. The main interface uses the unified rulebook with instrument, harmonic and composition rows, saved-preset inheritance and guided progression. The pre-rulebook checkpoint is `f6b51d6`.

## Intent and agreed principles

The interface should explain the choices that produce the music and let someone explore them gradually. A rule is a permission or constraint, sometimes with parameters. An allowed rule need not fire in every bar.

- Presets use their complete rule set from the start. Unlocking a page reveals controls; it never changes the music or removes an unseen capability.
- Each choice can follow the preset, explicitly allow a rule, or explicitly disallow it. Reset returns to inheritance; it does not guess a new default.
- Overrides remain distinct from permissions. A disabled second lead can override duet rules. A muted voice can still have generated notes. Explicit zero activity cannot be overcome by enabling a compositional rule.
- Dependencies explain why a rule cannot currently act. They must not silently enable another voice, change a scale, turn on sections or discard the user's permission.
- A chord can have several recorded reasons. Borrowing, colouring, bridging and ending priority must accumulate rather than replacing the preceding explanation.
- Explanations describe actual decisions. A nonzero borrowing chance is not evidence of a borrowed chord. Emotion or compositional intention must not be invented after the fact.
- Chapters introduce choices, not a technical dependency order. Presets remain the fastest way to begin listening.

## First prototype

Open `/tools/rulebook.html?preset=rainy-cafe&seed=42&pages=all&page=form` for the full book, or omit `pages=all` in a fresh browser to see progressive opening. This is a functioning listening prototype with the existing generator and library sounds.

The visual direction is a readable field notebook: a quiet contents column, a paper-like chapter surface and a persistent explanation margin. Green indicates an allowed permission; amber indicates an override. Text labels carry meaning independently of colour. A compact transport, preset picker and volume remain above the book. The fluid can be shown from Listening.

| Chapter | Current prototype choices |
| --- | --- |
| Listening | Music and ambience permissions; fluid display |
| The ensemble | Second-lead mode, retained duet interaction, joint counterpoint |
| Melodic ideas | Motif development, phrase pitch planning, breathing/hold grammar, note resolution |
| Rhythm & space | Shared reference rhythm, groove development, backing breathing |
| Harmonic colour | Borrowing chance, chord colour, strict pentatonic melody, separate harmonic scale |
| The performance | Timing variation, dynamic variation, slow pitch wander |
| The long view | Sections, form strategy, tension/subdivision curves, harmonic pacing, cadences, bridges, suspensions |
| Slow evolution | Key/mode/progression/tempo drift mode |

This is an initial catalogue, not a claim that every existing control has been migrated. Instrument selection and synthesis, complete percussion controls, ambience shaping, voice ranges/style weights, wander dimensions, detailed form parameters and export/sleep controls still need a home in the final design.

### Rules and overrides

Cards show the rule's plain-language effect, permission source, effective status and relevant parameters. Prototype statuses distinguish Enabled, Off, Overridden, Muted, Not heard and Unavailable. Original retains its previous algorithms, so Latest-only permissions are unavailable there rather than pretending to work.

Permission state is retained while a prerequisite is off. For example, allow duet interaction, turn the second lead off, then enable an independent counter again: the original permission remains. Parallel harmony is also distinguished from an independent counter line. Muting is a separate output choice and does not disable the generation rule.

Preset defaults are held separately from the generator's mutable settings. Selecting another preset restores its complete rules; opening pages does not touch settings. A parameter can pass through zero and be raised again. Changing a rule shapes upcoming music; an already progressing phrase can finish coherently.

### Chord explanations

The eight-bar strip supports mouse hover, keyboard focus and selection. Hover/focus previews a bar; selection pins its actual record. Follow playback clears the selection. A narrow-screen selection brings the explanation panel into view. A pinned record survives the scrolling plan's history window.

The explanation margin shows:

- Recorded parallel-mode borrowing and applied chord colour.
- Separate harmonic/melodic scales when actually different.
- Modal preparation/arrival, a common-tone bridge or an interior harmonic destination.
- A realised chord-slot duration different from its reference.
- A key-change pivot or explicit ending as a higher-priority choice.
- Context such as section, planned next destination and progression.

View this rule links a reason back to its card. Explanations remain readable when the relevant chapter's controls are locked; that link explains how to reveal the choice without changing the rule or unlocking unrelated pages automatically.

## Implementation boundary

`src/app/rulebook/model.js` holds stable rule IDs, the initial catalogue, permission validation, compilation and effective-state descriptions. Visibility is deliberately absent from `compileRules`. Existing settings and internal composition flags are adapted without changing their default meanings.

`src/app/rulebook/explain.js` renders recorded plan/chord data into reason entries. Optional `Generator.rulebookTrace` adds serialisable provenance at chord construction, carries it through pivots and planner copies, and records actual harmonic slots. Tracing is enabled by the prototype and the main player. It adds no random choices and must leave notes and ordinary chord objects unchanged when disabled.

The preview URL retains preset, seed, rule choices and explicit voice mutes. Its versioned JSON `book` parameter is experimental; this is not yet the production compact share format. Page visibility is a separate browser preference, and opening every page has no musical input. The production share codec, main tour and saved setup format have not been replaced.

## Next slices

1. Review the interaction and chapter grouping in this live design, including the adjacent decision margin and narrow-screen flow. Keep the representation flexible; hover and a persistent text box use the same reason records.
2. Expand the catalogue to cover existing settings and make parameters granular where one adapter currently controls several algorithms. Represent prerequisites and overrides declaratively; verify each against the engine, including Original, fixed styles, zero activity and muted output.
3. Promote validated rule permissions into production settings. Append compatible fields to the compact share codec; preserve old URLs, Original, saved scenes, named/generated sounds and full setup exports. Define default inheritance separately from explicit user overrides.
4. Complete the main-interface progression mapping by capability (the expandable embedded book is now implemented). Do not relock controls for existing users or interpret an unlocked-page index as a generation limit. Preserve hidden-interface use, fluid controls, keyboard access, presets, transport and export.
5. Add reason affordances to the main timeline. Retain stable per-bar records, clear prioritisation and links to rules; distinguish an unheard forecast from the current bar and retained history. Expose pending changes where a committed phrase has not adopted a new permission yet.
6. Run broader live-edit, loop, ending, preset switch, link reload and offline-render checks. Compare inherited rules with the pre-rulebook generator and test desktop/mobile reading and listening before making this the default interface.

## Validation of this slice

- 497 tests across 64 files pass; production build succeeds.
- Unit checks cover unchanged inherited settings, reversible permissions, retained disabled parameters, dependencies, mute/output distinctions, URL validation and accumulating explanations.
- A generator integration fixture verifies optional tracing preserves actual notes and ordinary chord shape over 64 bars, records eligible versus ineligible borrowing correctly and survives planner copying. Existing Original fingerprints pass.
- Headless Chrome verifies page opening leaves the plan/settings unchanged, actual rule switches reach the generator, overridden duet choices and explicit mutes survive reload, restoring a rule recovers its preset value, a genuine borrowed chord is explained, and audio playback starts/stops.
- Desktop and 390-pixel mobile layouts are visually checked; the phone page has no horizontal overflow. Broader accessibility and mobile listening remain evaluation work.

Current track: core rulebook UI revamp complete locally. Control migration, the three-row taxonomy, compact layout, timeline explanations, inherited/reset behaviour and aligned staged tours are implemented.

Remaining in the core UI revamp: none. Compact encoding of rule metadata is a separate optional follow-up; current links and saved setups already retain choices. Broader accessibility/listening evaluation and user-requested polish remain ongoing quality work. Direct next music step: resume Phase 4 per-note expression.

## Embedded main-page slice — 17 October 2026

The main page now has an expandable **The Rules** panel immediately below the timeline. Chapters wrap horizontally above the cards on desktop and mobile. The panel shares the existing generator, preset and transport; opening or closing it neither creates an audio engine nor stops playback. Styles use the main page's light/dark theme variables.

The shared RuleCard component serves both the standalone comparison and the embedded book. The embedded margin follows the actual playing bar, or pins a selected bar's recorded chord explanation. A reason can reveal its corresponding chapter and card. This reveals controls only and never changes the music. The standalone prototype retains its original hover-preview behaviour.

The versioned book URL parameter now accompanies main-page URLs, Copy link and buffer-change reloads. It retains permissions and validated per-rule baseline values, so Follow preset restores the original value even after reloading an overridden setting. Direct controls replace permissions for their setting group, while unrelated flag choices survive. Selecting a composition preset clears rule overrides and restores algorithm defaults; selecting voices only retains composition choices. The production compact codec and saved setup format still need dedicated migration; rule flags are currently carried by URLs rather than setup JSON.

Validation: nine rulebook unit tests cover inheritance, prerequisite overrides, actual explanations, URL validation and restored baselines. Headless Chrome checked real shared playback, closing the book during playback, flag/parameter reloads, resetting to the original setting, chapter placement and a 390-pixel mobile viewport without horizontal overflow.

## Catalogue and saved-preset inheritance — 17 October 2026

The book now exposes 43 rules (16 added in this slice). New controls cover lead presence, backing space, phrase span and contrast, quicker note values, familiar melodic material, percussion style/ornaments/variation, swing, phrase expression, instrument feel, section backing gestures, lead arrivals/pickups and shaped endings. These adapt existing generation; no preset receives different defaults merely because its choices are now visible. Performance parameter bounds now agree with the engine and setup validator: timing up to 40 ms and dynamic variation up to 25%.

Percussion activity controls ornaments rather than switching the groove off. Its zero setting deliberately retains anchors. Drum style Off, disabled/zero-level drum sources and percussion mutes are represented separately. Phrase performance and instrument groove show the shared-rhythm prerequisite; zero timing and dynamics explain why their performance changes cannot be heard.

Setup JSON has an optional, versioned top-level rulebook field. Copy, download, paste/import and Mine storage preserve validated permissions and baseline values; older setups remain valid. Loading a saved composition makes its actual settings and flag permissions the new preset defaults. The card starts on Follow preset, a temporary explicit edit can replace that default, and Reset restores it. Inherited flag defaults also survive main URL reloads, including when no explicit edits remain. Applying only sounds retains the current composition permissions. Built-in composition presets restore their own defaults. The compact bit-packed codec remains unchanged; the versioned book query parameter carries rule metadata alongside it.

Validation: unit tests cover saved setup JSON/storage, inherited flags and reset after URL reload, malformed/unsupported rulebook data, percussion overrides and engine parameter bounds. Headless Chrome exercised the actual main-page Save, Copy setup, preset picker, sounds-only application, edits/resets and reloads. A zero-ornament fixture still generates percussion anchors. The expanded rhythm chapter was visually checked on desktop and fits a 390-pixel viewport without horizontal overflow. Full suite: 505 tests; production build passes.

## Existing-control migration and three rule levels — 17 October 2026

The main book now presents three labelled rows above the rules:

| Row | Pages |
| --- | --- |
| Instrument rules | Lead style, Second lead, Rhythm / pad, Bass / support, Percussion patterns, Playing feel, Ambient dynamics |
| Harmonic rules | Harmonic colour, including borrowing, colours/chance, open voicing, harmonic scales and bass pedals/chance |
| Composition rules | Melodic development, Voice dialogue, Rhythm & space, The long view |

The old Colour, Arrangement and Feel panels are removed from the main UI. Lead activity/busyness, repetition/leaps/endings, second-lead setup and activity, section mode/length/tone, colour controls and playing feel now have homes in the book. Rhythm/pad styles, pulse/arpeggio/direction weights, chord size and movement move out of the rhythm voice’s More options into its own rule page. Bass styles get their own page. Each instrument’s register/phrase-octave choices move with its playing rules. Percussion patterns, ornaments, variation and sprinkle move into the Percussion patterns page; kit design, audition and volume stay in the percussion sound panel.

Music (key, progression, meter and tempo), Evolution, Wander and the ambience mixer remain standalone. Ambient level drift moves out of the mixer into Ambient dynamics, including whole-bed/layer depth, movement and period. Slow voice wander is excluded from the main book to avoid presenting it twice; legacy rule IDs remain accepted in links and setups. The catalogue now has 55 adapters, alongside the original weighted-pattern and register controls embedded in the appropriate pages.

Opening a + page reveals its choices without changing settings, flags, notes or playback. Previous page preferences and existing stage unlocks map into the new page IDs; moving a control does not relock it. Tour steps describe the new locations. The moved weight controls retain their existing settings/share behaviour and explain relative shares and zero exclusions; they are not yet converted into tri-state group cards.

Direct updates compare individual rule paths with the actual prior settings. Changing a sibling parameter such as section length or ambient drift speed therefore retains the section-tone/level-drift permission and its original reset baseline. Ambient drift correctly remains audible with music off when ambience is playing.

Validation: headless Chrome visits every page and confirms unchanged settings and planned events, verifies the removed/retained panels, exercises bass pedals, section tone/length, rhythm chord size/style weights, bass weights and ambient drift, then verifies reloads and a 390-pixel layout. New unit tests cover taxonomy, preference migration, sibling settings and harmonic/ambient prerequisites. Full suite: 510 tests; build passes.

## Compact cards and floating chord explanations — 17 October 2026

The embedded book no longer contains a chord inspector or a separate bar strip. Rule cards use two equal columns on desktop and one below 700 px; multi-control playing groups span the available width. The three category rows stay above the rules.

Transparent, accessible buttons track the exact canvas chord rectangles on every animation frame. They share the drawing module’s lane geometry and distinguish separate occurrences of the same chord. Hover or keyboard focus previews an actual slot record. Click, tap or Enter pins that snapshot in a floating explanation below the chord lane. It remains readable as the timeline moves or its history changes. Mouse movement into the popup is allowed; moving away dismisses an unpinned preview. Close, Escape or an outside click dismisses the explanation. Escape returns focus to the source block if it still exists, without reopening the popup.

The popover uses the same recorded explanations, including actual borrowing and boundary decisions. Explore this rule opens the book, reveals the right page and scrolls to its card. The independent standalone design tool retains its inspector. This slice changes presentation and interaction only; drawing for exported video is unchanged.

Validation: geometry unit tests cover clipping, scrolling, hidden canvases and distinct repeated slots. Headless Chrome checks actual two-column placement, removed sidebar, hover/leave, keyboard pin and Escape, snapshot retention after seeking, a real borrowed-chord fixture, rule links, touch pin/close and 390-pixel layout without horizontal overflow. Desktop and mobile screenshots were visually inspected. Targeted tests and production build pass.

## Voice colour accents — 17 October 2026

The main rulebook reuses the existing lead, counter, pad, bass and percussion theme colours in small navigation swatches, active-page outlines/tints, heading bars and thin card/playing-group edges. Role-specific cards retain their own voice accent inside harmonic or composition pages. General pages use the interface accent. These are presentation cues; enabled/off text and status indicators remain explicit. Browser checks matched all five voice accents in light and dark themes, confirmed mobile fit after resizing, and the production build passes. Current track and next grouped-rule inheritance step are unchanged.


## Unified playing groups — 17 October 2026

Fourteen previously native parameter groups now use the same explicit source/reset model: register and octave movement for all four voices; pad chord size, styles, pulse patterns, arpeggio patterns, rolled/stacked directions and movement/swell; bass styles; section length reference; and ambient drift movement/period. Each group is a voice-accented card in the existing two-column layout. Source is Follow preset or Your choices. Editing a slider, selector or dice result records an explicit choice automatically. Reset/Follow preset restores the exact prior preset value, independently of neighbouring groups. Essential playing groups do not have an invented Off state: individual zero weights exclude a choice while other weights remain positive; all-zero weights retain the engine’s equal-shares meaning.

Validated optional groups/groupBaseline fields extend the existing version-1 book metadata without changing earlier links. Original float baseline values are preserved without slider-step rounding. Main URLs, Copy link and full setups carry the groups. A loaded saved setup adopts its actual saved values as the new preset defaults, rather than resetting to its ancestor’s values. External/random changes remove only a changed group’s override; sibling voices and unrelated rule permissions remain intact. The compiler applies nested groups without overwriting adjacent ambient-depth or section-tone permissions.

Source controls stay editable when a voice is muted or its output is off, with an explanation of the override. Pattern groups retain their choices when their corresponding style has zero share. Group validation rejects incomplete/unknown structures and restricts each known field to its engine range. The original compact settings codec remains unchanged; versioned book metadata carries exact reset baselines alongside it.

Validation: six group tests cover validation, immutability, exact float baseline/URL round trips, sibling preservation, saved setup inheritance, dormant patterns and independent section/ambient resets. Headless Chrome exercises actual main-page sliders, dice, source switches and reset buttons; verifies reloads and Mine saving/loading; restores voice register, bass weights, section reference and ambient period; and confirms mobile fit without console errors. Desktop/mobile screenshots were inspected. Full suite: 518 tests; production build passes.

## Guided progression and UI closeout — 17 October 2026

The eight stage IDs and indices stay unchanged for existing browsers. Labels now describe Instruments & playing rules, Composition rules and Harmony, feel & wander rather than removed panels. The basics introduce the three rule rows before the final unlock hint, and the timeline step explains hover, pin, dismiss and Explore this rule.

Later tours prepare the specific page they describe: ambient dynamics at stage 1; rhythm/pad, bass and percussion playing pages at stage 3; melodic development, duet dialogue and form at stage 4; and playing feel/harmonic colour at stage 6. Closed-page steps remain eligible when the book is available. A preparation callback reveals the right page before locating/scrolling its actual card, rather than silently skipping it. Quick reference remains non-invasive. Tour text explains reset sources, all-zero weight behaviour, retained prerequisites/mutes and permissions versus recorded decisions.

Start over resets the interface stage and book page visibility to the basics, while preserving composition settings, explicit rule choices, grouped baselines and planned notes. Returning visitors retain their unlocks; skipping the newcomer prompt reveals all main controls and book pages. No tour action changes the generator’s rule permissions.

Validation: three new unit tests cover compatible stage IDs, basics ordering, closed-page preparation and valid targets. Headless Chrome completes 41 guided steps on both desktop and a 390-pixel viewport, visits every unlock, checks each prepared card, reloads a fully unlocked visit, resets the UI while retaining an explicit rule choice, and skips a fresh introduction. Both walkthroughs leave settings/planned events unchanged and report no page errors or mobile overflow. Full suite: 521 tests; production build passes. This closes the planned core UI revamp locally; nothing was deployed.

Final hidden-interface check: tours and quick reference temporarily reveal the controls they describe, then restore the existing hidden-interface preference on close. This does not overwrite the visitor's saved preference. Verified in headless Chrome; final production build passes.


## Phase 4 rule addition — 17 October 2026

Playing feel now includes Shape each note’s articulation (stable ID note-articulation, generator flag noteExpression). It follows the existing permission/inheritance/share/setup mechanism and is unavailable in Original. Allowing it adds optional note-local articulation/tone metadata without changing written pitches, timing or velocity. Held spans and chip/classic voices are preserved. This is a music-engine addition within the completed UI structure.

## Held wind expression — 17 October 2026

Playing feel now includes Let held wind notes breathe, independent of note articulation. It controls restrained amplitude contours for held melodic wind notes and delayed vibrato when the patch has no existing vibrato. Existing patch vibrato takes priority. Original generation bypasses the layer. The permission uses the same persisted book URL/setup mechanism; presets can use it before its chapter is revealed. See the held-expression comparison and MUSIC_GENERATION_PLAN.md for implementation limits and validation.

## Connected wind articulation — 17 October 2026

Playing feel now includes Connect stepwise wind phrases, independent of note articulation and held expression. It uses note-local attack/tone/full-gate choices for nearby stepwise lead and second-lead wind notes, including across bar lines, while preserving detached rests, repeats, leaps and chords. It changes no written notes and uses no shared legato state. Original bypasses it. Permissions persist through the existing book URL/setup mechanism. See tools/connection.html and MUSIC_GENERATION_PLAN.md for the comparison, limits and checks.

## Sound timing permissions — 17 October 2026

Playing feel includes Link echoes and motion to the beat (opt-in) and Fit envelopes to short notes (opt-in for eligible Latest oscillator voices). The first rounds active delays and motion rates to nearby felt-beat divisions, retaining saved free-time patch values and bypass choices. The second bounds gain/filter decay and short-note release without altering written notes or physical/chip envelopes. The permissions are independent, inherit through saved setups, persist through the existing book URL, and are unavailable in Original. The model now supports defaultOn:false for opt-in algorithm flags without populating an untouched book with overrides. See tools/timing.html and MUSIC_GENERATION_PLAN.md for limits and validation.

## Phase 4 completion and slide rules — 17 October 2026

Slide between melodic notes (Playing feel) and Let one chord tone slide (Rhythm / pad) are independent opt-in permissions. The chord rule is intended for haunted/off styles: one changing note gets a pitch trajectory while common pitches stay fixed. They affect note-local automation, not written destination pitches or the shared instrument pitch. Original bypasses them, and saved setup/URL permissions inherit independently. The common tools/phase4.html comparison unifies sound recipes, default expression and optional timing/slides. The raw audit and docs/PHASE4_VALIDATION.md record the completed Phase 4 validation; fullness remains the default rather than short-tail articulation.

### Continuous pitch motion refinement

The stable melodic-slides rule now reads “Let melodic pitch meander”; noteSlides enables gentle continuous ±35-cent motion for lead/counter rather than a new previous-note scoop at every attack. Each voice's absolute musical clock carries the contour through attacks and tails. pad-pitch-motion / padPitchMotion and bass-pitch-motion / bassPitchMotion provide independent off-by-default choices in Rhythm / pad and Bass / support. These work with chords, arpeggios and sustained sounds, with simultaneous notes moving together. The separately optional chord-slides / chordSlides rule retains the dramatic single-tone haunted glide. All these choices start off in ordinary arrangements and persist through the existing URL/saved-setup adapter.

### Held connections in normal generation

held-pad-glides / heldPadGlides and held-bass-glides / heldBassGlides are independent off-by-default voice rules in Rhythm / pad and Bass / support. The existing inheritance/URL/override adapter persists them. They join only long, closely adjacent notes on sustaining sounds; short patterns, large rests, acoustic decays and section/ending boundaries retain attacks. Each performance chain has one envelope and smooth pitch destinations, renewing within four bars or 24 seconds. They leave the written composition intact, use the same interpreter live and offline, and bypass Original generation. Separate pitch-meander and haunted single-tone slide permissions remain available; explicit supplied pitch trajectories take precedence over automatic joins.


17 October 2026 polish: the entry is labelled The Rules, with no subtitle. It uses the same panel surface and fluid-backdrop translucency as the other sections; the header stays transparent in both themes. The harmonic page also exposes the optional atonal/bitonal language choice and the new chromatic chord colours.


## Compact rulebook URLs — 17 October 2026

Unchanged built-in preset permissions are now reconstructed from the preset rather than copied into its URL. Opening The Rules leaves ?preset=altman unchanged. An explicit held-bass override uses book=b1.AXwAAAA; resetting it restores the bare preset link. Standalone shared setups still carry inherited permissions, rule and group choices, and reset baselines. The versioned URL codec uses fixed append-only rule/group IDs and packed permission tokens with compact scalar/group payloads. Catalog/UI reordering does not change wire IDs. Normal saved setup JSON is unchanged. Readers still accept the earlier version-1 JSON book parameter; malformed, truncated, oversized or unsupported compact links safely fall back to defaults.

Validation: codec tests cover a fixed wire fixture, catalog coverage, flags/numeric/enum/group/baseline round-trips, short preset overrides, standalone inheritance, old JSON migration and malformed input. Browser checks cover opening, editing, reloading, resetting and migration of the old Altman URL with no page errors. Task artifact: outputs/compact-book-qa.json.

Release validation: all 597 tests across 82 files pass; production build passes. The compact URL fix is included with the current Phase 4/5, preset and tonality work for the requested feedback deployment.
