import { describe, it, expect } from "vitest";
import { pickRewardTier, claimDateUtc } from "@/lib/mystery-drop/engine";

describe("Mystery Drop — selecție premiu", () => {
  it("alege treapta după ponderi, determinist pentru un random dat", () => {
    expect(pickRewardTier(0).id).toBe("swyp_5");
    expect(pickRewardTier(0.49).id).toBe("swyp_5");
    expect(pickRewardTier(0.5).id).toBe("swyp_10");
    expect(pickRewardTier(0.84).id).toBe("swyp_10");
    expect(pickRewardTier(0.85).id).toBe("swyp_25");
    expect(pickRewardTier(0.999).id).toBe("swyp_25");
  });

  it("cheia zilei este data UTC, nu locală", () => {
    expect(claimDateUtc(new Date("2026-09-21T23:59:59Z"))).toBe("2026-09-21");
    expect(claimDateUtc(new Date("2026-09-22T00:00:01Z"))).toBe("2026-09-22");
  });
});
