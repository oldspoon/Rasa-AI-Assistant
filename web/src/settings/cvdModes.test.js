import { describe, expect, it } from "vitest";
import { CVD_MODES, DEFAULT_CVD, normalizeCvd } from "./cvdModes.js";

describe("colour modes", () => {
  it("defaults to the greyscale palette", () => {
    expect(DEFAULT_CVD).toBe("default");
    expect(CVD_MODES[0]).toMatchObject({ id: "default", hint: "greyscale palette" });
  });

  it("no longer shows the clinical name in the menu", () => {
    for (const mode of CVD_MODES) {
      expect(`${mode.id} ${mode.label} ${mode.hint}`.toLowerCase()).not.toContain("achromatopsia");
    }
  });

  it("maps nothing, the old default and the old greyscale name to the default", () => {
    expect(normalizeCvd(null)).toBe("default");
    expect(normalizeCvd(undefined)).toBe("default");
    expect(normalizeCvd("off")).toBe("default");
    expect(normalizeCvd("achromatopsia")).toBe("default");
  });

  it("keeps a valid saved choice", () => {
    for (const mode of CVD_MODES) expect(normalizeCvd(mode.id)).toBe(mode.id);
  });

  it("falls back to the default for an unknown value", () => {
    expect(normalizeCvd("rainbow")).toBe("default");
  });
});
