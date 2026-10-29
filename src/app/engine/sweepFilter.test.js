import { SweepFilter, SWEEP_OPEN } from './sweepFilter';

const param = (value) => ({ value, setTargetAtTime: vi.fn((v) => { param.last = v; }), setValueAtTime: vi.fn() });
const context = () => ({ currentTime: 1, createBiquadFilter: () => ({ type: '', frequency: param(0), Q: param(0), connect: vi.fn() }) });

test('a sweep filter starts wide open and glides to the values asked, then back', () => {
    const ctx = context(), f = new SweepFilter(ctx);
    expect(f.low.frequency.setValueAtTime).toHaveBeenCalledWith(SWEEP_OPEN.lowpass, 1);
    expect(f.high.frequency.setValueAtTime).toHaveBeenCalledWith(SWEEP_OPEN.highpass, 1);
    f.set({ lowpass: 800, highpass: 200, resonance: 6 }, 0.1);
    expect(f.low.frequency.setTargetAtTime).toHaveBeenCalledWith(800, 1, 0.1);
    expect(f.high.frequency.setTargetAtTime).toHaveBeenCalledWith(200, 1, 0.1);
    expect(f.low.Q.setTargetAtTime).toHaveBeenCalledWith(6, 1, 0.1);
    f.set({}, 0.05);
    expect(f.low.frequency.setTargetAtTime).toHaveBeenLastCalledWith(SWEEP_OPEN.lowpass, 1, 0.05);
    expect(f.input).toBe(f.high);
    expect(f.output).toBe(f.low);
});
