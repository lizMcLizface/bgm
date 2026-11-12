/** Full nine-controller admission is narrower than the standalone Rust leaves.
 * At192k the unchanged complete cohort has not completed its fixed observation
 * window; the three-controller and Native controls do not certify that cohort. */
export const GENERATOR_MASTER_CAPTURE_MAX_RATE=96000;
export function assertGeneratorMasterRate(context){
 const rate=context?.sampleRate;
 if(!Number.isInteger(rate)||rate<8000||rate>GENERATOR_MASTER_CAPTURE_MAX_RATE)throw Object.assign(Error('The complete prepared Main control profile is currently admitted only from 8 to 96 kHz; the 192 kHz nine-controller capture remains unverified'),{code:'GENERATOR_MASTER_SAMPLE_RATE_UNVERIFIED'});
 return rate;
}
