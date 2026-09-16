import { describe, it, expect } from "vitest";
import { selectRandomMysteryReward, canClaimDailyDrop } from "../../lib/mystery-drop/engine";

describe("Swypik Daily Mystery Drop Engine", () => {
  it("returnează un premiu valid cu icon, titlu și valoare în lei", () => {
    const reward = selectRandomMysteryReward();
    expect(reward).toBeDefined();
    expect(reward.id).toMatch(/^rw_/);
    expect(reward.title.length).toBeGreaterThan(0);
    expect(reward.valueRon).toBeGreaterThan(0);
    expect(reward.icon.length).toBeGreaterThan(0);
  });

  it("permite claim dacă utilizatorul nu a revendicat niciodată", () => {
    expect(canClaimDailyDrop(null)).toBe(true);
  });

  it("blochează claim-ul multiplu în aceeași zi calendaristică", () => {
    const todayIso = new Date().toISOString();
    expect(canClaimDailyDrop(todayIso)).toBe(false);
  });

  it("permite claim dacă ultima revendicare a fost ieri", () => {
    const yesterday = new Date(Date.now() - 86400000 * 1.5).toISOString();
    expect(canClaimDailyDrop(yesterday)).toBe(true);
  });
});
