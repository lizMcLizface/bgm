// Promoted from the actual Main ordered-mix review, preserving its admission and ACK checks.
import { REPLAY_KEY, createRecipe, fingerprints, validateSavedRecord, verifyReplay } from "./audioEngineReviewRecipe.js";
import { generatorOrderedMixRoot } from "../src/modular-audio/generatorOrderedMixRoot.js";
import { orderedSendCohortBudget } from "../src/modular-audio/orderedSendBudget.js";
import { prepareGeneratorRustMaster } from "../src/modular-audio/generatorRustMasterSession.js";
import { borrowIncumbentControlPull } from "./mainIncumbentPull.js";
import Generator from "../src/app/Generator.js";
import { defaultSettings } from "../src/app/settings.js";
import { audioContext as context } from "../src/audio/context.js";
import { masterBus } from "../src/audio/bus.js";
import { prepareClockedOwnedHostEnvironment } from "../src/modular-audio/clockedOwnedHostEnvironment.js";
import { prepareClockedCoreLive } from "../src/modular-audio/clockedCoreLive.js";
import { getPublishedMainSourceEdits } from "../src/modular-audio/mainStoppedRuntimeBinding.js";
import { contextPreparationStatus, reserveContextPreparation } from "../src/modular-audio/contextPreparationRegistry.js";
import { planGeneratorMainMix } from "../src/modular-audio/generatorMainControlPlan.js";
import { MAIN_ROLE_IDS as ids } from "../src/modular-audio/mainRoleControlRecipes.js";
const status = document.querySelector("#status"), result = document.querySelector("#result"), button = document.querySelector("#run");
let recipe, savedRecord, cancelled = false, playback;
const report = { kind: "actual-generator-partial-ordered-mix", version: 1, variant: "first-publication-four-explicit-cohorts-v1", checksPassed: false, errors: [], events: [], scope: "Partial ordered dry6/bus6/space6/master2 join. Native private rack processed+bypass, private-return/Main junction and global master bus remain. Fixed captured bus/space recipe, no arbitrary old fan-in word-identity claim. Actual Generator constructor/Root activation, original loadRolePreset+setAudioEngine, Core/FM stopped publication with explicit 128ms default live-input timestamp lead (no delivery deadline guarantee), mixer/tone/booked/live controls and ACK cleanup. Rust six-role Main controls plus Rust trim/ambience gains. Rust master-output stop/resume; Native sweep, unity junctions and other declared host boundaries remain. No physical deadline or Native source PCM parity claim." };
function issue(e, n = 0) {
  return n > 7 ? String(e) : { error: String(e), code: e?.code, diagnostics: e?.diagnostics, stack: e?.stack, cause: e?.cause ? issue(e.cause, n + 1) : void 0, cleanupError: e?.cleanupError ? issue(e.cleanupError, n + 1) : void 0, errors: e?.errors ? Array.from(e.errors, (x) => issue(x, n + 1)) : void 0, candidateCleanup: e?.candidateCleanup, groupStatus: e?.groupStatus };
}
function show() {
  result.value = JSON.stringify(report, null, 2);
  const clean = report.finalRoot?.state === "disposed" && report.finalMaster?.state === "disposed" && report.finalOutput?.state === "disposed" && report.finalOrderedBudget?.held === 0 && !report.registryBeforeClose?.idleBlocked;
  document.querySelector("#summary").textContent = report.completed ? [
    report.checksPassed ? "PASS \u2014 grouped integrated review" : cancelled ? "STOPPED \u2014 review cancelled" : "FAIL \u2014 see diagnostics",
    "Six roles, ordered dry/bus/space/master output: " + (report.audio ? "observed" : "not completed"),
    "Live controls and stop/resume: " + (report.completeOutputControls ? "acknowledged" : "not completed"),
    "Stopped source replacement: " + (report.sourceSwap ? "completed" : "not completed"),
    "Whole runtime overlap: " + (report.expectedWholeSuccessorRefusal ? "refused before mutation" : "not completed"),
    "Terminal cleanup: " + (clean && !report.cleanupErrors?.length ? "clean ACKs; cohorts and registry released" : "incomplete \u2014 see diagnostics"),
    "Reload replay: " + (report.replayMatched ? "matched saved recipe/settings/presets/factory" : savedRecord ? "not completed" : "not requested"),
    "Late ordered publications (allowed in this slice): " + JSON.stringify(report.orderedBeforeCleanup?.cohorts?.map((row) => ({ name: row.name, late: row.receipt?.stats?.core?.unit?.latePublications })) ?? null),
    ...report.errors.length ? ["Error: " + report.errors[0].error] : []
  ].join("\n") : "Prepared state and full diagnostics are available below.";
  document.querySelector("#download").disabled = !report.completed;
  document.querySelector('#reload').disabled = !report.completed;
  document.querySelector("#save-reload").disabled = !report.checksPassed;
}
function assert(value, message) {
  if (!value) throw Error(message);
}
function checkpoint() {
  if (cancelled && !finished) throw Object.assign(Error("Review stopped"), { name: "AbortError" });
}
function timeout(p, label, ms = 3e4) {
  let timer;
  return Promise.race([p, new Promise((_, reject) => timer = setTimeout(() => reject(Error(label + " timed out")), ms))]).then((value) => {
    checkpoint();
    return value;
  }).finally(() => clearTimeout(timer));
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
window.addEventListener("error", (event) => {
  report.asyncErrors ??= [];
  if (report.asyncErrors.length < 8) report.asyncErrors.push(issue(event.error ?? Error(event.message)));
});
window.addEventListener('unhandledrejection', event => {
  report.asyncErrors ??= [];
  if (report.asyncErrors.length < 8) report.asyncErrors.push(issue(event.reason));
});
let g, root, masterRoot, outputRoot, masterControllers, environment, current, prepared, musicAdmission, quiet, masterTap, roleTaps = [], cohortTaps = {}, incumbents = [], held = [], contextOwned = false, finished = false;
const connections = [], factoryScopes = [];
let factoryReleases = 0;
const sample = (analyser) => {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  for (const value of data) {
    if (!Number.isFinite(value)) throw Error("Nonfinite application PCM");
    peak = Math.max(peak, Math.abs(value));
  }
  return peak;
};
async function observe(seconds) {
  const out = { master: 0, roles: Object.fromEntries(ids.map((id) => [id, 0])), cohorts: { dry: 0, bus: 0, space: 0, master: 0 }, samples: 0 };
  const until = performance.now() + seconds * 1e3;
  while (performance.now() < until) {
    checkpoint();
    out.master = Math.max(out.master, sample(masterTap));
    for (let i = 0; i < 6; i++) out.roles[ids[i]] = Math.max(out.roles[ids[i]], sample(roleTaps[i]));
    for (const [name, tap] of Object.entries(cohortTaps)) out.cohorts[name] = Math.max(out.cohorts[name], sample(tap));
    out.samples++;
    await wait(20);
  }
  return out;
}
function sourceStatus() {
  return ids.map((role) => {
    const owner = g.roles[role].instrument, b = owner.voice?.backend;
    return { role, preset: g.roles[role].presetName, backend: b?.kind ?? "percussion", clock: b?.clockStatus?.() ?? null, source: owner.sourceStatus?.() ?? null, liveInputTiming: b?.liveInputTiming ?? null, liveInputTimingStatus: b?.liveInputTimingStatus?.() ?? null, terminal: b?.node?.sourceDisposalStatus?.() ?? owner.disposalStatus?.() ?? null };
  });
}
const acquireEnvironment = async ({ context: ctx }) => ({ context: ctx, value: environment, release: () => {
  factoryReleases++;
  return Promise.resolve({ released: true, clean: true, authority: "immutable-context-factory-reference-only; actor ACKs owned by runtime bundle" });
} });
async function environmentLease(ctx) {
  const ticket = reserveContextPreparation(ctx, { label: "main-root-review-factories" });
  try {
    await ticket.ready;
    const value = await ticket.shared("main-root-review-immutable-factories-v1", acquireEnvironment), scope = ticket.publish(() => value);
    factoryScopes.push(scope);
    return { context: ctx, value, release: () => scope.retire() };
  } catch (primary) {
    try {
      await ticket.cancel(primary);
    } catch (cleanupError) {
      primary.cleanupError = cleanupError;
    }
    throw primary;
  }
}
const options = () => ({ prepareEnvironment: environmentLease, sourceClock: () => {
  throw Error("Registered Root must retain its own session clock");
}, editableSources: true, editableReturns: false, orderedMix: true });
async function stopAndConfirm() {
  for (const [role, id] of held) g.liveNoteOff(role, id);
  held = [];
  if (g.isRunning) await g.stop();
  g.endStopFade();
  for (const role of ids) g.roles[role].instrument.silence();
  const edits = getPublishedMainSourceEdits(g);
  if (edits) await timeout(edits.confirmStopped(), "Actual source panic/FIFO confirmation");
  report.events.push({ kind: "stopped-confirmed", frame: Math.round(context.currentTime * context.sampleRate), source: edits?.status(), liveInputTiming: sourceStatus() });
}
async function disposeCurrent() {
  const actual = g?.runtimePublishedOwner ?? current;
  if (actual) {
    await actual.binding.prepareTerminalDetach();
    actual.binding.detachPublished();
    await actual.scope.retire();
    report.lastScope = actual.scope.snapshot();
    report.finalOrdered = generatorOrderedMixRoot(g)?.status();
    report.finalOrderedBudget = orderedSendCohortBudget(context);
  }
  current = null;
}
function failureSnapshot() {
  const read = (fn) => {
    try {
      return fn();
    } catch (e) {
      return issue(e);
    }
  };
  return { stage: status.textContent, ordered: read(() => generatorOrderedMixRoot(g)?.status()), orderedBudget: orderedSendCohortBudget(context), context: { state: context.state, currentTime: context.currentTime }, root: read(() => root?.status()), author: read(() => root?.author.status()), incumbents: incumbents.map((lease) => read(() => lease.status())), registry: read(() => contextPreparationStatus(context)), candidate: read(() => prepared?.describe()), publication: read(() => g?.runtimePublishedOwner?.binding.describe()), generator: read(() => ({ running: g?.isRunning, ambienceRunning: g?.ambienceRunning, runtimeError: g?.runtimeEnvironmentError ? issue(g.runtimeEnvironmentError) : null, sourceRetirement: g?.sourceRetirement ? String(g.sourceRetirement) : null, pendingSources: g?.sourceLoads?.size, pendingEngine: !!g?.audioEngineReady, pendingRuntime: !!g?.runtimeEnvironmentReady })), roles: ids.map((role) => read(() => {
    const owner = g?.roles?.[role]?.instrument, b = owner?.voice?.backend;
    return { role, type: owner?.constructor?.name, preset: g?.roles?.[role]?.presetName, error: owner?.error ? issue(owner.error) : null, backendError: b?.error ? issue(b.error) : null, source: owner?.sourceStatus?.(), disposal: owner?.disposalStatus?.(), coreClock: b?.clockStatus?.(), coreTerminal: b?.node?.sourceDisposalStatus?.(), clockRelease: b?.clockReleaseStatus?.(), liveInputTiming: b?.liveInputTiming ?? null, liveInputTimingStatus: b?.liveInputTimingStatus?.() ?? null, wander: g?.roles?.[role]?.wander?.status?.() };
  })) };
}
async function cleanup() {
  if (finished) return;
  finished = true;
  const errors = [];
  if (musicAdmission) try {
    musicAdmission.cancel();
  } catch (e) {
    errors.push(e);
  }
  if (g) try {
    await stopAndConfirm();
  } catch (e) {
    errors.push(e);
  }
  if (prepared && prepared.state !== "published") try {
    await prepared.cancel();
  } catch (e) {
    errors.push(e);
  }
  if (g?.runtimePublishedOwner || current) try {
    await disposeCurrent();
  } catch (e) {
    errors.push(e);
  }
  else if (g) {
    for (const role of ids) try {
      await g.roles[role].instrument.dispose();
      await g.roles[role].wander.dispose();
    } catch (e) {
      errors.push(e);
    }
    try {
      await g.disposeSharedEffects();
    } catch (e) {
      errors.push(e);
    }
  }
  for (const lease of incumbents) try {
    await lease.release();
  } catch (e) {
    errors.push(e);
  }
  report.incumbentFinal = incumbents.map((lease) => lease.status());
  if (root) try {
    await (masterControllers ? masterControllers.dispose() : g.disposePreparedRouting());
  } catch (e) {
    errors.push(e);
  }
  report.finalRoot = root?.status();
  report.finalMaster = masterRoot?.status();
  report.finalOutput = outputRoot?.status();
  report.factoryRefs = factoryScopes.map((scope) => scope.snapshot());
  report.factoryReleases = factoryReleases;
  report.registryBeforeClose = contextPreparationStatus(context);
  // Cancellation can finish before any ordered cohorts are acquired.
  report.finalOrderedBudget = orderedSendCohortBudget(context);
  for (const [from, to] of connections.slice().reverse()) try {
    from.disconnect(to);
  } catch (e) {
    if (e.name !== "InvalidAccessError") errors.push(e);
  }
  if (contextOwned) try {
    await context.close();
  } catch (e) {
    errors.push(e);
  }
  report.cleanupErrors = errors.map((e) => issue(e));
  if (errors.length) throw new AggregateError(errors, "Generator review cleanup failed");
}
async function bootstrap() {
  document.querySelector('#reload').disabled = true;
  contextOwned = true;
  try {
    const raw = localStorage.getItem(REPLAY_KEY);
    savedRecord = raw ? validateSavedRecord(JSON.parse(raw), context.sampleRate) : null;
    recipe = savedRecord?.recipe ?? createRecipe(context.sampleRate);
    report.recipe = recipe;
    report.replayRequested = !!savedRecord;
    report.creation = { state: context.state, time: context.currentTime, rate: context.sampleRate };
    assert(context.state === "suspended" && context.currentTime === 0, "Actual shared context must be virgin suspended0 outside gesture");
    contextOwned = true;
    const settings = defaultSettings();
    settings.seed = recipe.seed;
    settings.ambience = Object.fromEntries(Object.keys(settings.ambience).map((id) => [id, 0]));
    settings.sectionSpace = 0;
    settings.arc = { ...settings.arc, shape: "off" };
    settings.bus = { ...settings.bus, sends: Object.fromEntries(ids.map((id) => [id, 0])) };
    settings.muted = { ...settings.muted, pad: true };
    settings.ducking = 0.5;
    g = new Generator(settings, { percussion: "wasm" });
    report.initialLogical = ids.map((role) => ({ role, destinations: g.roles[role].instrument.destinations?.length, pointsToOriginal: g.roles[role].instrument.destinations?.[0] === (g.roles[role].tone ?? g.roles[role].gain) }));
    report.nativeConstructorMix = planGeneratorMainMix(g);
    masterControllers = await timeout(prepareGeneratorRustMaster(g, { channels: Object.fromEntries(ids.map((role) => [role, 2])) }), "Complete cold Generator master preparation");
    root = masterControllers.roleRoot;
    masterRoot = masterControllers.scalarRoot;
    outputRoot = masterControllers.outputRoot;
    report.coldRoot = root.status();
    report.coldMaster = masterRoot.status();
    report.coldOutput = outputRoot.status();
    report.settingsBefore = JSON.stringify(g.settings);
    assert(context.state === "suspended" && context.currentTime === 0, "Generator cold preparation woke context");
    status.textContent = "Configured actual Generator Root at suspended0; ready";
    button.disabled = false;
    document.querySelector("#listen").disabled = false;
    show();
  } catch (e) {
    report.failureBeforeCleanup ??= failureSnapshot();
    report.errors.push(issue(e));
    try {
      await cleanup();
    } catch (error) {
      report.errors.push(issue(error));
    }
    report.completed = true;
    status.textContent = "Preparation refused; use browser Reload (Ctrl+R) outside a page button gesture and retry";
    show();
  }
}
async function runReview(audible = false) {
  button.disabled = true;
  document.querySelector("#listen").disabled = true;
  document.querySelector("#stop").disabled = false;
  report.audible = audible;
  masterBus.disconnect(context.destination);
  try {
    status.textContent = "Resuming and publishing original logical sources";
    await timeout(context.resume(), "Resume", 1e4);
    await timeout(masterControllers.activate(), "Nine-owner first0/activation/publication");
    report.publishedOutput = outputRoot.status();
    report.publishedRoot = root.status();
    await timeout(masterRoot.activate(), "Cold master first0/activation/publication");
    report.publishedMaster = masterRoot.status();
    report.masterCertificate = masterRoot.verifyClock();
    const extraClock = await root.retainClock();
    try {
      report.initialCertificate = root.verifyColdNativeClock(extraClock.value);
    } finally {
      await extraClock.release();
    }
    const names = recipe.presets;
    for (let i = 0; i < 5; i++) assert(g.loadRolePreset(ids[i], names[i]), "Actual preset missing: " + names[i]);
    status.textContent = "Preparing explicit owned factories and actual engine replacement";
    const base = await prepareClockedOwnedHostEnvironment(context), core = await prepareClockedCoreLive(context, { liveInputLeadSeconds: recipe.liveInputLeadSeconds });
    report.liveInputFactory = { profile: core.profile, engineVersion: core.engineVersion, clockVersion: core.clockVersion, policy: core.policy };
    assert(core.policy?.profile === "clocked-core-explicit-live-input-lead-v1" && core.policy.leadSeconds === 0.128, "Selected live-input factory policy differs");
    environment = Object.freeze({ ...base, createCoreBackend: core });
    g.audioEnvironment = environment;
    await timeout(g.setAudioEngine("wasm"), "Actual Generator setAudioEngine", 6e4);
    await timeout(g.awaitSourceReady(), "Actual source first-pull readiness", 3e4);
    report.afterEngineBeforePull = sourceStatus();
    for (const role of ids.slice(0, 5)) await timeout(borrowIncumbentControlPull({ g, root, role, onLease: (lease) => incumbents.push(lease) }), "Actual incumbent first-pull " + role, 15e3);
    report.incumbentPulls = incumbents.map((lease) => lease.status());
    report.afterEngine = sourceStatus();
    assert(report.afterEngine.slice(0, 5).every((s) => s.clock?.ready && s.clock.profile === "native-clock-owned-core-fm-live-v1"), "Every pitched source needs actual stereo Core/FM authority");
    report.fingerprints = await fingerprints({ recipe, settings: JSON.parse(report.settingsBefore), presets: ids.map((role) => ({ role, presetName: g.roles[role].presetName, preset: g.roles[role].instrument.preset ?? null })), factory: report.liveInputFactory });
    if (savedRecord) report.replayMatched = verifyReplay(savedRecord.fingerprints, report.fingerprints);
    status.textContent = "Creating the original captured rack returns before the explicit join";
    const busValues = { ...g.settings.bus, sends: Object.fromEntries(ids.map((id, i) => [id, 0.12 + i * 0.01])) };
    g.set("bus", busValues);
    g.applySpace(0.24, context.currentTime, 0.4);
    await timeout(g.awaitSharedEffectsReady(), "Actual captured bus/space rack construction", 6e4);
    g.applySpace(0.24, context.currentTime, 0.4);
    await timeout(g.awaitSharedEffectsReady(), "Actual captured rack activation", 3e4);
    assert(g.busRack && g.spaceRack && ids.every((id) => g.roles[id].send && g.roles[id].spaceSend), "Original captured returns/sends required");
    report.beforeJoin = { bus: g.settings.bus, spaceIntrinsics: Object.fromEntries(ids.map((id) => [id, g.roles[id].spaceSend.gain.value])), budget: orderedSendCohortBudget(context) };
    status.textContent = "Preparing and committing actual stopped runtime";
    prepared = g.prepareStoppedRuntime(options());
    await timeout(prepared.ready, "First stopped runtime", 6e4);
    current = await timeout(g.commitStoppedRuntime(prepared), "First stopped commit/old retirement", 6e4);
    report.initialSourceRelease = await Promise.all(incumbents.map((lease) => lease.release()));
    report.incumbentAfterRetirement = incumbents.map((lease) => lease.status());
    report.firstPublication = current.binding.describe();
    report.afterPublicationRoot = root.status();
    report.masterAfterPublication = masterRoot.status();
    report.outputAfterPublication = outputRoot.status();
    assert(report.outputAfterPublication.borrows === 1, "Current runtime must retain output borrow");
    assert(report.masterAfterPublication.borrows === 4, "Actual first runtime must borrow master scalars");
    report.registryPublished = contextPreparationStatus(context);
    report.orderedPublication = generatorOrderedMixRoot(g).status();
    report.orderedPublishedBudget = orderedSendCohortBudget(context);
    assert(report.orderedPublishedBudget.held === 4, "All four global cohort claims must be retained");
    quiet = context.createGain();
    quiet.gain.value = 0;
    quiet.connect(context.destination);
    connections.push([quiet, context.destination]);
    masterTap = context.createAnalyser();
    masterTap.fftSize = 2048;
    masterBus.connect(masterTap);
    masterTap.connect(quiet);
    playback = context.createGain();
    playback.gain.value = audible ? 0.35 : 0;
    masterTap.connect(playback);
    playback.connect(context.destination);
    connections.push([masterBus, masterTap], [masterTap, quiet], [masterTap, playback], [playback, context.destination]);
    for (const role of ids) {
      const tap = context.createAnalyser();
      tap.fftSize = 2048;
      const source = root.postControlsOutput(role);
      source.connect(tap);
      tap.connect(quiet);
      connections.push([source, tap], [tap, quiet]);
      roleTaps.push(tap);
    }
    for (const name of ["dry", "bus", "space", "master"]) {
      const tap = context.createAnalyser();
      tap.fftSize = 2048;
      const source = generatorOrderedMixRoot(g).output(name);
      source.connect(tap);
      tap.connect(quiet);
      connections.push([source, tap], [tap, quiet]);
      cohortTaps[name] = tap;
    }
    const changedBus = { ...g.settings.bus, sends: { ...g.settings.bus.sends, lead: 0.23, counter: 0.19 } };
    g.setMany({ bus: changedBus });
    g.applyBus();
    g.applySpace(0.31, context.currentTime + 0.1, 1.5);
    report.orderedAuthored = generatorOrderedMixRoot(g).author.status();
    g.setRoleMix("pad", { mute: false });
    g.setRoleVolume("lead", 0.6);
    g.setMany({ volumes: { ...g.settings.volumes, counter: 0.55 }, muted: { ...g.settings.muted, rhythm: false }, ambienceVolume: 0.64 });
    assert(g.settings.ambienceVolume === 0.64, "Combined stored ambience setting missing");
    g.setAmbienceVolume(0.7);
    assert(g.settings.ambienceVolume === 0.64, "Direct ambience DSP setter changed stored settings");
    g.set("ambienceVolume", 0.6);
    assert(g.settings.ambienceVolume === 0.6, "Stored ambience setter missing");
    await masterRoot.group.flush();
    report.masterAfterSettings = await masterRoot.group.stats();
    report.mixSettings = JSON.parse(JSON.stringify({ volumes: g.settings.volumes, muted: g.settings.muted }));
    musicAdmission = await timeout(g.start({ prepareOnly: true, isCurrent: () => !finished && !g.runtimeEnvironmentError }), "Actual prepared music admission");
    const when = context.currentTime + 1;
    musicAdmission.commitAt(when);
    report.musicEpoch = when;
    await wait(1100);
    checkpoint();
    for (let i = 0; i < 5; i++) {
      const id = g.liveNoteOn(ids[i], 60 + i * 3, 0.5);
      held.push([ids[i], id]);
    }
    g.liveNoteOn("perc", 0, 0.7);
    g.applyTone(1400, context.currentTime + 0.2, 1);
    g.applyTone(2e4, context.currentTime + 0.6, 1);
    status.textContent = "Observing actual routed music/live/mixer/tone";
    report.audio = await observe(1.2);
    assert(report.audio.master >= 1e-5 && ids.every((id) => report.audio.roles[id] >= 1e-5) && Object.values(report.audio.cohorts).every((peak) => peak >= 1e-5), "Every actual role and master route must be nonzero");
    assert(!g.runtimeEnvironmentError, "Generator reported runtime error");
    report.author = root.author.status();
    report.groupBeforeSuccessor = await root.group.stats();
    await masterRoot.group.flush();
    report.masterBeforeSuccessor = await masterRoot.group.stats();
    await outputRoot.flush();
    report.outputBeforeSuccessor = await outputRoot.stats();
    report.normalRunLiveInputTiming = sourceStatus();
    assert(report.normalRunLiveInputTiming.slice(0, 5).every((s) => s.liveInputTiming?.leadSeconds === 0.128 && s.liveInputTimingStatus?.events?.some((row) => row.method === "on" && row.defaulted)), "Every actual pitched live caller must use and record the selected default timestamp policy");
    await stopAndConfirm();
    status.textContent = "Exercising quick resume, tail resume and explicit fade-cancel refusal";
    g.stop();
    assert(g.stopFade, "Original quick stop must own its timer");
    const resumed = await timeout(g.start({ prepareOnly: true, isCurrent: () => !finished && !g.runtimeEnvironmentError }), "Actual quick resume admission");
    assert(!g.stopFade, "Actual quick resume must finish old stop fade");
    resumed.commitAt(context.currentTime + 0.5);
    await wait(650);
    g.fadeOut(1);
    const fadeTimer = g.fadeTimer, endTimer = g.endTimer;
    assert(fadeTimer, "Actual fadeOut must own its timer");
    let cancelRefused = false;
    try {
      g.cancelFadeOut();
    } catch (error) {
      cancelRefused = error.code === "MAIN_OUTPUT_INTRINSIC_READ_UNSUPPORTED";
      report.expectedFadeCancelRefusal = issue(error);
    }
    assert(cancelRefused && g.fadeTimer === fadeTimer && g.endTimer === endTimer, "Unsupported cancellation must preserve actual timer state");
    g.quickStop = false;
    g.stop();
    g.quickStop = true;
    await stopAndConfirm();
    await outputRoot.flush();
    report.completeOutputControls = { stats: await outputRoot.stats(), status: outputRoot.status() };
    assert(report.completeOutputControls.stats.writer.transport.sequence === 10 && report.completeOutputControls.stats.writer.transport.observedSequence === 10, "All ten actual stop/resume command records must be acknowledged");
    status.textContent = "Verifying source slot and full successor keep the stable Root";
    const edits = getPublishedMainSourceEdits(g), oldSource = g.roles.lead.instrument, oldSourceTiming = { policy: oldSource.voice?.backend?.liveInputTiming ?? null, status: oldSource.voice?.backend?.liveInputTimingStatus?.() ?? null };
    await g.setRoleSource("lead", g.roles.bass.instrument.preset, "Review stopped Core/FM source");
    assert(g.roles.lead.instrument !== oldSource, "Stopped source slot did not publish replacement");
    report.sourceSwap = edits.status();
    report.sourceSwapLiveInputTiming = { previous: oldSourceTiming, current: sourceStatus() };
    await edits.confirmStopped();
    const sameWanders = ids.map((id) => g.roles[id].wander), sameInstruments = ids.map((id) => g.roles[id].instrument), beforeBudget = orderedSendCohortBudget(context), beforeSettings = JSON.stringify(g.settings), beforeRegistry = JSON.stringify(contextPreparationStatus(context));
    let refused = false;
    try {
      g.prepareStoppedRuntime(options());
    } catch (error) {
      refused = error.code === "GENERATOR_ORDERED_MIX_REFUSED";
      report.expectedWholeSuccessorRefusal = issue(error);
    }
    assert(refused, "Whole runtime successor must refuse before constructing overlapping eight cohorts");
    assert(JSON.stringify(orderedSendCohortBudget(context)) === JSON.stringify(beforeBudget) && JSON.stringify(contextPreparationStatus(context)) === beforeRegistry && JSON.stringify(g.settings) === beforeSettings && ids.every((id, i) => g.roles[id].wander === sameWanders[i] && g.roles[id].instrument === sameInstruments[i]), "Refusal changed a parent, owner, reservation or cohort claim");
    report.orderedBeforeCleanup = await generatorOrderedMixRoot(g).stats();
    report.sourceSwapKeepsWander = ids.every((id, i) => g.roles[id].wander === sameWanders[i]);
    report.checksPassed = true;
  } catch (e) {
    report.failureBeforeCleanup ??= failureSnapshot();
    report.errors.push(issue(e));
    report.checksPassed = false;
  } finally {
    try {
      await cleanup();
    } catch (e) {
      report.cleanupFailureSnapshot = failureSnapshot();
      report.errors.push(issue(e));
      report.checksPassed = false;
    }
    report.checksPassed &&= !cancelled && !report.errors.length && !report.asyncErrors?.length && !report.cleanupErrors?.length && report.finalRoot?.state === "disposed" && report.finalMaster?.state === "disposed" && report.finalMaster?.borrows === 0 && report.finalMaster?.group?.quotaReleased === true && report.finalMaster?.group?.cleanupClean === true && report.finalOutput?.state === "disposed" && report.finalOutput?.borrows === 0 && report.finalOutput?.leaf?.owner?.cleanupClean === true && report.finalOrdered?.cohorts?.every((record) => record.terminalClean === true) && report.finalOrderedBudget?.held === 0 && !report.registryBeforeClose?.idleBlocked && report.registryBeforeClose?.tickets?.length === 0 && report.registryBeforeClose?.shared?.length === 0;
    report.completed = true;
    report.cancelled = cancelled;
    document.querySelector("#stop").disabled = true;
    status.textContent = report.checksPassed ? "Checks passed" : cancelled ? "Stopped; cleanup finished \u2014 see result" : "Checks failed";
    show();
  }
}
button.addEventListener("click", () => runReview(false));
document.querySelector("#listen").addEventListener("click", () => runReview(true));
document.querySelector("#stop").addEventListener("click", () => {
  cancelled = true;
  if (playback) playback.gain.value = 0;
  status.textContent = "Stopping and waiting for terminal cleanup";
});
document.querySelector("#reload").addEventListener("click", () => {
  if (document.querySelector("#stop").disabled) {
    localStorage.removeItem(REPLAY_KEY);
    status.textContent = 'Saved replay cleared. Use browser Reload (Ctrl+R) for a fresh review.';
  } else {
    status.textContent = "Stop the active review and wait for cleanup before reloading";
  }
});
document.querySelector("#save-reload").addEventListener("click", () => {
  if (!report.checksPassed) return;
  try {
    localStorage.setItem(REPLAY_KEY, JSON.stringify(validateSavedRecord({ version: 1, recipe, fingerprints: report.fingerprints }, context.sampleRate)));
    status.textContent = 'Passed scene saved. Use browser Reload (Ctrl+R), then run the grouped batch to verify replay.';
  } catch (error) {
    status.textContent = "Could not save review: " + String(error);
  }
});
document.querySelector("#download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "integrated-audio-review.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
});
bootstrap();
