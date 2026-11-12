# Explicit complete Ambience owner

`createCompleteAmbienceCandidate` is an optional async owner adapter over the accepted complete Ambience bundle. It retains the component once and exposes its private output separately. It adds no synchronous `start()` alias, default backend selection, Main adoption or song field. A synchronous same-context `startAdmission(owner)` predicate must attest an actual published consumer of this async contract before a start is admitted.

`prepareStart(options)` forwards one actual prepared-start operation, preserves its authored receipt, and owns an abortable generation. `check()` requires the acknowledged stopped boundary; `checkRuntime()` permits a running owner. `stoppedStatus()` reports pending work, quarantine, authored fade and actual resource state without advancing rendering.

`stop({time, fade, deadlineMs})` aborts a pending preparation, preserves non-Abort startup failures, books the actual facade stop when needed, then observes its queue, jobs and source retirements. Success requires actual loop source-ended, spatial cancellation and cursor-free acknowledgements plus actual weather retirement. The selected profile permits fades from zero through five seconds. A new start during an active authored fade refuses with `COMPLETE_AMBIENCE_FADE_ACTIVE` before incrementing its sequence. The default uncertainty budget is 15,000ms after the authored fade endpoint, configurable from 1 through 30,000ms. This is a failure boundary, not a latency guarantee. Stop timeout quarantines the owner; late receipts cannot change the original failed promise into success.

Disposal is idempotent and begins actual component cleanup promptly. It observes pending start/stop and cleanup together behind its separate bounded deadline. Negative cleanup receipts and startup, stop or cleanup failures remain visible. Unknown retirement is not certified by timeout.

## Review negative and correction

Review of v4 found that awaiting `stopWork` before beginning component disposal could deadlock: the observer could wait for a retirement which that disposal must release. No actual-browser v4 acceptance is claimed. Its exact source and receipt remain in ignored local evidence under `ambience-explicit-owner-v4-before`.

V5 races external stop observation against a private abort fence. Timeout or disposal ends only the observation, while actual component retirement starts immediately and retains its own acknowledgement result. A permanent regression covers never-resolving retirement, stop timeout and subsequent disposal; all cleanup attempts begin, failure stays bounded and late results cannot resurrect success. Seventeen focused tests cover this boundary, fade admission, cancellation, actual acknowledgements, idempotence and aggregate failures.

## Actual desktop receipt

The v5 functional gate passed at 24kHz against complete-host identity `eacd215ec7d49700`. Its local full evidence is `reports/modular_audio/ambience-explicit-owner-v5-first.json`; frozen review-source receipt SHA256 is `5c18069247f40b35ee2a10a9e8f6a7afabd0413b2a2a28d9e7e59d5541867d7a`.

Both initial beds became ready at context time zero and started at .5 seconds, with all six stereo layer stems nonzero, including natural thunder. Canceling a staged candidate preserved the bootstrap reference. Primary stop at 5.013333333333334 with a .4-second fade reached the actual acknowledged stopped boundary at 5.450666666666667. A competing start refused with the typed fade error and sequence unchanged at one. Primary retirement left the survivor playing.

A fresh third bed was prepared while that survivor remained active. It became ready at 14.453333333333333 and started at 14.953333333333333, with zero preparation-late frames and all twelve wet channels nonzero. Fresh three-loop upload still cost approximately nine seconds; the half-second lead begins after readiness. Final zero-fade stops for survivor and third bed both produced acknowledged stopped receipts. Every bed cleanup was clean; releasing the explicit bootstrap left no shared owners or reservation tickets. Default Native methods and Offline delegation remained unchanged in the gate.

This receipt establishes the detached owner lifecycle. It is not a new Native PCM comparison, universal real-time preparation deadline, or complete Main integration claim. Main must separately consume async prepare/start, explicit output authority, common transport epochs and acknowledged stop/drain; old synchronous consumers remain ineligible.
