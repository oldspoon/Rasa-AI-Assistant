import { describe, it, expect } from "vitest";
import {
  gatherRaw,
  liftQuiet,
  peakOf,
  rawLength,
  slice16k,
  total16k,
  downsample,
} from "./pcm.js";

const block = (...values) => Float32Array.from(values);

describe("rawLength and total16k", () => {
  it("sums the samples in every block", () => {
    expect(rawLength([block(1, 2), block(3), block()])).toBe(3);
  });

  it("converts the capture length to 16 kHz samples", () => {
    const blocks = [new Float32Array(48000)];
    expect(total16k(blocks, 48000)).toBe(16000);
    expect(total16k(blocks, 16000)).toBe(48000);
  });
});

describe("gatherRaw", () => {
  const blocks = [block(0, 1, 2), block(3, 4), block(5, 6, 7)];

  it("copies a range that spans block boundaries, in order", () => {
    expect(Array.from(gatherRaw(blocks, 2, 6))).toEqual([2, 3, 4, 5]);
  });

  it("copies from the start and stops at the end of the capture", () => {
    expect(Array.from(gatherRaw(blocks, 0, 3))).toEqual([0, 1, 2]);
    expect(Array.from(gatherRaw(blocks, 6, 100))).toEqual([6, 7]);
  });

  it("returns nothing for an empty or inverted range", () => {
    expect(gatherRaw(blocks, 4, 4).length).toBe(0);
    expect(gatherRaw(blocks, 5, 2).length).toBe(0);
  });
});

describe("downsample and slice16k", () => {
  it("averages each group of samples (box filter)", () => {
    expect(Array.from(downsample(block(1, 3, 5, 7), 2))).toEqual([2, 6]);
  });

  it("returns the same samples when the context already runs at 16 kHz", () => {
    const blocks = [block(0.1, 0.2, 0.3, 0.4)];
    const out = slice16k(blocks, 16000, 1, 3);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.2, 6);
    expect(out[1]).toBeCloseTo(0.3, 6);
  });

  it("maps 16 kHz positions onto a 48 kHz capture", () => {
    // 48 kHz capture: 3 raw samples per 16 kHz sample.
    const raw = new Float32Array(9);
    for (let i = 0; i < 9; i += 1) raw[i] = i < 3 ? 1 : i < 6 ? 2 : 3;
    const out = slice16k([raw], 48000, 0, 3);
    expect(out.length).toBe(3);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});

describe("peakOf", () => {
  it("returns the largest absolute value", () => {
    expect(peakOf(block(0.1, -0.7, 0.3))).toBeCloseTo(0.7, 6);
  });

  it("returns 0 for silence and for an empty array", () => {
    expect(peakOf(block(0, 0))).toBe(0);
    expect(peakOf(new Float32Array(0))).toBe(0);
  });
});

describe("liftQuiet", () => {
  it("leaves loud recordings untouched", () => {
    const samples = block(0.6, -0.8);
    expect(liftQuiet(samples, 0.8)).toBe(samples);
  });

  it("scales a quiet recording up to the target peak", () => {
    const out = liftQuiet(block(0.1, -0.2), 0.2);
    expect(peakOf(out)).toBeCloseTo(0.9, 6);
  });

  it("caps the gain so near-silence is not amplified into noise", () => {
    const out = liftQuiet(block(0.001), 0.001);
    expect(out[0]).toBeCloseTo(0.001 * 20, 6);
  });

  it("does nothing when the peak is zero", () => {
    const samples = block(0, 0);
    expect(liftQuiet(samples, 0)).toBe(samples);
  });
});
