# Explicit continuous-context lifecycle

The selected clocked prepared environment declares continuous-while-prepared-7a.
Generator's existing idle admission refuses automatic context suspension for
that explicit runtime policy. It does not replace AudioContext methods or infer
DSP demand from numerical silence. Every existing per-family demand contract
remains authoritative; no claim that all paused DSP is inactive is made.

Native/default environments retain their original idle suspension behavior.
The runtime policy is context-bound and excluded from serialized song settings.
Cold initial resume is allowed. Unexpected live suspension/interruption retires
7a authority; new source preparation, live notes, music and ambience start refuse
before Native resume or new note ownership. The caller must explicitly stop and
reconstruct/reload. This is not transparent resumption of old DSP history.
Offline contexts retain their separately accepted wall-time freeze contract.

Why: pinned Native destination code can advance its counter while graph pulling
is disabled during platform stop/start. Actual review-only drain evidence shows
main counter48512, previous pulled end48384, first resumed Native AudioParam48512
but BufferSource-derived frame48384: a128-frame stop-drain gap, with start-drain0.
The earlier strict8ca freeze prototype correctly refuses it. Its general freeze
acceptance is withdrawn; no epoch fit or fabricated DSP call repairs that gap.

Validation:194 focused Generator/environment/idle checks pass. An actual desktop
createHost/Generator gate proves the Native/default positive suspension control,
eight selected-owned idle admissions staying running, Native time advancement,
unchanged settings and one real live note (peak0.4309864640235901). External
suspension retires authority, and attempted live/start/ambience activity refuses
before instrument.startNote or held-note mutation. All observed owners dispose
cleanly; expected retirement notifications are separate from unexpected errors.
Evidence: reports/modular_audio/clocked-continuous-idle-first.json.

This permits the declared running/idle contract in explicit prepared hosts. It
does not make the main app select Rust by default, certify phone/background
scheduling or implement automatic cold reconstruction after an OS interruption.
The unchanged mixer Wasm is refreshed only for reference-source provenance.
