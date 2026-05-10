package videos

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

var (
	ErrValidation = errors.New("validation failed")
	ErrNotFound   = errors.New("not found")
	ErrConflict   = errors.New("conflict")
)

type UploadStatus string

const (
	UploadPending   UploadStatus = "pending"
	UploadCompleted UploadStatus = "completed"
)

type VideoStatus string

const (
	VideoReady     VideoStatus = "ready"
	VideoPublished VideoStatus = "published"
)

type UploadConfig struct {
	PublicUploadBaseURL string
	UploadTTL           time.Duration
	Clock               func() time.Time
}

type InitUploadInput struct {
	CreatorID    string `json:"creator_id"`
	Filename     string `json:"filename"`
	ContentType  string `json:"content_type"`
	SizeBytes    int64  `json:"size_bytes"`
	ProductID    string `json:"product_id,omitempty"`
	ChecksumSHA  string `json:"checksum_sha,omitempty"`
	OriginalName string `json:"original_name,omitempty"`
}

type InitUploadResult struct {
	UploadID  string            `json:"upload_id"`
	UploadURL string            `json:"upload_url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	ExpiresAt time.Time         `json:"expires_at"`
	Status    UploadStatus      `json:"status"`
}

type CompleteUploadInput struct {
	UploadID    string `json:"upload_id"`
	CreatorID   string `json:"creator_id"`
	VideoURL    string `json:"video_url"`
	PosterURL   string `json:"poster_url,omitempty"`
	DurationMS  int64  `json:"duration_ms,omitempty"`
	StoragePath string `json:"storage_path,omitempty"`
}

type PublishInput struct {
	CreatorID string `json:"creator_id"`
}

type Upload struct {
	ID          string       `json:"id"`
	CreatorID   string       `json:"creator_id"`
	ProductID   string       `json:"product_id,omitempty"`
	Filename    string       `json:"filename"`
	ContentType string       `json:"content_type"`
	SizeBytes   int64        `json:"size_bytes"`
	Status      UploadStatus `json:"status"`
	VideoID     string       `json:"video_id,omitempty"`
	UploadURL   string       `json:"upload_url,omitempty"`
	ExpiresAt   time.Time    `json:"expires_at"`
	CreatedAt   time.Time    `json:"created_at"`
	CompletedAt time.Time    `json:"completed_at,omitempty"`
}

type Video struct {
	VideoID     string      `json:"video_id"`
	ID          string      `json:"id"`
	UploadID    string      `json:"upload_id,omitempty"`
	CreatorID   string      `json:"creator_id"`
	ProductID   string      `json:"product_id,omitempty"`
	VideoURL    string      `json:"video_url"`
	PosterURL   string      `json:"poster_url,omitempty"`
	DurationMS  int64       `json:"duration_ms,omitempty"`
	Status      VideoStatus `json:"status"`
	PublishedAt time.Time   `json:"published_at,omitempty"`
	CreatedAt   time.Time   `json:"created_at"`
}

type Comment struct {
	ID        string    `json:"id"`
	VideoID   string    `json:"video_id"`
	AuthorID  string    `json:"author_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

type AddCommentInput struct {
	AuthorID string `json:"author_id"`
	Body     string `json:"body"`
}

type UploadStore interface {
	CreateUpload(context.Context, Upload) error
	GetUpload(context.Context, string) (Upload, error)
	UpdateUpload(context.Context, Upload) error
	CreateVideo(context.Context, Video) error
	GetVideo(context.Context, string) (Video, error)
	UpdateVideo(context.Context, Video) error
	ListComments(context.Context, string, int, int) ([]Comment, error)
	AddComment(context.Context, Comment) error
}

type UploadService struct {
	store UploadStore
	cfg   UploadConfig
}

func NewUploadService(store UploadStore, cfg UploadConfig) *UploadService {
	if store == nil {
		store = NewMemoryUploadStore()
	}
	if cfg.PublicUploadBaseURL == "" {
		cfg.PublicUploadBaseURL = "https://uploads.aicevrei.local"
	}
	cfg.PublicUploadBaseURL = strings.TrimRight(cfg.PublicUploadBaseURL, "/")
	if cfg.UploadTTL <= 0 {
		cfg.UploadTTL = 15 * time.Minute
	}
	if cfg.Clock == nil {
		cfg.Clock = time.Now
	}
	return &UploadService{store: store, cfg: cfg}
}

func (s *UploadService) Init(ctx context.Context, input InitUploadInput) (InitUploadResult, error) {
	if err := validateInit(input); err != nil {
		return InitUploadResult{}, err
	}
	now := s.cfg.Clock().UTC()
	uploadID := newID("upl")
	uploadURL := fmt.Sprintf("%s/videos/%s/%s", s.cfg.PublicUploadBaseURL, uploadID, sanitizeFilename(input.Filename))
	upload := Upload{
		ID:          uploadID,
		CreatorID:   strings.TrimSpace(input.CreatorID),
		ProductID:   strings.TrimSpace(input.ProductID),
		Filename:    strings.TrimSpace(input.Filename),
		ContentType: strings.TrimSpace(input.ContentType),
		SizeBytes:   input.SizeBytes,
		Status:      UploadPending,
		UploadURL:   uploadURL,
		ExpiresAt:   now.Add(s.cfg.UploadTTL),
		CreatedAt:   now,
	}
	if err := s.store.CreateUpload(ctx, upload); err != nil {
		return InitUploadResult{}, err
	}
	return InitUploadResult{
		UploadID:  upload.ID,
		UploadURL: upload.UploadURL,
		Method:    "PUT",
		Headers:   map[string]string{"Content-Type": upload.ContentType},
		ExpiresAt: upload.ExpiresAt,
		Status:    upload.Status,
	}, nil
}

func (s *UploadService) Status(ctx context.Context, uploadID string) (Upload, error) {
	uploadID = strings.TrimSpace(uploadID)
	if uploadID == "" {
		return Upload{}, validationError("upload id is required")
	}
	return s.store.GetUpload(ctx, uploadID)
}

func (s *UploadService) Complete(ctx context.Context, input CompleteUploadInput) (Video, error) {
	if err := validateComplete(input); err != nil {
		return Video{}, err
	}
	upload, err := s.store.GetUpload(ctx, strings.TrimSpace(input.UploadID))
	if err != nil {
		return Video{}, err
	}
	if upload.CreatorID != "" && upload.CreatorID != strings.TrimSpace(input.CreatorID) {
		return Video{}, validationError("creator_id does not match upload")
	}
	if upload.Status == UploadCompleted && upload.VideoID != "" {
		return s.store.GetVideo(ctx, upload.VideoID)
	}
	now := s.cfg.Clock().UTC()
	video := Video{
		VideoID:    newID("vid"),
		UploadID:   upload.ID,
		CreatorID:  upload.CreatorID,
		ProductID:  upload.ProductID,
		VideoURL:   strings.TrimSpace(input.VideoURL),
		PosterURL:  strings.TrimSpace(input.PosterURL),
		DurationMS: input.DurationMS,
		Status:     VideoReady,
		CreatedAt:  now,
	}
	video.ID = video.VideoID
	upload.Status = UploadCompleted
	upload.VideoID = video.ID
	upload.CompletedAt = now
	if err := s.store.UpdateUpload(ctx, upload); err != nil {
		return Video{}, err
	}
	if err := s.store.CreateVideo(ctx, video); err != nil {
		return Video{}, err
	}
	return video, nil
}

func (s *UploadService) Publish(ctx context.Context, videoID string, input PublishInput) (Video, error) {
	videoID = strings.TrimSpace(videoID)
	if videoID == "" {
		return Video{}, validationError("video id is required")
	}
	video, err := s.store.GetVideo(ctx, videoID)
	if err != nil {
		return Video{}, err
	}
	if video.CreatorID != "" && strings.TrimSpace(input.CreatorID) != "" && video.CreatorID != strings.TrimSpace(input.CreatorID) {
		return Video{}, validationError("creator_id does not match video")
	}
	if video.Status != VideoReady && video.Status != VideoPublished {
		return Video{}, fmt.Errorf("%w: video is not ready", ErrConflict)
	}
	if video.Status != VideoPublished {
		video.Status = VideoPublished
		video.PublishedAt = s.cfg.Clock().UTC()
		if err := s.store.UpdateVideo(ctx, video); err != nil {
			return Video{}, err
		}
	}
	return video, nil
}

func (s *UploadService) ListComments(ctx context.Context, videoID string, limit, offset int) ([]Comment, error) {
	videoID = strings.TrimSpace(videoID)
	if videoID == "" {
		return nil, validationError("video id is required")
	}
	limit = boundedInt(limit, 25, 1, 100)
	if offset < 0 {
		offset = 0
	}
	return s.store.ListComments(ctx, videoID, limit, offset)
}

func (s *UploadService) AddComment(ctx context.Context, videoID string, input AddCommentInput) (Comment, error) {
	videoID = strings.TrimSpace(videoID)
	if videoID == "" {
		return Comment{}, validationError("video id is required")
	}
	if strings.TrimSpace(input.AuthorID) == "" {
		return Comment{}, validationError("author_id is required")
	}
	body := strings.TrimSpace(input.Body)
	if body == "" {
		return Comment{}, validationError("body is required")
	}
	if len(body) > 2_000 {
		return Comment{}, validationError("body cannot exceed 2000 characters")
	}
	comment := Comment{
		ID:        newID("cmt"),
		VideoID:   videoID,
		AuthorID:  strings.TrimSpace(input.AuthorID),
		Body:      body,
		CreatedAt: s.cfg.Clock().UTC(),
	}
	if err := s.store.AddComment(ctx, comment); err != nil {
		return Comment{}, err
	}
	return comment, nil
}

func validateInit(input InitUploadInput) error {
	if strings.TrimSpace(input.CreatorID) == "" {
		return validationError("creator_id is required")
	}
	if strings.TrimSpace(input.Filename) == "" {
		return validationError("filename is required")
	}
	if input.SizeBytes <= 0 {
		return validationError("size_bytes must be positive")
	}
	if input.SizeBytes > 1024*1024*1024 {
		return validationError("size_bytes exceeds 1GB")
	}
	contentType := strings.ToLower(strings.TrimSpace(input.ContentType))
	if !strings.HasPrefix(contentType, "video/") {
		return validationError("content_type must be a video type")
	}
	return nil
}

func validateComplete(input CompleteUploadInput) error {
	if strings.TrimSpace(input.UploadID) == "" {
		return validationError("upload_id is required")
	}
	if strings.TrimSpace(input.CreatorID) == "" {
		return validationError("creator_id is required")
	}
	if strings.TrimSpace(input.VideoURL) == "" {
		return validationError("video_url is required")
	}
	if input.DurationMS < 0 {
		return validationError("duration_ms cannot be negative")
	}
	return nil
}

func validationError(message string) error {
	return fmt.Errorf("%w: %s", ErrValidation, message)
}

func sanitizeFilename(filename string) string {
	filename = strings.TrimSpace(filename)
	filename = strings.ReplaceAll(filename, "\\", "_")
	filename = strings.ReplaceAll(filename, "/", "_")
	if filename == "" {
		return "upload.bin"
	}
	return filename
}

func boundedInt(value, fallback, low, high int) int {
	if value == 0 {
		return fallback
	}
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

func newID(prefix string) string {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
	}
	return prefix + "_" + hex.EncodeToString(bytes[:])
}

type MemoryUploadStore struct {
	mu       sync.RWMutex
	uploads  map[string]Upload
	videos   map[string]Video
	comments map[string][]Comment
}

func NewMemoryUploadStore() *MemoryUploadStore {
	return &MemoryUploadStore{
		uploads:  make(map[string]Upload),
		videos:   make(map[string]Video),
		comments: make(map[string][]Comment),
	}
}

func (s *MemoryUploadStore) CreateUpload(_ context.Context, upload Upload) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.uploads[upload.ID] = upload
	return nil
}

