// Small inline icons in the text colour (font glyphs like ⚄ and ✎ render
// inconsistently across systems).
import React from 'react';

const Svg = ({ children }) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {children}
    </svg>
);

export const DiceIcon = () => (
    <Svg>
        <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="3" />
        {[[5, 5], [11, 5], [8, 8], [5, 11], [11, 11]].map(([cx, cy]) => (
            <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="1.1" fill="currentColor" stroke="none" />
        ))}
    </Svg>
);

export const PencilIcon = () => (
    <Svg>
        <path d="M10.5 2.5l3 3L5.5 13.5H2.5v-3z" />
        <path d="M9 4l3 3" />
    </Svg>
);
