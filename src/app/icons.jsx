// Small inline icons in the text colour (font glyphs like ⚄ and ✎ render
// inconsistently across systems).
import React from 'react';

const Svg = ({ children, size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {children}
    </svg>
);

// Transport: filled shapes, a little larger.
const solid = { fill: 'currentColor', stroke: 'none' };

export const PlayIcon = () => <Svg size={16}><path d="M4.5 2.5v11l9-5.5z" {...solid} /></Svg>;

export const PauseIcon = () => (
    <Svg size={16}>
        <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" {...solid} />
        <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" {...solid} />
    </Svg>
);

export const ToStartIcon = () => (
    <Svg size={16}>
        <path d="M3 3v10" strokeWidth="2" />
        <path d="M13.5 3v10L5 8z" {...solid} />
    </Svg>
);

export const BarBackIcon = () => <Svg size={16}><path d="M11 3.5v9L4.5 8z" {...solid} /></Svg>;
export const BarForwardIcon = () => <Svg size={16}><path d="M5 3.5v9L11.5 8z" {...solid} /></Svg>;

export const ProgressionBackIcon = () => (
    <Svg size={16}>
        <path d="M8 3.5v9L1.5 8z" {...solid} />
        <path d="M14.5 3.5v9L8 8z" {...solid} />
    </Svg>
);

export const ProgressionForwardIcon = () => (
    <Svg size={16}>
        <path d="M1.5 3.5v9L8 8z" {...solid} />
        <path d="M8 3.5v9L14.5 8z" {...solid} />
    </Svg>
);

export const LoopIcon = () => (
    <Svg size={16}>
        <path d="M2.5 9V7.5a3 3 0 0 1 3-3h8" />
        <path d="M11.5 2.5l2 2-2 2" />
        <path d="M13.5 7v1.5a3 3 0 0 1-3 3h-8" />
        <path d="M4.5 13.5l-2-2 2-2" />
    </Svg>
);

export const LinkIcon = () => (
    <Svg>
        <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2L7.6 4.1" />
        <path d="M9.5 6.5a3 3 0 0 0-4.2 0L3 8.8a3 3 0 0 0 4.2 4.2l1.1-1.1" />
    </Svg>
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

export const SparkIcon = () => (
    <Svg>
        <path d="M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4z" />
        <path d="M13 11.5v3M11.5 13h3" />
    </Svg>
);

export const SpeakerIcon = () => (
    <Svg size={17}>
        <path d="M2.5 6v4h2.5l3.5 3V3L5 6z" {...solid} />
        <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" />
    </Svg>
);

// Theme: a sun (light), a moon (dark), a half-filled disc (follow the system).
export const SunIcon = () => (
    <Svg size={17}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3" />
    </Svg>
);

export const MoonIcon = () => (
    <Svg size={17}>
        <path d="M13 9.6A5.4 5.4 0 0 1 6.4 3a5.4 5.4 0 1 0 6.6 6.6z" />
    </Svg>
);

export const AutoThemeIcon = () => (
    <Svg size={17}>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 2.5a5.5 5.5 0 0 0 0 11z" {...solid} />
    </Svg>
);
