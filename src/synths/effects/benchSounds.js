import {POLY} from '../diy/patches';

// Reuse factory and translated library sounds; only the desk's source changes.
export const BENCH_SOUNDS=['Starmap Void','Chip Bass','Bell Lead','Pitched Rain','Warm Organ','Neon Blues Lead','LFO Motion'].map(name=>POLY.presets.find(p=>p.name===name));
