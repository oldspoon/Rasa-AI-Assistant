import { describe, it, expect } from "vitest";
import { nextLiveWindow } from "./liveSchedule.js";

const base = { rate: 16000, firstSeconds: 2.2, chunkSeconds: 3.5, overlapSeconds: 0.8 };

describe("nextLiveWindow", () => {
  it("waits until the first pass has enough audio", () => {
    expect(nextLiveWindow({ ...base, covered: 0, end: 2.1 * 16000 })).toEqual({ wait: true });
  });

  it("starts the first pass at the beginning once 2.2 s are available", () => {
    const window = nextLiveWindow({ ...base, covered: 0, end: 2.2 * 16000 });
    expect(window).toEqual({ wait: false, from: 0, end: 2.2 * 16000 });
  });

  it("re-listens to the overlap before the already-covered audio", () => {
    const covered = 5 * 16000;
    const end = covered + 3.5 * 16000;
    const window = nextLiveWindow({ ...base, covered, end });
    expect(window.wait).toBe(false);
    expect(window.from).toBe(covered - 0.8 * 16000);
    expect(window.end).toBe(end);
  });

  it("waits for a full later chunk, not the shorter first one", () => {
    const covered = 5 * 16000;
    expect(nextLiveWindow({ ...base, covered, end: covered + 3 * 16000 })).toEqual({ wait: true });
  });

  it("never starts before the beginning of the capture", () => {
    const covered = 0.1 * 16000;
    const window = nextLiveWindow({ ...base, covered, end: covered + 3.5 * 16000 });
    expect(window.from).toBe(0);
  });
});
