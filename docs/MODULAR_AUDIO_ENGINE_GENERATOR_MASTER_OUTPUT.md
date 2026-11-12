# Generator master-output owner

This selected integration retains the original `Generator.output` gain as its
unassigned unity junction. A constructor hook records its actual default
intrinsic 1, no `.value` assignment, and no initial automation event. It never
reads an AudioParam to reconstruct that history. Every legacy output automation
path must invalidate the record; a sweep or replaced identity is refused.

The new session requires the registered cold six-role and trim/ambience roots
before first resume, and retains an actual branded Main clock lease. It creates
the committed `mainOutputColdRoot` internally. Activation runs role, scalar,
then output in order. It verifies the actual role clock object and privately
branded scalar certificate, then borrows both active parents. It captures the
trusted leaf's actual program endpoints and replaces only
`g.output -> scalar trim input` with
`g.output -> Rust output input -> Rust output output -> scalar trim input`.
The original `g.output` identity remains stable. The post-fade helper exposes
only the selected healthy actual output, including for later sweep planning.

Stop, stop completion, quick resume, and tail resume use the committed RawF64
plans. Whole reservations precede parent callbacks. Active fade cancellation is
refused before parent mutation: an actual intrinsic-read authority is still
required. The adapter supplies no gain getter, shadow gain DSP, or Native
fallback. Active Native sweep selection remains refused until an explicit Rust
sweep route is prepared.

Source/runtime scopes must release output borrows after their own actual ACK.
Destroy roots in output, scalar, role order. Program detach does not remove the
leaf's private zero pull. Parent borrows and the session clock remain held until
actual wholly clean leaf retirement; context close is the explicit alternative
terminal authority. A failed retirement promise remains failed after that close.
Failed or disposed selected roots remain selected and reject endpoint access.
A no-owner rejected leaf is not certified from a status snapshot; its session
clock remains quarantined if no actual completed cleanup promise is available.

The complete nine-controller profile is admitted from 8 through 96 kHz only.
The standalone three-scalar 192 kHz proof does not admit nine controllers at that
rate. This addition changes no accepted Wasm, processor, or gain arithmetic and
adds no default selection. Its application gate remains separate from the
previous scalar numerical proofs.

Initial focused verification: 35 tests cover constructor history, exact program
edges, private clock identity, ordered activation, cached-state refusal, held
ACKs, independent borrows, cancellation joins, wrong context/material phase,
primitive errors, unknown prefixes, and preallocation rate refusal. The existing
50 combined-settings tests remain a separate committed contract.

Actual application evidence (48 kHz)
----------------------------------

The first nine-owner Generator run retained positive source/music/successor
results (master peak .4365136325) but FAILED cleanup. The shared retirement
helper started all closures immediately, so scalar/role destruction correctly
refused the output owner's still-held parent borrows. This negative remains
`main-master-output-generator-first-negative.json`; it is not a clean gate.
The application successor waits for sweep, output, scalar, then role closure,
while still attempting every dependency and preserving all failures.

The ordered retry `main-master-output-generator-ordered-pass.json` passed.
Independent audit verifies all nine owners configured with core/clock calls0,
actual first Native frame0, and actual clean Source terminal receipts. All six
music roles were nonzero; master peak .4804225564002991. Output source-scope
borrows stayed 1 -> 1 -> 0 through replacement; scalar parent borrows stayed
2 -> 2 -> 0. All three roots finished disposed/error-null and the shared
registry, tickets, and controller refs were empty while the context was running.

The actual output executed stop and stop completion: two groups of two commands,
writer sequence/observed sequence/last ACK sequence all4, pending0, credit debt
[0,0,0]. The generic output stats taken before stopping still show sequence0;
those earlier stats are not the command receipt. Quick resume and tail resume
remain unit-plan coverage, not additional browser claims in this fixture.
Numerical Native parity, hardware deadlines, zero late control publication, and
audible ambience are not asserted by this application gate.

The new cold entry `prepareGeneratorRustMaster` validates the 96 kHz complete
cohort limit and all three actual constructor histories before any six-role or
clock allocation, then prepares 6 -> 2 -> 1. It keeps constructor failures
terminal, waits for an actual failed-prefix cleanup promise when available,
and sequentially attempts every known owner. Older Main group metadata alone
cannot prove a rejected acquisition released; unknown prefixes and retained
preparation flags remain explicit. Its frozen return delegates activation to the
actual output root and returns the actual Generator routing-disposal result.

Failure-only successors before the complete-entry gate
----------------------------------------------------

The ordered application receipt used output source `9a5ac5bb...abd93f`.
The following source successor adds only a direct refusal to destroy output
ownership while an actual `stopFade`, `fadeTimer`, or `endTimer` remains.
It changes no healthy controller/command body and never clears authored timers.
Three fake-timer regressions prove no edge, actor, clock, borrow, or state change
occurs on that refusal. The shared Generator teardown performs the same early
check before attempting the first root.

`applyOperation` prevalidates synchronous callbacks before reserving. A failed
prepublication commit cancels its confirmed held token and is retryable; an
already retired token is not cancelled. Any uncertain token cleanup remains
terminal with its primary failure. All other output-owner source bytes match
the first application-gate source. Current focused coverage is 26 output-root,
7 constructor-history, 11 output-session, and 28 complete-bootstrap checks.
The shared dispatch and sequential-retirement tests are separate.

Complete-bootstrap admission failures before any context claim are retryable
and do not poison an untouched or already-owned Generator. After acquisition
starts, partial failure is permanent. A later positive cleanup promise cannot
erase an earlier cleanup error. Pending authored timer refusal also precedes
creation of the bundle's cached destruction promise, allowing callers to finish
the actual stop and retry without inventing cleanup success.

Complete cold entry and all four master plans: actual acceptance
--------------------------------------------------------------

The final `main-master-complete-entry-plans-pass.json` application gate uses the
new complete cold entry, its real activation and routing disposal. At 48 kHz all
nine controllers configured at zero and observed actual first Native frame0;
all actual Source ACKs and clock releases were clean. All six music roles were
nonzero, with master peak .4796757996082306. Source-slot replacement and a full
runtime successor retained output borrows1 -> 1 -> 0 and scalar borrows2 -> 2 -> 0.
All roots ended disposed/error-null, with the shared registry and tickets empty
while the context was still running.

This fixture actually exercised all four plans: stop, finishStop, quickResume,
and tailResume. Its six command groups contain [2,2,2,1,2,1] records. Writer,
observed and last ACK sequence are all10, pending0 and credit debt[0,0,0]. An
actual fadeOut followed by cancelFadeOut produced the expected typed intrinsic
read refusal; the fixture asserted both authored timer identities unchanged
before continuing via the supported tail-stop path. No AudioParam getter or
fabricated current value was introduced.

Independent audit receipt: `main-master-complete-entry-independent-audit.json`.
This acceptance concerns the real application path and lifetime integration.
Native PCM parity remains the earlier scalar-leaf proof; the application fixture
does not assert audible ambience, zero late control publications, hardware
deadlines, or any 192 kHz nine-controller admission.
