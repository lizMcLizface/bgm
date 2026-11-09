# Synths/all workbench pass

M3k update: [run-bound listening records](MODULAR_AUDIO_ENGINE_M3K_LISTENING.md)
now support local save/review/JSON export without changing playback settings or
automated results. User reports Short / 96 kHz / +2 helps while open but is
insufficient locked; Default and Medium / 48 kHz / Message tasks / +2 / three
workers work while locked (128 / 64 ms declared buffering). These reports lack
a matching run export; no cause/default change is inferred. Legacy DSP stays intact.

M3j update: [packet-arrival diagnostics and explicit headroom](MODULAR_AUDIO_ENGINE_M3J_ARRIVAL_HEADROOM.md)
retain original defaults. Short / 96 kHz with +2 or +4 PCM blocks passed three
measured desktop trials each without transport misses; original capacity failed
all three. +2 declares 16 ms buffering. Phone listening remains unverified.
Legacy desk/All DSP remains intact.

M3i update: [message-task scheduling](MODULAR_AUDIO_ENGINE_M3I_TASK_PUMP.md) is
an explicit experiment; existing timers remain the harness default. It did not
remove Short / 96 kHz misses. Negative trials are retained; no quality or
performance improvement is claimed. Legacy desk/All audio remains intact.

M3h update (2026-11-09): the opt-in worker harness now measures contiguous
ready PCM lead per worker and coherently, with terminal drain separate and
selected-rate profile trials. The user reports Short / 96 kHz crackling; the
other tested combinations work well. Defaults and desk DSP remain unchanged.
See [queue-lead evidence and next task](MODULAR_AUDIO_ENGINE_M3H_QUEUE_LEAD.md).

Prepared 2026-11-08, before implementation. This is the working order for the
requested audit, repairs and route to a physical tabletop. Existing sequencer,
generator and synth plans remain useful design history; this document records
the cross-cutting work and its acceptance criteria.

Current next-phase direction (2026-11-09):
[modular Rust engine and parallel rendering](MODULAR_AUDIO_ENGINE_PLAN.md), with
[fresh-session handoff](MODULAR_AUDIO_ENGINE_HANDOFF.md). This precedes broad
processor migration and cable UI: contracts/reference graph, real modulation
and sidechain, then a measured six-engine parallel prototype. Delivered work
below remains the compatibility baseline. The opt-in **M0/M1 Rust reference
graph is delivered**; see the engine plan's exact tests, limits and next M2
synth/sidechain task. M2 is now delivered in that opt-in harness using owned
percussion and real kick-keyed compression; current All audio routes and
defaults remain intact. The [actual six-role M3a serial baseline](MODULAR_AUDIO_ENGINE_M3A_BASELINE.md)
is now measured with the existing mixer/local/master effects and an opt-in
kick-keyed route. The [M3b owned FM adapter](MODULAR_AUDIO_ENGINE_M3B_OWNED_FM.md)
now supplies second/bass in an opt-in shared-instance worklet. [M3c owned core](MODULAR_AUDIO_ENGINE_M3C_OWNED_CORE.md)
supplies lead/rhythm/pad. [M3d pitched DAG](MODULAR_AUDIO_ENGINE_M3D_PITCHED_DAG.md)
now runs all six sources and explicit mixing/keyed compression inside one Rust
graph, preserving the opt-in desk comparison and adding a dry Rust mix audition.
[M3e bounded worker transport](MODULAR_AUDIO_ENGINE_M3E_WORKER.md) now supplies an
opt-in complete-graph worker, explicit buffered publication and serial startup
fallback. [M3f source pool](MODULAR_AUDIO_ENGINE_M3F_SOURCE_POOL.md) now partitions
the six sources across three workers with a dependent Rust master and coherent
publication. General distribution and broad workbench migration remain later.
Foundation through M3c committed locally as `bc4e35d`, M3d as `fa634f5`, M3e as
`646183d`, M3f as `714ce43`; every completed step ends with a local commit.
[M3g buffering profiles](MODULAR_AUDIO_ENGINE_M3G_BUFFER_PROFILES.md) adds
experimental smaller delays and repeated measurement/session persistence in
the opt-in harness. Default buffering and All routes stay unchanged. No push/deployment.

## 1. Establish the playback and persistence contract

- Audit `/synths/all`, the standalone drum device, the shared sequencer modules,
  role sources, effect routing, setup files and Rust render paths.
- Keep one transport, clock and editable pattern model on All. Bring useful drum
  sequencer operations into that device; a drum synth popup is a sound generator,
  not a second independently running sequencer.
- Preserve imported setups, scene kits, extra machine tracks, mute/solo and edited
  sounds. Check scheduling, pattern edits and switching sources with meaningful
  regression tests rather than assuming a rendered control is functional.

Acceptance: drum and pitched edits play from the same clock; source changes keep
notes; drum-specific operations affect the selected drum pattern only.

## 2. Repair sound editing and independent object placement

- Trace every kind of popup to the active instrument (classic, DIY, native piano,
  measured instrument, generator voice, basic kit and drum machine).
- Expose a real editor for generator voices too. Sanitize edits and propagate
  them to live audio and saved sound snapshots.
- Use the sequencer/rack relationship only to calculate a window's first spawn.
  Moving a sequencer must never move an already spawned instrument or effect.
- Add opt-in object rotation to the All workbench, with saved angles, reset,
  correct drag coordinates and fit bounds. Preserve other synth pages' behavior.

Acceptance: editing a popup reaches its audible voice; popups remain in place
when the sequencer moves; drag/rotate/reopen/reset work at different desk zooms.

## 3. Make the complete mixing desk audible

- Implement channel trim, switchable HP/LP, three-band EQ, stereo pan, fader,
  mute and solo, including ambience. Combine mixer mute/solo with sequencer
  mute/solo explicitly so either can silence a source.
- Give the spare Headroom strip a useful defined role (music subgroup) rather
  than showing controls on an unconnected input. Label it accordingly.
- Implement master width, balance, mono, dim, level and a documented ceiling
  limiter. Meter actual post-fader/post-master audio.
- Restore and sanitize mixer state. Keep neutral defaults at unity so opening
  the mixer does not change the scene's balance. Retain per-voice space controls.

