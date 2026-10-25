// Pure sample maths for the on-device path. No browser APIs, so it can be tested in Node.
//
// Audio arrives from the Web Audio API as Float32 blocks at the AudioContext rate
// (https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer). Whisper expects mono
// Float32 at 16 kHz (https://huggingface.co/docs/transformers.js), so this module converts
// between the two without any device-specific code.

export const TARGET_RATE = 16000;

// Total number of raw samples across all captured blocks.
export function rawLength(blocks) {
  let n = 0;
  for (const block of blocks) n += block.length;
  return n;
}

// Length of the capture, expressed in 16 kHz samples.
export function total16k(blocks, captureRate) {
  return Math.floor(rawLength(blocks) / (captureRate / TARGET_RATE));
}

// Copy the raw samples in [startRaw, endRaw) out of the blocks, in order.
export function gatherRaw(blocks, startRaw, endRaw) {
  const out = new Float32Array(Math.max(0, endRaw - startRaw));
  let blockStart = 0;
  let offset = 0;
  for (const block of blocks) {
    const blockEnd = blockStart + block.length;
    if (blockEnd > startRaw && blockStart < endRaw) {
      const from = Math.max(0, startRaw - blockStart);
      const to = Math.min(block.length, endRaw - blockStart);
      out.set(block.subarray(from, to), offset);
      offset += to - from;
    }
    blockStart = blockEnd;
    if (blockStart >= endRaw) break;
  }
  return out.subarray(0, offset);
}

// Box-average downsampling, used only when the context refused 16 kHz.
export function downsample(raw, ratio) {
  const outLen = Math.max(1, Math.floor(raw.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const start = i * ratio;
    const end = Math.min(raw.length, start + ratio);
    let sum = 0;
    let n = 0;
    for (let j = Math.floor(start); j < end; j += 1) {
      sum += raw[j];
      n += 1;
    }
    out[i] = n ? sum / n : 0;
  }
  return out;
}

// Samples in [start16, end16) at 16 kHz, whatever rate the context captured at.
export function slice16k(blocks, captureRate, start16, end16) {
  if (captureRate === TARGET_RATE) return gatherRaw(blocks, start16, end16);
  const ratio = captureRate / TARGET_RATE;
  return downsample(
    gatherRaw(blocks, Math.floor(start16 * ratio), Math.ceil(end16 * ratio)),
    ratio
  );
}

// Largest absolute sample value.
export function peakOf(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

// Raise quiet recordings (low-gain microphones) towards a usable level. Returns a new array.
export function liftQuiet(samples, peak, { threshold = 0.5, target = 0.9, maxGain = 20 } = {}) {
  if (!(peak > 0) || peak >= threshold) return samples;
  const gain = Math.min(target / peak, maxGain);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] * gain;
  return out;
}
