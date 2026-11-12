# Main constructor controls and cold bootstrap

This is a component and startup prerequisite record. The normal Generator is
still hybrid. It does not admit a six-role live group, replace its controls or
reconstruct an existing Native AudioParam timeline.

The original constructor assigns each role volume, then applyMix schedules an
initial target at Native time zero with a 0.02-second constant. A muted or
inaudible role therefore starts with a volume-to-zero target. Initializing the
Rust volume directly to zero is a different recipe.

The unchanged kernel `03eb5d894a75d801` can receive that literal target before
its first frame. The actual Offline Native component group passes all 48
combinations: six rates, mono/stereo, initially open/muted, and a future-start
source or a literal zero prefix. Every Float32 word is identical; all Native
outputs include nonzero samples. Both recipes process continuously from frame
zero. Receipt: `reports/modular_audio/main-cold-prelude-component-first.json`.
This does not establish live startup or arbitrary Native demand equivalence.

The first live attempt created its AudioContext inside the button gesture.
The browser immediately started it, so the virgin suspended-at-zero predicate
correctly refused before any owner allocation. That negative receipt remains
`reports/modular_audio/main-live-cold-clock-first.json`. Forced suspension or
inventing a zero origin would not establish the missing authority.

Preparing the context and both unchanged a6e controls from page module startup,
before the user gesture, passes the actual 48 kHz prerequisite. The context
stays suspended at time zero. A same-source FIFO statistics receipt confirms
both configured codecs, generation one, no first frame and zero Rust/clock
calls. Explicit button resume then yields first Native frame zero for both
owners, with no forward gaps or rejected codes. Both source terminal receipts
and clock releases complete before context close. Receipt:
`reports/modular_audio/main-live-outside-gesture-cold-final.json`.

The private reproducible pages are `reports/scripts/main-cold-prelude.html` and
`reports/scripts/main-outside-gesture-cold.html`. They are ignored test helpers.
The kernel remains 46,464 bytes, SHA-256
`3e3f881187fb73cb236d9bf4f35c6c4de20df5fb2738f291cf24f1d12e834e31`.

Next: a separate cold six-role profile must prove all six configured receipts
before resume, seed the declared original constructor calls before processing,
account for their actual lane credits, and require each real first frame to be
zero before program publication. It must refuse a missed prerequisite. Existing
gain getters, late backdated commands, elapsed time and successful two-owner
startup are insufficient to authorize that group or existing Generator adoption.
