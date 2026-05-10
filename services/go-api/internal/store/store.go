package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/aicevrei/aicevrei/services/go-api/internal/feed"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

type FeedParams struct {
	Limit    int
	Offset   int
	Category int
}

type Event struct {
	EventType string          `json:"event_type"`
	SubjectID string          `json:"subject_id"`
	UserID    string          `json:"user_id,omitempty"`
	ProductID int64           `json:"product_id,omitempty"`
	VideoID   string          `json:"video_id,omitempty"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
}

type PersistResult struct {
	ID     string `json:"id,omitempty"`
	Stored bool   `json:"stored"`
}

type UploadComplete struct {
	UploadID  string `json:"upload_id"`
	ProductID int64  `json:"product_id"`
	VideoURL  string `json:"video_url"`
	PosterURL string `json:"poster_url,omitempty"`
	UserID    string `json:"user_id,omitempty"`
}

type Follow struct {
	FollowerID string `json:"follower_id"`
	FolloweeID string `json:"followee_id"`
}

type Notification struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Title     string          `json:"title"`
	Body      string          `json:"body,omitempty"`
	Read      bool            `json:"read"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

type CheckoutItem struct {
	ProductID int64  `json:"product_id"`
	SKUID     string `json:"sku_id,omitempty"`
	Quantity  int    `json:"quantity"`
}

type CheckoutLine struct {
	ProductID int64  `json:"product_id"`
	SKUID     string `json:"sku_id,omitempty"`
	Title     string `json:"title"`
	UnitRON   int    `json:"unit_ron"`
	Quantity  int    `json:"quantity"`
	ImageURL  string `json:"image_url,omitempty"`
}

type CheckoutSummary struct {
	Lines    []CheckoutLine `json:"lines"`
	TotalRON int            `json:"total_ron"`
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 8
	cfg.MinConns = 1
	cfg.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

func (s *Store) Feed(ctx context.Context, params FeedParams) ([]feed.Item, error) {
	if params.Limit <= 0 || params.Limit > 100 {
		params.Limit = 24
	}
	if params.Offset < 0 {
		params.Offset = 0
	}

	if ok, err := s.tableExists(ctx, "social_videos"); err != nil {
		return nil, err
	} else if ok {
		items, err := s.feedWithSocialVideos(ctx, params)
		if err == nil {
			feed.SortRanked(items)
			return items, nil
		}
	}

	items, err := s.feedFromProducts(ctx, params)
	if err != nil {
		return nil, err
	}
	feed.SortRanked(items)
	return items, nil
}

func (s *Store) StoreEvent(ctx context.Context, event Event) (PersistResult, error) {
	ok, err := s.tableExists(ctx, "social_events")
	if err != nil || !ok {
		return PersistResult{Stored: false}, err
	}
	var id string
	err = s.pool.QueryRow(ctx, `
		INSERT INTO social_events (event_type, subject_id, user_id, product_id, video_id, metadata)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, 0), NULLIF($5, ''), NULLIF($6, '{}'::jsonb))
		RETURNING id::text`,
		event.EventType, event.SubjectID, event.UserID, event.ProductID, event.VideoID, jsonb(event.Metadata),
	).Scan(&id)
	if err != nil {
		return PersistResult{}, err
	}
	return PersistResult{ID: id, Stored: true}, nil
}

func (s *Store) CompleteUpload(ctx context.Context, upload UploadComplete) (PersistResult, error) {
	ok, err := s.tableExists(ctx, "social_videos")
	if err != nil || !ok {
		return PersistResult{Stored: false}, err
	}
	var id string
	err = s.pool.QueryRow(ctx, `
		INSERT INTO social_videos (product_id, user_id, video_url, poster_url, status)
		VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), 'ready')
		RETURNING id::text`,
		upload.ProductID, upload.UserID, upload.VideoURL, upload.PosterURL,
	).Scan(&id)
	if err != nil {
		return PersistResult{}, err
	}
	return PersistResult{ID: id, Stored: true}, nil
}

func (s *Store) Follow(ctx context.Context, follow Follow) (PersistResult, error) {
	ok, err := s.tableExists(ctx, "social_follows")
	if err != nil || !ok {
		return PersistResult{Stored: false}, err
	}
	var id string
	err = s.pool.QueryRow(ctx, `
		INSERT INTO social_follows (follower_id, followee_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
		RETURNING COALESCE(id::text, '')`,
		follow.FollowerID, follow.FolloweeID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return PersistResult{Stored: true}, nil
	}
	if err != nil {
		return PersistResult{}, err
	}
	return PersistResult{ID: id, Stored: true}, nil
}

func (s *Store) Notifications(ctx context.Context, userID string, limit int) ([]Notification, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	ok, err := s.tableExists(ctx, "notifications")
	if err != nil || !ok {
		return []Notification{}, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, type, title, COALESCE(body, ''), COALESCE(read, false), COALESCE(metadata, '{}'::jsonb), created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notifications := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Type, &n.Title, &n.Body, &n.Read, &n.Metadata, &n.CreatedAt); err != nil {
			return nil, err
		}
		notifications = append(notifications, n)
	}
	return notifications, rows.Err()
}

func (s *Store) CheckoutSummary(ctx context.Context, items []CheckoutItem) (CheckoutSummary, error) {
	lines := make([]CheckoutLine, 0, len(items))
	total := 0
	for _, item := range items {
		var line CheckoutLine
		err := s.pool.QueryRow(ctx, `
			SELECT p.id, COALESCE(p.title_ro, p.title), p.price_ron, COALESCE(p.main_image, '')
			FROM ae_products p
			WHERE p.id = $1 AND p.price_ron IS NOT NULL AND p.price_ron > 0`,
			item.ProductID,
		).Scan(&line.ProductID, &line.Title, &line.UnitRON, &line.ImageURL)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return CheckoutSummary{}, fmt.Errorf("product %d is unavailable", item.ProductID)
			}
			return CheckoutSummary{}, err
		}
		line.SKUID = item.SKUID
		line.Quantity = item.Quantity
		lines = append(lines, line)
		total += line.UnitRON * line.Quantity
	}
	return CheckoutSummary{Lines: lines, TotalRON: total}, nil
}

