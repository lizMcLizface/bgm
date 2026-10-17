import React, { useEffect, useRef, useState } from 'react';
import { TOUR_STEPS, TOUR_KEY, LAST_STAGE } from './tourSteps';
import { readPref, writePref } from './prefs';

/** Whether the tour has been finished or skipped before. */
export const tourSeen = () => readPref(TOUR_KEY, false) === true;

const MARGIN = 12;
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The steps of the stages from..to whose part is on the page now.
export const availableSteps = (from, to) => TOUR_STEPS.filter((step) => step.stage >= from && step.stage <= to
    && (!step.hint || step.stage === to) && (!step.selector || document.querySelector(step.selector)
        || step.rulePage && document.querySelector('[data-tour="rulebook"]')));

const rectOf = (selector) => {
    const el = selector && document.querySelector(selector);
    if (!el) return null;
    const { left, top, width, height } = el.getBoundingClientRect();
    return { left, top, width, height };
};

// Where a card goes: under its part, else over it, else pinned to the
// bottom of the window (a part taller than the window).
function place(rect, card) {
    const width = Math.min(card.width, window.innerWidth - 2 * MARGIN);
    if (!rect) return { left: (window.innerWidth - width) / 2, top: Math.max(MARGIN, (window.innerHeight - card.height) / 3), width };
    const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - width - MARGIN);
    if (rect.top + rect.height + card.height + MARGIN * 2 < window.innerHeight) return { left, top: rect.top + rect.height + MARGIN, width };
    if (rect.top - card.height - MARGIN * 2 > 0) return { left, top: rect.top - card.height - MARGIN, width };
    return { left, top: window.innerHeight - card.height - MARGIN, width };
}

/**
 * The guided tour: frames the page's parts one at a time (tour.js) with a
 * card that says what each is and does, and a Next button. Every part is
 * framed faintly; hovering one shows what it is, clicking it jumps there.
 * Finishing or skipping remembers it in this browser (the ⚙ menu opens it
 * again).
 * @param {object} props
 * @param {function} props.onClose
 * @param {boolean} [props.reference] - quick reference: every part framed, hover to read, no steps, nothing remembered
 * @param {number} [props.fromStage] - the first stage of features the tour covers (stages: tourSteps.js)
 * @param {number} [props.toStage] - the last stage it covers
 * @param {function} [props.onUnlockAll] - called when the start prompt is dismissed ("I don't need your help")
 * @param {boolean} [props.prompt] - open on a start prompt first: the page dimmed behind a card that
 *   asks whether to take the tour, until it is answered (for the automatic first-visit opening;
 *   starting from it skips the welcome step, which the prompt says)
 */
