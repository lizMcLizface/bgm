# Original Instrument Filter and EQ2

This is a separate numerical port of the actual `src/nodes/filter.js` and
`src/nodes/eq2.js` chains. It does not select a new application backend. The
rack filter, which has different stages and controls, is not used as a substitute.

The Filter owns one Biquad and preserves its seven original types. Its constructor
schedules 11000 Hz at the actual constructor epoch; it does not assign the
frequency intrinsic. EQ2 owns three Biquads, low shelf → mid peak → high shelf.
Its seven constructor property assignments retain the original order and default
Q/gain/detune histories. Combined mode processes EQ2 before Filter, including
Float32 rounding between stages. Every accepted type change clears that Filter's
state, including A → B → A before another rendered block.

The implementation uses the separately recorded Chromium numerical profile,
normalized frequency and detune ordering, the accepted bounded timeline and
Biquad helper. Raw scheduled frequency targets survive until render-time
Nyquist clamping. Constructor property assignments have their separate intrinsic
and scheduled-event effects. No inferred Native intrinsic-value getter is added.
The explicit numerical contract supports 8–192 kHz, immutable mono/stereo layouts,
canonical 128-frame blocks and at most 256 timeline events per parameter lane.
Gain ±40 dB and detune ±153600 cents are explicit supported subset bounds, not a
claim to reproduce every value accepted by the original browser API.

`OwnedInstrumentTone` owns its Rust state and two input/output planes. Explicit
unpulled service advances only its source clock; it does not prepare parameter
curves or render Biquads. A gap requires an explicit source-frame reanchor.
Actual Rust credit queries control event admission. The implementation performs
no audio/control-path allocation after preparation.

The maintained desktop review imports the literal original classes, captures
actual Native input and output using the same-port Source7a clock, and replays
that captured input and actual recorded setter epochs through two separate Wasm
instances. Capture requires frame zero, every complete 128-frame block, and no
missing/repeated frames. Raw AudioWorklet currentFrame is diagnostic only. The
unchanged numerical bounds are 1e-4 maximum absolute error and relative RMS.
No gain fitting, PCM shifting or output normalization is performed.

Allocation verification covers 36 rate/layout/mode cases and 9216 quanta:
alloc/realloc/free are all zero, and each prepared instance retains 1507328 bytes
of Wasm memory without growth. Fifteen kernel checks cover constructor history,
serial-stage composition, type-reset semantics, bounded event admission,
nonfinite/layout refusals, unpulled service and fresh-instance reconstruction.

The current artifact is kernel 1afe2ec923809c85, 85857 bytes. Its source profile,
notices and receipt are checked together under `public/instrument-tone-host/`.
The six-rate browser matrix passes 72 cases /108 compared channels, with
491520 captured frames and 84 retired original Native owners. Maximum absolute
error is 8.463859558105469e-6 and maximum relative RMS is
2.2315727016576927e-5, within the unchanged 1e-4 bounds. Both independently
instantiated Rust streams are word-exact in every case. Every capture begins at
Native frame zero, has complete coverage, and reports no rejected clocks,
missing blocks or cleanup errors. A real 192 kHz HTML reload reconstructs all
12 complete recipes with exact input, original, owned and independent plane
hashes. The separate quick 48 kHz pilot passes too. These Offline Native-owner
closures are not running Rust SourceACKs. See the ignored
instrument-tone-independent-audit.json and its exact source/receipt hashes.
Reports and temporary audit scripts remain in the ignored reports folder.

The numerical checkpoint alone is replay. It does not establish a running Rust
AudioWorklet actor, automatic Native Biquad tail behavior, AudioParam signal
connections, synchronous intrinsic getters, normal Instrument adoption or
physical-device deadline guarantees. The next implementation task is the
bounded live facade and its actual preparation, graph-transition, independent
instance and terminal-ownership checks before explicit factory integration.

## Owned AudioWorklet numerical checkpoint

The separate host d1d152b4493cb684 keeps kernel 1afe2ec923809c85 and its exact
Wasm bytes. It provides one owned Filter, EQ2 or combined actor, immutable
mono/stereo layout, 32 acknowledged raw-F64 rows and an eight-owner quota.
Source7a supplies the actual render clock; raw global worklet time is not its
authority. Empty preparation requires a fresh consumer callback, and the
one-way terminal gate precedes owned Native edge removal. A failed terminal
write retains remaining edges until actual SourceACK or context close. Typed
requests, exact owner identities and request/reply kinds are validated.