Acceptance: each control changes the corresponding audio node or processor;
solo/mute precedence, routing, restoration and disposal are covered. No control
is left advertised as live while merely changing local appearance.

## 4. Clean up the generator and bring in the control panel

- Embed the existing front-page QuickPanel against this host's actual settings.
- Wire evolution, wander and rules to the generator instead of private demo
  state. Prefer existing panels when they express the complete behavior better
  than placeholder knobs.
- Keep key, progression, tempo and meter synchronized with captured patterns.
  Distinguish settings that regenerate the current song from settings applied
  to the future continuous buffer; avoid silently discarding edits.
- Use an explicit section hierarchy, readable display areas and accessible
  keyboard controls; eliminate the embedded-panel placeholder.
- Connect ambience source controls to the existing ambience engine so its mixer
  channel has a real controllable input.

Acceptance: generator controls use the same settings paths as the front page;
changes survive setup export/import; finite song and continuous mode both work.

## 5. Rust performance and flexibility pass

- Inspect the actual render and parameter-update paths before optimizing.
- Target repeated coefficient construction, avoidable work in silent/bypassed
  processors, allocations in render, redundant parameter messages and fixed
  buffer assumptions. Preserve voice/effect response and deterministic output.
- Add bounded, reusable processing helpers where they enable independent effect
  units, with reset/bypass/tail semantics. Do not rewrite every engine at once.
- Run native Rust tests and build/check the affected Wasm artifacts, then the JS
  regressions and production build. Record limitations and avoid performance
  claims without measured evidence.

## Sequencer comparison and prioritized gaps

