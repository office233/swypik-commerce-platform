import { describe, it, expect } from "vitest";
import { platformShareUnits } from "@/lib/swyp/share";
import { SWYPIK_OFFICIAL_ID } from "@/lib/config/accounts";

describe("swyp/share", () => {
  it("cota = floor(amount x bps / 10000); 0 pentru contul oficial, self si sume <= 0", () => {
    expect(platformShareUnits(500, "owner", "viewer", 7000)).toBe(350);
    expect(platformShareUnits(333, "owner", "viewer", 7000)).toBe(233);
    expect(platformShareUnits(500, SWYPIK_OFFICIAL_ID, "viewer", 7000)).toBe(0);
    expect(platformShareUnits(500, "owner", "owner", 7000)).toBe(0);
    expect(platformShareUnits(0, "owner", "viewer", 7000)).toBe(0);
  });
});
