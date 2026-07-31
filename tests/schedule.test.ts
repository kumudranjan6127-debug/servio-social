import { describe, it, expect } from "vitest";
import { istTimeOnDayOf, nextUpcomingIstTimeIso } from "../src/buffer/publish";

// IST is UTC+05:30, so 09:00 IST == 03:30 UTC, 18:00 IST == 12:30 UTC, etc.
describe("istTimeOnDayOf", () => {
  it("maps 09:00 IST to 03:30 UTC on the same day", () => {
    expect(istTimeOnDayOf("2026-07-31T03:30:00.000Z", 9, 0)).toBe("2026-07-31T03:30:00.000Z");
  });

  it("maps an evening IST time to the correct UTC instant", () => {
    expect(istTimeOnDayOf("2026-07-31T03:30:00.000Z", 18, 0)).toBe("2026-07-31T12:30:00.000Z");
  });

  it("respects minutes", () => {
    expect(istTimeOnDayOf("2026-07-31T03:30:00.000Z", 9, 45)).toBe("2026-07-31T04:15:00.000Z");
  });

  it("keeps X on the same IST calendar day as the base instant", () => {
    expect(istTimeOnDayOf("2026-08-01T03:30:00.000Z", 9, 30).slice(0, 10)).toBe("2026-08-01");
  });

  it("falls back to the next upcoming time when no base instant is given", () => {
    expect(istTimeOnDayOf(undefined, 9, 0).endsWith("T03:30:00.000Z")).toBe(true);
  });
});

describe("nextUpcomingIstTimeIso", () => {
  it("returns 09:00 IST as an 03:30 UTC instant", () => {
    expect(nextUpcomingIstTimeIso(9, 0).endsWith("T03:30:00.000Z")).toBe(true);
  });

  it("returns 21:15 IST as a 15:45 UTC instant, and a valid date", () => {
    const iso = nextUpcomingIstTimeIso(21, 15);
    expect(iso.endsWith("T15:45:00.000Z")).toBe(true);
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });
});
