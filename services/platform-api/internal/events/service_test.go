package events

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRecordBatchStoresAndPublishesAcceptedEvents(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	publisher := NewMemoryPublisher()
	service := NewService(store, publisher)
	occurredAt := time.Date(2026, 5, 10, 12, 0, 0, 0, time.UTC)

	result, err := service.RecordBatch(ctx, Batch{
		Events: []Event{
			{
				Type:        "video_view",
				ActorID:     "user_1",
				SubjectType: "video",
				SubjectID:   "video_1",
				OccurredAt:  occurredAt,
				Metadata:    map[string]any{"watch_ms": float64(1200)},
			},
		},
	})
	if err != nil {
		t.Fatalf("expected valid batch, got %v", err)
	}
	if result.Accepted != 1 {
		t.Fatalf("expected one accepted event, got %d", result.Accepted)
	}
	if len(store.Events()) != 1 {
		t.Fatalf("expected event stored, got %d", len(store.Events()))
	}
	if len(publisher.Messages()) != 1 {
		t.Fatalf("expected event published, got %d", len(publisher.Messages()))
	}
	if store.Events()[0].OccurredAt != occurredAt {
		t.Fatalf("expected occurred_at preserved, got %s", store.Events()[0].OccurredAt)
	}
}

func TestRecordBatchRejectsInvalidEvents(t *testing.T) {
	service := NewService(NewMemoryStore(), NewMemoryPublisher())

	_, err := service.RecordBatch(context.Background(), Batch{
		Events: []Event{{SubjectType: "video", SubjectID: "video_1"}},
	})
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("expected ErrValidation for missing type, got %v", err)
	}
}
