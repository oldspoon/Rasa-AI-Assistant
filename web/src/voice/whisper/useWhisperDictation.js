import { useEffect, useRef, useState } from "react";
import {
  LIVE_CHUNK_S,
  LIVE_FIRST_S,
  LIVE_OVERLAP_S,
  MAX_RECORD_S,
  SILENT_PEAK,
  WHISPER_RATE,
} from "../shared/config.js";
import { attachPcmTap } from "./capture.js";
import { loadWhisperModel } from "./whisperModel.js";
import { isNoiseTranscript, mergeTranscript, scrubTranscript } from "../shared/transcript.js";
import { liftQuiet, peakOf, slice16k as sliceCapture, total16k as totalCapture } from "./pcm.js";
import { nextLiveWindow } from "./liveSchedule.js";
import { watchMicLevel } from "./micLevel.js";

// On-device dictation: the mic is captured as raw audio and transcribed with Whisper.
// Short live passes stream words into the box; a final pass replaces them when you stop.
export function useWhisperDictation({
  input,
  setInput,
  setListening,
  showSpeechHint,
  clearSpeechHint,
}) {
  const [transcribing, setTranscribing] = useState(false);
  const speechBaseRef = useRef(""); // text before the mic started
  const capDetachRef = useRef(null); // unhooks the PCM tap
  const capBlocksRef = useRef([]); // audio blocks at the context rate
  const capRateRef = useRef(WHISPER_RATE);
  const capStreamRef = useRef(null); // microphone stream
  const recordingRef = useRef(false); // on-device capture running?
  const liveTextRef = useRef(""); // live transcript so far
  const liveCoveredRef = useRef(0); // 16 kHz samples already transcribed
  const liveBusyRef = useRef(false); // one live pass at a time
  const liveStaleRef = useRef(false); // final pass owns the box
  const recordTimerRef = useRef(null);
  const stopLevelRef = useRef(null); // stops the mic level watcher
  const audioCtxRef = useRef(null); // mic AudioContext

  function basePlus(text) {
    const base = speechBaseRef.current;
    return base ? `${base} ${text}` : text;
  }

  function total16k() {
    return totalCapture(capBlocksRef.current, capRateRef.current);
  }

  function slice16k(start16, end16) {
    return sliceCapture(capBlocksRef.current, capRateRef.current, start16, end16);
  }

  function closeLevelCtx() {
    if (!audioCtxRef.current) return;
    try {
      const p = audioCtxRef.current.close();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* already closed */
    }
    audioCtxRef.current = null;
  }

  function releaseCapture() {
    recordingRef.current = false;
    liveStaleRef.current = true;
    if (capDetachRef.current) {
      try {
        capDetachRef.current();
      } catch {
        /* already detached */
      }
      capDetachRef.current = null;
    }
    if (capStreamRef.current) {
      capStreamRef.current.getTracks().forEach((t) => t.stop());
      capStreamRef.current = null;
    }
    closeLevelCtx();
  }

  // Transcribe ~3 s slices while speaking, one pass at a time.
  async function pumpLiveTranscription() {
    if (liveBusyRef.current) return;
    liveBusyRef.current = true;
    try {
      while (recordingRef.current && !liveStaleRef.current) {
        const asr = await loadWhisperModel().catch(() => null);
        if (!asr) {
          showSpeechHint(
            "Voice transcription didn't work - check your connection and try again."
          );
          return;
        }
        if (!recordingRef.current || liveStaleRef.current) return;
        const win = nextLiveWindow({
          covered: liveCoveredRef.current,
          end: total16k(),
          rate: WHISPER_RATE,
          firstSeconds: LIVE_FIRST_S,
          chunkSeconds: LIVE_CHUNK_S,
          overlapSeconds: LIVE_OVERLAP_S,
        });
        if (win.wait) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        const samples = slice16k(win.from, win.end);
        liveCoveredRef.current = win.end;
        // Silent slice: skip it, since Whisper hallucinates on silence.
        if (peakOf(samples) < SILENT_PEAK) continue;
        let text = "";
        try {
          const result = await asr(samples);
          text = scrubTranscript(result?.text);
        } catch (err) {
          console.info("[attendance-bot] live transcription pass failed:", err);
        }
        if (!recordingRef.current || liveStaleRef.current) return;
        if (text && !isNoiseTranscript(text)) {
          liveTextRef.current = mergeTranscript(liveTextRef.current, text);
          setInput(basePlus(liveTextRef.current));
        }
      }
    } finally {
      liveBusyRef.current = false;
    }
  }

  async function startRecording() {
    if (transcribing || recordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      // Ask for 16 kHz; the context resamples the mic for us.
      const ctx = new AudioCtx({ sampleRate: WHISPER_RATE });
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      audioCtxRef.current = ctx;
      capRateRef.current = ctx.sampleRate || WHISPER_RATE;
      capBlocksRef.current = [];
      capStreamRef.current = stream;
      liveTextRef.current = "";
      liveCoveredRef.current = 0;
      liveStaleRef.current = false;
      recordingRef.current = true;
      speechBaseRef.current = input.trim();

      // Capture off the audio thread, so Whisper cannot drop words.
      capDetachRef.current = await attachPcmTap(ctx, source, (block) => {
        if (recordingRef.current) capBlocksRef.current.push(block);
      });

      // Warn while recording if the mic delivers no sound.
      stopLevelRef.current?.();
      stopLevelRef.current = watchMicLevel(ctx, source, {
        onSilent: () =>
          showSpeechHint(
            "I'm not hearing anything - check your microphone is on and unmuted."
          ),
        onSound: clearSpeechHint,
      });

      // Warm up the speech model while the user speaks.
      loadWhisperModel((pct) =>
        showSpeechHint(
          pct >= 100
            ? "Preparing the on-device speech model…"
            : `Downloading the on-device speech model… ${pct}%`
        )
      ).catch(() => {});
      pumpLiveTranscription();

      setListening(true);
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = setTimeout(stopRecording, MAX_RECORD_S * 1000);
    } catch (err) {
      releaseCapture();
      showSpeechHint(
        err?.name === "NotAllowedError"
          ? "Microphone access is blocked - allow it for this site in your browser and try again."
          : "No microphone was found on this device."
      );
    }
  }

  function stopRecording() {
    if (!recordingRef.current) return;
    clearTimeout(recordTimerRef.current);
    stopLevelRef.current?.();
    releaseCapture();
    setListening(false);
    finalizeRecording();
  }

  // Final pass: one clean transcript replaces the live text.
  async function finalizeRecording() {
    const samples = slice16k(0, total16k());
    if (!samples.length) {
      showSpeechHint("I didn't hear anything - tap the mic and try again.");
      return;
    }
    const peak = peakOf(samples);
    console.info("[attendance-bot] voice recording level (peak):", peak.toFixed(4));
    if (peak < SILENT_PEAK) {
      showSpeechHint(
        "I didn't hear anything - check your microphone is on and unmuted."
      );
      return;
    }
    setTranscribing(true);
    showSpeechHint("Transcribing…");
    try {
      const input16k = liftQuiet(samples, peak);
      const asr = await loadWhisperModel((pct) =>
        showSpeechHint(`Downloading the on-device speech model… ${pct}%`)
      );
      const options =
        samples.length > 25 * WHISPER_RATE
          ? { chunk_length_s: 30, stride_length_s: 5 }
          : undefined;
      const result = await asr(input16k, options);
      const text = scrubTranscript(result?.text);
      if (isNoiseTranscript(text)) {
        showSpeechHint("I didn't hear anything - tap the mic and try again.");
        return;
      }
      setInput(basePlus(text));
      clearSpeechHint();
    } catch (err) {
      console.warn("[attendance-bot] on-device transcription failed:", err);
      showSpeechHint(
        "Voice transcription didn't work - check your connection and try again."
      );
    } finally {
      setTranscribing(false);
    }
  }

  // Start the recording, or stop it, as the mic button asks.
  function toggle(listening, busy) {
    if (transcribing) return;
    if (listening) stopRecording();
    else if (!busy) startRecording();
  }

  // Stop only if a recording is running.
  function stopIfRecording() {
    if (recordingRef.current) stopRecording();
  }

  // Release the mic and timers on unmount.
  useEffect(
    () => () => {
      clearTimeout(recordTimerRef.current);
      stopLevelRef.current?.();
      liveStaleRef.current = true;
      recordingRef.current = false;
      if (capDetachRef.current) {
        try {
          capDetachRef.current();
        } catch {
          /* already detached */
        }
        capDetachRef.current = null;
      }
      if (capStreamRef.current) {
        capStreamRef.current.getTracks().forEach((t) => t.stop());
        capStreamRef.current = null;
      }
      closeLevelCtx();
    },
    []
  );

  return { transcribing, toggle, stopIfRecording };
}
