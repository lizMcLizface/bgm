# Original Instrument BitCrusher

This optional prepared leaf ports the actual Nodes.BitCrusher AudioWorklet and its complete dry/wet law. It is distinct from the desk RackCrusher. No existing Native class, default backend, Instrument wiring, Sweep or Tone source is changed.

## Numerical contract

The raw engine retains the original binary64 fractional phaser, exactly one subtraction at each hold boundary, binary64 held value, and Math.floor(input / step + .5) quantizer. Only the first worklet output plane is written. A stereo program therefore retains independent right-channel dry audio and zero right-channel crushed audio. Mono has one logical output; the layout is immutable and caller-declared. The ScriptProcessor fallback has a different implicit mono/downmix boundary and is outside this prepared profile.

Four independent pinned timelines own dry gain, wet gain, k-rate bits and k-rate normalized frequency. Gain writes preserve both original currentTime reads and the exact branch expression 1 - ((amount - .5) * 2). Repeated amount writes are retained. Amount zero retires the logical raw actor; rebirth resets only its phaser/held sample. The complete preset reserves all required records before the first target mutation.

The source-pinned restricted power function implements base .75 and Float32 exponents clamped to [1,16]. All sixteen integer steps are exact. Current JavaScript platform Math.pow and the restricted profile have small binary64 differences: the actual browser corpus retained 3,353 differences among 32,768 fractional exponents, at most 1.1102230246251565e-16. Nevertheless all 25,264,128 actual Float32 quantizer outputs around 257 signed thresholds and their adjacent Float32 inputs match bit for bit. Both the raw mismatch evidence and output evidence are retained. This sampled observation is not a universal Math.pow or entire-float-domain proof.

## Requested versus rendered routing

The saved 0418 causal experiment proved that an already pulled real input block can coexist with a new stable zero-valued demand AudioParam. The Native input bus is captured before parameter evaluation. Returning from main-thread disconnect is therefore not a rendering-thread disconnection receipt.

The new profile transports one atomic a-rate integer routeTag: serial * 2 + requestedOn. Zero is unborn/off, tag one is reserved, and the serial is bounded to 8,388,607 without wrap. The tag is published before a Native edge mutation. It transports graph intent, not a DSP coefficient. Its complete native curve is validated before state mutation.

| Requested state and actual private input | Renderer state | Processing |
| --- | --- | --- |
| Off, zero channels | OFF | Control service only; a matching fresh receipt can acknowledge quiescence. |
| New on, zero channels | OPENING | No raw DSP before actual attachment. |
| On, connected channels | ACTIVE | Process every actual sample. |
| Fresh off after realized activity, connected channels | DRAIN | Continue processing the entire already pulled block. Never discard or replace it with zeros. |
| Old on still visible after actual disappearance | WITHDRAWAL_PENDING | Freeze raw DSP while waiting for the new off identity. No off proof is invented. |

A mismatch is bounded to 64 callbacks. Boot off-route input is refused. Zero channels describes the private unity input edge being absent; no zero-PCM heuristic is used. A fresh rising identity earns a reconnect permit only after an actual absent-input/off-identity witness. The permit is consumed by that activation; it cannot waive an unrelated later gap. Active clock, finite-value and future-publication guards remain strict.

Off requests keep a real input-isolated control sink until the requested route is actually realized, including when the last output is removed during a legal Offline pause. Live arm requires the exact requested route identity, actual zero input when off, and a genuinely fresh Native consumer frame. Constructor readiness or advancing counters alone is insufficient. Offline pre-render arm remains explicitly preparation-only.

Original raw no-input behavior remains separate: when the original raw processor itself is pulled with an absent input, its phaser still advances and a hold attack selects zero. The complete prepared host's absent private input edge is an explicit unpulled program state. Ended or silent sources whose edge remains connected still supply their logical channels and continue normal processing.

