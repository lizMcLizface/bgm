// Runtime selection is page-session state, separate from compositions and setup files.
export const ALL_AUDIO_QUERY = 'allAudio';
export const allAudioChoice = search => new URLSearchParams(search).get(ALL_AUDIO_QUERY) === 'rust' ? 'rust' : 'current';
export function allAudioUrl(value, backend, { resume = false } = {}) {
    const url = new URL(value);
    if (backend === 'rust') url.searchParams.set(ALL_AUDIO_QUERY, 'rust');
    else if (backend === 'current') url.searchParams.delete(ALL_AUDIO_QUERY);
    else throw Error('Unknown All audio backend');
    if (resume) url.searchParams.set('allResume', '1');
    return url;
}

export const currentAllRuntime = createHost => Object.freeze({ backend: 'current', createHost });

// Explicit gesture entry: prepared owners must be able to service startup and retirement.
export async function prepareAllRustRuntime(createHost) {
    const { audioContext } = await import('../../audio/context.js');
    await audioContext.resume();
    if (audioContext.state !== 'running') throw Error('Start the audio context before preparing Rust playback');
    const { prepareClockedOwnedHostEnvironment } = await import('../../modular-audio/clockedOwnedHostEnvironment.js');
    const { prepareClockedCoreLive } = await import('../../modular-audio/clockedCoreLive.js');
    const prepareEnvironment = async context => {
        const base = await prepareClockedOwnedHostEnvironment(context);
        const core = await prepareClockedCoreLive(context, { liveInputLeadSeconds: .128 });
        return Object.freeze({ ...base, createCoreBackend: core, prepareContext: prepareEnvironment });
    };
    const environment = await prepareEnvironment(audioContext);
    return Object.freeze({ backend: 'rust', environment,
        async createHost(scene, options = {}) {
            environment.checkRuntime();
            const host = createHost(scene, { ...options, deskBackend: 'owned', audioEnvironment: environment, percussion: 'wasm' });
            try {
                await host.wake();
                await host.g.setAudioEngine('wasm');
                const wake = host.wake.bind(host);
                host.wake = async () => { environment.checkRuntime(); await wake(); environment.checkRuntime(); };
                return host;
            } catch (error) {
                try { await host.dispose(); } catch (cleanupError) { error.cleanupError = cleanupError; }
                throw error;
            }
        },
    });
}

export function allRuntimeStatus(runtime, host) {
    if (!runtime) return { backend: 'rust', state: 'awaiting-gesture' };
    return {
        backend: runtime.backend, state: host ? 'ready' : 'preparing',
        environment: host?.g.audioEnvironment?.profile ?? 'existing',
        desk: host?.deskStatus?.() ?? null,
        sources: host ? Object.fromEntries(Object.entries(host.g.roles).map(([role, { instrument }]) => [role,
            instrument.sourceBackend ?? instrument.voice?.backend?.kind ?? instrument.player?.backend ?? instrument.sourceStatus?.()?.backend ??
            (instrument.lives?.length ? instrument.lives.every(live => live.node?.sourceBackend === 'owned-rust') ? 'owned-rust-classic' : 'existing-classic' : instrument.constructor.name),
        ])) : {},
        boundaries: runtime.environment?.boundaries ?? null,
    };
}
