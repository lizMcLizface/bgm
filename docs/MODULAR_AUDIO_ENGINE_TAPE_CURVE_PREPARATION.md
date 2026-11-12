# Original Tape curve preparation in Rust

This separate preparation leaf computes the original 2,049-point drive curve in
Rust using f64 `tanh` and one final f32 conversion. It runs outside the audio
callback and imports no JavaScript math. It does not change the existing Tape
kernel, Native defaults, or normal rack selection.

The fixed owned array is copied on the JavaScript boundary. Separate instances
retain independent drive/call state. Nonfinite and out-of-range drives are
rejected before mutation; disposed handles cannot be reused.

Accepted identities:
- Numeric profile: `original-tape-std-f64-tanh-final-f32-v1`.
- Kernel: `dcad5770a9397205`, 17,093 bytes.
- Wasm SHA256: `c8ff22b8fae7701be5ee70b844ad817d0ec991f79f0727617d87f93e8617362e`.
- Browser host: `31626328e392ee29`.

Three permanent Wasm tests pass. A dense/edge/deterministic-random batch checks
2,031 drives and 4,161,519 Float32 values against the original JavaScript law,
with zero differing values. The desktop Chrome 157 page independently repeats
that comparison using the original uninstantiated Tape source, also with zero
differing values. This is measured compatibility on those inputs and runtime,
not a universal assertion about every platform's transcendental implementation.

The allocation-audit variant prepares 4,096 curves (8,392,704 points), rejects
4,096 NaN edits, and observes zero allocations, reallocations, frees or memory
growth during the measured operations. Construction/destruction is outside that
window. The production module has no host imports.

Evidence stays in ignored `reports/modular_audio/`:
`tape-rust-curve-dcad-host-final.json`,
`tape-curve-preparation-allocation.json`, and
`tape-curve-preparation-final-tests.log`.
The fixed review page is `tools/tape-curve-preparation.html`.

Build/check with `node tools/buildTapeCurvePreparation.mjs --publish` and
`node tools/buildTapeCurvePreparation.mjs --publish --check`. The builder uses
local offline Rust tools under `.tmp/rust-tools`; its complete manifest binds
source, Wasm, original source reference and browser host files.

Next: inject this preparer into the separate live Tape facade, record that
profile explicitly, and verify READY installation and lifecycle behavior before
normal prepared-environment adoption. The baseline facade still defaults to its
original JavaScript preparer; no silent fallback is implied by this leaf.
