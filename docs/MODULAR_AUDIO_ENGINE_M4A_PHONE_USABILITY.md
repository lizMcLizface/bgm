# All phone usability and source-delivery checkpoint

2026-11-09, following `72c196d`. The user reports: **"trying the one worker
horribly breaks the sound, serial worker works just fine. on desktop one worker
works as well"**. This is recorded without a retroactively assigned run/build,
device model, browser, output route, rate or missing-frame count in
`reports/modular_audio/m4a-phone-worker-feedback.json`. Earlier desktop passes
do not supersede that listening failure. Worker delivery/scheduling is a
candidate cause, not an established diagnosis.

The user could not mark the floating report on the phone, found the full JSON
too large for chat, and reported overlapping first-open panels, horizontal page
scroll caused by the wide ribbon, and upward gestures reloading the page.

## Shipped boundary

- **Serial reference is the initial All preview choice**, including the
  controller's omitted-mode default. One worker remains an explicit experiment.
  This changes only the opt-in All source preview, not normal playback, keyboard/
  MIDI, legacy DSP or existing worker-harness defaults. Buffering stays at
  512 x six = 3,072 frames / 64 ms and 48 kHz; no speculative buffering retune.
- All explicitly requests `stopOnUnderrun`. On the first missing PCM span its
  worker output advances/records that span, stops, reports `delivery-gap`, and
  releases the preview through its normal cleanup. It does not start a new
  serial engine mid-run or replay stale notes. Serial has no PCM-worker queue.
  The generic worker route defaults this policy to false, preserving the
  existing deliberate-stall/recovery experiments. Late/incomplete audio cannot
  become a successful complete run.
- Reports gain a run ID, captured browser user-agent string and explicit host
  revision `all-preview-delivery-v1`, in addition to actual executor/build,
  captured source/notes, clocks and counters. The UI summarizes actual delivery
  independently of subjective listening. **Copy compact diagnostics** excludes
  score/patch arrays, histograms and traces; bounded text fields keep it small
  enough for chat. **Copy full report** remains separate. If clipboard access
  fails, the chosen payload is presented in a selectable readonly textarea.
  Compact text is also always available in its own disclosure for manual copy.
  No automatic transmission or listening verdict is inferred.
- All's **Setup** is now an anchored top-ribbon dropdown, portalled outside
  the transformed desk. Escape/outside dismissal and focus return use the
  existing dropdown implementation. The old Setup object's ID/pose remain in
  saved layouts, parked invisible and unmeasured; it is not recreated or moved.
- All opts into contained camera navigation on coarse pointers as well as
  desktops. It no longer rewrites the phone viewport to desktop width or clamps
  every panel into the phone's home width. The ribbon scrolls horizontally
  within itself; the document remains viewport-sized. Desk gestures are owned
  by the view, with root overscroll disabled. **Move desk** lets a drag pan over
  controls without editing them; turn it off to use them. **Go to…** frames and
  raises a visible object without moving its pose. Zoom/Fit/Reset/Spread stay
  together above the lower edge; Fit reserves their height. Other pages retain
  the shared Desk's existing native-touch policy unless they opt in.
- A genuinely fresh narrow-screen layout is packed once after the song and
  measured panels are ready. This handles responsive panel height growth.
  Existing saved poses are not silently rearranged. Use **Spread** once to
  repair an already-overlapping saved layout; it does not change the song or
  audio routing. Existing IDs, song/setup schemas and legacy controls remain.

## Verification

- Generated-worklet/controller/route, All, Desk, setup-file and report checks:
  **117 tests / seven files pass**, 59.25 s. Updated All/Desk/object-store/report
  workflows: **80 tests / four files**, 60.12 s. Final arrangement/UI checks:
  **75 tests / three files**, 59.10 s, followed by **seven Desk tests**, 1.36 s,
  for the final reserved-navigation fit. The final selectable compact report
  passes **four report tests**, 1.26 s. These runs overlap; do not add counts.
- Actual Node worker/default recovery/independent instances, selected core/FM
  source PCM, plans, Effects and host regression: **66 tests / five files pass**,
  60.88 s. Timer/message, 44.1/48/96 kHz raw comparisons remain passing. The
  preview guard is tested with a deliberate missing span: it stops at 128
  source frames, records 128 missing frames and never reconstructs a serial
  engine. The default route still recovers from that same missing span.
- Public build/package/provenance checks pass, final Vite **39.56 s**. Runtime
  **`2dd834c6b07330cb`**; Rust/Wasm remains **296,101 bytes**, unchanged SHA256
  `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`.
  Native Application Control restrictions are not bypassed.
- Real desktop browser at **390 x 844**, fresh isolated origin: body/document
  width **390**, device-width viewport preserved, no pairwise base-panel
  overlaps after arrangement. Content bottom **736.91 px**, navigation begins
  **746.40 px**. Setup is fixed at x=12..378, y=56..832, width **366 px**, outside
  `.desk-home`, with serial initially selected. This is a phone-sized desktop
  check, not a physical Safari/Chrome touch or pull-to-refresh guarantee.
- The final live serial Bass pass completes **668,956 source frames / 22 events**,
  zero late/overflow events and nonzero source/channel/master peaks. Its compact
  report is **986 characters**, matches full-report run ID
  `92feee46-2d7c-42cc-9187-8203309bd974`, and correctly leaves worker delivery
  counters null. The selectable readonly field selects all 986 characters on
  focus. The UI reports successful automatic copy; the browser clipboard bridge
  did not expose its payload, so native clipboard readback is not verified.
- Move desk changes the camera without changing object poses. Existing object
  IDs/poses compare exactly after reload. Continuous mode regenerates notes;
  this is not an exact song or exported setup-file round trip. Evidence:
  `m4a-mobile-ui-{workflow,serial,serial-final,compact}.json` under
  `reports/modular_audio/`; screenshot `.tmp/workbench-mobile-diagnostics.png`.
  Agent-created isolated QA tabs/server are closed; the user's existing desktop
  workbench and HTTPS LAN preview remain available.

## Limits and next task

The phone worker's actual counters and cause are still unknown. A zero-miss
report would not certify physical quality, worklet CPU or device output. No
worker speedup or larger-buffer cure is claimed. Layout fixes and copy controls
must be checked on the physical phone; native pinch zoom is not added to the
contained camera (use its +/- controls and Move desk).

Subsequent evidence supersedes the unknown-counter status: the user supplies
an actual guarded worker `delivery-gap` run. See [correlated phone failure,
cross-thread audit and next measurement](MODULAR_AUDIO_ENGINE_M4A_PHONE_DELIVERY.md).
The underlying scheduling/delivery cause and physical output verdict remain open.

Keep the confirmed **HTTPS LAN preview** running at
`https://192.168.0.228:4176/synths/all/`. No deployment or firewall change.
Next: use the working serial path and obtain **compact** diagnostics from any
future guarded worker test, bound to this run's source/build/browser/settings.
Then decide whether to tune transport, investigate non-queue output failures or
leave the phone on serial. Do not migrate more roles or infer clean listening
from desktop counters while this target-device result remains unresolved.