const Tour = ({ onClose, reference = false, prompt = false, fromStage = 0, toStage = LAST_STAGE, onUnlockAll, onStep }) => {
    const [steps] = useState(() => availableSteps(fromStage, toStage));
    const [asking, setAsking] = useState(prompt && !reference);
    const [index, setIndex] = useState(0);
    const [hovered, setHovered] = useState(null);
    const [rects, setRects] = useState({});
    const [cardSize, setCardSize] = useState({ width: 340, height: 200 });
    const card = useRef(null);
    const next = useRef(null);
    const step = steps[index];
    const last = index === steps.length - 1;

    const finish = () => {
        if (!reference) writePref(TOUR_KEY, true);
        onClose();
    };
    // Dismissing the start prompt: no help wanted, so everything is available.
    const decline = () => {
        if (onUnlockAll) onUnlockAll();
        finish();
    };
    const go = (to) => setIndex(Math.min(steps.length - 1, Math.max(0, to)));
    // Starting from the prompt goes past the welcome step: the prompt said it.
    const begin = () => {
        setAsking(false);
        setIndex(Math.min(1, steps.length - 1));
    };
    const advance = () => (last ? finish() : go(index + 1));

    // Bring the step's part into view.
    useEffect(() => {
        if (reference || asking) return;
        onStep?.(step);
        let frame, attempts = 0;
        const scroll = () => {
            const el = step.selector && document.querySelector(step.selector);
            // Page preparation may need another React commit before its card exists.
            if (step.rulePage && !el && attempts++ < 12) { frame = requestAnimationFrame(scroll); return; }
            if (el) el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
            else window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
        };
        frame = requestAnimationFrame(scroll);
        if (next.current) next.current.focus({ preventScroll: true });
        return () => cancelAnimationFrame(frame);
    }, [step, reference, asking, onStep]);

    // Follow the parts while the page scrolls or resizes.
    useEffect(() => {
        let frame = 0;
        const measure = () => {
            const found = {};
            steps.forEach((s) => { if (s.selector) found[s.id] = rectOf(s.selector); });
            setRects((old) => (JSON.stringify(old) === JSON.stringify(found) ? old : found));
            if (card.current) {
                const { offsetWidth, offsetHeight } = card.current;
                setCardSize((old) => (old.width === offsetWidth && old.height === offsetHeight ? old : { width: offsetWidth, height: offsetHeight }));
            }
            frame = requestAnimationFrame(measure);
        };
        measure();
        return () => cancelAnimationFrame(frame);
    }, [steps]);

    useEffect(() => {
        const key = (e) => {
            if (e.key === 'Escape') (asking ? decline() : finish());
            else if (reference || asking) return;
            else if (e.key === 'ArrowRight') advance();
            else if (e.key === 'ArrowLeft') go(index - 1);
            else return;
            e.preventDefault();
        };
        document.addEventListener('keydown', key);
        return () => document.removeEventListener('keydown', key);
    });

    // (two steps can frame one part, at different stages: the later, fuller one is kept)
    const framed = steps.filter((s, i) => s.selector && rects[s.id] && rects[s.id].width > 0
        && (!reference || !steps.slice(i + 1).some((t) => t.selector === s.selector)));
    const hoverStep = hovered && (reference || hovered !== step.id) ? steps.find((s) => s.id === hovered) : null;
    const position = place(step.selector ? rects[step.id] : null, cardSize);
    const hoverPosition = hoverStep ? place(rects[hoverStep.id], { width: 300, height: 130 }) : null;

    if (asking) {
        return (
            <div className="gen-tour-intro" role="presentation" onClick={decline}>
                <div className="gen-tour-intro-card" role="dialog" aria-modal="true" aria-labelledby="gen-tour-intro-title" aria-describedby="gen-tour-intro-text"
                    onClick={(e) => e.stopPropagation()}>
                    <h2 id="gen-tour-intro-title">Welcome to bgm</h2>
                    <p id="gen-tour-intro-text">
                        Calm music that writes itself, with a fluid background that moves with the sound.
                        A short tour shows the basics; the rest of the page unlocks a step at a time, whenever you are ready.
                    </p>
                    <div className="gen-tour-intro-buttons">
                        <button type="button" ref={next} className="gen-tour-start" onClick={begin} autoFocus>Take the tour</button>
                        <button type="button" className="gen-tour-skip" onClick={decline}>I don't need help - show me everything</button>
                    </div>
                    <small>The ⚙ menu repeats it.</small>
                </div>
            </div>
        );
    }

    return (
        <div className="gen-tour" role="presentation">
            {framed.map((s) => {
                const rect = rects[s.id];
                const current = !reference && s.id === step.id;
                return (
                    <button
                        key={s.id}
                        type="button"
                        className={`gen-tour-frame${current ? ' is-current' : ''}${hovered === s.id ? ' is-hovered' : ''}`}
                        style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
                        aria-label={`${s.title}: ${current ? 'this step' : 'go to this step'}`}
                        tabIndex={-1}
                        onMouseEnter={() => setHovered(s.id)}
                        onMouseLeave={() => setHovered((h) => (h === s.id ? null : h))}
                        onClick={() => !reference && go(steps.indexOf(s))}
                    />
                );
            })}
            {hoverStep && (
                <div className="gen-tour-card is-hover" style={hoverPosition} aria-hidden="true">
                    <h3>{hoverStep.title}</h3>
                    <p>{hoverStep.text}</p>
                    {!reference && <small>Click to go to this step</small>}
                </div>
            )}
            {reference && (
                <div className="gen-tour-card gen-tour-reference" role="dialog" aria-label="Quick reference">
                    <span>Hover a framed part to see what it does.</span>
                    <button type="button" ref={next} onClick={finish}>Close</button>
                </div>
            )}
            {!reference && <div ref={card} className="gen-tour-card" style={position} role="dialog" aria-modal="false" aria-labelledby="gen-tour-title" aria-describedby="gen-tour-text">
                <small className="gen-tour-count">Step {index + 1} of {steps.length}</small>
                <h3 id="gen-tour-title">{step.title}</h3>
                <p id="gen-tour-text">{step.text}</p>
                <div className="gen-tour-buttons">
                    <button type="button" className="gen-tour-skip" onClick={finish}>{last ? 'Close' : 'Skip tour'}</button>
                    <span>
                        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>Back</button>
                        <button type="button" ref={next} className="gen-tour-next" onClick={advance}>
                            {last ? 'Done' : 'Next'}
                        </button>
                    </span>
                </div>
            </div>}
        </div>
    );
};

export default Tour;
