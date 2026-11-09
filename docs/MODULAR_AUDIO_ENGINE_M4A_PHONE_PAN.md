# All phone navigation over panels

2026-11-09, following `9a398da`. The user reports that the new phone view is
still awkward: a mixer covering the screen prevents moving away because touch
gestures starting over it belong to the controls. Treat the earlier desktop
390 px layout check as insufficient evidence of physical phone usability.

## Change

- In All's contained camera, **drag a panel's non-control surface with one
  finger** to pan. Previously the entire registered panel was excluded from
  camera movement. Actual controls, grips, keys, dialogs and editable fields
  keep their existing ownership. Pages using the shared Desk without contained
  navigation retain their old filtering/native-touch behavior.
- **Drag with two fingers over controls** to pan even when the mixer fills
  the view. A capture-phase handler sees the second touch before a child can
  swallow it, cancels the original control drag, releases its capture and
  captures both pointers for the camera. It uses the two pointers' centre;
  scale is unchanged. This adds panning, not pinch zoom.
- Lifting/cancelling either member ends camera movement. Remaining fingers
  stay consumed until all are lifted, so they cannot resume a fader/knob edit.
  Gesture clicks are suppressed; the next separate pointer interaction and
  keyboard activation work normally. Blur, hidden page, removed controls,
  cancellation and unmount clear tracking.
- The **keybox is excluded** from starting this two-finger gesture to preserve
  multi-touch notes. Navigation controls remain usable; Setup lives outside
  the desk and keeps its own scrolling and selectable text. Existing **Move
  desk** still permits one-finger dragging anywhere, including over controls,
  and **Go to… / Fit all** remain available.
- Mixer/ambience touch faders defer their initial jump until tap release or a
  vertical drag of at least four screen pixels. This lets a second finger claim
  navigation without the first contact changing a level. Mouse down stays
  immediate; arrow-key and double-click behavior stays intact. An intentional
  one-finger edit made before the second finger arrives is not rolled back.
- A visible narrow/coarse-screen hint reads **Drag surfaces · 2 fingers over
  controls**. Fit reserves the hint/navigation height. No object IDs, poses,
  song/setup schema, audio routing, worker options or engine assets change.

## Verification

- All, Effects, Desk, keyboard and mixer candidate checks: **111 tests / six
  files pass**, 63.84 s. Final gesture/fader/Desk/mixer follow-ups: **15 tests /
  three files pass**, 1.57 s. These overlap; do not add their counts. Tests use
  actual React Pot/Fader controls, capture-phase dispatch and a simulated
  PointerEvent implementation in jsdom, not physical touch hardware.
- Assertions cover one-finger edits, pan through a child that stops bubbling,
  control cancellation/capture transfer, full-panel camera-only movement,
  unchanged poses/scale, zero level changes when a fader starts the two-finger
  gesture, touch tap/drag thresholds and immediate mouse editing, keyboard and
  navigation exclusion, remaining-finger/click suppression, next interaction,
  cancellation/blur/disposal and removal of the first touch's control.
- Public build/package/provenance checks pass, final Vite **36.43 s**. Runtime
  remains **`2dd834c6b07330cb`**, with unchanged Rust/Wasm and worker assets.
- Real desktop Chromium at **390 x 844**, zoomed mixer filling the viewport:
  native single-pointer drag starts on `.dk-strips` inside the mixer and changes
  the camera with **Move desk off**, unchanged object IDs/poses and all mixer
  slider values. Document width stays **390**. Go to… frames Sequencer, and
  Setup still opens. No audio is played. Evidence:
  `reports/modular_audio/m4a-phone-panel-pan-browser.json`, screenshot
  `.tmp/workbench-phone-panel-pan.png`. The isolated QA tab/server are closed
  and the temporary viewport override is reset; the user's HTTPS server stays.

## Limits and next task

Physical Android multi-touch, browser pointer capture and pull-to-refresh still
need confirmation. Browser automation exposes single-pointer input only; do not
claim it reproduces the two-finger hardware gesture. No additional worker
quality result is implied. Keep the confirmed HTTPS LAN preview running and do
not deploy. Once phone navigation is usable, resume the bounded producer-wait /
last-accepted-packet diagnostics in `MODULAR_AUDIO_ENGINE_M4A_PHONE_DELIVERY.md`.