The OXI comparison is a workflow benchmark, not a request to copy its UI or
emulate hardware I/O. Sources checked 2026-11-08:
[current product specifications](https://oxiinstruments.com/oxi-one-mkii) and
[sequencer modes manual, firmware 2.2.10](https://docs.oxiinstruments.com/oxi-one-mkii-manual/sequencer-modes/).
The overview chapter still says six modes; the current mode chapter and product
page agree on nine, so use those for the comparison.

| Area | Existing local foundation | Reasonable next work | Priority |
| --- | --- | --- | --- |
| Shared sequencing | Five pitched roles plus captured drum patterns; arrangement/progression views | One drum edit surface, common transport, selection, persistence and audition | P0, this pass |
| Step expression | Note gates, repeats/conditions in shared modules; richer standalone drum editor | Expose velocity, probability, ratchet, microtiming, tie and per-track length/rate consistently in All | P1 |
| Pattern operations | Copy/delete and generated progression capture | Drum clear/fill/rotate first; then common duplicate/undo/redo and quantized pattern launch | P0/P1 |
| Independent tracks | Fixed generator roles | Stable device/track IDs, assignable targets, independent lengths and rates; add/remove tracks without changing saved role meaning | P1 |
| Chords and harmony | Degree notes, placed chords, inversion/voicing, repeat and chord generation | Harmonizer follower routing, per-track arp and chord palette using existing harmony helpers | P1 |
| Modulation | Shared modulation modules and standalone drum modulation | Connect All automation lanes to stable parameter IDs; record knobs, then two LFOs per track | P1/P2 |
| Performance | Arrangement, mute/solo, repeat | Non-destructive fill/probability macros and snapshot/return; avoid editing stored notes during performance | P2 |
| Generative modes | Front-page composition generator | Deterministic Euclidean drum fill first, then stochastic pitch/rhythm with clear constraints; defer proprietary mode parity | P1/P2 |
| MIDI and projects | MIDI audition, setup JSON | Clock input/output, per-track MIDI output and note capture; MIDI file import/export after stable track model | P2 |
| Scale/hardware breadth | Musical scales and browser instruments | Custom scales useful; virtual CV/gate and typed control ports are now planned in the effects connection contract; electrical CV/USB host/SD/battery hardware remains separate | P1 virtual ports; hardware deferred |

OXI advertises eight sequencers/up to 64 tracks, nine modes, eight modulation
lanes per sequencer, two LFOs per sequencer, groove/repeat tools and MIDI import.
The highest-value local gaps are expressive steps, independent tracks and
automation; matching track counts alone is less useful than reliable routing.

## 6. Physical effects and the shared table

Build this after routing and editing are dependable. Retain rack compatibility
while introducing the object model; deleting rack boxes first would strand
existing setups.

1. **Object identities and poses:** stable IDs separate from sequencer roles;
   `{x,y,angle}` in desk coordinates, dimensions, visible state and z order.
   Spawn layout is a one-time suggestion. Add a Spread action that lays out all
   active instruments, effects, mixer, generator and power supply without
   overwriting a user's saved layout unless explicitly invoked.
2. **Effect units:** promote each rack unit to an independent processor instance
   with input/output, bypass, reset and tails. Use compact stompbox faces with
   distinct designs, conventional effect controls and output level where gain
   changes need compensation. Keep delay/reverb wet/dry and feedback bounded;
   preserve order and saved settings when migrating a legacy chain.
3. **Typed patch graph:** separate audio, CV/gate, MIDI/clock and power ports/cables. Enforce
   port direction/type, reject unsupported audio feedback, prevent duplicate
   paths and make repatching atomic. Audio follows graph edges; MIDI transports
   note/control events; power is a deliberate enable state with fades, not a
   second audio connection. Show only cables backed by real connections.
   After the common engine contracts/reference graph, prove external sidechain
   compression and a real key tap before general patching UI: program
   and detector are distinct audio inputs, and detector edges participate in
   validation without being summed audibly. The 2026-11-09 connection contract
   at the top of `EFFECTS_DESK_PLAN.md` specifies the device ports and CV/LFO
   mapping, including the sequencer's eight assignable CV and eight gate outs.
4. **Cable geometry and physics:** compute jack positions from object-local
   coordinates and rotation. Use a bounded Verlet/position-based chain with
   fixed endpoints, length constraints, damping, table friction and a fixed
   simulation timestep. Dragging/rotating moves endpoints without teleporting
   intermediate segments. Rendering/simulation must stay off the audio thread.
5. **Interaction:** cable grab/connect/disconnect, jack highlighting, cable slack,
   object drag/twist gestures and keyboard steps, zoom-safe hit testing, touch controls,
   reduced-motion/static curves and cable visibility by type. Do not let cable
   gestures steal synth knob or sequencer grid input.
6. **Persistence and validation:** versioned setup migration for object instances,
   ports, connections and poses; graph validation before constructing audio;
   save/reload with identical sound and layout. Test rewire during held notes,
   deleted devices, tails and power cycling before replacing the old rack UI.

Acceptance for the intermediate table goal: every active sound-producing or
processing object can be spread, moved and rotated independently; visible audio,
MIDI and power cables match actual routing and respond with stable, lightweight
physics. A compatible setup round-trip preserves both sound and pose.

## Verification and completion record

### Delivered repair pass (2026-11-08)

The continuation preserved the existing implementation and completed its
correctness review and regression work. Sections 1–5 above describe the repair
pass; the OXI gaps and section 6 remain the subsequent development plan.

- **One sequencer and drum expression:** All plays captured drums from its
  existing scheduler. The standalone drum core and StepEditor supply velocity,
  chance, ratchets, nudge, loop/fill conditions and machine tune/decay locks.
  Recipes, progression-scoped clear and lane/all-lane rotation preserve other
  progressions and extra machine tracks. Captured hits can reach full velocity
  and reset to their captured level. Per-hit tune/decay controls are hidden for
  basic kits, which cannot realize those machine locks.
- **Audible sound editors:** classic/DIY edits are sanitized before reaching
  their instrument. Piano and measured-instrument windows edit their active
  presets; generator-only voices expose NativePanel instead of a disabled Synth
  button. Host snapshots preserve edited sounds, kits, racks and drum mix.
- **Independent placement:** synth windows and All compact racks use the
  sequencer only for their first spawn. All FloatBoxes, synth windows and compact
  racks support rotation, keyboard steps, straighten and local pose restoration.
  The floating-window regression covers anchor changes, zoomed dragging,
  reopening, rotation restoration and layout reset.
- **Connected mixer and ambience:** channel HP/LP, three-band EQ, pan, faders,
  mute/solo and trim are connected to audio processing. Voice trim uses the
  existing rack output; ambience and the music subgroup have desk trim. The
  legacy `headroom` ID is now labelled Music bus. Master width, balance, mono,
  dim, level and a stereo-linked sample-peak limiter are connected; desk meters
  tap post-fader outputs. Ambience controls drive the existing ambience engine.
- **Shared effects routing:** both the common bus and section-space sends use
  post-fader voice outputs, and returns join the music subgroup. Completed racks
  migrate immediately; pending racks resolve the current route when loading
  finishes. Host disposal prevents either pending rack from recreating sends.
  Tests cover completed loads, loading races, repeated routing and disposal for
  both rack types.
- **Generator controls and replay:** the shared QuickPanel adapters, rulebook,
  evolution and wander edit the host's actual settings. Live mix/wander edits are distinct from
  composition edits for future continuous progressions; key/scale/meter changes
  regenerate the capture. Continuous snapshots record initial settings, voice
  context and rule flags, plus ordered settings/flag changes. Unset flags are
  recorded as `null` to restore their original default instead of inheriting a
  later host override. Only known flag names can be replayed. Setup decoding
  rejects malformed timelines before loading audio; replay walks the timeline
  in order, including changes pending after the last generated progression.
- **Persistence:** finite local sessions retain generator settings, rulebook,
  edited sounds, mixer and ambience. Setup files retain these controls and the
  continuous replay state. Integration regressions exercise the real editor
  controls, drum playback events and finite save/reload behavior. A real
  Generator planner regression checks continuous composition/rule replay.
- **Rust inserts:** stereo channels share cached EQ coefficients while keeping
  independent filter history. Settled drive/trim calculations and the DC
  coefficient are cached. Cache invalidation remains in initialization/reset.
  Static cache fields remain zero-initialized so the large delay buffers stay
  in Wasm BSS: the final kernel is **63,253 bytes**, versus 62,097 before this
  pass (the intermediate 195,023-byte artifact was corrected). Its manifest and
  cache version were rebuilt.

### Verification evidence

- Final `npm.cmd test`, including the compact surface and gesture follow-up:
  **347 files / 2,535 tests passed**; see the follow-up records below.
- Native Rust: **2 tests passed**, including stereo-state independence,
  coefficient reset and sample-rate reinitialization.
- `node tools/auditWorkbenchInserts.mjs .tmp/inserts-before-workbench.wasm`:
  **exact PCM equality** at 44.1/48/96 kHz across parameter edits, resets and
  varied block sizes. The final local benchmark measured approximately
  **1.02–1.22×** speedup across five insert configurations; these are local
  kernel timings, not a browser-wide performance claim.
- Final `npm.cmd run build`: source/artifact/cache checks and Vite compilation
  **passed** (latest Vite: 33.75 s). Vite still reports its large-chunk advisory.
- `git diff --check`: **passed**.
- Logs and measurements: `.tmp/workbench-continuation-*.log` and
  `.tmp/workbench-continuation-inserts-audit.json`. The retained baseline is
  `.tmp/inserts-before-workbench.wasm`.
  The initial continuation suite/build logs are
  `workbench-continuation-verified-tests.log` and
  `workbench-continuation-verified-build.log`; the latest browser-follow-up logs
  are `workbench-browser-verified-suite.log` and
  `workbench-browser-verified-build.log`, all in `.tmp/`.
  The latest compact-surface run is in `workbench-compact-full.log` and
  `workbench-compact-build.log`.

### Limits and subsequent work

- **Desktop browser QA was retried successfully from the ChatGPT app**; see the
  follow-up record below. The earlier unavailable browser session was not
  bypassed. Direct listening, audio-device underrun measurements, touch and
  cross-browser behavior remain unverified.
- The limiter is **sample-peak**, with fixed 3 ms latency even when bypassed;
  it is not an oversampled true-peak limiter. Shared return tails belong to the
  shared subgroup rather than to an independently soloable return strip.
- Fill conditions reuse the core, but All has no dedicated held-fill performance
  control yet. Track lengths/rates, pitched step-expression parity, undo/redo,
  independent track identities, automation and MIDI expansion remain prioritized
  in the OXI comparison above.
- Finite sessions restore locally; a continuous stream is restored through its
  exported setup file. Replaying a long continuous stream reconstructs planner
  history and can take time. Floating poses/angles are currently browser-local,
  not part of portable setup JSON.
- **Independent stompboxes, Spread, stable object/port identities, typed
  audio/MIDI/power patching, cable drawing/physics and portable table poses are
  planned, not delivered.** Existing compatible racks remain in place. Rotation
  and independent spawn positions are foundations for that migration, not a
  completed physical tabletop.
- No deployment, commit or push was performed.

### Browser follow-up (2026-11-08)

The ChatGPT in-app browser could access the local production preview at
`http://127.0.0.1:4173/synths/all/`. The initial Vite development page remained on
its lazy-loading fallback, so this pass used the production bundle instead.

Verified through real UI actions and rendered state:

- Playback advances and lights notes; post-fader meters and the scope display
  real signal. Music subgroup mute drops its meter to zero while ambience
  continues. Master mono/dim and channel faders respond.
- Evolution and wander controls update their real values; QuickPanel renders
  its controls and the rulebook applies an explicit permission change.
- A piano brightness edit from `.35` to `.37` persists through popup reopen,
  page reload and exported setup. The popup's 5-degree rotation also restores.
- Dragging the sequencer at desk zoom changes only its own desk pose. Its open
  piano popup and compact effects rack keep their original positions. Closing
  the synth leaves effects open.
- Finite reload restores generator Home pull `1`, wander pitch `6`, Pad fader
  `.73`, master mono, Rain level `.38` and the edited piano sound.
- Drum step velocity reaches `1`; ratchet `4` and condition `2:2` survive changing
  from the scene kit to the 808. Tune/decay controls appear only for a machine.
  Lane rotation moves the edited hit; exported/imported JSON preserves its
  velocity, ratchet, condition, tune `.05` and decay `-.05` locks.
- Setup export and import succeed; import restores master mono after it was
  deliberately changed. Copies of the generated setup files are retained in
  `.tmp/workbench-browser-setup.json` and
  `.tmp/workbench-browser-final-setup.json`.

Browser inspection also exposed three issues that DOM-only tests had missed:

1. QuickPanel needed its `.gen` style scope and an embedded flex layout rather
   than the front page's wide three-column grid. The corrected panel has equal
   client/scroll widths (662 px in this view), styled choice pills and vertical
   scrolling for its complete control set.
2. Browser focus could introduce native scrolling inside the camera's hidden
   viewport. Desktop desks now use `overflow: clip`, and camera commits/reset
   clear native scroll offsets. A regression covers Fit all and camera reset.
3. Restoring an 808 on a fresh, suspended AudioContext could wait forever for
   `resume()` before Play became enabled. Shared-context classic instruments
   now prepare without taking over context activation; the host's Play gesture
   still wakes audio. A regression uses a deliberately unresolved resume promise
   to ensure preparation cannot depend on it.

An existing intensity comparison also used three unrelated random seeds, which
caused one full-suite run to fail. It now compares the same reproducible seed at
each intensity without weakening its assertions.

After the final rebuild, a fresh reload restored the 808 and finite setup without
waiting for an audio gesture. Play was enabled; clicking it produced advancing
notes, active Pad/Bass/Drums/music-bus meters and an updating scope. The final
desk viewport reported `overflow: clip` and zero native scroll offsets. The
browser reported no captured warnings or errors on that final load/play cycle.
Playback was stopped and the preview tab was left open.

Evidence: `.tmp/workbench-browser-playback.jpg` and
`.tmp/workbench-browser-controls.jpg`. The final suite passed **345 files /
2,513 tests**; the final production build and `git diff --check` passed. Browser
verification does not imply direct listening or a complete continuous-mode
export/import UI audit; planner replay has separate deterministic regression
coverage. No deployment, commit or push was performed.

### Compact surface and integrated gestures (2026-11-08)

- The generator is now **720 × 420 desk units on every page**. All seven main
  pages and the Mix/Feel/Band/Macros subpages keep exactly four encoders visible
  below the display. Unassigned or unavailable controls retain their physical
  knob and a darkened display. A compact scene menu replaces the extra header
  knob. New song and Reset scene use the same restrained button treatment as
  page selection and screen controls.
- The screen chooses what the four encoders edit. Control uses the existing
  quick-controls adapters for mix, feel, voicing, melody and grouped macros.
  Evolution exposes change probabilities, home pull, tempo range, pivot and
  allowed keys/modes. Wander exposes motion, depths, pan bounds and voice
  enable states. Rules shows one rule at a time, with chapter/rule navigation,
  explicit permission and its amount/approach when applicable. Parameter edits
  still travel through the existing settings/rule callbacks and persistence.
- Long help labels and the external application note have moved into a fixed
  help area in the display. Knob hover/focus provides contextual instructions.
  The display, navigation and encoder row keep their geometry while changing
  pages; the browser measured no horizontal overflow in any tested bank.
- Floating headers now integrate gestures: **left-drag moves**, **right-drag
  rotates about the object center**, and **two touch pointers translate/twist
  the object together**. Screen deltas account for desk zoom. Ending one touch
  rebases the remaining finger into a drag without jumping. Pointer cancellation,
  pointer capture, angle normalization and local persistence share the same
  gesture path. Controls keep their own interaction and context menus. Keyboard
  rotation and double-click straighten remain available on the angle indicator.
- Regressions exercise radial right-drag, two-pointer rotation, release/rebase,
  zoomed movement, angle restoration, settings/macros, rule permission changes
  and all four permanent encoder slots. The finite All save/reload test now
  edits through those encoders. Full suite: **346 files / 2,517 tests passed**;
  production build and `git diff --check` passed.
- Browser checks measured all main pages and Control banks at 720 × 420 with
  four knobs, verified contextual edits, mouse movement and suppressed header
  context menus, and found no captured console warnings/errors. The browser
  tool exposes a left-drag operation; radial right-drag and two-touch behavior
  were verified through pointer-event regressions, not physical touch hardware.
  Screenshots: `.tmp/workbench-compact-controls.jpg`,
  `.tmp/workbench-compact-evolution.jpg`, `.tmp/workbench-compact-wander.jpg`.
  The preview remains open with playback stopped. No commit, push or deployment
  was performed.

### Revised physical surface and view restoration (2026-11-08)

This follow-up supersedes the compact pass's horizontal page navigation,
generator dropdowns, Mix bank and angle indicator.

- Page buttons are back on the **left**, with the display to their right.
  Scene, Song/Continuous and progression count use small display/encoder pairs
  in one compact top ribbon. All seven pages remain **720 × 420 desk units**
  with exactly **four bottom knobs**, including dark inactive slots.
- Control contains **Feel, Band and Macros**; mixing remains at the desk.
  Feel has eight visible vertical faders with the selected fader's help and
  Busy/Bright pad on the right. Band shows all seven pill stacks, including
  melody/style; Macros shows the four Off/Low/Med/High stacks. The corresponding
  knobs and pills/faders edit the same shared settings adapters and stay in
  sync. Intensity and Mood faders remain visible on all three Control banks.
  Bank buttons and melody-part switches sit in the display header so the full
  stacks fit without clipping their last options.
- Rules uses a chapter breadcrumb, rule index and title instead of duplicate
  dropdowns. The first two knobs browse pages/rules. Numeric rules also expose
  their real range slider; permission, displayed value and the fourth encoder
  stay synchronized. Denying a numeric rule disables both amount controls.
- Browser-local view state restores generator page/bank and target selections,
  Generator/Ambience visibility, synth/effects/tuning windows, Scope and Setup.
  It is saved independently of finite-song audio persistence, so continuous
  sessions also retain their surface choices. Only supported IDs and booleans
  are restored, and popups wait for a prepared host. Restoration does not
  start playback. Opening a hidden FloatBox raises it above other objects.
- The separate angle handle has been removed. Header left-drag moves;
  right-drag rotates; two touch pointers translate/twist. Angles within **±3°**
  of straight snap to **0°**, including across a full turn and when restoring
  saved angles. Focus the grip for 5° arrow-key rotation or Home to straighten.
- Browser QA verified all seven pages' fixed dimensions/four knobs, Feel
  fader/encoder synchronization, Band/Macro pills responding to knobs,
  Intensity changes and a visible rule slider updating its fourth encoder.
  Reload restored Rules, its chapter and value `.65`, both visible auxiliary
  panels and the Pad effects rack. No angle handles remained and no captured
  browser warnings/errors were reported. Keyboard rotation/straighten worked.
  Evidence: `.tmp/workbench-revised-feel.jpg`,
  `.tmp/workbench-revised-band.jpg`, `.tmp/workbench-revised-macros.jpg` and
  `.tmp/workbench-revised-rules.jpg`.
- The focused final regressions passed **63 tests**. The full suite passed
  **346 files / 2,522 tests**; production build and `git diff --check` passed.
  Logs: `.tmp/workbench-revised-focused.log`,
  `.tmp/workbench-revised-full.log`, `.tmp/workbench-revised-build.log`.
  Pointer-event regressions cover actual radial right-drag snapping and
  two-touch release/rebase; physical touch hardware remains unverified.

The stompbox/typed-patching/cable-physics roadmap above is still planned work.
No deployment, commit or push was performed.


### Color associations, cycling banks and popup chrome (2026-11-08)

- Four numbered accents (amber, cyan, violet and rose) connect each bottom
  encoder to its screen target. Scale lists, Band/Macro stacks, rule controls,
  evolution/wander readouts and Character controls use these same accents.
  Inactive knob slots remain dark. The display uses a blue background and
  distinct colored selections rather than one green treatment throughout.
- Control cycles **Feel → Band → Macros → Character** when its already-selected
  section button is pressed. Evolution similarly cycles **Changes → Keys →
  Modes**. The small top navigation buttons are removed. Segmented indicator
  lights sit at the bottom of each section button and across the lower display
  edge; the title shows the current page and index. Page choices still restore
  locally, and returning from another section retains the chosen bank.
- **Character** is the sole Control bank containing Intensity, Mood and the
  Busy/Bright diamond. Its four knobs edit those four settings directly;
  the diamond constraint keeps the two axes bounded. Feel keeps its eight
  vertical faders and right-side help with target/value knobs and two dark
  slots. Band and Macros retain their pill stacks with more vertical room.
- Scale now shows three equal-width, vertically scrolling lists. Their current
  entries and numbered headings match knobs 1–3. Turning a knob keeps its chosen
  entry in view without scrolling the surrounding desk.
- Both ribbon and bottom encoders sit **left** of their displays. Ribbon dial
  boxes now match the drawn SVG size, correcting the vertical offset caused by
  centering a small SVG inside a larger fixed-height interaction box.
- Existing popup grips moved correctly in browser reproduction, but were easy
  to miss. All synth popups now have a distinct full-width title bar naming the
  voice and showing the move/rotate gesture. Blank instrument preset/title
  areas also drag the popup; buttons, labels, sliders and preset spinbuttons
  retain their editing gestures. Regression coverage exercises chrome/title
  dragging, stored positions and exclusion of actual controls.

Independent stompboxes, patch cables and cable physics remain planned work.

Verification: **346 files / 2,526 tests passed** (97.27 s), including the nine
generator-surface and four popup integration regressions. The production build
and `git diff --check` passed. Logs: `.tmp/workbench-color-full.log` and
`.tmp/workbench-color-build.log`. Browser checks confirmed four Control pages,
three Evolution pages, equal-width Scale lists with matching knob colors,
center-aligned ribbon encoders to the left of their displays, Character edits
and unclipped Character content. Real mouse drags moved both piano and DI-Poly
popups; the piano also moved from its blank preset header. Its sequencer and the
other popup kept their positions. Evidence: `.tmp/workbench-color-character.jpg`,
`.tmp/workbench-color-scale.jpg`, `.tmp/workbench-color-popup.jpg`.
Playback remained stopped. Physical touch hardware remains unverified.
No deployment, commit or push was performed.

### Stacked scale strips and boundary-safe generator edits (2026-11-08)

- Scale is arranged as **Key above Scale above Mode**. Key uses two rows of
  choices; Scale and Mode each use one horizontally scrolling row. Matching
  numbered colors remain. Left/right chevrons indicate overflow and scroll
  the choices; native scrollbars are hidden. Knob changes reveal their selected
  choice. Trackpad/wheel input stays in the strip, while Ctrl/Cmd-wheel still
  zooms the desk. Desk scrolling now recognizes horizontal scrolling panels.
- Bound generator edits previously called `newSong`, stopping and rewinding
  the sequencer. Composition/settings/rule edits now prepare an unplayed tail
  and publish it at the next **unbooked progression boundary**, using the
  existing scheduler clock. Length, key and tempo are read after publication;
  the timer, next audio time, cycle/step counts and pause/resume state survive.
  Already-booked audio is allowed to finish. Explicit New song, scene and mode
  replacement actions retain their separate reset semantics.
- With an unchanged meter, completed progressions and their pattern edits are
  retained. Continuous lookahead forks the deterministic planner at the chosen
  progression, replaying its original seed, voices, initial flags and settings
  timeline before applying the new settings. Home changes use the generator's
  home-change planning path. Later progression pitches continue to use the
  captured project's original reference key, with accidentals representing
  other keys/scales, as in the existing continuous capture model.
- Pending changes are saved with finite local state and portable setup files.
  Restore prepares the change without starting audio; first play or the next
  resumed boundary publishes it. Setup decoding validates the optional boolean
  queue marker. Live mixer/wander controls retain their immediate sound path.
- A **meter change rebuilds the uniform-meter capture** at the boundary while
  retaining transport position/time; it does not retain an old-meter edited
  history grid. A very long continuous planner history must currently be
  replayed when rebuilding lookahead, so preparation cost grows with session
  length. Portable planner checkpoints and mixed-meter history remain future
  work; no long-session audio-underrun claim is made.
- Regressions verify scheduler clock/count continuity across a tempo/length
  change; new-home application using the real Generator planner; preserved
  completed edits, lookahead replay, pending persistence, finite/continuous
  boundary publication and paused resume points. Full suite:
  **347 files / 2,535 tests passed** (97.60 s). Production build and
  `git diff --check` passed. Logs: `.tmp/workbench-boundary-full.log`,
  `.tmp/workbench-boundary-planner.log`, `.tmp/workbench-boundary-build.log`.
- Browser QA changed Major/Dorian to Harmonic Minor while playing in both Song
  and Continuous modes. Play remained pressed and the sequencer reached
  **bar 9** after publication. Export comparison preserved **all 64 steps**
  of the first completed progression across every existing role; later chords
  changed. The continuous export recorded the edit at progression 1 and kept
  the regenerated lookahead. Horizontal wheel scrolling moved the choices without moving the generator or desk. The original musical setup was exported before
  QA, restored afterwards, and playback stopped. Evidence:
  `.tmp/workbench-boundary-playing.jpg`, `.tmp/workbench-scale-final.jpg`,
  `.tmp/workbench-boundary-before.json`, `.tmp/workbench-boundary-after.json`,
  `.tmp/workbench-boundary-continuous.json`.

Independent stompboxes and physical cables remain planned work. No commit,
push or deployment was performed.

### Sequencer scale transformation plan (2026-11-08, before implementation)

- Add a physical Scale encoder page to the sequencer: Key, scale family, Mode,
  and a read-only scope display. This edits captured notes rather than asking
  the generator to replace the current pattern.
- Finite Song mode transforms all pitched parts of the project. Continuous
  mode transforms all pitched voices in the current progression, preserves
  earlier progressions, and replans only the unbooked future in the new home.
  Retain the scheduler clock, playback position, rhythm, expression and drums.
- Map diatonic degrees into the destination mode, preserving octave/register
  and chromatic offsets. Borrowed chord voicings and suspended chord shapes
  retain their intervals while their roots move; explicit placed-chord borrow
  and suspension settings remain meaningful. Preserve exact custom strikes.
  When scale cardinality changes, map degree positions proportionally within
  their octave rather than unexpectedly adding octaves.
- Capture each progression's actual key. Older captures may infer context from
  their ordered scale pitch classes, falling back to the stored project key.
  Preserve relative pitch metadata where a continuous capture's storage key
  differs from its actual current key, so repeated transformations do not
  reinterpret a modulation as arbitrary chromatic accidentals.
- Validate transformed MIDI pitches before publishing. Already-booked notes
  finish at their scheduled pitches; subsequent attacks use the transformed
  data. No attempt is made to rewrite audio already played.
- Test D Dorian → E Ionian, borrowed/suspended material, octaves, explicit MIDI,
  placed/custom chords, repeated changes, finite persistence, continuous
  history preservation and future planner replay; then verify the UI in browser.

### Sequencer scale transformation delivery (2026-11-08)

- Delivered the sequencer's **Scale** page with physical Key, scale-family and
  Mode encoders plus an inactive scope display. The page remains available
  alongside note/chord editing pages and its last-visible state is saved locally.
  Generator scale edits retain their separate next-sequence regeneration behavior.
- Song mode transforms the whole captured song, including handwritten notes and
  placed chords. Continuous mode transforms **all pitched voices in the current
  audible progression** (or the selected progression while stopped), preserves
  earlier progressions, and forks unbooked future generation into the new home.
  It neither stops nor repositions the scheduler. Drums, note times, ties, gates,
  velocities, chance, conditions, repeats and custom chord strikes are retained.
- Diatonic pitches map by degree and octave; chromatic offsets remain relative.
  Borrowed/suspended captured chord tones retain their chord intervals as the
  root moves. Exact placed voicings retain explicit borrow/suspension shapes,
  including across repeated edits. Explicit MIDI tracks also transpose. Scale
  cardinality changes map degree positions proportionally within the octave;
  this is a defined mapping policy, not a unique harmonic interpretation.
- Progressions now capture their actual home key. Notes captured against another
  storage key retain optional relative-degree provenance. Scoped transformations
  retain the project's original storage key while updating progression context,
  chord labels, pitch metadata and step-specific range limits. The grid and
  audition keyboard use actual local context for display. Portable setup files
  validate and preserve this metadata; older minimal capture records still work.
- New attacks read transformed data immediately after a short encoder debounce.
  Already-booked/held audio finishes at its previously scheduled pitch. Actual
  MIDI overflow rejects the edit before publication; range limits are clamped
  to MIDI bounds. If a meter replacement is queued, finish that boundary change
  before applying sequencer transposition. Existing mixed-meter history and
  long planner replay limitations described above still apply.
- Older captures infer context from ordered chord scale pitch classes, otherwise
  the project key. Missing historical modulation/accidental intent cannot be
  reconstructed exactly. A transformed historical modulation can produce a
  custom interval set; choose a named family before editing that set's Key/Mode.
- Browser QA: Song mode changed **D Dorian to E Ionian during playback**, changing
  28 pad attacks and 32 bass attacks while preserving drums and expression.
  Reload restored E Ionian and the Scale page without starting playback.
  Continuous playback then changed progression 3 to **F Dorian**; the playhead
  advanced from displayed step 45 to 59 and entered progression 4. Export
  comparison preserved all **128 steps of earlier history across every role**,
  retained the storage key, and recorded the future planner home change at
  progression index 3. The original musical setup was restored and stopped.
  Browser evidence: `.tmp/workbench-seq-scale-live.png`,
  `.tmp/workbench-seq-scale-{before,finite,continuous-before,continuous-after}.json`
  and `.tmp/workbench-seq-scale-{browser,continuous}-report.json`.
- Regression coverage includes Dorian/Ionian mapping, borrowed/suspended chords,
  repeated continuous edits, modulation provenance, differing cardinalities,
  exact/custom voicings, explicit MIDI, range handling, atomic MIDI rejection,
  all-voice UI behavior, continuous history/future generation, finite save/reload,
  setup validation and legacy capture compatibility. Final verification is
  recorded below after the last full run.

Independent stompboxes, the shared physical patch table and cable physics remain
future work. No commit, push or deployment was performed.

Final verification after all sequencer scale changes: **348 test files / 2,551
 tests passed** (98.25 s), production build passed (61 s), and `git diff --check`
passed. Build output retains the existing large-chunk advisory. Logs:
`.tmp/workbench-seq-scale-full-final.log`,
`.tmp/workbench-seq-scale-build-final.log`,
`.tmp/workbench-seq-scale-final-pitch.log`.

### Object/layout foundation plan (2026-11-08, before implementation)

Implement section 6.1 next: a reusable, versioned desk object registry with opaque
stable IDs, presentation bindings kept separate from identity, absolute desk
poses, measured dimensions, visibility and z order. Adapt the existing All
surfaces/windows without changing audio roles, notes or routing. Migrate legacy
local coordinates without discarding them; include the object layout in portable
setups and accept older setup files. Spread arranges currently visible mounted
objects without overlap and straightens them only when explicitly pressed; hidden
objects retain their positions. Reset clears poses while retaining object IDs.
Keyboard, scope, tuning and setup surfaces participate too. Do not introduce a
fake power box before a real power model exists.

Verify legacy migration, stable IDs across role source changes, move/rotation/z
restoration, hidden objects, zoomed Spread, setup import/export and invalid
layout rejection before changing audio. The subsequent effects-page environment,
box interfaces and cable-connection approach are specified for review in
[EFFECTS_DESK_PLAN.md](EFFECTS_DESK_PLAN.md); they are not being implemented yet.

### Object/layout foundation delivered (2026-11-08)

- Added a reusable version-1 desk object document with opaque persistent IDs,
  UI bindings, kind/name, absolute `{x,y,angle}` poses, measured dimensions,
  visibility and z order. All currently registers 25 objects, including closed
  instrument/effects/tuning windows, keyboard, scope and setup. Source changes
  retain the instrument object's ID; tuning aliases share their object's ID.
  Bindings adapt the existing roles; independent/addable sequencer tracks and
  new processor instances are still future work.
- Adapted floating shells to the registry inside All. Existing local positions
  and angles migrate once; legacy data is retained. The keyboard's old relative
  offsets become absolute desk coordinates on first measurement. Keyboard,
  scope, tuning and setup surfaces now use the same rotation/pose path. Other
  synth pages keep their existing placement behavior outside this provider.
- Added **Spread**: measured, visible, mounted boxes are packed in desk units,
  straightened and fitted into view. It never runs automatically and never
  changes sound or routing. Hidden objects retain their places. Reset layout
  clears placements while retaining object identities. There is no dummy power
  supply or unconnected port strip.
- Portable All setups now export version 2 with the object document. Version-1
  setups still load and retain current object IDs and poses when none was supplied.
  Validate IDs, unique bindings, poses, dimensions and layout version before
  loading audio. Imported layout applies poses and visible surfaces together.
  Local layout persistence runs independently of finite/continuous song storage.
  Desk camera pan/zoom retains its existing local preference; portable layouts
  currently contain object state, not a portable camera.
- Browser QA found and fixed a startup window-clamp issue for the keyboard: its
  floating hook now mounts inside Desk's coordinate context. A regression places
  it at y=2400; the browser preserved y=1449 on import and reload. Browser checks
  also restored 5-degree synth and keyboard rotations, IDs and z order.
- Browser Spread packed **seven visible boxes with zero overlaps**, with a
  changed starting zoom and final fit at 56%. Export comparison preserved all
  musical data and sound edits, all 25 IDs, and the hidden ambience pose. After
  the keyboard fix, **all 25 object records matched exactly after reload**.
  The original music, sounds and object poses were restored; opening the Scale
  page afterwards intentionally raised the sequencer to the front. Playback
  was left stopped. Screenshot: `.tmp/workbench-objects-spread.png`; snapshots
  and report: `.tmp/workbench-objects-*.json`.
- Final checks: **349 files / 2,558 tests passed** (114.71 s), production build
  passed (32.83 s), and `git diff --check` passed. Meaningful regressions cover
  legacy migration, hidden/spread behavior, source changes, ID/z/rotation
  restoration, out-of-window keyboard placement, portable import and malformed
  object documents. Logs: `.tmp/workbench-objects-full-final.log`,
  `.tmp/workbench-objects-build-final.log`,
  `.tmp/workbench-objects-focused-final.log` and
  `.tmp/workbench-objects-keyboard-regression.log`.

The effects page work is planned for review in
[EFFECTS_DESK_PLAN.md](EFFECTS_DESK_PLAN.md): playable local DI-Poly desk, then
rack-controlled movable boxes, effect-specific interface/capability work,
processor independence, real connection headers, typed graph, dynamic patching
and finally cable physics. Those effects features are not implemented in this
foundation pass. No commit, push or deployment was performed.

### Playable effects desk follow-on delivered (2026-11-08)

Stage A of [EFFECTS_DESK_PLAN.md](EFFECTS_DESK_PLAN.md) is complete. The effects
page now hosts a local DI-Poly/keyboard/rack/output desk with scope, stable
object poses, scoped camera/reset, validated save/open and explicit remote
control compatibility. The reference source and tested rack are independent;
reload leaves audio stopped. See that plan's delivery record for browser PCM
measurements, regressions and remaining stages. Full suite: 351 files / 2,570
tests passed; final focused checks, production build and diff check passed.
Independent effect boxes and their individual redesigns remain the next stage.

### Effects control boxes follow-on delivered (2026-11-08)

The effects desk now exposes all 19 effect faces as independent movable editors;
Saturation, Delay and Reverb have compact physical-knob primary faces. The rack
continues owning membership/order and effects continue using the current shared
processors. Editor visibility, pose, Advanced view and the new delay clock persist
compatibly with Stage A setups. Full suite: 351 files / 2,577 tests passed;
production build, focused checks and browser audio/layout verification passed.
See [EFFECTS_DESK_PLAN.md](EFFECTS_DESK_PLAN.md) for the detailed completion record
and evidence. Processor independence, further face/DSP rework, graph ports and
cables remain subsequent stages.

### Effects face redesign and independent space processors (2026-11-08)

The local effects bench now has compact physical knob/display faces for all the
requested effects. EQ includes band selection and modeled response; compressor
includes configured transfer/timing views and real input/reduction readings.
The accepted saturation, delay/reverb and Z-plane primary designs remain.

Delay/reverb gain independent chain membership, order and separate processor
buses through append-only routing metadata. Untouched legacy rigs retain their
shared sound; a local chain edit activates independent serial routing, which can
change echo-to-room interaction and replaces the old shared tail. The separate
reverb processor is retained when removing delay from an independent rig. Other
instrument pages retain legacy editing unless using an independent setup.

Browser verification covered live edits/GR, both single-effect audio routes,
reorder/reload, stable identities, and 19-box arrangement with no overlaps. The
original sound was restored and left stopped. Detailed evidence and limitations
are in [EFFECTS_DESK_PLAN.md](EFFECTS_DESK_PLAN.md). General instance duplication,
new DSP proposals, typed ports and cables remain future work.

Final verification: **354 files / 2,596 tests passed**; production build and diff check passed.

The effects bench now uses fixed TS9/blueSky/BigSky-referenced footprint families, always-visible physical controls (no More/Advanced expansion), and a single On/Off/routing/close header. Ordinary effects including Filter have no decorative display. Focused checks: 28 tests; build and browser layout verification passed. See the effects plan for sources and measured sizes.

The subsequent effects performance pass replaces EQ's display with seven fixed
knobs, adds bottom footswitches/local tap, makes delay/reverb secondary controls
use fixed Select/Value hardware with idle guides, and compresses Z-plane to the
wide pedals' 337-unit height with four side knobs. Original sound state and IDs
were restored after real browser/audio checks. **355 files / 2,605 tests passed**;
production build passed. Boost/drive/fuzz and independent stereo monitor pedals
are explicitly planned for the next pass in EFFECTS_DESK_PLAN.md; no new DSP or
cable graph is claimed by this UI pass.

The effects follow-on now delivers its first gain/drive milestone: a versioned
bench processor chain preserving legacy order encodings, plus Clean Boost,
Overdrive and Fuzz boxes with actual DSP, live stereo peak strips and portable
settings/order. The first adapter remains one instance per kind. Stereo Scope
and Spectrum pedals, arbitrary duplicate processors and Y-cable/typed routing
remain planned. **357 files / 2,613 tests passed**, production build passed,
and 27 native checks across 42 stereo renders passed at 44.1/48/96 kHz. Browser
playback, editing, reorder, migration and save/reload were verified; original
sound and existing object IDs were restored with audio stopped. See the detailed
completion record and measured limits in EFFECTS_DESK_PLAN.md.

The next effects milestone now delivers independent stereo Scope and Spectrum
pedals at the output tap, with cancelable concurrent captures, separate L/R
histories, explicit Mid/Side viewing, single-shot scope capture, stereo WAV
export, spectrum smoothing/peak hold and portable independent visibility/settings.
Old desks and the old mono Scope API remain compatible. **360 files / 2,624 tests
passed**, 42 focused checks and the production build passed, and native browser
captures preserved stereo anti-phase audio with exact PCM pass-through at
44.1/48/96 kHz. Original sound/routing and existing object IDs were restored and
audio stopped. Arbitrary node taps, typed/Y-cable connections, duplicate processor
instances and cable physics remain future work. The effects plan also records a
copyable CSS recipe explaining the pedal enclosure finish.

The effects bench now also delivers an explicit three-bus parallel rig: Dry,
Overdrive and Z-plane → Chorus → Vibrato → Delay feed the shared eight-channel
mixer layout; independent master Delay/Reverb precede the master level/final
limiter and output Scope/Spectrum. Duplicate kinds across buses have independent
parameters, DSP and object IDs. Fresh visits use the physical reference layout,
88-key bed, Starmap Void/Dark Shape A and muted Dry, with seven quick sounds
including a two-LFO demonstration. Existing setups retain their saved choices.
Hosted custom modulation writes are repaired; previously approved MIDI devices
reconnect on reload, and MIDI/Setup is anchored to the effects ribbon.

This updates the earlier duplicate-processor roadmap: bus-qualified duplicates
are delivered, while repeated kinds within one bus, arbitrary node taps,
typed/free cable patching, physical cables and the shared tabletop remain
future work. Detailed acceptance evidence and limits are recorded in
`EFFECTS_DESK_PLAN.md`.
