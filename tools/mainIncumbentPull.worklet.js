class IncumbentPull extends AudioWorkletProcessor {
  constructor() {
    super();
    this.calls = 0;
    this.quanta = 0;
    this.channels = 0;
    this.peak = 0;
    this.closed = false;
    this.port.onmessage = ({ data: d }) => {
      if (d.type === "stats") this.port.postMessage({ type: "stats", request: d.request, calls: this.calls, inputQuanta: this.quanta, inputChannels: this.channels, inputPeak: this.peak });
      else if (d.type === "dispose") {
        this.closed = true;
        this.port.postMessage({ type: "disposed", version: 1, released: true, clean: true });
      }
    };
    this.port.postMessage({ type: "ready", version: 1 });
  }
  process(inputs, outputs) {
    for (const bus of outputs) for (const c of bus) c.fill(0);
    if (this.closed) return false;
    this.calls++;
    const input = inputs[0] ?? [];
    if (input.length) {
      if (input.length !== 2) throw Error("Incumbent Core/FM output must actually be stereo");
      this.quanta++;
      this.channels = input.length;
    }
    for (const c of input) for (const v of c) {
      if (!Number.isFinite(v)) throw Error("Nonfinite incumbent source");
      this.peak = Math.max(this.peak, Math.abs(v));
    }
    return true;
  }
}
registerProcessor("main-incumbent-control-pull-review-v1", IncumbentPull);
