# Cold offline convolution host

This separate host runs the accepted Rust static convolution kernel directly
inside OfflineAudioContext. The factory refuses realtime contexts, contexts
that have started, and a context that starts during asset preparation before
node/quota mutation. There is no physical callback-deadline claim or normal
room/default-backend selection.

## Contract and ownership

The captured same-rate IR retains the existing mono/stereo routing and original
zero adapter latency. Finite and long profiles retain their327,680/2,097,152frame
limits. The caller must connect a continuous, known-layout program through the
entire fixed offline budget, including zero padding. Missing or changed physical
layout is a typed failure; input/output tail flags are not inferred from PCM.
No hot IR edit, output-gap/rejoin or arbitrary late-birth contract is selected.

Each context admits two independent owners. Each owns its Wasm instance and
immutable IR. Sixteen requests and five-second acknowledgement deadlines are
explicit. An independent typed dispose receipt survives earlier DSP/protocol
failure. Wrong-operation/foreign-identity replies cannot release quota. Missing
release receipts quarantine capacity until terminal context closure. Unexpected
native disconnect/port cleanup errors aggregate after resource release; no
cleanup error is silently counted as success. Cold snapshots contain the full
IR and specification, not in-flight FFT history.

The processor validates input/layout/budget before processing and checks all
output samples before publication. A finite-but-overflowing input/IR combination
stops without publishing infinity/NaN. Failure clears the current output and
releases the Rust owner; there is no hidden native or dry fallback.

Module fetch/registration still uses the shared asset-loading API. Abortable
preparation transactions and full room/shared-return adoption are separate
integration work. This host does not change the existing worker-only realtime
convolution policy or introduce the private worker room's500ms delay.

## Verification

Current host b3535a835c9ff41e uses unchanged kernel c5dbde0540bfdf83 / Wasm SHA
40a89270ae4e7d0d6a0eeb7ee67b052a46b4cfaa2910f82d68d50586b01f9bba.
Thirty-five focused tests pass: the actual generated processor at six rates and
four layouts; independent Wasm state; physical-layout/input/budget/overflow
refusals; context admission races; acknowledged quota reuse; missing/wrong ACKs;
closed-context settlement and aggregate cleanup failures.

The earlier7cf prototype passed30 actual Native cases at8/24/44.1/48/96/192k,
including a410,003frame stereo IR. All captured source samples and independent
owned pairs were exact. Maximum Native absolute error1.4901161193847656e-8,
relative RMS8.788839253855728e-8; onsets matched without shifting. A real page
reload restored all eight PCM hashes from captured IR/input. A separate actual
cold-before-render test proved constructor readiness, two-owner admission,
dispose ACK before quota reuse, and clean release of all three actual owners.
Those earlier receipts remain tagged7cf; final host acceptance is appended below.

Build/check: node tools/buildOfflineConvolverHost.mjs [--check]. Review page:
tools/offline-convolver.html. Evidence and temporary scripts are ignored under
reports/modular_audio and reports/scripts. Next: compose original RoomColour,
normalization/Light downmix and dry/wet policy, then wire a stopped offline owner;
shared live rooms and their latency remain separate contracts.


## Final desktop acceptance

Final b353 passes all30 Native cases across8/24/44.1/48/96/192k with the same
fixed1e-4 bounds: maximum absolute1.4901161193847656e-8 and relative RMS
8.788839253855728e-8. Every source capture, independent owned pair and onset
matches exactly. The minimum observed owned output peak is0.057117633521556854;
combined with the measured Native error this proves nonzero Native/owned audio.
No output alignment, coefficient bridge or gain fitting is used.

A fresh HTML reload restores all eight PCM hashes from the saved48k IR/input.
The final actual pre-render ownership gate also passes: two owners at frame0,
third-owner refusal, typed dispose ACK before replacement admission, then all
three owners released with no errors. Final receipts are
`offline-convolver-b353-{rate}-final.json`,
`offline-convolver-b353-cold-replay-final.json`,
`offline-convolver-b353-cold-ownership-final.json` and
`offline-convolver-b353-summary.json` under ignored reports/modular_audio.
This accepts cold fixed offline composition, not live/shared-room adoption.
