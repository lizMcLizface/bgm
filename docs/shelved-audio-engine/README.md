# Shelved modular audio integration

Shelved on 14 November 2026 at the user's request. Current playback remains the
product baseline. Further integration and default promotion are stopped: the
comparisons did not establish a CPU, memory or multicore advantage sufficient to
justify the added complexity, and exposed timing and lifecycle limitations.

The preserved local branch is `codex/shelved-modular-audio-engine`. Its original
integration tip is `f3e33613d54720510a68138f717262d7c5da55cf`. The fetched remote
baseline is `111d282f9eeed07d86f49194090221c0f62523b6` (`origin/main`). The original
tip contains 170 local commits beyond that baseline, with 2,320 changed files,
101,261 inserted lines and 1,125 deleted lines. The shelving commit adds only
this recovery note and the frozen WIP archive/manifest. No integration was pushed
or merged into the remote. Local `main` is recreated at the remote baseline.

The implementation and its earlier verification records remain in this branch's
history. Read `docs/MODULAR_AUDIO_ENGINE_CLEANUP_HANDOFF.md` and
`docs/MODULAR_AUDIO_ENGINE_CONVERGENCE.md` for boundaries and results. The 32 ms
lead was a provisional experimental session choice; it is not a product default
or a demonstrated performance improvement over Current.

## Frozen unfinished work

`unaccepted-wip.zip` and `manifest.json` preserve all 39 previously untracked
implementation files byte-for-byte. This is the verified archive prepared on
12 November, not an acceptance or publication of those implementations. They
remain outside the tracked source/test tree so the accepted-suite file inventory
does not silently expand. The manifest records their paths, sizes and hashes.

Archive SHA256:
`8c3200477061de6a3309aa7dd89a786b171eb402041e8df96a3981d5861bfc65`.

To resume, first check out this shelved branch and inspect the handoff. If the
unfinished files are needed, verify the archive hash, then expand
`docs/shelved-audio-engine/unaccepted-wip.zip` into the repository root. Their
repository-relative paths are stored in the ZIP, and they should remain
unaccepted/untracked until deliberately reviewed.

Additional ignored local recovery material remains under
`reports/audio-engine-shelf-2026-11-14/`: an incremental Git bundle for the 170
commits (requires the baseline above), the relocated original WIP files and a
shelving receipt. Existing comparison reports, scripts, the initial WIP backup
and build artifacts remain local under their existing ignored paths. Those
ignored reports are not stored in this branch; the WIP archive above is.

Any future restart should begin with a concrete measurable benefit and a bounded
experiment. Do not merge this accumulated integration wholesale merely to
recover isolated useful changes.
