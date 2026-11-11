# Classic source boundary

Audited 2026-11-11 against `classicsInstrument.js`, `liveSynth.js`, the actual
`classics-processor.js` bridge, and the owned native composite.

## Single-kernel captured preview

The native output already contains its model, Juno BBD where applicable, shared
space, DC blocking and output saturation. The preserved live route is:

```
native AudioWorklet -> unity native gate -> external rack -> output monitor
                                                        -> instrument output gain
                                                        -> All role FX/mixer/master
owned native source -> private source input -> external rack (same instance)
```

`startLiveSynth.captureSource()` snapshots the actual requested native parameter
pairs, model, bounded host polyphony, complete copied Float32 wave resource and
untimed controller state. It captures the parameters after the host's light/voice
cap and moved-space mapping. It does not recreate a factory patch. Captures are
fresh static states, not snapshots of active oscillators, envelopes or rack tails.

Native gate gain is one by default. A reference-counted `holdSourceInput()` lease
sets it to zero, suppressing the native kernel's background hiss while the owned
source feeds the same rack. Releasing the final lease restores one. Releases and
close are idempotent. No native panic, backend selection or default rack wiring
changes are required to lease the source.

`classicStemTap()` provides `kind`, `input`, detached `patch`, `assertCurrent()`
and `activate()`. Host lifetime guards, actual parameter/wave/rack/controller
revision, preset identity, live identity, loading/error/disposal and keyboard
activity invalidate the prepared route. Its instrument lease keeps the existing
effect route awake even before the first output meter callback. The initial tap
requires one native kernel and a pitched role. Classic drum indices are a separate
host semantic mapping, not MIDI notes, and are explicitly rejected here.

`compileClassicNotes()` returns `{config, events, tail}`. Config version1 is
`{version, model, parameters, polyphony, waves?}`. VS requires all16384 wave samples;
WT capture carries all8192 samples rather than named-wave substitutions. Saved
config resources round-trip as ordinary arrays and can be restored independently.
Native events retain fractional MIDI and round their requested timestamps to
individual samples. On/off, controller and per-key pressure receive order is
stable at equal frames. Events use `kind:'classic'`, `event`, `id`, `a`, `b`,
`frame`, `target:1`, `owner:1`; the workbench remaps owner/target for its graph.
Notes allow optional detune cents and expression bend/gate/pressure, matching the
actual wrapper. Config/controller validation fails closed on nonfinite values,
unsupported parameter identities, sustained held state and queue overflow.

Tail is a finite allowance, not a proof of physical silence. It includes native
amplitude release, native/external space allowance and margin, capped at120s.
VS rate4/4A use the real rate-to-seconds relation. DX7 rate4 uses a conservative
maximum log-envelope distance and the actual rate increment relation. Native
background noise and unusually slow/nonzero-floor envelopes can persist beyond
that bound. Timed future global controller state and live sequencer commands are
not flattened into a guessed static capture; such a live host must be recreated
before this static preview path is eligible.

Focused validation:36 tests pass across compiler/config, source taps, native live
wrapper and instrument lifecycle. This includes all actual classic factory
parameter contracts,14-model persistence, complete detached waves, exact37-frame
onset, fractional tuning, pressure/gate, nested gate restoration, close and source
invalidation. These are contract/lifecycle checks; original/owned DSP equality is
recorded in the separate owned-classic and source-cache audits. Browser output
checks are coordinated by the parent integration stream.

## Minimoog composite audit and next integration

The live Minimoog chord host is a composite, not one polyphonic kernel. At host
polyphony greater than2 it creates `min(polyphony, light ? 2 : 4)` independent
monophonic kernels. Every kernel owns an independent external rack and output
monitor, whose outputs sum into the same instrument output gain.

For each `scheduleNote` call in receive order, `voiceFor(start,end)` chooses the
first slot with `freeAt <= start`, otherwise the earliest `freeAt`, breaking ties
by slot order, then stores the requested note-off time. It uses the note's gate
end, not release-tail completion. Equal-onset notes therefore consume slots in
order. A later note may replace an earlier still-held one. Host note IDs remain
globally increasing across slots. Pressure follows the chosen slot. Keyboard-held
notes reserve a slot until stop, using `Infinity`; this active state should stay
outside finite captured previews. Finite fresh score capture starts each slot at0.

The actual external racks contain independent modulation phases, nonlinear
saturation/compression, stereo effects, optional random effects and persistent
tails. Summing the native slots first and sending that sum through one of the
existing racks does not preserve this host. It also drops the other slots' own
tails. An explicit mix of raw native modules alone is insufficient.

