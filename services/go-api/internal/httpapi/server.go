package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/aicevrei/aicevrei/services/go-api/internal/cache"
	"github.com/aicevrei/aicevrei/services/go-api/internal/config"
	"github.com/aicevrei/aicevrei/services/go-api/internal/store"
)

type Dependencies struct {
	Config config.Config
	Store  *store.Store
	Cache  cache.Cache
	Logger *slog.Logger
}

type Server struct {
	cfg    config.Config
	store  *store.Store
	cache  cache.Cache
	logger *slog.Logger
}

type eventRequest struct {
	EventType string          `json:"event_type"`
	SubjectID string          `json:"subject_id"`
	UserID    string          `json:"user_id,omitempty"`
	ProductID int64           `json:"product_id,omitempty"`
	VideoID   string          `json:"video_id,omitempty"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
}

type uploadInitRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
	ProductID   int64  `json:"product_id,omitempty"`
	UserID      string `json:"user_id,omitempty"`
}

type uploadCompleteRequest struct {
	UploadID  string `json:"upload_id"`
	ProductID int64  `json:"product_id"`
	VideoURL  string `json:"video_url"`
	PosterURL string `json:"poster_url,omitempty"`
	UserID    string `json:"user_id,omitempty"`
}

type followRequest struct {
	FollowerID string `json:"follower_id"`
	FolloweeID string `json:"followee_id"`
}

type checkoutRequest struct {
	Items    []checkoutItemRequest      `json:"items"`
	Customer checkoutCustomerRequest    `json:"customer,omitempty"`
	Metadata map[string]json.RawMessage `json:"metadata,omitempty"`
}

type checkoutItemRequest struct {
	ProductID int64  `json:"product_id"`
	SKUID     string `json:"sku_id,omitempty"`
	Quantity  int    `json:"quantity"`
}

type checkoutCustomerRequest struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
	Phone string `json:"phone,omitempty"`
}

func NewServer(deps Dependencies) *Server {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	cacheClient := deps.Cache
	if cacheClient == nil {
		cacheClient = cache.NewNoop()
	}
	return &Server{cfg: deps.Config, store: deps.Store, cache: cacheClient, logger: logger}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("GET /readyz", s.readyz)
	mux.HandleFunc("GET /v1/feed", s.feed)
	mux.HandleFunc("POST /v1/events", s.events)
	mux.HandleFunc("POST /v1/videos/uploads/init", s.uploadInit)
	mux.HandleFunc("POST /v1/videos/uploads/complete", s.uploadComplete)
	mux.HandleFunc("POST /v1/social/follow", s.follow)
	mux.HandleFunc("GET /v1/notifications", s.notifications)
	mux.HandleFunc("POST /v1/checkout", s.checkout)
	return s.cors(s.jsonOnly(mux))
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "go-api"})
}

func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	postgresOK := s.store != nil && s.store.Ping(ctx) == nil
	redisOK := true
	if s.cache.Enabled() {
		redisOK = s.cache.Ping(ctx) == nil
	}
	status := http.StatusOK
	if !postgresOK {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, map[string]any{
		"status":   ternary(postgresOK, "ready", "not_ready"),
		"postgres": postgresOK,
		"redis":    ternary(redisOK, "ok", "unavailable"),
	})
}

func (s *Server) feed(w http.ResponseWriter, r *http.Request) {
	limit := parseBoundedInt(r.URL.Query().Get("limit"), 24, 1, 100)
	offset := parseBoundedInt(r.URL.Query().Get("offset"), 0, 0, 10000)
	category := parseBoundedInt(r.URL.Query().Get("category_id"), 0, 0, 1_000_000_000)

	items, err := s.store.Feed(r.Context(), store.FeedParams{Limit: limit, Offset: offset, Category: category})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "feed_query_failed", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  items,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	var req eventRequest
	if !s.decodeAndValidate(w, r, &req, func() error { return validateEvent(req) }) {
		return
	}
	result, err := s.store.StoreEvent(r.Context(), store.Event(req))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "event_store_failed", err)
		return
	}
	if payload, err := json.Marshal(req); err == nil {
		_ = s.cache.PublishEvent(r.Context(), "aicevrei:events", payload)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "event": result})
}

func (s *Server) uploadInit(w http.ResponseWriter, r *http.Request) {
	var req uploadInitRequest
	if !s.decodeAndValidate(w, r, &req, func() error { return validateUploadInit(req) }) {
		return
	}
	uploadID := newID("upl")
	writeJSON(w, http.StatusCreated, map[string]any{
		"upload_id":  uploadID,
		"upload_url": s.cfg.UploadBaseURL + "/videos/" + uploadID,
		"method":     "PUT",
		"headers": map[string]string{
			"Content-Type": req.ContentType,
		},
		"expires_at": time.Now().UTC().Add(15 * time.Minute),
	})
}

func (s *Server) uploadComplete(w http.ResponseWriter, r *http.Request) {
	var req uploadCompleteRequest
	if !s.decodeAndValidate(w, r, &req, func() error { return validateUploadComplete(req) }) {
		return
	}
	result, err := s.store.CompleteUpload(r.Context(), store.UploadComplete(req))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "upload_complete_failed", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "video": result})
}

func (s *Server) follow(w http.ResponseWriter, r *http.Request) {
	var req followRequest
	if !s.decodeAndValidate(w, r, &req, func() error { return validateFollow(req) }) {
		return
	}
	result, err := s.store.Follow(r.Context(), store.Follow(req))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "follow_failed", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "follow": result})
}

func (s *Server) notifications(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	if userID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse("validation_failed", "user_id is required"))
		return
	}
	limit := parseBoundedInt(r.URL.Query().Get("limit"), 25, 1, 100)
	notifications, err := s.store.Notifications(r.Context(), userID, limit)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "notifications_failed", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": notifications, "limit": limit})
}

func (s *Server) checkout(w http.ResponseWriter, r *http.Request) {
	var req checkoutRequest
	if !s.decodeAndValidate(w, r, &req, func() error { return validateCheckout(req) }) {
		return
	}
	items := make([]store.CheckoutItem, len(req.Items))
	for idx, item := range req.Items {
		items[idx] = store.CheckoutItem{ProductID: item.ProductID, SKUID: item.SKUID, Quantity: item.Quantity}
	}
	summary, err := s.store.CheckoutSummary(r.Context(), items)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, "checkout_unavailable", err)
		return
	}
	checkoutID := newID("chk")
	writeJSON(w, http.StatusCreated, map[string]any{
		"checkout_id":  checkoutID,
		"checkout_url": s.cfg.CheckoutBaseURL + "/" + checkoutID,
		"currency":     "RON",
		"summary":      summary,
	})
}

func (s *Server) decodeAndValidate(w http.ResponseWriter, r *http.Request, dst any, validate func() error) bool {
	if err := requireJSON(r); err != nil {
		writeJSON(w, http.StatusUnsupportedMediaType, errorResponse("unsupported_media_type", err.Error()))
		return false
	}
	if err := decodeJSON(r.Body, dst); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse("invalid_json", err.Error()))
		return false
	}
	if err := validate(); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse("validation_failed", err.Error()))
		return false
	}
	return true
}

func (s *Server) writeError(w http.ResponseWriter, status int, code string, err error) {
	s.logger.Warn("request failed", "code", code, "error", err)
	writeJSON(w, status, errorResponse(code, err.Error()))
}

func (s *Server) jsonOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Accept", "application/json")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && originAllowed(origin, s.cfg.CORSAllowedOrigins) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		} else if slices.Contains(s.cfg.CORSAllowedOrigins, "*") {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func errorResponse(code, message string) map[string]any {
	return map[string]any{"error": map[string]string{"code": code, "message": message}}
}

func parseBoundedInt(raw string, fallback, minValue, maxValue int) int {
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func originAllowed(origin string, allowed []string) bool {
	return slices.Contains(allowed, "*") || slices.Contains(allowed, origin)
}

func newID(prefix string) string {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return prefix + "_" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return prefix + "_" + hex.EncodeToString(bytes[:])
}

func ternary[T any](condition bool, ifTrue, ifFalse T) T {
	if condition {
		return ifTrue
	}
	return ifFalse
}
