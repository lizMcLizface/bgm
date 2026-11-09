# Local preview startup and forwarded assets

2026-11-09, follow-up to M4a (`20e3f56`). The user reported **Warming up**
indefinitely in the phone's ChatGPT app using the local All link. The deployed
public page works for them; **no deployment for testing is authorized or done**.

The new recovery UI exposed the actual phone error:

`Unable to preload CSS for /assets/AllPage-I1eM8As7.css`

That file exists in the public build. Warming up is the React lazy-page loader,
before All's audio/owned preview starts. The existing loader neither explained
long downloads nor contained a failed lazy import/render.

## Change

- `PageStartup` retains late successful imports and adds a recovery notice after
  ten seconds. A real load/render failure shows its error and a Reload page
  button. There is no automatic retry loop, storage clear or backend switch.
- Reload requests fresh HTML with a replaced `_reload` query marker, preserving
  existing routing/query/hash and saved setup data. It warns that an unsaved
  Continuous sequence starts fresh on reload, under existing behavior.
- Vite's JS-emitted build asset URLs now resolve beside the importing module,
  including blocking lazy CSS preloads. A forwarded script path therefore also
  governs its stylesheet/dependency URLs. The configured site base remains `/`;
  HTML/CSS/public kernel/worklet/graph URL policy is unchanged. No DSP, source
  graph, fixture, audio settings or persistence schema changes.

## Verification and limits

- **100 focused tests / three files**, 43.87 s: startup states plus existing All
  and Effects page workflows. Final startup/URL-policy checks: **five tests /
  two files**, 1.21 s. Late resolution, unmount cleanup, failed import details,
  retry and query/hash/storage preservation are covered.
- Public package/provenance/build checks pass; final Vite **49.45 s**. M4a's
  Rust/Wasm runtime stays `31d4ba7553a47868`, unchanged 296,101-byte Wasm. M4a's
  prior audio/regression results remain historical; no additional live audio
  result is claimed in this startup follow-up.
- An isolated loopback server rewrites HTML asset URLs under
  `/preview/session/assets/` and rejects unforwarded `/assets/` requests.
  Before the URL fix it reproduces the CSS preload failure (first unmatched
  stylesheet is FirefoxAndroidNotice). After the fix, the actual Reload page
  control opens All and its AllPage stylesheet/dependencies use the forwarded
  path. Direct port 4175 also opens All with Play enabled and transport stopped.
  This demonstrates the path-handling defect and fix; it does not inspect or
  assert the implementation of ChatGPT's private mobile forwarding layer.
- A separate controlled 30-second module delay displays the slow notice, then
  successfully opens the late page. An injected module failure displays the
  real error/reload control. These fault injections use separate temporary
  loopback ports, not the user's live 4175 server or the public site.
- Evidence: `reports/modular_audio/m4a-startup-browser.json`,
  `.tmp/workbench-startup-{focused,url-tests,url-build}.log`, screenshots
  `.tmp/workbench-startup-{slow-browser,error-browser,prefix-fixed}.png`.
  The user's existing desktop tab/workbench was not reloaded or reset.

**Phone confirmation is pending** for
`http://127.0.0.1:4175/synths/all/?_reload=20261109-startup2` in the ChatGPT app.
If another error remains, use the displayed full URL/error to distinguish an
old bootstrap from a different request/forwarding failure. Do not deploy to
diagnose it. Once phone startup is confirmed, resume M4a's run-bound listening
evidence task before eligible multi-role migration.
