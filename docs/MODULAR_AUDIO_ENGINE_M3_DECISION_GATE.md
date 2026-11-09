# M3 decision gate: bounded comparison, no default migration

2026-11-09. Foundation through M3k committed as `21142a1`. Decision: **GO for
one isolated, opt-in source-stem comparison in All; NO-GO for replacing the
workbench transport/default backend or claiming a worker CPU speedup.**

## Evidence and limits

- Six actual owned core/FM/percussion engines, timestamped events and coherent
  program/key mixing are implemented. Same-cadence worker PCM/control agrees
  exactly with the serial graph; independent state, failure/fallback and bounded
  queue/recovery behavior are tested. Existing golden DSP remains unchanged.
- Three-worker desktop Short / 96 kHz with original capacity fails repeated
  delivery. +2/+4 slots pass three measured repeats at 16/21.33 ms. This is
  capacity evidence in that environment, not a universal scheduling guarantee.
- The user reports 48 kHz / three workers / Message tasks / +2 slots works
  locked with Medium and Default: 64/128 ms declared buffering. Short / 96 kHz
  +2 helps while open but remains insufficient locked. Device/route/build/run
  correlation is unknown; rate, producer cadence and capacity all differ.
- Worklet wall time/CPU attribution and physical loopback are unavailable. Task
  timing excludes scheduling, transport and downstream effects. No demonstrated
  CPU speedup or low-latency live-MIDI advantage justifies replacing defaults.
- All can load native/physical/procedural/classic instruments and drum machines
  beyond the owned graph's coverage. Six fixed reference identities are not a
  drop-in replacement for every saved song. The graph's dry master must not
  bypass All's current inserts, shared sends, mixer or limiter.

## Authorized first integration boundary (M4a)

Implement a **selected pitched-role, current-progression, one-pass source
preview**, using its actual supported core/FM patch and captured note plan at
48 kHz. The UI explicitly distinguishes this from normal song playback. Reject
unsupported sources; never substitute a reference sound or overwrite the song.
Use a fresh owned graph generation and one worker (or explicit/failed-start
serial fallback), not a six-role/three-worker claim for one migrated role.
Reuse Medium +2 / Message capacity (3,072 frames, 64 ms) as a declared comparison
budget; the user's three-worker lock-screen result does not validate this new
one-worker adapter.

Inject the raw stem **before the selected voice's existing insert/FX/gain/send
path**, preserving source level, voice output trim, channel tone, mixer,
shared/master effects and saved role IDs. Normal transport stays stopped during
the preview, avoiding duplicate sequencer notes. The other roles' ordinary
sequencers and live keyboard/MIDI retain their existing engine and authority.
Stop preview on score/tempo/source/host changes; no loop/pause/live-edit promises.
Explicit Stop must dispose only the preview and leave held keyboard voices intact.

Preparation must not suspend the shared AudioContext or advance the finite
source before it is connected/armed. Cancel, host replacement, startup failure
and natural completion must release nodes/workers/taps without stale replay.
Keep normal transport and existing setup/preset persistence unchanged. Do not
persist an experimental backend as a new default.

## Acceptance and next gate

Prove real core and FM source plans, note timing, deterministic probability,
tail/resource bounds, raw same-cadence PCM, armed startup and independent
instances. Test the actual All route: post-effects/master activity, live mixer
changes, keyboard coexistence, stop/cancel/error cleanup, normal playback and
save/reload. Record actual executor, 64 ms buffering, events/clocks, misses,
unsupported cases and limitations. No zero-CPU/device-quality inference.

Only then extend supported roles/transport scope. General six-role replacement,
drum-kit translation, continuous/live score edits, low-latency keyboard migration,
shared memory/hosting and distributed owners remain separate gates.
