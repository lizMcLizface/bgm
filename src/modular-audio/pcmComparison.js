// Existing core/FM denormal::flush() runs at render boundaries. Cross-cadence
// diagnostics retain raw differences; primary equality uses matching cadences.
export const F32_MIN_NORMAL=2**-126;
export const CROSS_CADENCE_POLICY='Primary check: exact raw sample values against the original serial graph at the selected block cadence. A separate fixed-1024-frame reference retains all cross-cadence differences, including subnormal boundary flushing and propagated mix residuals. No amplitude tolerance or DSP/golden change.';
export const subnormalPair=(a,b)=>Math.abs(a)<F32_MIN_NORMAL&&Math.abs(b)<F32_MIN_NORMAL;
