import { describe, it, expect } from "vitest";
import { lockedAfterAdvance } from "@/lib/music/player-rules";

const locked = { trackId: "t2" };

describe("music/player-rules lockedAfterAdvance", () => {
  it("cand player-ul sare peste o piesa blocata (402), paywall-ul ramane vizibil", () => {
    expect(lockedAfterAdvance(locked, "locked")).toBe(locked);
  });
  it("o actiune a userului sau trecerea normala la piesa urmatoare inchide paywall-ul", () => {
    expect(lockedAfterAdvance(locked, "user")).toBeNull();
    expect(lockedAfterAdvance(locked, "ended")).toBeNull();
    expect(lockedAfterAdvance(locked, "error")).toBeNull();
    expect(lockedAfterAdvance(null, "locked")).toBeNull();
  });
});
