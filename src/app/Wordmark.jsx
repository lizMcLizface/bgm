// The page's name drawn in pixels, to match the pixel landscape: a small cloud that rains while music
// plays, then "calm" in the text colour and "bgm" in the accent. Static when paused (and for anyone who
// prefers less motion); the name stays in the heading's label for screen readers.
import React from 'react';

// 5 or 3 columns wide, nine rows: the x-height sits on rows 2-6, ascenders above, the g's tail below.
const GLYPHS = {
    c: ['', '', '.###.', '#...#', '#....', '#...#', '.###.'],
    a: ['', '', '.###.', '....#', '.####', '#...#', '.####'],
    l: ['##.', '.#.', '.#.', '.#.', '.#.', '.#.', '.##'],
    m: ['', '', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
    b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
    g: ['', '', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
};
const ROWS = 9, CLOUD = ['..###...', '.#####..', '########', '########', '.######.'];

const letters = (word, x0, className) => {
    const rects = [];
    let x = x0;
    for (const letter of word) {
        const rows = GLYPHS[letter];
        const width = Math.max(...rows.map((r) => r.length));
        rows.forEach((row, y) => [...row].forEach((cell, i) => { if (cell === '#') rects.push(<rect key={`${x}-${i}-${y}`} x={x + i} y={y} width="1" height="1" />); }));
        x += width + 1;
    }
    return { node: <g className={className}>{rects}</g>, end: x };
};

export default function Wordmark({ playing = false }) {
    const cloudWidth = 8, gap = 2;
    const calm = letters('calm', cloudWidth + gap, 'gen-wordmark-calm');
    const bgm = letters('bgm', calm.end + 1, 'gen-wordmark-bgm');
    return (
        <svg className={`gen-wordmark${playing ? ' is-playing' : ''}`} viewBox={`0 0 ${bgm.end - 1} ${ROWS}`} role="img" aria-label="calmbgm" focusable="false" shapeRendering="crispEdges">
            <g className="gen-wordmark-cloud" transform="translate(0 0)">
                {CLOUD.map((row, y) => [...row].map((cell, x) => cell === '#' && <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />))}
            </g>
            {[1, 3, 5].map((x, i) => <rect key={x} className="gen-wordmark-drop" style={{ animationDelay: `${i * -0.45}s` }} x={x} y="6" width="1" height="1" />)}
            {calm.node}
            {bgm.node}
        </svg>
    );
}
