// Renders piano notes off the main thread (pianoRenderPool.js): { id, sampleRate, freq, settings } -> { id, samples }.
import { renderPiano,pianoBodyNote } from './piano';
import {supportsRustPiano,supportsRustPianoBody,loadRustPiano} from './rustPiano';

self.onmessage = async({ data: { id, sampleRate, freq,bodyFrequency=freq, settings,renderer='legacy' } }) => {
    try {
        if(renderer==='rust'&&supportsRustPiano(settings)){
            const {renderer:r,version}=await loadRustPiano(),samples=r.renderNote(sampleRate,freq,settings),body=supportsRustPianoBody(settings)?r.renderBody(sampleRate,bodyFrequency,pianoBodyNote(sampleRate,bodyFrequency,settings,'rust').settings):null;
            self.postMessage({id,samples,body,renderer:'rust',version},[samples.buffer,...(body?[body.buffer]:[])]);return;
        }
        const samples = renderPiano(sampleRate, freq, settings);
        self.postMessage({ id, samples,renderer:'legacy' }, [samples.buffer]);
    } catch (error) {
        self.postMessage({ id, error: String(error?.message ?? error) });
    }
};
