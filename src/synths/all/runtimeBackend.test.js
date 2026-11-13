import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: { state: 'suspended', resume: vi.fn() }, base: null,
    prepare: vi.fn(), core: vi.fn(), events: [] }));
vi.mock('../../audio/context.js', () => ({ audioContext: mocks.context }));
vi.mock('../../modular-audio/clockedOwnedHostEnvironment.js', () => ({ prepareClockedOwnedHostEnvironment: context => mocks.prepare(context) }));
vi.mock('../../modular-audio/clockedCoreLive.js', () => ({ prepareClockedCoreLive: (...args) => mocks.core(...args) }));
import { allAudioChoice, allAudioUrl, currentAllRuntime, prepareAllRustRuntime } from './runtimeBackend.js';

beforeEach(() => {
    mocks.events = []; mocks.context.state = 'suspended';
    mocks.context.resume.mockReset().mockImplementation(async () => { mocks.events.push('resume'); mocks.context.state = 'running'; });
    mocks.base = { profile: 'owned-active-host-v1', checkRuntime: vi.fn(), context: mocks.context };
    mocks.prepare.mockReset().mockImplementation(async () => { mocks.events.push('prepare'); return mocks.base; });
    mocks.core.mockReset().mockResolvedValue(vi.fn());
});
it('keeps the default and song query intact; a Rust choice is explicit and page scoped', () => {
    expect(allAudioChoice('?preset=rain&engine=wasm')).toBe('current');
    expect(allAudioChoice('?allAudio=unknown')).toBe('current');
    const url = allAudioUrl('https://example.test/synths/all/?preset=rain#song', 'rust');
    expect(allAudioChoice(url.search)).toBe('rust');
    expect(url.searchParams.get('preset')).toBe('rain'); expect(url.hash).toBe('#song');
    expect(allAudioUrl(url, 'current').searchParams.has('allAudio')).toBe(false);
    const create = vi.fn(); const current = currentAllRuntime(create);
    current.createHost('scene', { seed: 7 }); expect(create).toHaveBeenCalledWith('scene', { seed: 7 });
    expect(mocks.prepare).not.toHaveBeenCalled();
});
it('prepares once after resume and reuses the selected factories for every host reconstruction', async () => {
    const host = () => ({ wake: vi.fn(async () => {}), dispose: vi.fn(async () => {}), g: { setAudioEngine: vi.fn(async () => {}) } });
    const create = vi.fn(host), runtime = await prepareAllRustRuntime(create);
    expect(mocks.events).toEqual(['resume', 'prepare']);
    expect(mocks.core).toHaveBeenCalledWith(mocks.context, { liveInputLeadSeconds: .128 });
    const first = await runtime.createHost('first', { seed: 1 }); await runtime.createHost('successor', { settings: { seed: 2 } });
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    for (const [, options] of create.mock.calls) expect(options).toMatchObject({ deskBackend: 'owned', percussion: 'wasm', audioEnvironment: runtime.environment });
    expect(first.g.setAudioEngine).toHaveBeenCalledWith('wasm');
    mocks.base.checkRuntime.mockImplementation(() => { throw Error('Clock retired'); });
    await expect(first.wake()).rejects.toThrow('Clock retired');
    await expect(runtime.createHost('refused')).rejects.toThrow('Clock retired');
    expect(create).toHaveBeenCalledTimes(2);
});
it('retires a partial host on engine failure and preserves cleanup failure details', async () => {
    const failure = Error('Source unavailable'), cleanup = Error('ACK missing');
    const host = { wake: vi.fn(async () => {}), g: { setAudioEngine: vi.fn(async () => { throw failure; }) }, dispose: vi.fn(async () => { throw cleanup; }) };
    const runtime = await prepareAllRustRuntime(() => host);
    await expect(runtime.createHost('scene')).rejects.toBe(failure);
    expect(host.dispose).toHaveBeenCalledOnce(); expect(failure.cleanupError).toBe(cleanup);
});
