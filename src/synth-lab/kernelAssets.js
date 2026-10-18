import versions from './kernelVersions.json';
// Bind JS parameter layouts to their matching Wasm/worklet assets, including
// on static hosts whose public filenames otherwise keep the same cache URL.
export const kernelAsset=(kind,file)=>`${import.meta.env.BASE_URL}synth-lab/${file}?v=${versions[kind]}`;
