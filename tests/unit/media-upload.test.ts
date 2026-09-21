import { describe, it, expect } from "vitest";
import { buildMusicObjectKey, isOwnedMusicKey } from "@/lib/storage/media-upload";
describe("storage/media-upload", () => {
  it("cheia stă sub music/raw/<artist>/<track>/ și păstrează doar extensiile audio permise", () => {
    expect(buildMusicObjectKey("a1", "t1", "Vara 2026.mp3")).toBe("music/raw/a1/t1/Vara-2026.mp3");
    expect(buildMusicObjectKey("a1", "t1", "x.exe")).toBe("music/raw/a1/t1/x.m4a");
    expect(buildMusicObjectKey("../a1", "t1", "x.m4a").startsWith("music/raw/")).toBe(true);
  });
  it("un artist nu poate înregistra chei din alt prefix", () => {
    expect(isOwnedMusicKey("music/raw/a1/t1/x.m4a", "a1")).toBe(true);
    expect(isOwnedMusicKey("music/raw/a2/t1/x.m4a", "a1")).toBe(false);
    expect(isOwnedMusicKey("videos/raw/a1/t1/x.m4a", "a1")).toBe(false);
    expect(isOwnedMusicKey("music/raw/a1/../a2/x.m4a", "a1")).toBe(false);
  });
});
