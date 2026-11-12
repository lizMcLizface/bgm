// @vitest-environment node
import{it}from'vitest';import{checkInstrumentDistortionLiveKernel}from'../../tools/checkInstrumentDistortionLiveKernel.mjs';import{checkInstrumentDistortionLiveHandles}from'../../tools/checkInstrumentDistortionLiveHandles.mjs';import{checkInstrumentDistortionLivePreparer}from'../../tools/checkInstrumentDistortionLivePreparer.mjs';import{checkInstrumentDistortionLiveProcessor}from'../../tools/checkInstrumentDistortionLiveProcessor.mjs';import{checkInstrumentDistortionLiveFacade}from'../../tools/checkInstrumentDistortionLiveFacade.mjs';
it('keeps full streaming DSP word-exact against accepted captured kernel across6rates/2layouts and40generation resource cycles',checkInstrumentDistortionLiveKernel,15000);
it('pins opaque ownerhandles through real applicationACK and refuses whole-patch capacity before mutation',checkInstrumentDistortionLiveHandles,15000);
it('prepares40literal resources in an actual dedicated Rust worker with bounded requests and positive free/termination',checkInstrumentDistortionLivePreparer,15000);
it('preserves connectedzeroDC and nonzero falling drain with fresh OFFACK/terminal/resource/refusal contracts',checkInstrumentDistortionLiveProcessor,15000);
it('composes actualRustWorker→READY→processor installACK with constructorhistory and aggregate Source/Worker cleanup',checkInstrumentDistortionLiveFacade,15000);
