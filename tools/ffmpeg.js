// ffmpeg helpers shared by the renderer (render.js) and its video worker (videoJob.js).

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

export function findFfmpeg(given) {
    const ffmpeg = given || process.env.FFMPEG || 'ffmpeg';
    const probe = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' });
    if (probe.error || probe.status !== 0) throw new Error('ffmpeg not found: install it or pass --ffmpeg <path>');
    return ffmpeg;
}

/** An ffmpeg process whose stdin takes buffers, with back-pressure; `done` settles when it exits. */
export function startFfmpeg(ffmpeg, args) {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'ignore', 'inherit'] });
    const done = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
        child.stdin.on('error', () => {}); // surfaces as the exit code
    });
    done.catch(() => {}); // (reported where it is awaited)
    return {
        async write(buffer) {
            if (!child.stdin.write(buffer)) await once(child.stdin, 'drain');
        },
        async end() {
            child.stdin.end();
            await done;
        },
        done,
        kill: () => child.kill(),
    };
}
