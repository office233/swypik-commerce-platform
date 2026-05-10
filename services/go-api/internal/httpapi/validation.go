package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"
)

const maxJSONBodyBytes = 1 << 20

func decodeJSON(reader io.Reader, dst any) error {
	decoder := json.NewDecoder(io.LimitReader(reader, maxJSONBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("body must contain exactly one JSON object")
	}
	return nil
}

func requireJSON(r *http.Request) error {
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		return errors.New("Content-Type must be application/json")
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil || mediaType != "application/json" {
		return errors.New("Content-Type must be application/json")
	}
	return nil
}

func validateEvent(req eventRequest) error {
	if strings.TrimSpace(req.EventType) == "" {
		return errors.New("event_type is required")
	}
	if strings.TrimSpace(req.SubjectID) == "" {
		return errors.New("subject_id is required")
	}
	return nil
}

func validateUploadInit(req uploadInitRequest) error {
	if strings.TrimSpace(req.Filename) == "" {
		return errors.New("filename is required")
	}
	if req.SizeBytes <= 0 {
		return errors.New("size_bytes must be positive")
	}
	if req.SizeBytes > 500*1024*1024 {
		return errors.New("size_bytes exceeds 500MB")
	}
	if !strings.HasPrefix(strings.ToLower(req.ContentType), "video/") {
		return errors.New("content_type must be a video type")
	}
	return nil
}

func validateUploadComplete(req uploadCompleteRequest) error {
	if strings.TrimSpace(req.UploadID) == "" {
		return errors.New("upload_id is required")
	}
	if req.ProductID <= 0 {
		return errors.New("product_id must be positive")
	}
	if strings.TrimSpace(req.VideoURL) == "" {
		return errors.New("video_url is required")
	}
	return nil
}

func validateFollow(req followRequest) error {
	if strings.TrimSpace(req.FollowerID) == "" {
		return errors.New("follower_id is required")
	}
	if strings.TrimSpace(req.FolloweeID) == "" {
		return errors.New("followee_id is required")
	}
	if req.FollowerID == req.FolloweeID {
		return errors.New("follower_id and followee_id must differ")
	}
	return nil
}

func validateCheckout(req checkoutRequest) error {
	if len(req.Items) == 0 {
		return errors.New("items is required")
	}
	if len(req.Items) > 20 {
		return errors.New("items cannot contain more than 20 entries")
	}
	for idx, item := range req.Items {
		if item.ProductID <= 0 {
			return fmt.Errorf("items[%d].product_id must be positive", idx)
		}
		if item.Quantity <= 0 || item.Quantity > 10 {
			return fmt.Errorf("items[%d].quantity must be between 1 and 10", idx)
		}
	}
	if req.Customer.Email != "" && !strings.Contains(req.Customer.Email, "@") {
		return errors.New("customer.email is invalid")
	}
	return nil
}
