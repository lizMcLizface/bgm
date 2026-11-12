# Tape prepared-handle authority

`TapePreparedHandleAuthority` is a new main-thread resource-ownership wrapper over the immutable explicit audio host `67c4c16fb555b3f3`. It does not implement DSP, choose a Native clock, or claim that portable lifecycle3d runs inside the old callback. Existing Native/default routes and all old assets remain unchanged.

## API

- `prepareDrive(value)` asynchronously returns an opaque owner-bound drive handle. `preparePreset(raw)` returns a corresponding full-preset handle. A valid handle pins its immutable physical resource through preparation and until successful commit or explicit cancellation.
- `commitDrive(handle)` / `commitPreset(handle)` synchronously preflight transport capacity and the complete patch before posting targets. Successful commit consumes the caller handle and releases its caller pin. The existing uploader's queued-command reference continues protecting the resource until the actual processor observation ACK.
- `cancel(handle)` consumes only a ready prepared handle and releases its caller pin. It does not cancel queued audio commands or another caller's work.
- `dispose()` closes logically in the same JS turn, invalidates outstanding caller handles, awaits the underlying owner's disposal, and prevents late preparation completion from issuing new work.
- `snapshot()` exposes bounded resource/caller state for control-side diagnostics.

At most32handles (pending plus ready) are outstanding perowner. Pool pressure reclaims only READY resources that are inactive, unqueued, and unpinned, with usable generation space. Reclamation waits for the real release ACK before reserving/reusing the slot. A held prepared handle is never evicted to satisfy another request. No candidate or handle capacity means refusal before target/resource mutation. Existing same-quantum/unobserved control limits still apply; a capacity refusal preserves a ready handle for an explicit later retry.

Tokens carry no public lease coordinates and are checked against an owner-local WeakMap. Forged, foreign, consumed, cancelled, or disposed handles fail. Caller pins are separate from audio command references, including while preparation is pending. Consumed token metadata is weakly held; strong pending/ready entries are bounded32.

## Verification

Six Node tests use the actual public67 generated processor, actual Tape Wasm, actual Rust curve preparer `dcad5770a9397205`, and real resource-control ACK protocol:

1. Eighty distinct prepare/commit/observe cycles pass, with at least49ACK-safe reclaims, zero DSP calls/oscillator advance during the control-only exercise, at most1024copied values percallback and at most2queuedchunks.
2. Thirty-two pinned resources refuse a further request without changing the source snapshot. Cancelling one inactive pin allows release-ACK then generation1→2 reuse; the cancelled token stays invalid.
3. Active and queued resources survive pool-pressure reclamation after caller pins are consumed.
4. Forged/foreign handles fail. A full-preset capacity refusal preserves caller pins and the ready token; retry after ACK and a new quantum commits all8records.
5. Pending preparation is pinned before readiness. Synchronous disposal rejects it and suppresses a late preparer result; the node is released.
6. Invalid or unsupported paused preparation refuses before allocation/target mutation; an explicit resumed retry succeeds.

This is resource ownership verification, not a new numerical Native audio acceptance. The separately accepted running67/Rust-preparation and explicit-gap browser evidence is recorded in `MODULAR_AUDIO_ENGINE_TAPE_LIVE.md`. A new processor must actually couple the portable lifecycle and context/source clock before a composed host can advertise those capabilities; that next slice is not implemented by this wrapper.
