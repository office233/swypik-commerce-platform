package videos

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestUploadLifecycleInitializesCompletesAndPublishesVideo(t *testing.T) {
	ctx := context.Background()
	clock := fixedClock(time.Date(2026, 5, 10, 12, 0, 0, 0, time.UTC))
	store := NewMemoryUploadStore()
	service := NewUploadService(store, UploadConfig{
		PublicUploadBaseURL: "https://uploads.aicevrei.test",
		UploadTTL:           15 * time.Minute,
		Clock:               clock,
	})

	initResult, err := service.Init(ctx, InitUploadInput{
		CreatorID:    "creator_1",
		Filename:     "clip.mp4",
		ContentType:  "video/mp4",
		SizeBytes:    1024 * 1024,
		ProductID:    "product_1",
		ChecksumSHA:  "sha256:test",
		OriginalName: "launch clip",
	})
	if err != nil {
		t.Fatalf("expected upload init, got %v", err)
	}
	if initResult.UploadID == "" {
		t.Fatal("expected upload id")
	}
	if initResult.Method != "PUT" {
		t.Fatalf("expected PUT upload method, got %q", initResult.Method)
	}
	if initResult.ExpiresAt != clock().Add(15*time.Minute) {
		t.Fatalf("expected ttl-derived expiry, got %s", initResult.ExpiresAt)
	}

	status, err := service.Status(ctx, initResult.UploadID)
	if err != nil {
		t.Fatalf("expected pending status, got %v", err)
	}
	if status.Status != UploadPending {
		t.Fatalf("expected pending upload, got %s", status.Status)
	}

	completeResult, err := service.Complete(ctx, CompleteUploadInput{
		UploadID:   initResult.UploadID,
		CreatorID:  "creator_1",
		VideoURL:   "https://cdn.aicevrei.test/clip.mp4",
		PosterURL:  "https://cdn.aicevrei.test/clip.jpg",
		DurationMS: 15_000,
	})
	if err != nil {
		t.Fatalf("expected upload complete, got %v", err)
	}
	if completeResult.Status != VideoReady {
		t.Fatalf("expected ready video, got %s", completeResult.Status)
	}

	published, err := service.Publish(ctx, completeResult.VideoID, PublishInput{CreatorID: "creator_1"})
	if err != nil {
		t.Fatalf("expected publish, got %v", err)
	}
	if published.Status != VideoPublished {
		t.Fatalf("expected published video, got %s", published.Status)
	}
}

func TestUploadInitRejectsNonVideoContent(t *testing.T) {
	service := NewUploadService(NewMemoryUploadStore(), UploadConfig{
		PublicUploadBaseURL: "https://uploads.aicevrei.test",
		UploadTTL:           15 * time.Minute,
		Clock:               time.Now,
	})

	_, err := service.Init(context.Background(), InitUploadInput{
		CreatorID:   "creator_1",
		Filename:    "still.png",
		ContentType: "image/png",
		SizeBytes:   1024,
	})
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("expected ErrValidation for non-video content, got %v", err)
	}
}

func fixedClock(now time.Time) func() time.Time {
	return func() time.Time { return now }
}
