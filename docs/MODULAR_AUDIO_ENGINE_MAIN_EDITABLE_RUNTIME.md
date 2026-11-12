# Explicit stopped Main source slots and return ownership

This opt-in extension preserves the existing Generator, Transport, role containers, settings and Native Main tone/gain/duck/master controls. It does not select an environment or change the default app path. The V6 desktop batch passes the complete scoped source-swap, cold successor, dynamic returns and explicit terminal cleanup contract described below.

## Source authority

`prepareStoppedRuntime({editableSources:true,...})` captures one mutable six-role source authority before publication. Later replacements use child preparation scopes owned by that authority; they never append owners to an immutable published scope. Replacements preserve each role's existing destination and Wander and journal exact edges and targeted pointer fields for rollback. An uncertain old-source ACK after publication leaves the new source published and quarantines the authority instead of claiming rollback.

The initial editable source family is the separate Native-clock Core/FM live host (`native-clock-owned-core-fm-live-v1`, a20f engine, Source7a). Legacy callback-count clocks, CLASSIC/Iowa/percussion replacement, optional FM banks and unknown sources do not acquire this capability by name. There is no fallback.

A bounded scheduling ledger observes actual delegated source packets and public scheduling calls. It preserves `this`, arguments and returns. Queued/future/held/pedal records clear only after real same-source FIFO receipt and authoritative Native rendered-frame evidence, or the pinned Core/FM panic operation's actual queue-cancellation receipt. Passing main-thread time is insufficient. Old empty `futureBookings()` stubs are not proof. Pending records also synchronously refuse whole-runtime successor preparation before reservation or construction. `confirmStopped()` queries actual source authority; it does not render, move epochs or invent release frames.

Fresh unpublished, note-free sources connect to a separate zero-output control consumer. A first flush establishes actual pull readiness; a second FIFO request obtains a snapshot after that proof. The preparation links remain until stable Main publication. Nonzero program input, unknown frame/generation, late/dropped events and missing terminal capabilities fail closed. Source effect edits that could create lazy DSP stages remain unsupported; the profile does not infer their ownership from a VoiceFx object.

## Returns and sweep

`editableReturns:true` captures empty bus, section-space and sweep slots before publication. Empty slots allocate no DSP. Bus/space constructors use private candidate returns and explicit six-role send-edge ownership. Call `prepareRuntimeReturn()` while stopped before enabling their settings. The admitted stage signature is fixed to eagerly constructed inserts/compressor/space/reverb/delay groups; extras, chain changes and unowned lazy actor births refuse before settings change.

The stable sweep is a separate Generator-owned root with bounded explicit candidate/successor borrows. It constructs no filter until the original synchronous first-use call. Construction and controls retain the original SweepFilter order and prototype. Native allocations and rewiring have a partial-failure journal. Borrow retirement never destroys the incumbent stable master path. Only explicit `disposePreparedRouting()` after all borrows/playback finish, or actual context close, releases the root.

For this explicit editable profile only, a stopped cold successor can leave disabled captured bus/space policy in empty slots even if the predecessor had allocated racks. Its real old racks still retire. This is a cold configuration transition, not wet-tail preservation. Fixed/default ownership is unchanged.

The Native/legacy rack and sweep DSP are declared remaining port boundaries. Ownership closure here does not mean all Main DSP executes in Rust or that arbitrary live source replacement is supported.

## Limits and verification

Source replacement is stopped-only: playing, pending start, fades, held/live notes, future/delivery work, external inputs, preparations and retirements refuse before mutation. Source actor capacity is13, history32; scheduling events2048 and host epochs256 by default. Sweep borrows are capped at16. Terminal uncertainty is bounded, retained and reported; late ACKs do not turn a failed disposal promise into success.

The focused verification passes342 checks across21 files including the172-case Generator regression. A separate committed rack-constructor lifecycle prerequisite (`cc79c3d5`) passes39 rack checks plus6 adjacent checks. Its successful controls, ensure, wiring, rewire and API bodies are pinned unchanged. A factory throwing before it returns remains responsible for its own internal partial actors.

The retained v3/v4 actual negatives reached the six-rate sweep, future refusal, stopped swap and private returns, then failed previous-runtime retirement. Structured v4 records separate five enclosing Core/FM owner release failures with retained Native clock-ledger continuity errors from a retired old source's independent unexpected Echo-disposed health report. Both negative reports remain evidence; they are not relabeled as accepted.

