vi.mock('../../audio/context', () => ({ audioContext: { currentTime: 0, state: 'running' } }));

import Transport from './transport';

// A fake audio clock the test moves by hand.
const makeContext = () => ({ currentTime: 0, state: 'running' });

function setHidden(hidden) {
    Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
}

afterEach(() => setHidden(false));

test('visible: the short window; hidden: at least 10 s', () => {
    const t = new Transport({ context: makeContext(), lookahead: 0.4 });
    expect(t.lookahead).toBe(0.4);
    setHidden(true);
    expect(t.lookahead).toBe(10);
});

test('a hidden page that is woken only every so often gets a window that covers the silence', () => {
    const AC = makeContext();
    const t = new Transport({ context: AC });
    t.nextBeatTime = 1e9; // (nothing to book: only the timing matters here)
    setHidden(true);
    t.tick();
    AC.currentTime = 0.05;
    t.tick();
    expect(t.lookahead).toBe(10); // ticking on time: no change
    AC.currentTime = 20.05; // the timer was not run for 20 s
    t.tick();
    expect(t.slowestGap).toBeCloseTo(20, 1);
    expect(t.lookahead).toBeCloseTo(42, 0);
    // never more than the cap
    AC.currentTime = 220.05;
    t.tick();
    expect(t.lookahead).toBe(45);
});

test('a slow tick on a visible page, or with the context suspended, teaches it nothing', () => {
    const AC = makeContext();
    const t = new Transport({ context: AC });
    t.nextBeatTime = 1e9;
    t.tick();
    AC.currentTime = 30;
    t.tick();
    expect(t.slowestGap).toBe(0);
    setHidden(true);
    AC.state = 'suspended';
    AC.currentTime = 60;
    t.tick();
    expect(t.slowestGap).toBe(0);
});

test('the slowest gap eases off, so one bad stretch does not keep the window wide for ever', () => {
    const AC = makeContext();
    const t = new Transport({ context: AC });
    t.nextBeatTime = 1e9;
    setHidden(true);
    t.tick();
    AC.currentTime = 10;
    t.tick();
    const first = t.slowestGap;
    for (let i = 1; i <= 2000; i++) {
        AC.currentTime = 10 + i * 0.05;
        t.tick();
    }
    expect(t.slowestGap).toBeLessThan(first);
});