The direct preservation path is a composite lease exposing one private input per
existing live slot. Compile native modules/events per slot using the exact
allocator above. Publish each slot as an individual output stem and feed that
slot's existing rack. Gate all native live slots for the lease and restore them
together. The host's unchanged instrument output performs the post-rack sum.
An explicit graph mix can serve isolated/offline reference output, while the
live route still requires the separate stems. The implemented workbench binding
expansion preserves this distinction. The worker route has eight output slots:
six physical source buses, a percussion kick bus and isolated mixed graph output.
Its usable pitched IDs remain1..5; percussion retains6. Combined role+kernel
capacity is checked explicitly and rejected before rendering if exceeded.

A fully portable composite alternative must capture and run one external rack per
native slot in the graph, then sum after those racks and inject after the legacy
per-slot racks. This requires the complete external rack contract and exact stage
order, automation, independent random/phase/state and smoothing semantics; it
cannot be achieved by attaching a partial effect selection to one native kernel.
The immediate multi-stem path preserves those existing external processors and
allows full-path conflict testing without waiting for the rest of the rack port.

### Prepared composite API

The capture/compiler portion of that multi-stem path is implemented separately
from the initial single-kernel API. `compositeClassicStemTap(instrument, guard)`
returns `kind:'classic-composite'`, ordered `inputs`, `assertCurrent`, `activate`
and detached patch `{version:1, allocation:'first-free-then-earliest-gate-v1',
slots:[...]}`. Each slot stores its actual native configuration, controls and tail
allowance. `ClassicsInstrument.captureSources()` and `holdSourceInputs()` capture
and gate the stack. A failed later-slot gate releases every earlier acquired gate.
One changed/closed/replaced slot, rack edit or keyboard hold invalidates the group.

`compileClassicCompositeNotes(source, notes, rate, {sourceIds, otherSourceCount})`
returns per-slot `sources` containing config/events/tail, ordered
`bindings:[{slot,sourceId}]`, flattened events, diagnostic allocation, maximum tail
and an explicitly mixed `referenceGraph`. Source IDs must be distinct1..8;
`otherSourceCount + slotCount` cannot exceed8. The caller still owns allocation of
free IDs across roles and must connect each binding to the corresponding input.
The ordinary one-kernel `compileClassicNotes` API remains available unchanged.
The compiler runs the allocator in note receive order on requested seconds, before
rounding native events. IDs remain globally increasing across slots. Controls are
prepared independently for each slot. The reference graph's summed native output
is an isolated DSP check, not a replacement for per-slot live rack injection.

Tests compare the compiled per-slot event bookings directly against the actual
`ClassicsInstrument.scheduleNote`/`voiceFor` implementation under four-way
overlap, forced slot replacement, pressure and fractional pitch; light two-slot
behavior, detached save/reload replay, combined output capacity, nested leases
and partial-lease cleanup are also covered.

### Workbench integration

The actual All host now selects the single/composite classic tap for ready pitched
classic instruments. Drum machine semantics still fail closed at the separate
percussion tap. The ordinary backend and keyboard remain unchanged.

`compileWorkbenchSource` handles classic captured scores and diagnostic auditions.
`compileWorkbenchSet` keeps each ordinary role's original source ID, allocates
composite extras from unused IDs1..5, reserves6 for percussion, and flattens
physical source metadata with role/slot/ID. It rejects more than five pitched or
six total physical sources,4000 combined events or a120s finite plan.
`createWorkbenchPreview` binds each slot to its own private input and activates a
logical composite lease once. Failures release all acquired leases and private
nodes. Source peaks are retained per physical slot; aggregate role/channel peaks
cannot make a missing slot appear to have generated PCM. Channel peaks remain
shared per role and may include its other slots/tails, as the report scope states.

The combined focused suite has123 passing tests across12 files. A real threaded
worker run uses all six physical buses simultaneously: four Minimoog slots, a
Juno and Hand percussion. Every delivered stereo source sample equals an
independent serial graph, every stem has nonzero output, and all events complete
with no late/overflow/recycle errors. The published Graph19 integration also has
22 tests covering all14 models against the preserved original native canonical
callback schedule,42 host-polyphony comparisons, save/reload, reset, unrelated
graph-event partitioning, same-memory handles, cancellation, late prebooking,
timed panic and bounded source/global queues. Parent integration owns actual
browser audio checks and local build publication.
