vi.mock('../../audio/context', () => ({ audioContext: { currentTime: 0, state: 'running' } }));

import Transport from './transport';

// A fake audio clock the test moves by hand.
const makeContext = () => ({ currentTime: 0, state: 'running' });

function setHidden(hidden) {
    Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
}

afterEach(() => setHidden(false));

test('hiding a running page fills its background window before another timer wake', () => {
    const AC = makeContext(), t = new Transport({ context: AC, bpm: 120 });
    const heard = [];
    t.onBeat(e => heard.push(e));
    t.start();
    expect(heard.at(-1).time).toBeLessThan(0.4);
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(heard.at(-1).time).toBeGreaterThan(9);
    expect(t.nextBeatTime).toBeGreaterThanOrEqual(10);
    t.stop();
});

test('diagnostics distinguish delayed timer wakes and timeline recovery with bounded history', () => {
    const AC = makeContext(), t = new Transport({ context: AC, bpm: 120 });
    t.nextBeatTime = 0.1; t.beat = 0; t.tick();
    AC.currentTime = 2; t.tick();
    expect(t.diagnostics.maxTickGap).toBe(2);
    expect(t.diagnostics.recoveries).toBe(1);
    expect(t.diagnostics.recent.map(e => e.type)).toEqual(['wake-gap', 'rebase']);
    for (let i = 0; i < 50; i++) { AC.currentTime += 2; t.tick(); }
    expect(t.diagnostics.recent).toHaveLength(32);
    expect(t.diagnostics.nextBeatInSeconds).toBeGreaterThanOrEqual(0.4);
    t.resetDiagnostics();
    expect(t.diagnostics.recoveries).toBe(0);
    expect(t.diagnostics.recent).toEqual([]);
});

test('diagnostics show when the scheduling budget prevents filling the target window', () => {
    const AC = makeContext(), t = new Transport({ context: AC, bpm: 120 });
    let ms = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => ms);
    try {
        t.onBeat(() => { ms += 30; });
        setHidden(true); t.nextBeatTime = 0.1; t.beat = 0; t.tick();
        expect(t.diagnostics.budgetHits).toBe(1);
        expect(t.diagnostics.maxTickMs).toBe(30);
        expect(t.diagnostics.recent.at(-1)).toMatchObject({ type: 'budget', target: 10 });
        expect(t.diagnostics.nextBeatInSeconds).toBeLessThan(t.lookahead);
    } finally { clock.mockRestore(); }
});

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

describe('after the page was frozen', () => {
    const beatsOf = (t) => {
        const heard = [];
        t.onBeat((e) => heard.push(e));
        return heard;
    };

    test('the beats it missed are not played back as a burst: it picks up from where it was, from now', () => {
        const AC = makeContext();
        const t = new Transport({ context: AC, bpm: 120 });
        const heard = beatsOf(t);
        t.start(8);
        AC.currentTime = 0.4;
        t.tick();
        const before = heard.length;
        const lastBeat = heard[heard.length - 1].beat;
        AC.currentTime = 60; // frozen for a minute
        t.tick();
        const fresh = heard.slice(before);
        expect(fresh.length).toBeGreaterThan(0);
        fresh.forEach((e) => expect(e.time).toBeGreaterThanOrEqual(60));
        // the next beat is the one after the last played, not 120 beats on
        expect(fresh[0].beat).toBe(lastBeat + 1);
        // and they are evenly spaced, none stacked up
        fresh.slice(1).forEach((e, i) => expect(e.time - fresh[i].time).toBeCloseTo(0.5, 5));
    });

    test('a small delay is not a freeze: the timing is kept', () => {
        const AC = makeContext();
        const t = new Transport({ context: AC, bpm: 120 });
        const heard = beatsOf(t);
        t.start(0);
        const first = heard[0].time;
        AC.currentTime = 0.2;
        t.tick();
        expect(heard[1].time - first).toBeCloseTo(0.5, 5);
    });

    test('back on screen, a suspended context is asked to resume', () => {
        const AC = makeContext();
        AC.resume = vi.fn(() => Promise.resolve());
        const t = new Transport({ context: AC });
        t.start(0);
        AC.state = 'interrupted';
        setHidden(false);
        document.dispatchEvent(new Event('visibilitychange'));
        expect(AC.resume).toHaveBeenCalled();
        t.stop();
    });
});
