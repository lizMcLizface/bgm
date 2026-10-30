// The quest card (the next thing to try), the messages that pop up as things are done, and the trophy
// window with every level's quests and the achievements. Fed by useQuests.js.
//
// The card sits at the top right, just under the header, so it is close to where the eye already is.
// Achievements pop up at the bottom right, as in games.

import React, { useEffect, useRef, useState } from 'react';
import { QUESTS, ACHIEVEMENTS } from './questDefs';
import { taskStatus } from './questState';
import { STAGES } from '../tourSteps';
import { readPref, writePref } from '../prefs';
import './quests.css';

const COLLAPSED_KEY = 'bgm-quest-collapsed';
const pad = (n) => String(n).padStart(2, '0');
const hours = (ms) => {
    const m = Math.floor(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;
};

const GLOW = 'gen-quest-glow';
let glowing = null;

/** Light up the part of the page a quest task is about (while its row is hovered or focused), or put it out. */
export function glow(selector, on = true) {
    if (glowing) { glowing.classList.remove(GLOW); glowing = null; }
    const el = on && selector && document.querySelector(selector);
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    if (bottom < 0 || top > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add(GLOW);
    glowing = el;
}

const Message = ({ message, onDismiss, onShowLevel }) => {
    const lasting = message.kind === 'level';
    // The timer must not restart when the page re-renders (the listening clock does, every few seconds).
    const dismiss = useRef(onDismiss);
    dismiss.current = onDismiss;
    useEffect(() => {
        if (lasting) return undefined;
        const timer = setTimeout(() => dismiss.current(), message.kind === 'achievement' ? 7000 : 3500);
        return () => clearTimeout(timer);
    }, [lasting, message.kind]);
    if (message.kind === 'level') {
        return (
            <div className="gen-quest-message is-level" role="status">
                <strong>Level up!</strong>
                <span>Unlocked: {STAGES[message.stage]?.name}</span>
                <span className="gen-quest-actions">
                    <button type="button" onClick={() => { onShowLevel(message.stage); onDismiss(); }}>Show me</button>
                    <button type="button" onClick={onDismiss}>Later</button>
                </span>
            </div>
        );
    }
    if (message.kind === 'achievement') {
        return (
            <div className="gen-quest-message is-achievement" role="status">
                <strong>★ Achievement: {message.title}</strong>
                <span>{message.text}</span>
            </div>
        );
    }
    return (
        <div className="gen-quest-message" role="status">
            <strong>✓ Quest complete</strong>
            <span>{message.title}</span>
        </div>
    );
};

const QuestLog = ({ quests, stage, onClose }) => {
    const { state } = quests;
    const [confirming, setConfirming] = useState(false);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    const earned = ACHIEVEMENTS.filter((a) => a.id in state.awarded).length;
    return (
        <div className="gen-quest-log-backdrop" onClick={onClose}>
            <section className="gen-quest-log" role="dialog" aria-label="Quests and achievements" onClick={(e) => e.stopPropagation()}>
                <header>
                    <h2>Quests &amp; achievements</h2>
                    <button type="button" onClick={onClose} aria-label="Close">×</button>
                </header>
                <p className="gen-quest-stats">
                    Listened {hours(state.listenMs)} on {state.days.length} day{state.days.length === 1 ? '' : 's'} · {earned} of {ACHIEVEMENTS.length} achievements.
                    Saved in this browser only.
                </p>
                <h3>Levels</h3>
                <ol className="gen-quest-levels">
                    {STAGES.map((s, i) => (
                        <li key={s.id} className={i > stage ? 'is-locked' : ''}>
                            <span className="gen-quest-level-name">{i > stage ? '🔒 ' : ''}Level {i + 1}: {s.name}</span>
                            {i <= stage && (
                                <ul>
                                    {QUESTS.filter((q) => q.stage === i).map((q) => (
                                        <li key={q.id} className={q.id in state.done ? 'is-done' : q.id in state.skipped ? 'is-skipped' : ''}>
                                            <span aria-hidden="true">{q.id in state.done ? '✓' : q.id in state.skipped ? '–' : '○'}</span> {q.name}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ol>
                <h3>Achievements</h3>
                <ul className="gen-quest-achievements">
                    {ACHIEVEMENTS.map((a) => (
                        <li key={a.id} className={a.id in state.awarded ? 'is-earned' : ''}>
                            <strong>{a.id in state.awarded ? '★' : '☆'} {a.title}</strong>
                            <span>{a.text}</span>
                        </li>
                    ))}
                </ul>
                <footer>
                    <label><input type="checkbox" checked={!state.off} onChange={(e) => quests.setOff(!e.target.checked)} /> Show quest cards</label>
                    {confirming
                        ? <span>Forget all progress? <button type="button" onClick={() => { quests.reset(); setConfirming(false); }}>Yes, reset</button> <button type="button" onClick={() => setConfirming(false)}>No</button></span>
                        : <button type="button" onClick={() => setConfirming(true)}>Reset progress</button>}
                </footer>
            </section>
        </div>
    );
};

/**
 * @param {object} props
 * @param {object} props.quests - useQuests()
 * @param {number} props.stage
 * @param {boolean} [props.hidden] - nothing shows (a tour is open)
 * @param {function} props.onShowLevel - open what a level unlocked: (stage) => void
 * @param {boolean} [props.corner] - sit in the very corner of the window (the landscape view) instead of under the header
 */
export default function QuestWidget({ quests, stage, hidden = false, onShowLevel, corner = false }) {
    const [logOpen, setLogOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(() => readPref(COLLAPSED_KEY, false) === true);
    const { current, state, messages, progress } = quests;
    const collapse = (value) => { setCollapsed(value); writePref(COLLAPSED_KEY, value); };
    const root = useRef(null);
    useEffect(() => setHelpOpen(false), [current?.id]);

    // It floats over the page and moves nothing: in the very corner of the window in the landscape view,
    // otherwise just under the header, which scrolls away, so the top follows it.
    useEffect(() => {
        const place = () => {
            const header = document.querySelector('.gen-header');
            const bottom = header ? header.getBoundingClientRect().bottom : 0;
            root.current?.style.setProperty('--quest-top', corner ? '12px' : `${Math.max(8, Math.round(bottom) + 8)}px`);
        };
        place();
        window.addEventListener('scroll', place, { passive: true });
        window.addEventListener('resize', place);
        return () => { window.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
    });
    useEffect(() => () => glow(null, false), []);
    useEffect(() => glow(null, false), [current?.id, collapsed]);

    const status = current ? taskStatus(state, current) : [];
    // a level-up has buttons and stays by the card; quests done and achievements are toasts in the bottom right
    const beside = messages.filter((m) => m.kind === 'level').slice(-2);
    const trophies = messages.filter((m) => m.kind !== 'level').slice(-3);
    return (
        <>
            <aside className="gen-quest" ref={root} hidden={hidden && !logOpen} aria-label="Quests">
                {!hidden && !state.off && current && !collapsed && (
                    <div className="gen-quest-card">
                        <div className="gen-quest-head" onClick={() => collapse(true)} title="Click to fold the quest away">
                            <span>Level {stage + 1}: {STAGES[stage]?.name} · {progress[0]}/{progress[1]}</span>
                            <span>
                                <button type="button" className={helpOpen ? 'is-on' : ''} onClick={(e) => { e.stopPropagation(); setHelpOpen(!helpOpen); }} aria-pressed={helpOpen}
                                    aria-label="More help with this quest" title="More help">?</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); collapse(true); }} aria-label="Fold the quest away" title="Fold away">–</button>
                            </span>
                        </div>
                        <strong className="gen-quest-name" onClick={() => collapse(true)} title="Click to fold the quest away">{current.name}</strong>
                        <p>{current.text}</p>
                        <ul className="gen-quest-tasks">
                            {status.map(({ task, have, need, done }) => (
                                <li key={task.id} className={done ? 'is-done' : ''} tabIndex={0}
                                    onMouseEnter={() => glow(task.show)} onMouseLeave={() => glow(null, false)}
                                    onFocus={() => glow(task.show)} onBlur={() => glow(null, false)}>
                                    <span aria-hidden="true">{done ? '✓' : '○'}</span>
                                    <span>{task.label}</span>
                                    <span className="gen-quest-count">{have}/{need}</span>
                                </li>
                            ))}
                        </ul>
                        <small className="gen-quest-hint">Hover a task to see where it is.</small>
                        {helpOpen && <p className="gen-quest-help" role="note">{current.help}</p>}
                    </div>
                )}
                {collapsed && current && !state.off && !hidden && (
                    <button type="button" className="gen-quest-chip" onClick={() => collapse(false)} title="Show the quest">Quest: {current.name}</button>
                )}
                <div className="gen-quest-messages">
                    {beside.map((m) => (
                        <Message key={m.id} message={m} onDismiss={() => quests.dismiss(m.id)} onShowLevel={onShowLevel} />
                    ))}
                </div>
                {logOpen && <QuestLog quests={quests} stage={stage} onClose={() => setLogOpen(false)} />}
            </aside>
            {/* quest and achievement toasts pop up at the bottom right, as in games, above the star that lists them */}
            <div className="gen-quest-trophies">
                <div aria-live="polite" className="gen-quest-toasts">
                    {trophies.map((m) => <Message key={m.id} message={m} onDismiss={() => quests.dismiss(m.id)} onShowLevel={onShowLevel} />)}
                </div>
                <button type="button" className="gen-quest-chip" onClick={() => setLogOpen(true)}
                    title="Quests and achievements" aria-label="Quests and achievements">★</button>
            </div>
        </>
    );
}
