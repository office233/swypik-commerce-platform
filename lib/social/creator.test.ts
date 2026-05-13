import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCreatorSnapshot,
  normalizeCreatorId,
  normalizeUploadStatus,
} from "./creator";

test("buildCreatorSnapshot filters feed payloads by creator and aggregates stats", () => {
  const snapshot = buildCreatorSnapshot({
    creatorId: "web-creator",
    feedPayload: {
      items: [
        {
          id: "video_1",
          title: "Desk setup",
          creator_id: "web-creator",
          product_id: "101",
          video_url: "https://cdn.example/video-1.mp4",
          poster_url: "https://cdn.example/poster-1.jpg",
          has_video: true,
          views_count: 1200,
          likes_count: 80,
          comments_count: 9,
          orders_count: 14,
          published_at: "2026-05-10T10:00:00.000Z",
        },
        {
          id: "video_2",
          creator: { id: "other-creator", displayName: "Other" },
          stats: { likes: 999, comments: 999, orders: 999 },
        },
        {
          id: "video_3",
          creator: { id: "web-creator", displayName: "Web Creator" },
          video: { status: "processing", posterUrl: "https://cdn.example/poster-3.jpg" },
          product: { product_id: "102", title: "Creator lamp" },
          stats: { likes: 20, comments: 3, orders: 5 },
          ranking: { score: 42 },
        },
      ],
    },
  });

  assert.equal(snapshot.creator.id, "web-creator");
  assert.equal(snapshot.creator.displayName, "Web Creator");
  assert.equal(snapshot.stats.videos, 2);
  assert.equal(snapshot.stats.readyVideos, 1);
  assert.equal(snapshot.stats.processingVideos, 1);
  assert.equal(snapshot.stats.views, 1200);
  assert.equal(snapshot.stats.likes, 100);
  assert.equal(snapshot.stats.comments, 12);
  assert.equal(snapshot.stats.orders, 19);
  assert.equal(snapshot.videos[0].id, "video_1");
  assert.equal(snapshot.videos[1].productId, "102");
});

test("normalizeCreatorId keeps route-safe handles stable", () => {
  assert.equal(normalizeCreatorId(" Web Creator "), "web-creator");
  assert.equal(normalizeCreatorId("@Swypik.Creator"), "swypik.creator");
  assert.equal(normalizeCreatorId(""), "web-creator");
});

test("normalizeUploadStatus accepts Go upload status payloads", () => {
  const status = normalizeUploadStatus({
    id: "upl_123",
    upload_id: "upl_123",
    creator_id: "web-creator",
    product_id: "101",
    filename: "clip.mp4",
    status: "completed",
    video_id: "video_123",
    created_at: "2026-05-10T09:00:00.000Z",
    completed_at: "2026-05-10T09:02:00.000Z",
  });

  assert.equal(status.id, "upl_123");
  assert.equal(status.status, "completed");
  assert.equal(status.videoId, "video_123");
  assert.equal(status.productId, "101");
  assert.equal(status.filename, "clip.mp4");
});
