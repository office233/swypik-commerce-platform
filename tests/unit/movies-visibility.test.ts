import { describe, it, expect } from "vitest";
import { targetVisibility } from "@/lib/movies/visibility";

describe("movies/visibility", () => {
  const published = { free_episodes: 3, status: "published" as const };
  it("episoadele gratuite ale unui serial publicat sunt public; restul private", () => {
    expect(targetVisibility(published, { episode_number: 1, status: "published" })).toBe("public");
    expect(targetVisibility(published, { episode_number: 3, status: "published" })).toBe("public");
    expect(targetVisibility(published, { episode_number: 4, status: "published" })).toBe("private");
  });
  it("orice episod nepublicat sau dintr-un serial nepublicat este private", () => {
    expect(targetVisibility(published, { episode_number: 1, status: "draft" })).toBe("private");
    expect(targetVisibility({ free_episodes: 3, status: "draft" }, { episode_number: 1, status: "published" })).toBe("private");
  });
});
