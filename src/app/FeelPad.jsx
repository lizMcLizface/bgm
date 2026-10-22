// The feel pad (settings.feel, composition/feel.js): one point in a diamond, as on a vector synth's
// joystick - calmer to the left, busier to the right, brighter up, darker down; the centre is the
// preset as made. Dragging commits now and then (each change re-plans the bars ahead), and once
// more on release; double-click or Centre goes back to the middle. Arrow keys move it too.
import React, { useEffect, useRef, useState } from 'react';

const COMMIT_MS = 300;
const clampDiamond = (busy, bright) => {
    const over = Math.abs(busy) + Math.abs(bright);
    return over > 1 ? [busy / over, bright / over] : [busy, bright];
};
const round = (v) => Math.round(v * 20) / 20;
const describe = (busy, bright) => {
    const part = (v, minus, plus) => (Math.abs(v) < 0.05 ? null : `${v > 0 ? plus : minus} ${Math.round(Math.abs(v) * 100)}%`);
    return [part(busy, 'Calmer', 'Busier'), part(bright, 'Darker', 'Brighter')].filter(Boolean).join(' · ') || 'As the preset is made';
};

export default function FeelPad({ feel, onChange }) {
    const svg = useRef(null), timer = useRef(null), pending = useRef(null);
    const [point, setPoint] = useState([feel?.busy ?? 0, feel?.bright ?? 0]);
    useEffect(() => { if (!pending.current) setPoint([feel?.busy ?? 0, feel?.bright ?? 0]); }, [feel?.busy, feel?.bright]);
    const commit = (p) => {
        pending.current = null;
        clearTimeout(timer.current);
        timer.current = null;
        onChange({ busy: round(p[0]), bright: round(p[1]) });
    };
    const moveTo = (p, now = false) => {
        setPoint(p);
        pending.current = p;
        if (now) commit(p);
        else if (!timer.current) timer.current = setTimeout(() => pending.current && commit(pending.current), COMMIT_MS);
    };
    const fromPointer = (e) => {
        const box = svg.current.getBoundingClientRect();
        return clampDiamond(((e.clientX - box.left) / box.width) * 2 - 1, 1 - ((e.clientY - box.top) / box.height) * 2);
    };
    const key = (e) => {
        const step = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
        if (!step) return;
        e.preventDefault();
        moveTo(clampDiamond(point[0] + step[0], point[1] + step[1]), true);
    };
    useEffect(() => () => clearTimeout(timer.current), []);
    const [x, y] = [50 + point[0] * 50, 50 - point[1] * 50];
    return (
        <div className="gen-feel">
            <svg ref={svg} viewBox="-8 -8 116 116" className="gen-feel-pad" role="application" tabIndex={0}
                aria-label={`Feel: ${describe(...point)}. Arrow keys move it.`} onKeyDown={key}
                onPointerDown={(e) => { svg.current.setPointerCapture(e.pointerId); moveTo(fromPointer(e)); }}
                onPointerMove={(e) => e.buttons && moveTo(fromPointer(e))}
                onPointerUp={(e) => moveTo(fromPointer(e), true)} onDoubleClick={() => moveTo([0, 0], true)}>
                <polygon points="50,0 100,50 50,100 0,50" className="gen-feel-diamond" />
                <polygon points="50,25 75,50 50,75 25,50" className="gen-feel-inner" />
                <line x1="0" y1="50" x2="100" y2="50" className="gen-feel-axis" /><line x1="50" y1="0" x2="50" y2="100" className="gen-feel-axis" />
                <text x="-2" y="47" textAnchor="start" className="gen-feel-corner">Calmer</text>
                <text x="102" y="47" textAnchor="end" className="gen-feel-corner">Busier</text>
                <text x="56" y="8" className="gen-feel-corner">Brighter</text>
                <text x="56" y="96" className="gen-feel-corner">Darker</text>
                <line x1="50" y1="50" x2={x} y2={y} className="gen-feel-arm" />
                <circle cx={x} cy={y} r="5" className="gen-feel-joy" />
            </svg>
            <div className="gen-feel-text">
                <strong>{describe(...point)}</strong>
                <p>Move the point to make the music calmer or busier, darker or brighter, on top of the preset. Changes take effect over the next bars.</p>
                <button type="button" disabled={!point[0] && !point[1]} onClick={() => moveTo([0, 0], true)}>Centre</button>
            </div>
        </div>
    );
}
