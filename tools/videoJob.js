// Draws one render's video in a process of its own (so several renders draw
// in parallel): node vite-node tools/videoJob.js <job.json>, where the job is
// { plan, ffmpeg, out, fps, width, seconds } and plan is what the page's
// timeline() returned plus roles and colors. Progress goes to the parent
// over IPC as { progress: 0..1 }.

import fs from 'node:fs';
import { createFrameRenderer, createAmbienceFrameRenderer } from './videoFrame.js';
import { startFfmpeg } from './ffmpeg.js';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const frames = job.plan.ambience
    ? createAmbienceFrameRenderer({ ambience: job.plan.ambience, colors: job.plan.colors, outWidth: job.width })
    : createFrameRenderer({ ...job.plan, outWidth: job.width });
const total = Math.round(job.seconds * job.fps);
const encoder = startFfmpeg(job.ffmpeg, [
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${frames.width}x${frames.height}`, '-r', String(job.fps), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'animation', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(job.fps), job.out,
]);

try {
    for (let frame = 0; frame < total; frame++) {
        await encoder.write(frames.frame(Math.min(job.seconds - 0.001, frame / job.fps)));
        if (frame % 300 === 0 && process.send) process.send({ progress: frame / total });
    }
    await encoder.end();
    if (process.send) process.send({ progress: 1 });
    process.exit(0);
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
