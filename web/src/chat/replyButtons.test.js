import { describe, expect, it } from "vitest";
import { iconFor } from "./replyButtons.js";

describe("iconFor", () => {
  it("uses a phone icon for pay by phone", () => {
    expect(iconFor("/pay_by_phone")).toBe("fa-phone");
  });

  it("uses an info icon for the InfoDesk", () => {
    expect(iconFor("/pay_at_infodesk")).toBe("fa-circle-info");
  });

  it("has no icon for other payloads", () => {
    expect(iconFor("/something_else")).toBeNull();
  });
});
