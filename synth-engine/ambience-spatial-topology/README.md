# Explicit Ambience topology kernel

An isolated generated-source successor of `../ambience-spatial`. `build.rs` copies the accepted attributed modules and Native sine basis resources into Cargo OUT_DIR, applies only asserted topology anchors, then appends `src/topology.rs`. The JavaScript builder independently checks every generated module and records source/resource SHA256 values. No accepted crate or default binary is changed.

The ABI adds known mono/stereo input-channel transitions and a width-parameter demand mask. It never infers silence from PCM. Existing Native algorithms and notices are inherited from `../ambience-spatial/CHROMIUM_PROFILE.json` and `CHROMIUM_NOTICES.txt`; exact phase preparation is inherited from `../native-wave-preparation` and its attribution. Preserve those references when distributing generated artifacts.

See `../../docs/MODULAR_AUDIO_ENGINE_AMBIENCE_SPATIAL_TOPOLOGY.md` for the explicit policy, accepted Native cases, resource limits and allocation audit. Build through `node tools/buildAmbienceSpatialTopology.mjs`; Cargo output is private unless that tool is explicitly passed `--publish`.
