package feed

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresRepository reads feed items from the videos + products tables in PostgreSQL.
type PostgresRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresRepository creates a repository backed by pgx pool.
func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

// List fetches published videos joined with their linked products, applying
// category and creator filters. The ranking happens in Go (RankItems) so
// we fetch candidates broadly and let the ranker sort them.
func (r *PostgresRepository) List(ctx context.Context, query Query) ([]Item, error) {
	const baseQuery = `
		SELECT
			v.id,
			v.title,
			v.description,
			v.creator_id,
			v.category_id,
			v.status,
			v.visibility,
			v.published_at,
			v.view_count,
			v.like_count,
			v.comment_count,
			v.share_count,
			v.save_count,
			COALESCE(va.hls_url, '') AS hls_url,
			COALESCE(va.mp4_url, '') AS mp4_url,
			COALESCE(va.poster_url, '') AS poster_url,
			COALESCE(va.thumbnail_url, '') AS thumbnail_url,
			COALESCE(vp.product_id::text, '') AS product_id,
			COALESCE(mp.price_ron, 0) AS price_ron,
			COALESCE(mp.compare_at_price_ron, 0) AS old_price_ron,
			COALESCE(mp.rating, 0) AS rating,
			COALESCE(mp.orders_count, 0) AS orders_count
		FROM videos v
		LEFT JOIN video_assets va ON va.video_id = v.id AND va.is_default = true
		LEFT JOIN video_products vp ON vp.video_id = v.id AND vp.is_primary = true
		LEFT JOIN marketplace_products mp ON mp.id = vp.product_id
		WHERE v.status = 'published'
		  AND v.visibility = 'public'`

	// Build dynamic WHERE clauses
	args := make([]any, 0, 2)
	conditions := ""
	argIdx := 0

	if query.CategoryID != "" {
		argIdx++
		conditions += fmt.Sprintf(" AND v.category_id = $%d", argIdx)
		args = append(args, query.CategoryID)
	}
	if query.CreatorID != "" {
		argIdx++
		conditions += fmt.Sprintf(" AND v.creator_id = $%d", argIdx)
		args = append(args, query.CreatorID)
	}

	// Fetch more candidates than requested so ranking has room to work.
	// Cap at 500 candidates for performance.
	candidateLimit := min(query.Offset+query.Limit*3, 500)
	argIdx++
	fullQuery := baseQuery + conditions +
		fmt.Sprintf(" ORDER BY v.published_at DESC LIMIT $%d", argIdx)
	args = append(args, candidateLimit)

	rows, err := r.pool.Query(ctx, fullQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("feed.PostgresRepository.List: %w", err)
	}
	defer rows.Close()

	items := make([]Item, 0, candidateLimit)
	for rows.Next() {
		var (
			item                          Item
			status, visibility            string
			hlsURL, mp4URL                string
			posterURL, thumbnailURL       string
			publishedAt                   *time.Time
			viewCount, likeCount          int
			commentCount, shareCount      int
			saveCount                     int
			priceRON, oldPriceRON         int
			rating                        float64
			ordersCount                   int
		)

		err := rows.Scan(
			&item.ID,
			&item.Title,
			&item.Description,
			&item.CreatorID,
			&item.CategoryID,
			&status,
			&visibility,
			&publishedAt,
			&viewCount,
			&likeCount,
			&commentCount,
			&shareCount,
			&saveCount,
			&hlsURL,
			&mp4URL,
			&posterURL,
			&thumbnailURL,
			&item.ProductID,
			&priceRON,
			&oldPriceRON,
			&rating,
			&ordersCount,
		)
		if err != nil {
			return nil, fmt.Errorf("feed.PostgresRepository.List scan: %w", err)
		}

		// Map DB fields to Item struct
		if hlsURL != "" {
			item.VideoURL = hlsURL
			item.HasVideo = true
		} else if mp4URL != "" {
			item.VideoURL = mp4URL
			item.HasVideo = true
		}
		item.PosterURL = posterURL
		item.ThumbnailURL = thumbnailURL
		item.ViewsCount = viewCount
		item.LikesCount = likeCount
		item.CommentsCount = commentCount
		item.OrdersCount = ordersCount
		item.PriceRON = priceRON
		item.OldPriceRON = oldPriceRON
		item.Rating = rating

		if publishedAt != nil {
			item.PublishedAt = *publishedAt
		}

		items = append(items, item)
	}

	if rows.Err() != nil {
		return nil, fmt.Errorf("feed.PostgresRepository.List rows: %w", rows.Err())
	}

	return items, nil
}