The authority is pinned Chromium e14de735: [AudioHandler input pulling](https://raw.githubusercontent.com/chromium/chromium/e14de735f191c3a2bdce821a5e3f146bdc987b1e/third_party/blink/renderer/modules/webaudio/audio_handler.cc), [AudioWorkletHandler connection and parameter order](https://raw.githubusercontent.com/chromium/chromium/e14de735f191c3a2bdce821a5e3f146bdc987b1e/third_party/blink/renderer/modules/webaudio/audio_worklet_handler.cc), and [input bus/channel copying](https://raw.githubusercontent.com/chromium/chromium/e14de735f191c3a2bdce821a5e3f146bdc987b1e/third_party/blink/renderer/modules/webaudio/audio_worklet_processor.cc). Their source hashes already appear in the accepted native-compressor-live profile. The shared NEW PhysicalInputRouteState describes this private single-input binding; it is not a universal automatic-tail or arbitrary multi-input worklet policy.

## Ownership and limits

The host permits four prepared owners per context, 32 unobserved 14-word control records, 128 cold records and 16 bounded requests. Its 580 AudioParam descriptors transport raw authored metadata and Native clock fields. There is one kernel binary shared by the public kernel/reference and host packages. Numerical resources and the final generated source are hash checked without ignored temporary build files.

Logical close publishes a one-way terminal gate before removing own Native edges. Only the real port-dispose handler frees Rust state and returns the typed source receipt. The provider clock is held through that proof. Audio failure remains observable even when resource release succeeds. Wrong-owner, missing or malformed disposal identity cannot free an actor. Constructor failure cleans the complete actual returned prefix.

The synchronous Native getAmount getter is explicitly unsupported rather than replaced by a requested target. requestStats exposes last actual owned evaluation values. Captured/frozen Native insertion epochs and the declared physical-route protocol are supported; unmatched unsuspended Native multi-handler insertion equivalence is not claimed. No normal application selection is made here.

## Verification

| Identity | Authority |
| --- | --- |
| d39620172e181667 / d9c56f558f0288dd | First 48 kHz pilot: 12 cases / 24 Native comparisons, Float32 word-exact. |
| d730b78cbfe55e50 / c29fe5d2c248b2be | All six rates, 72 cases / 144 Native comparisons word-exact; exact independent/input witnesses and 144 healthy natural-end/source/clock proofs. Actual 48 kHz gap and true 192 kHz cold replay also pass. Its separate reused-live round-two transition is a retained negative. |
| 041828978d9a4848 / same c29 | Diagnostic-only successor preserved all DSP. Two 20-round runs passed, but the intrusive actual upstream experiment then reproduced stable demand zero with a real connected nonzero block. Those successes did not erase the negative. |
| 64fe2d51c12fdee9 / same c29 | Actual active-drain policy: all eight adversarial cases process the real nonzero block and then prove OFF; opening is observed with no raw DSP. Twenty reused rounds / forty actors pass across twenty actual source generations, with real terminal and provider release before context close. New 48 kHz 12-case Native comparisons are word-exact; physical gap and full-HTML 192 kHz cold replay pass. |
| 740423b0ebad90d3 / same c29 | Malformed standalone receipt guard only. The route-state class is unchanged; the entire generated processor differs only in its version literal. Kernel and Wasm remain identical. Final current-identity rechecks pass: eight actual nonzero drains with matching OFF proofs, the twelve-case 48 kHz Native matrix word-exact, and twenty reused rounds / forty actors with real terminal/provider release and healthy audio. |

The 64fe and final 7404 independent audits retain receipt hashes, all actual OFF proofs, nonzero drain counters, constructor zero-DSP receipts and both owned/native/input hashes. The intrusive workload is explicitly not a hardware deadline or device listening test.

The only Rust successor after the first pilot refuses a nonfinite final mixed sample. It clips or normalizes nothing; erasing that guard reconstructs the entire earlier source digest. All later changes preserve the exact 38,038-byte c29 kernel (SHA256 3041ece0d20a1ad2b5ba0a849d7d79bc11850f19032b3b20d4f931611e67494f), numerical wrapper, raw control codec and original setters. The allocation audit covers twelve rate/layout cases and 12,288 quanta with controls/lazy resets: zero Rust allocation, reallocation, free or memory growth after preparation. No JavaScript/Native AudioParam heap or physical deadline claim follows.

Sixty-four focused checks cover literal-original PCM, fractional hold and signed ties, stereo behavior, preset capacity, strict clock/identity/frame refusal, truthful constructor/terminal cleanup, the real falling counterexample, inverse opening/withdrawal, actual OFF arm receipts and cold-scene authority. The three canonical checks are buildInstrumentCrusher.mjs --publish --check, buildInstrumentCrusherHost.mjs --publish --check, and buildInstrumentCrusherReference.mjs --check.