func (s *MemoryUploadStore) GetUpload(_ context.Context, id string) (Upload, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	upload, ok := s.uploads[id]
	if !ok {
		return Upload{}, fmt.Errorf("%w: upload %s", ErrNotFound, id)
	}
	return upload, nil
}

func (s *MemoryUploadStore) UpdateUpload(_ context.Context, upload Upload) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.uploads[upload.ID]; !ok {
		return fmt.Errorf("%w: upload %s", ErrNotFound, upload.ID)
	}
	s.uploads[upload.ID] = upload
	return nil
}

func (s *MemoryUploadStore) CreateVideo(_ context.Context, video Video) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.videos[video.ID] = video
	return nil
}

func (s *MemoryUploadStore) GetVideo(_ context.Context, id string) (Video, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	video, ok := s.videos[id]
	if !ok {
		return Video{}, fmt.Errorf("%w: video %s", ErrNotFound, id)
	}
	return video, nil
}

func (s *MemoryUploadStore) UpdateVideo(_ context.Context, video Video) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.videos[video.ID]; !ok {
		return fmt.Errorf("%w: video %s", ErrNotFound, video.ID)
	}
	s.videos[video.ID] = video
	return nil
}

func (s *MemoryUploadStore) ListComments(_ context.Context, videoID string, limit, offset int) ([]Comment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	comments := append([]Comment(nil), s.comments[videoID]...)
	start := min(offset, len(comments))
	end := min(start+limit, len(comments))
	return comments[start:end], nil
}

func (s *MemoryUploadStore) AddComment(_ context.Context, comment Comment) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.comments[comment.VideoID] = append(s.comments[comment.VideoID], comment)
	return nil
}