The candidate successor adds a distinct retiring-source authority, acquired before incumbent output disconnection. Its zero-output consumer connects directly to the actual Core/FM processor, verifies physical source-input quanta, then captures a fresh same-generation Native/FIFO snapshot. This is not a fresh/unplayed claim: tails may appear at its input. Leases remain until the exact source's terminal receipt or context close; rollback/cancellation release requires verified original program-route restoration. Current/retiring actor bounds remain explicit, predecessor bindings are removed after release, and error/late-ACK uncertainty is preserved. Terminal teardown explicitly awaits `binding.prepareTerminalDetach()` before `binding.detachPublished()` and scope retirement. Editable source detachment refuses before mutation unless actual retiring leases are prepared or the sources/context are already positively released. A withheld dynamic-return ACK regression proves those source leases remain held through the retirement wait. Direct unprepared terminal detachment is not admitted for this profile.

Existing a20f source/Source7a math, epochs and strict clock continuity are unchanged. Genuine enclosing owner errors are never waived because the raw Core receipt is clean. The Root-owned Echo lifecycle successor is separate.


The fixed muted review page is `reports/scripts/main-editable.html`. It checks six-rate original Native sweep first-use PCM, actual future-booking refusal, stopped FM-preset replacement, routed Main/bus/space output, full successor and the same stable sweep root, plus terminal scope/registry cleanup. No physical listening, low-latency/deadline, source Native sample-onset parity, complete Ambience cold session, UI/default-selection or full-Rust claim follows from this ownership gate.

## Retained V5 limited desktop result

`reports/modular_audio/main-editable-v5-final.json` passes with Core/FM a20fefe1bf89996a, Source7a 7a0838a735108706 and Echo c59effae4592c9da. Original Native first-use sweep comparison is exactly0 maxAbs/relativeRMS on both channels at8/24/44.1/48/96/192kHz. Live48k stopped FM-preset swap peak is0.0508189723; private Main/bus/space peaks are0.0552004836/0.00437810645/0.00591857638, and successor source peak0.0715913624. Sixteen previous-runtime retirement records close cleanly; final source ledger has0actors, sweep is released with0borrows/noquarantine, and running-context registry tickets/shared resources are empty with idleBlockedfalse before context close.

That report exports one unique retiring direct-pull receipt twice; it does not prove six distinct exported receipt records. Its final successor's returns were eagerly constructed. V6 adds the post-retirement old-controller snapshot plus genuinely dynamic final returns and explicit terminal preparation; V5 is retained without relabeling those stronger claims.

## V6 desktop acceptance

`reports/modular_audio/main-editable-v6-final.json` (SHA256 e6b12f5204b24a1f4d6653a9e7191f17f5c8afdaa5779f5ebbd72986dcbc3a0d) passes with no errors. Independent assertion audit: `reports/modular_audio/main-editable-v6-independent-audit.json`. Every frozen source matches digest85efe7d7555c4bf554a1b5473bbd18317a8d91bf78c84d5277504e08cc14539a; Core/FM a20f, Source7a and Echo C59 identities match the reported versions above.

The six-rate Native sweep comparison again has exact0 error on both channels. The actual direct source swap is Glass Bells FM to Round Bass FM (the older review label says Core-to-FM); subtractive Rosin Silk separately participates in the original/source/successor and retirement matrix. This receipt does not claim a tested cross-algorithm direct swap. FM replacement peak is0.0507110208; initial Main/bus/space peaks are0.0551640987/0.00432362687/0.00594595727. Future booking and unowned topology refuse with SOURCE_SCHEDULING_UNPROVEN and MAIN_RUNTIME_RETURN_REFUSED before their respective mutation.

The old-controller snapshot taken after successful predecessor retirement contains six distinct role/id direct-pull receipts: first lead replacement plus five pitched whole-runtime sources. Each records actual physical input quanta, same-generation Native/FIFO frame proof, direct backend identity and clean source/consumer terminal receipts. Seven old-controller source release records (including percussion) close every logged phase with no owner/observer errors. All16 predecessor retirement records settle cleanly and its published scope closes.

After disabled-policy cold publication, the successor's bus/space/sweep placeholder slots are genuinely empty. It then dynamically constructs both bus and section-space and produces Main/bus/space peaks0.0724155530/0.00449404120/0.00539105572. The same original stable sweep remains through publication. Explicit prepareTerminalDetach retains five new direct-source leases through actual dynamic-return/source cleanup. Those five source and consumer receipts are clean; all six final source actors close. Before context close, the registry is still RUNNING with tickets/shared empty and idleBlockedfalse; sweep is inactive/released, borrows0, no quarantine, and closedByContextfalse. Thus teardown does not borrow a later context-close proof.

These assertions cover one live48k Main scenario plus the six-rate isolated Native sweep. They do not establish unrestricted live source edits, arbitrary topology, complete Ambience, old automation/history migration, other live source families, phone/deadline behavior or replacement of the remaining Native Main controls/master.
