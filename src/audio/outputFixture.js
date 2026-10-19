// Same low-level, seamless PCM fixture for every output path. No synth imports.
export function outputFixture(rate = 48000, seconds = 8) {
    if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || !Number.isFinite(seconds) || seconds <= 0 || seconds > 16) throw Error('Invalid output fixture.');
    const channels = [new Float32Array(Math.round(rate * seconds)), new Float32Array(Math.round(rate * seconds))];
    const notes = [220, 261.625565, 293.664768, 329.627557];
    for (let i = 0; i < channels[0].length; i++) {
        const t = i / rate, local = t % 2, hz = notes[Math.floor(t / 2) % notes.length];
        const envelope = .055 * Math.sin(Math.PI * local / 2) ** 2;
        for (let c = 0; c < 2; c++) {
            const phase = 2 * Math.PI * hz * local * (c ? 1.001 : 1);
            channels[c][i] = envelope * (Math.sin(phase) + .15 * Math.sin(phase * 2)) + .012 * Math.sin(2 * Math.PI * 110 * t);
        }
    }
    return { rate, channels };
}
export function outputWav({ rate, channels }) {
    const frames = channels[0].length, bytes = new ArrayBuffer(44 + frames * 4), view = new DataView(bytes);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true);
    view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * 4, true);
    for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) view.setInt16(44 + i * 4 + c * 2, Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), true);
    return bytes;
}
