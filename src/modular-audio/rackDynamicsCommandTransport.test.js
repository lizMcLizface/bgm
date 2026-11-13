// @vitest-environment node
import { it, expect } from 'vitest';
import { RackDynamicsCommandReader, RackDynamicsCommandWriter } from './rackDynamicsCommandTransport.js';
import { RACK_TARGET_SEQUENCE_MAX } from './rackDynamicsTargetTransport.js';

function fixture() {
    const messages = [], context = { sampleRate: 48000, currentTime: 512 / 48000 };
    const writer = new RackDynamicsCommandWriter({ postMessage: m => messages.push(m) }, context), reader = new RackDynamicsCommandReader();
    return { messages, context, writer, reader, deliver() { for (const m of messages.splice(0)) reader.receive(m); } };
}
it('keeps lane order, initial flags, authored frames and Float32 payloads through delayed delivery', () => {
    const f = fixture();
    f.writer.post([5, -0], { initial: true }); f.context.currentTime = 640 / 48000; f.writer.post([0, -37.123]);
    expect(f.reader.read({}, 768)).toBe(0); f.deliver();
    expect(f.reader.read({}, 512)).toBe(1); expect(Object.is(f.reader.values[1], -0)).toBe(true);
    expect(f.reader.initials[0]).toBe(1); expect(f.reader.frames[0]).toBe(512);
    expect(f.reader.read({}, 768)).toBe(1); expect(f.reader.values[0]).toBe(0);
    expect(f.reader.values[1]).toBe(Math.fround(-37.123)); expect(f.reader.frames[0]).toBe(640);
    f.writer.acknowledge(f.reader.sequence); expect(f.writer.observedSequence).toBe(2);
});
it('retains the 32-command unobserved bound and whole-patch preflight without overwriting', () => {
    const f = fixture();
    for (let i = 0; i < 30; i++) f.writer.post([0, -i]);
    expect(() => f.writer.preflight(3, f.context.currentTime)).toThrow(/capacity/);
    expect(f.messages).toHaveLength(30);
    f.writer.post([0, -30]); f.writer.post([0, -31]);
    expect(() => f.writer.post([0, -32])).toThrow(/capacity/); f.deliver();
    expect(f.reader.read({}, 512)).toBe(32); f.writer.acknowledge(32);
    expect(() => f.writer.post([0, -32])).toThrow(/same-quantum/);
    f.context.currentTime = 640 / 48000; f.writer.post([0, -32]); f.deliver();
    expect(f.reader.read({}, 640)).toBe(1); expect(f.reader.sequence).toBe(33);
});
it('rejects malformed, skipped, reversed and overflowing commands before changing the queue', () => {
    const f = fixture(); f.writer.post([0, -30]); const valid = f.messages[0];
    for (const patch of [{ sequence: 2 }, { frame: 513 }, { value: NaN }, { lane: .5 }, { initial: 1 }]) {
        expect(() => f.reader.receive({ ...valid, ...patch })).toThrow(/Invalid/); expect(f.reader.receivedSequence).toBe(0);
    }
    f.deliver(); expect(() => f.reader.receive({ ...valid, sequence: 2, frame: 384 })).toThrow(/Invalid/);
    for (let sequence = 2; sequence <= 32; sequence++) f.reader.receive({ ...valid, sequence });
    expect(() => f.reader.receive({ ...valid, sequence: 33 })).toThrow(/overflowing/);
    expect(f.reader.read({}, 512)).toBe(32);
});
it('rejects noncanonical times, backwards edits, exhaustion and invalid ACKs without publication', () => {
    const f = fixture(); expect(() => f.writer.post([0, -20], { seconds: .1 })).toThrow(/canonical/);
    f.writer.post([0, -20]); expect(() => f.writer.post([0, -21], { seconds: 384 / 48000 })).toThrow(/backwards/);
    expect(() => f.writer.acknowledge(2)).toThrow(/watermark/);
    f.writer.sequence = f.writer.observedSequence = RACK_TARGET_SEQUENCE_MAX;
    expect(() => f.writer.post([0, -21])).toThrow(/exhausted/); expect(f.messages).toHaveLength(1);
});
it('does not advance a writer whose MessagePort publication throws', () => {
    const writer = new RackDynamicsCommandWriter({ postMessage() { throw Error('closed'); } }, { sampleRate: 48000, currentTime: 0 });
    expect(() => writer.post([0, -20])).toThrow('closed'); expect(writer.sequence).toBe(0);
});