Actual browser verification passes 72 cases across the same six rates. Two
independent Rust AudioWorklets give 144 Native comparisons /216 compared
channels. All 216 strict captures begin at frame zero and include every block.
Every input stream is word-exact, independent output streams are word-exact,
and the maximum original-reference errors remain 8.463859558105469e-6 absolute
and 2.2315727016576927e-5 relative RMS. All 144 natural-end sources release
healthy with their actual clock leases; no lateness, rejected rows or timeline
clamps are reported. These are explicitly Offline terminal closures, not
running-context teardown proofs.

The twelve-case complete owned scene is saved, the HTML document is actually
reloaded, and fresh Native/owned/independent actors reconstruct every complete
recipe and all four sets of plane hashes exactly at 192 kHz. The ignored
instrument-tone-live-d1d1-independent-audit.json records exact receipts and
source archives. The earlier 1b25 pilot and low-rate receipt remain separate;
its successor tightens request/reply validation without changing the processor
source or numerical kernel.

The running graph transition is deliberately unaccepted at this checkpoint.
A separate original BitCrusher test demonstrated that an already pulled input
block can coexist with a newly visible inactive request. This host currently
retains the strict refusal for that state. The next task is the shared atomic
route-tag / observed-physical-input transition contract, including actual
active draining, empty-input acknowledgement and adversarial live checks.
No normal Instrument selection, synchronous AudioParam getter, automatic Native
Tail behavior, external LFO AudioParam bridge or default change is implied.

## Physical route and logical facade checkpoint — 12 November

Current host **0aa47d87e64f5e69** retains the exact **1afe2ec923809c85**
Wasm bytes. It replaces the old separate demand/reconnect controls with the
committed atomic physical-route tag protocol. A requested disconnect cannot
stand in for an observed disconnected input. Real connected draining blocks
process every sample; opening and physically absent-input callbacks perform no
Biquad DSP. Only a newly realized OFF followed by a new ON can authorize an
active source-clock reanchor. An OFF arm requires a fresh matching physical OFF
receipt. The private silent service route persists until outstanding control and
route receipts complete, including during an Offline suspension. Terminal gate
publication still precedes edge removal; a failed terminal write retains the
edges until actual SourceACK or context close and keeps failed audio health.

The explicit facade creates the actual private actor and exposes logical
Filter/EQ2 controls. Combined mode offers one whole-chain input/output, without
pretending to expose an intermediate EQ/Filter port. Stored configured targets
update only after command admission; observed curves are asynchronous, typed,
identity-checked receipts at the reported Rust frontier. Synchronous Native
intrinsic getters throw a typed unsupported error. These controls confer no
source ownership authority and do not select the normal Instrument backend.

The complete route predecessor 7955dda1fbdfd614 passes 72 actual Native cases
across all six rates, 144 comparisons and the true twelve-recipe 192 kHz HTML
reload. Maximum absolute error remains 8.463859558105469e-6 and relative RMS
2.2315727016576927e-5 under unchanged 1e-4 limits; independent Rust and input
streams remain word-exact. The final emitted processor differs only by its host
version literal, with a reconstructed source-hash proof. The final host also
passes all twelve 48 kHz Native cases.

Final actual live verification covers twenty reused-context rounds / forty
independent actors across Filter, EQ2 and combined mono/stereo modes. Each
prepared actor has zero Biquad frames; dormant controls leave Biquad history
frozen, distinct Filter and EQ targets stay independent, returned output is
nonzero and finite, and all forty real clean SourceACKs release their clocks
before context close. Eight adversarial upstream holds produce eight nonzero
physical DRAIN witnesses, each advancing exactly 128 Biquad frames with unchanged
input words, followed by genuine matching OFF acknowledgements. The original
strict refusal negative is retained in the BitCrusher history; no synthetic
parameter curve, PCM shift or silent fallback resolves it. Seventy-one focused
checks pass. Evidence and exact source bridges are ignored under reports; see
instrument-tone-0aa4-independent-final-audit.json.

This accepts the bounded explicit live owner and facade, not automatic Native
tail traversal, external AudioParam connections, arbitrary unbounded timeline
loads, device deadlines, or normal factory adoption. Next: issue a genuine
private producer-output borrow with retained lifetime, then compose selected
Instrument/rack factories using whole-patch preflight before any parent mutation.
