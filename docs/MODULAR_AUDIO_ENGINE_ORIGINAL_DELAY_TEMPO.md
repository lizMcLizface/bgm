# Original delay tempo integration

The opt-in original Delay/PingPong timing facade now feeds the real
scheduleEffectTiming parent scheduler. It preserves each delay lane's
cancelScheduledValues(start) then setTargetAtTime(value,start,.025) order,
including the distinct future schedule time and each publisher's actual
author time. Context-bound factory registration is private; a public profile
string or Native-shaped object supplies no owned-control authority. Whole
selected-row validation precedes parent flag changes and control publication.
The free patch values are unchanged. The default Native scheduler body
restores byte for byte when the new import, branch and helper are erased
(normalized SHA256 2c0617218378929177927e2c07f4aee93b481d4e852255916d2e7551f28e6a45).

The new kernel is 67c22492b0fb4257 (87,770 bytes); its live host is
efccb2d53b8c13a2. The old 171ea28c2195d17b numerical kernel and
88049859d690236b live host remain unchanged. Both profiles share the actual
old actor's combined eight-owner/context quota, command transport, physical
route reconciliation, Source7a clock and terminal acknowledgment behavior.
No fake AudioParam or synchronous intrinsic getter is introduced.

The first integration run and its unchanged repeat exposed a real stereo
counterexample: after a running SetTarget ramp, cancelling a later target
and inserting an earlier future target diverged at author frame2304. Both
literal Native references agreed; both independent old Rust instances agreed.
At8kHz the first mono scene was exact and the stereo scene had25,355 different
words, maximum absolute error0.10183553583920002. These failures remain in
ignored reports; the old host is not accepted for this new stereo ramp use.

The pinned Native DelayHandler calls CalculateSampleAccurateValues separately
for every delay channel. A second evaluation can update a running target from
the first channel's updated intrinsic timeline state. The accepted numerical
port generated one shared delay-time curve. A new, mechanically reversible
Rust fork now evaluates only each delay timeline once per actual input channel.
Gain/filter timelines, interpolation, ring write order, feedback topology and
all shared timeline files remain unchanged. The tracked FORK_EDITS.json and
builder reverse the entire new lib.rs back to the exact accepted source.
There is no sample fitting, clock rebase, inserted delay or tolerance change.

Actual desktop evidence through tools/original-delay-tempo.html:

- All24 cases across8,24,44.1,48,96 and192kHz pass both families and mono/stereo.
  They exercise future linked targets, cancelling a later target while a ramp
  runs, free timing, bypass reset, reactivation and cancel/zero/future hold.
  Each case captures32768 frames from actual Source frame0 without gaps.
- A true document save/reload/replay repeats all24 cases. All192 comparisons
  against the two literal Native originals are WORD0; independent Rust streams
  and Native repeats are also WORD0. Every recipe, actual command time,
  component identity and five-stream PCM hash matches after reload.
- All96 real Rust owners and96 Native reference owners clean up. Rust Source
  release, clock release and healthy receipts are verified; late/rejected
  events and capture gaps are zero. This is Offline closure, not a fresh
  realtime arm, automatic Native-tail equivalence or physical listening claim.
- The new kernel passes24 allocation workloads /12288 render quanta with
  repeated future controls: zero Rust allocation, reallocation, free or
  linear-memory growth. Fourteen focused tests additionally cover default
  scheduling, private registration, pre-mutation refusal, bypass reset,
  mechanical fork restoration and six-rate step-control compatibility.

Exact ignored receipts are original-delay-tempo-independent-audit.json,
original-delay-tempo-efcc-six-rate-result.json,
original-delay-tempo-efcc-reload-result.json,
original-delay-timing-allocation-result.json,
original-delay-tempo-legacy-erasure.json and both retained tempo negatives,
under reports/modular_audio/. Scratch scripts stay in reports/scripts/.

The facade/scheduler seam is implemented, but normal Instrument construction
does not yet forward it. Next: join these actual delay factories with original
Instrument hold/tempo/tail handling and explicit bank/replacement admission.
Five roles with both delay families require more owners than the current
combined quota; do not silently raise it or substitute configured targets for
unavailable Native intrinsic observations. Automatic Native tail service,
whole preset transactions and all-Rust normal application adoption remain open.
