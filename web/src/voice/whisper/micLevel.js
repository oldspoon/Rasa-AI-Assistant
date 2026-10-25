import { peakOf } from "./pcm.js";

const SOUND_PEAK = 0.01; // above this peak the mic is delivering sound
const SILENT_AFTER_MS = 1500; // warn if nothing was heard by then
const POLL_MS = 300;

// Watches the mic level through an AnalyserNode (MDN: AnalyserNode.getFloatTimeDomainData).
// onSilent fires once if nothing is heard; onSound fires when sound arrives after that warning.
// Returns a function that stops the watcher.
export function watchMicLevel(ctx, source, { onSilent, onSound }) {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  const startedAt = Date.now();
  let heard = false;
  let warned = false;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    if (peakOf(buffer) > SOUND_PEAK) {
      if (warned) {
        warned = false;
        onSound();
      }
      heard = true;
    } else if (!heard && !warned && Date.now() - startedAt > SILENT_AFTER_MS) {
      warned = true;
      onSilent();
    }
  }, POLL_MS);

  return () => clearInterval(timer);
}
