# M3k: run-bound listening records and target-device feedback

Delivered after M3j (`7dea6bc`). The worker harness now saves, reviews and exports
listening records tied to an individual playback. This changes the host UI and
reporting only. Rust, worker/worklet DSP, PCM transport, buffering/scheduling
defaults, existing session formats and legacy desk/All audio remain operational.

## User observations retained

`reports/modular_audio/m3k-user-listening-feedback.json` preserves both exact
messages, including the clarification **“default and 2048m, message tasks, +2
blocks, played on three workers”**. The 2,048-frame selector is interpreted as
Medium; that label describes original capacity before extra slots.

| Reported settings | State | User observation | Declared buffering |
| --- | --- | --- | --- |
| Short / 96 kHz / +2 | App open | Helps; fully clean audio was not claimed | 1,536 frames / 16 ms |
| Short / 96 kHz / +2 | Lock screen | Not enough | 1,536 frames / 16 ms |
| Default / 48 kHz / +2 / Message tasks / three workers | Lock screen | Works fine | 6,144 frames / 128 ms |
| Medium / 48 kHz / +2 / Message tasks / three workers | Lock screen | Works fine | 3,072 frames / 64 ms |

The 96 kHz worker count/scheduler, device/browser/output route, repeat count,
matching run ID and exact build were not supplied. They remain unknown. No
previous Bluetooth route is inferred. The successful 48 kHz settings also have
more declared buffering; this is not an isolated sample-rate experiment or a
universal lock-screen guarantee. Matching selections show these reports in the
harness. Earlier feedback and all failed desktop diagnostics remain intact.

## Record and UI contract

- Each individual live playback receives a run ID, host start/stop ISO timestamps,
  engine version, fixture ID/hash, and `harnessVersion:m3k-listening-v1` plus the
  actual hashed module URL. Host timestamps are not hardware audio timing.
- A listening record contains the **full copied run report**, including exact
  actual rate/profile/headroom/executor/scheduling/capacity, source clocks/events,
  delivery/pass/error fields, analyser peaks, visibility and lead/gap diagnostics.
  It never derives those settings from subsequently edited controls. A batch
  targets its last individual playback, not the aggregate comparison.
- The separate form offers Not assessed / Clean / Improved, issues remain /
  Issues heard / Stopped, playback state, optional device/browser/output-route
  text (160 characters each) and notes (1,000). State is user-reported;
  `document.visibilityState` does not establish a lock screen. No device
  permission or automatic route lookup is added.
- A new run resets verdict to **Not assessed**, context to unknown and notes
  to blank. Fields/save/export/load are disabled during preparation/playback/
  comparisons. User hearing never rewrites `run.pass` or incomplete/failed DSP.
  The target labels score completion and method-specific run checks separately.
- Saved records have their own versioned key, independent of fixture/session
  keys. History retains at most **eight records / 512,000 JSON code units**;
  oldest entries are evicted to fit, with a visible warning to download records
  worth keeping. Browser quota can still deny storage. Corrupt/oversized data
  is not silently overwritten; errors stay local to the form. Download remains
  available when local storage fails.
- Loading a selected historical record only reviews its snapshot. It does not
  load a patch, change playback controls, start audio, or reinterpret an old
  build as current. Validation covers identity/timestamps, fixture/build, actual
  capacity/executor/scheduling, form enums and text bounds. Notes render as text.
- Download uses a local JSON Blob, removes its temporary anchor and revokes the
  object URL. Nothing uploads. The preview allows reviewing/copying the exact
  serialized record. Untied chat feedback stays separately identified instead
  of being retroactively attached to an automated run.

## Verification

- **5 files / 28 focused tests pass**, **1.61 s**:
  `.tmp/modular-audio-m3k-focused.log`. Includes actual-page DOM flows, immutable
  run binding after settings edits, failed/incomplete preservation even with a
  synthetic Clean verdict, new-run resets, busy controls, history reload without
  audio/settings changes, schema/size/enum validation, bounded eviction,
  corrupt/quota failure, note escaping, native download cleanup, and exact
  clarified feedback/latency. Existing profile/session/headroom checks pass.
- Public build/package/provenance checks pass, Vite **35.73 s**, existing chunk
  advisory. Engine runtime remains **`5e3eede4bd16e076`**, Wasm **296,101 bytes**,
  SHA256 `a5c3d4b70b57d63094d84fe539d2ec0effe30d5eea5fc59034fbb9a1ff462293`;
  no engine asset changes. Final host module: `modularWorker-B5WbJWiW.js`.
  M3j's 128 modular tests and earlier whole-repository checks are historical,
  not relabeled as new runs. No native Application Control bypass.
- `m3k-medium-48000.json`: desktop foreground, Medium / Message tasks / +2 /
  three workers, **64 ms**, full **840,000 frames / 357 events**, six/main peaks,
  zero transport misses. It does **not** reproduce the user's lock-screen test.
- `m3k-saved-listening-record.json`, `m3k-download-listening-record.json` and
  `m3k-reloaded-listening-record.json`: actual 48 kHz Medium run remains attached
  after controls change to Default / 96 kHz / timers / zero extras. Native
  download event observed. Fresh reload does not select a target or start audio;
  loading the saved record keeps fresh Default / 48 kHz controls unchanged.
  Saved/reloaded records and saved/downloaded run payloads compare exactly.
- `m3k-incomplete-listening-record.json`: deliberately early-stopped playback
  retains **`pass:false` / `delivery.complete:false`**, with an unassessed verdict.
  All automation-created annotations say **Not assessed** and explicitly note
  automated UI testing; no audible assessment is fabricated.
- `m3k-default-48000.json`: unchanged Default / timers / zero extras, full
  **840,000 / 357**, six/main peaks, zero misses. New target resets verdict and
  notes. Main page and saved session left **Default / 48 kHz / timers / +0,
  stopped**. Two unassessed automation records remain in separate local history.
- `m3k-record-invariants.json` and `m3k-browser-workflow.json` retain accounting
  and workflow evidence. Screenshot `.tmp/modular-audio-m3k-browser.png`.

Browser tooling caveat: the native download-event wait took about **864 s**
despite a requested 10 s timeout. It returned the event after audio had stopped;
no download path was requested. Avoid repeating native download waits/path
retrieval. Verify the visible preview/serialization without blocking on the
browser save flow. No new claim about physical audio follows from that event.

## Next task

Close M3's measured go/no-go gate before broad migration, then implement one
isolated **48 kHz opt-in sequenced-playback source-stem adapter** into the All
workbench's existing mixer/local/master-effects path. Preserve patch/role IDs,
setup files, transport, legacy route and explicit stopped route switching.
Medium / +2 / Message tasks is a user-reported target-device reference case,
not a new default or proof of CPU speedup. Its 64 ms buffering requires a clear
live-event/latency policy; keep current live keyboard/MIDI behavior authoritative
until that policy is tested. No general rack/effect migration, shared-memory
hosting, arbitrary repartitioning or distributed owners in the first slice.
