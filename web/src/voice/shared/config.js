export const SpeechRecognitionClass =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const SPEECH_LANG = import.meta.env.VITE_SPEECH_LANG ?? "en-US";

// Opera's Chromium has no speech service: go straight to the on-device model.
export const IS_OPERA = /OPR\//.test(navigator.userAgent);
export const CAN_WHISPER =
  !!(window.AudioContext || window.webkitAudioContext) &&
  !!navigator.mediaDevices?.getUserMedia;
export const BROWSER_SPEECH_OK = !!SpeechRecognitionClass && !IS_OPERA;

// English-only, quantized (~40 MB, cached after first use).
export const WHISPER_MODEL = "onnx-community/whisper-tiny.en";
// Pinned to an exact Hub commit, so the browser model cannot change silently.
export const WHISPER_REVISION = "794207fec2761281fe63a23a94b7e9f53a4efbc1";

export const WHISPER_RATE = 16000; // the sample rate the model wants
export const LIVE_FIRST_S = 2.2; // first live pass, in seconds of audio
export const LIVE_CHUNK_S = 3.5; // audio per later live pass
export const LIVE_OVERLAP_S = 0.8; // overlap with the previous pass
export const MAX_RECORD_S = 60; // auto-stop limit
export const SILENT_PEAK = 0.006; // below this peak: silence
