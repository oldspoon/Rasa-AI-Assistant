// AudioWorklet keeps capture off the main thread. ScriptProcessor is the fallback.
const CAPTURE_WORKLET_SOURCE = `
class DictationCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(2048);
    this._n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i += 1) {
        this._buf[this._n++] = ch[i];
        if (this._n === this._buf.length) {
          this.port.postMessage(this._buf.slice(0));
          this._n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("dictation-capture", DictationCapture);
`;

let captureWorkletUrl = null;
function getCaptureWorkletUrl() {
  if (!captureWorkletUrl) {
    captureWorkletUrl = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET_SOURCE], { type: "application/javascript" })
    );
  }
  return captureWorkletUrl;
}

// Taps raw microphone audio, as documented on MDN:
//   AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
//   ScriptProcessorNode (deprecated, fallback only): https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode
// Returns a function that detaches the tap.
export async function attachPcmTap(ctx, sourceNode, onBlock) {
  // Muted gain: pulls audio through, never played.
  const silent = ctx.createGain();
  silent.gain.value = 0;
  if (ctx.audioWorklet) {
    try {
      await ctx.audioWorklet.addModule(getCaptureWorkletUrl());
      const node = new AudioWorkletNode(ctx, "dictation-capture");
      node.port.onmessage = (e) => onBlock(e.data);
      sourceNode.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
      return () => {
        node.port.onmessage = null;
        try {
          sourceNode.disconnect(node);
          node.disconnect(silent);
          silent.disconnect();
        } catch {
          /* already detached */
        }
      };
    } catch (err) {
      console.info(
        "[attendance-bot] AudioWorklet capture unavailable, using ScriptProcessor:",
        err
      );
    }
  }
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) =>
    onBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
  sourceNode.connect(node);
  node.connect(silent);
  silent.connect(ctx.destination);
  return () => {
    node.onaudioprocess = null;
    try {
      sourceNode.disconnect(node);
      node.disconnect(silent);
      silent.disconnect();
    } catch {
      /* already detached */
    }
  };
}

