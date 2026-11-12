# Echo and routed-effect terminal ownership

Host `c59effae4592c9da` corrects the Echo disposal path exposed by the actual editable Main successor gate. The original Echo numerical module remains `a99400a9a23f9a8f`, 20,374 bytes / SHA256 `c68f36537394bde88dae0945e7c475884595e4866aed085f8037355595188cd3`. The entire original processor process() and stop() bodies remain byte-identical. No clock/activity, DSP, control arithmetic, compensation or output-order change is included.

The former facade rejected pending clear/stat operations with an untyped “Echo disposed” error. LabVoice reported that expected teardown cancellation through its runtime failure callback, poisoning enclosing source health. The former Echo terminal timeout also resolved as though cleanup succeeded, and both routed-effect wrappers dropped asynchronous child disposal promises.

Echo now returns the exact SourceFence terminal capability. Its processor reports version1, actual released state and clean/error status after attempting the existing free operation. Missing or malformed acknowledgements preserve uncertainty; timeout does not close the receiver or manufacture release. A later positive acknowledgement can prove release without changing an already rejected disposal promise. Native detach failure still attempts actual kernel disposal and preserves aggregate failure. Processor failures remain primary errors. Readiness is checked against the actual host identity/profile.

Pending operations reject with AUDIO_OWNER_DISPOSED on intentional disposal. LabVoice suppresses that runtime callback ONLY when its own disposal has already begun. A real failure, or the same typed cancellation while the voice is live, still reaches the runtime error callback. Insert and VoiceFx clear promises are observed as well. The cancelled operation remains a rejected operation; it is not relabeled a successful clear.

Both routed helpers now return one idempotent retirement Promise, attempt all private Native disconnects, and await actual Echo/room owners. Their initially returned gains are protected during partial construction. Construction keeps its original primary error and waits for child cleanup, retaining cleanup failures. Healthy allocation/connect/setter order and routing math are unchanged. This does not certify the separate outer LabVoice/Instrument acquisition paths or the unrelated ensemble-channel constructor.

47 focused checks across six files pass: actual Wasm processor state, negative free, typed release fields, missing/late/negative ACK, Native detach failure, startup identity, command cancellation, withheld child ACKs, independent cleanup errors, partial gain construction, primary/cleanup preservation and LabVoice cancellation classification.

## Actual desktop evidence

The existing48k Native matrix passes all twelve cases (two independent Rust owners per case): continuous, ended/restarted, explicit offroute/sleep, clear, delayed input and late creation, for both ping-pong modes. Maximum absolute difference is1.408422525587598e-38, within the unchanged1e-6 bounds; independent outputs are exact. This matrix uses cold Offline cleanup proof and is not the separate live ACK claim. Receipt: `reports/modular_audio/echo-terminal-c59e-native-48000.json`.

The actual running-context group creates two nonzero Echo owners, then disposes the primary with outstanding clear and stats requests. Both requests reject with the typed cancellation; no runtime error callback fires. The primary receives a clean actual terminal ACK while the context remains running. The survivor's nonzero samples increase2,046→12,542, then it too obtains its actual clean terminal ACK BEFORE context close. Both disposal promises fulfill, private capture processors acknowledge future JS render quiescence (heapFreed:false), the Native driver ends, and the context closes cleanly. Receipt: `reports/modular_audio/echo-terminal-c59e-live-final.json`.

The independent Source/Core continuity failure during whole-Main succession remains a separate gate. The Echo fix does not ignore enclosing owner errors, relax Source7a checks, claim a full all-Rust application, change defaults or deploy anything.
