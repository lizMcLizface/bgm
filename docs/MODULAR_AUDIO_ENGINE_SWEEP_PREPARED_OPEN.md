# Prepared OPEN Sweep: source and Native policy proof

This is a review of a proposed preparation policy, using the accepted Sweep
factory unchanged (5d0df54e500f5e1a, kernel 9f946a992e346794). It does not
select a new application backend or modify the master routing authority.

The original native SweepFilter is constructed at first use and schedules OPEN
before the first authored filter setting. The candidate prepares the existing
Rust actor earlier, with program input physically absent. Its constructor
schedules exactly one OPEN call. Actual receiver statistics prove commands 1,
renderedFrames 0 and unrendered Native defaults [350,350,1,1]; OPEN acknowledgement
does not mean the parameters were rendered at OPEN.

The numerical reference uses the literal source-hashed original class. It
compares Native EARLY/unpulled construction against Native LATE construction,
and compares two independent early-prepared Rust actors against that actual
late Native output. The actual shared Native program is directly captured from
frame 0, so its cursor is checked rather than inferred or restarted at birth.
All first-set insertion epochs are captured in a frozen OfflineAudioContext.
The original source-edge/output-edge/first-set order is retained.

The first v1 quick 48 kHz and 12 low-rate cases passed as a math subset. Their owned
outputs remained zero-connected before birth, so those receipts are explicitly
not the offroute-after-arm lifecycle proof. Source files and receipts remain
archived separately under ignored reports.

The v2 preparation pause at frame 128 collects the actual constructor/default
zero-DSP witness, then disconnects both owned outputs. At the later first-use
epoch it records the held Core frame and reconnects the program/output/demand
before the first set. It never inserts another OPEN event or estimates elapsed
DSP. Source7a supplies the actual first-pulled frame and its observed reanchor.

Actual v2 acceptance covers 36 cases: 8/24/44.1/48/96/192 kHz, mono/stereo, at
frames896,130176 and a canonical point at/after 3 seconds. All 72 owned actors
remained at Core frame 128/calls 1 through the offroute interval, with no rendered
filter frames. Every actual first pull equalled its authored Native birth,
with one reanchor of exactly birthFrame-128. Native EARLY versus Native LATE
and independent owned instances had zero differing Float32 words in every case.
Owned versus Native maximum absolute error was 9.12696123123169e-8 and maximum
relativeRMS was 1.736591525432478e-7, under unchanged bounds 1e-4. Every owner
released cleanly. The separate quick 48 kHz v2 receipt passed as well. Full
independent audit is prepared-open-v2-independent-audit.json under ignored reports.

Capacity verification is separate: six permanent tests run 32-call bursts with
repeated same-epoch authoring after a preceding callback ACK, one-quantum author
lag, explicit offroute reanchors and pulled/unpulled cycles. Across 98,304
complete calls, every actual four-lane capacity(32,author) query succeeded,
rejected 0 and Wasm memory remained unchanged. This supports the Generator-only
current-time contract. It does not certify arbitrary future timestamps, author 0
forever, an inferred JavaScript credit count, or Native transport deadlines.

No synchronous isOpen getter is emulated. This proof does not establish
unmatched unsuspended Native four-handler clamp timing, a production routing
integration, or a first-use delivery deadline. A future adapter still requires
a privately owned prepared actor, explicit first-set admission, a trusted master
route authority and actual terminal receipts.
