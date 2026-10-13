import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchMicLevel } from "./micLevel.js";

// A fake mic: `level` is the sample value the analyser reports on each poll.
function fakeMic() {
  const mic = { level: 0 };
  mic.ctx = {
    createAnalyser: () => ({
      fftSize: 0,
      getFloatTimeDomainData: (buffer) => buffer.fill(mic.level),
    }),
  };
  mic.source = { connect: () => {} };
  return mic;
}

describe("watchMicLevel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("warns once when nothing is heard for 1.5 s", () => {
    const mic = fakeMic();
    const onSilent = vi.fn();
    watchMicLevel(mic.ctx, mic.source, { onSilent, onSound: vi.fn() });
    vi.advanceTimersByTime(1200);
    expect(onSilent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onSilent).toHaveBeenCalledTimes(1);
  });

  it("clears the warning when sound arrives afterwards", () => {
    const mic = fakeMic();
    const onSilent = vi.fn();
    const onSound = vi.fn();
    watchMicLevel(mic.ctx, mic.source, { onSilent, onSound });
    vi.advanceTimersByTime(2000);
    mic.level = 0.2;
    vi.advanceTimersByTime(600);
    expect(onSound).toHaveBeenCalledTimes(1);
  });

  it("never warns if sound was heard in time", () => {
    const mic = fakeMic();
    mic.level = 0.2;
    const onSilent = vi.fn();
    watchMicLevel(mic.ctx, mic.source, { onSilent, onSound: vi.fn() });
    vi.advanceTimersByTime(1000);
    mic.level = 0;
    vi.advanceTimersByTime(5000);
    expect(onSilent).not.toHaveBeenCalled();
  });

  it("stops polling once stopped", () => {
    const mic = fakeMic();
    const onSilent = vi.fn();
    const stop = watchMicLevel(mic.ctx, mic.source, { onSilent, onSound: vi.fn() });
    stop();
    vi.advanceTimersByTime(5000);
    expect(onSilent).not.toHaveBeenCalled();
  });
});
