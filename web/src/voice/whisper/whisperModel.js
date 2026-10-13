import { WHISPER_MODEL, WHISPER_REVISION } from "../shared/config.js";

// Loaded on first use (lazy chunk), then kept in memory.
// Pipeline API: https://huggingface.co/docs/transformers.js/pipelines
// Input is mono Float32 at 16 kHz; see pcm.js.
let whisperAsrPromise = null;

export function loadWhisperModel(onProgress) {
  if (!whisperAsrPromise) {
    whisperAsrPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false; // fetch the model from the Hub
      return pipeline("automatic-speech-recognition", WHISPER_MODEL, {
        revision: WHISPER_REVISION,
        dtype: "q8",
        device: "wasm",
        progress_callback: (p) => {
          if (onProgress && p?.status === "progress" && typeof p.progress === "number") {
            onProgress(Math.round(p.progress));
          }
        },
      });
    })().catch((err) => {
      whisperAsrPromise = null; // allow a retry on the next tap
      throw err;
    });
  }
  return whisperAsrPromise;
}
