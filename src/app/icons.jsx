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

// Two arrows chasing each other: the same notes, seen from another key.
// Back to how it was: an arrow curling counter-clockwise.
export const UndoIcon = () => (
    <Svg>
        <path d="M3.2 3.5v3.3h3.3" />
        <path d="M3.6 6.6A5.2 5.2 0 1 1 3 9.2" />
    </Svg>
);

export const RotateIcon = () => (
    <Svg>
        <path d="M13 6.5A5.5 5.5 0 0 0 3.2 5" />
        <path d="M3 2.2V5.3h3.1" />
        <path d="M3 9.5A5.5 5.5 0 0 0 12.8 11" />
        <path d="M13 13.8V10.7H9.9" />
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

// Music / Ambience parts: a note, and rolling waves.
export const MusicIcon = () => (
    <Svg size={16}>
        <path d="M6 12.5V3l7-1.5v9.5" />
        <circle cx="4.2" cy="12.5" r="1.8" {...solid} />
        <circle cx="11.2" cy="11" r="1.8" {...solid} />
    </Svg>
);

export const AmbienceIcon = () => (
    <Svg size={16}>
        <path d="M1.5 5.5c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4 0" />
        <path d="M1.5 9c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4 0" />
        <path d="M1.5 12.5c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4 0" />
    </Svg>
);

// The look menu: a painter's palette.
export const PaletteIcon = () => (
    <Svg size={17}>
        <path d="M8 1.8C4.3 1.8 1.8 4.4 1.8 7.8c0 3.3 2.6 6.4 5.6 6.4 1.2 0 1.6-.7 1.2-1.6-.5-1 .1-2 1.2-2h1.7c1.6 0 2.7-1 2.7-2.7C14.2 4.4 11.6 1.8 8 1.8z" />
        <circle cx="5" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="7.6" cy="4.8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="10.7" cy="5.8" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
);

// The timeline: a few notes on a roll.
export const TimelineIcon = () => (
    <Svg size={16}>
        <path d="M2.5 5h4M8.5 5h5M4.5 8h5M11 8h2.5M2.5 11h2.5M7 11h6.5" strokeWidth="2" />
    </Svg>
);

// The instruments beside the timeline: a column of named rows.
export const TracksIcon = () => (
    <Svg size={16}>
        <path d="M2.5 4h3M2.5 8h3M2.5 12h3M8 4h5.5M8 8h5.5M8 12h5.5" strokeWidth="2" />
    </Svg>
);

// Hide / show the interface: a chevron up (collapse) and down (expand), like a section's header.
export const ChevronUpIcon = () => <Svg size={16}><path d="M3.5 10l4.5-4.5 4.5 4.5" strokeWidth="2" /></Svg>;
export const ChevronDownIcon = () => <Svg size={16}><path d="M3.5 6l4.5 4.5L12.5 6" strokeWidth="2" /></Svg>;
// Previous / next preset.
export const ChevronLeftIcon = () => <Svg size={16}><path d="M10 3.5L5.5 8l4.5 4.5" strokeWidth="2" /></Svg>;
export const ChevronRightIcon = () => <Svg size={16}><path d="M6 3.5l4.5 4.5L6 12.5" strokeWidth="2" /></Svg>;

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

// The instruments whose patterns can be shown under the timeline.
export const PianoIcon = () => (
    <Svg size={16}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <path d="M8 9v4" />
        <path d="M5.5 4v4.5M10.5 4v4.5" strokeWidth="2.4" />
    </Svg>
);

export const GuitarIcon = () => (
    <Svg size={16}>
        <circle cx="4.8" cy="11.2" r="2.4" />
        <circle cx="7" cy="9" r="2" />
        <path d="M8.4 7.6L13 3M11.8 2l2.2 2.2" />
    </Svg>
);

export const BassIcon = () => (
    <Svg size={16}>
        <path d="M3 13c-1-1-1-3 .5-4l2.5-1.5L7.5 9l-1.5 2.5C5 13 4 13.5 3 13z" />
        <path d="M6.8 8.2L13.5 1.5M12 1h3M13 2.5l1.5 1.5" />
    </Svg>
);

export const CloseIcon = () => <Svg size={12}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeWidth="2" /></Svg>;

// The hero view: a sword, blade up and to the right, guard across it, grip and pommel below.
export const SwordIcon = () => (
    <Svg size={16}>
        <path d="M13.5 2.5L7 9" strokeWidth="2" />
        <path d="M5 7l4 4" />
        <path d="M7 9l-3.2 3.2" strokeWidth="2" />
        <circle cx="3" cy="13" r="1" />
    </Svg>
);
