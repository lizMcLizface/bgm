//! Original sampled curve evaluated at its two literal cells, never continuous x.
#[cfg(feature="basis-preparation")]mod preparation;
#[cfg(not(feature="basis-preparation"))]mod engine;
#[cfg(feature="allocation-audit")]mod allocation;
