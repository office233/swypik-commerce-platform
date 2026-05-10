package httpapi

import (
	"strings"
	"testing"
)

func TestDecodeJSONRejectsUnknownFields(t *testing.T) {
	var payload eventRequest

	err := decodeJSON(strings.NewReader(`{"event_type":"view","subject_id":"123","unexpected":true}`), &payload)
	if err == nil {
		t.Fatal("expected unknown fields to be rejected")
	}
}

func TestValidateUploadInitRequiresFilenameAndContentType(t *testing.T) {
	err := validateUploadInit(uploadInitRequest{
		Filename:    "clip.mp4",
		ContentType: "video/mp4",
		SizeBytes:   1024,
	})
	if err != nil {
		t.Fatalf("expected valid upload init request, got %v", err)
	}

	err = validateUploadInit(uploadInitRequest{Filename: "clip.mp4", ContentType: "image/png", SizeBytes: 1024})
	if err == nil {
		t.Fatal("expected non-video content type to be rejected")
	}
}

func TestValidateCheckoutRequiresPositiveItems(t *testing.T) {
	err := validateCheckout(checkoutRequest{
		Items: []checkoutItemRequest{{ProductID: 10, Quantity: 2}},
		Customer: checkoutCustomerRequest{
			Name:  "Ada",
			Email: "ada@example.test",
		},
	})
	if err != nil {
		t.Fatalf("expected valid checkout request, got %v", err)
	}

	err = validateCheckout(checkoutRequest{Items: []checkoutItemRequest{{ProductID: 0, Quantity: 1}}})
	if err == nil {
		t.Fatal("expected invalid product id to be rejected")
	}
}
