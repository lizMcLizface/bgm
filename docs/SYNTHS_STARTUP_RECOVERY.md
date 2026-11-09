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

## Subsequent phone result and LAN HTTPS fallback

The phone retry of `e21547e` **failed** with the same AllPage stylesheet on a
full `https://<remote-preview-host>/assets/AllPage-I1eM8As7.css` URL. Thus the
prefix experiment did not fully reproduce the phone's remote-preview failure.
Do not describe that commit as a confirmed phone fix.

All's existing rack and sequence styles are now bundled with its lazy JS module
and mounted once with the page. FloatBox's former rack import moves to the same
page-owned payload, in the original rack-then-sequence order. Its **8,287
characters** match the former stylesheet after removing line separators; layout
still computes absolute positioning and 850 px for the voice box. No style-rule,
pose, setup schema, DSP or default audio change is intended. The package guard
checks All HTML, both rule groups in the JS and absence of `AllPage-*.css`.

- **68 tests / three files pass**, 67.16 s; public package/build checks pass,
  Vite **51.45 s**. Current page chunk `AllPage-hDUvndTI.js`, 214,120 bytes.
- Separate before/after servers deliberately reject every AllPage CSS request.
  The previous build fails with the reported stylesheet error (one rejected
  request); the current build opens styled and ready without making that request.
  Direct fresh port-4175 All also opens stopped with Play enabled.
- The phone's next inline-style retry then **failed on shared
  `generative-ybgFc-ZW.css`** at the remote preview host. The All-specific request
  was removed, but this was **not a complete ChatGPT phone-preview fix**. Keep
  these negative results; do not move shared styles one by one based on them.
- Evidence: `m4a-inline-style-{browser,payload}.json`,
  `.tmp/workbench-inline-style-{tests,build}.log`, screenshot
  `.tmp/workbench-inline-css-fixed.png`. Earlier audio results remain historical.

The user explicitly requested a network-available **HTTPS local server** to use
a normal phone browser. An additional Vite public-build preview is running at:

`https://192.168.0.228:4176/synths/all/`

It binds the host's Ethernet address, serves `dist-public` in public mode, and
does not enable raw-bank/reference middleware. The old HTTP preview and user's
desktop tab are retained. **No deployment or firewall changes.**

- Machine-local config `.tmp/https/vite.lan-preview.config.mjs`, background
  hidden Node process recorded in `.tmp/https/lan-preview.pid`; logs
  `.tmp/https/lan-preview.{stdout,stderr}.log`. Existing ignored key/certificate
  are reused, never committed. Certificate SAN includes `192.168.0.228`, with
  validity 2026-10-20 to 2027-10-20; it is self-signed.
- Host-side HTTPS checks trust that exact certificate as CA and verify its
  identity, without disabling TLS verification. All returns **200 / text/html**;
  the failing shared stylesheet returns **200 / text/css / 56,397 bytes**.
  `reports/modular_audio/m4a-lan-https-preview.json` records these checks.
- The phone must use the same LAN/Wi-Fi and paste the address into Safari/Chrome,
  outside ChatGPT's embedded preview. A certificate warning may need user action;
  the agent does not bypass browser security warnings or alter trust settings.
  The user confirms: **"cert warning but proceeding anyways opens the page just
  fine and it works"**. This confirms phone access in the normal browser after
  their own certificate action; the agent did not bypass a warning or change
  trust settings. It is not a new run-bound Rust/physical-audio quality verdict.

To start the same preview again using the existing machine-local config:

`npm.cmd run preview -- --mode public --config .tmp/https/vite.lan-preview.config.mjs`

**Next:** use the confirmed LAN HTTPS route for M4a's actual All run-bound
listening evidence. Keep this preview available for the user. Do not deploy to
diagnose the embedded preview, whose shared CSS failure remains unresolved.
