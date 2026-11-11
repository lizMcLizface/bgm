# Owned original insert and FDN bus hosts

`prepareOwnedBusHosts(context)` creates context-bound `createInserts` and
`createEffectsBus` factories. They use the existing original Rust insert and
FDN algorithms through owned handles, with complete constructor settings,
independent memory, bounded control barriers and acknowledged disposal. They
retain the original actual single insert input and three independent FDN send
inputs. No native preset translation or sampled-IR replacement is involved.

The worklet copies actual128-frame callbacks into the original kernels. Empty
inputs and mono duplication follow the original processors; clear and dynamic
parameter commands use the original kernel operations. Malformed packets stop
and free the unit before processing can continue. There is no per-callback
buffer-view construction. Sixty-four pending barriers and a five-second timeout
bound control bookkeeping; disposal is idempotent, rejects pending controls and
waits for the owned-free acknowledgement with a one-second cleanup fallback.
Cold configuration persistence is the existing complete original parameter spec;
running delay/filter/tank state is not serialized.

The existing prepared environment adopts these factories in LabVoice's active
instrument inserts, local FDN routes and owner-scoped shared FDN pool. Send
levels, shared response keys, native echo routing, source leases and original
normal defaults remain unchanged. Factory selection is context-owned and not
written into song presets. Sampled convolution, other native effect topology,
NativeEcho DSP and the broader private/shared room policy remain separate work.

Fourteen permanent actual-Wasm processor checks pass across six rates8–192k:
both original public processors match the new owned processors sample-bit-exact
through active effect controls, clear, mono/stereo/absent inputs and disposal.
They also verify independent states, exact cold reset and refusal before partial
processing. Four factory lifecycle checks cover constructor data, cross-context
rejection, fatal errors,64-request bounds, acknowledgement and timeout cleanup.
Existing shared-room pool and voice-performance regressions pass, including
rollback of a synchronously failed custom factory without touching default rooms.

The fixed `tools/owned-bus-live.html` page needs no settings matching:

- Twelve actual original/owned insert/FDN host cases (six rates x two kinds)
  pass with PCM exact zero difference (`owned-bus-live-first.json`).
- Six actual LabVoice composition cases (44.1/48/96k x local/shared): two Core
  voices per path, active original inserts, native echo routing and original
  FDN returns all pass with PCM exact zero difference
  (`owned-bus-normal-path-final.json`). These bind host24b5b95beba0d5f1;
  the preceding12-case capture binds262906c930524840, before facade-only error/
  disposal hardening. Numeric source/processor kernels are unchanged.

Build/check with `tools/buildOwnedBusLive.mjs`. The manifest hashes the exact
owned adapters, typed contracts and both unchanged published Wasm kernels;
loading verifies those byte hashes before compiling. Earlier owned-effect DSP
allocation/cadence evidence remains in the original effect checkpoint. These
new host results establish callback parity and route composition, not native
oscillator/modulation topology equivalence, device deadlines or physical listening.

Next complete Classic normal-host adoption, ordinary compressor demand/arming
and physical-source live control histories, then remaining native effects and
shared/private room latency owners. Continue preserving native algorithms.