func (s *Store) feedWithSocialVideos(ctx context.Context, params FeedParams) ([]feed.Item, error) {
	where, args := feedWhere(params)
	args = append(args, params.Limit, params.Offset)
	sql := `
		SELECT p.id, p.ae_product_id::text, COALESCE(p.title_ro, p.title), COALESCE(p.price_ron, 0), COALESCE(p.old_price_ron, 0),
			COALESCE(p.main_image, ''), COALESCE(v.video_url, p.video_url, ''), COALESCE(v.poster_url, p.video_poster, ''),
			COALESCE(p.rating, 0), COALESCE(p.orders_count, 0), COALESCE(v.likes_count, 0), COALESCE(v.views_count, 0),
			EXTRACT(EPOCH FROM (NOW() - COALESCE(v.created_at, p.created_at, NOW()))) / 3600,
			COALESCE(p.category_id, 0), COALESCE(c.name_ro, c.name, ''), COALESCE(p.source_url, '')
		FROM ae_products p
		LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
		LEFT JOIN social_videos v ON v.product_id = p.id
		WHERE ` + where + `
		ORDER BY COALESCE(v.created_at, p.created_at) DESC NULLS LAST
		LIMIT $` + fmt.Sprint(len(args)-1) + ` OFFSET $` + fmt.Sprint(len(args))
	return s.scanFeed(ctx, sql, args...)
}

func (s *Store) feedFromProducts(ctx context.Context, params FeedParams) ([]feed.Item, error) {
	where, args := feedWhere(params)
	args = append(args, params.Limit, params.Offset)
	sql := `
		SELECT p.id, p.ae_product_id::text, COALESCE(p.title_ro, p.title), COALESCE(p.price_ron, 0), COALESCE(p.old_price_ron, 0),
			COALESCE(p.main_image, ''), COALESCE(p.video_url, ''), COALESCE(p.video_poster, ''),
			COALESCE(p.rating, 0), COALESCE(p.orders_count, 0), 0, 0,
			EXTRACT(EPOCH FROM (NOW() - COALESCE(p.created_at, NOW()))) / 3600,
			COALESCE(p.category_id, 0), COALESCE(c.name_ro, c.name, ''), COALESCE(p.source_url, '')
		FROM ae_products p
		LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
		WHERE ` + where + `
		ORDER BY p.has_video DESC NULLS LAST, p.orders_count DESC NULLS LAST, p.rating DESC NULLS LAST
		LIMIT $` + fmt.Sprint(len(args)-1) + ` OFFSET $` + fmt.Sprint(len(args))
	return s.scanFeed(ctx, sql, args...)
}

func (s *Store) scanFeed(ctx context.Context, sql string, args ...any) ([]feed.Item, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []feed.Item{}
	for rows.Next() {
		var item feed.Item
		if err := rows.Scan(
			&item.ID, &item.AEProductID, &item.Title, &item.PriceRON, &item.OldPriceRON,
			&item.ImageURL, &item.VideoURL, &item.PosterURL, &item.Rating, &item.OrdersCount,
			&item.LikesCount, &item.ViewsCount, &item.AgeHours, &item.CategoryID, &item.Category, &item.SourceURL,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func feedWhere(params FeedParams) (string, []any) {
	where := []string{"p.main_image IS NOT NULL", "p.min_price_usd > 0"}
	args := []any{}
	if params.Category > 0 {
		args = append(args, params.Category)
		where = append(where, fmt.Sprintf("p.category_id = $%d", len(args)))
	}
	return strings.Join(where, " AND "), args
}

func (s *Store) tableExists(ctx context.Context, tableName string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = $1
		)`, tableName).Scan(&exists)
	return exists, err
}

func jsonb(raw json.RawMessage) any {
	if len(raw) == 0 {
		return []byte(`{}`)
	}
	return raw
}
